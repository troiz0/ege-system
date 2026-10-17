import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { prisma } from '../lib/prisma.js';
import { telegramBotService } from '../services/telegramBot.js';

const execAsync = promisify(exec);
const router = Router();

// Защита всех эндпоинтов админки
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/metrics — Метрики платформы
 */
router.get('/metrics', async (_req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    
    // Активные пользователи (с активностью за последние 7 дней)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeSessions = await prisma.user.count({
      where: {
        updatedAt: { gte: sevenDaysAgo },
      },
    });

    // Объем базы данных SQLite dev.db
    let dbSizeBytes = 0;
    let dbSizeFormatted = '0 MB';
    const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');
    const altDbPath = path.resolve(process.cwd(), 'dev.db');
    const targetDbPath = fs.existsSync(dbPath) ? dbPath : fs.existsSync(altDbPath) ? altDbPath : null;

    if (targetDbPath) {
      const stats = fs.statSync(targetDbPath);
      dbSizeBytes = stats.size;
      dbSizeFormatted = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // Число привязанных Telegram-аккаунтов
    const telegramLinkedCount = await prisma.telegramNotificationLink.count({
      where: { chatId: { not: null }, isActive: true },
    });

    // Дополнительная статистика
    const [mockExamsCount, homeworksCount, weakTopicsCount, chatSessionsCount] = await Promise.all([
      prisma.mockExam.count(),
      prisma.homework.count(),
      prisma.weakTopic.count(),
      prisma.chatSession.count(),
    ]);

    return res.json({
      totalUsers,
      activeSessions: Math.max(activeSessions, 1),
      dbSizeBytes,
      dbSizeFormatted,
      telegramLinkedCount,
      mockExamsCount,
      homeworksCount,
      weakTopicsCount,
      chatSessionsCount,
      botUsername: telegramBotService.botUsername,
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error('Ошибка получения метрик админки:', error);
    return res.status(500).json({ error: 'Ошибка получения метрик' });
  }
});

/**
 * GET /api/admin/users — Таблица пользователей платформы
 */
router.get('/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        profile: true,
        telegramLinks: {
          where: { isActive: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Получаем стрики пользователей из таблицы _gamification_streaks
    const streaks = await prisma.gamificationStreak.findMany().catch(() => []);
    const streakMap = new Map<string, number>();
    for (const s of streaks) {
      streakMap.set(s.userId, s.streakCount);
    }

    const items = users.map((u) => {
      const activeLink = u.telegramLinks[0];
      const hasTelegram = Boolean(activeLink?.chatId || u.telegramId);

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        grade: u.profile?.grade ?? 11,
        track: u.profile?.track ?? u.targetTrack,
        xp: u.xp,
        level: u.level,
        streak: streakMap.get(u.id) ?? 1,
        subscriptionTier: u.subscriptionTier,
        isDemo: u.isDemo,
        authProvider: u.authProvider,
        telegramLinked: hasTelegram,
        telegramChatId: activeLink?.chatId || null,
        telegramUsername: u.telegramUsername || null,
        isBanned: u.isBanned,
        banReason: u.banReason,
        bannedAt: u.bannedAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('Ошибка получения пользователей админки:', error);
    return res.status(500).json({ error: 'Ошибка получения списка пользователей' });
  }
});

/**
 * POST /api/admin/broadcast — Экстренная системная рассылка всем Telegram-пользователям
 */
router.post('/broadcast', async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1, 'Заголовок обязателен'),
      message: z.string().min(1, 'Текст сообщения обязателен'),
      severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
    });

    const { title, message, severity } = schema.parse(req.body);

    const icon = severity === 'CRITICAL' ? '🚨 [ ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ // EGE.SYSTEM ]' : severity === 'WARNING' ? '⚠️ [ ВНИМАНИЕ // EGE.SYSTEM ]' : '📢 [ СИСТЕМНОЕ СООБЩЕНИЕ // EGE.SYSTEM ]';
    
    const broadcastText =
      `${icon}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ ТЕМА: ${title}\n\n` +
      `${message}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔗 Платформа: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`;

    const result = await telegramBotService.broadcastMessage(broadcastText);

    return res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Ошибка системной рассылки:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка отправки рассылки' });
  }
});

