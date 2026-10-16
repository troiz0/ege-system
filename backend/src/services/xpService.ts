import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma.js';

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

export async function awardUserXp(
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
  userId: string,
  xpToAdd: number
) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, xp: true, level: true },
  });
  if (!user) return null;

  const currentXp = user.xp || 0;
  const newXp = Math.max(0, currentXp + xpToAdd);
  const newLevel = calculateLevel(newXp);

  return client.user.update({
    where: { id: userId },
    data: {
      xp: newXp,
      level: newLevel,
    },
    select: {
      id: true,
      xp: true,
      level: true,
    },
  });
}
