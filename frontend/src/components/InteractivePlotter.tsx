import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, RotateCcw, Crosshair, ChevronLeft, ChevronRight } from 'lucide-react';

export interface PlotterConfig {
  fn: string;        // e.g. "x^2 - 4*x + a"
  param?: string;    // e.g. "a" (defaults to "a")
  min?: number;      // e.g. -5
  max?: number;      // e.g. 5
  step?: number;     // e.g. 0.1
  target?: string;   // e.g. "x - 2"
  title?: string;
  initialParam?: number;
}

interface Point {
  x: number;
  y: number;
}

function compileSafeMath(expr: string, paramName: string = 'a'): (x: number, a: number) => number {
  if (!expr || !expr.trim()) return () => NaN;

  try {
    const sanitized = expr
      .trim()
      .replace(/\^/g, '**')
      .replace(/(\d)([a-zA-Z])/g, '$1*$2')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan');

    // Safe constructor without external scope
    const fn = new Function(
      'x',
      paramName,
      `"use strict"; try { const res = Number(${sanitized}); return Number.isFinite(res) ? res : NaN; } catch { return NaN; }`
    );
    // Test on sample values
    const test = fn(1, 0);
    if (!Number.isNaN(test) || Number.isNaN(test)) {
      return fn as (x: number, a: number) => number;
    }
  } catch (e) {
    console.warn('[Plotter] Math parse error:', expr, e);
  }
  return () => NaN;
}

