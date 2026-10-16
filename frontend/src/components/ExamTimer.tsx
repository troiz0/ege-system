import React, { useEffect, useState, memo } from 'react';
import { Clock } from 'lucide-react';

export interface ExamTimerProps {
  initialSeconds: number;
  totalSeconds?: number;
  isRunning: boolean;
  onExpire: () => void;
  secondsRef?: React.MutableRefObject<number>;
  onTick?: (secondsLeft: number) => void;
}

export const formatTimer = (totalSec: number): string => {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Изолированный таймер обратного отсчета КИМ.
 * Предотвращает покадровый 1 Гц ре-рендер родительского дерева и формул KaTeX.
 */
export const ExamTimer: React.FC<ExamTimerProps> = memo(({
  initialSeconds,
  totalSeconds,
  isRunning,
  onExpire,
  secondsRef,
  onTick,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialSeconds);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    if (secondsRef) {
      secondsRef.current = initialSeconds;
    }
  }, [initialSeconds, secondsRef]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (secondsRef) {
          secondsRef.current = next;
        }
        onTick?.(next);
        if (next === 0) {
          clearInterval(interval);
          onExpire();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, onExpire, onTick, secondsRef]);

  const maxTotal = totalSeconds ?? initialSeconds;
  const isLowTime = secondsLeft < 15 * 60;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border font-mono ${
        isLowTime
          ? 'border-red-500/50 bg-red-500/15 text-red-300 animate-pulse'
          : 'border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00]'
      }`}
    >
      <Clock className="w-4 h-4 shrink-0" />
      <span className="text-base md:text-xl font-bold tracking-widest font-mono">
        {formatTimer(secondsLeft)}
      </span>
      <span className="text-[10px] uppercase text-zinc-400 ml-1 hidden sm:inline">
        / {formatTimer(maxTotal)}
      </span>
    </div>
  );
});

ExamTimer.displayName = 'ExamTimer';
