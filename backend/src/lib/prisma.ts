import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Оптимизация SQLite: WAL-режим и асинхронный commit NORMAL для устранения SQLITE_BUSY
prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch((err) => {
  console.error('Failed to set PRAGMA journal_mode = WAL:', err);
});
prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch((err) => {
  console.error('Failed to set PRAGMA synchronous = NORMAL:', err);
});
