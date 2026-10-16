import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Timer } from 'lucide-react';
import {
  analyzeTaskTimes,
  evaluatePacing,
  fmtMin,
  getPacingAlerts,
  type PacingPlan,
  type PacingProgress,
  type PacingStatus,
} from '../lib/examPacing';

const STATUS_VIEW: Record<PacingStatus, { label: string; cls: string }> = {
  ahead: { label: 'ОПЕРЕЖЕНИЕ', cls: 'border-[#d4ff00]/60 bg-[#d4ff00]/10 text-[#d4ff00]' },
  on_track: { label: 'В ГРАФИКЕ', cls: 'border-green-400/50 bg-green-400/10 text-green-300' },
  behind: { label: 'ОТСТАВАНИЕ', cls: 'border-red-500/60 bg-red-500/10 text-red-300' },
};

interface LiveProps {
  plan: PacingPlan;
  elapsedSec?: number;
  totalSec: number;
  progress: PacingProgress;
  isRunning?: boolean;
  onAlert?: (text: string, severity: 'warn' | 'critical') => void;
}

/**
 * Live-панель тайм-менеджера: сегментированная шкала рекомендуемого времени,
 * маркер текущего момента, оценка темпа и предупреждения о приближении конца.
 */
export const ExamPacingAssistant: React.FC<LiveProps> = ({
  plan,
  elapsedSec,
  totalSec,
  progress,
  isRunning,
  onAlert,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const fired = useRef<Set<string>>(new Set());
  const [activeAlert, setActiveAlert] = useState<{ text: string; severity: 'warn' | 'critical' } | null>(
    null
  );
  const [internalElapsed, setInternalElapsed] = useState<number>(elapsedSec ?? 0);

  useEffect(() => {
    if (elapsedSec !== undefined) {
      setInternalElapsed(elapsedSec);
    }
  }, [elapsedSec]);

  useEffect(() => {
    if (!isRunning || elapsedSec !== undefined) return;
    const timer = setInterval(() => {
      setInternalElapsed((prev) => Math.min(totalSec, prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, elapsedSec, totalSec]);

  const currentElapsed = elapsedSec !== undefined ? elapsedSec : internalElapsed;
  const remainingMin = Math.max(0, (totalSec - currentElapsed) / 60);
  const evaluation = evaluatePacing(plan, currentElapsed, progress);
  const view = STATUS_VIEW[evaluation.status];
  const totalMin = plan.totalMinutes;
  const elapsedPct = Math.min(100, (currentElapsed / 60 / totalMin) * 100);

  useEffect(() => {
    for (const alert of getPacingAlerts(plan)) {
      if (remainingMin <= alert.atRemainingMin && !fired.current.has(alert.id)) {
        fired.current.add(alert.id);
        setActiveAlert({ text: alert.text, severity: alert.severity });
        onAlert?.(alert.text, alert.severity);
      }
    }
  }, [remainingMin, plan, onAlert]);

  return (
    <div className="w-full basis-full border-t border-white/[0.08] pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          <Timer className="h-3.5 w-3.5 text-[#d4ff00]" />
          PACING // ТАЙМ-МЕНЕДЖЕР
        </span>
        <span className={`border px-2 py-0.5 font-mono text-[10px] font-bold ${view.cls}`}>
          [ {view.label}
          {evaluation.status !== 'on_track'
            ? ` ${evaluation.deltaMinutes > 0 ? '+' : '−'}${Math.round(Math.abs(evaluation.deltaMinutes))} МИН`
            : ''}{' '}
          ]
        </span>
        <span className="hidden min-w-0 flex-1 truncate font-sans text-[11px] text-zinc-400 md:block">
          {evaluation.message}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto border border-white/[0.1] p-1 text-zinc-400 transition-all hover:border-[#d4ff00]/50 hover:text-[#d4ff00] hover:shadow-glow"
          title={collapsed ? 'Показать шкалу' : 'Свернуть шкалу'}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="mt-1.5 font-sans text-[11px] text-zinc-400 md:hidden">{evaluation.message}</p>
          <div className="relative mt-2 flex h-6 w-full overflow-hidden border border-white/[0.1] bg-black">
            {plan.segments.map((s) => {
              const done = currentElapsed / 60 >= s.endMin;
              const isCurrent = s.id === evaluation.current.id;
              const width = (s.minutes / totalMin) * 100;
              const color =
                s.kind === 'reserve'
                  ? 'bg-amber-400/15 text-amber-300'
                  : done
                    ? 'bg-[#d4ff00]/25 text-[#d4ff00]'
                    : isCurrent
                      ? 'bg-[#d4ff00]/15 text-white'
                      : 'bg-zinc-900 text-zinc-500';
              return (
                <div
                  key={s.id}
                  style={{ width: `${width}%` }}
                  title={`${s.kind === 'reserve' ? 'Бланки и проверка' : `Задания ${s.from}${s.to !== s.from ? '–' + s.to : ''}`}: ${s.minutes} мин`}
                  className={`flex items-center justify-center overflow-hidden border-r border-black font-mono text-[9px] ${color} ${
                    isCurrent ? '' : ''
                  }`}
                >
                  {width > 5 ? s.label : ''}
                </div>
              );
            })}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
              style={{ left: `${elapsedPct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
            <span>0</span>
            <span>
              НОРМА: ЧАСТЬ 1 — {plan.part1Minutes} МИН // БЛАНКИ — {plan.reserveMinutes} МИН
            </span>
            <span>{fmtMin(totalMin * 60)}</span>
          </div>
        </>
      )}

      {activeAlert && (
        <div
          className={`mt-2 flex items-start gap-2 border px-3 py-2 font-mono text-[11px] ${
            activeAlert.severity === 'critical'
              ? 'animate-pulse border-red-500/60 bg-red-500/10 text-red-200'
              : 'border-amber-400/50 bg-amber-400/10 text-amber-200'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{activeAlert.text}</span>
          <button
            type="button"
            onClick={() => setActiveAlert(null)}
            className="text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
          >
            [ ок ]
          </button>
        </div>
      )}
    </div>
  );
};

interface ReportProps {
  plan: PacingPlan;
  taskTimes: Record<number, number>;
  totalSec: number;
  spentSec: number;
}

/** Отчёт в протоколе: «Где вы потеряли больше всего времени?» */
export const PacingReport: React.FC<ReportProps> = ({ plan, taskTimes, totalSec, spentSec }) => {
  const a = analyzeTaskTimes(plan, taskTimes, totalSec, spentSec);
  const topRows = [...a.rows].sort((x, y) => y.spentSec - x.spentSec).slice(0, 10);
  const maxSec = Math.max(1, ...topRows.map((r) => Math.max(r.spentSec, r.normSec)));

  const tile = (title: string, spent: number, norm: number | null) => {
    const over = norm !== null && spent > norm * 1.15;
    return (
      <div className="border border-white/[0.08] bg-zinc-900/40 p-3">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">{title}</span>
        <span className={`mt-1 block font-display text-xl font-black ${over ? 'text-red-300' : 'text-white'}`}>
          {fmtMin(spent)}
        </span>
        {norm !== null && (
          <span className="font-mono text-[10px] text-zinc-500">норма: {fmtMin(norm)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 border border-white/[0.1] bg-zinc-950 p-6">
      <div>
        <span className="block font-mono text-xs font-bold uppercase tracking-widest text-[#d4ff00]">
          [ PACING_REPORT // ТАЙМ-МЕНЕДЖМЕНТ ]
        </span>
        <h3 className="mt-0.5 font-display text-lg font-bold uppercase text-white">
          Где вы потеряли больше всего времени?
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile('Часть 1', a.part1SpentSec, a.part1NormSec)}
        {plan.segments.some((s) => s.kind === 'task') &&
          tile('Развёрнутая часть', a.part2SpentSec, a.part2NormSec)}
        {tile('Чтение КИМ / навигация', a.untrackedSec, null)}
        {tile('Неиспользованный запас', a.unusedSec, null)}
      </div>

      {topRows.length > 0 && (
        <div className="space-y-1.5">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Топ заданий по затраченному времени (полоса — факт, риска — норма)
          </span>
          {topRows.map((r) => (
            <div key={r.task} className="flex items-center gap-3 font-mono text-[11px]">
              <span className="w-12 shrink-0 text-zinc-300">№ {r.task}</span>
              <div className="relative h-3 flex-1 bg-black">
                <div
                  className={`h-full ${r.overSec > 30 ? 'bg-red-500/70' : 'bg-[#d4ff00]/60'}`}
                  style={{ width: `${(r.spentSec / maxSec) * 100}%` }}
                />
                {r.normSec > 0 && (
                  <div
                    className="absolute inset-y-0 w-px bg-white/80"
                    style={{ left: `${(r.normSec / maxSec) * 100}%` }}
                  />
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-zinc-400">
                {fmtMin(r.spentSec)} / {fmtMin(r.normSec)}
              </span>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-1.5 border-t border-white/[0.08] pt-3">
        {a.insights.map((text, i) => (
          <li key={i} className="flex gap-2 font-sans text-xs leading-relaxed text-zinc-300">
            <span className="text-[#d4ff00]">▸</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
