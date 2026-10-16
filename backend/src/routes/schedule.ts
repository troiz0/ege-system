import { Router } from 'express';
import multer from 'multer';
import { readFileSync, unlinkSync } from 'node:fs';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { parseSchedulePdf } from '../services/ai/meshScheduleParser';
import { errText } from '../lib/errors.js';

const router = Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Только PDF файлы'));
    }
  },
});

const createScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(6),
  subject: z.string().min(1),
  originalMeshName: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  difficulty: z.enum(['low', 'medium', 'high']).default('medium'),
});

const updateScheduleSchema = createScheduleSchema.partial();

// GET /api/schedule
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    const items = await prisma.scheduleItem.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return res.json({ items });
  } catch (error) {
    console.error('Get schedule error:', error);
    return res.status(500).json({ error: 'Ошибка получения расписания' });
  }
});

// GET /api/schedule/load - hours per day
router.get('/load', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    const items = await prisma.scheduleItem.findMany({
      where: { userId: user.id },
    });

    // Calculate hours per day
    const loadByDay: Record<number, number> = {};
    
    items.forEach((item) => {
      const [startH, startM] = item.startTime.split(':').map(Number);
      const [endH, endM] = item.endTime.split(':').map(Number);
      const hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
      
      loadByDay[item.dayOfWeek] = (loadByDay[item.dayOfWeek] || 0) + hours;
    });

    return res.json({ loadByDay });
  } catch (error) {
    console.error('Get schedule load error:', error);
    return res.status(500).json({ error: 'Ошибка расчёта нагрузки' });
  }
});

// POST /api/schedule
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const data = createScheduleSchema.parse(req.body);

    const item = await prisma.scheduleItem.create({
      data: {
        userId: user.id,
        dayOfWeek: data.dayOfWeek,
        subject: data.subject,
        originalMeshName: data.originalMeshName,
        startTime: data.startTime,
        endTime: data.endTime,
        difficulty: data.difficulty,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error('Create schedule error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка создания урока' });
  }
});

// PUT /api/schedule/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updateScheduleSchema.parse(req.body);

    // Check ownership
    const existing = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    const item = await prisma.scheduleItem.update({
      where: { id },
      data,
    });

    return res.json(item);
  } catch (error) {
    console.error('Update schedule error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления урока' });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    await prisma.scheduleItem.delete({ where: { id } });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete schedule error:', error);
    return res.status(500).json({ error: 'Ошибка удаления урока' });
  }
});

// POST /api/schedule/import-pdf
router.post('/import-pdf', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const user = req.user!;

    let items;
    try {
      const buffer = readFileSync(req.file.path);
      items = await parseSchedulePdf(user, buffer);
    } finally {
      // Всегда убираем временный файл, даже если разбор упал
      try {
        unlinkSync(req.file.path);
      } catch {
        /* файл уже удалён */
      }
    }

    return res.json({ items });
  } catch (error) {
    console.error('Import schedule error:', error);
    return res.status(500).json({ error: errText(error) || 'Ошибка импорта расписания' });
  }
});

// POST /api/schedule/import-confirm
const confirmImportSchema = z.object({
  items: z.array(createScheduleSchema),
});

router.post('/import-confirm', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { items } = confirmImportSchema.parse(req.body);

    // Delete existing schedule
    await prisma.scheduleItem.deleteMany({
      where: { userId: user.id },
    });

    // Create new items
    if (items.length > 0) {
      await Promise.all(
        items.map((item) =>
          prisma.scheduleItem.create({
            data: {
              userId: user.id,
              ...item,
            },
          })
        )
      );
    }

    const saved = await prisma.scheduleItem.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return res.json({ items: saved });
  } catch (error) {
    console.error('Confirm import error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения расписания' });
  }
});

export default router;
