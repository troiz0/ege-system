import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { telegramBotService } from '../services/telegramBot.js';

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

// POST /api/telegram/token — сгенерировать токен для бота
router.post('/token', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const role = (req.body?.role as string) || 'parent';
    const token = await telegramBotService.createLinkToken(user.id, role);
    return res.json({ token });
  } catch (error) {
    console.error('Telegram token error:', error);
    return res.status(500).json({ error: 'Ошибка создания токена Telegram' });
  }
});

// POST /api/telegram/link — привязать chatId (вызов от webhook или симуляции)
router.post('/link', async (req, res) => {
  try {
    const { token, chatId } = z.object({ token: z.string(), chatId: z.string() }).parse(req.body);
    const updated = await telegramBotService.linkChatId(token, chatId);
    return res.json({ success: true, link: updated });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка привязки Telegram' });
  }
});

// POST /api/telegram/simulate-digest — отправка/генерация еженедельного дайджеста
router.post('/simulate-digest', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const message = await telegramBotService.compileWeeklyDigest(user.id);
    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Ошибка генерации дайджеста' });
  }
});

// POST /api/telegram/simulate-alert — симуляция тревожного алерта родителям
router.post('/simulate-alert', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const schema = z.object({
      type: z.enum(['BAD_GRADE', 'EXAM_DROP', 'HOMEWORK_OVERDUE']),
      title: z.string(),
      details: z.string(),
      severity: z.enum(['WARNING', 'CRITICAL']).default('WARNING'),
    });
    const data = schema.parse(req.body);
    const message = await telegramBotService.compileAlertMessage(user.id, data);
    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка генерации алерта' });
  }
});

export default router;
