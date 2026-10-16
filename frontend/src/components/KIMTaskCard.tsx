import React, { useState } from 'react';
import { LatexText } from './LatexText';
import type { ExamTaskItem } from '../lib/types';
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  FileText,
  Award,
} from 'lucide-react';

export interface KIMTaskCardProps {
  task: ExamTaskItem;
  userAnswer?: string;
  isAnswered?: boolean;
  isReviewMode?: boolean;
  userPart2Solution?: {
    text: string;
    scanUrls: Array<{ name: string; url: string; size: number }>;
  };
  onScrollToBlank?: (taskNum: number) => void;
}

interface ParsedTaskStatement {
  intro?: string;
  passage?: string;
  question: string;
}

/**
 * Разбивает условие задания на составные части:
 * 1. Вводная инструкция ("Прочитайте текст и выполните задания 1–3...")
 * 2. Текст / фрагмент произведения (цитата с отступом)
 * 3. Непосредственный вопрос задачи
 */
function parseTaskStatement(rawText: string): ParsedTaskStatement {
  const text = (rawText || '').trim();
  if (!text) return { question: '' };

  // 1. Поиск вводной инструкции
  const introMatch = text.match(
    /^(Прочитайте\s+(?:текст|фрагмент|рецензию|предложени[ея])[^\n.?!]*[.?!])/i
  );
  let intro: string | undefined = undefined;
  let remaining = text;

  if (introMatch) {
    intro = introMatch[1].trim();
    remaining = remaining.slice(introMatch[0].length).trim();
  }

  // 2. Поиск подписи автора литературного произведения (По А. С. Пушкину / по Д. С. Лихачёву)
  const authorMatch = remaining.match(/(\(По\s+[^)]+\)\*?|по\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.\s*[А-ЯЁа-яё]+)/i);
  if (authorMatch && authorMatch.index !== undefined) {
    const splitIndex = authorMatch.index + authorMatch[0].length;
    const passagePart = remaining.slice(0, splitIndex).trim();
    const questionPart = remaining.slice(splitIndex).trim();
    if (questionPart) {
      return { intro, passage: passagePart, question: questionPart };
    }
  }

  // 3. Поиск вопроса после переноса абзацев (\n\n)
  const paragraphs = remaining.split(/\n\n+/);
  if (paragraphs.length >= 2) {
    const lastParagraph = paragraphs[paragraphs.length - 1];
    const isQuestionPrompt =
      /^(Самостоятельно|В тексте|Укажите|Какие из|Найдите|Определите|Выпишите|Напишите|Среди предложений|Расставьте|Какое из|В одном из)/i.test(
        lastParagraph
      );
    if (isQuestionPrompt) {
      const passagePart = paragraphs.slice(0, -1).join('\n\n').trim();
      return { intro, passage: passagePart, question: lastParagraph.trim() };
    }
  }

  return { intro, question: remaining };
}

