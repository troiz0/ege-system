import { useState, useEffect, useMemo } from 'react';
import { Zap, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { LatexText } from './LatexText';

interface SprintTask {
  id: number;
  number: number;
  topic: string;
  statement: string;
  correctAnswer: string;
  explanation: string;
}

export type SprintSubject =
  | 'math_profile'
  | 'russian'
  | 'physics'
  | 'informatics'
  | 'social'
  | 'history'
  | 'biology'
  | 'chemistry';

const SUBJECT_KEY_MAP: Record<string, SprintSubject> = {
  'математика (профиль)': 'math_profile',
  'математика профиль': 'math_profile',
  'профильная математика': 'math_profile',
  'математика': 'math_profile',
  'math_profile': 'math_profile',
  'math': 'math_profile',

  'русский язык': 'russian',
  'русский': 'russian',
  'russian': 'russian',

  'информатика': 'informatics',
  'информатика и икт': 'informatics',
  'informatics': 'informatics',

  'физика': 'physics',
  'physics': 'physics',

  'обществознание': 'social',
  'общество': 'social',
  'social': 'social',

  'история': 'history',
  'history': 'history',

  'биология': 'biology',
  'biology': 'biology',

  'химия': 'chemistry',
  'chemistry': 'chemistry',
};

const SPRINT_SETS: Record<SprintSubject, { label: string; tasks: SprintTask[] }> = {
  math_profile: {
    label: 'МАТЕМАТИКА (ПРОФИЛЬ)',
    tasks: [
      {
        id: 101,
        number: 6,
        topic: 'Простейшие уравнения',
        statement: 'Найдите корень уравнения: $3^{x - 5} = 81$.',
        correctAnswer: '9',
        explanation: '$81 = 3^4$. Следовательно, $x - 5 = 4 \\implies x = 9$.',
      },
      {
        id: 102,
        number: 4,
        topic: 'Теория вероятностей',
        statement: 'В сборнике билетов по физике всего $25$ билетов, в $10$ из них встречается вопрос по оптике. Найдите вероятность того, что в случайно выбранном билете школьнику достанется вопрос по оптике.',
        correctAnswer: '0.4',
        explanation: '$P = \\frac{10}{25} = \\frac{2}{5} = 0{,}4$.',
      },
      {
        id: 103,
        number: 1,
        topic: 'Планиметрия (треугольники)',
        statement: 'В прямоугольном треугольнике гипотенуза равна $10$, а один из катетов равен $8$. Найдите второй катет.',
        correctAnswer: '6',
        explanation: 'По теореме Пифагора: $b = \\sqrt{10^2 - 8^2} = \\sqrt{100 - 64} = \\sqrt{36} = 6$.',
      },
    ],
  },
  russian: {
    label: 'РУССКИЙ ЯЗЫК',
    tasks: [
      {
        id: 201,
        number: 4,
        topic: 'Орфоэпические нормы (ударение)',
        statement: 'В одном из приведённых ниже слов допущена ошибка в постановке ударения: НЕВЕРНО выделена буква, обозначающая ударный гласный звук. Выпишите это слово в нижнем регистре: \\n\\n`бАловать`, `красИвее`, `договОр`, `тортЫ`.',
        correctAnswer: 'баловать',
        explanation: 'Нормативное ударение: баловАть, балУю, баловАнный (инфинитив падает на окончание).',
      },
      {
        id: 202,
        number: 5,
        topic: 'Лексические нормы (паронимы)',
        statement: 'В одном из приведённых ниже предложений НЕВЕРНО употреблено выделенное слово. Исправьте лексическую ошибку, подобрав к выделенному слову пароним: \\n\\n«Командир части отдал строгий ДИПЛОМАТИЧЕСКИЙ приказ».',
        correctAnswer: 'дипломатичный',
        explanation: 'Дипломатический — относящийся к дипломатии (паспорт, курьер). Тонкий, расчетливый, вежливый — дипломатичный.',
      },
      {
        id: 203,
        number: 11,
        topic: 'Правописание суффиксов',
        statement: 'Укажите букву, пропущенную в словах одного ряда: \\n\\n`застра..вать`, `расклан..ваться`. (Запишите одну пропущенную гласную букву).',
        correctAnswer: 'и',
        explanation: 'В форме 1-го лица (я застраиваю, раскланиваюсь) суффикс -ива- сохраняется, поэтому пишется буква «и».',
      },
    ],
  },
  informatics: {
    label: 'ИНФОРМАТИКА',
    tasks: [
      {
        id: 401,
        number: 11,
        topic: 'Передача информации',
        statement: 'Скорость передачи данных по каналу связи равна $128\\,000$ бит/с. Сколько килобайт данных передается по этому каналу за $16$ секунд?',
        correctAnswer: '250',
        explanation: '$V = (128\\,000 \\times 16) / (8 \\times 1024) = 2\\,048\\,000 / 8192 = 250$ Кбайт.',
      },
      {
        id: 402,
        number: 8,
        topic: 'Системы счисления',
        statement: 'Сколько значащих нулей содержится в двоичной записи десятичного числа $68$?',
        correctAnswer: '5',
        explanation: '$68 = 64 + 4 = 2^6 + 2^2 = 1000100_2$. Значащих нулей: 5.',
      },
      {
        id: 403,
        number: 1,
        topic: 'Анализ графов и таблиц',
        statement: 'Между пунктами А, B, C, D, E, F проложены дороги. Длина кратчайшего пути из пункта А в пункт F по таблице смежности равна (в км):',
        correctAnswer: '13',
        explanation: 'Кратчайший маршрут A-B-E-F: $3 + 4 + 6 = 13$ км.',
      },
    ],
  },
  physics: {
    label: 'ФИЗИКА',
    tasks: [
      {
        id: 501,
        number: 1,
        topic: 'Кинематика',
        statement: 'Точка движется вдоль оси $Ox$. Проекция её скорости меняется со временем по закону $v_x = 4 + 2t$ (в единицах СИ). Найдите проекцию ускорения $a_x$ (в м/с$^2$).',
        correctAnswer: '2',
        explanation: 'Уравнение скорости при равноускоренном движении: $v_x = v_{0x} + a_x t$. Коэффициент перед $t$ равен проекции ускорения: $a_x = 2$ м/с$^2$.',
      },
      {
        id: 502,
        number: 2,
        topic: 'Законы сохранения',
        statement: 'Тело массой $2$ кг движется со скоростью $6$ м/с и сталкивается с неподвижным телом массой $1$ кг. Найдите скорость тел после абсолютно неупругого соударения (в м/с).',
        correctAnswer: '4',
        explanation: 'По закону сохранения импульса: $m_1 v_1 = (m_1 + m_2) v \\implies 2 \\times 6 = (2 + 1) v \\implies 12 = 3v \\implies v = 4$ м/с.',
      },
      {
        id: 503,
        number: 7,
        topic: 'Термодинамика (цикл Карно)',
        statement: 'В идеальном тепловом двигателе температура нагревателя равна $600$ К, а температура холодильника равна $300$ К. Найдите КПД двигателя (в процентах).',
        correctAnswer: '50',
        explanation: 'КПД цикла Карно: $\\eta = \\frac{T_1 - T_2}{T_1} = \\frac{600 - 300}{600} = 0{,}5$ или $50\\%$.',
      },
    ],
  },
  social: {
    label: 'ОБЩЕСТВОЗНАНИЕ',
    tasks: [
      {
        id: 301,
        number: 1,
        topic: 'Человек и общество / Политика',
        statement: 'Запишите термин, пропущенный в определении: \\n\\n«Форма правления, при которой верховная государственная власть сосредоточена в руках одного лица и передается по наследству, называется ...».',
        correctAnswer: 'монархия',
        explanation: 'Монархия — форма правления с пожизненным и наследственным характером верховной власти.',
      },
      {
        id: 302,
        number: 7,
        topic: 'Экономика (рыночные структуры)',
        statement: 'Рыночная структура, при которой господствующее положение на рынке определенного товара занимают несколько крупных фирм-производителей, называется ...',
        correctAnswer: 'олигополия',
        explanation: 'Олигополия — рынок, где доминируют несколько (3-5) крупных конкурирующих продавцов (например, мобильные операторы).',
      },
      {
        id: 303,
        number: 13,
        topic: 'Конституция РФ и органы власти',
        statement: 'Какой высший орган исполнительной власти в РФ в соответствии со статьей 114 Конституции РФ осуществляет управление федеральной собственностью? (Запишите одно слово).',
        correctAnswer: 'правительство',
        explanation: 'Статья 114 Конституции РФ: Правительство РФ обеспечивает проведение единой финансовой политики и управляет федеральной собственностью.',
      },
    ],
  },
  history: {
    label: 'ИСТОРИЯ',
    tasks: [
      {
        id: 601,
        number: 1,
        topic: 'Хронология событий',
        statement: 'В каком году произошло Ледовое побоище на Чудском озере?',
        correctAnswer: '1242',
        explanation: 'Ледовое побоище произошло 5 апреля 1242 года.',
      },
      {
        id: 602,
        number: 4,
        topic: 'Реформы XIX века',
        statement: 'Укажите год отмены крепостного права в Российской империи (манифест императора Александра II).',
        correctAnswer: '1861',
        explanation: 'Манифест об отмене крепостного права был подписан 19 февраля 1861 года.',
      },
      {
        id: 603,
        number: 8,
        topic: 'Великая Отечественная война',
        statement: 'Какая битва завершилась окружением и капитуляцией 6-й армии Паулюса в феврале 1943 года? (Запишите одно слово в именительном падеже: например, курская или сталинградская).',
        correctAnswer: 'сталинградская',
        explanation: 'Сталинградская битва (17 июля 1942 — 2 февраля 1943) завершилась разгромом немецкой группировки под Сталинградом.',
      },
    ],
  },
  biology: {
    label: 'БИОЛОГИЯ',
    tasks: [
      {
        id: 701,
        number: 3,
        topic: 'Генетическая информация',
        statement: 'В соматической клетке дрозофилы содержится $8$ хромосом. Сколько хромосом содержит зрелая половая клетка (гамета) дрозофилы?',
        correctAnswer: '4',
        explanation: 'Гаметы содержат гаплоидный набор хромосом ($n$). При $2n = 8$, $n = 4$.',
      },
      {
        id: 702,
        number: 2,
        topic: 'Клетка как система',
        statement: 'Какой двумембранный органоид клетки обеспечивает синтез АТФ в процессе клеточного дыхания? (Запишите в именительном падеже, единственном числе).',
        correctAnswer: 'митохондрия',
        explanation: 'Митохондрии — органоиды клеточного дыхания и синтеза АТФ.',
      },
      {
        id: 703,
        number: 4,
        topic: 'Моногибридное скрещивание',
        statement: 'Сколько фенотипических классов образуется при моногибридном скрещивании гетерозигот ($Aa \\times Aa$) при полном доминировании?',
        correctAnswer: '2',
        explanation: 'Расщепление по фенотипу при полном доминировании: 3:1 (2 фенотипических класса).',
      },
    ],
  },
  chemistry: {
    label: 'ХИМИЯ',
    tasks: [
      {
        id: 801,
        number: 1,
        topic: 'Строение атома',
        statement: 'Определите число неспаренных электронов в основном состоянии атома азота ($N$, порядковый номер $7$).',
        correctAnswer: '3',
        explanation: 'Конфигурация азота: $1s^2 2s^2 2p^3$. На $2p$-подуровне 3 неспаренных электрона.',
      },
      {
        id: 802,
        number: 3,
        topic: 'Степень окисления',
        statement: 'Определите степень окисления серы в серной кислоте ($H_2SO_4$). (Запишите число: например, +6 или 6).',
        correctAnswer: '6',
        explanation: 'В $H_2SO_4$: $2 \\times (+1) + x + 4 \\times (-2) = 0 \\implies x = +6$.',
      },
      {
        id: 803,
        number: 26,
        topic: 'Расчёты массовой доли',
        statement: 'Какова массовая доля соли (в процентах) в растворе, полученном растворением $20$ г соли в $180$ г воды?',
        correctAnswer: '10',
        explanation: 'Массовая доля: $w = 20 / (20 + 180) = 20 / 200 = 0{,}10$ или $10\\%$.',
      },
    ],
  },
};

interface DailySprintWidgetProps {
  targetSubjects?: string[];
}

export function DailySprintWidget({ targetSubjects: propTargetSubjects }: DailySprintWidgetProps) {
  const [internalTargets, setInternalTargets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('ege_user_target_subjects');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* noop */
    }
    return [];
  });

  useEffect(() => {
    const handleTargetsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail) && customEvent.detail.length > 0) {
        setInternalTargets(customEvent.detail);
      } else {
        try {
          const stored = localStorage.getItem('ege_user_target_subjects');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setInternalTargets(parsed);
            }
          }
        } catch {
          /* noop */
        }
      }
    };

    window.addEventListener('profile-target-subjects-updated', handleTargetsUpdated);
    window.addEventListener('storage', handleTargetsUpdated);
    return () => {
      window.removeEventListener('profile-target-subjects-updated', handleTargetsUpdated);
      window.removeEventListener('storage', handleTargetsUpdated);
    };
  }, []);

  const effectiveTargets = (propTargetSubjects && propTargetSubjects.length > 0)
    ? propTargetSubjects
    : internalTargets;

  const activeSubjectKeys = useMemo<SprintSubject[]>(() => {
    if (effectiveTargets.length > 0) {
      const matched: SprintSubject[] = [];
      effectiveTargets.forEach((raw) => {
        const norm = raw.trim().toLowerCase();
        let key = SUBJECT_KEY_MAP[norm];
        if (!key) {
          for (const [mapKey, val] of Object.entries(SUBJECT_KEY_MAP)) {
            if (norm.includes(mapKey) || mapKey.includes(norm)) {
              key = val;
              break;
            }
          }
        }
        if (key && !matched.includes(key) && SPRINT_SETS[key]) {
          matched.push(key);
        }
      });
      if (matched.length > 0) {
        return matched;
      }
    }
    // Fallback if no target subjects chosen yet: Math Profile and Russian
    return ['math_profile', 'russian'];
  }, [effectiveTargets]);

  const [selectedSubject, setSelectedSubject] = useState<SprintSubject>(() => activeSubjectKeys[0]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [dynamicTasks, setDynamicTasks] = useState<SprintTask[] | null>(null);
  const { addToast } = useToastStore();

  // Динамическая загрузка 3 персонализированных задач дня (из MistakeEntry и WeakTopic с наименьшим masteryLevel)
  useEffect(() => {
    let cancelled = false;
    const fetchSprint = async () => {
      try {
        const res = await api.getDailySprint(selectedSubject);
        if (!cancelled && res?.tasks && res.tasks.length > 0) {
          setDynamicTasks(res.tasks);
        }
      } catch {
        // Fallback to static SPRINT_SETS
      }
    };
    fetchSprint();
    return () => {
      cancelled = true;
    };
  }, [selectedSubject]);

  // If activeSubjectKeys changes and does not include selectedSubject, switch to first available
  useEffect(() => {
    if (activeSubjectKeys.length > 0 && !activeSubjectKeys.includes(selectedSubject)) {
      setSelectedSubject(activeSubjectKeys[0]);
      setCurrentIdx(0);
      setAnswers({});
      setSubmitted(false);
      setDynamicTasks(null);
    }
  }, [activeSubjectKeys, selectedSubject]);

  const currentSet = SPRINT_SETS[selectedSubject] || SPRINT_SETS.math_profile;
  const tasks = (dynamicTasks && dynamicTasks.length > 0) ? dynamicTasks : currentSet.tasks;
  const currentTask = tasks[currentIdx] || tasks[0];

  const handleSubjectChange = (subj: SprintSubject) => {
    setSelectedSubject(subj);
    setCurrentIdx(0);
    setAnswers({});
    setSubmitted(false);
    setDynamicTasks(null);
  };

  const handleAnswerChange = (val: string) => {
    setAnswers((prev) => ({ ...prev, [currentTask.id]: val }));
  };

  const handleNext = () => {
    if (currentIdx < tasks.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      finishSprint();
    }
  };

  const finishSprint = async () => {
    setSubmitted(true);
    try {
      const stringAnswers: Record<string, string> = {};
      Object.entries(answers).forEach(([k, v]) => {
        stringAnswers[k] = v;
      });
      const res = await api.completeDailySprint(stringAnswers, selectedSubject);
      if (res?.success) {
        useAuthStore.getState().updateUserXp(res.xp, res.level);
        addToast('success', `Дейли-спринт завершен! +${res.xpAwarded} XP (Текущий уровень: ${res.level}).`);
        return;
      }
    } catch {
      // Fallback local toast
    }
    addToast('success', 'Дейли-спринт завершен! +15 XP начислено в профиль.');
  };

  const correctCount = tasks.filter((t) => {
    const userVal = (answers[t.id] || '').trim().replace(',', '.').toLowerCase();
    const correctVal = t.correctAnswer.toLowerCase();
    const normUser = userVal.startsWith('+') ? userVal.slice(1) : userVal;
    const normCorrect = correctVal.startsWith('+') ? correctVal.slice(1) : correctVal;
    return normUser === normCorrect;
  }).length;

  return (
    <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
            <Zap className="h-4 w-4 text-[#d4ff00]" />
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00] block mb-0.5">
              [ ДЕЙЛИ-СПРИНТ // 3 ЗАДАЧИ ДНЯ ]
            </span>
            <h2 className="font-display text-sm font-bold uppercase tracking-tight text-white">
              5-минутный экспресс-тест Части 1
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            НАГРАДА: <strong className="text-[#d4ff00] font-normal">+15 XP</strong> // +1 СТРИК
          </span>
        </div>
      </div>

      {/* Переключатель предмета спринта — отображаются ТОЛЬКО целевые предметы ученика */}
      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-white/[0.06] pb-3">
        {activeSubjectKeys.map((subjKey) => (
          <button
            key={subjKey}
            type="button"
            onClick={() => handleSubjectChange(subjKey)}
            className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition-all border ${
              selectedSubject === subjKey
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-medium'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            {SPRINT_SETS[subjKey].label}
          </button>
        ))}
      </div>

      {!submitted ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              ЗАДАНИЕ {currentIdx + 1} ИЗ {tasks.length} [№{currentTask.number} // {currentTask.topic}]
            </span>
            <div className="flex gap-1.5">
              {tasks.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 transition-all ${
                    i === currentIdx
                      ? 'bg-[#d4ff00]'
                      : answers[tasks[i].id]
                      ? 'bg-white/40'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mb-4 border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="font-sans text-sm font-light text-zinc-200 leading-relaxed whitespace-pre-line">
              <LatexText content={currentTask.statement} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Введите ваш ответ..."
                value={answers[currentTask.id] || ''}
                onChange={(e) => handleAnswerChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                className="w-full rounded-none border border-white/10 bg-zinc-950/60 px-3.5 py-2 font-mono text-xs text-white placeholder-zinc-600 focus:border-[#d4ff00]/60 focus:outline-none"
              />
            </div>
            <button
              onClick={handleNext}
              className="btn-lime px-4 py-2 font-mono text-[11px] font-medium tracking-[0.2em] uppercase"
            >
              <span className="flex items-center gap-1.5">
                {currentIdx < tasks.length - 1 ? 'Далее' : 'Завершить спринт'}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-white/10 bg-white/[0.02] p-4">
            <div>
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-400">РЕЗУЛЬТАТ СПРИНТА:</span>
              <div className="font-sans text-base font-semibold text-white mt-0.5">
                {correctCount} из {tasks.length} верно
              </div>
            </div>
            <button
              onClick={() => {
                setSubmitted(false);
                setCurrentIdx(0);
                setAnswers({});
              }}
              className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#d4ff00] hover:underline"
            >
              [ Пройти заново ]
            </button>
          </div>

          <div className="space-y-2">
            {tasks.map((task) => {
              const userVal = (answers[task.id] || '').trim().replace(',', '.').toLowerCase();
              const correctVal = task.correctAnswer.toLowerCase();
              const normUser = userVal.startsWith('+') ? userVal.slice(1) : userVal;
              const normCorrect = correctVal.startsWith('+') ? correctVal.slice(1) : correctVal;
              const isOk = normUser === normCorrect;

              return (
                <div
                  key={task.id}
                  className={`border p-3 ${
                    isOk ? 'border-green-500/30 bg-green-950/10' : 'border-red-500/30 bg-red-950/10'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-zinc-400">
                      №{task.number} · {task.topic}
                    </span>
                    <span className={`flex items-center gap-1 ${isOk ? 'text-green-400' : 'text-red-400'}`}>
                      {isOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {isOk ? 'Верно' : 'Неверно'}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-zinc-300">
                    Ваш ответ: <span className="font-bold text-white">{answers[task.id] || '<пусто>'}</span>
                    {!isOk && (
                      <span className="ml-3 text-green-400">
                        Правильный: <span className="font-bold">{task.correctAnswer}</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-2 border-t border-white/[0.06] pt-1.5 font-sans text-xs text-zinc-400">
                    <LatexText content={`Пояснение: ${task.explanation}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
