import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const createSimulationSchema = z.object({
  subject: z.string().min(1),
  variantNumber: z.number().int().optional().default(1),
  targetScore: z.number().int().min(0).max(100),
  actualScore: z.number().int().min(0).max(100).optional().nullable(),
  timeSpentSeconds: z.number().int().min(0),
  answers: z.record(z.string()),
  feedback: z.string().optional().nullable(),
  status: z.enum(['COMPLETED', 'IN_PROGRESS']).optional().default('COMPLETED'),
});

// POST /api/exam-simulations
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const input = createSimulationSchema.parse(req.body);

    const simulation = await prisma.examSimulation.create({
      data: {
        userId: user.id,
        subject: input.subject,
        variantNumber: input.variantNumber,
        targetScore: input.targetScore,
        actualScore: input.actualScore,
        timeSpentSeconds: input.timeSpentSeconds,
        answers: JSON.stringify(input.answers),
        feedback: input.feedback,
        status: input.status,
      },
    });

    return res.json(simulation);
  } catch (error) {
    console.error('Create exam simulation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные симуляции', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения результатов симулятора экзамена' });
  }
});

// GET /api/exam-simulations
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const items = await prisma.examSimulation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return res.json({ items });
  } catch (error) {
    console.error('Get exam simulations error:', error);
    return res.status(500).json({ error: 'Ошибка получения симуляций' });
  }
});

// GET /api/exam-simulations/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const simulation = await prisma.examSimulation.findUnique({
      where: { id },
    });
    if (!simulation || simulation.userId !== user.id) {
      return res.status(404).json({ error: 'Симуляция экзамена не найдена' });
    }
    return res.json(simulation);
  } catch (error) {
    console.error('Get exam simulation by id error:', error);
    return res.status(500).json({ error: 'Ошибка получения симуляции' });
  }
});

export default router;
