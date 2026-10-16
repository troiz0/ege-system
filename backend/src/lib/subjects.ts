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
    description: 'Официальный КИМ ЕГЭ-2027 (Профиль)',
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
    description: 'Базовый уровень ЕГЭ',
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
    description: 'Официальный КИМ ЕГЭ-2027 по русскому языку',
    sdamgiaSubdomain: 'rus-ege.sdamgia.ru',
  },
  physics: {
    id: 'physics',
    name: 'Физика',
    icon: '⚛',
    tasksCount: 26,
    durationMinutes: 235,
    part1Count: 20,
    part2Count: 6,
    hasPart2: true,
    maxScore: 45,
    description: 'Физика ЕГЭ-2027',
    sdamgiaSubdomain: 'phys-ege.sdamgia.ru',
  },
  social: {
    id: 'social',
    name: 'Обществознание',
    icon: '⚖',
    tasksCount: 25,
    durationMinutes: 210,
    part1Count: 16,
    part2Count: 9,
    hasPart2: true,
    maxScore: 58,
    description: 'Обществознание ЕГЭ-2027',
    sdamgiaSubdomain: 'soc-ege.sdamgia.ru',
  },
  informatics: {
    id: 'informatics',
    name: 'Информатика',
    icon: '</>',
    tasksCount: 27,
    durationMinutes: 235,
    part1Count: 27,
    part2Count: 0,
    hasPart2: false,
    maxScore: 29,
    description: 'Компьютерный ЕГЭ (КЕГЭ)',
    sdamgiaSubdomain: 'inf-ege.sdamgia.ru',
  },
  history: {
    id: 'history',
    name: 'История',
    icon: '🏛',
    tasksCount: 22,
    durationMinutes: 210,
    part1Count: 13,
    part2Count: 9,
    hasPart2: true,
    maxScore: 42,
    description: 'История ЕГЭ-2027',
    sdamgiaSubdomain: 'hist-ege.sdamgia.ru',
  },
  biology: {
    id: 'biology',
    name: 'Биология',
    icon: '🧬',
    tasksCount: 28,
    durationMinutes: 235,
    part1Count: 21,
    part2Count: 7,
    hasPart2: true,
    maxScore: 57,
    description: 'Биология ЕГЭ-2027',
    sdamgiaSubdomain: 'bio-ege.sdamgia.ru',
  },
  chemistry: {
    id: 'chemistry',
    name: 'Химия',
    icon: '🧪',
    tasksCount: 34,
    durationMinutes: 210,
    part1Count: 28,
    part2Count: 6,
    hasPart2: true,
    maxScore: 56,
    description: 'Химия ЕГЭ-2027',
    sdamgiaSubdomain: 'chem-ege.sdamgia.ru',
  },
  literature: {
    id: 'literature',
    name: 'Литература',
    icon: '📖',
    tasksCount: 11,
    durationMinutes: 235,
    part1Count: 10,
    part2Count: 1,
    hasPart2: true,
    maxScore: 48,
    description: 'Литература ЕГЭ-2027',
    sdamgiaSubdomain: 'lit-ege.sdamgia.ru',
  },
  geography: {
    id: 'geography',
    name: 'География',
    icon: '🌍',
    tasksCount: 29,
    durationMinutes: 180,
    part1Count: 21,
    part2Count: 8,
    hasPart2: true,
    maxScore: 38,
    description: 'География ЕГЭ-2027',
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
    description: 'Английский язык ЕГЭ-2027',
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
    description: 'Немецкий язык ЕГЭ-2027',
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
    description: 'Французский язык ЕГЭ-2027',
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
    description: 'Испанский язык ЕГЭ-2027',
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
    description: 'Китайский язык ЕГЭ-2027',
  },
};

export const EGE_SUBJECTS_LIST = Object.values(EGE_SUBJECTS);

export function findSubjectConfig(idOrName?: string | null): EgeSubjectConfig {
  if (!idOrName) return EGE_SUBJECTS.math_profile;

  const trimmed = idOrName.trim().toLowerCase();
  if (EGE_SUBJECTS[trimmed]) return EGE_SUBJECTS[trimmed];

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
