// frontend/src/lib/scoreScale.ts
// Официальные шкалы перевода первичных баллов ЕГЭ в тестовые (100-балльные) по данным ФИПИ

export const FIPI_SCORE_SCALES: Record<string, number[]> = {
  // Профильная математика (максимум 32 первичных балла)
  math_profile: [
    0, 6, 11, 17, 22, 27, 34, 40, 46, 52, 58, 64, 66, 70, 72, 74, 76, 78, 80,
    82, 84, 86, 88, 90, 92, 94, 95, 96, 97, 98, 99, 100, 100,
  ],

  // Русский язык (максимум 50 первичных баллов)
  russian: [
    0, 3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28, 30, 33, 36, 38, 40, 42, 44,
    46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80,
    83, 86, 89, 91, 94, 97, 100, 100, 100, 100, 100, 100, 100, 100,
  ],

  // Физика (максимум 45 первичных баллов)
  physics: [
    0, 4, 8, 12, 15, 19, 23, 27, 30, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52,
    54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 83, 86, 89, 91,
    93, 95, 97, 98, 99, 100, 100, 100, 100,
  ],

  // Информатика (максимум 29 первичных баллов)
  informatics: [
    0, 7, 14, 20, 27, 34, 40, 44, 48, 51, 54, 58, 62, 66, 70, 73, 76, 80, 83,
    86, 88, 90, 93, 95, 97, 98, 99, 100, 100, 100,
  ],

  // Обществознание (максимум 58 первичных баллов)
  social: [
    0, 3, 5, 8, 10, 13, 15, 18, 21, 23, 26, 28, 31, 33, 36, 38, 40, 42, 44,
    46, 47, 49, 50, 52, 53, 55, 56, 58, 59, 61, 62, 64, 65, 67, 68, 70, 71,
    73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 96, 97, 98, 99, 100, 100,
    100, 100, 100, 100,
  ],
};

export function convertPrimaryToTestScore(
  subjectIdOrName: string,
  primaryScore: number,
  maxPrimary?: number
): number {
  const norm = (subjectIdOrName || '').toLowerCase().trim();

  let scaleKey = '';
  if (norm.includes('math_prof') || (norm.includes('математ') && norm.includes('проф'))) {
    scaleKey = 'math_profile';
  } else if (norm.includes('russ') || norm.includes('русск')) {
    scaleKey = 'russian';
  } else if (norm.includes('phys') || norm.includes('физик')) {
    scaleKey = 'physics';
  } else if (norm.includes('inf') || norm.includes('информ')) {
    scaleKey = 'informatics';
  } else if (norm.includes('soc') || norm.includes('обществ')) {
    scaleKey = 'social';
  }

  const scale = scaleKey ? FIPI_SCORE_SCALES[scaleKey] : null;

  if (scale) {
    const clamped = Math.max(0, Math.min(scale.length - 1, Math.round(primaryScore)));
    return scale[clamped];
  }

  const max = Math.max(1, maxPrimary || 35);
  const ratio = Math.max(0, Math.min(1, primaryScore / max));

  if (ratio <= 0.25) {
    return Math.round(ratio * 4 * 36);
  } else if (ratio <= 0.8) {
    return Math.round(36 + ((ratio - 0.25) / 0.55) * 44);
  } else {
    return Math.round(80 + ((ratio - 0.8) / 0.2) * 20);
  }
}
