export function getLevelThreshold(level: number): number {
  if (level <= 0) return 0;
  return 5 * level * level + 5;
}

export function getLevelFromXp(xp: number): number {
  if (xp <= 10) return 1;
  const calculated = Math.ceil(Math.sqrt(Math.max(0, xp - 5) / 5));
  return Math.max(1, calculated);
}

export function getLevelRank(level: number): string {
  if (level < 100) return 'РЕКРУТ';
  if (level < 1000) return 'КУРСАНТ';
  if (level < 2000) return 'СТАЖЁР ВУЗА';
  return 'СТОБАЛЛЬНИК';
}

export interface ClientLevelTelemetry {
  xp: number;
  level: number;
  currentLevelXp: number;
  xpRequiredForLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
  status: string;
}

export function calculateClientLevelTelemetry(xp: number = 0, levelOverride?: number): ClientLevelTelemetry {
  const safeXp = Math.max(0, xp);
  const level = levelOverride ?? getLevelFromXp(safeXp);
  const prevThreshold = level === 1 ? 0 : getLevelThreshold(level - 1);
  const nextThreshold = getLevelThreshold(level);

  const currentLevelXp = Math.max(0, safeXp - prevThreshold);
  const xpRequiredForLevel = Math.max(1, nextThreshold - prevThreshold);
  const xpToNextLevel = Math.max(0, nextThreshold - safeXp);
  const levelProgressPercent = Math.min(
    100,
    Math.max(0, Math.floor((currentLevelXp / xpRequiredForLevel) * 100))
  );

  return {
    xp: safeXp,
    level,
    currentLevelXp,
    xpRequiredForLevel,
    xpToNextLevel,
    levelProgressPercent,
    status: getLevelRank(level),
  };
}
