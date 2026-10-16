import React from 'react';
import { Activity, AlertOctagon, CheckCircle2, BatteryCharging } from 'lucide-react';
import type { AnalyticsTelemetry } from '../lib/types';

interface BurnoutTrackerWidgetProps {
  data?: AnalyticsTelemetry['burnout'];
  loading?: boolean;
}

export const BurnoutTrackerWidget: React.FC<BurnoutTrackerWidgetProps> = ({
  data,
  loading = false,
}) => {
  if (loading || !data) {
    return (
      <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md animate-pulse">
        <div className="h-4 w-32 bg-white/10 mb-4" />
        <div className="h-10 w-44 bg-white/10 mb-3" />
        <div className="h-16 w-full bg-white/5" />
      </div>
    );
  }

  const {
    status,
    loadRatio,
    weeklyLessonHours,
    weeklyHomeworkHours,
    targetWeeklyCapacityHours,
    recommendation,
  } = data;

  const isOverload = status === 'OVERLOAD';
  const isOptimal = status === 'OPTIMAL';

  const statusLabel = isOverload ? 'ПЕРЕГРУЗКА' : isOptimal ? 'НОРМА (ОПТИМУМ)' : 'НИЗКАЯ НАГРУЗКА';
  const badgeColor = isOverload
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
    : isOptimal
    ? 'border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00]'
    : 'border-amber-400/40 bg-amber-400/10 text-amber-300';

  const barColor = isOverload ? 'bg-rose-500' : isOptimal ? 'bg-[#d4ff00]' : 'bg-amber-400';
  const barPercent = Math.min(100, Math.round(loadRatio * 85));

  return (
    <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md">
      {/* Header */}
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.04] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Activity className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
          <div>
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">
              [ BURNOUT_INDEX // TELEMETRY ]
            </span>
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Статус нагрузки и выгорания
            </h2>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 border ${badgeColor}`}>
          {isOverload ? (
            <AlertOctagon className="w-3.5 h-3.5" />
          ) : isOptimal ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <BatteryCharging className="w-3.5 h-3.5" />
          )}
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Показатели часов */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="p-2 bg-black/40 border border-white/[0.04]">
          <span className="font-mono text-[9px] text-zinc-500 block uppercase">Уроки МЭШ</span>
          <span className="font-display text-base font-bold text-white">{weeklyLessonHours} ч</span>
        </div>
        <div className="p-2 bg-black/40 border border-white/[0.04]">
          <span className="font-mono text-[9px] text-zinc-500 block uppercase">ДЗ в неделю</span>
          <span className="font-display text-base font-bold text-white">{weeklyHomeworkHours} ч</span>
        </div>
        <div className="p-2 bg-black/40 border border-white/[0.04]">
          <span className="font-mono text-[9px] text-zinc-500 block uppercase">План отдых/цель</span>
          <span className="font-display text-base font-bold text-[#d4ff00]">{targetWeeklyCapacityHours} ч</span>
        </div>
      </div>

      {/* Прогресс-бар нагрузки */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
          <span>КОЭФФИЦИЕНТ ЗАГРУЗКИ: {Math.round(loadRatio * 100)}%</span>
          <span>{isOverload ? 'РИСК ПЕРЕУТОМЛЕНИЯ' : 'БАЛАНС СОХРАНЕН'}</span>
        </div>
        <div className="w-full bg-zinc-950 h-2 border border-white/[0.06] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${barColor}`}
            style={{ width: `${barPercent}%` }}
          />
        </div>
      </div>

      {/* Рекомендация */}
      <div className="p-2.5 bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300 font-sans leading-relaxed">
        <span className="font-mono text-[10px] text-[#d4ff00] font-bold mr-1">[ РЕКОМЕНДАЦИЯ AI ]:</span>
        {recommendation}
      </div>
    </div>
  );
};
