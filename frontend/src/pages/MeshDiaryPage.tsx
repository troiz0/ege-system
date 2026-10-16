import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { errText } from '../lib/errors';
import {
  addDaysIso,
  egePdfFilename,
  formatDayRu,
  formatShortDateRu,
  formatDateRu,
  formatDateWeekdayRu,
  gradeColor,
  loadDiarySnapshot,
  nextGradeInfo,
  saveBlob,
  saveDiarySnapshot,
  todayIso,
} from '../lib/meshDiary.service';
import { useToastStore } from '../store/toastStore';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { MeshConnectBanner } from '../components/MeshConnectBanner';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileDown,
  GraduationCap,
  Paperclip,
  Play,
  RefreshCw,
  School,
  Sparkles,
} from 'lucide-react';
import type { MeshAttachment, MeshDiagnostic, MeshDiarySync, MeshExplainResult, MeshHomework, MeshLesson, MeshStatus } from '../lib/types';

interface Bucket {
  key: string;
  label: string;
  items: MeshHomework[];
}

function groupHomeworks(items: MeshHomework[]): Bucket[] {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const buckets = new Map<string, Bucket>();
  const push = (key: string, label: string, hw: MeshHomework) => {
    const b = buckets.get(key);
    if (b) b.items.push(hw);
    else buckets.set(key, { key, label, items: [hw] });
  };
  for (const hw of items) {
    const d = hw.deadline;
    // Выполненные — в свою секцию, даже если дедлайн прошёл (не «Просрочено»)
    if (hw.done) push('done', 'Выполнено', hw);
    else if (!d) push('none', 'Без срока', hw);
    else if (d < today) push('overdue', 'Просрочено', hw);
    else if (d === today) push('today', 'Сегодня', hw);
    else if (d === tomorrow) push('tomorrow', 'Завтра', hw);
    else push(d, formatDayRu(d), hw);
  }
  const order = (k: string): number =>
    k === 'overdue'
      ? 0
      : k === 'today'
        ? 1
        : k === 'tomorrow'
          ? 2
          : k === 'done'
            ? 4
            : k === 'none'
              ? 1e9
              : 3;
  return [...buckets.values()]
    .map((b) => ({
      ...b,
      items: [...b.items].sort((a, z) => (a.deadline ?? '').localeCompare(z.deadline ?? '')),
    }))
    .sort((a, z) => order(a.key) - order(z.key) || a.key.localeCompare(z.key));
}

