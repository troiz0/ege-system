import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Modal } from '../components/ui/Modal';
import { useToastStore } from '../store/toastStore';
import { Plus, FileText, Upload, Paperclip, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Homework, MeshExplainResult, ParsedHomeworkItem, Priority } from '../lib/types';
import { errText } from '../lib/errors';


/** Ссылки на файлы МЭШ (JSON из meshAttachments), без падения на битом JSON. */
function MeshAttachmentLinks({ payload }: { payload: string }) {
  let files: Array<{ name: string; url: string | null }> = [];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) {
      files = parsed
        .filter(
          (f): f is { name: string; url: string | null } =>
            !!f && typeof f === 'object' && typeof (f as { name?: unknown }).name === 'string'
        )
        .filter((f) => typeof f.url === 'string' && f.url.length > 0);
    }
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f, i) => (
        <a
          key={i}
          href={f.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={`Скачать файл: ${f.name}`}
          className="mono-chip inline-flex items-center gap-1.5 border-white/10 text-zinc-300 transition-colors hover:border-[#d4ff00]/40 hover:text-[#d4ff00]"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="max-w-[200px] truncate">{f.name}</span>
        </a>
      ))}
    </div>
  );
}

export function HomeworkPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  // Вкладки «Активные» / «Выполненные» с автопереносом просрочки:
  // активное = dueDate >= today && !isDone,
  // выполненное = dueDate < today || isDone.
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [showParseModal, setShowParseModal] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parsePreview, setParsePreview] = useState<ParsedHomeworkItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    title: '',
    description: '',
    deadline: '',
    estimatedMinutes: '30',
    priority: 'medium' as Priority,
  });
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explainResult, setExplainResult] = useState<MeshExplainResult | null>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    loadHomework();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHomework = async () => {
    try {
      // Грузим ВСЕ задания, классификация по вкладкам — на клиенте по дате,
      // чтобы просроченные автоматически уходили в «Выполненные».
      const result = await api.getHomework();
      setHomeworks(result);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки ДЗ');
    } finally {
      setLoading(false);
    }
  };

  // Автоперенос прошедших ДЗ в «Выполненные»:
  // АКТИВНЫЕ — только new Date(deadline) >= today && status !== 'completed',
  // ВЫПОЛНЕННЫЕ — deadline < today || status === 'completed'.
  const visibleHomeworks = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return homeworks.filter((hw) => {
      const due = new Date(hw.deadline);
      const isDone = hw.status === 'completed';
      if (filter === 'pending') return due >= today && !isDone;
      if (filter === 'completed') return due < today || isDone;
      return true;
    });
  })();

  const addHomework = async () => {
    if (!form.subject.trim() || !form.title.trim() || !form.deadline) {
      addToast('error', 'Заполните предмет, название и срок сдачи');
      return;
    }
    setSaving(true);
    try {
      await api.createHomework({
        subject: form.subject.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        deadline: new Date(form.deadline).toISOString(),
        estimatedMinutes: parseInt(form.estimatedMinutes, 10) || 30,
        priority: form.priority,
      });
      addToast('success', 'Задание добавлен');
      setShowAddModal(false);
      setForm({ subject: '', title: '', description: '', deadline: '', estimatedMinutes: '30', priority: 'medium' });
      loadHomework();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleParseText = async () => {
    try {
      const result = await api.parseHomeworkText(parseText);
      setParsePreview(result.items);
      addToast('success', `Распознано ${result.items.length} заданий`);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка парсинга');
    }
  };

  const confirmParse = async () => {
    try {
      await api.confirmHomeworkImport(parsePreview);
      addToast('success', 'Задания добавлены');
      setShowParseModal(false);
      setParseText('');
      setParsePreview([]);
      loadHomework();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения');
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      await api.toggleHomework(id, currentStatus !== 'completed');
      loadHomework();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка обновления');
    }
  };

  const analyzeAttachment = async (id: string, file: File) => {
    try {
      await api.uploadHomeworkAttachment(id, file);
      addToast('success', 'Файл загружен');
      loadHomework();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки файла');
    }
  };

  // AI-разбор: работает С файлом и БЕЗ — без файла разбираем по тексту задания.
  // Результат кэшируется в БД (Homework.aiExplanation): повторное открытие —
  // мгновенно из кэша, кнопка «Обновить» в модалке шлёт refresh: true.
  const [explainingHw, setExplainingHw] = useState<Homework | null>(null);
  const explainHomework = async (hw: Homework, refresh = false) => {
    if (explainingId) return;
    setExplainingId(hw.id);
    setExplainingHw(hw);
    try {
      const result = await api.explainHomework(hw.id, refresh);
      setExplainResult(result);
      if (result.demoMode && result.notice) addToast('info', result.notice);
      else if ((result as { cached?: boolean }).cached) {
        addToast('info', 'Показано сохранённое объяснение');
      }
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось разобрать задание');
    } finally {
      setExplainingId(null);
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ TASKS // INBOUND QUEUE ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            TASKS
          </h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowParseModal(true)} className="btn-ghost text-sm">
            <Upload className="h-4 w-4" />
            Вставка из МЭШ
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-lime text-sm">
            <Plus className="h-4 w-4" />
            Добавить вручную
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-all ${
              filter === f
                ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00]'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
            }`}
          >
            {f === 'all' ? '[ ВСЕ ]' : f === 'pending' ? '[ АКТИВНЫЕ ]' : '[ ВЫПОЛНЕННЫЕ ]'}
          </button>
        ))}
      </div>

      {visibleHomeworks.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-zinc-600" />}
          title="Нет заданий"
          description={
            filter === 'pending'
              ? 'Активных заданий нет — всё выполнено или просроченное ушло в «Выполненные»'
              : 'Добавьте задания вручную или импортируйте из МЭШ'
          }
          action={{
            label: 'Умная вставка из МЭШ',
            onClick: () => setShowParseModal(true),
          }}
        />
      ) : (
        <div className="grid gap-3">
          {visibleHomeworks.map((hw) => {
            const done = hw.status === 'completed';
            const dueDate = new Date(hw.deadline);
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            // Просрочка без флага тоже считается выполненной/архивной
            const overdue = !done && dueDate < startOfToday;
            const archived = done || overdue;
            return (
              <article
                key={hw.id}
                className={`card-shelf p-5 transition-opacity md:p-6 ${done ? 'opacity-55' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <button
                      onClick={() => toggleStatus(hw.id, hw.status)}
                      title={done ? 'Вернуть в работу' : 'Отметить выполненным'}
                      className="mt-0.5 shrink-0 text-zinc-500 transition-colors hover:text-[#d4ff00]"
                    >
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-[#d4ff00]" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <h3
                        className={`font-display text-lg font-bold tracking-tight ${
                          done ? 'text-zinc-500 line-through' : 'text-white'
                        }`}
                      >
                        {hw.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="mono-chip">{hw.subject}</span>
                        {overdue && (
                          <span className="mono-chip border-red-500/30 bg-red-500/10 text-red-400">
                            просрочено → в выполненных
                          </span>
                        )}
                        {archived && filter === 'completed' && overdue && (
                          <span className="mono-chip border-white/10 bg-white/[0.04] text-zinc-400">
                            архив
                          </span>
                        )}
                        {hw.source === 'mesh' && (
                          <span className="mono-chip border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00]">
                            [ МЭШ ]
                          </span>
                        )}
                        <span className="mono-chip">{hw.estimatedMinutes} мин</span>
                      </div>
                      {hw.description && (
                        <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-zinc-400">
                          {hw.description}
                        </p>
                      )}
                      {hw.source === 'mesh' && hw.meshAttachments && (
                        <MeshAttachmentLinks payload={hw.meshAttachments} />
                      )}
                    </div>
                  </div>
                  <span className="mono-chip shrink-0 border-[#d4ff00]/25 text-zinc-300">
                    {format(new Date(hw.deadline), 'd MMM • HH:mm', { locale: ru })}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 pl-8">
                  <label className="btn-ghost cursor-pointer text-xs">
                    <Paperclip className="h-4 w-4" />
                    <span>Прикрепить файл</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) analyzeAttachment(hw.id, file);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => void explainHomework(hw)}
                    disabled={explainingId !== null}
                    title="Разобрать задание с AI (по файлу или тексту)"
                    className="inline-flex items-center gap-1.5 rounded-none border border-[#d4ff00]/30 bg-[#d4ff00]/10 px-3 py-2 text-xs text-[#d4ff00] transition-colors hover:bg-[#d4ff00]/20 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    {explainingId === hw.id ? 'Разбираем…' : 'AI-разбор'}
                  </button>
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
            className="modal-body max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 font-display text-xl font-bold uppercase tracking-tight text-white">
              Новое задание
            </h2>

            <div className="space-y-4">
              <div>
                <label className="field-label">Предмет</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Математика (профиль)"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">Название</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="§12 №5-15"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">Описание</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="field resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Срок сдачи</label>
                  <input
                    type="datetime-local"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Минут</label>
                  <input
                    type="number"
                    min={1}
                    value={form.estimatedMinutes}
                    onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
                    className="field"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Приоритет</label>
                <CustomSelect
                  value={form.priority}
                  onChange={(v) => setForm({ ...form, priority: v as Priority })}
                  options={[
                    { value: 'low', label: 'Низкий' },
                    { value: 'medium', label: 'Средний' },
                    { value: 'high', label: 'Высокий' },
                  ]}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={addHomework}
                disabled={saving}
                className="btn-lime flex-1 text-sm"
              >
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-ghost flex-1 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parse Modal */}
      {showParseModal && (
        <div
          className="modal-veil"
          onClick={() => {
            setShowParseModal(false);
            setParseText('');
            setParsePreview([]);
          }}
        >
          <div
            className="modal-body max-w-3xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="hud-tag mb-2">[ MESH // SMART PASTE ]</p>
            <h2 className="mb-5 font-display text-xl font-bold uppercase tracking-tight text-white">
              Умная вставка из МЭШ
            </h2>

            {parsePreview.length === 0 ? (
              <div>
                <p className="mb-4 text-sm font-light text-zinc-400">
                  Вставьте скопированный текст из дневника МЭШ
                </p>
                <textarea
                  value={parseText}
                  onChange={(e) => setParseText(e.target.value)}
                  placeholder="Математика на 15.10: параграф 5, задачи 1-10..."
                  rows={8}
                  className="field h-64 resize-none font-mono"
                />
                <button
                  onClick={handleParseText}
                  disabled={!parseText.trim()}
                  className="btn-lime mt-4 w-full text-sm"
                >
                  Распознать
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-4 text-sm font-light text-zinc-400">
                  Распознано {parsePreview.length} заданий. Проверьте и подтвердите.
                </p>
                <div className="mb-4 max-h-96 space-y-3 overflow-y-auto">
                  {parsePreview.map((item, index) => (
                    <div key={index} className="card-shelf p-4">
                      <div className="font-medium text-zinc-200">
                        {item.title}
                      </div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">
                        {item.subject} • {format(new Date(item.deadline), 'd MMM', { locale: ru })}
                      </div>
                      {item.description && (
                        <div className="mt-2 text-sm font-light text-zinc-500">
                          {item.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={confirmParse}
                    className="btn-lime flex-1 text-sm"
                  >
                    Подтвердить
                  </button>
                  <button
                    onClick={() => {
                      setParsePreview([]);
                      setParseText('');
                    }}
                    className="btn-ghost flex-1 text-sm"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setShowParseModal(false);
                setParseText('');
                setParsePreview([]);
              }}
              className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-zinc-200"
            >
              [ Закрыть ]
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={explainResult !== null}
        onClose={() => {
          setExplainResult(null);
          setExplainingHw(null);
        }}
        title="AI-разбор задания"
        size="lg"
      >
        {explainResult && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 text-xs font-light text-zinc-500">
              <span>
                Источник: {explainResult.sourceName}
                {explainResult.demoMode && ' • демо-режим'}
                {(explainResult as { cached?: boolean }).cached && ' • из сохранённых'}
              </span>
              {explainingHw && (
                <button
                  onClick={() => void explainHomework(explainingHw, true)}
                  disabled={explainingId !== null}
                  title="Сгенерировать разбор заново"
                  className="inline-flex shrink-0 items-center gap-1.5 border border-[#d4ff00]/30 bg-[#d4ff00]/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-[#d4ff00] transition-colors hover:bg-[#d4ff00]/20 disabled:opacity-50"
                >
                  {explainingId ? 'Генерация…' : '↻ Обновить'}
                </button>
              )}
            </div>
            <div>
              <div className="hud-tag mb-2">Тема</div>
              <div className="text-sm font-medium text-zinc-100">{explainResult.topic}</div>
              {explainResult.egePrototype && (
                <div className="mt-1 font-mono text-xs text-[#d4ff00]">{explainResult.egePrototype}</div>
              )}
            </div>
            <div>
              <div className="hud-tag mb-2">Алгоритм решения</div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm font-light leading-relaxed text-zinc-300">
                {explainResult.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
            {explainResult.formulas && (
              <div>
                <div className="hud-tag mb-2">Ключевые формулы</div>
                <pre className="whitespace-pre-wrap border border-white/10 bg-white/[0.03] p-3 font-mono text-xs leading-relaxed text-zinc-300">
                  {explainResult.formulas}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
