import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma.js';

export interface GamificationTelemetry {
  xp: number;
  level: number;
  currentLevelXp: number;
  xpRequiredForLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
  status: string;
}

export interface AddXpResult extends GamificationTelemetry {
  xpEarned: number;
  leveledUp: boolean;
  streakBonus: number;
  currentStreak: number;
  reason: string;
}

/**
 * Пороговые значения опыта по уровням:
 * Уровень 1: 0–10 XP (порог 10 XP)
 * Уровень 2: 11–25 XP (порог 25 XP)
 * Уровень 3: 26–50 XP (порог 50 XP)
 * Формула порога: cumulative threshold = 5 * level^2 + 5
 */
export function getLevelThreshold(level: number): number {
  if (level <= 0) return 0;
  return 5 * level * level + 5;
}

export function getLevelFromXp(xp: number): number {
  if (xp <= 10) return 1;
  const calculated = Math.ceil(Math.sqrt(Math.max(0, xp - 5) / 5));
  return Math.max(1, calculated);
}

export function getLevelStatus(level: number): string {
  if (level < 100) return 'РЕКРУТ';
  if (level < 1000) return 'КУРСАНТ';
  if (level < 2000) return 'СТАЖЁР ВУЗА';
  return 'СТОБАЛЛЬНИК';
}

export function calculateLevelTelemetry(xp: number, currentLevel?: number): GamificationTelemetry {
  const safeXp = Math.max(0, xp || 0);
  const level = currentLevel ?? getLevelFromXp(safeXp);
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
    status: getLevelStatus(level),
  };
}

let tableEnsured = false;
async function ensureStreakTable(client: PrismaClient | Prisma.TransactionClient) {
  if (tableEnsured) return;
  try {
    await (client as PrismaClient).$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS _gamification_streaks (user_id TEXT PRIMARY KEY, streak_count INTEGER DEFAULT 1, last_action_date TEXT, last_bonus_date TEXT)'
    );
    tableEnsured = true;
  } catch (err) {
    console.warn('Failed to ensure _gamification_streaks table:', err);
  }
}

/**
 * Проверка и расчет стрика активности (бонус за стрик от 2 дней: +10 XP * текущий стрик при первом действии за день)
 */
async function processStreakBonus(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient
): Promise<{ streakBonus: number; currentStreak: number }> {
  try {
    await ensureStreakTable(client);

    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const rows = await (client as PrismaClient).$queryRawUnsafe<
      Array<{
        user_id: string;
        streak_count: number;
        last_action_date: string | null;
        last_bonus_date: string | null;
      }>
    >('SELECT user_id, streak_count, last_action_date, last_bonus_date FROM _gamification_streaks WHERE user_id = ?', userId);

    if (!rows || rows.length === 0) {
      // Первое зафиксированное действие в системе стриков
      // Проверяем, была ли вчера активность в БД
      const hadActivityYesterday = await checkRecentDbActivity(userId, yesterday, client);
      const streak = hadActivityYesterday ? 2 : 1;
      const streakBonus = streak >= 2 ? streak * 10 : 0;
      const lastBonusDate = streakBonus > 0 ? today : null;

      await (client as PrismaClient).$executeRawUnsafe(
        'INSERT INTO _gamification_streaks (user_id, streak_count, last_action_date, last_bonus_date) VALUES (?, ?, ?, ?)',
        userId,
        streak,
        today,
        lastBonusDate
      );

      return { streakBonus, currentStreak: streak };
    }

    const rec = rows[0];
    let streak = rec.streak_count || 1;
    let streakBonus = 0;
    let updateBonusDate = rec.last_bonus_date;

    if (rec.last_action_date === today) {
      // Действие в тот же день: стрик сохраняется, бонус уже выдан ранее
      return { streakBonus: 0, currentStreak: streak };
    } else if (rec.last_action_date === yesterday) {
      // Непрерывный стрик (следующий день)
      streak += 1;
      if (rec.last_bonus_date !== today && streak >= 2) {
        streakBonus = streak * 10;
        updateBonusDate = today;
      }
    } else {
      // Пропущен хотя бы один день — стрик сбрасывается на 1
      streak = 1;
      streakBonus = 0;
    }

    await (client as PrismaClient).$executeRawUnsafe(
      'UPDATE _gamification_streaks SET streak_count = ?, last_action_date = ?, last_bonus_date = ? WHERE user_id = ?',
      streak,
      today,
      updateBonusDate,
      userId
    );

    return { streakBonus, currentStreak: streak };
  } catch (error) {
    console.warn('Streak bonus processing error:', error);
    return { streakBonus: 0, currentStreak: 1 };
  }
}

async function checkRecentDbActivity(
  userId: string,
  targetDateIso: string,
  client: PrismaClient | Prisma.TransactionClient
): Promise<boolean> {
  try {
    const start = new Date(`${targetDateIso}T00:00:00.000Z`);
    const end = new Date(`${targetDateIso}T23:59:59.999Z`);

    const [tests, mocks, homeworks] = await Promise.all([
      (client as PrismaClient).testResult.findFirst({
        where: { userId, testDate: { gte: start, lte: end } },
        select: { id: true },
      }),
      (client as PrismaClient).mockExam.findFirst({
        where: { userId, examDate: { gte: start, lte: end } },
        select: { id: true },
      }),
      (client as PrismaClient).homework.findFirst({
        where: { userId, createdAt: { gte: start, lte: end } },
        select: { id: true },
      }),
    ]);

    return Boolean(tests || mocks || homeworks);
  } catch {
    return false;
  }
}

/**
 * Основной метод начисления XP:
 * - Добавляет базовый XP за выполненное действие.
 * - Проверяет стрик от 2 дней и начисляет ежедневный бонус (+10 XP * стрик).
 * - Автоматически рассчитывает и повышает level пользователя.
 * - Сохраняет обновленные данные в SQLite.
 */
export async function addXp(
  userId: string,
  amount: number,
  reason: string = 'Действие на платформе',
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma
): Promise<AddXpResult> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, xp: true, level: true },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Расчет стрика и бонуса за ежедневную активность
  const { streakBonus, currentStreak } = await processStreakBonus(userId, client);

  const baseAmount = Math.max(0, amount);
  const totalAwarded = baseAmount + streakBonus;

  const oldXp = user.xp || 0;
  const newXp = oldXp + totalAwarded;
  const newLevel = getLevelFromXp(newXp);
  const leveledUp = newLevel > (user.level || 1);

  await client.user.update({
    where: { id: userId },
    data: {
      xp: newXp,
      level: newLevel,
    },
  });

  const telemetry = calculateLevelTelemetry(newXp, newLevel);

  return {
    ...telemetry,
    xpEarned: totalAwarded,
    leveledUp,
    streakBonus,
    currentStreak,
    reason,
  };
}

export const gamificationService = {
  addXp,
  getLevelFromXp,
  getLevelThreshold,
  getLevelStatus,
  calculateLevelTelemetry,
};

export default gamificationService;
