import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { awardUserXp } from '../services/xpService';

const router = Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    cb(null, safeName);
  },
});

const uploadPhoto = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Можно прикреплять только фото (PNG, JPEG, WebP)'));
    }
  },
});

// Helper function to normalize percent
function normalizePercent(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  const percent = (score / maxScore) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

const createTestSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  scaleType: z.enum(['5_point', '10_point', '100_point', 'raw_fraction']).default('5_point'),
  score: z.number(),
  maxScore: z.number().default(5),
  testDate: z.string().datetime(),
  mistakeTopics: z.array(z.string()).optional(),
  comment: z.string().optional(),
});

const updateTestSchema = createTestSchema.partial();

// GET /api/tests
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject } = req.query;

    const where: Prisma.TestResultWhereInput = { userId: user.id };
    if (subject && typeof subject === 'string') {
      where.subject = subject;
    }

    const items = await prisma.testResult.findMany({
      where,
      orderBy: { testDate: 'desc' },
    });

    return res.json({ items });
  } catch (error) {
    console.error('Get tests error:', error);
    return res.status(500).json({ error: 'Ошибка получения оценок' });
  }
});

// GET /api/tests/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const item = await prisma.testResult.findUnique({ where: { id } });

    if (!item || item.userId !== user.id) {
      return res.status(404).json({ error: 'Оценка не найдена' });
    }

    return res.json(item);
  } catch (error) {
    console.error('Get test by id error:', error);
    return res.status(500).json({ error: 'Ошибка получения оценки' });
  }
});

// POST /api/tests
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const data = createTestSchema.parse(req.body);

    // Calculate normalized percent
    const normalizedPercent = normalizePercent(data.score, data.maxScore);

    const item = await prisma.testResult.create({
      data: {
        userId: user.id,
        subject: data.subject,
        title: data.title,
        scaleType: data.scaleType,
        score: data.score,
        maxScore: data.maxScore,
        normalizedPercent,
        testDate: new Date(data.testDate),
        mistakeTopics: data.mistakeTopics ? JSON.stringify(data.mistakeTopics) : null,
        comment: data.comment,
      },
    });

    // Update weak topics
    if (data.mistakeTopics && data.mistakeTopics.length > 0) {
      const uniqueMistakes = Array.from(new Set(data.mistakeTopics));
      await Promise.all(
        uniqueMistakes.map((topicName) =>
          prisma.weakTopic.upsert({
            where: {
              userId_subject_topicName: {
                userId: user.id,
                subject: data.subject,
                topicName,
              },
            },
            update: {
              frequency: { increment: 1 },
              lastFailedDate: new Date(data.testDate),
            },
            create: {
              userId: user.id,
              subject: data.subject,
              topicName,
              frequency: 1,
              lastFailedDate: new Date(data.testDate),
            },
          })
        )
      );
    }

    // Начисляем XP за внесение/решение проверочной работы (+15 XP)
    const userXp = await awardUserXp(prisma, user.id, 15);

    return res.status(201).json({ ...item, userXp });
  } catch (error) {
    console.error('Create test error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка создания оценки' });
  }
});

// PUT /api/tests/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updateTestSchema.parse(req.body);

    const existing = await prisma.testResult.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Оценка не найдена' });
    }

    // Recalculate normalized percent if score changed
    let normalizedPercent = existing.normalizedPercent;
    if (data.score !== undefined || data.maxScore !== undefined) {
      const score = data.score ?? existing.score;
      const maxScore = data.maxScore ?? existing.maxScore;
      normalizedPercent = normalizePercent(score, maxScore);
    }

    const item = await prisma.testResult.update({
      where: { id },
      data: {
        ...data,
        normalizedPercent,
        testDate: data.testDate ? new Date(data.testDate) : undefined,
        mistakeTopics: data.mistakeTopics ? JSON.stringify(data.mistakeTopics) : undefined,
      },
    });

    return res.json(item);
  } catch (error) {
    console.error('Update test error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления оценки' });
  }
});

// POST /api/tests/:id/attachment — прикрепить фото работы
router.post('/:id/attachment', requireAuth, uploadPhoto.single('file'), async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const existing = await prisma.testResult.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Оценка не найдена' });
    }

    const item = await prisma.testResult.update({
      where: { id },
      data: { photoPath: req.file.path.replace(/\\/g, '/') },
    });

    return res.json(item);
  } catch (error) {
    console.error('Upload test photo error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки фото' });
  }
});

// DELETE /api/tests/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.testResult.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Оценка не найдена' });
    }

    await prisma.testResult.delete({ where: { id } });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete test error:', error);
    return res.status(500).json({ error: 'Ошибка удаления оценки' });
  }
});

export default router;