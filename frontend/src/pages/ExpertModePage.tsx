import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { errText } from '../lib/errors';
import { LatexText } from '../components/LatexText';
import {
  ShieldAlert,
  Award,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Layers,
  Flame,
  Check,
} from 'lucide-react';

interface ExpertStep {
  stepNumber: number;
  title: string;
  content: string;
}

interface ScenarioItem {
  id: string;
  subject: string;
  level: 1 | 2 | 3;
  taskNumber: string;
  taskTitle: string;
  condition: string;
  steps: ExpertStep[];
  criterionOptions: string[];
  xpReward: number;
}

interface VerificationResult {
  success: boolean;
  isStepCorrect: boolean;
  isCriterionCorrect: boolean;
  correctErrorStep: number;
  correctCriterionIndex: number;
  xpAwarded: number;
  newXp?: number;
  newLevel?: number;
  fipiOfficialVerdict: {
    score: number;
    maxScore: number;
    primaryCriteria: string;
    verdictText: string;
    recommendation: string;
  };
}

const LEVEL_CONFIGS = [
  {
    level: 1,
    title: '[ УРОВЕНЬ 1: Легкий ]',
    subtitle: 'Арифметические ошибки, потеря знака при переносе',
    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  {
    level: 2,
    title: '[ УРОВЕНЬ 2: Средний ]',
    subtitle: 'Критериальные ловушки (деление на ноль, ОДЗ, отбор на круге)',
    color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
  {
    level: 3,
    title: '[ УРОВЕНЬ 3: Сложный ]',
    subtitle: 'Параметры (№18), теория чисел (№19), равносильность переходов',
    color: 'text-red-400 border-red-500/40 bg-red-500/10',
  },
];

export const ExpertModePage: React.FC = () => {
  const { addToast } = useToastStore();

  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3>(1);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Выбор ученика
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedCriterion, setSelectedCriterion] = useState<number | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // Игровая статистика
  const [sessionXp, setSessionXp] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [solvedCount, setSolvedCount] = useState<number>(0);

  useEffect(() => {
    loadScenarios(selectedLevel);
  }, [selectedLevel]);

  const loadScenarios = async (lvl: 1 | 2 | 3) => {
    setLoading(true);
    setResult(null);
    setSelectedStep(null);
    setSelectedCriterion(null);
    try {
      const res = await api.getExpertScenarios({ level: lvl });
      setScenarios(res.scenarios || []);
      setCurrentIndex(0);
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка загрузки протоколов эксперта');
    } finally {
      setLoading(false);
    }
  };

  const currentScenario = scenarios[currentIndex] || null;

  const handleVerify = async () => {
    if (!currentScenario || selectedStep === null || selectedCriterion === null) {
      addToast('error', 'Выберите шаг решения с ошибкой и укажите критериальное обоснование');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.verifyExpertSolution({
        scenarioId: currentScenario.id,
        selectedStep,
        selectedCriterionIndex: selectedCriterion,
      });

      setResult(res);

      if (res.success) {
        setSessionXp((prev) => prev + res.xpAwarded);
        setStreak((prev) => prev + 1);
        setSolvedCount((prev) => prev + 1);
        if (typeof res.newXp === 'number' && typeof res.newLevel === 'number') {
          useAuthStore.getState().updateUserXp(res.newXp, res.newLevel);
        }
        addToast('success', `[ ВЕРДИКТ ВЕРЕН // +${res.xpAwarded} XP ЗАЧИСЛЕНО ]`);
      } else {
        setStreak(0);
        addToast('error', '[ ОШИБКА ВЕРДИКТА // ИЗУЧИТЕ РАЗБОР ФИПИ ]');
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка проверки экспертного протокола');
    } finally {
      setVerifying(false);
    }
  };

  const handleNext = () => {
    setResult(null);
    setSelectedStep(null);
    setSelectedCriterion(null);
    if (currentIndex + 1 < scenarios.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(0);
      addToast('info', 'Все протоколы данного уровня пройдены! Попробуйте следующий уровень сложности.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* HUD-шапка режима EXPERT SIMULATOR */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <p className="hud-tag mb-2">[ FIPI // EXPERT_SIMULATOR ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white uppercase md:text-5xl">
            EXPERT SIMULATOR
          </h1>
          <p className="mt-1 text-xs md:text-sm text-zinc-400 font-light max-w-xl leading-relaxed">
            Проверяйте решения КИМ со стороны старшего эксперта предметной комиссии. Ловите математические ловушки и получайте XP!
          </p>
        </div>

        {/* HUD-счетчики сессии */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-3 py-1.5 flex items-center gap-2">
            <Award className="w-4 h-4 text-[#d4ff00]" />
            <span className="text-zinc-300">XP:</span>
            <span className="font-bold text-[#d4ff00]">+{sessionXp}</span>
          </div>
          <div className="border border-white/10 bg-zinc-900/60 px-3 py-1.5 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-zinc-300">СЕРИЯ:</span>
            <span className="font-bold text-amber-400">{streak}</span>
          </div>
          <div className="border border-white/10 bg-zinc-900/60 px-3 py-1.5 flex items-center gap-2 hidden sm:flex">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-zinc-300">ВЕРДИКТОВ:</span>
            <span className="font-bold text-white">{solvedCount}</span>
          </div>
        </div>
      </div>

      {/* Выбор уровня сложности */}
      <div className="space-y-2">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] block">
          ВЫБОР КАТЕГОРИИ СЛОЖНОСТИ ЭКСПЕРТИЗЫ:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {LEVEL_CONFIGS.map((cfg) => {
            const isSelected = selectedLevel === cfg.level;
            return (
              <button
                key={cfg.level}
                type="button"
                onClick={() => setSelectedLevel(cfg.level as 1 | 2 | 3)}
                className={`p-3.5 text-left border rounded-none transition-all ${
                  isSelected
                    ? `${cfg.color} border-current ring-1 ring-current font-bold bg-[#d4ff00]/[0.05]`
                    : 'border-white/10 bg-zinc-900/40 text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="font-mono text-xs uppercase tracking-wider font-bold">{cfg.title}</div>
                <div className="font-sans text-[11px] font-light mt-1 text-zinc-400 leading-snug">
                  {cfg.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Основная карточка протокола задачи */}
      {loading ? (
        <div className="card-shelf p-12 text-center font-mono text-xs text-zinc-500 animate-pulse">
          [ ЗАГРУЗКА ЭКСПЕРТНОГО ПРОТОКОЛА ФИПИ... ]
        </div>
      ) : !currentScenario ? (
        <div className="card-shelf p-8 text-center space-y-3">
          <p className="text-sm text-zinc-400 font-mono">Протоколы по выбранным критериям не найдены.</p>
          <button onClick={() => loadScenarios(selectedLevel)} className="btn-lime text-xs">
            [ ОБНОВИТЬ БАЗУ ]
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Условие задачи */}
          <div className="card-shelf p-5 md:p-6 space-y-3 border-l-2 border-l-[#d4ff00]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 border border-[#d4ff00]/40 bg-[#d4ff00]/10 font-mono text-xs text-[#d4ff00] font-bold">
                  {currentScenario.taskNumber}
                </span>
                <h3 className="font-display text-sm md:text-base font-bold text-white uppercase">
                  {currentScenario.taskTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
                <span>ПРОТОКОЛ {currentIndex + 1} ИЗ {scenarios.length}</span>
                <span>•</span>
                <span className="text-[#d4ff00]">+{currentScenario.xpReward} XP</span>
              </div>
            </div>

            <div className="text-sm font-light leading-relaxed text-zinc-200">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">Условие задания:</span>
              <div className="bg-black/40 p-3.5 border border-white/[0.06] text-xs md:text-sm">
                <LatexText content={currentScenario.condition} />
              </div>
            </div>
          </div>

          {/* Пошаговое решение на экспертизу */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#d4ff00]" />
                КЛИКНИТЕ НА ШАГ С ДОПУЩЕННОЙ ОШИБКОЙ:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedStep(0);
                  setSelectedCriterion(null);
                }}
                className={`px-3 py-1 font-mono text-xs uppercase border rounded-none transition-all ${
                  selectedStep === 0
                    ? 'border-[#d4ff00] bg-[#d4ff00]/15 text-[#d4ff00] font-bold'
                    : 'border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                [ В РЕШЕНИИ НЕТ ОШИБОК // 2/2 БАЛЛА ]
              </button>
            </div>

            <div className="space-y-3">
              {currentScenario.steps.map((st) => {
                const isSelected = selectedStep === st.stepNumber;
                return (
                  <div
                    key={st.stepNumber}
                    onClick={() => {
                      if (!result) {
                        setSelectedStep(st.stepNumber);
                        setSelectedCriterion(null);
                      }
                    }}
                    className={`p-4 border rounded-none cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#d4ff00] bg-[#d4ff00]/[0.08] shadow-[0_0_15px_rgba(212,255,0,0.15)] ring-1 ring-[#d4ff00]'
                        : 'border-white/[0.08] bg-zinc-950/70 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
                      <span className={`font-bold uppercase ${isSelected ? 'text-[#d4ff00]' : 'text-zinc-300'}`}>
                        {st.title}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] text-[#d4ff00] font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> ВЫБРАН КАК ОШИБОЧНЫЙ
                        </span>
                      )}
                    </div>
                    <div className="text-xs md:text-sm font-light text-zinc-300 leading-relaxed">
                      <LatexText content={st.content} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Выбор критериального обоснования */}
          {selectedStep !== null && (
            <div className="card-shelf p-4 md:p-5 space-y-4 border border-[#d4ff00]/30 animate-in fade-in duration-150">
              <span className="font-mono text-xs text-[#d4ff00] uppercase font-bold tracking-wider block">
                {selectedStep === 0
                  ? 'ПОДТВЕРДИТЕ ОБОСНОВАНИЕ ЭТАЛОНА:'
                  : `ВЫБЕРИТЕ КРИТЕРИАЛЬНУЮ ПРИЧИНУ ОШИБКИ В ШАГЕ ${selectedStep}:`}
              </span>

              <div className="space-y-2">
                {currentScenario.criterionOptions.map((opt, idx) => {
                  const isChecked = selectedCriterion === idx;
                  return (
                    <label
                      key={idx}
                      onClick={() => !result && setSelectedCriterion(idx)}
                      className={`flex items-start gap-3 p-3 border rounded-none cursor-pointer transition-all ${
                        isChecked
                          ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white font-medium'
                          : 'border-white/[0.08] bg-zinc-900/30 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="criterion"
                        checked={isChecked}
                        onChange={() => setSelectedCriterion(idx)}
                        disabled={!!result}
                        className="mt-0.5 accent-[#d4ff00]"
                      />
                      <span className="text-xs leading-relaxed font-sans">{opt}</span>
                    </label>
                  );
                })}
              </div>

              {!result && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying || selectedCriterion === null}
                    className="btn-lime w-full sm:w-auto text-xs md:text-sm !py-2.5 !px-6 flex items-center justify-center gap-2 uppercase tracking-wider font-bold disabled:opacity-50 rounded-none"
                  >
                    {verifying ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                    [ ВЫНЕСТИ ВЕРДИКТ ЭКСПЕРТА ]
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Итоговый официальный вердикт ФИПИ */}
          {result && (
            <div
              className={`p-5 md:p-6 border rounded-none space-y-4 animate-in slide-in-from-bottom duration-200 ${
                result.success
                  ? 'border-green-500/60 bg-green-950/20'
                  : 'border-red-500/60 bg-red-950/20'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <h3
                    className={`font-mono text-xs md:text-sm font-bold uppercase tracking-wider ${
                      result.success ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {result.success
                      ? `[ ВЕРДИКТ ЭКСПЕРТА ВЕРЕН // +${result.xpAwarded} XP ]`
                      : '[ ОШИБКА ВЕРДИКТА // РАСХОЖДЕНИЕ С ФИПИ ]'}
                  </h3>
                </div>

                <span className="font-mono text-xs text-zinc-400">
                  ОЦЕНКА ФИПИ:{' '}
                  <strong className="text-white">
                    {result.fipiOfficialVerdict.score} из {result.fipiOfficialVerdict.maxScore} баллов
                  </strong>
                </span>
              </div>

              <div className="space-y-3 font-sans text-xs md:text-sm text-zinc-300 leading-relaxed">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                    ОФИЦИАЛЬНАЯ ВЫПИСКА КРИТЕРИЕВ:
                  </span>
                  <p className="font-mono text-xs text-[#d4ff00]">
                    {result.fipiOfficialVerdict.primaryCriteria}
                  </p>
                </div>

                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                    ЭКСПЕРТНОЕ РЕЗЮМЕ ПРОВЕРКИ:
                  </span>
                  <p className="bg-black/40 p-3 border border-white/[0.06] text-zinc-200 text-xs">
                    {result.fipiOfficialVerdict.verdictText}
                  </p>
                </div>

                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                    РЕКОМЕНДАЦИЯ ДЛЯ АПЕЛЛЯЦИИ / ОФОРМЛЕНИЯ:
                  </span>
                  <p className="text-zinc-400 text-xs">
                    {result.fipiOfficialVerdict.recommendation}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn-lime text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 !py-2 !px-4 rounded-none"
                >
                  <span>[ СЛЕДУЮЩИЙ ПРОТОКОЛ ]</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExpertModePage;
