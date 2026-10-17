import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { generateStudyPlan } from '../services/planService.js';
import { errText } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import { addXp } from '../services/gamificationService.js';

const router = Router();

// GET /api/plan
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { startDate, endDate } = req.query;

    const where: Prisma.StudyPlanItemWhereInput = { userId: user.id };
    const targetDate: Prisma.DateTimeFilter = {};
    if (startDate && typeof startDate === 'string') {
      targetDate.gte = new Date(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      targetDate.lte = new Date(endDate);
    }
    if (Object.keys(targetDate).length > 0) {
      where.targetDate = targetDate;
    }

    const items = await prisma.studyPlanItem.findMany({
      where,
      orderBy: { targetDate: 'asc' },
    });

    // Calculate progress
    const totalItems = items.length;
    const completedItems = items.filter((item) => item.isCompleted).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return res.json({ 
      items,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent: progressPercent,
      },
    });
  } catch (error) {
    console.error('Get plan error:', error);
    return res.status(500).json({ error: 'Ошибка получения плана' });
  }
});

// POST /api/plan/generate
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Generate new plan (clears previous items)
    const result = await generateStudyPlan(user.id);

    // Fetch the created items
    const items = await prisma.studyPlanItem.findMany({
      where: { userId: user.id },
      orderBy: { targetDate: 'asc' },
    });

    // Calculate progress
    const totalItems = items.length;
    const completedItems = items.filter((item) => item.isCompleted).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return res.json({
      items,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent: progressPercent,
      },
      demoMode: result.demoMode,
      notice: result.notice,
    });
  } catch (error) {
    console.error('Generate plan error:', error);
    return res.status(500).json({ error: errText(error) || 'Ошибка генерации плана' });
  }
});

// PATCH /api/plan/:id
const updatePlanItemSchema = z
  .object({
    isCompleted: z.boolean().optional(),
    targetDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Некорректная дата' })
      .optional(),
  })
  .refine((data) => data.isCompleted !== undefined || data.targetDate !== undefined, {
    message: 'Нужно передать isCompleted или targetDate',
  });

// POST /api/study-plan/:id/complete или /api/plan/:id/complete — +50 XP
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.studyPlanItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Элемент плана не найден' });
    }

    let gamification = null;
    let item = existing;

    if (!existing.isCompleted) {
      item = await prisma.studyPlanItem.update({
        where: { id },
        data: { isCompleted: true },
      });
      gamification = await addXp(
        user.id,
        50,
        `Выполнение темы в плане: ${existing.topic}`
      );
    }

    const allItems = await prisma.studyPlanItem.findMany({
      where: { userId: user.id },
    });
    const totalItems = allItems.length;
    const completedItems = allItems.filter((i) => i.isCompleted).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return res.json({
      item,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent: progressPercent,
      },
      gamification,
      message: gamification ? '[ +50 XP // ТЕМА ПЛАНА ВЫПОЛНЕНА ]' : 'Тема уже была отмечена',
    });
  } catch (error) {
    console.error('Complete plan item error:', error);
    return res.status(500).json({ error: 'Ошибка завершения элемента плана' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updatePlanItemSchema.parse(req.body);

    const existing = await prisma.studyPlanItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Элемент плана не найден' });
    }

    let gamification = null;
    if (data.isCompleted === true && !existing.isCompleted) {
      gamification = await addXp(
        user.id,
        50,
        `Выполнение темы в плане: ${existing.topic}`
      );
    }

    const item = await prisma.studyPlanItem.update({
      where: { id },
      data: {
        ...(data.isCompleted !== undefined ? { isCompleted: data.isCompleted } : {}),
        ...(data.targetDate !== undefined ? { targetDate: new Date(data.targetDate) } : {}),
      },
    });

    // Recalculate progress
    const allItems = await prisma.studyPlanItem.findMany({
      where: { userId: user.id },
    });
    const totalItems = allItems.length;
    const completedItems = allItems.filter((item) => item.isCompleted).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return res.json({
      item,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent: progressPercent,
      },
      gamification,
    });
  } catch (error) {
    console.error('Update plan item error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления элемента плана' });
  }
});

export default router;