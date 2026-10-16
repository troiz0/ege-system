import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { CustomSelect } from '../components/ui/CustomSelect';
import { useToastStore } from '../store/toastStore';
import { Target, Plus, Sparkles, Trash2, X, Calendar, TrendingUp, TrendingDown, Minus, FileDown, Clock } from 'lucide-react';
import type { MockExam, MockExamVerdict as Verdict } from '../lib/types';
import { errText } from '../lib/errors';

const SUBJECTS = ['Математика (профиль)', 'Русский язык', 'Физика', 'Информатика', 'Биология', 'Обществознание', 'Химия', 'История', 'География', 'Литература', 'Английский язык'];

/** Печать протокола результата в PDF через диалог печати браузера. */
function printMockExam(exam: MockExam): void {
  const topics = (() => {
    try {
      const parsed = JSON.parse(exam.mistakeTopics ?? 'null');
      return Array.isArray(parsed) ? parsed.join(', ') : '';
    } catch {
      return '';
    }
  })();
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Пробник — ${exam.subject} — ${exam.totalScore}</title>` +
      `<style>body{font-family:Georgia,serif;color:#111;padding:48px}h1{font-size:22px;margin:0 0 4px}p.meta{color:#555;font-size:13px;margin:0 0 24px}.score{font-size:64px;font-weight:bold;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:14px}td{border:1px solid #ccc;padding:8px 12px}</style>` +
      `</head><body><h1>Пробный ЕГЭ — ${exam.subject}</h1>` +
      `<p class="meta">Дата: ${new Date(exam.examDate).toLocaleDateString('ru-RU')} • EGE.SYSTEM // 2027</p>` +
      `<div class="score">${exam.totalScore} / 100</div>` +
      `<table><tr><td>Дельта к прошлому</td><td>${exam.deltaScore != null ? (exam.deltaScore > 0 ? '+' : '') + exam.deltaScore : '—'}</td></tr>` +
      `<tr><td>Темы ошибок</td><td>${topics || '—'}</td></tr></table>` +
      (exam.aiVerdict ? `<h2 style="font-size:16px;margin-top:24px">AI-вердикт</h2><p>${exam.aiVerdict}</p>` : '') +
      `</body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
}

export function MockExamsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<MockExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loadingVerdict, setLoadingVerdict] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: SUBJECTS[0], examDate: '', totalScore: '', mistakeTopics: '' });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [list, profile] = await Promise.all([
        api.getMockExams(),
        api.getProfile().catch(() => null),
      ]);
      setItems(list);
      if (profile?.targetSubjects && profile.targetSubjects.length > 0) {
        setForm((f) => ({ ...f, subject: profile.targetSubjects[0].subjectName }));
      }
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось загрузить пробники');
    } finally {
      setLoading(false);
    }
  };

  const addExam = async () => {
    if (!form.examDate || !form.totalScore) {
      addToast('error', 'Укажите дату и результат');
      return;
    }
    setSaving(true);
    try {
      const mistakeTopics = form.mistakeTopics
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.createMockExam({
        subject: form.subject,
        examDate: new Date(form.examDate).toISOString(),
        totalScore: Number(form.totalScore),
        mistakeTopics: mistakeTopics.length > 0 ? mistakeTopics : undefined,
      });
      setShowAdd(false);
      setForm({ subject: SUBJECTS[0], examDate: '', totalScore: '', mistakeTopics: '' });
      addToast('success', 'Пробник добавлен');
      load();
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось добавить пробник');
    } finally {
      setSaving(false);
    }
  };

  const deleteExam = async (id: string) => {
    try {
      await api.deleteMockExam(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast('success', 'Пробник удалён');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось удалить');
    }
  };

  const getVerdict = async (subject: string) => {
    setLoadingVerdict(subject);
    try {
      const result = await api.getMockExamVerdict(subject);
      setVerdict(result);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось получить разбор');
    } finally {
      setLoadingVerdict(null);
    }
  };

  const parseList = (value: string | null | undefined): string[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const subjects = Array.from(new Set(items.map((i) => i.subject)));

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ MOCKS // SCORE TELEMETRY ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            MOCKS
          </h1>
          <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
            Результаты пробных вариантов, разбор и рост баллов
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/exam-pressure')}
            className="btn-ghost text-xs md:text-sm font-mono flex items-center gap-1.5 border border-[#d4ff00]/40 text-[#d4ff00] hover:bg-[#d4ff00]/10"
          >
            <Clock className="h-4 w-4" />
            [ СИМУЛЯТОР ЕГЭ ]
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-lime text-sm">
            <Plus className="h-5 w-5" />
            Добавить пробник
          </button>
        </div>
      </div>

      {subjects.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <button
              key={subject}
              onClick={() => getVerdict(subject)}
              disabled={loadingVerdict === subject}
              className="btn-ghost text-xs disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4 text-[#d4ff00]" />
              {loadingVerdict === subject ? 'Анализируем...' : `Разбор: ${subject}`}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Target className="h-10 w-10" />}
          title="Пробников пока нет"
          description="Добавьте результат пробного варианта, чтобы отслеживать динамику и получать AI-разбор"
          action={{ label: 'Добавить пробник', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((exam) => {
            const delta = exam.deltaScore;
            return (
              <article key={exam.id} className="card-shelf flex flex-col p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                        {exam.subject}
                      </h2>
                      {exam.source === 'simulation' && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#d4ff00]/50 bg-[#d4ff00]/10 text-[#d4ff00] font-bold uppercase tracking-wider">
                          [ СИМУЛЯТОР КИМ-2027 ]
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(exam.examDate).toLocaleDateString('ru-RU')}
                      </span>
                      {exam.timeSpentSeconds != null && exam.timeSpentSeconds > 0 && (
                        <span className="text-zinc-400">
                          • {Math.floor(exam.timeSpentSeconds / 60)} мин.
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteExam(exam.id)}
                    className="shrink-0 text-zinc-600 transition-colors hover:text-red-400"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-4 flex items-end justify-between gap-3">
                  <div className="font-display text-5xl font-extrabold tracking-tight text-white">
                    {exam.totalScore}
                    <span className="ml-1 font-mono text-[10px] font-normal tracking-[0.2em] text-zinc-500">
                      / 100
                    </span>
                  </div>
                  {delta != null && (
                    <div
                      className={`flex items-center gap-1 font-mono text-sm font-medium ${
                        delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-zinc-400'
                      }`}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : delta < 0 ? (
                        <TrendingDown className="h-4 w-4" />
                      ) : (
                        <Minus className="h-4 w-4" />
                      )}
                      {delta > 0 ? `+${delta}` : delta} баллов
                    </div>
                  )}
                </div>

                {parseList(exam.mistakeTopics).length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {parseList(exam.mistakeTopics).map((topic) => (
                      <span
                        key={topic}
                        className="mono-chip border-red-500/25 bg-red-500/[0.07] !text-[10px] text-red-400/90"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {exam.aiVerdict && (
                  <p className="mb-4 line-clamp-3 text-xs font-light leading-relaxed text-zinc-500">
                    {exam.aiVerdict}
                  </p>
                )}

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-4">
                  <button
                    onClick={() => getVerdict(exam.subject)}
                    disabled={loadingVerdict === exam.subject}
                    className="btn-lime px-3 py-2 text-xs disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {loadingVerdict === exam.subject ? 'Анализ...' : 'Разбор'}
                  </button>
                  <button
                    onClick={() => printMockExam(exam)}
                    className="btn-ghost px-3 py-2 text-xs"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Скачать PDF
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-veil" onClick={() => setShowAdd(false)}>
          <div
            className="modal-body max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold uppercase tracking-tight text-white">
                Новый пробник
              </h2>
              <button onClick={() => setShowAdd(false)} className="text-zinc-500 transition-colors hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="field-label">Предмет</label>
                <CustomSelect
                  value={form.subject}
                  onChange={(v) => setForm({ ...form, subject: v })}
                  options={SUBJECTS.map((s) => ({ value: s, label: s }))}
                />
              </div>

              <div>
                <label className="field-label">Дата</label>
                <input
                  type="date"
                  value={form.examDate}
                  onChange={(e) => setForm({ ...form, examDate: e.target.value })}
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Баллы (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.totalScore}
                  onChange={(e) => setForm({ ...form, totalScore: e.target.value })}
                  placeholder="Например: 68"
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Темы ошибок (через запятую)</label>
                <textarea
                  value={form.mistakeTopics}
                  onChange={(e) => setForm({ ...form, mistakeTopics: e.target.value })}
                  placeholder="Параметры, Стереометрия, Тригонометрия"
                  rows={2}
                  className="field resize-none"
                />
              </div>

              <button
                onClick={addExam}
                disabled={saving}
                className="btn-lime w-full text-sm"
              >
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {verdict && (
        <div className="modal-veil" onClick={() => setVerdict(null)}>
          <div
            className="modal-body max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-tight text-white">
                <Sparkles className="h-5 w-5 text-[#d4ff00]" />
                AI-разбор пробников
              </h2>
              <button onClick={() => setVerdict(null)} className="text-zinc-500 transition-colors hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            {verdict.notice && <p className="mb-4 font-mono text-xs text-amber-400">{verdict.notice}</p>}

            <div className="card-shelf mb-5 border-[#d4ff00]/20 p-4 text-sm font-light leading-relaxed text-zinc-200">
              {verdict.verdict}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-green-400">Сильные стороны</h3>
                <ul className="space-y-1.5">
                  {verdict.strengths.map((s, i) => (
                    <li key={i} className="text-sm font-light text-zinc-400">• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-red-400">Слабые места</h3>
                <ul className="space-y-1.5">
                  {verdict.weaknesses.map((s, i) => (
                    <li key={i} className="text-sm font-light text-zinc-400">• {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">Рекомендации</h3>
              <ul className="space-y-1.5">
                {verdict.recommendations.map((s, i) => (
                  <li key={i} className="text-sm font-light text-zinc-400">• {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
