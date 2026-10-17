import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma.js';
import { addXp, getLevelFromXp } from './gamificationService.js';

export function calculateLevel(xp: number): number {
  return getLevelFromXp(xp);
}

export async function awardUserXp(
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
  userId: string,
  xpToAdd: number,
  reason: string = 'Активность на платформе'
) {
  try {
    const result = await addXp(userId, xpToAdd, reason, client);
    return {
      id: userId,
      xp: result.xp,
      level: result.level,
      xpEarned: result.xpEarned,
      leveledUp: result.leveledUp,
      levelProgressPercent: result.levelProgressPercent,
      xpToNextLevel: result.xpToNextLevel,
    };
  } catch (error) {
    console.error('awardUserXp error:', error);
    return null;
  }
}
