import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { addXp } from '../services/gamificationService.js';

const router = Router();

const matrixTestCompleteSchema = z.object({
  subject: z.string().optional().default('Общий'),
  topic: z.string().optional().default('Тема кодификатора'),
  correctCount: z.number().int().optional().default(3),
  totalQuestions: z.number().int().optional().default(3),
});

// POST /api/matrix/test/complete — Начисление +30 XP за освоение темы в матрице
router.post('/test/complete', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const input = matrixTestCompleteSchema.parse(req.body);

    // Начисление опыта за прохождение теста в Матрице знаний
    const gamification = await addXp(
      user.id,
      30,
      `Тест в Матрице знаний: ${input.topic} (${input.subject})`
    );

    // Если указана конкретная тема — обновляем статус в WeakTopic
    if (input.topic && input.subject) {
      try {
        const existingWeakTopic = await prisma.weakTopic.findUnique({
          where: {
            userId_subject_topicName: {
              userId: user.id,
              subject: input.subject,
              topicName: input.topic,
            },
          },
        });

        if (existingWeakTopic) {
          const newMastery = Math.min(1.0, (existingWeakTopic.masteryLevel ?? 0.3) + 0.3);
          await prisma.weakTopic.update({
            where: { id: existingWeakTopic.id },
            data: {
              masteryLevel: newMastery,
              isResolved: newMastery >= 0.8,
              lastTestedAt: new Date(),
            },
          });
        } else {
          await prisma.weakTopic.create({
            data: {
              userId: user.id,
              subject: input.subject,
              topicName: input.topic,
              masteryLevel: 0.85,
              isResolved: true,
              lastTestedAt: new Date(),
            },
          });
        }
      } catch (err) {
        console.warn('Failed to update WeakTopic on matrix test complete:', err);
      }
    }

    return res.json({
      success: true,
      message: '[ +30 XP // ТЕМА ОСВОЕНА ]',
      xpEarned: 30,
      gamification,
    });
  } catch (error) {
    console.error('Matrix test complete error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные теста', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения результата теста матрицы' });
  }
});

export default router;
