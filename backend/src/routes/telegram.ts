import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { telegramBotService } from '../services/telegramBot.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /api/telegram/status — статус привязки Telegram
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const status = await telegramBotService.getStatus(user.id);
    return res.json(status);
  } catch (error) {
    console.error('Telegram status error:', error);
    return res.status(500).json({ error: 'Ошибка получения статуса Telegram' });
  }
});

// POST /api/telegram/token — сгенерировать токен для бота и диплинк
router.post('/token', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const role = (req.body?.role as string) || 'parent';
    const result = await telegramBotService.createLinkToken(user.id, role);
    return res.json({
      token: result.token,
      botUsername: result.botUsername,
      linkUrl: result.linkUrl,
      instructions: `Откройте ссылку или отправьте боту @${result.botUsername} команду /start link_${result.token}`,
    });
  } catch (error) {
    console.error('Telegram token error:', error);
    return res.status(500).json({ error: 'Ошибка создания токена Telegram' });
  }
});

// POST /api/telegram/link — привязать chatId
router.post('/link', async (req, res) => {
  try {
    const { token, chatId } = z.object({ token: z.string(), chatId: z.string() }).parse(req.body);
    const updated = await telegramBotService.linkChatId(token, chatId);
    return res.json({ success: true, link: updated });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка привязки Telegram' });
  }
});

// POST /api/telegram/simulate-digest — отправка РЕАЛЬНОГО еженедельного дайджеста в Telegram
router.post('/simulate-digest', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const message = await telegramBotService.compileWeeklyDigest(user.id);

    // Ищем привязанный chatId пользователя
    const links = await prisma.telegramNotificationLink.findMany({
      where: { userId: user.id, isActive: true },
    });
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true } });
    const targetChat = links.find((l) => Boolean(l.chatId))?.chatId || userRecord?.telegramId || process.env.TELEGRAM_ADMIN_CHAT_ID;

    let sendResult = null;
    if (targetChat) {
      sendResult = await telegramBotService.sendWeeklyDigest(targetChat, null, user.id);
    }

    return res.json({
      success: true,
      message,
      sentTo: targetChat || null,
      delivered: Boolean(sendResult?.success),
      sendResult,
    });
  } catch (error: any) {
    console.error('Error simulating digest:', error);
    return res.status(500).json({ error: error?.message || 'Ошибка генерации дайджеста' });
  }
});

// POST /api/telegram/simulate-alert — отправка РЕАЛЬНОГО тревожного алерта в Telegram
router.post('/simulate-alert', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const schema = z.object({
      type: z.enum(['BAD_GRADE', 'EXAM_DROP', 'HOMEWORK_OVERDUE']).default('EXAM_DROP'),
      title: z.string().default('Проседание среднего балла по профильной математике'),
      details: z.string().default('Результат последнего пробного варианта: 54 балла (-14 к предыдущему). Обнаружены критические ошибки в заданиях №13 и №15.'),
      severity: z.enum(['WARNING', 'CRITICAL']).default('WARNING'),
      dropType: z.string().optional(),
    });
    const parsed = schema.parse(req.body);

    const alertData = {
      type: parsed.type,
      title: parsed.title,
      details: parsed.details,
      severity: parsed.severity,
    };

    const message = await telegramBotService.compileAlertMessage(user.id, alertData);

    const links = await prisma.telegramNotificationLink.findMany({
      where: { userId: user.id, isActive: true },
    });
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true } });
    const targetChat = links.find((l) => Boolean(l.chatId))?.chatId || userRecord?.telegramId || process.env.TELEGRAM_ADMIN_CHAT_ID;

    let sendResult = null;
    if (targetChat) {
      sendResult = await telegramBotService.sendEmergencyAlert(targetChat, alertData, user.id);
    }

    return res.json({
      success: true,
      message,
      sentTo: targetChat || null,
      delivered: Boolean(sendResult?.success),
      sendResult,
    });
  } catch (error: any) {
    console.error('Error simulating alert:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка генерации алерта' });
  }
});

export default router;
