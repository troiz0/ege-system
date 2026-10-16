import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { LatexText } from './LatexText';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import { Sparkles, CheckCircle, RefreshCw, Layers, Eye } from 'lucide-react';
import type { Flashcard } from '../lib/types';

export const FlashcardsWidget: React.FC = () => {
  const { addToast } = useToastStore();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await api.getDueFlashcards();
      setCards(res.items || []);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка загрузки карточек');
    } finally {
      setLoading(false);
    }
  };

  const handleShowAnswer = () => {
    setIsFlipped(true);
  };

  const handleReview = async (rating: number) => {
    const card = cards[currentIndex];
    if (!card) return;

    setReviewing(true);
    try {
      await api.reviewFlashcard(card.id, rating);
      addToast('success', 'Оценка принята. Интервал повторения обновлен.');
      setIsFlipped(false);
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Завершили сегодняшнюю колоду
        setCards([]);
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка отправки оценки');
    } finally {
      setReviewing(false);
    }
  };

  const handleGenerateMistakes = async () => {
    setGenerating(true);
    try {
      const res = await api.generateFlashcardsFromMistakes();
      addToast('success', `Сгенерировано ${res.created} новых карточек из ваших ошибок!`);
      await loadCards();
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка генерации колоды');
    } finally {
      setGenerating(false);
    }
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md">
      {/* Заголовок виджета */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Layers className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
          <div>
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">
              [ SPACED_REPETITION // КАРТОЧКИ ПОВТОРЕНИЯ ]
            </span>
            <h3 className="font-display text-base font-bold uppercase tracking-tight text-white">
              ПОВТОРЕНИЕ СЕГОДНЯ
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-[10px]">
            {cards.length > 0 ? `ОСТАЛОСЬ: ${cards.length - currentIndex}` : 'ВСЁ ПОВТОРЕНО'}
          </span>
          <button
            onClick={handleGenerateMistakes}
            disabled={generating}
            className="px-2.5 py-1 border border-white/[0.1] hover:border-[#d4ff00] text-zinc-300 hover:text-[#d4ff00] font-mono text-[10px] uppercase flex items-center gap-1.5 transition-all"
            title="Автоматически добавить карточки по темам ошибок"
          >
            {generating ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 text-[#d4ff00]" />
            )}
            ИЗ ОШИБОК
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 text-[#d4ff00] animate-spin" />
          <span className="font-mono text-xs text-zinc-400">СИНХРОНИЗАЦИЯ КОЛОДЫ...</span>
        </div>
      ) : !currentCard ? (
        <div className="py-10 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-none bg-[#d4ff00]/10 border border-[#d4ff00]/30 flex items-center justify-center mb-3">
            <CheckCircle className="w-6 h-6 text-[#d4ff00]" />
          </div>
          <p className="font-display text-base font-bold text-white mb-1">
            Все запланированные карточки на сегодня повторены!
          </p>
          <p className="text-xs text-zinc-400 max-w-xs mb-4">
            Новые интервалы рассчитаны автоматически. Хотите добавить новые карточки из недавних ошибок?
          </p>
          <button
            onClick={handleGenerateMistakes}
            disabled={generating}
            className="px-4 py-2 bg-[#d4ff00] text-black font-display font-bold text-xs uppercase tracking-wider transition-all hover:brightness-110 hover:shadow-glow flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Сгенерировать колоду из ошибок
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Индикатор прогресса колоды */}
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>КАРТОЧКА {currentIndex + 1} ИЗ {cards.length}</span>
            <span>ИНТЕРВАЛ: {currentCard.interval} ДН.</span>
          </div>

          {/* КОНТЕЙНЕР КАРТОЧКИ */}
          <div className="border border-white/[0.12] bg-zinc-950 p-6 min-h-[220px] flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-wider">
                {currentCard.subject} // {currentCard.topic}
              </span>
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                {isFlipped ? '[ ОТВЕТ ]' : '[ ВОПРОС ]'}
              </span>
            </div>

            {/* ВОПРОС (FRONT) */}
            <div className="my-auto py-4 text-center text-base md:text-lg font-sans text-zinc-100 font-medium">
              <LatexText content={currentCard.frontText} />
            </div>

            {/* ОТВЕТ (BACK) — виден только после открытия */}
            {isFlipped && (
              <div className="pt-4 mt-2 border-t border-white/[0.1] bg-black/60 p-4">
                <div className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-wider mb-2 font-bold">
                  ПРАВИЛЬНЫЙ ОТВЕТ:
                </div>
                <div className="text-center text-base md:text-lg font-sans text-white font-medium">
                  <LatexText content={currentCard.backText} />
                </div>
              </div>
            )}
          </div>

          {/* ДВУХЭТАПНЫЙ ИНТЕРФЕЙС УПРАВЛЕНИЯ */}
          {!isFlipped ? (
            /* ЭТАП 1: КНОПКА «ПОКАЗАТЬ ОТВЕТ» */
            <div className="pt-2">
              <button
                type="button"
                onClick={handleShowAnswer}
                className="w-full py-3 bg-[#d4ff00] hover:brightness-110 hover:shadow-glow text-black font-display text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                [ ПОКАЗАТЬ ОТВЕТ ]
              </button>
            </div>
          ) : (
            /* ЭТАП 2: «Вспомнили материал?» И 3 КНОПКИ ОЦЕНКИ */
            <div className="pt-2">
              <span className="block text-center font-mono text-[11px] text-zinc-300 mb-3 uppercase tracking-wider">
                Вспомнили материал?
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReview(1)}
                  className="py-2.5 px-2 border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono text-xs uppercase transition-all disabled:opacity-30 disabled:pointer-events-none text-center"
                >
                  [ НЕ ПОМНЮ (1 ДЕНЬ) ]
                </button>

                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReview(3)}
                  className="py-2.5 px-2 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-mono text-xs uppercase transition-all disabled:opacity-30 disabled:pointer-events-none text-center"
                >
                  [ С ТРУДОМ (3 ДНЯ) ]
                </button>

                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReview(5)}
                  className="py-2.5 px-2 border border-[#d4ff00]/60 bg-[#d4ff00]/[0.10] text-[#d4ff00] hover:bg-[#d4ff00]/25 hover:border-[#d4ff00] font-mono font-bold text-xs uppercase transition-all disabled:opacity-30 disabled:pointer-events-none text-center"
                >
                  [ ЗНАЮ НАИЗУСТЬ (7 ДНЕЙ) ]
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FlashcardsWidget;
