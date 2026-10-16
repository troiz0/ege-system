export type ScaleType = '5_point' | '10_point' | '100_point' | 'raw_fraction';
export type GapLevel = 'gap' | 'mid' | 'good';

const FIXED_MAX = { '5_point': 5, '10_point': 10, '100_point': 100 } as const;

export function resolveMax(scale: ScaleType, maxScore?: number): number | null {
  if (scale === 'raw_fraction') return maxScore !== undefined && maxScore > 0 ? maxScore : null;
  return FIXED_MAX[scale];
}

export function normalizePercent(score: number, maxScore: number): number {
  if (!(maxScore > 0) || !Number.isFinite(score)) return 0;
  const p = Math.min(100, Math.max(0, (score / maxScore) * 100));
  return Math.round(p * 10) / 10;
}

export function scoreError(scale: ScaleType, score: number, maxScore?: number): string | null {
  if (!Number.isFinite(score) || score < 0) return 'Оценка не может быть отрицательной';
  const max = resolveMax(scale, maxScore);
  if (max === null) return 'Укажите максимальный балл';
  if (score > max) return `Оценка не может быть больше ${max}`;
  return null;
}

// 3 из 5 = 60% = пробел в теме (а не "3 из 100")
export const gapLevel = (percent: number): GapLevel => (percent <= 60 ? 'gap' : percent < 75 ? 'mid' : 'good');
