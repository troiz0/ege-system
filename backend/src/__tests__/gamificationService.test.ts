import { describe, it, expect } from 'vitest';
import {
  getLevelFromXp,
  getLevelThreshold,
  calculateLevelTelemetry,
  getLevelStatus,
} from '../services/gamificationService.js';

describe('Gamification Service & Formulas', () => {
  it('correctly calculates thresholds according to specs', () => {
    // Level 1: 0–10 XP
    expect(getLevelThreshold(1)).toBe(10);
    // Level 2: 11–25 XP (25 XP needed)
    expect(getLevelThreshold(2)).toBe(25);
    // Level 3: 26–50 XP (50 XP needed)
    expect(getLevelThreshold(3)).toBe(50);
  });

  it('correctly determines user level from XP', () => {
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(10)).toBe(1);
    expect(getLevelFromXp(11)).toBe(2);
    expect(getLevelFromXp(25)).toBe(2);
    expect(getLevelFromXp(26)).toBe(3);
    expect(getLevelFromXp(50)).toBe(3);
    expect(getLevelFromXp(51)).toBe(4);
  });

  it('correctly calculates telemetry at Level 1', () => {
    const t0 = calculateLevelTelemetry(0);
    expect(t0.level).toBe(1);
    expect(t0.currentLevelXp).toBe(0);
    expect(t0.xpRequiredForLevel).toBe(10);
    expect(t0.xpToNextLevel).toBe(10);
    expect(t0.levelProgressPercent).toBe(0);

    const t5 = calculateLevelTelemetry(5);
    expect(t5.level).toBe(1);
    expect(t5.currentLevelXp).toBe(5);
    expect(t5.xpToNextLevel).toBe(5);
    expect(t5.levelProgressPercent).toBe(50);

    const t10 = calculateLevelTelemetry(10);
    expect(t10.level).toBe(1);
    expect(t10.currentLevelXp).toBe(10);
    expect(t10.xpToNextLevel).toBe(0);
    expect(t10.levelProgressPercent).toBe(100);
  });

  it('correctly calculates telemetry at Level 2', () => {
    // 11 XP -> Level 2
    const t11 = calculateLevelTelemetry(11);
    expect(t11.level).toBe(2);
    expect(t11.currentLevelXp).toBe(1);
    expect(t11.xpRequiredForLevel).toBe(15);
    expect(t11.xpToNextLevel).toBe(14);
    expect(t11.levelProgressPercent).toBe(6);

    // 25 XP -> Level 2
    const t25 = calculateLevelTelemetry(25);
    expect(t25.level).toBe(2);
    expect(t25.currentLevelXp).toBe(15);
    expect(t25.xpRequiredForLevel).toBe(15);
    expect(t25.xpToNextLevel).toBe(0);
    expect(t25.levelProgressPercent).toBe(100);
  });

  it('returns proper rank statuses', () => {
    expect(getLevelStatus(1)).toBe('РЕКРУТ');
    expect(getLevelStatus(99)).toBe('РЕКРУТ');
    expect(getLevelStatus(100)).toBe('КУРСАНТ');
    expect(getLevelStatus(999)).toBe('КУРСАНТ');
    expect(getLevelStatus(1000)).toBe('СТАЖЁР ВУЗА');
    expect(getLevelStatus(1999)).toBe('СТАЖЁР ВУЗА');
    expect(getLevelStatus(2000)).toBe('СТОБАЛЛЬНИК');
    expect(getLevelStatus(2500)).toBe('СТОБАЛЛЬНИК');
  });

  it('addXp correctly updates user and awards XP', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const { addXp } = await import('../services/gamificationService.js');
    const user = await prisma.user.findFirst();
    if (!user) return;

    const initialXp = user.xp || 0;
    const result = await addXp(user.id, 10, 'Тестовое начисление');

    expect(result.xp).toBeGreaterThanOrEqual(initialXp + 10);
    expect(result.xpEarned).toBeGreaterThanOrEqual(10);
    expect(typeof result.level).toBe('number');
    expect(typeof result.levelProgressPercent).toBe('number');
    expect(typeof result.xpToNextLevel).toBe('number');
  });
});
