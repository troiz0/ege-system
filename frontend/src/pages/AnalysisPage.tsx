import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { Brain, PlayCircle, AlertCircle, CalendarCheck, TrendingUp, Target, Lightbulb } from 'lucide-react';
import { errText } from '../lib/errors';

interface Analysis {
  pacingStatus: { status: string; explanation: string };
  priorityGaps: Array<{ subject: string; topic: string; criticality: string; reason: string }>;
  mockExamAnalysis: string;
  actionableRecommendations: Array<{ day: string; text: string }>;
  subjectReadiness: Array<{ subject: string; readinessPercent: number }>;
  demoMode?: boolean;
  notice?: string;
}

const criticalityColor: Record<string, string> = {
  high: 'bg-red-500/10 text-red-400 border border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  low: 'bg-zinc-800 text-zinc-400 border border-white/10',
  HIGH: 'bg-red-500/10 text-red-400 border border-red-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  LOW: 'bg-zinc-800 text-zinc-400 border border-white/10',
};

const criticalityLabel: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий',
};

export function AnalysisPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { addToast } = useToastStore();
  const { user } = useAuthStore();

  useEffect(() => {
    loadLatest();
  }, []);

  const loadLatest = async () => {
    try {
      const result = await api.getLatestAnalysis();
      setAnalysis(result.analysis);
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const result = await api.runAnalysis();
      setAnalysis(result.analysis);
      if (result.notice) {
        addToast('info', result.notice);
      } else {
        addToast('success', 'Анализ обновлён');
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка запуска анализа');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-tag mb-3">[ AI // DEEP SCAN ]</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
              ANALYTICS
            </h1>
            <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
              Темп подготовки, пробелы и рекомендации
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="btn-lime text-sm"
          >
            <PlayCircle className="h-5 w-5" />
            {running ? 'Анализируем...' : 'Запустить анализ'}
          </button>
        </div>

        {!analysis ? (
          <div className="card-shelf p-12 text-center">
            <Brain className="mx-auto mb-4 h-10 w-10 text-zinc-600" />
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-tight text-zinc-200">Анализ ещё не запускался</h2>
            <p className="mx-auto mb-6 max-w-md text-sm font-light text-zinc-500">
              Запустите анализ, чтобы получить оценку нагрузки, динамики пробников и план исправления пробелов
            </p>
            <button
              onClick={runAnalysis}
              disabled={running}
              className="btn-lime px-6 text-sm"
            >
              {running ? 'Анализируем...' : 'Запустить анализ'}
            </button>
          </div>
        ) : (
          <>
            {analysis.notice && (
              <div className="mb-6 flex items-start gap-3 rounded-none border border-amber-500/25 bg-amber-500/[0.07] p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                <p className="text-sm text-amber-200">{analysis.notice}</p>
              </div>
            )}

            <div className="mb-4">
              <div className="card-shelf p-6">
                <div className="mb-4 flex items-center gap-3">
                  <CalendarCheck className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">Темп подготовки</h2>
                  <span className="mono-chip ml-auto border-[#d4ff00]/30 text-[#d4ff00]">
                    {analysis.pacingStatus.status}
                  </span>
                </div>
                <p className="text-sm font-light leading-relaxed text-zinc-400">{analysis.pacingStatus.explanation}</p>
              </div>
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <div className="card-shelf p-6">
                <div className="mb-4 flex items-center gap-3">
                  <Target className="h-5 w-5 text-red-400" strokeWidth={1.5} />
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">Приоритетные пробелы</h2>
                </div>
                {analysis.priorityGaps.length === 0 ? (
                  <p className="text-sm font-light text-zinc-600">Критических пробелов не обнаружено</p>
                ) : (
                  <div className="space-y-3">
                    {analysis.priorityGaps.map((gap, index) => (
                      <div key={index} className="rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium text-zinc-200">{gap.topic}</span>
                          <span className={`inline-flex items-center rounded-none px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] ${criticalityColor[gap.criticality] || criticalityColor.medium}`}>
                            {criticalityLabel[gap.criticality] || 'Средний'}
                          </span>
                        </div>
                        <div className="mb-1 font-mono text-[11px] text-zinc-500">{gap.subject}</div>
                        <p className="text-sm font-light text-zinc-400">{gap.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-shelf p-6">
                <div className="mb-4 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
                  <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">Готовность по предметам</h2>
                </div>
                {analysis.subjectReadiness.length === 0 ? (
                  <p className="text-sm font-light text-zinc-600">Нет целевых предметов</p>
                ) : (
                  <div className="space-y-4">
                    {analysis.subjectReadiness.map((subject, index) => (
                      <div key={index}>
                        <div className="mb-1 flex justify-between font-mono text-xs">
                          <span className="text-zinc-300">{subject.subject}</span>
                          <span className="text-zinc-400">{subject.readinessPercent}%</span>
                        </div>
                        <div className="h-1 w-full bg-white/[0.06]">
                          <div
                            className={`h-1 transition-all ${
                              subject.readinessPercent >= 75
                                ? 'bg-[#d4ff00]'
                                : subject.readinessPercent >= 50
                                ? 'bg-amber-400'
                                : 'bg-red-400'
                            }`}
                            style={{ width: `${subject.readinessPercent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card-shelf mb-4 p-6">
              <div className="mb-4 flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">Разбор пробников</h2>
              </div>
              <p className="text-sm font-light leading-relaxed text-zinc-400">{analysis.mockExamAnalysis}</p>
            </div>

            <div className="card-shelf border-[#d4ff00]/20 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Lightbulb className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white">План на неделю</h2>
              </div>
              <div className="space-y-3">
                {analysis.actionableRecommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-4 rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                    <span className="min-w-[120px] font-mono text-xs text-[#d4ff00]">{rec.day}</span>
                    <span className="text-sm font-light text-zinc-300">{rec.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {user?.isDemo && (
              <p className="text-xs text-zinc-600 mt-4 text-center">Демо-режим: показаны примерные данные анализа</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
