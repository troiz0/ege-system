// frontend/src/components/ExamRetestModal.tsx
// Интерактивный режим «Работа над ошибками» (Exam Retest) для КИМ

import React, { useState } from 'react';
import type { ExamTaskItem } from '../lib/types';
import { LatexText } from './LatexText';
import { X, CheckCircle2, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';

interface ExamRetestModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: ExamTaskItem[];
  missedTaskNumbers: string[];
  originalAnswers: Record<string, string>;
  subject: string;
}

export const ExamRetestModal: React.FC<ExamRetestModalProps> = ({
  isOpen,
  onClose,
  tasks,
  missedTaskNumbers,
  originalAnswers,
  subject,
}) => {
  // Фильтруем только те задачи, в которых была допущена ошибка
  const missedTasks = tasks.filter((t) => {
    const numStr = (t.number ?? t.id ?? '').toString();
    return missedTaskNumbers.includes(numStr) || missedTaskNumbers.includes(`№${numStr}`) || missedTaskNumbers.includes(`№ ${numStr}`);
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [newAnswers, setNewAnswers] = useState<Record<string, string>>({});
  const [checkedStatus, setCheckedStatus] = useState<Record<string, { isCorrect: boolean; showExplanation: boolean }>>({});

  if (!isOpen || missedTasks.length === 0) return null;

  const currentTask = missedTasks[currentIndex];
  const taskKey = (currentTask.number ?? currentTask.id ?? '').toString();
  const currentInput = newAnswers[taskKey] ?? '';
  const currentResult = checkedStatus[taskKey];
  const originalAns = originalAnswers[taskKey] || '—';

  const cleanAns = (str?: string) =>
    (str || '').trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');

  const handleCheck = () => {
    if (!currentInput.trim()) return;

    const isMatch = cleanAns(currentInput) === cleanAns(currentTask.correctAnswer);
    setCheckedStatus((prev) => ({
      ...prev,
      [taskKey]: {
        isCorrect: isMatch,
        showExplanation: true,
      },
    }));
  };

  const handleNext = () => {
    if (currentIndex < missedTasks.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const correctedCount = Object.values(checkedStatus).filter((s) => s.isCorrect).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-none border border-zinc-800 bg-zinc-900 shadow-none">
        {/* ШАПКА */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 bg-amber-400 animate-pulse" />
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400 block font-bold">
                [ EXAM_RETEST // РАБОТА НАД ОШИБКАМИ ]
              </span>
              <h2 className="text-base sm:text-lg font-display font-extrabold text-white uppercase tracking-tight">
                {subject}: Задание № {currentTask.number || currentIndex + 1}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-400 bg-zinc-900 border border-white/10 px-2.5 py-1">
              {currentIndex + 1} из {missedTasks.length} ошибок
            </span>
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ТЕЛО МОДАЛКИ */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Индикатор старого ответа */}
          <div className="flex items-center justify-between p-3 bg-red-950/30 border border-red-500/30 text-xs font-mono">
            <div className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Ваш ответ на экзамене:</span>
              <span className="font-bold text-white px-2 py-0.5 bg-black border border-red-500/40">
                {originalAns}
              </span>
            </div>
            <span className="text-red-400 text-[11px] uppercase tracking-wider font-semibold">
              НЕВЕРНО
            </span>
          </div>

          {/* УСЛОВИЕ ЗАДАЧИ */}
          <div className="p-4 bg-zinc-900/50 border border-white/[0.08] space-y-3">
            <div className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap font-sans">
              <LatexText content={currentTask.statement || currentTask.title || ''} />
            </div>

            {currentTask.imageUrl && (
              <div className="mt-3 overflow-hidden border border-white/10 bg-black/40 p-2 inline-block">
                <img
                  src={currentTask.imageUrl}
                  alt="Чертеж к задаче"
                  className="max-h-60 max-w-full rounded-none object-contain filter invert brightness-95 contrast-125"
                />
              </div>
            )}
          </div>

          {/* ВВОД НОВОГО ОТВЕТА */}
          <div className="p-4 bg-zinc-900/30 border border-white/[0.08] space-y-3">
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-widest">
              Попробуйте решить заново (без давления таймера):
            </label>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={currentInput}
                onChange={(e) =>
                  setNewAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCheck();
                }}
                disabled={currentResult?.isCorrect}
                placeholder="Новый ответ..."
                className="flex-1 bg-black border border-white/20 px-3 py-2 text-sm font-mono text-[#d4ff00] font-bold focus:outline-none focus:border-[#d4ff00] transition-colors"
              />

              <button
                type="button"
                onClick={handleCheck}
                disabled={!currentInput.trim() || currentResult?.isCorrect}
                className="px-4 py-2 bg-[#d4ff00] hover:bg-[#d4ff00]/90 text-black font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ПРОВЕРИТЬ
              </button>
            </div>
          </div>

          {/* РЕЗУЛЬТАТ ПРОВЕРКИ */}
          {currentResult && (
            <div
              className={`p-4 border animate-in fade-in duration-200 ${
                currentResult.isCorrect
                  ? 'bg-green-950/40 border-green-500/50'
                  : 'bg-red-950/30 border-red-500/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-2 font-mono text-xs font-bold uppercase">
                {currentResult.isCorrect ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">
                      ВЕРНО! Ошибка успешно разобрана и исправлена
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">
                      СНОВА НЕ СОВПАЛО. Правильный ответ:{' '}
                      <span className="text-white font-bold px-1.5 py-0.5 bg-black border border-red-500/40">
                        {currentTask.correctAnswer}
                      </span>
                    </span>
                  </>
                )}
              </div>

              {/* Пояснение к решению */}
              {(currentTask.solutionCriteria || currentTask.fipiCriteria) && (
                <div className="mt-3 pt-3 border-t border-white/10 text-xs text-zinc-300 font-sans space-y-1.5">
                  <div className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#d4ff00]" />
                    Официальное пояснение решения:
                  </div>
                  <div className="leading-relaxed bg-black/40 p-3 border border-white/5">
                    <LatexText content={currentTask.solutionCriteria || currentTask.fipiCriteria || ''} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ПОДВАЛ С НАВИГАЦИЕЙ */}
        <div className="border-t border-white/10 px-5 py-3.5 bg-zinc-900/60 flex items-center justify-between text-xs font-mono">
          <div className="text-zinc-400">
            Исправлено: <span className="text-[#d4ff00] font-bold">{correctedCount}</span> из{' '}
            {missedTasks.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-3 py-1.5 border border-white/10 bg-zinc-900 text-zinc-300 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
            >
              НАЗАД
            </button>

            {currentIndex < missedTasks.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-3 py-1.5 border border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00] font-mono text-xs uppercase tracking-wider hover:bg-[#d4ff00]/20 hover:border-[#d4ff00] transition-all flex items-center gap-1"
              >
                СЛЕДУЮЩЕЕ
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-[#d4ff00] text-black font-bold hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                ЗАВЕРШИТЬ РАБОТУ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamRetestModal;