export const KIMTaskCard: React.FC<KIMTaskCardProps> = ({
  task,
  userAnswer = '',
  isAnswered = false,
  isReviewMode = false,
  userPart2Solution,
  onScrollToBlank,
}) => {
  // Аккордеон по умолчанию закрыт
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false);
  const [isDiagramInverted, setIsDiagramInverted] = useState(true);

  // Сравнение ответа для части 1
  const isShort = task.type === 'SHORT' || (task.part === 1 && !task.type);
  const normalizedUser = userAnswer.trim().replace(',', '.').toLowerCase();
  const normalizedCorrect = (task.correctAnswer || '').trim().replace(',', '.').toLowerCase();

  const isCorrect =
    isShort && normalizedUser !== '' && normalizedCorrect !== '' && normalizedUser === normalizedCorrect;

  const taskNum = task.taskNumber || task.number || 1;
  const fipiId = task.fipiId || String(taskNum);

  // Форматирование структуры условия
  const parsedStatement = parseTaskStatement(task.statement || task.text || '');

  return (
    <div
      id={`task-card-${taskNum}`}
      className={`p-5 md:p-6 rounded-none border transition-all relative ${
        isReviewMode
          ? isShort
            ? isCorrect
              ? 'border-emerald-500/40 bg-emerald-500/[0.03]'
              : 'border-red-500/40 bg-red-500/[0.03]'
            : 'border-white/10 bg-white/[0.02] backdrop-blur-xl'
          : 'border-white/10 bg-white/[0.02] backdrop-blur-xl hover:border-white/20'
      }`}
    >
      {/* ХЕДЕР КАРТОЧКИ */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="font-display font-bold text-base md:text-lg text-white">
            № {taskNum}
          </span>
          <span className="font-mono text-[10px] md:text-xs text-[#d4ff00] uppercase tracking-[0.2em] font-medium">
            [ ЗАДАНИЕ № {taskNum} // ФИПИ #{fipiId} ]
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Бейдж первичного балла */}
          <span className="font-mono text-[10px] px-2 py-0.5 border border-white/10 bg-white/[0.03] text-zinc-300 font-medium tracking-wider">
            [ {task.maxScore} {task.maxScore === 1 ? 'БАЛЛ' : task.maxScore < 5 ? 'БАЛЛА' : 'БАЛЛОВ'} ]
          </span>

          {/* Статус ответа в процессе экзамена */}
          {!isReviewMode && (
            <button
              type="button"
              onClick={() => onScrollToBlank?.(taskNum)}
              className={`font-mono text-[10px] px-2.5 py-0.5 border transition-all ${
                isAnswered
                  ? 'border-[#d4ff00]/40 text-[#d4ff00] bg-[#d4ff00]/10 hover:bg-[#d4ff00]/20 hover:border-[#d4ff00]'
                  : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:border-white/20'
              }`}
            >
              {isAnswered ? '[ ЗАПОЛНЕНО ]' : '[ НЕТ ОТВЕТА ]'}
            </button>
          )}

          {/* Результат в режиме разбора (Review Mode) */}
          {isReviewMode && isShort && (
            <span
              className={`font-mono text-[11px] px-2.5 py-0.5 border font-medium flex items-center gap-1 ${
                isCorrect
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-400'
              }`}
            >
              {isCorrect ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ВЕРНО (+{task.maxScore} б.)
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  НЕВЕРНО (0 / {task.maxScore} б.)
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* БЕЙДЖ ТЕМЫ */}
      <div className="mb-3.5 flex items-center gap-1.5">
        <span className="font-mono text-[10px] px-2 py-0.5 bg-white/[0.02] border border-white/[0.06] text-zinc-400 uppercase tracking-wider">
          ТЕМА: <span className="text-zinc-200 font-normal">{task.topic}</span>
        </span>
      </div>

      {/* ТЕЛО КАРТОЧКИ: СТРУКТУРИРОВАННЫЙ ТЕКСТ УСЛОВИЯ */}
      <div className="space-y-3 select-text">
        {/* Вводная инструкция */}
        {parsedStatement.intro && (
          <span className="text-xs text-zinc-400 font-sans tracking-wide mb-3 block">
            {parsedStatement.intro}
          </span>
        )}

        {/* Текст Гончарова / фрагмент (цитата с отступом) */}
        {parsedStatement.passage && (
          <div className="my-3 border-l border-zinc-700/60 bg-white/[0.015] py-2 pl-4 pr-2 font-sans text-sm italic leading-relaxed text-zinc-300 md:text-[15px] whitespace-pre-line">
            <LatexText content={parsedStatement.passage} />
          </div>
        )}

        {/* Вопрос / формулировка задания */}
        <div className="text-zinc-100 font-medium text-sm md:text-[15px] leading-relaxed whitespace-pre-line font-sans">
          <LatexText content={parsedStatement.question} />
        </div>
      </div>

      {/* ИЛЛЮСТРАЦИЯ / ЧЕРТЕЖ */}
      {task.imageUrl && (
        <div className="mt-4 p-4 bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center">
          <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-2 border-b border-white/[0.06] pb-1.5">
            <span className="flex items-center gap-1.5 text-[#d4ff00]">
              <ImageIcon className="w-3.5 h-3.5" />
              [ ИЛЛЮСТРАЦИЯ // ЧЕРТЕЖ К ЗАДАНИЮ ]
            </span>
            <button
              type="button"
              onClick={() => setIsDiagramInverted((v) => !v)}
              className="text-[10px] font-mono px-2 py-0.5 border border-white/15 hover:border-[#d4ff00] text-zinc-300 hover:text-white transition-colors"
            >
              {isDiagramInverted ? '[ РЕЖИМ: ТЕМНЫЙ (HUE-SAFE) ]' : '[ РЕЖИМ: СВЕТЛЫЙ (ОРИГИНАЛ) ]'}
            </button>
          </div>
          <div className={`w-full flex items-center justify-center p-3 border transition-colors ${
            isDiagramInverted ? 'bg-black/60 border-white/[0.05]' : 'bg-white border-zinc-300'
          }`}>
            <img
              src={task.imageUrl}
              alt={`Чертеж к заданию № ${taskNum}`}
              className={`max-h-72 max-w-full rounded-none object-contain transition-all ${
                isDiagramInverted
                  ? 'filter invert hue-rotate-180 brightness-95 contrast-105'
                  : 'filter-none'
              }`}
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* ================================================================
          РЕЖИМ РАЗБОРА (REVIEW MODE): ОТОБРАЖАЕТСЯ ТОЛЬКО ПОСЛЕ СДАЧИ ЭКЗАМЕНА
          Во время таймера (status === 'IN_PROGRESS') ответы и пояснения строго скрыты!
         ================================================================ */}
      {isReviewMode && (
        <div className="mt-5 pt-3.5 border-t border-white/[0.08] space-y-3">
          {/* Сравнение ответа для части 1 */}
          {isShort && (
            <div
              className={`p-3.5 border font-mono text-xs ${
                isCorrect
                  ? 'border-green-500/30 bg-green-950/20 text-green-300'
                  : 'border-red-500/30 bg-red-950/20 text-red-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-400 uppercase text-[10px] block">Ваш ответ:</span>
                  <span className="font-bold text-sm text-white">
                    {userAnswer?.trim() || '<пусто>'}
                  </span>
                </div>
                {!isCorrect && (
                  <div className="text-right">
                    <span className="text-zinc-400 uppercase text-[10px] block">Правильный ответ:</span>
                    <span className="font-bold text-sm text-[#d4ff00]">
                      {task.correctAnswer || '—'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Аккордеон с пояснением / эталонным решением (по умолчанию закрыт) */}
          {(task.solutionCriteria || !isShort) && (
            <div>
              <button
                type="button"
                onClick={() => setIsCriteriaOpen((prev) => !prev)}
                className="w-full px-3.5 py-2.5 bg-white/[0.02] border border-white/10 hover:border-[#d4ff00]/60 flex items-center justify-between transition-all font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Award className="w-3.5 h-3.5 text-[#d4ff00]" />
                  <span className="font-medium text-[#d4ff00]">
                    [ {isShort ? 'ПОЯСНЕНИЕ И ПРАВИЛЬНЫЙ ОТВЕТ' : 'ЭТАЛОННОЕ РЕШЕНИЕ И КРИТЕРИИ ФИПИ'} ]
                  </span>
                </span>
                {isCriteriaOpen ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {isCriteriaOpen && (
                <div className="mt-2.5 p-4 bg-white/[0.02] border border-[#d4ff00]/30 space-y-3 backdrop-blur-xl">
                  {/* Правильный ответ внутри аккордеона части 1 */}
                  {isShort && task.correctAnswer && (
                    <div className="pb-2 border-b border-white/[0.08] font-mono text-xs">
                      <span className="text-zinc-400">Правильный ответ: </span>
                      <span className="font-bold text-[#d4ff00] text-sm">{task.correctAnswer}</span>
                    </div>
                  )}

                  <div className="text-xs md:text-sm text-zinc-200 leading-relaxed font-sans whitespace-pre-line select-text">
                    <LatexText
                      content={
                        task.solutionCriteria ||
                        task.fipiCriteria ||
                        (isShort
                          ? 'Пояснение к данному заданию формируется.'
                          : 'Критерии ФИПИ формируются экспертной комиссией.')
                      }
                    />
                  </div>

                  {/* Отображение прикрепленного чистовика ученика для части 2 */}
                  {!isShort && userPart2Solution && (
                    <div className="pt-3 border-t border-white/[0.08] space-y-2">
                      <span className="font-mono text-[10px] text-zinc-400 uppercase block font-bold">
                        ВАШЕ ПРИКРЕПЛЕННОЕ РЕШЕНИЕ:
                      </span>
                      {userPart2Solution.text && (
                        <p className="text-xs font-sans text-zinc-300 bg-black/50 p-2.5 border border-white/[0.08] whitespace-pre-wrap">
                          {userPart2Solution.text}
                        </p>
                      )}
                      {userPart2Solution.scanUrls && userPart2Solution.scanUrls.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {userPart2Solution.scanUrls.map((scan, idx) => (
                            <a
                              key={idx}
                              href={scan.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-black border border-white/[0.1] hover:border-[#d4ff00] text-zinc-300 hover:text-white font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#d4ff00]" />
                              Лист {idx + 1} ({scan.name})
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-zinc-500">
                          Рукописные листы чистовика не были прикреплены.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KIMTaskCard;
