import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import path from 'node:path';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import { parseHomeworkText } from '../services/ai/meshHomeworkParser';
import { analyzeAttachment } from '../services/ai/attachmentAnalyzer';
import { explainMeshAttachment } from '../services/ai/meshExplain';
import { errText } from '../lib/errors.js';
import { Prisma } from '@prisma/client';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

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
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'));
    }
  },
});

const createHomeworkSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().datetime(),
  estimatedMinutes: z.number().int().min(1).default(30),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['pending', 'completed']).default('pending'),
});

const updateHomeworkSchema = createHomeworkSchema.partial();

// GET /api/homework
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status } = req.query;

    const where: Prisma.HomeworkWhereInput = { userId: user.id };
    if (status === 'pending' || status === 'completed') {
      where.status = status;
    }

    const items = await prisma.homework.findMany({
      where,
      orderBy: { deadline: 'asc' },
    });

    return res.json({ items });
  } catch (error) {
    console.error('Get homework error:', error);
    return res.status(500).json({ error: 'Ошибка получения домашних заданий' });
  }
});

// GET /api/homework/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const item = await prisma.homework.findUnique({ where: { id } });

    if (!item || item.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    return res.json(item);
  } catch (error) {
    console.error('Get homework by id error:', error);
    return res.status(500).json({ error: 'Ошибка получения задания' });
  }
});

// POST /api/homework
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const data = createHomeworkSchema.parse(req.body);

    const item = await prisma.homework.create({
      data: {
        userId: user.id,
        subject: data.subject,
        title: data.title,
        description: data.description,
        deadline: new Date(data.deadline),
        estimatedMinutes: data.estimatedMinutes,
        priority: data.priority,
        status: data.status,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error('Create homework error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка создания задания' });
  }
});

// PATCH /api/homework/:id — точечное переключение статуса (чекбокс в UI)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const parsed = z
      .object({
        isDone: z.boolean().optional(),
        status: z.enum(['pending', 'completed']).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success || (parsed.data.isDone === undefined && !parsed.data.status)) {
      return res.status(400).json({ error: 'Некорректные данные' });
    }

    const existing = await prisma.homework.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    const status =
      parsed.data.status ?? (parsed.data.isDone ? 'completed' : 'pending');
    const item = await prisma.homework.update({ where: { id }, data: { status } });
    return res.json(item);
  } catch (error) {
    console.error('Patch homework error:', error);
    return res.status(500).json({ error: 'Ошибка обновления задания' });
  }
});

// PUT /api/homework/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updateHomeworkSchema.parse(req.body);

    const existing = await prisma.homework.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    const item = await prisma.homework.update({
      where: { id },
      data: {
        ...data,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
      },
    });

    return res.json(item);
  } catch (error) {
    console.error('Update homework error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления задания' });
  }
});

// DELETE /api/homework/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.homework.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    await prisma.homework.delete({ where: { id } });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete homework error:', error);
    return res.status(500).json({ error: 'Ошибка удаления задания' });
  }
});

// POST /api/homework/parse-text
const parseTextSchema = z.object({
  text: z.string().min(1),
});

router.post('/parse-text', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { text } = parseTextSchema.parse(req.body);

    const items = await parseHomeworkText(user, text);

    return res.json({ items });
  } catch (error) {
    console.error('Parse homework text error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: errText(error) || 'Ошибка парсинга домашних заданий' });
  }
});

// POST /api/homework/import-confirm
const confirmImportSchema = z.object({
  items: z.array(createHomeworkSchema),
});

router.post('/import-confirm', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { items } = confirmImportSchema.parse(req.body);

    if (items.length > 0) {
      await Promise.all(
        items.map((item) =>
          prisma.homework.create({
            data: {
              userId: user.id,
              subject: item.subject,
              title: item.title,
              description: item.description,
              deadline: new Date(item.deadline),
              estimatedMinutes: item.estimatedMinutes,
              priority: item.priority,
              status: item.status,
            },
          })
        )
      );
    }

    const saved = await prisma.homework.findMany({
      where: { userId: user.id },
      orderBy: { deadline: 'asc' },
    });

    return res.json({ items: saved });
  } catch (error) {
    console.error('Confirm homework import error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения заданий' });
  }
});

