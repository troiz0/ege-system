import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { Calendar, Clock, TrendingUp, AlertCircle, Target, Zap, Play, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DashboardSummary as DashboardData, AnalyticsTelemetry, Profile } from '../lib/types';
import { errText } from '../lib/errors';
import { MeshConnectBanner } from '../components/MeshConnectBanner';
import { ScorePredictorWidget } from '../components/ScorePredictorWidget';
import { FlashcardsWidget } from '../components/FlashcardsWidget';
import { ActivityHeatmapWidget } from '../components/ActivityHeatmapWidget';
import { DailySprintWidget } from '../components/DailySprintWidget';
import { ParentConsoleView } from '../components/ParentConsoleView';
import { ZeroStateOnboardingWizard } from '../components/ZeroStateOnboardingWizard';

const CARD =
  'min-w-0 rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-sm';
const ROW =
  'min-w-0 rounded-none border border-white/[0.06] bg-white/[0.015] p-3.5';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [telemetry, setTelemetry] = useState<AnalyticsTelemetry | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'student' | 'parent'>('student');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboard();

    const onTargetsUpdated = () => {
      api.getProfile().then(setProfile).catch(() => null);
      loadDashboard();
    };
    window.addEventListener('profile-target-subjects-updated', onTargetsUpdated);
    return () => {
      window.removeEventListener('profile-target-subjects-updated', onTargetsUpdated);
    };
  }, []);

  const loadDashboard = async () => {
    try {
      const [result, tel, prof] = await Promise.all([
        api.getDashboard(),
        api.getTelemetryPredictor().catch(() => null),
        api.getProfile().catch(() => null),
      ]);
      setData(result);
      if (tel) setTelemetry(tel);
      if (prof) setProfile(prof);

      // Проверка первого входа для Zero-State Onboarding
      try {
        const completed = localStorage.getItem('ege_onboarding_completed');
        if (!completed) {
          setIsOnboardingOpen(true);
        }
      } catch {
        /* noop */
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки дашборда');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPage />;
  if (!data) return null;

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden">
      <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-500 mb-2">
            [ SYS.LOC // 2027 — COMMAND DECK ]
          </p>
          <h1 className="break-words font-display text-4xl font-extrabold uppercase tracking-tight text-zinc-100 md:text-6xl">
            {viewMode === 'parent' ? 'PARENT DESK' : 'CONSOLE'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="rounded-none border border-white/15 bg-white/[0.03] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
            title="Перенастроить целевой трек и экспресс-срез"
          >
            [ ЦЕЛЬ / ЭКСПРЕСС-СРЕЗ ]
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'student' ? 'parent' : 'student')}
            className={`rounded-none border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] transition-all ${
              viewMode === 'parent'
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00]'
                : 'border-white/15 bg-white/[0.03] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white'
            }`}
          >
            {viewMode === 'student' ? '[ ВИД: РОДИТЕЛЬ ]' : '[ ВИД: УЧЕНИК ]'}
          </button>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-500 hidden sm:block">
            STATUS: OPTIMAL // LIVE
          </p>
        </div>
      </div>

      {viewMode === 'parent' ? (
        <ParentConsoleView data={data} onSwitchToStudent={() => setViewMode('student')} />
      ) : (
        <>
          {/* ДЕЙЛИ-СПРИНТ: 5-минутный квиз дня */}
          <div className="mb-6">
            <DailySprintWidget targetSubjects={profile?.targetSubjects?.map((t) => t.subjectName)} />
          </div>

          <MeshConnectBanner />

      {/* Баннер: симулятор экзамена */}
      <div className="mb-6 flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
            <Clock className="h-5 w-5 text-[#d4ff00]" />
          </div>
          <div className="min-w-0">
            <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 uppercase block mb-1">
              [ PRESSURE_SIMULATOR // REAL_TIME_COUNTDOWN ]
            </span>
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Симулятор экзамена
            </h2>
            <p className="mt-0.5 break-words font-sans text-xs font-light text-zinc-400">
              Полноэкранный режим со строгим бланком ответов №1 и критериальной оценкой эксперта ФИПИ для части 2.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/exam-pressure')}
          className="btn-lime shrink-0 px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Запустить симулятор
        </button>
      </div>

      {/* HUD АНАЛИТИКА: ПРЕДИКТОР БАЛЛА */}
      <div className="mb-6">
        <ScorePredictorWidget
          data={telemetry?.predictor}
          loading={loading && !telemetry}
        />
      </div>

      {/* ВИДЖЕТ: ПОВТОРЕНИЕ СЕГОДНЯ (SM-2 FLASHCARDS) */}
      <div className="mb-6">
        <FlashcardsWidget />
      </div>

      {/* ВИДЖЕТ: 90-ДНЕВНЫЙ HEATMAP И СТРИК ПОДГОТОВКИ */}
      <div className="mb-6">
        <ActivityHeatmapWidget activityTimeline={data?.activityTimeline} />
      </div>

      {/* Bento: счётчики */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <div className={CARD}>
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Calendar className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
              <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
                До ЕГЭ
              </h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 uppercase">T-MINUS</span>
          </div>
          <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-zinc-100">
            {data.daysUntilExam}
            <span className="ml-3 font-mono text-[10px] tracking-[0.25em] text-[#d4ff00]">
              DAYS
            </span>
          </div>
          <p className="mt-2 text-xs font-light text-zinc-400">
            Осталось {Math.floor(data.daysUntilExam / 7)} недель
          </p>
        </div>

        <div className={CARD}>
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Target className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
              <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
                Прогресс плана
              </h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 uppercase">
              PLAN // {data.planProgress}%
            </span>
          </div>
          <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-[#d4ff00]">
            {data.planProgress}%
          </div>
          <div className="mt-4 h-1 w-full bg-white/10">
            <div
              className="h-1 bg-[#d4ff00] transition-all"
              style={{ width: `${data.planProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bento: нагрузка + дедлайны + пробники */}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className={CARD}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Нагрузка сегодня
            </h2>
          </div>
          <div className="flex min-w-0 gap-8">
            <div className="min-w-0">
              <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-zinc-100">
                {data.todayLoad.lessons}
              </div>
              <p className="mt-1 text-xs font-light text-zinc-400">уроков</p>
            </div>
            <div className="min-w-0">
              <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-zinc-100">
                {data.todayLoad.hours}
              </div>
              <p className="mt-1 text-xs font-light text-zinc-400">часов</p>
            </div>
          </div>
          {data.todayLoad.lessonsList.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
              {data.todayLoad.lessonsList.slice(0, 5).map((l, i) => (
                <div key={i} className="flex min-w-0 items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                    {l.startTime}
                  </span>
                  <span className="min-w-0 truncate font-light text-zinc-300">
                    {l.subject}
                    {l.topic && <span className="text-zinc-500"> · {l.topic}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={CARD}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" strokeWidth={1.5} />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Горящие дедлайны
            </h2>
          </div>
          <div className="min-w-0 space-y-2">
            {data.upcomingDeadlines.length === 0 ? (
              <p className="text-xs font-light text-zinc-500">Нет горящих дедлайнов</p>
            ) : (
              data.upcomingDeadlines.slice(0, 3).map((deadline) => (
                <div key={deadline.id} className={`${ROW} flex items-start justify-between gap-3`}>
                  <div className="min-w-0">
                    <div className="break-words text-xs font-medium text-zinc-200">{deadline.title}</div>
                    <div className="mt-0.5 break-words text-[11px] font-light text-zinc-400">
                      {deadline.subject}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[10px] tracking-wider text-red-400">
                    {format(new Date(deadline.deadline), 'd MMM', { locale: ru })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${CARD} md:col-span-2 lg:col-span-1`}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <TrendingUp className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Пробники vs Цель
            </h2>
          </div>
          <div className="flex min-w-0 items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-light text-zinc-400">Средний балл</div>
              <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-zinc-100">
                {data.mockExamAverage.average}
              </div>
            </div>
            <div className="shrink-0 font-display text-2xl text-zinc-600">/</div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-light text-zinc-400">Целевой балл</div>
              <div className="font-display text-3xl md:text-4xl font-semibold tracking-normal text-[#d4ff00]">
                {data.mockExamAverage.target}
              </div>
            </div>
          </div>
          <div className="mt-4">
            {(() => {
              const { average, target, count } = data.mockExamAverage;
              if (count <= 0) {
                return <div className="text-xs font-light text-zinc-500">Нет пробников</div>;
              }
              if (target <= 0) {
                return <div className="text-xs font-light text-zinc-500">Задайте цель в профиле</div>;
              }
              if (average >= target) {
                return (
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#d4ff00] tracking-wider">
                    <Check className="h-3.5 w-3.5" /> [ ЦЕЛЬ ДОСТИГНУТА ]
                  </div>
                );
              }
              return (
                <div className="text-xs font-light text-zinc-400">
                  До цели: {target - average} баллов
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Bento: критические пробелы */}
      <div className={`${CARD} mt-4`}>
        <div className="mb-4 flex min-w-0 items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" strokeWidth={1.5} />
          <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
            Критические пробелы
          </h2>
        </div>
        {data.criticalGaps.length === 0 ? (
          <p className="text-xs font-light text-zinc-500">Критических пробелов не обнаружено</p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.criticalGaps.slice(0, 3).map((gap, index) => (
              <div key={index} className={`${ROW} min-w-0 !border-red-500/20 !bg-red-500/[0.04]`}>
                <div className="mb-1 break-words font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                  {gap.subject}
                </div>
                <div className="mb-3 break-words text-xs font-medium text-zinc-100">{gap.topic}</div>
                <button
                  onClick={() => navigate('/materials')}
                  className="font-mono text-[11px] text-[#d4ff00] hover:underline tracking-wider"
                >
                  Изучить материалы →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bento: ближайшее занятие */}
      {data.nextPlanSlot && (
        <div className={`${CARD} mt-4`}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <Zap className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Ближайшее занятие
            </h2>
          </div>
          <div className={`${ROW} flex min-w-0 flex-wrap items-center justify-between gap-3`}>
            <div className="min-w-0">
              <div className="mb-1 break-words font-sans text-base font-semibold text-zinc-100">
                {data.nextPlanSlot.topic}
              </div>
              <div className="break-words text-xs font-light text-zinc-400">
                {data.nextPlanSlot.subject} • {data.nextPlanSlot.duration} минут
              </div>
            </div>
            <div className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-zinc-400">
              {format(new Date(data.nextPlanSlot.date), 'd MMMM', { locale: ru })}
            </div>
          </div>
        </div>
      )}

      {/* Bento: AI-советы */}
      {data.aiAdvice.length > 0 && (
        <div className={`${CARD} mt-4 !border-[#d4ff00]/25 !bg-[#d4ff00]/[0.03]`}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <Zap className="h-5 w-5 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-zinc-100">
              Советы AI
            </h2>
          </div>
          <ul className="min-w-0 space-y-2">
            {data.aiAdvice.map((advice, index) => (
              <li key={index} className={`${ROW} flex min-w-0 items-start gap-2.5 text-zinc-300`}>
                <span className="mt-0.5 shrink-0 text-[#d4ff00] font-mono text-xs">•</span>
                <span className="min-w-0 break-words text-xs md:text-sm font-light leading-relaxed">{advice}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}

      <ZeroStateOnboardingWizard
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
