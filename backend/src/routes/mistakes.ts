import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { awardUserXp } from '../services/xpService.js';

const router = Router();

// GET /api/mistakes — список зафиксированных ошибок ученика
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const subject = req.query.subject as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = { userId: user.id };
    if (subject) where.subject = subject;
    if (status) where.status = status.toUpperCase();

    const mistakes = await prisma.mistakeEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const unresolvedCount = await prisma.mistakeEntry.count({
      where: { userId: user.id, status: 'UNRESOLVED' },
    });

    const resolvedCount = await prisma.mistakeEntry.count({
      where: { userId: user.id, status: 'RESOLVED' },
    });

    return res.json({
      mistakes,
      stats: {
        total: mistakes.length,
        unresolvedCount,
        resolvedCount,
      },
    });
  } catch (error) {
    console.error('Get mistakes error:', error);
    return res.status(500).json({ error: 'Ошибка получения книги ошибок' });
  }
});

// POST /api/mistakes/:id/resolve — реванш: решение задачи заново
router.post('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { answer } = z.object({ answer: z.string() }).parse(req.body);

    const mistake = await prisma.mistakeEntry.findFirst({
      where: { id, userId: user.id },
    });

    if (!mistake) {
      return res.status(404).json({ error: 'Запись об ошибке не найдена' });
    }

    const normUser = answer.trim().replace(',', '.');
    const normCorrect = (mistake.correctAnswer || '').trim().replace(',', '.');

    const isCorrect = normUser && normCorrect && normUser.toLowerCase() === normCorrect.toLowerCase();

    if (isCorrect) {
      const updated = await prisma.mistakeEntry.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          userAnswer: answer,
        },
      });

      // Проверяем, остались ли еще нерешенные ошибки по этому номеру задания и предмету
      const remainingUnresolved = await prisma.mistakeEntry.count({
        where: {
          userId: user.id,
          subject: mistake.subject,
          taskNumber: mistake.taskNumber,
          status: 'UNRESOLVED',
        },
      });

      if (remainingUnresolved === 0) {
        // Находим и отмечаем связанную слабую тему как закрытую
        const weakMatches = await prisma.weakTopic.findMany({
          where: {
            userId: user.id,
            subject: mistake.subject,
            topicName: { contains: `№${mistake.taskNumber}` },
          },
        });

        if (weakMatches.length > 0) {
          await prisma.weakTopic.updateMany({
            where: {
              id: { in: weakMatches.map((w) => w.id) },
            },
            data: {
              isResolved: true,
              masteryLevel: 0.85,
              lastTestedAt: new Date(),
            },
          });
        }
      }

      // Начисляем +20 XP за успешный реванш в Книге ошибок
      const userXp = await awardUserXp(prisma, user.id, 20);

      return res.json({
        success: true,
        isCorrect: true,
        message: 'Верно! Задача успешно закрыта в книге личных ошибок (+20 XP).',
        mistake: updated,
        userXp,
      });
    }

    return res.json({
      success: true,
      isCorrect: false,
      message: 'Неверный ответ. Попробуйте еще раз или изучите теоретическую подсказку.',
      correctAnswer: mistake.correctAnswer,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка проверки ответа' });
  }
});

export default router;
