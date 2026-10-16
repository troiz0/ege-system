import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import { FipiSolutionChecker } from '../components/FipiSolutionChecker';
import {
  Send,
  ArrowLeft,
  Upload,
  X,
  Eye,
  FileText,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  Edit3,
  Play,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Award,
  XCircle,
  Printer,
  RotateCcw,
  Calculator,
  Atom,
  Binary,
  Scale,
  Landmark,
  FlaskConical,
  Dna,
  Compass,
  Languages,
  Hash,
} from 'lucide-react';
import { KIMTaskCard } from '../components/KIMTaskCard';
import { ExamPacingAssistant, PacingReport } from '../components/ExamPacingAssistant';
import { ExamRetestModal } from '../components/ExamRetestModal';
import { ExamTimer, formatTimer } from '../components/ExamTimer';
import type {
  ExamVariant,
  ExamTaskItem,
  TargetSubject,
  MockExam,
  ExamSimulation,
} from '../lib/types';
import { findSubjectConfig, EGE_SUBJECTS } from '../lib/subjects';
import { buildPacingPlan } from '../lib/examPacing';
import { printBlanks, printVariant } from '../lib/examPrint';

type ExamPhase = 'LOBBY' | 'EXAM' | 'FINISHED';

function getSubjectIcon(subjectId: string, className = "w-5 h-5 text-[#d4ff00]") {
  const id = subjectId.toLowerCase();
  if (id.includes('math_profile') || id.includes('профиль')) return <Calculator className={className} />;
  if (id.includes('math_base') || id.includes('базов')) return <Hash className={className} />;
  if (id.includes('rus') || id.includes('русск')) return <BookOpen className={className} />;
  if (id.includes('phys') || id.includes('физик')) return <Atom className={className} />;
  if (id.includes('inf') || id.includes('информ')) return <Binary className={className} />;
  if (id.includes('soc') || id.includes('обществ')) return <Scale className={className} />;
  if (id.includes('hist') || id.includes('истор')) return <Landmark className={className} />;
  if (id.includes('chem') || id.includes('химия')) return <FlaskConical className={className} />;
  if (id.includes('bio') || id.includes('биолог')) return <Dna className={className} />;
  if (id.includes('geog') || id.includes('географ')) return <Compass className={className} />;
  if (id.includes('lit') || id.includes('литератур')) return <BookOpen className={className} />;
  if (id.includes('eng') || id.includes('английск')) return <Languages className={className} />;
  return <Award className={className} />;
}

interface ExamSubmissionResult {
  mockExam: MockExam;
  simulation: ExamSimulation;
  results: {
    totalScore: number;
    primaryScore: number;
    correctPart1Count: number;
    missedTasks: string[];
    mistakeTopics: string[];
    deltaScore?: number | null;
    timeSpentSeconds: number;
  };
}

