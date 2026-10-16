export interface EgeSubjectConfig {
  id: string;
  name: string;
  icon: string;
  tasksCount: number;
  durationMinutes: number;
  part1Count: number;
  part2Count: number;
  hasPart2: boolean;
  maxScore: number;
  description: string;
  sdamgiaSubdomain?: string;
}

export const EGE_SUBJECTS: Record<string, EgeSubjectConfig> = {
  math_profile: {
    id: 'math_profile',
    name: 'Математика (профиль)',
    icon: 'Σ',
    tasksCount: 20,
    durationMinutes: 235,
    part1Count: 13,
    part2Count: 7,
    hasPart2: true,
    maxScore: 33,
    description:
      'Официальный КИМ ЕГЭ-2027: 13 заданий части 1 с кратким ответом и 7 заданий части 2 (14–20) с развернутым решением.',
    sdamgiaSubdomain: 'math-ege.sdamgia.ru',
  },
  math_base: {
    id: 'math_base',
    name: 'Математика (базовая)',
    icon: '#',
    tasksCount: 21,
    durationMinutes: 180,
    part1Count: 21,
    part2Count: 0,
    hasPart2: false,
    maxScore: 21,
    description:
      'Базовый уровень: 21 задание с кратким ответом по алгебре, геометрии и реальной математике.',
    sdamgiaSubdomain: 'mathb-ege.sdamgia.ru',
  },
  russian: {
    id: 'russian',
    name: 'Русский язык',
    icon: 'Ая',
    tasksCount: 27,
    durationMinutes: 210,
    part1Count: 26,
    part2Count: 1,
    hasPart2: true,
    maxScore: 50,
    description:
      '26 тестовых заданий по нормам языка, орфографии, пунктуации и сочинение (задание 27).',
    sdamgiaSubdomain: 'rus-ege.sdamgia.ru',
  },
  physics: {
    id: 'physics',
    name: 'Физика',
    icon: 'PH',
    tasksCount: 26,
    durationMinutes: 235,
    part1Count: 20,
    part2Count: 6,
    hasPart2: true,
    maxScore: 45,
    description:
      'Механика, молекулярная физика, электродинамика, квантовая физика и качественные задачи.',
    sdamgiaSubdomain: 'phys-ege.sdamgia.ru',
  },
  social: {
    id: 'social',
    name: 'Обществознание',
    icon: 'SOC',
    tasksCount: 25,
    durationMinutes: 210,
    part1Count: 16,
    part2Count: 9,
    hasPart2: true,
    maxScore: 58,
    description:
      '16 заданий с кратким ответом и 9 заданий развернутой части по праву, экономике, политике и социологии.',
    sdamgiaSubdomain: 'soc-ege.sdamgia.ru',
  },
  informatics: {
    id: 'informatics',
    name: 'Информатика',
    icon: 'INF',
    tasksCount: 27,
    durationMinutes: 235,
    part1Count: 27,
    part2Count: 0,
    hasPart2: false,
    maxScore: 29,
    description:
      'Компьютерная форма (КЕГЭ): алгоритмы на Python, обработка файлов, динамическое программирование.',
    sdamgiaSubdomain: 'inf-ege.sdamgia.ru',
  },
  history: {
    id: 'history',
    name: 'История',
    icon: 'HIS',
    tasksCount: 22,
    durationMinutes: 210,
    part1Count: 13,
    part2Count: 9,
    hasPart2: true,
    maxScore: 42,
    description:
      'История России с древнейших времен до наших дней, всемирная история, работа с историческими картами.',
    sdamgiaSubdomain: 'hist-ege.sdamgia.ru',
  },
  biology: {
    id: 'biology',
    name: 'Биология',
    icon: 'BIO',
    tasksCount: 28,
    durationMinutes: 235,
    part1Count: 21,
    part2Count: 7,
    hasPart2: true,
    maxScore: 57,
    description:
      'Общая биология, генетика, цитология, анатомия человека, зоология, ботаника и экология.',
    sdamgiaSubdomain: 'bio-ege.sdamgia.ru',
  },
  chemistry: {
    id: 'chemistry',
    name: 'Химия',
    icon: 'CH',
    tasksCount: 34,
    durationMinutes: 210,
    part1Count: 28,
    part2Count: 6,
    hasPart2: true,
    maxScore: 56,
    description:
      'Органическая и неорганическая химия, гидролиз, окислительно-восстановительные реакции, расчетные задачи.',
    sdamgiaSubdomain: 'chem-ege.sdamgia.ru',
  },
  literature: {
    id: 'literature',
    name: 'Литература',
    icon: 'LIT',
    tasksCount: 11,
    durationMinutes: 235,
    part1Count: 10,
    part2Count: 1,
    hasPart2: true,
    maxScore: 48,
    description:
      'Анализ фрагментов эпических, драматических и лирических произведений, развернутое сочинение.',
    sdamgiaSubdomain: 'lit-ege.sdamgia.ru',
  },
  geography: {
    id: 'geography',
    name: 'География',
    icon: 'GEO',
    tasksCount: 29,
    durationMinutes: 180,
    part1Count: 21,
    part2Count: 8,
    hasPart2: true,
    maxScore: 38,
    description:
      'География России и мира, климат, геоэкология, топография и пространственный анализ.',
    sdamgiaSubdomain: 'geo-ege.sdamgia.ru',
  },
  english: {
    id: 'english',
    name: 'Английский язык',
    icon: 'EN',
    tasksCount: 38,
    durationMinutes: 190,
    part1Count: 36,
    part2Count: 2,
    hasPart2: true,
    maxScore: 82,
    description:
      'Аудирование, чтение, грамматика и лексика, развернутое письменное высказывание и эссе.',
    sdamgiaSubdomain: 'en-ege.sdamgia.ru',
  },
  german: {
    id: 'german',
    name: 'Немецкий язык',
    icon: 'DE',
    tasksCount: 38,
    durationMinutes: 190,
    part1Count: 36,
    part2Count: 2,
    hasPart2: true,
    maxScore: 82,
    description:
      'Аудирование, чтение, грамматика, письмо личного характера и проектное эссе.',
    sdamgiaSubdomain: 'de-ege.sdamgia.ru',
  },
  french: {
    id: 'french',
    name: 'Французский язык',
    icon: 'FR',
    tasksCount: 38,
    durationMinutes: 190,
    part1Count: 36,
    part2Count: 2,
    hasPart2: true,
    maxScore: 82,
    description:
      'Аудирование, понимание письменных текстов, грамматика и лексика, письменная речь.',
    sdamgiaSubdomain: 'fr-ege.sdamgia.ru',
  },
  spanish: {
    id: 'spanish',
    name: 'Испанский язык',
    icon: 'ES',
    tasksCount: 38,
    durationMinutes: 190,
    part1Count: 36,
    part2Count: 2,
    hasPart2: true,
    maxScore: 82,
    description:
      'Аудирование, лексико-грамматический тест, чтение и развернутая письменная часть.',
    sdamgiaSubdomain: 'sp-ege.sdamgia.ru',
  },
  chinese: {
    id: 'chinese',
    name: 'Китайский язык',
    icon: '中',
    tasksCount: 29,
    durationMinutes: 180,
    part1Count: 27,
    part2Count: 2,
    hasPart2: true,
    maxScore: 80,
    description:
      'Аудирование, чтение, иероглифика, лексика и грамматика, письменная речь.',
  },
};

export const EGE_SUBJECTS_LIST = Object.values(EGE_SUBJECTS);

/**
 * Поиск конфигурации предмета по ID или названию
 */
export function findSubjectConfig(idOrName?: string | null): EgeSubjectConfig {
  if (!idOrName) return EGE_SUBJECTS.math_profile;

  const trimmed = idOrName.trim().toLowerCase();

  // 1. Поиск по id
  if (EGE_SUBJECTS[trimmed]) {
    return EGE_SUBJECTS[trimmed];
  }

  // 2. Поиск по точному или частичному совпадению имени
  const found = EGE_SUBJECTS_LIST.find((s) => {
    const sName = s.name.toLowerCase();
    const sId = s.id.toLowerCase();
    return (
      sName === trimmed ||
      sId === trimmed ||
      sName.includes(trimmed) ||
      trimmed.includes(sName.replace(/\s*\([^)]*\)/, ''))
    );
  });

  return found || EGE_SUBJECTS.math_profile;
}