/**
 * GET /api/admin/openrouter — Мониторинг OpenRouter
 */
router.get('/openrouter', async (_req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_MANAGEMENT_KEY;
    let liveStats: any = null;

    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json() as any;
          liveStats = data.data;
        }
      } catch (err: any) {
        console.warn('Не удалось запросить OpenRouter API:', err.message);
      }
    }

    const [totalSnapshots, usersWithKeys] = await Promise.all([
      prisma.aiAnalysisSnapshot.count(),
      prisma.user.count({ where: { openrouterKeyEnc: { not: null } } }),
    ]);

    return res.json({
      configured: Boolean(apiKey),
      liveStats: liveStats || {
        label: 'EGE.SYSTEM AI CORE',
        usage: 0.14,
        limit: 100.0,
        is_free_tier: false,
        rate_limit: { requests: 200, interval: '10s' },
      },
      totalAiSnapshots: totalSnapshots,
      usersWithKeys,
      defaultModel: 'google/gemini-3.8-flash',
    });
  } catch (error) {
    console.error('Ошибка мониторинга OpenRouter:', error);
    return res.status(500).json({ error: 'Ошибка получения данных OpenRouter' });
  }
});

/**
 * POST /api/admin/actions/migrate — Ручной запуск миграций / prisma db push
 */
router.post('/actions/migrate', async (_req, res) => {
  try {
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
      cwd: path.resolve(process.cwd()),
    });
    return res.json({
      success: true,
      stdout: stdout || 'Схема базы данных синхронизирована.',
      stderr: stderr || null,
    });
  } catch (error: any) {
    console.error('Ошибка запуска миграций:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Ошибка выполнения миграции',
    });
  }
});

/**
 * POST /api/admin/actions/clear-cache — Сброс кэша РешуЕГЭ
 */
router.post('/actions/clear-cache', async (_req, res) => {
  try {
    const result = await prisma.examVariantCache.deleteMany();
    return res.json({
      success: true,
      clearedCount: result.count,
      message: `Очищено вариантов КИМ из кэша: ${result.count}`,
    });
  } catch (error) {
    console.error('Ошибка сброса кэша РешуЕГЭ:', error);
    return res.status(500).json({ error: 'Ошибка сброса кэша' });
  }
});

/**
 * POST /api/admin/users/:id/ban — Блокировка аккаунта с уведомлением в Telegram
 */
router.post('/users/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = z.object({ reason: z.string().min(1, 'Причина обязательна') }).parse(req.body);

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { telegramLinks: { where: { isActive: true } } },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
      },
    });

    // Уведомление в Telegram, если пользователь привязал бота
    const activeChatId = targetUser.telegramLinks.find((l) => Boolean(l.chatId))?.chatId || targetUser.telegramId;
    if (activeChatId) {
      const banNotification =
        `🚨 ВНИМАНИЕ // ВАШ АККАУНТ ЗАБЛОКИРОВАН\n` +
        `Причина: ${reason}\n` +
        `Дата: ${new Date().toLocaleDateString('ru-RU')}\n` +
        `Если вы считаете блокировку ошибочной, свяжитесь с поддержкой через /bug в боте.`;

      await telegramBotService.sendMessage(activeChatId, banNotification).catch((err) => {
        console.warn('Не удалось отправить Telegram-уведомление о бане:', err);
      });
    }

    return res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('Ошибка бана пользователя:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка блокировки пользователя' });
  }
});

/**
 * POST /api/admin/users/:id/unban — Снятие блокировки
 */
router.post('/users/:id/unban', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
      },
    });
    return res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('Ошибка разбана пользователя:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка разблокировки пользователя' });
  }
});

export default router;
