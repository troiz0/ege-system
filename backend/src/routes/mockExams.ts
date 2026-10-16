import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { chatJson } from '../services/ai/openrouterClient';
import { z as zodSchema } from 'zod';
import { Prisma } from '@prisma/client';

const router = Router();

const createMockExamSchema = z.object({
  subject: z.string().min(1),
  examDate: z.string().datetime(),
  totalScore: z.number().int().min(0).max(100),
  primaryScore: z.number().int().optional(),
  missedTasks: z.array(z.string()).optional(),
  mistakeTopics: z.array(z.string()).optional(),
  aiVerdict: z.string().optional(),
  source: z.string().optional().default('manual'),
  timeSpentSeconds: z.number().int().optional(),
});

const updateMockExamSchema = createMockExamSchema.partial();

// GET /api/mock-exams
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject } = req.query;

    const where: Prisma.MockExamWhereInput = { userId: user.id };
    if (subject && typeof subject === 'string') {
      where.subject = subject;
    }

    const items = await prisma.mockExam.findMany({
      where,
      orderBy: { examDate: 'desc' },
    });

    return res.json({ items });
  } catch (error) {
    console.error('Get mock exams error:', error);
    return res.status(500).json({ error: 'Ошибка получения пробников' });
  }
});

// GET /api/mock-exams/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const item = await prisma.mockExam.findUnique({ where: { id } });

    if (!item || item.userId !== user.id) {
      return res.status(404).json({ error: 'Пробник не найден' });
    }

    return res.json(item);
  } catch (error) {
    console.error('Get mock exam by id error:', error);
    return res.status(500).json({ error: 'Ошибка получения пробника' });
  }
});

// POST /api/mock-exams
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const data = createMockExamSchema.parse(req.body);

    // Calculate deltaScore relative to previous exam
    let deltaScore: number | null = null;
    const previousExam = await prisma.mockExam.findFirst({
      where: {
        userId: user.id,
        subject: data.subject,
        examDate: { lt: new Date(data.examDate) },
      },
      orderBy: { examDate: 'desc' },
    });

    if (previousExam) {
      deltaScore = data.totalScore - previousExam.totalScore;
    }

    const item = await prisma.mockExam.create({
      data: {
        userId: user.id,
        subject: data.subject,
        examDate: new Date(data.examDate),
        totalScore: data.totalScore,
        primaryScore: data.primaryScore,
        missedTasks: data.missedTasks ? JSON.stringify(data.missedTasks) : null,
        mistakeTopics: data.mistakeTopics ? JSON.stringify(data.mistakeTopics) : null,
        deltaScore,
        aiVerdict: data.aiVerdict,
        source: data.source,
        timeSpentSeconds: data.timeSpentSeconds,
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
              lastFailedDate: new Date(data.examDate),
            },
            create: {
              userId: user.id,
              subject: data.subject,
              topicName,
              frequency: 1,
              lastFailedDate: new Date(data.examDate),
            },
          })
        )
      );
    }

    return res.status(201).json(item);
  } catch (error) {
    console.error('Create mock exam error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка создания пробника' });
  }
});

// PUT /api/mock-exams/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = updateMockExamSchema.parse(req.body);

    const existing = await prisma.mockExam.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Пробник не найден' });
    }

    // Recalculate deltaScore if totalScore or subject changed
    let deltaScore = existing.deltaScore;
    if (data.totalScore !== undefined || data.subject !== undefined) {
      const subject = data.subject ?? existing.subject;
      const examDate = data.examDate ? new Date(data.examDate) : existing.examDate;
      
      const previousExam = await prisma.mockExam.findFirst({
        where: {
          userId: user.id,
          subject,
          examDate: { lt: examDate },
          id: { not: id },
        },
        orderBy: { examDate: 'desc' },
      });

      if (previousExam) {
        const totalScore = data.totalScore ?? existing.totalScore;
        deltaScore = totalScore - previousExam.totalScore;
      } else {
        deltaScore = null;
      }
    }

    const item = await prisma.mockExam.update({
      where: { id },
      data: {
        ...data,
        examDate: data.examDate ? new Date(data.examDate) : undefined,
        missedTasks: data.missedTasks ? JSON.stringify(data.missedTasks) : undefined,
        mistakeTopics: data.mistakeTopics ? JSON.stringify(data.mistakeTopics) : undefined,
        deltaScore,
      },
    });

    return res.json(item);
  } catch (error) {
    console.error('Update mock exam error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления пробника' });
  }
});

// DELETE /api/mock-exams/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.mockExam.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return res.status(404).json({ error: 'Пробник не найден' });
    }

    await prisma.mockExam.delete({ where: { id } });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete mock exam error:', error);
    return res.status(500).json({ error: 'Ошибка удаления пробника' });
  }
});

// POST /api/mock-exams/:subject/verdict
router.post('/:subject/verdict', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { subject } = req.params;

    // Get all mock exams for this subject
    const exams = await prisma.mockExam.findMany({
      where: {
        userId: user.id,
        subject,
      },
      orderBy: { examDate: 'asc' },
    });

    if (exams.length === 0) {
      return res.status(404).json({ error: 'Нет пробников по данному предмету' });
    }

    // Find chronic errors (tasks/topics appearing in 2+ exams)
    const taskFrequency: Record<string, number> = {};
    const topicFrequency: Record<string, number> = {};

    exams.forEach((exam) => {
      if (exam.missedTasks) {
        const tasks = JSON.parse(exam.missedTasks);
        tasks.forEach((task: string) => {
          taskFrequency[task] = (taskFrequency[task] || 0) + 1;
        });
      }
      if (exam.mistakeTopics) {
        const topics = JSON.parse(exam.mistakeTopics);
        topics.forEach((topic: string) => {
          topicFrequency[topic] = (topicFrequency[topic] || 0) + 1;
        });
      }
    });

    const chronicTasks = Object.entries(taskFrequency)
      .filter(([_, count]) => count >= 2)
      .map(([task]) => task);
    
    const chronicTopics = Object.entries(topicFrequency)
      .filter(([_, count]) => count >= 2)
      .map(([topic]) => topic);

    // Generate AI verdict
    const context = {
      subject,
      exams: exams.map((e) => ({
        date: e.examDate,
        score: e.totalScore,
        delta: e.deltaScore,
      })),
      chronicTasks,
      chronicTopics,
    };

    const verdictSchema = zodSchema.object({
      verdict: zodSchema.string(),
      strengths: zodSchema.array(zodSchema.string()),
      weaknesses: zodSchema.array(zodSchema.string()),
      recommendations: zodSchema.array(zodSchema.string()),
    });

    const result = await chatJson({
      user,
      messages: [
        { 
          role: 'system', 
          content: 'Ты эксперт по подготовке к ЕГЭ. Проанализируй результаты пробных экзаменов и дай вердикт.' 
        },
        { 
          role: 'user', 
          content: `Контекст:\n${JSON.stringify(context, null, 2)}\n\nДай краткий вердикт, сильные стороны, слабые места и рекомендации.` 
        },
      ],
      schema: verdictSchema,
      mockType: 'verdict',
    });

    return res.json({
      verdict: result.data.verdict,
      strengths: result.data.strengths,
      weaknesses: result.data.weaknesses,
      recommendations: result.data.recommendations,
      chronicTasks,
      chronicTopics,
      demoMode: result.demoMode,
      notice: result.notice,
    });
  } catch (error) {
    console.error('Get mock exam verdict error:', error);
    return res.status(500).json({ error: 'Ошибка получения вердикта' });
  }
});

export default router;