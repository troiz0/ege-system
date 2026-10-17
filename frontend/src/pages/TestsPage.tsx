import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useToastStore } from '../store/toastStore';
import { hudConfirm } from '../store/confirmStore';
import { Plus, FileText, Trash2, ImagePlus, X } from 'lucide-react';
import { format } from 'date-fns';
import type { TestResult } from '../lib/types';
import { errText } from '../lib/errors';
import { gradeColor, nextGradeInfo } from '../lib/meshDiary.service';

function parseTopics(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const FIVE_TARGET = 5;

/** Оценка в 5-балльной шкале (любая шкала нормируется: score/maxScore*5). */
function toFiveScale(t: TestResult): number {
  if (t.maxScore > 0 && Number.isFinite(t.score)) {
    return Math.max(0, Math.min(5, (t.score / t.maxScore) * 5));
  }
  return t.score;
}

export function TestsPage() {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMarks, setExpandedMarks] = useState<Record<string, boolean>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    title: '',
    score: '',
    testDate: format(new Date(), 'yyyy-MM-dd'),
    mistakeTopics: '',
    comment: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      const result = await api.getTests();
      setTests(result);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки оценок');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      subject: '',
      title: '',
      score: '',
      testDate: format(new Date(), 'yyyy-MM-dd'),
      mistakeTopics: '',
      comment: '',
    });
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoFile(null);
  };

  const handlePhotoChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Можно прикреплять только фото');
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Шкала закреплена: у всех 5-балльная, максимум 5
      const created = await api.createTest({
        subject: formData.subject,
        title: formData.title,
        scaleType: '5_point',
        score: parseFloat(formData.score),
        maxScore: 5,
        testDate: new Date(formData.testDate).toISOString(),
        mistakeTopics: formData.mistakeTopics
          ? formData.mistakeTopics.split(',').map((t) => t.trim())
          : undefined,
        comment: formData.comment || undefined,
      });
      if (photoFile) {
        try {
          await api.uploadTestPhoto(created.id, photoFile);
        } catch {
          addToast('error', 'Оценка сохранена, но фото загрузить не удалось');
          setShowAddModal(false);
          resetForm();
          loadTests();
          return;
        }
      }
      addToast('success', 'Оценка добавлена');
      setShowAddModal(false);
      resetForm();
      loadTests();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const deleteTest = async (id: string) => {
    const ok = await hudConfirm({
      title: 'УДАЛЕНИЕ ОЦЕНКИ',
      message: 'Вы уверены, что хотите удалить эту оценку?',
      confirmText: '[ УДАЛИТЬ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteTest(id);
      addToast('success', 'Оценка удалена');
      loadTests();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка удаления');
    }
  };

  // Группировка по предметам: средний балл в 5-балльной шкале + темы
  const subjectCards = useMemo(() => {
    const map = new Map<string, TestResult[]>();
    for (const t of tests) {
      const list = map.get(t.subject) ?? [];
      list.push(t);
      map.set(t.subject, list);
    }
    return Array.from(map.entries())
      .map(([subject, items]) => {
        const sorted = items
          .slice()
          .sort((a, b) => +new Date(b.testDate) - +new Date(a.testDate));
        // Средний балл по 5-балльной шкале (точность — два знака)
        const fiveScores = sorted.map(toFiveScale);
        const sum = fiveScores.reduce((s, v) => s + v, 0);
        const avg = sum / Math.max(1, sorted.length);
        const topics = Array.from(
          new Set(sorted.flatMap((t) => parseTopics(t.mistakeTopics)))
        ).slice(0, 6);
        return { subject, items: sorted, avg, sum, count: sorted.length, topics };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [tests]);

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ MARKS // SUBJECT TELEMETRY ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            MARKS
          </h1>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-lime text-sm">
          <Plus className="h-4 w-4" />
          Добавить оценку
        </button>
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-zinc-600" />}
          title="Нет оценок"
          description="Добавьте результаты контрольных и самостоятельных работ"
          action={{
            label: 'Добавить первую оценку',
            onClick: () => setShowAddModal(true),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subjectCards.map(({ subject, items, avg, sum, count }) => {
            const expanded = !!expandedMarks[subject];
            const visible = expanded ? items : items.slice(0, 5);
            const calc = nextGradeInfo(avg, sum, count);
            const isExcellent = avg >= 4.51;
            return (
            <article key={subject} className="card-shelf p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hud-tag mb-2">SUBJECT // {items.length} работ</p>
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">
                    {subject}
                  </h2>
                </div>
                <div className="text-right">
                  <div className={`font-display text-2xl font-extrabold tracking-tight ${gradeColor(avg)}`}>
                    {avg.toFixed(2)}
                  </div>
                  <div className="mt-1 font-mono text-[10px] tracking-[0.2em] text-zinc-500">
                    AVG 5-БАЛЛЬНАЯ
                  </div>
                </div>
              </div>

              {/* Калькулятор «До следующей оценки» */}
              {calc && (
                <div
                  className={`mt-3 border px-3 py-2 font-mono text-[11px] leading-relaxed tracking-wide ${
                    isExcellent
                      ? 'border-green-500/30 bg-green-500/10 text-green-300'
                      : 'border-[#d4ff00]/30 bg-[#d4ff00]/[0.07] text-[#d4ff00]'
                  }`}
                >
                  {calc}
                </div>
              )}

              {/* Прогресс к 5 баллам */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-zinc-500">
                  <span>TARGET // {FIVE_TARGET}</span>
                  <span>{avg.toFixed(2)} / 5.00</span>
                </div>
                <div className="h-1 w-full bg-white/[0.06]">
                  <div
                    className="h-1 bg-[#d4ff00] transition-all"
                    style={{ width: `${Math.min(100, (avg / 5) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Чистый минималистичный список работ и оценок */}
              <div className="mt-4 border-t border-white/[0.06] pt-2">
                <div className="space-y-1">
                  {visible.map((t) => {
                    const weightMatch = t.comment?.match(/вес\s*(\d+)/i);
                    const weight = weightMatch ? weightMatch[1] : (t as any).weight;
                    const fiveVal = toFiveScale(t);

                    return (
                      <div key={t.id} className="border-b border-white/[0.04] last:border-b-0 py-2">
                        <div className="group flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                                {format(new Date(t.testDate), 'dd.MM.yyyy')}
                              </span>
                              <span className="text-sm font-medium text-zinc-200 truncate" title={t.title}>
                                {t.title}
                              </span>
                              {weight && Number(weight) > 1 && (
                                <span className="font-mono text-[10px] text-zinc-400 bg-white/[0.04] border border-white/10 px-1.5 py-0.2">
                                  вес {weight}
                                </span>
                              )}
                              {t.source === 'mesh' && (
                                <span className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-1 py-0.2 font-mono text-[9px] tracking-wider text-[#d4ff00]">
                                  МЭШ
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-mono text-sm font-bold ${gradeColor(fiveVal)}`}>
                              {t.score}{t.maxScore !== 5 ? ` / ${t.maxScore}` : ''}
                            </span>
                            <button
                              onClick={() => deleteTest(t.id)}
                              title="Удалить запись"
                              className="text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {t.photoPath && (
                          <button
                            type="button"
                            onClick={() => window.open(api.fileUrl(t.photoPath as string), '_blank', 'noopener')}
                            title="Открыть фото работы"
                            className="group/photo relative mb-1 mt-2 block w-full overflow-hidden border border-white/10 transition-colors hover:border-[#d4ff00]/40"
                          >
                            <img
                              src={api.fileUrl(t.photoPath)}
                              alt={`Фото: ${t.title}`}
                              loading="lazy"
                              className="max-h-40 w-full object-cover"
                            />
                            <span className="absolute left-2 top-2 border border-[#d4ff00]/40 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.15em] text-[#d4ff00]">
                              [ ФОТО ]
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {items.length > 5 && (
                  <button
                    onClick={() =>
                      setExpandedMarks((prev) => ({ ...prev, [subject]: !prev[subject] }))
                    }
                    className="mt-2 w-full border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:border-[#d4ff00]/40 hover:text-zinc-100 rounded-none"
                  >
                    {expanded
                      ? '[ Свернуть ▲ ]'
                      : `[ Показать все оценки (всего ${items.length}) ▼ ]`}
                  </button>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-veil" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-body max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-6 font-display text-xl font-bold uppercase tracking-tight text-white">
              Новая оценка
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Предмет</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    className="field"
                    placeholder="Математика"
                    required
                  />
                </div>

                <div>
                  <label className="field-label">Название работы</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="field"
                    placeholder="Контрольная по тригонометрии"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Оценка (5-балльная шкала)</label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="5"
                  value={formData.score}
                  onChange={(e) =>
                    setFormData({ ...formData, score: e.target.value })
                  }
                  className="field"
                  placeholder="5"
                  required
                />
              </div>

              <div>
                <label className="field-label">Дата</label>
                <input
                  type="date"
                  value={formData.testDate}
                  onChange={(e) =>
                    setFormData({ ...formData, testDate: e.target.value })
                  }
                  className="field"
                  required
                />
              </div>

              <div>
                <label className="field-label">Темы ошибок (через запятую)</label>
                <input
                  type="text"
                  value={formData.mistakeTopics}
                  onChange={(e) =>
                    setFormData({ ...formData, mistakeTopics: e.target.value })
                  }
                  className="field"
                  placeholder="Тригонометрия, Логарифмы"
                />
              </div>

              <div>
                <label className="field-label">Комментарий</label>
                <textarea
                  value={formData.comment}
                  onChange={(e) =>
                    setFormData({ ...formData, comment: e.target.value })
                  }
                  className="field h-24 resize-none"
                  placeholder="Дополнительная информация..."
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="field-label !mb-0">Фото работы</span>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
                    [ PNG · JPG · WEBP — ДО 10 МБ ]
                  </span>
                </div>
                <input
                  id="test-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handlePhotoChange(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {photoPreview ? (
                  <div className="border border-white/10 bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2">
                      <span className="min-w-0 truncate font-mono text-[11px] tracking-[0.15em] text-[#d4ff00]">
                        [ {photoFile?.name ?? 'ФОТО'} ]
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (photoPreview) URL.revokeObjectURL(photoPreview);
                          setPhotoPreview(null);
                          setPhotoFile(null);
                        }}
                        title="Убрать фото"
                        className="shrink-0 border border-white/10 bg-white/[0.03] p-1.5 text-zinc-400 transition-colors hover:border-red-400/50 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <img
                      src={photoPreview}
                      alt="Фото работы"
                      className="max-h-48 w-full object-cover"
                    />
                  </div>
                ) : (
                  <label
                    htmlFor="test-photo-input"
                    className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-none border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center transition-colors hover:border-[#d4ff00]/50 hover:bg-white/[0.03]"
                  >
                    <ImagePlus className="h-5 w-5 text-zinc-500" />
                    <span className="text-sm text-zinc-300">Прикрепить фото работы</span>
                    <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
                      [ НАЖМИ ЧТОБЫ ВЫБРАТЬ ]
                    </span>
                  </label>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-lime flex-1 text-sm disabled:opacity-50"
                >
                  {saving ? 'Сохранение...' : 'Добавить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="btn-ghost flex-1 text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
