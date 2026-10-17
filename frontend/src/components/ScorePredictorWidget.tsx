import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Target, Play, AlertCircle } from 'lucide-react';
import type { AnalyticsTelemetry } from '../lib/types';

interface ScorePredictorWidgetProps {
  data?: AnalyticsTelemetry['predictor'];
  loading?: boolean;
}

export const ScorePredictorWidget: React.FC<ScorePredictorWidgetProps> = ({
  data,
  loading = false,
}) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md animate-pulse">
        <div className="h-4 w-32 bg-white/10 mb-4" />
        <div className="h-10 w-44 bg-white/10 mb-3" />
        <div className="h-16 w-full bg-white/5" />
      </div>
    );
  }

  const hasEnoughData = Boolean(
    data &&
    data.hasEnoughData !== false &&
    data.estimatedScore !== null &&
    data.minScore !== null &&
    data.maxScore !== null
  );

  if (!hasEnoughData || !data) {
    return (
      <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md">
        {/* HUD Header */}
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.04] pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Target className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
            <div>
              <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">
                [ AI_SCORE_PREDICTOR // v2.4 ]
              </span>
              <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
                Прогноз итогового балла
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 border border-zinc-700/60 text-zinc-400 bg-zinc-800/40">
            <span>СТАТУС: ОЖИДАНИЕ ДАННЫХ</span>
          </div>
        </div>

        {/* HUD Блок: Данных недостаточно для расчета */}
        <div className="border border-white/5 bg-zinc-950/60 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-[#d4ff00]">
                <AlertCircle className="w-4 h-4 text-[#d4ff00] shrink-0" />
                <span>[ ДАННЫХ НЕДОСТАТОЧНО ДЛЯ РАСЧЕТА ]</span>
              </div>
              <p className="font-sans text-xs text-zinc-300 font-light leading-relaxed">
                Пройдите вступительный срез или напишите первый пробник в Симуляторе, чтобы нейросеть рассчитала прогноз баллов.
              </p>
            </div>
            <button
              onClick={() => navigate('/exam-pressure')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#d4ff00] text-black font-mono text-xs font-bold uppercase tracking-[0.15em] rounded-none hover:bg-[#c2ea00] transition-colors shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              [ НАПИСАТЬ ПЕРВЫЙ ПРОБНИК ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { minScore, maxScore, estimatedScore, confidencePercent, trend, recentMockScores, weeksLeft } =
    data;

  const trendLabel =
    trend === 'UP' ? 'РОСТ' : trend === 'DOWN' ? 'СПАД' : 'СТАБИЛЬНЫЙ';
  const TrendIcon =
    trend === 'UP' ? TrendingUp : trend === 'DOWN' ? TrendingDown : Minus;

  // Мини-график (SVG спарклайн последних пробников + прогноз)
  const allPoints = recentMockScores && recentMockScores.length > 0
    ? [...recentMockScores, estimatedScore as number]
    : [estimatedScore as number, estimatedScore as number];
  const minVal = Math.min(...allPoints, 40) - 5;
  const maxVal = Math.max(...allPoints, 95) + 5;
  const range = maxVal - minVal || 1;

  const svgWidth = 240;
  const svgHeight = 45;
  const stepX = svgWidth / Math.max(1, allPoints.length - 1);

  const points = allPoints.map((val, idx) => {
    const x = idx * stepX;
    const y = svgHeight - ((val - minVal) / range) * (svgHeight - 10) - 5;
    return `${x},${y}`;
  });

  const polylinePoints = points.join(' ');

  return (
    <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md">
      {/* HUD Header */}
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.04] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Target className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
          <div>
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">
              [ AI_SCORE_PREDICTOR // v2.4 ]
            </span>
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Прогноз итогового балла
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 border border-[#d4ff00]/30 text-[#d4ff00] bg-[#d4ff00]/5">
          <TrendIcon className="w-3.5 h-3.5" />
          <span>ТЕМП: {trendLabel}</span>
        </div>
      </div>

      {/* Основной балл */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl flex items-baseline gap-2">
            <span className="text-[#d4ff00]">{minScore}–{maxScore}</span>
            <span className="text-xs font-mono text-zinc-400 font-normal">
              (ОЦЕНКА: {estimatedScore})
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Доверительный интервал {confidencePercent}% // остаток {weeksLeft} нед.
          </p>
        </div>

        {/* Мини-спарклайн */}
        <div className="shrink-0 w-32 md:w-44 h-12 flex flex-col justify-end">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-10 overflow-visible">
            {/* Сетка */}
            <line x1="0" y1="0" x2={svgWidth} y2="0" stroke="rgba(255,255,255,0.06)" strokeDasharray="2,2" />
            <line x1="0" y1={svgHeight} x2={svgWidth} y2={svgHeight} stroke="rgba(255,255,255,0.06)" />

            {/* Линия спарклайна */}
            <polyline
              fill="none"
              stroke="#d4ff00"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylinePoints}
            />

            {/* Точки */}
            {allPoints.map((val, idx) => {
              const x = idx * stepX;
              const y = svgHeight - ((val - minVal) / range) * (svgHeight - 10) - 5;
              const isLast = idx === allPoints.length - 1;
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r={isLast ? 4 : 2.5}
                  fill={isLast ? '#d4ff00' : '#ffffff'}
                  stroke={isLast ? '#000000' : 'none'}
                  strokeWidth={isLast ? 1.5 : 0}
                />
              );
            })}
          </svg>
          <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-0.5">
            <span>ПРОБНИКИ</span>
            <span className="text-[#d4ff00]">ЕГЭ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
