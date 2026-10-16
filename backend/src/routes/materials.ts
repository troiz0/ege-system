import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { generateMaterialForTopic, ensureFormulasImage } from '../services/ai/materialsService';
import { errText } from '../lib/errors.js';
import { Prisma } from '@prisma/client';

const router = Router();

// GET /api/materials
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject, topicName } = req.query;

    const where: Prisma.TopicStudyMaterialWhereInput = { userId: user.id };
    if (subject && typeof subject === 'string') {
      where.subject = subject;
    }
    if (topicName && typeof topicName === 'string') {
      where.topicName = topicName;
    }

    const items = await prisma.topicStudyMaterial.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Ленивая добивка картинок формул для старых строк
    const withImages = await Promise.all(
      items.map(async (item) => ({
        ...item,
        formulasImage: item.formulasImage ?? (await ensureFormulasImage(item)),
      }))
    );

    return res.json({ items: withImages });
  } catch (error) {
    console.error('Get materials error:', error);
    return res.status(500).json({ error: 'Ошибка получения материалов' });
  }
});

// GET /api/materials/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const item = await prisma.topicStudyMaterial.findUnique({ where: { id } });

    if (!item || item.userId !== user.id) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    const formulasImage = item.formulasImage ?? (await ensureFormulasImage(item));

    return res.json({ ...item, formulasImage });
  } catch (error) {
    console.error('Get material by id error:', error);
    return res.status(500).json({ error: 'Ошибка получения материала' });
  }
});

// POST /api/materials/generate
const generateMaterialSchema = z.object({
  subject: z.string().min(1),
  topicName: z.string().min(1),
});

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject, topicName } = generateMaterialSchema.parse(req.body);

    // Check if material already exists (cache)
    const existing = await prisma.topicStudyMaterial.findUnique({
      where: {
        userId_subject_topicName: {
          userId: user.id,
          subject,
          topicName,
        },
      },
    });

    if (existing) {
      const formulasImage =
        existing.formulasImage ?? (await ensureFormulasImage(existing));
      return res.json({ material: { ...existing, formulasImage }, cached: true });
    }

    // Generate new material (service saves it to the database)
    const material = await generateMaterialForTopic(user, subject, topicName);

    return res.status(201).json({
      material,
      cached: false,
      demoMode: material.demoMode,
      notice: material.notice,
    });
  } catch (error) {
    console.error('Generate material error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: errText(error) || 'Ошибка генерации материала' });
  }
});

export default router;