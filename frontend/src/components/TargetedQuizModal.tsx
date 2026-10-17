import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { LatexText } from './LatexText';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { errText } from '../lib/errors';
import { X, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import type { TrainerQuizQuestion, TrainerVerifyResult } from '../lib/types';

interface TargetedQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: string;
  subject: string;
  initialMastery?: number;
  onMasteryUpdated?: (newLevel: number) => void;
}

export const TargetedQuizModal: React.FC<TargetedQuizModalProps> = ({
  isOpen,
  onClose,
  topic,
  subject,
  initialMastery = 0.2,
  onMasteryUpdated,
}) => {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [questions, setQuestions] = useState<TrainerQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [customAnswer, setCustomAnswer] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<TrainerVerifyResult | null>(null);
  const [mastery, setMastery] = useState<number>(initialMastery);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && topic) {
      loadQuiz();
      setMastery(initialMastery);
      setCorrectCount(0);
    } else {
      setQuestions([]);
      setCurrentIndex(0);
      setVerifyResult(null);
      setSelectedOption('');
      setCustomAnswer('');
      setCorrectCount(0);
    }
  }, [isOpen, topic]);

  const loadQuiz = async () => {
    setLoading(true);
    setVerifyResult(null);
    setCurrentIndex(0);
    setSelectedOption('');
    setCustomAnswer('');
    setCorrectCount(0);
    try {
      const res = await api.generateTrainerQuiz(topic, subject);
      if (res.questions && res.questions.length > 0) {
        setQuestions(res.questions);
      } else {
        addToast('error', 'Не удалось сформировать задания. Попробуйте еще раз.');
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка генерации блиц-теста');
    } finally {
      setLoading(false);
    }
  };

  const currentQ = questions[currentIndex];

  const handleVerify = async () => {
    if (!currentQ) return;
    const answerToVerify = selectedOption || customAnswer.trim();
    if (!answerToVerify) {
      addToast('info', 'Пожалуйста, выберите вариант ответа или введите свой');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.verifyTrainerAnswer({
        topic,
        subject,
        questionId: currentQ.id,
        userAnswer: answerToVerify,
        correctAnswer: currentQ.correctAnswer,
        question: currentQ.question,
      });

      setVerifyResult(res);
      setMastery(res.newMasteryLevel);
      if (onMasteryUpdated) {
        onMasteryUpdated(res.newMasteryLevel);
      }
      if (res.isCorrect) {
        setCorrectCount((prev) => prev + 1);
        if (res.gamification) {
          useAuthStore.getState().updateUserXp(res.gamification.xp, res.gamification.level);
        }
        addToast('success', '[ +10 XP // ВЕРНЫЙ ОТВЕТ ]');
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка проверки ответа');
    } finally {
      setVerifying(false);
    }
  };

  const handleNext = async () => {
    if (currentIndex + 1 < questions.length) {
      setVerifyResult(null);
      setSelectedOption('');
      setCustomAnswer('');
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Завершение теста: отправляем итоговый результат на бэкенд и начисляем XP
      setSubmitting(true);
      try {
        const res = await api.submitTrainerQuiz({
          topic,
          subject,
          totalQuestions: questions.length,
          correctCount,
        });
        setMastery(res.newMasteryLevel);
        if (onMasteryUpdated) {
          onMasteryUpdated(res.newMasteryLevel);
        }

        if (correctCount > 0) {
          try {
            const matrixRes = await api.completeMatrixTest({
              subject,
              topic,
              correctCount,
              totalQuestions: questions.length,
            });
            if (matrixRes.gamification) {
              useAuthStore.getState().updateUserXp(matrixRes.gamification.xp, matrixRes.gamification.level);
            }
            addToast('success', '[ +30 XP // ТЕМА ОСВОЕНА ]');
          } catch (e) {
            console.warn('Matrix test complete error:', e);
            const percent = Math.round((correctCount / questions.length) * 100);
            addToast(
              'success',
              `Блиц-тест завершен! Результат: ${correctCount}/${questions.length} (${percent}%).`
            );
          }
        } else {
          addToast('info', 'Блиц-тест завершен.');
        }
      } catch (err) {
        console.warn('Failed to submit trainer quiz:', err);
        addToast('info', 'Блиц-тест завершен.');
      } finally {
        setSubmitting(false);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const masteryPercent = Math.round(mastery * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-none border border-white/10 bg-zinc-900 p-6 text-zinc-100 shadow-2xl md:p-8">
        {/* HUD угол-скобки */}
        <div className="absolute top-2 left-2 font-mono text-[10px] text-[#d4ff00]/60 select-none">
          [ TARGETED_QUIZ // ENGINE_v2 ]
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white transition-colors"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Заголовок и телеметрия темы */}
        <div className="mt-2 mb-4 border-b border-white/[0.08] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="font-mono text-xs uppercase tracking-wider text-[#d4ff00]">
              {subject} // БЛИЦ-ТРЕНАЖЕР
            </span>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <span>ОСВОЕНИЕ:</span>
              <span className="text-[#d4ff00] font-bold">{masteryPercent}%</span>
            </div>
          </div>
          <h2 className="text-xl md:text-2xl font-display font-extrabold tracking-tight text-white">
            {topic}
          </h2>

          {/* Индикатор освоения темы */}
          <div className="mt-3 w-full bg-zinc-900 h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                mastery >= 0.75
                  ? 'bg-[#d4ff00]'
                  : mastery >= 0.4
                  ? 'bg-amber-400'
                  : 'bg-red-500'
              }`}
              style={{ width: `${masteryPercent}%` }}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#d4ff00] animate-spin" />
            <p className="font-mono text-xs text-zinc-400 tracking-wider">
              ГЕНЕРАЦИЯ ЗАДАЧ ФИПИ С КАТЕХ РАЗМЕТКОЙ...
            </p>
          </div>
        ) : questions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-400 text-sm mb-4">Не удалось загрузить задачи</p>
            <button
              onClick={loadQuiz}
              className="px-4 py-2 border border-[#d4ff00]/40 text-[#d4ff00] hover:bg-[#d4ff00]/10 font-mono text-xs uppercase"
            >
              [ ПОВТОРИТЬ ЗАПРОС ]
            </button>
          </div>
        ) : (
          <div>
            {/* Номер вопроса */}
            <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-4">
              <span>
                ЗАДАЧА {currentIndex + 1} ИЗ {questions.length}
              </span>
              {currentQ.fipiCriteria && (
                <span className="text-zinc-400 border border-white/[0.08] px-2 py-0.5">
                  {currentQ.fipiCriteria}
                </span>
              )}
            </div>

            {/* Текст задачи с KaTeX */}
            <div className="p-4 bg-zinc-900/60 border border-white/[0.08] mb-6">
              <div className="text-base text-zinc-100 leading-relaxed font-sans">
                <LatexText content={currentQ.question} />
              </div>
            </div>

            {/* Варианты ответов или поле ввода */}
            {currentQ.options && currentQ.options.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {currentQ.options.map((opt, i) => {
                  const isSelected = selectedOption === opt;
                  return (
                    <button
                      key={i}
                      disabled={verifying || !!verifyResult}
                      onClick={() => setSelectedOption(opt)}
                      className={`text-left p-3.5 border transition-all text-sm font-sans flex items-center gap-3 ${
                        isSelected
                          ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                          : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-mono text-xs text-[#d4ff00]/80">[{i + 1}]</span>
                      <span className="flex-1">
                        <LatexText content={opt} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-xs font-mono text-zinc-400 mb-2 uppercase">
                  Ваш ответ (число или выражение):
                </label>
                <input
                  type="text"
                  value={customAnswer}
                  disabled={verifying || !!verifyResult}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  placeholder="Например: 4 или -0.5"
                  className="w-full bg-zinc-900 border border-white/[0.1] px-4 py-2.5 text-zinc-100 font-mono text-sm focus:outline-none focus:border-[#d4ff00]"
                />
              </div>
            )}

            {/* Результат проверки с методом Сократа */}
            {verifyResult && (
              <div
                className={`p-4 mb-6 border ${
                  verifyResult.isCorrect
                    ? 'border-[#d4ff00]/40 bg-[#d4ff00]/5'
                    : 'border-amber-500/40 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-2 font-mono text-xs uppercase font-bold">
                  {verifyResult.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#d4ff00]" />
                      <span className="text-[#d4ff00]">ВЕРНО! [ +25% К ОСВОЕНИЮ ]</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400">ПОТРЕБУЕТСЯ КОРРЕКЦИЯ</span>
                    </>
                  )}
                </div>

                <div className="text-sm text-zinc-200 leading-relaxed font-sans mb-3">
                  <LatexText content={verifyResult.socraticFeedback} />
                </div>

                {verifyResult.hint && !verifyResult.isCorrect && (
                  <div className="p-2.5 bg-black/40 border border-white/[0.06] text-xs font-mono text-amber-300/90 flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">ПОДСКАЗКА: </span>
                      <LatexText content={verifyResult.hint} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Действия */}
            <div className="flex items-center justify-between pt-2">
              <div className="font-mono text-[11px] text-zinc-500">
                {verifyResult ? 'ШАГ ВЫПОЛНЕН' : 'ВЫБЕРИТЕ ОТВЕТ И НАЖМИТЕ ПРОВЕРКУ'}
              </div>

              {!verifyResult ? (
                <button
                  onClick={handleVerify}
                  disabled={verifying || (!selectedOption && !customAnswer.trim())}
                  className="px-6 py-2.5 bg-[#d4ff00] text-black font-display font-extrabold uppercase text-xs tracking-wider hover:bg-[#b8dd00] transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2"
                >
                  {verifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      АНАЛИЗ...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      ПРОВЕРИТЬ [ SOCRATIC ]
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-[#d4ff00] text-black font-display font-extrabold uppercase text-xs tracking-wider hover:bg-[#b8dd00] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      СОХРАНЕНИЕ...
                    </>
                  ) : currentIndex + 1 < questions.length ? (
                    <>
                      СЛЕДУЮЩАЯ ЗАДАЧА
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      ЗАВЕРШИТЬ БЛИЦ
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
