import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { CustomSelect } from '../components/ui/CustomSelect';
import { useToastStore } from '../store/toastStore';
import { Plus, Upload, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScheduleItem, ScheduleItemInput, MeshLesson } from '../lib/types';
import { errText } from '../lib/errors';
import { addDays, format, startOfWeek, isSameDay, isSameWeek } from 'date-fns';
import { ru } from 'date-fns/locale';

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function capitalizeRu(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function getAcademicWeek(date: Date): { weekNumber: number; period: string } {
  const month = date.getMonth();
  const year = month >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  const sept1 = new Date(year, 8, 1);
  const firstMonday = startOfWeek(sept1, { weekStartsOn: 1 });
  const currentMonday = startOfWeek(date, { weekStartsOn: 1 });
  const diffTime = currentMonday.getTime() - firstMonday.getTime();
  const weekNumber = Math.max(1, Math.round(diffTime / (7 * 24 * 3600 * 1000)) + 1);

  let period = '1-я четверть';
  if (month === 10 || month === 11) period = '2-я четверть';
  else if (month >= 0 && month <= 2) period = '3-я четверть';
  else if (month >= 3 && month <= 4) period = '4-я четверть';
  else if (month >= 5 && month <= 7) period = 'Летние каникулы';

  return { weekNumber, period };
}

/** Навигация по неделям: подпись показывает выбранную неделю и её даты. */
function WeekNavigator({
  weekStart,
  onPrev,
  onNext,
  onToday,
}: {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const acad = getAcademicWeek(weekStart);
  const weekEnd = addDays(weekStart, 5);
  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });
  const label = `${capitalizeRu(format(weekStart, 'd MMMM', { locale: ru }))} — ${capitalizeRu(format(weekEnd, 'd MMMM yyyy', { locale: ru }))}`;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 p-3 border border-white/[0.08]">
      <div className="flex items-center gap-2">
        <button onClick={onPrev} aria-label="Предыдущая неделя" className="btn-ghost px-3 py-2 text-xs hover:border-[#d4ff00]/40">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Пред. неделя</span>
        </button>
        <button onClick={onNext} aria-label="Следующая неделя" className="btn-ghost px-3 py-2 text-xs hover:border-[#d4ff00]/40">
          <span className="hidden sm:inline">След. неделя</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-w-0 text-center font-mono text-xs uppercase tracking-[0.16em] text-zinc-200">
        <span className="text-[#d4ff00] font-bold mr-1.5">[ НЕДЕЛЯ {acad.weekNumber} // {acad.period.toUpperCase()} ]</span>
        <span className="text-zinc-400">{label}</span>
      </div>

      <button
        onClick={onToday}
        disabled={isCurrentWeek}
        className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-all border ${
          isCurrentWeek
            ? 'border-white/10 text-zinc-500 bg-white/[0.02] cursor-default'
            : 'border-[#d4ff00]/60 text-[#d4ff00] bg-[#d4ff00]/10 hover:bg-[#d4ff00]/20 font-bold'
        }`}
      >
        {isCurrentWeek ? 'Текущая неделя' : 'Вернуться к текущей'}
      </button>
    </div>
  );
}

interface DayLoad {
  day: number;
  hours: number;
}

export function SchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dayLoads, setDayLoads] = useState<DayLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [meshConnected, setMeshConnected] = useState(false);
  const [meshWeekMap, setMeshWeekMap] = useState<Record<string, MeshLesson[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ScheduleItemInput[]>([]);
  const [newLesson, setNewLesson] = useState({
    dayOfWeek: 1,
    subject: '',
    startTime: '09:00',
    endTime: '10:30',
  });
  const { addToast } = useToastStore();

  useEffect(() => {
    loadSchedule();
    loadDayLoads();
    checkMeshStatus();
  }, []);

  const checkMeshStatus = async () => {
    try {
      const status = await api.getMeshStatus();
      setMeshConnected(!!status?.connected);
    } catch {
      setMeshConnected(false);
    }
  };

  useEffect(() => {
    if (!meshConnected) return;

    let cancelled = false;
    const fetchWeekMeshSchedule = async () => {
      try {
        const dates = [0, 1, 2, 3, 4, 5].map((i) =>
          format(addDays(weekStart, i), 'yyyy-MM-dd')
        );
        const results = await Promise.allSettled(
          dates.map((d) => api.getMeshDiarySchedule(d))
        );
        if (cancelled) return;
        const newMap: Record<string, MeshLesson[]> = {};
        results.forEach((res) => {
          if (res.status === 'fulfilled' && res.value?.date && Array.isArray(res.value?.lessons)) {
            newMap[res.value.date] = res.value.lessons;
          }
        });
        setMeshWeekMap(newMap);
      } catch (err) {
        console.warn('Failed to load MESH week schedule', err);
      }
    };

    fetchWeekMeshSchedule();
    return () => {
      cancelled = true;
    };
  }, [weekStart, meshConnected]);

  const loadSchedule = async () => {
    try {
      const result = await api.getSchedule();
      setSchedule(result);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки расписания');
    } finally {
      setLoading(false);
    }
  };

  const loadDayLoads = async () => {
    try {
      const result = await api.getScheduleLoad();
      setDayLoads(result.loads);
    } catch (error) {
      console.error('Failed to load day loads', error);
    }
  };

  const handleImportPdf = async (file: File) => {
    try {
      const result = await api.importSchedulePdf(file);
      setImportPreview(result.items);
      addToast('success', 'Расписание распознано');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка импорта PDF');
    }
  };

  const confirmImport = async () => {
    try {
      await api.confirmScheduleImport(importPreview);
      addToast('success', 'Расписание импортировано');
      setShowImportModal(false);
      setImportPreview([]);
      loadSchedule();
      loadDayLoads();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения');
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Удалить урок?')) return;
    try {
      await api.deleteScheduleItem(id);
      addToast('success', 'Урок удалён');
      loadSchedule();
      loadDayLoads();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка удаления');
    }
  };

  const addLesson = async () => {
    if (!newLesson.subject.trim()) {
      addToast('error', 'Укажите предмет');
      return;
    }
    try {
      await api.createScheduleItem(newLesson);
      addToast('success', 'Урок добавлен');
      setShowAddModal(false);
      setNewLesson({
        dayOfWeek: 1,
        subject: '',
        startTime: '09:00',
        endTime: '10:30',
      });
      loadSchedule();
      loadDayLoads();
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка добавления урока');
    }
  };

  const getLoadForDay = (day: number) => {
    return dayLoads.find((l) => l.day === day)?.hours || 0;
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ SCHEDULE // WEEK LOOP ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            SCHEDULE
          </h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowImportModal(true)} className="btn-ghost text-sm">
            <Upload className="h-4 w-4" />
            Импорт из МЭШ
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-lime text-sm">
            <Plus className="h-4 w-4" />
            Добавить урок
          </button>
        </div>
      </div>

      {schedule.length === 0 && !meshConnected ? (
        <EmptyState
          title="Расписание пусто"
          description="Добавьте уроки вручную или подключите дневник МЭШ"
          action={{
            label: 'Импортировать расписание',
            onClick: () => setShowImportModal(true),
          }}
        />
      ) : (
        <div>
          <WeekNavigator
            weekStart={weekStart}
            onPrev={() => setWeekStart((d) => addDays(d, -7))}
            onNext={() => setWeekStart((d) => addDays(d, 7))}
            onToday={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          />
          <div className="grid gap-4">
            {DAYS.map((dayName, index) => {
              const dayNum = index + 1;
              const dayDate = addDays(weekStart, index);
              const dateKey = format(dayDate, 'yyyy-MM-dd');
              const isToday = isSameDay(dayDate, new Date());
              const dateFormatted = format(dayDate, 'd MMMM', { locale: ru });

              const meshLessons = meshConnected ? meshWeekMap[dateKey] : undefined;
              const hasMeshDay = meshConnected && meshLessons !== undefined;
              const isCurrentCalendarWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });
              // Если МЭШ подключен — используем реальные уроки из дневника.
              // Шаблон уроков показываем только если МЭШ отключен или на текущей неделе при отсутствии данных МЭШ.
              const templateLessons = (!meshConnected || (isCurrentCalendarWeek && !hasMeshDay))
                ? schedule.filter((s) => s.dayOfWeek === dayNum)
                : [];
              const lessonsList = hasMeshDay ? meshLessons : templateLessons;
              const lessonsCount = lessonsList.length;
              const load = hasMeshDay ? lessonsList.length * 1.5 : getLoadForDay(dayNum);

              return (
                <section
                  key={dayNum}
                  className={`card-shelf w-full max-w-full overflow-hidden p-5 md:p-6 transition-all ${
                    isToday
                      ? 'border-[#d4ff00]/60 bg-zinc-900/70'
                      : ''
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-xl font-bold tracking-tight text-white md:text-2xl">
                        {dayName}
                      </h2>
                      <span className="font-mono text-sm text-zinc-400">
                        • {dateFormatted}
                      </span>
                      {isToday && (
                        <span className="mono-chip border-[#d4ff00]/60 bg-[#d4ff00]/15 text-[#d4ff00] text-[10px] font-bold">
                          [ СЕГОДНЯ ]
                        </span>
                      )}
                      {hasMeshDay && (
                        <span className="mono-chip border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00] text-[10px]">
                          [ МЭШ ДНЕВНИК ]
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mono-chip">{load.toFixed(1)} ч</span>
                      <span className="font-mono text-[11px] text-zinc-600">•</span>
                      <span className="mono-chip">{lessonsCount} уроков</span>
                    </div>
                  </div>

                  {hasMeshDay ? (
                    meshLessons.length === 0 ? (
                      <p className="px-3 py-2 text-xs font-mono text-zinc-500">
                        Уроков в электронном дневнике нет (выходной день или каникулы)
                      </p>
                    ) : (
                    <div className="w-full max-w-full overflow-hidden">
                      {meshLessons
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((lesson, mIdx) => {
                          const realSubject =
                            lesson.subject && !['занятие', 'урок', 'внеурочная деятельность'].includes(lesson.subject.trim().toLowerCase())
                              ? lesson.subject
                              : lesson.topic || (lesson as any).activity_name || (lesson as any).course_name || 'Учебное занятие';
                          const showTopic = lesson.topic && lesson.topic.trim().toLowerCase() !== realSubject.trim().toLowerCase();

                          return (
                            <div key={mIdx} className="lesson-row group">
                              <div className="flex min-w-0 flex-1 items-center gap-4 break-words">
                                <span className="shrink-0 font-mono text-xs text-zinc-400">
                                  {lesson.start}–{lesson.end || ''}
                                </span>
                                <div className="min-w-0 flex-1 break-words">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-100">
                                      {realSubject}
                                    </span>
                                    {lesson.room && (
                                      <span className="mono-chip text-[9px]">каб. {lesson.room}</span>
                                    )}
                                  </div>
                                  {showTopic && (
                                    <span
                                      className="block break-words line-clamp-2 text-xs font-light text-zinc-400 mt-0.5"
                                      title={lesson.topic || undefined}
                                    >
                                      {lesson.topic}
                                    </span>
                                  )}
                                  {lesson.teacher && (
                                    <span className="block text-[11px] text-zinc-500 font-mono mt-0.5">
                                      {lesson.teacher}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    )
                  ) : templateLessons.length === 0 ? (
                    <p className="px-3 py-2 text-sm font-light text-zinc-600">
                      {isCurrentCalendarWeek ? 'Нет уроков' : 'Нет записей в расписании на эту неделю учебного года'}
                    </p>
                  ) : (
                    <div className="w-full max-w-full overflow-hidden">
                      {templateLessons
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                        .map((lesson) => (
                          <div key={lesson.id} className="lesson-row group">
                            <div className="flex min-w-0 flex-1 items-center gap-4 break-words">
                              <span className="shrink-0 font-mono text-xs text-zinc-500">
                                {lesson.startTime}–{lesson.endTime}
                              </span>
                              <span className="min-w-0 flex-1 break-words">
                                <span className="block break-words text-sm font-medium text-zinc-100">
                                  {lesson.subject}
                                </span>
                                {lesson.topic && (
                                  <span
                                    className="block break-words line-clamp-2 text-xs font-light text-zinc-500"
                                    title={lesson.topic}
                                  >
                                    {lesson.topic}
                                  </span>
                                )}
                              </span>
                            </div>
                            <button
                              onClick={() => deleteItem(lesson.id)}
                              title="Удалить урок"
                              className="shrink-0 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Lesson Modal */}
      {showAddModal && (
        <div className="modal-veil" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-body max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 font-display text-xl font-bold uppercase tracking-tight text-white">
              Новый урок
            </h2>
            <div className="space-y-4">
              <div>
                <label className="field-label">Предмет</label>
                <input
                  type="text"
                  value={newLesson.subject}
                  onChange={(e) =>
                    setNewLesson({ ...newLesson, subject: e.target.value })
                  }
                  placeholder="Например: Математика"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">День недели</label>
                <CustomSelect
                  value={String(newLesson.dayOfWeek)}
                  onChange={(v) =>
                    setNewLesson({
                      ...newLesson,
                      dayOfWeek: Number(v),
                    })
                  }
                  options={DAYS.map((day, index) => ({
                    value: String(index + 1),
                    label: day,
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Начало</label>
                  <input
                    type="time"
                    value={newLesson.startTime}
                    onChange={(e) =>
                      setNewLesson({ ...newLesson, startTime: e.target.value })
                    }
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Конец</label>
                  <input
                    type="time"
                    value={newLesson.endTime}
                    onChange={(e) =>
                      setNewLesson({ ...newLesson, endTime: e.target.value })
                    }
                    className="field"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={addLesson} className="btn-lime flex-1 text-sm">
                Добавить
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

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-veil" onClick={() => setShowImportModal(false)}>
          <div
            className="modal-body max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="hud-tag mb-2">[ MESH // PDF IMPORT ]</p>
            <h2 className="mb-5 font-display text-xl font-bold uppercase tracking-tight text-white">
              Импорт расписания из МЭШ
            </h2>

            {importPreview.length === 0 ? (
              <div>
                <p className="mb-4 text-sm font-light text-zinc-400">
                  Загрузите PDF-файл расписания из МЭШ
                </p>
                <label className="dropzone">
                  <Upload className="h-6 w-6 text-zinc-500" />
                  <span className="text-sm text-zinc-300">
                    Перетащите PDF сюда или нажмите для выбора
                  </span>
                  <span className="hud-tag">PDF // MAX 10 MB</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportPdf(file);
                    }}
                  />
                </label>
              </div>
            ) : (
              <div>
                <p className="mb-4 text-sm font-light text-zinc-400">
                  Распознано {importPreview.length} уроков. Проверьте и
                  подтвердите.
                </p>
                <div className="mb-4 max-h-96 space-y-px overflow-y-auto rounded-none border border-white/[0.08]">
                  {importPreview.map((item, index) => (
                    <div key={index} className="lesson-row">
                      <span className="text-sm font-medium text-zinc-200">
                        {item.subject}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">
                        {DAYS[item.dayOfWeek - 1]} • {item.startTime}–{item.endTime}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={confirmImport} className="btn-lime flex-1 text-sm">
                    Подтвердить
                  </button>
                  <button
                    onClick={() => {
                      setImportPreview([]);
                      setShowImportModal(false);
                    }}
                    className="btn-ghost flex-1 text-sm"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowImportModal(false)}
              className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-zinc-200"
            >
              [ Закрыть ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SchedulePage;
