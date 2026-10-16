import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher';

const router = Router();

// GET /api/weak-topics
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject, isResolved, all } = req.query;

    const where: Prisma.WeakTopicWhereInput = { userId: user.id };
    if (subject && typeof subject === 'string') {
      where.subject = subject;
    }
    if (isResolved === 'true') {
      where.isResolved = true;
    } else if (isResolved === 'false') {
      where.isResolved = false;
    }

    let items = await prisma.weakTopic.findMany({
      where,
      orderBy: [{ frequency: 'desc' }, { lastFailedDate: 'desc' }],
    });

    // Если конкретный предмет не запрошен и не передан флаг all=true, отдаем только темы по целевым предметам
    if (!subject && all !== 'true') {
      const targets = await prisma.targetSubject.findMany({ where: { userId: user.id } });
      const targetNames = targets.map((t) => t.subjectName);
      if (targetNames.length > 0) {
        items = items.filter((item) => isSubjectMatchingTarget(item.subject, targetNames));
      }
    }

    return res.json({ items });
  } catch (error) {
    console.error('Get weak topics error:', error);
    return res.status(500).json({ error: 'Ошибка получения слабых тем' });
  }
});

// PATCH /api/weak-topics/:id
const updateWeakTopicSchema = z.object({
  isResolved: z.boolean(),
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updateWeakTopicSchema.parse(req.body);

    const existing = await prisma.weakTopic.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Слабая тема не найдена' });
    }

    const item = await prisma.weakTopic.update({
      where: { id },
      data: {
        isResolved: data.isResolved,
      },
    });

    return res.json(item);
  } catch (error) {
    console.error('Update weak topic error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления слабой темы' });
  }
});

export default router;