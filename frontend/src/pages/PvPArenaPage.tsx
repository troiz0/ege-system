import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { errText } from '../lib/errors';
import { LatexText } from '../components/LatexText';
import {
  Swords,
  Timer,
  Zap,
  Award,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Flame,
  Crosshair,
} from 'lucide-react';

interface PvpTaskDto {
  id: number;
  number: number;
  title: string;
  statement: string;
  correctAnswer?: string;
  explanation?: string;
}

interface MatchState {
  matchId: string;
  status: 'ACTIVE' | 'COMPLETED';
  secondsLeft: number;
  roundExpiresAt: number;
  tasks: PvpTaskDto[];
  self: {
    userId: string;
    userName: string;
    solvedCount: number;
    answers: Record<number, string>;
  };
  opponent: {
    userId: string;
    userName: string;
    solvedCount: number;
    currentTaskNum: number;
  };
  isWinner: boolean;
  isDraw: boolean;
  winnerId?: string | null;
  xpAwarded?: number;
  newLevel?: number;
  newXp?: number;
}

export const PvPArenaPage: React.FC = () => {
  const { addToast } = useToastStore();

  const [phase, setPhase] = useState<'LOBBY' | 'SEARCHING' | 'DUEL' | 'FINISHED'>('LOBBY');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);

  // Текущая задача игрока
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number>(0);
  const [inputAnswer, setInputAnswer] = useState<string>('');
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);
  const [queueWaitSeconds, setQueueWaitSeconds] = useState<number>(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (queueIntervalRef.current) clearInterval(queueIntervalRef.current);
    };
  }, []);

  // 1. Поиск соперника (Matchmaking)
  const handleStartSearch = async () => {
    setPhase('SEARCHING');
    setQueueWaitSeconds(0);
    setMatchId(null);
    setMatch(null);
    setCurrentTaskIndex(0);
    setInputAnswer('');

    // Секундомер очереди
    queueIntervalRef.current = setInterval(() => {
      setQueueWaitSeconds((prev) => prev + 1);
    }, 1000);

    // Поллинг очереди каждые 1.2 сек
    const checkQueue = async () => {
      try {
        const res = await api.joinPvpQueue();
        if (res.status === 'MATCH_FOUND' && res.matchId) {
          if (queueIntervalRef.current) clearInterval(queueIntervalRef.current);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          setMatchId(res.matchId);
          setPhase('DUEL');
          addToast('success', '[ СОПЕРНИК НАЙДЕН // ДУЭЛЬ НАЧИНАЕТСЯ! ]');
          startMatchTelemetry(res.matchId);
        }
      } catch (e) {
        console.warn('Queue polling error:', e);
      }
    };

    await checkQueue();
    pollIntervalRef.current = setInterval(checkQueue, 1200);
  };

  const handleCancelSearch = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (queueIntervalRef.current) clearInterval(queueIntervalRef.current);
    try {
      await api.leavePvpQueue();
    } catch {
      /* noop */
    }
    setPhase('LOBBY');
    addToast('info', 'Поиск соперника отменен');
  };

  // 2. Телеметрия дуэли (опрос статуса матча и соперника)
  const startMatchTelemetry = (activeId: string) => {
    const fetchMatch = async () => {
      try {
        const data = await api.getPvpMatch(activeId);
        setMatch(data);

        // Если матч завершился
        if (data.status === 'COMPLETED') {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setPhase('FINISHED');

          // Синхронизируем XP в глобальном сторе
          if (typeof data.newXp === 'number' && typeof data.newLevel === 'number') {
            useAuthStore.getState().updateUserXp(data.newXp, data.newLevel);
          }

          if (data.isWinner) {
            addToast('success', '[ ПОБЕДА В BATTLEGROUND // +30 XP НАЧИСЛЕНО ]');
          } else if (data.isDraw) {
            addToast('info', '[ НИЧЬЯ // БОЕВОЙ ПАРИТЕТ ]');
          } else {
            addToast('error', '[ ПОРАЖЕНИЕ // ИЗУЧИТЕ РАЗБОР ОШИБОК ]');
          }
        }
      } catch (e) {
        console.warn('Match telemetry poll error:', e);
      }
    };

    fetchMatch();
    timerIntervalRef.current = setInterval(fetchMatch, 1000);
  };

  // 3. Отправка ответа на текущую задачу
  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchId || !inputAnswer.trim() || submittingAnswer || !match) return;

    setSubmittingAnswer(true);
    try {
      const res = await api.submitPvpAnswer(matchId, currentTaskIndex, inputAnswer.trim());
      if (res.isCorrect) {
        addToast('success', `[ ЗАДАЧА №${currentTaskIndex + 1} ВЕРНО! ]`);
        setInputAnswer('');
        if (currentTaskIndex + 1 < match.tasks.length) {
          setCurrentTaskIndex((prev) => prev + 1);
        }
        // Если все задачи решены — мгновенно опрашиваем матч для фиксации победы без ожидания таймера
        if (res.allSolved) {
          api.getPvpMatch(matchId).then((data) => {
            setMatch(data);
            if (data.status === 'COMPLETED') {
              if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
              setPhase('FINISHED');
              if (typeof data.newXp === 'number' && typeof data.newLevel === 'number') {
                useAuthStore.getState().updateUserXp(data.newXp, data.newLevel);
              }
              if (data.isWinner) {
                addToast('success', '[ ПОБЕДА В BATTLEGROUND // +30 XP НАЧИСЛЕНО ]');
              }
            }
          }).catch(() => null);
        }
      } else {
        addToast('error', '[ НЕВЕРНЫЙ ОТВЕТ // ПЕРЕСЧИТАЙТЕ ]');
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка отправки ответа');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // =========================================================================
  // ЭКРАН 1: ПРЕДСТАРТОВОЕ ЛОББИ АРЕНЫ
  // =========================================================================
  if (phase === 'LOBBY' || phase === 'SEARCHING') {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Шапка Арены */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <p className="hud-tag mb-2">[ PVP // BATTLEGROUND ]</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white uppercase md:text-5xl">
              BATTLEGROUND
            </h1>
            <p className="mt-1 text-xs md:text-sm text-zinc-400 font-light max-w-xl leading-relaxed">
              Молниеносная дуэль 1 на 1 против реальных абитуриентов. Одинаковый пак из 3 быстрых задач КИМ.
              90 секунд на раунд. Победитель забирает +30 XP и укрепляет лидерство в рейтинге!
            </p>
          </div>

          <div className="flex items-center gap-2 border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-3 py-2 font-mono text-xs">
            <Zap className="w-4 h-4 text-[#d4ff00]" />
            <span className="text-zinc-300">НАГРАДА:</span>
            <span className="font-bold text-[#d4ff00]">+30 XP</span>
          </div>
        </div>

        {/* Инфо-карточки регламента дуэли */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card-shelf p-4 bg-zinc-950/70 space-y-1.5 border-l-2 border-l-[#d4ff00]">
            <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase">
              <Timer className="w-4 h-4 text-[#d4ff00]" />
              Таймер 90 секунд
            </div>
            <p className="text-xs text-zinc-400 font-light leading-relaxed">
              Фиксированный таймер дуэли. Решайте быстрее соперника, каждая секунда влияет на распределение мест при ничьей.
            </p>
          </div>

          <div className="card-shelf p-4 bg-zinc-950/70 space-y-1.5 border-l-2 border-l-cyan-400">
            <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              Пак из 3 задач КИМ
            </div>
            <p className="text-xs text-zinc-400 font-light leading-relaxed">
              Оба участника получают синхронные идентичные прототипы тестовой части (уравнения, планиметрия, тервер).
            </p>
          </div>

          <div className="card-shelf p-4 bg-zinc-950/70 space-y-1.5 border-l-2 border-l-amber-400">
            <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase">
              <Flame className="w-4 h-4 text-amber-400" />
              Живая телеметрия
            </div>
            <p className="text-xs text-zinc-400 font-light leading-relaxed">
              Сверху отображается полоса соперника в реальном времени: видно, какую задачу он решает прямо сейчас.
            </p>
          </div>
        </div>

        {/* Зона Matchmaking поиска */}
        <div className="card-shelf p-6 md:p-8 text-center border border-white/10 space-y-5 bg-zinc-950/90 relative overflow-hidden">
          <div className="max-w-md mx-auto space-y-4">
            <div className="inline-flex p-3.5 border border-white/10 bg-black">
              <Swords className="w-8 h-8 text-[#d4ff00]" />
            </div>

            {phase === 'SEARCHING' ? (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-center gap-2 font-mono text-xs md:text-sm text-[#d4ff00] font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>[ ПОИСК СОПЕРНИКА В СЕТИ // {queueWaitSeconds} сек ]</span>
                </div>
                <p className="text-xs text-zinc-400 font-mono">
                  Подбираем равного по уровню оппонента из пула абитуриентов...
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCancelSearch}
                    className="btn-ghost text-xs font-mono uppercase tracking-wider rounded-none px-4 py-2"
                  >
                    [ ОТМЕНИТЬ ПОИСК ]
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg md:text-xl font-display font-extrabold text-white uppercase tracking-tight">
                  ГОТОВЫ К СХВАТКЕ В BATTLEGROUND?
                </h2>
                <p className="text-xs text-zinc-400 font-light leading-relaxed max-w-sm mx-auto">
                  Нажмите кнопку ниже, чтобы войти в глобальную очередь матчмейкинга платформы EGE.SYSTEM.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartSearch}
                    className="btn-lime !py-3 !px-8 text-xs md:text-sm font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(212,255,0,0.3)] hover:shadow-[0_0_30px_rgba(212,255,0,0.5)] transition-all rounded-none"
                  >
                    [ НАЙТИ СОПЕРНИКА // ПОИСК БОЯ ]
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ЭКРАН 2: АКТИВНАЯ ДУЭЛЬ (DUEL)
  // =========================================================================
  if (phase === 'DUEL' && match) {
    const activeTask = match.tasks[currentTaskIndex] || match.tasks[0];
    const isFinishedSelf = match.self.solvedCount >= 3;

    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* ВЕРХНЯЯ ПОЛОСА ТЕЛЕМЕТРИИ ДУЭЛИ: ВЫ VS СОПЕРНИК И ТАЙМЕР */}
        <div className="card-shelf p-5 md:p-6 border border-white/10 bg-zinc-950 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 bg-red-500 animate-ping" />
              <span className="font-mono text-xs font-bold text-white tracking-widest uppercase">
                [ PVP_DUEL // РАУНД 90 СЕКУНД ]
              </span>
            </div>

            {/* Таймер раунда */}
            <div
              className={`flex items-center gap-2 px-3 py-1 font-mono text-base md:text-xl font-bold border ${
                match.secondsLeft < 20
                  ? 'border-red-500/60 bg-red-500/15 text-red-400 animate-pulse'
                  : 'border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00]'
              }`}
            >
              <Timer className="w-4 h-4 shrink-0" />
              <span>{match.secondsLeft} сек</span>
            </div>
          </div>

          {/* ПОЛОСЫ ПРОГРЕССА ОБОИХ ИГРОКОВ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ВЫ */}
            <div className="p-3 bg-zinc-900/60 border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-[#d4ff00] font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#d4ff00]" />
                  ВЫ: {match.self.userName}
                </span>
                <span className="text-zinc-400">{match.self.solvedCount} / 3 решено</span>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((idx) => {
                  const isDone = match.self.solvedCount > idx;
                  const isCur = currentTaskIndex === idx && !isDone;
                  return (
                    <div
                      key={idx}
                      className={`h-2 flex-1 transition-all ${
                        isDone
                          ? 'bg-[#d4ff00]'
                          : isCur
                          ? 'bg-[#d4ff00]/40 animate-pulse'
                          : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* СОПЕРНИК */}
            <div className="p-3 bg-zinc-900/60 border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-cyan-400" />
                  СОПЕРНИК: {match.opponent.userName}
                </span>
                <span className="text-zinc-400">
                  {match.opponent.solvedCount >= 3
                    ? 'ВСЕ РЕШИЛ ✓'
                    : `Решает задачу №${match.opponent.currentTaskNum}`}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((idx) => {
                  const isDone = match.opponent.solvedCount > idx;
                  const isCur = match.opponent.currentTaskNum === idx + 1 && !isDone;
                  return (
                    <div
                      key={idx}
                      className={`h-2 flex-1 transition-all ${
                        isDone
                          ? 'bg-cyan-400'
                          : isCur
                          ? 'bg-cyan-400/40 animate-pulse'
                          : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* АКТИВНАЯ ЗАДАЧА И ПОЛЕ ВВОДА */}
        {isFinishedSelf ? (
          <div className="card-shelf p-8 text-center space-y-4 border border-[#d4ff00]/60">
            <CheckCircle2 className="w-12 h-12 text-[#d4ff00] mx-auto animate-bounce" />
            <h2 className="text-2xl font-display font-black text-white uppercase">
              ВЫ РЕШИЛИ ВСЕ 3 ЗАДАЧИ!
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Ожидаем завершения раунда соперником... Секунды зафиксированы в протоколе.
            </p>
          </div>
        ) : (
          <div className="card-shelf p-5 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-[#d4ff00]/10 border border-[#d4ff00]/40 font-mono text-xs text-[#d4ff00] font-bold">
                  ЗАДАЧА {currentTaskIndex + 1} ИЗ 3
                </span>
                <h3 className="font-display text-sm md:text-base font-bold text-white uppercase">
                  {activeTask.title} (КИМ №{activeTask.number})
                </h3>
              </div>

              {/* Навигация по задачам */}
              <div className="flex gap-1.5">
                {match.tasks.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentTaskIndex(i)}
                    className={`px-3 py-1 font-mono text-xs uppercase border rounded-none transition-all ${
                      currentTaskIndex === i
                        ? 'border-[#d4ff00] bg-[#d4ff00]/15 text-[#d4ff00] font-bold'
                        : match.self.solvedCount > i
                        ? 'border-green-500/40 text-green-400'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    #{i + 1} {match.self.solvedCount > i ? '✓' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Текст задачи */}
            <div className="bg-black/50 p-4 border border-white/[0.06] text-xs md:text-sm text-zinc-100 font-light leading-relaxed">
              <LatexText content={activeTask.statement} />
            </div>

            {/* Поле быстрого числового ввода */}
            <form onSubmit={handleSubmitAnswer} className="space-y-3">
              <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block">
                Введите числовой ответ задачи:
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  autoFocus
                  value={inputAnswer}
                  onChange={(e) => setInputAnswer(e.target.value.replace(/[^0-9.,-]/g, ''))}
                  placeholder="Ответ (целое число или десятичная дробь)..."
                  className="field flex-1 text-sm md:text-base font-mono font-bold tracking-wider rounded-none bg-black border-white/20 focus:border-[#d4ff00] py-2.5 px-3"
                />
                <button
                  type="submit"
                  disabled={submittingAnswer || !inputAnswer.trim()}
                  className="btn-lime !py-2.5 !px-6 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-none disabled:opacity-50"
                >
                  {submittingAnswer ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>[ ОТВЕТИТЬ // ENTER ]</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // ЭКРАН 3: ФИНАЛ ДУЭЛИ И РАЗБОР ОШИБОК (FINISHED)
  // =========================================================================
  if (phase === 'FINISHED' && match) {
    const isWinner = match.isWinner;
    const isDraw = match.isDraw;

    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* ИТОГОВЫЙ БАННЕР ПОБЕДЫ / ПОРАЖЕНИЯ */}
        <div
          className={`card-shelf p-6 md:p-8 border rounded-none space-y-6 ${
            isWinner
              ? 'border-[#d4ff00] bg-[#d4ff00]/[0.08] shadow-[0_0_25px_rgba(212,255,0,0.2)]'
              : isDraw
              ? 'border-amber-500/60 bg-amber-950/20'
              : 'border-red-500/60 bg-red-950/20'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
            <div className="space-y-1">
              <span
                className={`font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${
                  isWinner ? 'text-[#d4ff00]' : isDraw ? 'text-amber-400' : 'text-red-400'
                }`}
              >
                {isWinner ? (
                  <Award className="w-5 h-5 text-[#d4ff00]" />
                ) : isDraw ? (
                  <Zap className="w-5 h-5 text-amber-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                ИТОГ BATTLEGROUND
              </span>
              <h2 className="text-2xl md:text-3xl font-display font-black text-white uppercase tracking-tight">
                {isWinner
                  ? '[ ПОБЕДА // ТЫ В ТОПЕ РЕЙТИНГА! ]'
                  : isDraw
                  ? '[ БОЕВАЯ НИЧЬЯ // РАВНЫЙ СЧЕТ ]'
                  : '[ ПОРАЖЕНИЕ // РАЗБЕРИТЕ ОШИБКИ ]'}
              </h2>
              <p className="font-mono text-xs text-zinc-400">
                Счет дуэли: Вы {match.self.solvedCount} — {match.opponent.solvedCount} Соперник ({match.opponent.userName})
              </p>
            </div>

            {/* Начисление XP */}
            {isWinner && (
              <div className="text-right">
                <span className="font-mono text-[10px] text-zinc-400 uppercase block">НАЧИСЛЕНИЕ НАГРАДЫ:</span>
                <span className="text-4xl md:text-5xl font-display font-black text-[#d4ff00]">
                  +30 XP
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="font-mono text-xs text-zinc-400">
              {isWinner
                ? 'Отличная работа! Победа зафиксирована в протоколе турнира. Ниже представлен подробный математический разбор всех 3 задач.'
                : isDraw
                ? 'Боевая ничья! Отличный темп решения. Ниже представлен подробный математический разбор всех 3 задач.'
                : 'Поражение — не повод унывать. Ниже представлен подробный математический разбор всех 3 задач.'}
            </span>
            <button
              type="button"
              onClick={handleStartSearch}
              className="btn-lime text-xs md:text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2 rounded-none"
            >
              <Swords className="w-4 h-4" />
              <span>[ СЛЕДУЮЩИЙ МАТЧ // BATTLEGROUND ]</span>
            </button>
          </div>
        </div>

        {/* ПОДРОБНЫЙ РАЗБОР ВСЕХ 3 ЗАДАЧ ДУЭЛИ */}
        <div className="card-shelf p-6 space-y-6">
          <div className="border-b border-white/[0.08] pb-3">
            <span className="font-mono text-xs text-[#d4ff00] font-bold uppercase tracking-wider block">
              РАЗБОР ЗАДАЧ BATTLEGROUND
            </span>
            <h3 className="text-lg font-display font-bold text-white uppercase mt-0.5">
              Правильные числовые ответы и алгоритмы решений ФИПИ
            </h3>
          </div>

          <div className="space-y-5">
            {match.tasks.map((task, idx) => {
              const myAnswer = match.self.answers[idx];
              const isCorrect = myAnswer?.trim() === task.correctAnswer?.trim();

              return (
                <div key={task.id} className="p-4 bg-zinc-950 border border-white/[0.08] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2 font-mono text-xs">
                    <span className="font-bold text-white uppercase">
                      ЗАДАЧА №{idx + 1}: {task.title} (КИМ №{task.number})
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400">Ваш ответ: <strong className={isCorrect ? 'text-green-400' : 'text-red-400'}>{myAnswer || '—'}</strong></span>
                      <span>•</span>
                      <span className="text-zinc-400">Эталон: <strong className="text-[#d4ff00]">{task.correctAnswer}</strong></span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-300 font-light leading-relaxed">
                    <LatexText content={task.statement} />
                  </div>

                  {task.explanation && (
                    <div className="mt-2 p-3 bg-black/60 border border-white/[0.06] text-xs font-mono text-zinc-300">
                      <span className="text-[#d4ff00] font-bold block mb-1">АЛГОРИТМ РЕШЕНИЯ:</span>
                      <LatexText content={task.explanation} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PvPArenaPage;