// POST /api/homework/:id/attachment
router.post('/:id/attachment', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const existing = await prisma.homework.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    // Check file limit for FREE users
    if (user.subscriptionTier === 'FREE') {
      const fileCount = await prisma.homework.count({
        where: {
          userId: user.id,
          hasAttachment: true,
        },
      });

      if (fileCount >= 5 && !existing.hasAttachment) {
        return res.status(403).json({ 
          error: 'Достигнут лимит файлов для FREE тарифа (5 файлов). Перейдите на PRO.' 
        });
      }
    }

    // Update homework with attachment
    const updated = await prisma.homework.update({
      where: { id },
      data: {
        hasAttachment: true,
        attachmentPath: req.file.path,
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Upload homework attachment error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// POST /api/homework/:id/ai-explain — AI-разбор задания:
// файл МЭШ (скачивание по URL), локальный файл или просто текст.
// Без файла НЕ блокируем — разбираем по тексту задания.
// Разбор кэшируется в Homework.aiExplanation: повторный запрос без
// флага refresh сразу возвращает сохранённый текст из БД.
router.post('/:id/ai-explain', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const refresh = (req.body as { refresh?: unknown } | undefined)?.refresh === true;

    const homework = await prisma.homework.findUnique({ where: { id } });
    if (!homework || homework.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    // Кэш: если разбор уже сохранён и не просят перегенерировать — отдаём из БД
    if (!refresh && homework.aiExplanation) {
      try {
        const cached = JSON.parse(homework.aiExplanation) as Record<string, unknown>;
        return res.json({ ...cached, cached: true });
      } catch {
        // битый JSON кэша — идём пересчитывать ниже
      }
    }

    // Токен МЭШ для докачки защищённых файлов (если профиль подключён)
    let meshToken: string | undefined;
    if (user.meshTokenEnc && ENCRYPTION_KEY) {
      try {
        meshToken = decrypt(user.meshTokenEnc, ENCRYPTION_KEY);
      } catch {
        meshToken = undefined;
      }
    }

    // Вложения МЭШ: [{name, url, kind}] — берём первое со ссылкой
    let meshUrl: string | undefined;
    let meshName: string | undefined;
    if (homework.meshAttachments) {
      try {
        const parsed = JSON.parse(homework.meshAttachments) as unknown;
        if (Array.isArray(parsed)) {
          const withUrl = parsed.find(
            (f): f is { name: string; url: string } =>
              !!f &&
              typeof f === 'object' &&
              typeof (f as { url?: unknown }).url === 'string' &&
              ((f as { url: string }).url?.length ?? 0) > 0
          );
          if (withUrl) {
            meshUrl = withUrl.url;
            meshName =
              typeof (withUrl as { name?: unknown }).name === 'string'
                ? (withUrl as { name: string }).name
                : undefined;
          }
        }
      } catch {
        // битый JSON вложений — идём по тексту
      }
    }

    const out = await explainMeshAttachment(user, {
      subject: homework.subject,
      description: homework.description ?? homework.title,
      attachmentUrl: meshUrl,
      attachmentName: meshName,
      meshToken,
    });
    // Сохраняем разбор в БД для мгновенной выдачи при повторном открытии
    try {
      await prisma.homework.update({
        where: { id },
        data: { aiExplanation: JSON.stringify(out) },
      });
    } catch (saveError) {
      console.error('Homework ai-explain cache save error:', saveError);
    }
    return res.json(out);
  } catch (error) {
    console.error('Homework ai-explain error:', error);
    const msg = error instanceof Error ? error.message : 'Не удалось разобрать задание';
    return res.status(/PRO/.test(msg) ? 403 : 500).json({ error: msg });
  }
});

// POST /api/homework/:id/analyze
router.post('/:id/analyze', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const homework = await prisma.homework.findUnique({ where: { id } });
    if (!homework || homework.userId !== user.id) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    if (!homework.hasAttachment || !homework.attachmentPath) {
      return res.status(400).json({ error: 'У задания нет прикреплённого файла' });
    }

    // Get file mime type
    const ext = path.extname(homework.attachmentPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    const analysis = await analyzeAttachment(user, homework.attachmentPath, mimeType);

    // Update homework with AI analysis
    const updated = await prisma.homework.update({
      where: { id },
      data: {
        detectedTopics: JSON.stringify(analysis.topics),
        aiHint: analysis.steps.join('\n'),
      },
    });

    return res.json({
      homework: updated,
      analysis,
    });
  } catch (error) {
    console.error('Analyze homework error:', error);
    if (errText(error).includes('PRO')) {
      return res.status(403).json({ error: errText(error) });
    }
    return res.status(500).json({ error: 'Ошибка анализа задания' });
  }
});

export default router;