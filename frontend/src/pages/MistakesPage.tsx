import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { MistakeEntry } from '../lib/types';
import { useToastStore } from '../store/toastStore';
import { CheckCircle2, BookX, Zap } from 'lucide-react';
import { LatexText } from '../components/LatexText';
import { LoadingPage } from '../components/ui/LoadingSpinner';

export function MistakesPage() {
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [stats, setStats] = useState({ total: 0, unresolvedCount: 0, resolvedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [activeRematchId, setActiveRematchId] = useState<string | null>(null);
  const [rematchAnswer, setRematchAnswer] = useState('');
  const [checkingAnswer, setCheckingAnswer] = useState(false);

  const { addToast } = useToastStore();

  useEffect(() => {
    loadMistakes();
  }, [statusFilter]);

  const loadMistakes = async () => {
    setLoading(true);
    try {
      const statusParam = statusFilter === 'all' ? undefined : statusFilter;
      const res = await api.getMistakes(undefined, statusParam);
      setMistakes(res.mistakes || []);
      setStats(res.stats || { total: 0, unresolvedCount: 0, resolvedCount: 0 });
    } catch {
      addToast('error', 'Ошибка загрузки книги ошибок');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPage />;

  const handleStartRematch = (mistake: MistakeEntry) => {
    setActiveRematchId(mistake.id);
    setRematchAnswer('');
  };

  const handleRematchSubmit = async (id: string) => {
    if (!rematchAnswer.trim()) return;
    setCheckingAnswer(true);
    try {
      const res = await api.resolveMistake(id, rematchAnswer.trim());
      if (res.isCorrect) {
        addToast('success', 'Верно! Задача успешно закрыта в вашей книге ошибок (+20 XP)');
        setActiveRematchId(null);
        loadMistakes();
      } else {
        addToast('error', 'Неверный ответ. Попробуйте еще раз или проверьте вычисления.');
      }
    } catch (e: any) {
      addToast('error', e.message || 'Ошибка проверки решения');
    } finally {
      setCheckingAnswer(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Главный заголовок страницы MISTAKES */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ MISTAKE.BOOK // ERROR LOG ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            MISTAKES
          </h1>
          <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
            Личная книга ошибок и тренировка реванша по проблемным заданиям КИМ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-none border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-all ${
              statusFilter === 'all'
                ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00]'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ ВСЕ: {stats.total} ]
          </button>
          <button
            onClick={() => setStatusFilter('unresolved')}
            className={`rounded-none border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-all ${
              statusFilter === 'unresolved'
                ? 'border-red-400/60 bg-red-500/[0.08] text-red-400'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ НЕ ЗАКРЫТЫ: {stats.unresolvedCount} ]
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`rounded-none border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-all ${
              statusFilter === 'resolved'
                ? 'border-emerald-400/60 bg-emerald-500/[0.08] text-emerald-400'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ РЕВАНШ ВЗЯТ: {stats.resolvedCount} ]
          </button>
        </div>
      </div>

      {/* Шапка книги ошибок */}
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-red-500/40 bg-red-500/10">
              <BookX className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">
                [ MISTAKE.BOOK // СТАТИСТИКА РЕВАНША ]
              </span>
              <h2 className="font-display text-xl font-bold uppercase tracking-tight text-white md:text-2xl">
                Реванш над допущенными ошибками
              </h2>
            </div>
          </div>
        </div>

        {/* Статистика */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-white/[0.06] bg-zinc-950/40 p-3.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              ВСЕГО ЗАФИКСИРОВАНО
            </span>
            <div className="mt-1 font-display text-2xl font-bold text-white">
              {stats.total} ошибок
            </div>
          </div>

          <div className="border border-red-500/20 bg-red-500/[0.03] p-3.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-red-400">
              ТРЕБУЮТ РЕВАНША
            </span>
            <div className="mt-1 font-display text-2xl font-bold text-red-400">
              {stats.unresolvedCount} задач
            </div>
          </div>

          <div className="border border-emerald-500/20 bg-emerald-500/[0.03] p-3.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
              УСПЕШНО ЗАКРЫТО
            </span>
            <div className="mt-1 font-display text-2xl font-bold text-emerald-400">
              {stats.resolvedCount} задач
            </div>
          </div>
        </div>
      </div>

      {/* СПИСОК ОШИБОК */}
      {mistakes.length === 0 ? (
        <div className="rounded-none border border-dashed border-white/10 bg-zinc-900/40 p-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
          <h3 className="font-display text-base font-bold uppercase text-white">
            Книга ошибок пуста
          </h3>
          <p className="mt-1 font-sans text-xs text-zinc-400">
            Ошибки из симулятора и тестов автоматически фиксируются здесь для целенаправленного реванша.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {mistakes.map((item) => {
            const isResolved = item.status === 'RESOLVED';
            const isRematchActive = activeRematchId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-none border p-5 backdrop-blur-md transition-all ${
                  isResolved
                    ? 'border-emerald-500/20 bg-emerald-500/[0.02]'
                    : 'border-white/10 bg-zinc-900/40 hover:border-white/20'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#d4ff00]">
                      ЗАДАНИЕ №{item.taskNumber}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">
                      // {item.subject}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 ${
                        isResolved
                          ? 'border border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : 'border border-red-500/30 text-red-400 bg-red-500/10'
                      }`}
                    >
                      {isResolved ? 'ЗАКРЫТО' : 'НЕ РЕШЕНО'}
                    </span>
                  </div>
                </div>

                {/* Условие задачи */}
                <div className="my-4 font-sans text-sm text-zinc-200 leading-relaxed">
                  <LatexText content={item.statement} />
                </div>

                {/* Блок ответов */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-white/[0.04] pt-3 font-mono text-xs">
                  <div className="border border-red-500/20 bg-red-500/[0.04] p-3">
                    <span className="text-zinc-500 block uppercase text-[10px]">Ваш неверный ответ на экзамене:</span>
                    <span className="text-red-400 font-bold text-sm mt-0.5 block">
                      {item.userAnswer || '(нет ответа)'}
                    </span>
                  </div>

                  {isResolved ? (
                    <div className="border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                      <span className="text-zinc-500 block uppercase text-[10px]">Правильный ответ:</span>
                      <span className="text-emerald-400 font-bold text-sm mt-0.5 block">
                        <LatexText content={item.correctAnswer || ''} />
                      </span>
                    </div>
                  ) : (
                    <div className="border border-white/[0.06] bg-zinc-950/40 p-3 flex items-center justify-between">
                      <span className="text-zinc-400 text-xs">Правильный ответ скрыт до успешного реванша</span>
                    </div>
                  )}
                </div>

                {/* Объяснение (если задача закрыта) */}
                {isResolved && item.explanation && (
                  <div className="mt-3 border border-white/[0.06] bg-zinc-950/40 p-3 text-xs font-sans text-zinc-300">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">Разбор и решение:</span>
                    <LatexText content={item.explanation} />
                  </div>
                )}

                {/* Кнопка реванша / инпут решения */}
                {!isResolved && (
                  <div className="mt-4 border-t border-white/[0.06] pt-3">
                    {!isRematchActive ? (
                      <button
                        onClick={() => handleStartRematch(item)}
                        className="rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 shadow-none"
                      >
                        <span className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-black" />
                          [ РЕВАНШ // РЕШИТЬ СНОВА ]
                        </span>
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          placeholder="Введите верный ответ..."
                          value={rematchAnswer}
                          onChange={(e) => setRematchAnswer(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRematchSubmit(item.id)}
                          className="flex-1 min-w-[200px] border border-white/20 bg-zinc-950 px-3 py-2 font-mono text-sm text-white focus:border-[#d4ff00] focus:outline-none"
                        />
                        <button
                          onClick={() => handleRematchSubmit(item.id)}
                          disabled={checkingAnswer}
                          className="border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase text-black hover:brightness-110 shadow-none transition-all"
                        >
                          {checkingAnswer ? 'ПРОВЕРКА...' : 'ПОДТВЕРДИТЬ ОТВЕТ'}
                        </button>
                        <button
                          onClick={() => setActiveRematchId(null)}
                          className="border border-white/10 px-3 py-2 font-mono text-xs uppercase text-zinc-400 hover:text-white"
                        >
                          ОТМЕНА
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