function deadlineTone(deadline: string | null): string {
  if (!deadline) return 'text-zinc-500 bg-white/[0.04] border-white/[0.08]';
  const today = todayIso();
  if (deadline < today) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (deadline === today || deadline === addDaysIso(today, 1)) {
    return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
  return 'text-zinc-400 bg-white/[0.04] border-white/[0.08]';
}

/**
 * «Дневник МЭШ» — расписание, домашние задания, оценки с темами уроков
 * и пробники ЕГЭ, полученные из school.mos.ru через MeshDiaryService.
 */
export function MeshDiaryPage() {
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [snapshot, setSnapshot] = useState<MeshDiarySync | null>(() => loadDiarySnapshot());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  // Аккордеон длинного списка оценок: по умолчанию 5, дальше «показать все»
  const [expandedMarksFull, setExpandedMarksFull] = useState<Record<string, boolean>>({});
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [date, setDate] = useState(() => todayIso());
  const [dayLessons, setDayLessons] = useState<MeshLesson[] | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explainResult, setExplainResult] = useState<MeshExplainResult | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getMeshStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        if (alive) setStatus(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const connected = Boolean(status?.connected);

  const runSync = async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await api.syncMeshDiary();
      saveDiarySnapshot(result);
      setSnapshot(result);
      const c = result.counts;
      const p = result.persisted;
      if (result.errors.length > 0) {
        addToast('warning', `Синхронизировано частично: ${result.errors[0]}`);
      } else if (!silent) {
        addToast(
          'success',
          'Данные синхронизированы: расписание, ДЗ и оценки обновлены во всех разделах. ' +
            `Перейдите в AI-Аналитику для нового разбора (${c.lessons} уроков, ${c.homeworks} заданий, ${c.marks} оценок` +
            (p ? `, в базу: ${p.homeworks.created + p.homeworks.updated} ДЗ, ${p.marks.created} оценок)` : ')')
        );
      }
    } catch (err) {
      const msg = errText(err) || 'Не удалось синхронизировать данные';
      setSyncError(msg);
      if (!silent) addToast('error', msg);
    } finally {
      setSyncing(false);
    }
  };

  // Первый вход: если синхронизации ещё не было — запускаем её сами
  useEffect(() => {
    if (checking || !connected) return;
    if (!snapshot) void runSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, connected]);

  // Расписание выбранного дня: из снапшота или ленивым запросом
  useEffect(() => {
    if (!connected) return;
    if (snapshot && date === snapshot.scheduleDate) {
      setDayLessons(snapshot.schedule);
      return;
    }
    let alive = true;
    setDayLoading(true);
    api
      .getMeshDiarySchedule(date)
      .then((r) => {
        if (alive) setDayLessons(r.lessons);
      })
      .catch((err) => {
        if (alive) {
          setDayLessons([]);
          addToast('error', errText(err) || 'Не удалось получить расписание');
        }
      })
      .finally(() => {
        if (alive) setDayLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, snapshot, connected]);

  const buckets = useMemo(
    () => (snapshot ? groupHomeworks(snapshot.homeworks) : []),
    [snapshot]
  );

  const downloadProtocol = async (d: MeshDiagnostic) => {
    const key = d.testId || d.subject;
    setDownloading(key);
    try {
      const blob = await api.downloadMeshEgeResult(d.testId, d.subject, d.reportUrl ?? undefined);
      saveBlob(blob, egePdfFilename(d.subject));
      addToast('success', `Протокол «${d.subject}» скачан`);
    } catch (err) {
      addToast('error', errText(err) || 'Не удалось скачать протокол ЕГЭ');
    } finally {
      setDownloading(null);
    }
  };

  const explainHw = async (hw: MeshHomework, attachment?: MeshAttachment) => {
    const key = `${hw.subject}::${hw.deadline ?? ''}::${hw.description.slice(0, 40)}::${attachment?.url ?? ''}`;
    if (explaining) return;
    setExplaining(key);
    try {
      const result = await api.explainMeshAttachment({
        subject: hw.subject,
        description: hw.description,
        attachmentUrl: attachment?.url ?? undefined,
        attachmentName: attachment?.name,
      });
      setExplainResult(result);
      if (result.demoMode && result.notice) addToast('info', result.notice);
    } catch (err) {
      addToast('error', errText(err) || 'Не удалось разобрать задание');
    } finally {
      setExplaining(null);
    }
  };

  if (checking) return <LoadingPage />;

  const syncedAt = snapshot
    ? new Date(snapshot.syncedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const header = (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="hud-tag mb-3">[ MESH // SCHOOL.MOS.RU SYNC ]</p>
        <div className="flex items-center gap-3">
          <School className="h-7 w-7 text-[#d4ff00]" strokeWidth={1.5} />
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">MESH DIARY</h1>
        </div>
        <p className="mt-2 max-w-xl text-sm font-light text-zinc-500">
          {snapshot?.student
            ? [
                snapshot.student.name,
                snapshot.student.className ? `${snapshot.student.className} класс` : null,
              ]
                .filter(Boolean)
                .join(' • ') || 'Расписание, оценки и пробники из school.mos.ru'
            : 'Расписание, оценки и пробники из school.mos.ru'}
          {syncedAt && <span className="text-zinc-600"> • Синхронизировано: {syncedAt}</span>}
        </p>
      </div>
      {connected && (
        <button
          onClick={() => void runSync()}
          disabled={syncing}
          className="btn-lime flex-shrink-0 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Синхронизация…' : 'Синхронизировать данные'}
        </button>
      )}
    </div>
  );

  if (!connected) {
    return (
      <div className="mx-auto max-w-5xl">
        <div>
          {header}
          <MeshConnectBanner />
          <EmptyState
            icon={<School className="w-12 h-12" />}
            title="Профиль МЭШ не подключён"
            description="Подключите дневник МЭШ, чтобы расписание, домашние задания, оценки и пробники ЕГЭ подтягивались автоматически."
            action={{ label: 'Перейти в профиль', onClick: () => navigate('/profile') }}
          />
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-5xl">
        <div>
          {header}
          {syncing ? (
            <div className="py-16 text-center text-sm text-zinc-400 animate-pulse">
              Загружаем данные дневника…
            </div>
          ) : (
            <EmptyState
              icon={<AlertTriangle className="w-12 h-12" />}
              title="Не удалось загрузить данные"
              description={syncError ?? 'Синхронизация с МЭШ не удалась. Попробуйте ещё раз.'}
              action={{ label: 'Повторить синхронизацию', onClick: () => void runSync() }}
            />
          )}
        </div>
      </div>
    );
  }

  const marksTab = snapshot.marks.length === 0 ? (
    <EmptyState
      icon={<GraduationCap className="w-12 h-12" />}
      title="Оценок пока нет"
      description="Оценки появятся после первой синхронизации с дневником МЭШ."
    />
  ) : (
    <div className="space-y-3">
      {snapshot.marks.map((group) => {
        const open = expandedSubject === group.subject;
        const sum = group.marks.reduce((s, m) => s + m.value, 0);
        const calc = nextGradeInfo(group.average, sum, group.marks.length);
        const showAll = !!expandedMarksFull[group.subject];
        const visibleMarks = showAll ? group.marks : group.marks.slice(0, 5);
        return (
          <div
            key={group.subject}
            className="card-shelf overflow-hidden"
          >
            <button
              onClick={() => setExpandedSubject(open ? null : group.subject)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
            >
              <span className="flex items-center gap-3 min-w-0">
                <ChevronDown
                  className={`w-4 h-4 text-zinc-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
                />
                <span className="text-sm font-medium text-zinc-200 truncate">
                  {group.subject}
                </span>
                <span className="text-xs text-zinc-500 flex-shrink-0">
                  оценок: {group.marks.length}
                </span>
              </span>
              <span className="text-right">
                <span className={`font-mono text-sm font-semibold ${gradeColor(group.average)}`}>
                  {group.average.toFixed(2)}
                </span>
                {calc && (
                  <span className="mt-0.5 block font-mono text-[10px] tracking-wide text-[#d4ff00]/90">
                    {calc}
                  </span>
                )}
              </span>
            </button>
            {open && (
              <div className="border-t border-white/[0.06]">
                <ul className="divide-y divide-white/[0.05]">
                  {visibleMarks.map((m, i) => (
                    <li
                      key={`${m.date ?? ''}-${i}`}
                      className="px-4 py-2.5 flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-zinc-300">
                        {m.value} (вес {m.weight}) —{' '}
                        <span className="text-zinc-500">
                          {m.topic ? `«${m.topic}»` : 'без темы урока'}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-zinc-600 flex-shrink-0">
                        {formatShortDateRu(m.date)}
                      </span>
                    </li>
                  ))}
                </ul>
                {group.marks.length > 5 && (
                  <button
                    onClick={() =>
                      setExpandedMarksFull((prev) => ({
                        ...prev,
                        [group.subject]: !prev[group.subject],
                      }))
                    }
                    className="w-full border-t border-white/[0.06] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    {showAll
                      ? '[ Свернуть ▲ ]'
                      : `[ Показать все оценки (всего ${group.marks.length}) ▼ ]`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const hwCard = (hw: MeshHomework, key: string) => {
    const explainKey = (a?: MeshAttachment) =>
      `${hw.subject}::${hw.deadline ?? ''}::${hw.description.slice(0, 40)}::${a?.url ?? ''}`;
    return (
    <div
      key={key}
      className="p-4 card-shelf"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="inline-block px-2 py-0.5 rounded-none bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 text-xs font-medium">
          {hw.subject}
        </span>
        <span
          className={`inline-block px-2 py-0.5 rounded-none border text-xs whitespace-nowrap ${deadlineTone(hw.deadline)}`}
        >
          {hw.deadline ? formatShortDateRu(hw.deadline) : 'без срока'}
        </span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {hw.description}
      </p>
      {hw.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {hw.attachments.map((a: MeshAttachment, j: number) =>
            a.url ? (
              <li key={j} className="inline-flex items-center gap-2">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Скачать файл: ${a.name}`}
                  className="inline-flex items-center gap-1.5 rounded-none border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-400/20 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{a.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                </a>
                <button
                  onClick={() => void explainHw(hw, a)}
                  disabled={explaining !== null}
                  title="Разобрать задание с AI"
                  className="inline-flex items-center gap-1.5 rounded-none border border-[#d4ff00]/30 bg-[#d4ff00]/10 px-2 py-1 text-xs text-[#d4ff00] hover:bg-[#d4ff00]/20 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                  {explaining === explainKey(a) ? 'Разбираем…' : 'AI-разбор'}
                </button>
              </li>
            ) : (
              <li
                key={j}
                title={a.action ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-none border border-white/[0.06] bg-white/[0.04] px-2 py-1 text-xs text-zinc-400"
              >
                {a.kind === 'test' ? (
                  <Play className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                )}
                <span className="truncate max-w-[180px]">{a.name}</span>
                {a.action && <span className="text-zinc-500 flex-shrink-0">· {a.action}</span>}
              </li>
            )
          )}
        </ul>
      )}
      {hw.attachments.length === 0 && (
        <div className="mt-3">
          <button
            onClick={() => void explainHw(hw)}
            disabled={explaining !== null}
            title="Разобрать задание с AI"
            className="inline-flex items-center gap-1.5 rounded-none border border-[#d4ff00]/30 bg-[#d4ff00]/10 px-2 py-1 text-xs text-[#d4ff00] hover:bg-[#d4ff00]/20 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            {explaining === explainKey() ? 'Разбираем…' : 'AI-разбор'}
          </button>
        </div>
      )}
    </div>
    );
  };

  const homeworkTab = buckets.length === 0 ? (
    <EmptyState
      icon={<ClipboardList className="w-12 h-12" />}
      title="Домашних заданий нет"
      description="Задания из дневника МЭШ появятся здесь после синхронизации."
    />
  ) : (
    <div className="space-y-6">
      {buckets.map((bucket) => {
        if (bucket.key === 'overdue') {
          return (
            <div key={bucket.key}>
              <button
                onClick={() => setOverdueOpen((v) => !v)}
                aria-expanded={overdueOpen}
                className="mb-3 flex w-full items-center gap-2 text-left font-mono text-[11px] tracking-[0.18em] uppercase text-red-400 hover:text-red-300 transition-colors"
              >
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 transition-transform ${overdueOpen ? 'rotate-180' : ''}`}
                />
                Просрочено
                <span className="rounded-none border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] leading-none">
                  {bucket.items.length}
                </span>
                <span className="text-zinc-500 normal-case tracking-normal">
                  {overdueOpen ? 'Свернуть' : 'Развернуть'}
                </span>
              </button>
              {overdueOpen && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {bucket.items.map((hw, i) => hwCard(hw, `${bucket.key}-${i}`))}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={bucket.key}>
            <h3
              className={`font-mono text-[11px] tracking-[0.18em] uppercase mb-3 ${
                bucket.key === 'today' || bucket.key === 'tomorrow'
                  ? 'text-amber-400'
                  : 'text-zinc-500'
              }`}
            >
              {bucket.label}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {bucket.items.map((hw, i) => hwCard(hw, `${bucket.key}-${i}`))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const scheduleTab = (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2 rounded-none border border-white/10 bg-white/[0.02] p-1.5 backdrop-blur-xl">
        <button
          onClick={() => setDate(addDaysIso(date, -1))}
          aria-label="Предыдущий день"
          className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] rounded-none transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium text-zinc-200">{formatDateWeekdayRu(date)}</div>
          {date !== todayIso() && (
            <button
              onClick={() => setDate(todayIso())}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              вернуться к сегодня
            </button>
          )}
        </div>
        <button
          onClick={() => setDate(addDaysIso(date, 1))}
          aria-label="Следующий день"
          className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] rounded-none transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {dayLoading ? (
        <div className="py-10 text-center text-sm text-zinc-400 animate-pulse">
          Загружаем расписание…
        </div>
      ) : !dayLessons || dayLessons.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="w-12 h-12" />}
          title="На этот день уроков нет"
          description="Выберите другой день или обновите синхронизацию."
        />
      ) : (
        <div className="space-y-2">
          {dayLessons.map((lesson, i) => (
            <div
              key={i}
              className="card-shelf flex w-full max-w-full items-center gap-4 overflow-hidden p-4"
            >
              <div className="text-center flex-shrink-0 w-20 whitespace-nowrap">
                <div className="font-mono text-sm text-cyan-300 leading-tight">{lesson.start || '—'}</div>
                {lesson.end && (
                  <div className="font-mono text-xs text-zinc-500 leading-tight">{lesson.end}</div>
                )}
              </div>
              <div className="w-px self-stretch bg-white/[0.08]" />
              <div className="min-w-0 flex-1 break-words">
                <div className="text-sm font-medium text-zinc-100 break-words">{lesson.subject}</div>
                {lesson.topic && (
                  <div className="mt-0.5 break-words line-clamp-2 text-xs font-light text-zinc-500" title={lesson.topic}>
                    {lesson.topic}
                  </div>
                )}
                <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {lesson.room && <span>Кабинет {lesson.room}</span>}
                  {lesson.teacher && <span>{lesson.teacher}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const diagnosticsTab = snapshot.diagnostics.length === 0 ? (
    <EmptyState
      icon={<FileDown className="w-12 h-12" />}
      title="Пробников пока нет"
      description="Результаты пробников ЕГЭ/ОГЭ (ГИА) появятся здесь после синхронизации."
    />
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      {snapshot.diagnostics.map((d, i) => {
        const key = d.testId || d.subject;
        const busy = downloading === key;
        const checked = Boolean(d.status && /проверен/i.test(d.status) && !/не\s*проверен/i.test(d.status));
        return (
          <div
            key={`${key}-${i}`}
            className="card-shelf flex flex-col gap-3 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-100">{d.subject}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{formatDateRu(d.date)}</div>
              </div>
              {d.status && (
                <span
                  className={`px-2 py-0.5 rounded-none border text-[11px] whitespace-nowrap ${
                    checked
                      ? 'bg-green-500/10 border-green-500/25 text-green-400'
                      : 'bg-white/[0.04] border-white/[0.1] text-zinc-400'
                  }`}
                >
                  {d.status}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              {d.score !== null && (
                <span className="font-mono text-2xl font-semibold text-zinc-100">
                  {d.score}
                  <span className="text-sm text-zinc-500 font-normal"> баллов</span>
                </span>
              )}
              {d.percent !== null && (
                <span className="font-mono text-sm text-zinc-400">{d.percent}%</span>
              )}
            </div>

            <button
              onClick={() => void downloadProtocol(d)}
              disabled={busy}
              className="btn-ghost mt-auto px-3 py-2 text-sm"
            >
              <FileDown className="w-4 h-4" />
              {busy ? 'Скачивание…' : 'Скачать PDF-протокол'}
            </button>
          </div>
        );
      })}
    </div>
  );

  const tabs = [
    { id: 'marks', label: 'Оценки', content: marksTab },
    { id: 'homework', label: 'ДЗ', content: homeworkTab },
    { id: 'schedule', label: 'Расписание', content: scheduleTab },
    { id: 'diagnostics', label: 'Пробники ЕГЭ', content: diagnosticsTab },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        {header}

        {snapshot.errors.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-none border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div className="text-xs font-light leading-relaxed text-zinc-300">
              Часть данных не получена из МЭШ:
              <ul className="mt-1 space-y-0.5">
                {snapshot.errors.map((e, i) => (
                  <li key={i}>— {e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Tabs tabs={tabs} />

        <p className="mt-8 text-xs text-zinc-600">
          Данные получены из {''}
          <Link to="/profile" className="text-zinc-500 hover:text-zinc-400 underline">
            профиля МЭШ
          </Link>{' '}
          и хранятся локально в этом браузере до следующей синхронизации.
        </p>
      </div>

      <Modal
        isOpen={explainResult !== null}
        onClose={() => setExplainResult(null)}
        title="AI-разбор задания"
        size="lg"
      >
        {explainResult && (
          <div className="space-y-4">
            <div className="text-xs font-light text-zinc-500">
              Источник: {explainResult.sourceName}
              {explainResult.demoMode && ' • демо-режим'}
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

export default MeshDiaryPage;