export const InteractivePlotter: React.FC<{ config: PlotterConfig | string }> = ({ config: rawConfig }) => {
  const config: PlotterConfig = useMemo(() => {
    if (typeof rawConfig === 'string') {
      try {
        return JSON.parse(rawConfig);
      } catch {
        return { fn: 'x^2 - 4*x + a', param: 'a', min: -5, max: 5, step: 0.1, target: 'x - 2' };
      }
    }
    return rawConfig;
  }, [rawConfig]);

  const paramName = config.param || 'a';
  const minVal = config.min ?? -5;
  const maxVal = config.max ?? 5;
  const stepVal = config.step ?? 0.1;
  const initialA = config.initialParam ?? 0;

  const [paramValue, setParamValue] = useState<number>(initialA);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animDirectionRef = useRef<number>(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const evalFn = useMemo(() => compileSafeMath(config.fn, paramName), [config.fn, paramName]);
  const evalTarget = useMemo(
    () => (config.target ? compileSafeMath(config.target, paramName) : null),
    [config.target, paramName]
  );

  // Авто-анимация параметра (сканирование плоскости)
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setParamValue((prev) => {
        let next = prev + animDirectionRef.current * stepVal;
        if (next >= maxVal) {
          next = maxVal;
          animDirectionRef.current = -1;
        } else if (next <= minVal) {
          next = minVal;
          animDirectionRef.current = 1;
        }
        return Math.round(next * 100) / 100;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, maxVal, minVal, stepVal]);

  // Вычисление точек пересечения численной бисекцией
  const intersections: Point[] = useMemo(() => {
    if (!evalTarget) return [];
    const pts: Point[] = [];
    const xMin = -10;
    const xMax = 10;
    const sampleStep = 0.05;

    let prevDiff = evalFn(xMin, paramValue) - evalTarget(xMin, paramValue);

    for (let x = xMin + sampleStep; x <= xMax; x += sampleStep) {
      const curDiff = evalFn(x, paramValue) - evalTarget(x, paramValue);

      if (Number.isFinite(prevDiff) && Number.isFinite(curDiff) && prevDiff * curDiff <= 0) {
        // Уточнение бисекцией
        let a = x - sampleStep;
        let b = x;
        for (let iter = 0; iter < 12; iter++) {
          const mid = (a + b) / 2;
          const diffMid = evalFn(mid, paramValue) - evalTarget(mid, paramValue);
          if (diffMid * prevDiff <= 0) {
            b = mid;
          } else {
            a = mid;
          }
        }
        const rootX = (a + b) / 2;
        const rootY = evalTarget(rootX, paramValue);
        if (Number.isFinite(rootX) && Number.isFinite(rootY)) {
          const isDupe = pts.some((p) => Math.abs(p.x - rootX) < 0.1);
          if (!isDupe) {
            pts.push({ x: Math.round(rootX * 100) / 100, y: Math.round(rootY * 100) / 100 });
          }
        }
      }
      prevDiff = curDiff;
    }
    return pts;
  }, [evalFn, evalTarget, paramValue]);

  // Отрисовка на 2D Canvas в строгом EGE.SYSTEM HUD стиле
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Очистка темным фоном HUD
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Масштаб: 24 пикселя на 1 единицу
    const scale = 24;
    const originX = width / 2;
    const originY = height / 2;

    const toScreenX = (x: number) => originX + x * scale;
    const toScreenY = (y: number) => originY - y * scale;
    const toMathX = (px: number) => (px - originX) / scale;

    // Сетка координат (тонкая, темная)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let x = -15; x <= 15; x++) {
      const sx = toScreenX(x);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
    }
    for (let y = -12; y <= 12; y++) {
      const sy = toScreenY(y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
    }

    // Оси X и Y (четкие, серые с акцентом)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;

    // Ось X
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();

    // Ось Y
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Числа и метки на осях
    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let x = -12; x <= 12; x += 2) {
      if (x === 0) continue;
      const sx = toScreenX(x);
      ctx.fillText(x.toString(), sx, originY + 4);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = -10; y <= 10; y += 2) {
      if (y === 0) continue;
      const sy = toScreenY(y);
      ctx.fillText(y.toString(), originX - 5, sy);
    }

    // Подписи осей X и Y
    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('X', width - 12, originY - 12);
    ctx.fillText('Y', originX + 14, 12);

    // График целевой функции / прямой (Cyan, штриховая линия)
    if (evalTarget) {
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      let started = false;

      for (let px = 0; px <= width; px += 2) {
        const mx = toMathX(px);
        const my = evalTarget(mx, paramValue);
        if (Number.isFinite(my)) {
          const sy = toScreenY(my);
          if (sy >= -100 && sy <= height + 100) {
            if (!started) {
              ctx.moveTo(px, sy);
              started = true;
            } else {
              ctx.lineTo(px, sy);
            }
          } else {
            started = false;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // График функции с параметром (Neon Lime #d4ff00, 2.5px)
    ctx.save();
    ctx.strokeStyle = '#d4ff00';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(212, 255, 0, 0.35)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    let startedFn = false;

    for (let px = 0; px <= width; px += 2) {
      const mx = toMathX(px);
      const my = evalFn(mx, paramValue);
      if (Number.isFinite(my)) {
        const sy = toScreenY(my);
        if (sy >= -200 && sy <= height + 200) {
          if (!startedFn) {
            ctx.moveTo(px, sy);
            startedFn = true;
          } else {
            ctx.lineTo(px, sy);
          }
        } else {
          startedFn = false;
        }
      } else {
        startedFn = false;
      }
    }
    ctx.stroke();
    ctx.restore();

    // Отрисовка точек пересечения (Amber #f59e0b)
    for (const pt of intersections) {
      const sx = toScreenX(pt.x);
      const sy = toScreenY(pt.y);

      if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) {
        // Внешнее светящееся кольцо
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Центр точки
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // HUD-метка координат
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`(${pt.x}; ${pt.y})`, sx + 8, sy - 4);
      }
    }
  }, [evalFn, evalTarget, paramValue, intersections]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  return (
    <div className="my-3 border border-white/10 bg-black p-3 rounded-none text-zinc-100 font-sans shadow-lg">
      {/* HUD-шапка графопостроителя */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#d4ff00]" />
          <span className="font-bold text-[#d4ff00] uppercase tracking-wider">
            [ 2D_PARAM_PLOTTER // КИМ №18 ]
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-zinc-400">
            ПЕРЕСЕЧЕНИЙ: <strong className={intersections.length > 0 ? 'text-[#f59e0b]' : 'text-zinc-500'}>{intersections.length}</strong>
          </span>
        </div>
      </div>

      {/* Холст HTML5 Canvas */}
      <div className="relative mt-2 border border-white/[0.08] bg-[#09090b] overflow-hidden flex justify-center">
        <canvas
          ref={canvasRef}
          width={560}
          height={320}
          className="w-full max-w-[560px] h-[280px] md:h-[320px] block cursor-crosshair"
        />

        {/* Легенда графиков в верхнем углу холста */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 bg-black/80 border border-white/10 p-2 font-mono text-[10px] pointer-events-none">
          <div className="flex items-center gap-1.5 text-[#d4ff00]">
            <span className="w-2 h-0.5 bg-[#d4ff00]" />
            <span>f(x) = {config.fn}</span>
          </div>
          {config.target && (
            <div className="flex items-center gap-1.5 text-[#00f0ff]">
              <span className="w-2 h-0.5 bg-[#00f0ff]" />
              <span>target = {config.target}</span>
            </div>
          )}
        </div>
      </div>

      {/* Панель управления параметром 'a' */}
      <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-zinc-400">
            ПАРАМЕТР <strong className="text-white">[{paramName}]</strong>:
          </span>
          <span className="px-2 py-0.5 border border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00] font-bold tracking-widest text-sm">
            {paramName} = {paramValue.toFixed(2)}
          </span>
        </div>

        {/* Ползунок слайдера */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-500">{minVal}</span>
          <input
            type="range"
            min={minVal}
            max={maxVal}
            step={stepVal}
            value={paramValue}
            onChange={(e) => {
              setParamValue(parseFloat(e.target.value));
              if (isPlaying) setIsPlaying(false);
            }}
            className="flex-1 accent-[#d4ff00] h-1.5 bg-zinc-800 rounded-none cursor-pointer"
          />
          <span className="text-[10px] font-mono text-zinc-500">+{maxVal}</span>
        </div>

        {/* Быстрые кнопки управления шагом и анимацией */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setParamValue((p) => Math.max(minVal, Math.round((p - 0.5) * 10) / 10))}
              className="px-2 py-1 border border-white/10 hover:border-[#d4ff00] hover:text-[#d4ff00] transition-colors rounded-none bg-zinc-900/60"
              title="Шаг влево (-0.5)"
            >
              <ChevronLeft className="w-3.5 h-3.5 inline mr-0.5" /> -0.5
            </button>
            <button
              type="button"
              onClick={() => setParamValue((p) => Math.min(maxVal, Math.round((p + 0.5) * 10) / 10))}
              className="px-2 py-1 border border-white/10 hover:border-[#d4ff00] hover:text-[#d4ff00] transition-colors rounded-none bg-zinc-900/60"
              title="Шаг вправо (+0.5)"
            >
              +0.5 <ChevronRight className="w-3.5 h-3.5 inline ml-0.5" />
            </button>
            <button
              type="button"
              onClick={() => setParamValue(initialA)}
              className="px-2 py-1 border border-white/10 hover:border-white/30 text-zinc-400 hover:text-white transition-colors rounded-none bg-zinc-900/60 flex items-center gap-1"
              title="Сброс в 0"
            >
              <RotateCcw className="w-3 h-3" /> [ 0 ]
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={`px-3 py-1 border text-xs uppercase flex items-center gap-1.5 rounded-none font-bold transition-all ${
              isPlaying
                ? 'border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]'
                : 'border-[#d4ff00]/50 bg-[#d4ff00]/10 text-[#d4ff00] hover:bg-[#d4ff00]/20'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" /> [ ПАУЗА ]
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" /> [ АВТО-ДВИЖЕНИЕ ]
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
