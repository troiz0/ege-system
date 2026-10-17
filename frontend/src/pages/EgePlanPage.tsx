import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useToastStore } from '../store/toastStore';
import { hudConfirm } from '../store/confirmStore';
import { CalendarDays, Sparkles, CheckCircle2, Circle, Clock, Play } from 'lucide-react';
import { errText } from '../lib/errors';
import type { PlanItem, PlanProgress } from '../lib/types';

const kindLabel: Record<string, string> = {
  theory: 'Теория',
  practice_kim: 'Практика КИМ',
  mistakes_review: 'Разбор ошибок',
};

const PRIORITY_META: Record<string, { label: string; classes: string }> = {
  high: { label: 'высокий', classes: 'border-red-500/30 bg-red-500/10 text-red-400' },
  medium: { label: 'средний', classes: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  low: { label: 'низкий', classes: 'border-[#d4ff00]/30 bg-[#d4ff00]/10 text-[#d4ff00]' },
};

export function EgePlanPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PlanItem[]>([]);
  const [progress, setProgress] = useState<PlanProgress>({
    total: 0,
    completed: 0,
    percent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const { addToast } = useToastStore();

  const handleStartLesson = (item: PlanItem) => {
    const promptText = `Объясни тему ${item.topic}`;
    navigate(`/chat?topic=${encodeURIComponent(item.topic)}&prompt=${encodeURIComponent(promptText)}`, {
      state: {
        topic: item.topic,
        prompt: promptText,
        autoSend: true,
      },
    });
  };

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const data = await api.getPlan();
      setItems(data.items);
      setProgress(data.progress);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось загрузить план');
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (items.length > 0) {
      const ok = await hudConfirm({
        title: 'ГЕНЕРАЦИЯ НОВОГО ПЛАНА',
        message: 'Текущий план будет заменён новым. Продолжить?',
        confirmText: '[ СГЕНЕРИРОВАТЬ ]',
        cancelText: '[ ОТМЕНА ]',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setGenerating(true);
    try {
      const data = await api.generatePlan();
      setItems(data.items);
      setProgress(data.progress);
      addToast('success', 'План подготовки сгенерирован');
      if (data.notice) addToast('info', data.notice);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось сгенерировать план');
    } finally {
      setGenerating(false);
    }
  };

  const toggle = async (item: PlanItem) => {
    const next = !item.isCompleted;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isCompleted: next } : i))
    );
    try {
      const data = await api.updatePlanItem(item.id, { isCompleted: next });
      setProgress(data.progress);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось обновить пункт');
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isCompleted: !next } : i))
      );
    }
  };

  const changeDate = async (item: PlanItem, date: string) => {
    if (!date || date === item.targetDate.slice(0, 10)) {
      setEditingDate(null);
      return;
    }
    const prevDate = item.targetDate;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, targetDate: new Date(date + 'T00:00:00').toISOString() } : i
      )
    );
    setEditingDate(null);
    try {
      const data = await api.updatePlanItem(item.id, {
        targetDate: new Date(date + 'T00:00:00').toISOString(),
      });
      setProgress(data.progress);
      addToast('success', 'Дата пункта обновлена');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось изменить дату');
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, targetDate: prevDate } : i))
      );
    }
  };

  if (loading) return <LoadingPage />;

  const dayGroups = items.reduce<Record<string, PlanItem[]>>((acc, item) => {
    const key = new Date(item.targetDate).toISOString().slice(0, 10);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  const sortedDays = Object.keys(dayGroups).sort();

  const getExamCountdown = () => {
    const examDate = new Date('2027-06-01T09:00:00+03:00');
    const now = new Date();
    const diffTime = examDate.getTime() - now.getTime();
    const days = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const weeks = Math.max(1, Math.ceil(days / 7));
    return { days, weeks };
  };

  const countdown = getExamCountdown();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ PLAN // DAY TIMELINE ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            PLAN
          </h1>
          <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
            Программа по темам до экзамена, разбитая по дням
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="card-shelf !py-2.5 !px-4 flex items-center gap-3 border-[#d4ff00]/40 bg-[#d4ff00]/5">
            <Clock className="w-4 h-4 text-[#d4ff00]" />
            <div className="font-mono text-xs">
              <span className="text-[#d4ff00] font-bold block uppercase tracking-wider text-[11px]">
                [ REVERSE COUNTDOWN // ОБРАТНЫЙ ОТСЧЕТ ДО ЕГЭ ]
              </span>
              <span className="text-zinc-400 text-[11px]">
                Осталось: <strong className="text-white font-semibold">{countdown.weeks} нед.</strong> ({countdown.days} дн.) по структуре КИМ
              </span>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={generating}
            className="btn-lime text-sm"
          >
            <Sparkles className="h-5 w-5" />
            {generating ? 'Генерируем...' : items.length > 0 ? 'Пересобрать план' : 'Сформировать план'}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="card-shelf mb-6 p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">
              Прогресс плана
            </span>
            <span className="mono-chip">
              {progress.completed} из {progress.total} • {progress.percent}%
            </span>
          </div>
          <div className="h-1 w-full bg-white/[0.06]">
            <div
              className="h-1 bg-[#d4ff00] transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-10 w-10" />}
          title="План пока не сформирован"
          description="Сформируйте персональный план подготовки по темам ЕГЭ с учётом вашего профиля и даты экзамена"
          action={{ label: 'Сформировать план', onClick: generate }}
        />
      ) : (
        <div className="relative space-y-8 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-white/10">
          {sortedDays.map((date) => {
            const dayItems = dayGroups[date]
              .slice()
              .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
            const doneCount = dayItems.filter((i) => i.isCompleted).length;
            const dayDone = doneCount === dayItems.length;

            return (
              <div key={date} className="relative pl-8">
                <span
                  className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-none border ${
                    dayDone
                      ? 'border-[#d4ff00] bg-[#d4ff00]/30'
                      : 'border-zinc-600 bg-[#09090b]'
                  }`}
                />
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white md:text-xl">
                    {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      weekday: 'long',
                    })}
                  </h2>
                  <span className={`mono-chip ${dayDone ? 'border-[#d4ff00]/30 text-[#d4ff00]' : ''}`}>
                    {doneCount}/{dayItems.length} выполнено
                  </span>
                </div>
                <div className="space-y-2">
                  {dayItems.map((item) => {
                    const meta = PRIORITY_META[item.priority] ?? PRIORITY_META.medium;
                    return (
                      <div
                        key={item.id}
                        className={`card-shelf flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-opacity ${
                          item.isCompleted ? 'opacity-55' : ''
                        }`}
                      >
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <button
                            onClick={() => toggle(item)}
                            className="mt-0.5 shrink-0 text-zinc-500 transition-colors hover:text-[#d4ff00]"
                            title={
                              item.isCompleted
                                ? 'Отметить как невыполненное'
                                : 'Отметить как выполненное'
                            }
                          >
                            {item.isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-[#d4ff00]" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-zinc-100">{item.topic}</span>
                              <span className={`mono-chip !text-[10px] ${meta.classes}`}>
                                {meta.label}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-500">
                              <span>{item.subject}</span>
                              <span className="text-zinc-700">•</span>
                              <span>{kindLabel[item.kind] || item.kind}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.durationMinutes} мин
                              </span>
                              {editingDate === item.id ? (
                                <input
                                  type="date"
                                  autoFocus
                                  defaultValue={item.targetDate.slice(0, 10)}
                                  onBlur={(e) => changeDate(item, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      changeDate(item, (e.target as HTMLInputElement).value);
                                    }
                                    if (e.key === 'Escape') setEditingDate(null);
                                  }}
                                  className="rounded-none border border-[#d4ff00]/50 bg-zinc-950/60 px-2 py-1 text-zinc-200 outline-none"
                                />
                              ) : (
                                <button
                                  onClick={() => setEditingDate(item.id)}
                                  className="flex items-center gap-1 transition-colors hover:text-[#d4ff00]"
                                  title="Изменить дату пункта"
                                >
                                  <CalendarDays className="h-3 w-3" />
                                  {new Date(item.targetDate).toLocaleDateString('ru-RU', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleStartLesson(item)}
                            className="btn-lime font-mono !py-1.5 !px-3 !text-xs font-bold uppercase tracking-wider whitespace-nowrap"
                            title={`Начать занятие в AI-чате по теме: ${item.topic}`}
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            [ НАЧАТЬ ЗАНЯТИЕ ]
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