export const ExamPressureSimulatorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToastStore();

  const urlMode = searchParams.get('mode');

  // Фаза симулятора: ЛОББИ -> ЭКЗАМЕН -> ИТОГОВЫЙ ПРОТОКОЛ
  const [phase, setPhase] = useState<ExamPhase>('LOBBY');
  const [examMode, setExamMode] = useState<'full' | 'mini' | 'diagnostic'>(
    urlMode === 'diagnostic' ? 'diagnostic' : 'full'
  );

  // Выбранный предмет и целевые предметы из профиля
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>('math_profile');
  const [userTargetSubjects, setUserTargetSubjects] = useState<TargetSubject[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Вариант КИМ
  const [variant, setVariant] = useState<ExamVariant | null>(null);
  const [startingExam, setStartingExam] = useState(false);

  // Мобильный вид: вкладка 'kim' (Задания) или 'blank' (Бланк)
  const [mobileTab, setMobileTab] = useState<'kim' | 'blank'>('kim');

  // Таймер обратного отсчета (хранится в ref, чтобы не триггерить ре-рендер КИМ и KaTeX каждую секунду)
  const secondsLeftRef = useRef<number>(235 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Ответы части 1: taskNumber -> answer
  const [part1Answers, setPart1Answers] = useState<Record<string, string>>({});

  // Ответы части 2: taskNumber -> { text: string; scanUrls: Array<{ name: string; url: string; size: number }> }
  const [part2Solutions, setPart2Solutions] = useState<
    Record<string, { text: string; scanUrls: Array<{ name: string; url: string; size: number }> }>
  >({
    '14': { text: '', scanUrls: [] },
    '15': { text: '', scanUrls: [] },
    '16': { text: '', scanUrls: [] },
    '17': { text: '', scanUrls: [] },
    '18': { text: '', scanUrls: [] },
    '19': { text: '', scanUrls: [] },
    '20': { text: '', scanUrls: [] },
  });

  const [activePart2Tab, setActivePart2Tab] = useState<number>(14);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmissionResult | null>(null);

  // Модалка полноразмерного просмотра скана
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Модалка режима работы над ошибками
  const [isRetestOpen, setIsRetestOpen] = useState(false);

  // Модалка подтверждения сдачи бланка
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  // Модалка подтверждения прерывания экзамена
  const [isAbortConfirmOpen, setIsAbortConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const kimScrollRef = useRef<HTMLDivElement>(null);

  // Тайм-менеджмент: учёт времени по заданиям (refs — чтобы не плодить рендеры)
  const taskTimesRef = useRef<Record<number, number>>({});
  const trackedTaskRef = useRef<number>(0);
  const [taskTimes, setTaskTimes] = useState<Record<number, number>>({});
  const [finalSpentSeconds, setFinalSpentSeconds] = useState(0);

  // Рекомендуемый тайминг: по фактическому составу варианта, а не только по справочнику
  const pacingPlan = useMemo(() => {
    const base = findSubjectConfig(selectedSubjectKey);
    const part1 = variant?.part1Count ?? base.part1Count;
    const part2 = variant ? variant.part2Count : base.hasPart2 ? base.part2Count : 0;
    return buildPacingPlan(
      { ...base, part1Count: part1, part2Count: part2, hasPart2: part2 > 0 },
      variant?.timeLimitSeconds ?? base.durationMinutes * 60
    );
  }, [selectedSubjectKey, variant]);

  // Загрузка профиля пользователя для целевых предметов
  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setLoadingProfile(true);
    try {
      const p = await api.getProfile();
      const subjects = p.targetSubjects || [];
      setUserTargetSubjects(subjects);

      if (subjects.length > 0) {
        // Если у пользователя есть профильная математика, выбираем ее, иначе первый предмет
        const mathSubject = subjects.find((s) =>
          s.subjectName.toLowerCase().includes('матем')
        );
        const target = mathSubject || subjects[0];
        const cfg = findSubjectConfig(target.subjectName);
        setSelectedSubjectKey(cfg.id);
        secondsLeftRef.current = cfg.durationMinutes * 60;
      }
    } catch {
      // Игнорируем ошибку загрузки профиля в offline/demo режиме
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectKey(subjectId);
    const cfg = findSubjectConfig(subjectId);
    secondsLeftRef.current = cfg.durationMinutes * 60;
  };

  // Блокировка навигации во время экзамена (защита от случайного закрытия вкладки)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === 'EXAM') {
        e.preventDefault();
        e.returnValue = 'Экзамен в процессе! Несохраненные ответы будут потеряны. Вы уверены?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [phase]);

  // Актуальная версия обработчика сдачи для вызова из таймера (без устаревших замыканий)
  const submitRef = useRef<(isTimeUp?: boolean) => void>(() => {});

  const handleTimerTick = useCallback((currentSecondsLeft: number) => {
    secondsLeftRef.current = currentSecondsLeft;
    const task = trackedTaskRef.current;
    taskTimesRef.current[task] = (taskTimesRef.current[task] || 0) + 1;
  }, []);

  const handleTimerExpire = useCallback(() => {
    submitRef.current(true);
  }, []);

  const handlePrintClassPack = async () => {
    try {
      addToast('info', 'Генерация комплекта для класса (4 варианта + ключи)...');
      const html = await api.getClassPackHtml(selectedSubjectKey, 4);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      } else {
        addToast('error', 'Всплывающие окна заблокированы');
      }
    } catch (e: any) {
      addToast('error', 'Ошибка печати комплекта: ' + (e.message || ''));
    }
  };

  // СТАРТ ЭКЗАМЕНА ИЗ ЛОББИ
  const handleStartExam = async () => {
    setStartingExam(true);
    try {
      const res = await api.startExamSimulation(selectedSubjectKey);
      let loadedVariant = res.variant;

      if (examMode === 'diagnostic') {
        const part1Tasks = loadedVariant.tasks
          .filter((t) => (t.part || 1) === 1 || t.taskNumber <= loadedVariant.part1Count)
          .slice(0, 5);
        loadedVariant = {
          ...loadedVariant,
          title: `Экспресс-диагностика: ${loadedVariant.subjectName}`,
          tasks: part1Tasks,
          totalTasks: part1Tasks.length,
          part1Count: part1Tasks.length,
          part2Count: 0,
          maxPrimaryScore: 5,
          timeLimitSeconds: 15 * 60,
        };
        secondsLeftRef.current = 15 * 60;
      } else if (examMode === 'mini') {
        const part1Tasks = loadedVariant.tasks.filter(
          (t) => (t.part || 1) === 1 || t.taskNumber <= loadedVariant.part1Count
        );
        loadedVariant = {
          ...loadedVariant,
          tasks: part1Tasks,
          totalTasks: part1Tasks.length,
          part2Count: 0,
          timeLimitSeconds: 45 * 60,
        };
        secondsLeftRef.current = 45 * 60;
      } else {
        secondsLeftRef.current = loadedVariant.timeLimitSeconds;
      }

      setVariant(loadedVariant);

      // Инициализируем решения части 2
      const initialPart2: Record<string, { text: string; scanUrls: Array<{ name: string; url: string; size: number }> }> = {};
      if (examMode === 'full' && loadedVariant.part2Count > 0) {
        const startNum = loadedVariant.part1Count + 1;
        for (let i = startNum; i <= loadedVariant.totalTasks; i++) {
          initialPart2[i.toString()] = { text: '', scanUrls: [] };
        }
        setActivePart2Tab(startNum);
      }
      setPart2Solutions(initialPart2);
      setPart1Answers({});
      taskTimesRef.current = {};
      trackedTaskRef.current = 0;
      setTaskTimes({});
      setIsTimerRunning(true);
      setPhase('EXAM');
      addToast(
        'success',
        `${
          examMode === 'diagnostic'
            ? 'Экспресс-диагностика (5 базовых задач, 15 мин)'
            : examMode === 'mini'
            ? 'Мини-пробник (Часть 1, 45 мин)'
            : 'Полный КИМ'
        } запущен! Таймер активирован.`
      );
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка старта экзамена');
    } finally {
      setStartingExam(false);
    }
  };

  // Автоскролл к задаче в левой колонке (КИМ)
  const scrollToTask = (taskNum: number) => {
    // Любая навигация к заданию = «сейчас работаю над этим номером» (для тайм-менеджера)
    trackedTaskRef.current = taskNum;
    const el = document.getElementById(`task-card-${taskNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#d4ff00]');
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#d4ff00]'), 1500);
    }
  };

  const handlePart1Change = (taskNum: number, value: string) => {
    const sanitized = value.replace(/[^0-9.,-]/g, '');
    setPart1Answers((prev) => ({ ...prev, [taskNum.toString()]: sanitized }));
  };

  const handlePart2TextChange = (taskNum: number, text: string) => {
    setPart2Solutions((prev) => ({
      ...prev,
      [taskNum.toString()]: { ...prev[taskNum.toString()], text },
    }));
  };

  // Загрузка сканов через Drag & Drop или input
  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const currentTaskSolutions = part2Solutions[activePart2Tab.toString()]?.scanUrls || [];
    if (currentTaskSolutions.length + fileArray.length > 10) {
      addToast('error', `Максимально разрешено до 10 сканов на задание (сейчас: ${currentTaskSolutions.length})`);
      return;
    }

    setUploadingFiles(true);
    try {
      const res = await api.uploadExamScans(fileArray);
      const newScans = res.files.map((f) => ({
        name: f.originalName,
        url: f.url,
        size: f.size,
      }));

      setPart2Solutions((prev) => ({
        ...prev,
        [activePart2Tab.toString()]: {
          ...prev[activePart2Tab.toString()],
          scanUrls: [...(prev[activePart2Tab.toString()]?.scanUrls || []), ...newScans],
        },
      }));

      addToast('success', `Успешно прикреплено сканов: ${res.count}`);
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка загрузки файлов сканов');
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveScan = (taskNum: number, indexToRemove: number) => {
    setPart2Solutions((prev) => {
      const current = prev[taskNum.toString()];
      return {
        ...prev,
        [taskNum.toString()]: {
          ...current,
          scanUrls: current.scanUrls.filter((_, idx) => idx !== indexToRemove),
        },
      };
    });
    addToast('info', 'Скан удален');
  };

  // СДАЧА БЛАНКА И СОХРАНЕНИЕ В РАЗДЕЛ ПРОБНИКОВ (/mock-exams)
  const handleSubmitExam = async (isTimeUp = false) => {
    setIsSubmitConfirmOpen(false);
    setSubmitting(true);
    setIsTimerRunning(false);

    try {
      const totalTime = variant?.timeLimitSeconds || 235 * 60;
      const timeSpent = totalTime - secondsLeftRef.current;

      const res = await api.submitExamSimulation({
        subject: variant?.subjectName || 'Математика (профиль)',
        variantNumber: variant?.variantNumber,
        variantCode: variant?.variantCode,
        timeSpentSeconds: timeSpent,
        part1Answers,
        part2Solutions,
        variantTasks: variant?.tasks,
      });

      setSubmissionResult(res);
      setTaskTimes({ ...taskTimesRef.current });
      setFinalSpentSeconds(timeSpent);
      setPhase('FINISHED');
      addToast(
        'success',
        `Экзамен сдан! Результат (${res.results.totalScore} / 100) сохранен в раздел Пробников (/mock-exams)`
      );
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка сохранения экзамена');
      // После истечения времени не возобновляем таймер: иначе автосдача зациклится.
      // Повторить сдачу можно кнопкой «СДАТЬ БЛАНК».
      if (!isTimeUp) setIsTimerRunning(true);
    } finally {
      setSubmitting(false);
    }
  };
  submitRef.current = handleSubmitExam;

  const selectedConfig = findSubjectConfig(selectedSubjectKey);

  // Печать / PDF: чистые бланки выбранного предмета
  const handlePrintBlanks = () => {
    if (!printBlanks(selectedConfig)) {
      addToast('error', 'Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.');
    }
  };

  // Печать / PDF: КИМ текущего варианта вместе с бланками
  const handlePrintVariant = () => {
    if (!variant) return;
    const cfg = findSubjectConfig(variant.subject || variant.subjectName || selectedSubjectKey);
    if (!printVariant(variant, cfg)) {
      addToast('error', 'Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.');
    }
  };

  // Прогресс для тайм-менеджера
  const pacingProgress = {
    part1Answered: Object.values(part1Answers).filter((v) => v?.trim()).length,
    part2Touched: Object.entries(part2Solutions)
      .filter(([, sol]) => (sol?.text?.trim().length ?? 0) >= 30 || (sol?.scanUrls?.length ?? 0) > 0)
      .map(([num]) => Number(num)),
  };

  const matchedTargetSubject = userTargetSubjects.find((s) =>
    selectedConfig.name.toLowerCase().includes(s.subjectName.toLowerCase()) ||
    s.subjectName.toLowerCase().includes(selectedConfig.name.toLowerCase())
  );

  const currentPart2Solution = part2Solutions[activePart2Tab.toString()] || { text: '', scanUrls: [] };
  const currentTaskInKim = variant?.tasks.find((t) => t.number === activePart2Tab);

  // =========================================================================
  // ЭКРАН 1: ПРЕДСТАРТОВОЕ ЛОББИ (LOBBY / PRE-FLIGHT SCREEN)
  // =========================================================================
  if (phase === 'LOBBY') {
    const allSubjects = Object.values(EGE_SUBJECTS);
    const hasTargets = userTargetSubjects.length > 0;

    return (
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Шапка раздела в едином стиле сайта */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-tag mb-3">[ EXAM // REAL_SIMULATION ]</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
              SIMULATOR
            </h1>
            <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
              Полная симуляция реального ЕГЭ: официальные бланки, непрерывный таймер ФИПИ и критериальная проверка
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/mock-exams')}
              className="btn-ghost text-xs md:text-sm font-mono flex items-center gap-1.5"
            >
              <Award className="h-4 w-4 text-[#d4ff00]" />
              [ ИСТОРИЯ ПРОБНИКОВ ]
            </button>
          </div>
        </div>

        {/* Вводный баннер */}
        <div className="card-shelf p-6 md:p-8 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-3">
            <span className="font-mono text-xs text-[#d4ff00] font-bold uppercase tracking-widest block">
              Официальная спецификация КИМ-2027
            </span>
            <h2 className="text-2xl md:text-3xl font-display font-extrabold uppercase text-white tracking-tight">
              Полная симуляция реального ЕГЭ
            </h2>
            <p className="text-sm text-zinc-400 font-light leading-relaxed">
              Погрузитесь в условия настоящего государственного экзамена: непрерывный таймер согласно официальной
              спецификации ФИПИ, двухколоночный интерфейс с формулами и чертежами, загрузка рукописных чистовиков и
              автоматическое сохранение результатов в единую базу данных пробников.
            </p>
          </div>
        </div>

        {/* ВЫБОР ПРЕДМЕТА */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-xs text-[#d4ff00] uppercase font-bold tracking-wider block">
                ШАГ 1: ВЫБЕРИТЕ ДИСЦИПЛИНУ
              </span>
              <h3 className="text-lg font-display font-bold text-white uppercase mt-0.5">
                {hasTargets ? 'Целевые предметы программы' : 'Доступные предметы ЕГЭ'}
              </h3>
            </div>
            {loadingProfile && (
              <span className="font-mono text-[11px] text-zinc-500 animate-pulse">
                Синхронизация с профилем...
              </span>
            )}
          </div>

          {/* Сетка предметов */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(hasTargets ? userTargetSubjects : allSubjects).map((item) => {
              const cfg = hasTargets ? findSubjectConfig((item as TargetSubject).subjectName) : (item as typeof allSubjects[0]);
              const target = hasTargets ? (item as TargetSubject) : null;
              const isSelected = selectedSubjectKey === cfg.id;

              return (
                <div
                  key={cfg.id}
                  onClick={() => handleSelectSubject(cfg.id)}
                  className={`card-shelf p-5 transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#d4ff00] bg-[#d4ff00]/10'
                      : 'hover:border-[#d4ff00]/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 flex items-center justify-center border border-white/[0.08] bg-zinc-900/60 rounded-none">
                        {getSubjectIcon(cfg.id)}
                      </div>
                      <span className="mono-chip !text-[9px]">
                        ФИПИ 2027
                      </span>
                    </div>

                    <h4 className="font-display text-base font-bold text-white uppercase">
                      {cfg.name}
                    </h4>

                    <p className="mt-2 text-xs text-zinc-400 font-light leading-relaxed line-clamp-2">
                      {cfg.description}
                    </p>
                  </div>

                  <div>
                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400">{cfg.tasksCount} заданий</span>
                      <span className="text-[#d4ff00]">{cfg.durationMinutes} мин</span>
                    </div>

                    {target && (
                      <div className="mt-2 text-[10px] font-mono text-[#d4ff00] font-bold uppercase tracking-wider flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        Цель: {target.targetScore} баллов
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Если у пользователя есть целевые предметы, даем ссылку на переключение или выбор всех */}
          {hasTargets && (
            <div className="pt-2">
              <details className="group">
                <summary className="font-mono text-xs text-zinc-400 hover:text-white cursor-pointer select-none">
                  [ + ПОКАЗАТЬ ВСЕ ОСТАЛЬНЫЕ ПРЕДМЕТЫ ЕГЭ ({allSubjects.length}) ]
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
                  {allSubjects
                    .filter((cfg) => !userTargetSubjects.some((t) => t.subjectName.toLowerCase().includes(cfg.name.toLowerCase()) || cfg.name.toLowerCase().includes(t.subjectName.toLowerCase())))
                    .map((cfg) => {
                      const isSelected = selectedSubjectKey === cfg.id;
                      return (
                        <div
                          key={cfg.id}
                          onClick={() => handleSelectSubject(cfg.id)}
                          className={`card-shelf p-5 transition-all cursor-pointer relative flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#d4ff00] bg-[#d4ff00]/10'
                              : 'hover:border-[#d4ff00]/30'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="w-10 h-10 flex items-center justify-center border border-white/[0.08] bg-zinc-900/60 rounded-none">
                                {getSubjectIcon(cfg.id)}
                              </div>
                              <span className="mono-chip !text-[9px]">
                                ФИПИ
                              </span>
                            </div>

                            <h4 className="font-display text-base font-bold text-white uppercase">
                              {cfg.name}
                            </h4>

                            <p className="mt-2 text-xs text-zinc-400 font-light leading-relaxed line-clamp-2">
                              {cfg.description}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono">
                            <span className="text-zinc-400">{cfg.tasksCount} заданий</span>
                            <span className="text-[#d4ff00]">{cfg.durationMinutes} мин</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* СВОДКА И ПАРАМЕТРЫ СИМУЛЯЦИИ */}
        <div className="card-shelf p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <span className="font-mono text-[10px] text-[#d4ff00] uppercase font-bold tracking-widest block">
                ШАГ 2: ПАРАМЕТРЫ СИМУЛЯЦИИ КИМ
              </span>
              <h3 className="text-xl font-display font-black text-white uppercase mt-0.5">
                {selectedConfig.name}
              </h3>
            </div>
            {matchedTargetSubject && (
              <div className="mono-chip border-[#d4ff00]/30 text-[#d4ff00] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Предмет вашей программы подготовки
              </div>
            )}
          </div>

          {/* ВЫБОР ФОРМАТА СИМУЛЯЦИИ: ПОЛНЫЙ КИМ, МИНИ-ПРОБНИК ИЛИ ЭКСПРЕСС-ДИАГНОСТИКА */}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setExamMode('diagnostic')}
              className={`rounded-none border px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${
                examMode === 'diagnostic'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00]'
                  : 'border-white/10 bg-zinc-950/60 text-zinc-400 hover:text-white'
              }`}
            >
              [ ЭКСПРЕСС-ДИАГНОСТИКА: 15 МИН (5 БАЗОВЫХ ЗАДАЧ) ]
            </button>
            <button
              type="button"
              onClick={() => setExamMode('full')}
              className={`rounded-none border px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${
                examMode === 'full'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00]'
                  : 'border-white/10 bg-zinc-950/60 text-zinc-400 hover:text-white'
              }`}
            >
              [ ПОЛНЫЙ КИМ: {selectedConfig.durationMinutes} МИН (ЧАСТЬ 1 + 2) ]
            </button>
            <button
              type="button"
              onClick={() => setExamMode('mini')}
              className={`rounded-none border px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${
                examMode === 'mini'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00]'
                  : 'border-white/10 bg-zinc-950/60 text-zinc-400 hover:text-white'
              }`}
            >
              [ МИНИ-ПРОБНИК: ТОЛЬКО ЧАСТЬ 1 (45 МИНУТ) ]
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-zinc-900/60 border border-white/[0.06]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Всего заданий</span>
              <span className="text-xl font-mono font-bold text-white mt-0.5 block">
                {selectedConfig.tasksCount}
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                {selectedConfig.part1Count} кратких {selectedConfig.hasPart2 ? `+ ${selectedConfig.part2Count} развёрнутых` : '(только тест)'}
              </span>
            </div>

            <div className="p-3.5 bg-zinc-900/60 border border-white/[0.06]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Время на экзамен</span>
              <span className="text-xl font-mono font-bold text-[#d4ff00] mt-0.5 block">
                {Math.floor(selectedConfig.durationMinutes / 60)}ч {selectedConfig.durationMinutes % 60}мин
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Непрерывный таймер
              </span>
            </div>

            <div className="p-3.5 bg-zinc-900/60 border border-white/[0.06]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Макс. балл</span>
              <span className="text-xl font-mono font-bold text-white mt-0.5 block">
                {selectedConfig.maxScore}
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Первичный → 100 тестовых
              </span>
            </div>

            <div className="p-3.5 bg-zinc-900/60 border border-white/[0.06]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Банк заданий</span>
              <span className="text-xl font-mono font-bold text-[#d4ff00] mt-0.5 block">
                ФИПИ 2027
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Официальные критерии
              </span>
            </div>
          </div>

          {/* Регламент и правила */}
          <div className="space-y-2 border-t border-white/[0.08] pt-4 font-sans text-sm font-light leading-relaxed text-zinc-400">
            <span className="hud-tag mb-1 block">
              Регламент экзаменационной сессии:
            </span>
            <ul className="list-inside list-disc space-y-1.5">
              <li>
                <strong className="font-medium text-zinc-200">Таймер реального времени:</strong> после нажатия кнопки старта экзамен продолжается непрерывно без пауз.
              </li>
              <li>
                <strong className="font-medium text-zinc-200">Двухколоночный интерфейс:</strong> в левой части — полный КИМ с математическими формулами и чертежами, в правой — бланки № 1 и № 2.
              </li>
              {selectedConfig.hasPart2 && (
                <li>
                  <strong className="font-medium text-zinc-200">Чистовики развёрнутой части:</strong> решения заданий части 2 загружаются через текстовый редактор или фотографии/сканы рукописных листов (до 10 листов).
                </li>
              )}
              <li>
                <strong className="font-medium text-zinc-200">Автоматическая фиксация:</strong> по завершении экзамена результат сразу добавляется в историю пробников, строит график роста и передаёт ошибки в базу пробелов.
              </li>
            </ul>
          </div>

          {/* БОЛЬШАЯ КНОПКА СТАРТА */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleStartExam}
              disabled={startingExam}
              className="btn-lime w-full sm:w-auto !py-3.5 !px-8 text-sm md:text-base font-bold uppercase tracking-wider"
            >
              {startingExam ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              <span>[ НАЧАТЬ ЭКЗАМЕН ]</span>
            </button>
            <button
              type="button"
              onClick={handlePrintBlanks}
              className="btn-ghost w-full sm:w-auto !py-3.5 !px-6 text-xs uppercase tracking-wider font-mono"
              title="Открыть тренировочные бланки № 1 и № 2 для печати или сохранения в PDF"
            >
              <Printer className="w-4 h-4 text-[#d4ff00]" />
              [ ПЕЧАТЬ БЛАНКОВ ]
            </button>
            <button
              type="button"
              onClick={handlePrintClassPack}
              className="btn-ghost w-full sm:w-auto !py-3.5 !px-6 text-xs uppercase tracking-wider font-mono border-white/20 text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00]"
              title="Сгенерировать 4 варианта с ключами и бланками для всего класса"
            >
              <FileText className="w-4 h-4 text-[#d4ff00]" />
              [ ПАКЕТ ДЛЯ КЛАССА (4 ВАРИАНТА + КЛЮЧИ) ]
            </button>
            <span className="font-mono text-xs text-zinc-500">
              Вариант формируется динамически из базы РешуЕГЭ / ФИПИ
            </span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ЭКРАН 3: ИТОГОВЫЙ ПРОТОКОЛ ПРОВЕРКИ (FINISHED / PROTOCOL)
  // =========================================================================
  if (phase === 'FINISHED' && submissionResult) {
    const res = submissionResult.results;
    const delta = res.deltaScore;

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Шапка протокола */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-tag mb-3">[ EXAM // RESULTS ]</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
              RESULTS
            </h1>
            <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
              {variant?.title || 'Единый Государственный Экзамен'} • КИМ-2027
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/mock-exams')}
              className="btn-lime text-xs md:text-sm font-mono flex items-center gap-1.5"
            >
              <Award className="h-4 w-4" />
              [ В РАЗДЕЛ ПРОБНИКОВ ]
            </button>
          </div>
        </div>

        {/* Главная карточка с баллом и дельтой */}
        <div className="card-shelf p-6 md:p-8 border border-[#d4ff00]/60 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/[0.08] pb-6">
            <div>
              <span className="font-mono text-xs text-[#d4ff00] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                Экзамен успешно завершён и зафиксирован в базе данных
              </span>
              <h2 className="text-2xl md:text-3xl font-display font-black text-white uppercase">
                {variant?.title || 'Единый Государственный Экзамен'}
              </h2>
              <p className="mt-1 font-mono text-xs text-zinc-400">
                Дата: {new Date().toLocaleDateString('ru-RU')} • Время работы: {formatTimer(res.timeSpentSeconds)}
              </p>
            </div>

            <div className="text-right">
              <span className="font-mono text-xs text-zinc-400 uppercase block">Итоговый балл:</span>
              <div className="flex items-baseline gap-2 justify-end">
                <span className="text-5xl font-display font-black text-[#d4ff00]">
                  {res.totalScore}
                </span>
                <span className="text-sm font-mono text-zinc-500">/ 100</span>
              </div>
              {delta != null && (
                <div
                  className={`mt-1 font-mono text-xs font-bold flex items-center justify-end gap-1 ${
                    delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-zinc-400'
                  }`}
                >
                  {delta > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : delta < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : (
                    <Minus className="w-3.5 h-3.5" />
                  )}
                  {delta > 0 ? `+${delta}` : delta} к предыдущему срезу
                </div>
              )}
            </div>
          </div>

          {/* Метрики выполнения */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-shelf p-4 bg-zinc-900/60">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Часть 1: Краткий ответ</span>
              <span className="text-xl font-mono font-bold text-[#d4ff00] mt-1 block">
                {res.correctPart1Count} из {variant?.part1Count || selectedConfig.part1Count} верно
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Первичные баллы: {res.primaryScore} / {variant?.part1Count || selectedConfig.part1Count}
              </span>
            </div>

            <div className="card-shelf p-4 bg-zinc-900/60">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Часть 2: Развёрнутая</span>
              <span className="text-xl font-mono font-bold text-white mt-1 block">
                {Object.values(part2Solutions).reduce((acc, curr) => acc + curr.scanUrls.length, 0)} листов
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Прикреплено к протоколу
              </span>
            </div>

            <div className="card-shelf p-4 bg-zinc-900/60">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">База пробников</span>
              <span className="text-xl font-mono font-bold text-green-400 mt-1 block">
                СИНХРОНИЗИРОВАНО
              </span>
              <span className="font-mono text-[10px] text-zinc-400 mt-1 block">
                Запись доступна в /mock-exams
              </span>
            </div>
          </div>

          {/* Список выявленных тем для отработки (WeakTopics) */}
          {res.mistakeTopics && res.mistakeTopics.length > 0 && (
            <div className="p-4 bg-red-500/[0.06] border border-red-500/30 space-y-2">
              <span className="font-mono text-xs text-red-400 font-bold uppercase tracking-wider block">
                [ ВЫЯВЛЕННЫЕ ПРОБЕЛЫ // ПЕРЕДАНЫ В КАРТУ НАВЫКОВ ]
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {res.mistakeTopics.map((topic, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-red-500/10 border border-red-500/30 text-red-300 font-mono text-xs font-semibold"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Навигационные кнопки */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            {res.missedTasks && res.missedTasks.length > 0 && (
              <button
                type="button"
                onClick={() => setIsRetestOpen(true)}
                className="px-5 py-3 bg-amber-400 hover:bg-amber-300 text-black font-mono font-bold uppercase text-xs tracking-wider transition-all flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                [ ПЕРЕРЕШАТЬ ОШИБКИ ({res.missedTasks.length}) ]
              </button>
            )}

            <button
              onClick={() => navigate('/mock-exams')}
              className="btn-lime !py-3 !px-5 text-xs font-mono uppercase tracking-wider"
            >
              <Award className="w-4 h-4" />
              [ В РАЗДЕЛ ПРОБНИКОВ ]
            </button>

            <button
              onClick={() => {
                setPhase('LOBBY');
                setPart1Answers({});
                setPart2Solutions({});
                setSubmissionResult(null);
              }}
              className="btn-ghost !py-3 !px-4 text-xs font-mono uppercase tracking-wider"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#d4ff00]" />
              [ ПРОЙТИ НОВЫЙ ВАРИАНТ ]
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="btn-ghost !py-3 !px-4 text-xs font-mono uppercase tracking-wider"
            >
              [ В ДАШБОРД ]
            </button>

            <button
              type="button"
              onClick={handlePrintVariant}
              className="btn-ghost !py-3 !px-4 text-xs font-mono uppercase tracking-wider"
            >
              <Printer className="w-3.5 h-3.5 text-[#d4ff00]" />
              [ ПЕЧАТЬ ВАРИАНТА (PDF) ]
            </button>
          </div>
        </div>

        {/* Тайм-менеджмент: где ушло время */}
        <PacingReport
          plan={pacingPlan}
          taskTimes={taskTimes}
          totalSec={variant?.timeLimitSeconds || selectedConfig.durationMinutes * 60}
          spentSec={finalSpentSeconds}
        />

        {/* AI-эксперт ФИПИ для развернутой части */}
        <div className="card-shelf p-6">
          <div className="mb-4">
            <span className="font-mono text-xs text-[#d4ff00] uppercase font-bold tracking-widest block">
              Критериальная оценка части 2
            </span>
            <h3 className="text-lg font-display font-bold text-white uppercase mt-0.5">
              Проверка критериев К1 / К2 для части 2
            </h3>
          </div>
          <FipiSolutionChecker
            defaultSubject={variant?.subjectName || 'Профильная математика'}
            defaultTaskNumber={activePart2Tab.toString()}
            defaultTaskText={currentTaskInKim?.text || 'Задача развернутой части'}
          />
        </div>

        {/* Режим разбора варианта */}
        <div className="card-shelf p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <span className="font-mono text-xs text-[#d4ff00] font-bold uppercase tracking-widest block">
                Разбор варианта
              </span>
              <h3 className="text-xl font-display font-black text-white uppercase mt-0.5">
                Проверка тестовой части и эталоны критериев ФИПИ
              </h3>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 text-green-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> {res.correctPart1Count} верно
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5 text-red-400 font-bold">
                <XCircle className="w-3.5 h-3.5" /> {(variant?.part1Count || selectedConfig.part1Count) - res.correctPart1Count} ошибок
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {variant?.tasks.map((task: ExamTaskItem) => {
              const taskNum = task.taskNumber || task.number || 1;
              return (
                <KIMTaskCard
                  key={task.id || task.taskNumber || taskNum}
                  task={task}
                  userAnswer={part1Answers[taskNum.toString()]}
                  isAnswered={!!part1Answers[taskNum.toString()]?.trim()}
                  isReviewMode={true}
                  userPart2Solution={part2Solutions[taskNum.toString()]}
                />
              );
            })}
          </div>
        </div>

        {/* Модалка работы над ошибками */}
        <ExamRetestModal
          isOpen={isRetestOpen}
          onClose={() => setIsRetestOpen(false)}
          tasks={variant?.tasks || []}
          missedTaskNumbers={res.missedTasks || []}
          originalAnswers={part1Answers}
          subject={variant?.subjectName || selectedConfig.name}
        />
      </div>
    );
  }

  // =========================================================================
  // ЭКРАН 2: ЭКЗАМЕНАЦИОННАЯ СРЕДА (EXAM / SPLIT-SCREEN)
  // =========================================================================
  const part1Count = variant?.part1Count ?? selectedConfig.part1Count;
  const part2Count = variant?.part2Count ?? selectedConfig.part2Count;
  const totalTasks = variant?.totalTasks ?? selectedConfig.tasksCount;
  const hasPart2 = (variant ? variant.part2Count > 0 : selectedConfig.hasPart2) && part2Count > 0;

  return (
    <div className="w-full space-y-4 select-none">
      {/* Экзаменационная шапка */}
      <header className="sticky top-0 z-30 bg-[#09090b]/95 border-b border-white/[0.1] -mx-4 -mt-4 md:-mx-8 md:-mt-8 px-4 md:px-8 py-3 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAbortConfirmOpen(true)}
            className="p-1.5 border border-white/[0.1] hover:border-red-500/50 text-zinc-400 hover:text-red-400 transition-colors rounded-none"
            title="Прервать и выйти в лобби"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="hud-tag !text-[9px] mb-0.5">
              [ EXAM // {variant?.variantCode ? `ВАРИАНТ №${variant.variantCode}` : `КИМ // ${totalTasks} ЗАДАНИЙ`} ]
            </p>
            <h1 className="font-display text-sm md:text-base font-bold uppercase tracking-tight text-white">
              {variant?.title || `Единый Государственный Экзамен: ${selectedConfig.name}`}
            </h1>
          </div>
        </div>

        {/* Таймер обратного отсчета */}
        <div className="flex items-center gap-3 md:gap-4">
          <ExamTimer
            initialSeconds={variant?.timeLimitSeconds || selectedConfig.durationMinutes * 60}
            totalSeconds={variant?.timeLimitSeconds || selectedConfig.durationMinutes * 60}
            isRunning={isTimerRunning}
            onExpire={handleTimerExpire}
            secondsRef={secondsLeftRef}
            onTick={handleTimerTick}
          />

          <button
            type="button"
            onClick={handlePrintVariant}
            className="btn-ghost !py-1.5 !px-3 font-mono !text-xs hidden sm:flex items-center gap-1.5 rounded-none"
            title="Распечатать КИМ и бланки / сохранить в PDF"
          >
            <Printer className="w-3.5 h-3.5 text-[#d4ff00]" />
            <span>Печать КИМ</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSubmitConfirmOpen(true)}
            disabled={submitting}
            className="btn-lime !py-1.5 !px-4 font-mono !text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50 rounded-none"
          >
            {submitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            [ СДАТЬ БЛАНК ]
          </button>
        </div>

        {/* Тайм-менеджер КИМ: рекомендуемый тайминг, темп и предупреждения */}
        <ExamPacingAssistant
          plan={pacingPlan}
          totalSec={variant?.timeLimitSeconds || selectedConfig.durationMinutes * 60}
          progress={pacingProgress}
          isRunning={isTimerRunning}
          onAlert={(text, severity) => addToast(severity === 'critical' ? 'error' : 'info', text)}
        />
      </header>

      {/* Мобильный переключатель вкладок: КИМ / БЛАНК */}
      <div className="lg:hidden flex border-b border-white/[0.08] bg-zinc-950 p-2 gap-2">
        <button
          onClick={() => setMobileTab('kim')}
          className={`flex-1 py-2 font-mono text-xs uppercase flex items-center justify-center gap-2 border transition-all ${
            mobileTab === 'kim'
              ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white font-bold shadow-glow'
              : 'border-white/[0.06] text-zinc-400 hover:border-[#d4ff00]/40 hover:shadow-glow'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          КИМ (ЗАДАНИЯ 1–{totalTasks})
        </button>
        <button
          onClick={() => setMobileTab('blank')}
          className={`flex-1 py-2 font-mono text-xs uppercase flex items-center justify-center gap-2 border transition-all ${
            mobileTab === 'blank'
              ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white font-bold shadow-glow'
              : 'border-white/[0.06] text-zinc-400 hover:border-[#d4ff00]/40 hover:shadow-glow'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5 text-[#d4ff00]" />
          БЛАНК ОТВЕТОВ
        </button>
      </div>

      {/* Основная рабочая область: Split-Screen Layout */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 md:p-6 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-start">
          {/* ========================================================
              ЛЕВАЯ КОЛОНКА: КИМ (ТЕКСТ ВСЕХ ЗАДАНИЙ С ФОРМУЛАМИ)
             ======================================================== */}
          <div
            ref={kimScrollRef}
            className={`space-y-4 max-h-[84vh] overflow-y-auto pr-2 ${
              mobileTab === 'kim' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="sticky top-0 z-10 bg-zinc-950/95 border border-white/[0.1] p-3.5 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#d4ff00]" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  КОНТРОЛЬНЫЙ ИЗМЕРИТЕЛЬНЫЙ МАТЕРИАЛ (КИМ)
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-400">
                {totalTasks} ЗАДАНИЙ // ФИПИ 2027
              </span>
            </div>

            {!variant ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs">
                Загрузка варианта...
              </div>
            ) : (
              variant.tasks.map((task: ExamTaskItem) => {
                const taskNum = task.taskNumber || task.number || 1;
                const isPart1 = task.part === 1 || task.type === 'SHORT';
                const isAnswered = isPart1
                  ? !!part1Answers[taskNum.toString()]?.trim()
                  : !!part2Solutions[taskNum.toString()]?.text ||
                    (part2Solutions[taskNum.toString()]?.scanUrls &&
                      part2Solutions[taskNum.toString()].scanUrls.length > 0);

                return (
                  <KIMTaskCard
                    key={task.id || task.taskNumber || taskNum}
                    task={task}
                    userAnswer={part1Answers[taskNum.toString()]}
                    isAnswered={isAnswered}
                    isReviewMode={false}
                    userPart2Solution={part2Solutions[taskNum.toString()]}
                    onScrollToBlank={scrollToTask}
                  />
                );
              })
            )}
          </div>

          {/* ========================================================
              ПРАВАЯ КОЛОНКА: БЛАНК ОТВЕТОВ (КРАТКИЙ + РАЗВЕРНУТЫЙ)
             ======================================================== */}
          <div
            className={`space-y-6 max-h-[84vh] overflow-y-auto pl-1 ${
              mobileTab === 'blank' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* БЛАНК №1: КРАТКИЕ ОТВЕТЫ */}
            <div className="card-shelf p-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
                <div>
                  <span className="font-mono text-[10px] text-[#d4ff00] uppercase font-bold tracking-widest block">
                    [ БЛАНК ОТВЕТОВ № 1 // КРАТКИЙ ОТВЕТ ]
                  </span>
                  <h3 className="font-display text-sm font-bold uppercase text-white mt-0.5">
                    Задания с кратким числовым ответом (1 – {part1Count})
                  </h3>
                </div>
                <span className="font-mono text-[10px] text-zinc-500">
                  Клик по номеру — переход к задаче
                </span>
              </div>

              {/* Сетка бланка ответов */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: part1Count }, (_, i) => i + 1).map((taskNum) => {
                  const val = part1Answers[taskNum.toString()] || '';
                  const hasVal = !!val.trim();

                  return (
                    <div
                      key={taskNum}
                      onClick={() => scrollToTask(taskNum)}
                      className={`p-2.5 border transition-all cursor-pointer ${
                        hasVal
                          ? 'border-[#d4ff00]/40 bg-[#d4ff00]/5'
                          : 'border-white/[0.08] bg-zinc-900/40 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                        <span className="font-bold text-white">№ {taskNum}</span>
                        {hasVal && <CheckCircle2 className="w-3 h-3 text-[#d4ff00]" />}
                      </div>
                      <input
                        type="text"
                        value={val}
                        onFocus={() => scrollToTask(taskNum)}
                        onChange={(e) => handlePart1Change(taskNum, e.target.value)}
                        placeholder="Ответ"
                        className="w-full bg-zinc-950 border border-white/[0.1] px-2 py-1.5 text-center font-mono text-sm text-[#d4ff00] font-bold focus:outline-none focus:border-[#d4ff00]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* БЛАНК №2: РАЗВЕРНУТЫЕ РЕШЕНИЯ И СКАНЫ */}
            {hasPart2 ? (
              <div className="card-shelf p-5 pb-32">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
                  <div>
                    <span className="font-mono text-[10px] text-[#d4ff00] uppercase font-bold tracking-widest block">
                      [ БЛАНК ОТВЕТОВ № 2 // РАЗВЕРНУТАЯ ЧАСТЬ ]
                    </span>
                    <h3 className="font-display text-sm font-bold uppercase text-white mt-0.5">
                      Задания {part1Count + 1} – {totalTasks}: решения и сканы
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">
                    До 10 листов чистовика
                  </span>
                </div>

                {/* Вкладки заданий части 2 */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {Array.from({ length: part2Count }, (_, i) => part1Count + 1 + i).map((taskNum) => {
                    const sol = part2Solutions[taskNum.toString()];
                    const hasContent = !!sol?.text || (sol?.scanUrls && sol.scanUrls.length > 0);
                    const isActive = activePart2Tab === taskNum;

                    return (
                      <button
                        key={taskNum}
                        onClick={() => {
                          setActivePart2Tab(taskNum);
                          scrollToTask(taskNum);
                        }}
                        className={`px-3 py-1.5 font-mono text-xs uppercase border transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00] font-bold'
                            : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span>№ {taskNum}</span>
                        {hasContent && (
                          <span
                            className={`w-1.5 h-1.5 rounded-none ${
                              isActive ? 'bg-[#d4ff00]' : 'bg-[#d4ff00]/60'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Активная карточка задания части 2 */}
                <div className="p-4 bg-zinc-900/50 border border-white/[0.08] space-y-4 pb-32">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white uppercase">
                      ЗАДАНИЕ № {activePart2Tab} // {currentTaskInKim?.title || 'Развернутое решение'}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      Прикреплено страниц: {currentPart2Solution.scanUrls.length} / 10
                    </span>
                  </div>

                  {/* Поле ввода текстовых пояснений */}
                  <div>
                    <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
                      Текстовые пояснения / черновик ответа:
                    </label>
                    <textarea
                      rows={4}
                      value={currentPart2Solution.text}
                      onFocus={() => {
                        trackedTaskRef.current = activePart2Tab;
                      }}
                      onChange={(e) => handlePart2TextChange(activePart2Tab, e.target.value)}
                      placeholder="Например: пункт а) корни x = pi/3 + 2pi*k; пункт б) отбор на круге..."
                      className="w-full bg-zinc-950 border border-white/[0.1] p-3 text-zinc-100 font-mono text-xs focus:outline-none focus:border-[#d4ff00]"
                    />
                  </div>

                  {/* DRAG & DROP ЗОНА ЗАГРУЗКИ СКАНОВ / ФОТОГРАФИЙ */}
                  <div>
                    <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
                      Прямая загрузка рукописных листов (сканы / фото):
                    </label>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handleFilesUpload(e.dataTransfer.files);
                        }
                      }}
                      className="border border-dashed border-white/[0.15] hover:border-[#d4ff00]/60 p-5 bg-black/40 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        disabled={uploadingFiles}
                        onChange={(e) => {
                          if (e.target.files) handleFilesUpload(e.target.files);
                        }}
                        className="hidden"
                      />

                      {uploadingFiles ? (
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-6 h-6 text-[#d4ff00] animate-spin" />
                          <span className="font-mono text-xs text-[#d4ff00]">
                            ЗАГРУЗКА СКАНОВ НА СЕРВЕР...
                          </span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-zinc-400" />
                          <div className="text-center">
                            <p className="text-xs font-mono text-zinc-300 font-bold">
                              ПЕРЕТАЩИТЕ СКАНЫ ИЛИ НАЖМИТЕ ДЛЯ ВЫБОРА
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              JPEG, PNG, WebP или PDF (до 10 файлов, макс. 15 МБ)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* СЕТКА МИНИАТЮР ЗАГРУЖЕННЫХ СТРАНИЦ */}
                  {currentPart2Solution.scanUrls.length > 0 && (
                    <div>
                      <span className="block text-[11px] font-mono text-zinc-400 mb-2 uppercase">
                        Прикрепленные листы чистовика:
                      </span>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {currentPart2Solution.scanUrls.map((scan, idx) => (
                          <div
                            key={idx}
                            className="relative group border border-white/[0.1] bg-black p-2 flex flex-col justify-between"
                          >
                            <div
                              onClick={() => setPreviewImage(scan.url)}
                              className="w-full h-24 bg-zinc-900 border border-white/[0.05] overflow-hidden flex items-center justify-center cursor-pointer relative"
                            >
                              {scan.url.endsWith('.pdf') ? (
                                <FileText className="w-8 h-8 text-[#d4ff00]" />
                              ) : (
                                <img
                                  src={scan.url}
                                  alt={scan.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-5 h-5 text-white" />
                              </div>
                            </div>

                            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono">
                              <span className="text-[#d4ff00] font-bold">Лист {idx + 1}</span>
                              <button
                                onClick={() => handleRemoveScan(activePart2Tab, idx)}
                                className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Удалить лист"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card-shelf p-6 text-center space-y-2">
                <span className="mono-chip !text-[10px]">
                  Бланк № 2 не требуется
                </span>
                <h3 className="font-display text-base font-bold uppercase text-white mt-1">
                  Тестовая форма экзамена
                </h3>
                <p className="text-xs text-zinc-400 font-light max-w-md mx-auto leading-relaxed">
                  Для дисциплины «{selectedConfig.name}» спецификацией КИМ предусмотрена только тестовая часть (задания 1–{part1Count}). Развёрнутые рукописные решения на бланке № 2 не требуются.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* МОДАЛКА ЗУМА / ПРЕДПРОСМОТРА СКАНА */}
      {previewImage && (
        <div className="modal-veil" onClick={() => setPreviewImage(null)}>
          <div
            className="modal-body max-w-4xl p-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-3">
              <span className="font-mono text-xs text-[#d4ff00] uppercase font-bold tracking-wider">
                Просмотр скана чистовика
              </span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black/60 border border-white/[0.06]">
              {previewImage.endsWith('.pdf') ? (
                <iframe src={previewImage} className="w-full h-[70vh] border-0" title="PDF preview" />
              ) : (
                <img
                  src={previewImage}
                  alt="Скан решения"
                  className="max-h-[75vh] w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПОДТВЕРЖДЕНИЯ СДАЧИ БЛАНКА (EGE.SYSTEM HUD) */}
      {isSubmitConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !submitting && setIsSubmitConfirmOpen(false)}
        >
          <div
            className="relative w-full max-w-lg border border-white/10 bg-[#09090b] p-6 rounded-none space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ШАПКА ТЕРМИНАЛА */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#d4ff00] animate-pulse" />
                <h3 className="font-mono text-xs font-bold text-[#d4ff00] tracking-wider uppercase">
                  [ ВНИМАНИЕ // ЗАВЕРШЕНИЕ ЭКЗАМЕНА ]
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsSubmitConfirmOpen(false)}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
                title="Отмена"
                disabled={submitting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ТЕЛО МОДАЛКИ */}
            <div className="space-y-4">
              <p className="text-sm font-sans text-zinc-300 leading-relaxed">
                Вы уверены, что хотите сдать бланк? Неотвеченные задания части 1 будут оценены в 0 баллов.
              </p>

              {/* МИНИ-СВОДКА ТЕЛЕМЕТРИИ ЗАПОЛНЕНИЯ */}
              <div className="grid grid-cols-2 gap-3 border border-white/[0.06] bg-zinc-900/40 p-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">Часть 1 (заполнено):</span>
                  <span className="text-[#d4ff00] font-bold">
                    {Object.values(part1Answers).filter((v) => v?.trim()).length} / {part1Count} заданий
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">Часть 2 (вложений):</span>
                  <span className="text-white font-bold">
                    {Object.values(part2Solutions).reduce(
                      (acc, s) => acc + (s.text?.trim() ? 1 : 0) + s.scanUrls.length,
                      0
                    )}{' '}
                    листов/текста
                  </span>
                </div>
              </div>
            </div>

            {/* КНОПКИ ДЕЙСТВИЯ */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setIsSubmitConfirmOpen(false)}
                disabled={submitting}
                className="py-2.5 px-4 text-xs font-mono uppercase tracking-wider border border-white/10 bg-transparent text-zinc-300 hover:text-white hover:border-white/20 rounded-none transition-colors"
              >
                [ ВЕРНУТЬСЯ К РЕШЕНИЮ ]
              </button>

              <button
                type="button"
                onClick={() => handleSubmitExam(false)}
                disabled={submitting}
                className="py-2.5 px-5 text-xs font-mono font-bold uppercase tracking-wider text-black bg-[#d4ff00] hover:bg-[#b8dd00] rounded-none transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>СДАЧА БЛАНКА...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>[ ДА, СДАТЬ БЛАНК ]</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПРЕРЫВАНИЯ ЭКЗАМЕНА В СТИЛЕ EGE.SYSTEM HUD */}
      {isAbortConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsAbortConfirmOpen(false)}
        >
          <div
            className="relative w-full max-w-lg border border-white/10 bg-[#09090b] p-6 rounded-none space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-400 animate-pulse" />
                <h3 className="font-mono text-xs font-bold text-red-400 tracking-wider uppercase">
                  [ ВНИМАНИЕ // ПРЕРЫВАНИЕ ЭКЗАМЕНА ]
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAbortConfirmOpen(false)}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
                title="Отмена"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-sans text-zinc-300 leading-relaxed">
              Вы уверены, что хотите прервать симуляцию экзамена и выйти в лобби? Несохраненные результаты будут потеряны.
            </p>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setIsAbortConfirmOpen(false)}
                className="py-2.5 px-4 text-xs font-mono uppercase tracking-wider border border-white/10 bg-transparent text-zinc-300 hover:text-white hover:border-white/20 rounded-none transition-colors"
              >
                [ ПРОДОЛЖИТЬ ЭКЗАМЕН ]
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAbortConfirmOpen(false);
                  setIsTimerRunning(false);
                  setPhase('LOBBY');
                }}
                className="py-2.5 px-5 text-xs font-mono font-bold uppercase tracking-wider text-white bg-red-500/80 hover:bg-red-500 border border-red-500 rounded-none transition-colors flex items-center justify-center gap-2"
              >
                [ ДА, ВЫЙТИ В ЛОББИ ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamPressureSimulatorPage;
