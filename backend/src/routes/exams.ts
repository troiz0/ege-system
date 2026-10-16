import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { getExamVariant, generateRandomExamVariant, type ExamVariant } from '../services/fipiExamService.js';
import { reshuEgeService } from '../services/reshuEgeService.js';
import { convertPrimaryToTestScore } from '../services/scoreScale.js';
import { findSubjectConfig } from '../lib/subjects.js';
import { pdfExportService } from '../services/pdfExportService.js';
import { awardUserXp } from '../services/xpService.js';

const router = Router();

// Настройка хранилища multer в backend/uploads
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `exam_scan_${unique}_${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB на файл
    files: 10,                  // до 10 файлов
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'application/pdf',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения (JPEG, PNG, WebP) или PDF-файлы'));
    }
  },
});

// GET /api/exams/variant?subject=math_profile
router.get('/variant', requireAuth, async (req, res) => {
  try {
    const subject = (req.query.subject as string) || 'math_profile';
    const variant = await reshuEgeService.fetchRandomVariant(subject);
    return res.json(variant);
  } catch (error) {
    console.error('Get exam variant error:', error);
    const subject = (req.query.subject as string) || 'math_profile';
    const variant = getExamVariant(subject);
    try {
      await prisma.examVariantCache.create({
        data: {
          subjectId: variant.subject || subject,
          variantNumber: variant.variantNumber,
          dataJson: JSON.stringify(variant),
        },
      });
    } catch {}
    return res.json(variant);
  }
});

// POST /api/exams/start — Предстартовое создание/получение варианта
router.post('/start', requireAuth, async (req, res) => {
  try {
    const subject = (req.body?.subject as string) || 'math_profile';
    const variant = await reshuEgeService.fetchRandomVariant(subject);
    return res.json({
      variant,
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Start exam simulation error:', error);
    const subject = (req.body?.subject as string) || 'math_profile';
    const variant = generateRandomExamVariant(subject);
    try {
      await prisma.examVariantCache.create({
        data: {
          subjectId: variant.subject || subject,
          variantNumber: variant.variantNumber,
          dataJson: JSON.stringify(variant),
        },
      });
    } catch {}
    return res.json({
      variant,
      startedAt: new Date().toISOString(),
    });
  }
});

const submitExamSchema = z.object({
  subject: z.string().min(1),
  variantNumber: z.number().int().optional().default(1),
  variantCode: z.string().optional(),
  timeSpentSeconds: z.number().int().min(0),
  part1Answers: z.record(z.string()),
  part2Solutions: z.record(
    z.object({
      text: z.string().default(''),
      scanUrls: z.array(
        z.object({
          name: z.string(),
          url: z.string(),
          size: z.number(),
        })
      ).default([]),
      score: z.number().optional().default(0),
    })
  ).optional().default({}),
  variantTasks: z.array(
    z.object({
      id: z.number(),
      part: z.number(),
      number: z.number(),
      title: z.string(),
      topic: z.string(),
      maxScore: z.number(),
    })
  ).optional(),
});

// POST /api/exams/submit — Сдача бланка, проверка части 1, сохранение в MockExam и ExamSimulation
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const input = submitExamSchema.parse(req.body);

    const cfg = findSubjectConfig(input.subject);
    const resolvedSubjectId = cfg.id;

    // Загрузка эталонного варианта с правильными ответами из базы/кэша вариантов
    let serverVariant: ExamVariant | null = null;

    if (input.variantNumber) {
      const cached = await prisma.examVariantCache.findFirst({
        where: {
          subjectId: resolvedSubjectId,
          variantNumber: input.variantNumber,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (cached) {
        try {
          serverVariant = JSON.parse(cached.dataJson) as ExamVariant;
        } catch (e) {
          console.warn('Failed to parse cached ExamVariant:', e);
        }
      }
    }

    if (!serverVariant && input.variantCode) {
      const cachedList = await prisma.examVariantCache.findMany({
        where: { subjectId: resolvedSubjectId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      for (const c of cachedList) {
        try {
          const parsed = JSON.parse(c.dataJson) as ExamVariant;
          if (parsed.variantCode === input.variantCode || parsed.id === input.variantCode) {
            serverVariant = parsed;
            break;
          }
        } catch {}
      }
    }

    // Fallback к эталонному генератору, если вариант не найден в кэше
    if (!serverVariant) {
      serverVariant = getExamVariant(resolvedSubjectId, input.variantNumber);
    }

    const missedTasks: string[] = [];
    const mistakeTopics: string[] = [];
    let correctPart1Count = 0;
    const missedDetails: Array<{
      taskNumber: number;
      topic: string;
      taskText: string;
      userAnswer: string;
      correctAnswer: string;
      explanation?: string;
    }> = [];

    // Получаем список эталонных заданий части 1
    const serverTasks = serverVariant?.tasks || [];
    const part1Tasks = serverTasks.filter((t) => t.part === 1 || t.taskNumber <= cfg.part1Count);

    if (part1Tasks.length > 0) {
      part1Tasks.forEach((t) => {
        const taskNum = t.taskNumber || t.number || t.id || 0;
        const userRaw = input.part1Answers[taskNum.toString()]?.trim() || '';
        const userNorm = userRaw.replace(',', '.');
        const correctNorm = t.correctAnswer?.trim().replace(',', '.') || '';

        if (userNorm && correctNorm && userNorm === correctNorm) {
          correctPart1Count += 1;
        } else {
          missedTasks.push(taskNum.toString());
          const rawTopic = t.topic || input.variantTasks?.find((vt) => vt.number === taskNum)?.topic || `Задание №${taskNum}`;
          const topic = rawTopic.includes('№') ? rawTopic : `${rawTopic} №${taskNum}`;
          mistakeTopics.push(topic);
          missedDetails.push({
            taskNumber: taskNum,
            topic,
            taskText: t.statement || t.text || t.title || `Задание №${taskNum}`,
            userAnswer: userRaw || '(пусто)',
            correctAnswer: t.correctAnswer || '',
            explanation: t.solutionCriteria || undefined,
          });
        }
      });
    }

    // Подсчет баллов части 2 и выявление ошибок развернутых заданий
    const part2Tasks = serverTasks.filter((t) => t.part === 2 || (t.taskNumber && t.taskNumber > cfg.part1Count));
    let part2PrimaryScore = 0;

    if (part2Tasks.length > 0) {
      part2Tasks.forEach((t) => {
        const taskNum = t.taskNumber || t.number || t.id || 0;
        const sol = input.part2Solutions[taskNum.toString()];
        const score = sol?.score || 0;
        part2PrimaryScore += score;
        const maxScore = t.maxScore || (taskNum >= 18 ? 4 : (taskNum === 17 ? 3 : 2));
        if (score < maxScore) {
          missedTasks.push(taskNum.toString());
          const rawTopic = t.topic || input.variantTasks?.find((vt) => vt.number === taskNum)?.topic || `Развернутое задание №${taskNum}`;
          const topic = rawTopic.includes('№') ? rawTopic : `${rawTopic} №${taskNum}`;
          mistakeTopics.push(topic);
          missedDetails.push({
            taskNumber: taskNum,
            topic,
            taskText: t.statement || t.text || t.title || `Задание №${taskNum}`,
            userAnswer: sol?.text ? `[Балл: ${score}/${maxScore}] ${sol.text.slice(0, 150)}` : '(нет решения)',
            correctAnswer: `Критерии ФИПИ (максимум ${maxScore} б.)`,
            explanation: t.solutionCriteria || 'Требуется строгое математическое обоснование по критериям ФИПИ',
          });
        }
      });
    } else {
      part2PrimaryScore = Object.values(input.part2Solutions).reduce(
        (acc, s) => acc + (s.score || 0),
        0
      );
    }

    // Расчет первичного и тестового балла по официальной шкале ФИПИ (Часть 1 + Часть 2)
    const totalPart1 = part1Tasks.length || cfg.part1Count || 13;
    const totalPrimaryScore = correctPart1Count + part2PrimaryScore;
    const maxPrimary = cfg.maxScore || (input.subject.includes('math') ? 33 : 43);
    const totalScore = convertPrimaryToTestScore(input.subject, totalPrimaryScore, maxPrimary);

    // Расчет изменения (дельты) баллов относительно прошлого пробника
    const previousExam = await prisma.mockExam.findFirst({
      where: {
        userId: user.id,
        subject: input.subject,
      },
      orderBy: { examDate: 'desc' },
    });
    const deltaScore = previousExam ? totalScore - previousExam.totalScore : null;

    // Подсчет прикрепленных сканов части 2
    const totalScans = Object.values(input.part2Solutions).reduce(
      (acc, s) => acc + (s.scanUrls?.length || 0),
      0
    );

    const minutesSpent = Math.max(1, Math.round(input.timeSpentSeconds / 60));
    const aiVerdict = `Симуляция КИМ-2027 ${input.variantCode ? `(Вариант № ${input.variantCode})` : ''} завершена за ${minutesSpent} мин. Результат: ${totalPrimaryScore}/${maxPrimary} первичных (${totalScore}/100 тест.). Ч1: ${correctPart1Count}/${totalPart1}, Ч2: ${part2PrimaryScore} б. Листов: ${totalScans}.`;

    const combinedAnswers: Record<string, string> = { ...input.part1Answers };
    Object.entries(input.part2Solutions).forEach(([task, data]) => {
      if (data.text || data.scanUrls.length > 0) {
        combinedAnswers[`part2_${task}`] = JSON.stringify(data);
      }
    });

    const uniqueMistakes = Array.from(new Set(mistakeTopics));

    // Оборачиваем все операции сохранения в транзакцию $transaction для устранения ошибок SQLITE_BUSY: database is locked
    const { mockExam, simulation, userXp } = await prisma.$transaction(async (tx) => {
      // 1. Автоматическая фиксация допущенных ошибок в Книге личных ошибок (MistakeEntry)
      for (const item of missedDetails) {
        await tx.mistakeEntry.create({
          data: {
            userId: user.id,
            subject: input.subject,
            taskNumber: item.taskNumber,
            statement: `[${item.topic}] ${item.taskText}`,
            userAnswer: item.userAnswer,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation || null,
            status: 'UNRESOLVED',
          },
        });
      }

      // 2. Сохранение в модель MockExam (/mock-exams)
      const createdMockExam = await tx.mockExam.create({
        data: {
          userId: user.id,
          subject: input.subject,
          examDate: new Date(),
          totalScore,
          primaryScore: totalPrimaryScore,
          missedTasks: JSON.stringify(missedTasks),
          mistakeTopics: JSON.stringify(uniqueMistakes),
          deltaScore,
          aiVerdict,
          source: 'simulation',
          timeSpentSeconds: input.timeSpentSeconds,
        },
      });

      // 3. Обновление WeakTopic по допущенным ошибкам
      for (const topicName of uniqueMistakes) {
        await tx.weakTopic.upsert({
          where: {
            userId_subject_topicName: {
              userId: user.id,
              subject: input.subject,
              topicName,
            },
          },
          update: {
            frequency: { increment: 1 },
            isResolved: false,
            lastFailedDate: new Date(),
          },
          create: {
            userId: user.id,
            subject: input.subject,
            topicName,
            frequency: 1,
            isResolved: false,
            lastFailedDate: new Date(),
          },
        });
      }

      // 4. Сохранение в ExamSimulation
      const createdSimulation = await tx.examSimulation.create({
        data: {
          userId: user.id,
          subject: input.subject,
          variantNumber: input.variantNumber,
          targetScore: 84,
          actualScore: totalScore,
          timeSpentSeconds: input.timeSpentSeconds,
          answers: JSON.stringify(combinedAnswers),
          feedback: JSON.stringify({
            timeSpentFormatted: `${Math.floor(input.timeSpentSeconds / 3600)}ч ${Math.floor((input.timeSpentSeconds % 3600) / 60)}м`,
            correctPart1Count,
            totalScore,
            primaryScore: totalPrimaryScore,
            missedTasks,
            mistakeTopics: uniqueMistakes,
            scansCount: totalScans,
          }),
          status: 'COMPLETED',
        },
      });

      // 5. Начисление XP за симуляцию экзамена (+30 XP)
      const updatedUser = await awardUserXp(tx, user.id, 30);

      return {
        mockExam: createdMockExam,
        simulation: createdSimulation,
        userXp: updatedUser,
      };
    });

    return res.json({
      success: true,
      mockExam,
      simulation,
      userXp,
      results: {
        totalScore,
        primaryScore: totalPrimaryScore,
        correctPart1Count,
        part2PrimaryScore,
        missedTasks,
        mistakeTopics: uniqueMistakes,
        deltaScore,
        timeSpentSeconds: input.timeSpentSeconds,
      },
    });
  } catch (error) {
    console.error('Submit exam simulation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные бланка', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения и проверки симуляции экзамена' });
  }
});

// POST /api/exams/upload — прямая загрузка до 10 сканов/фото решений
router.post('/upload', requireAuth, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      console.error('Exam upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Размер файла превышает лимит 15 МБ' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Максимум 10 файлов за одну загрузку' });
        }
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файлов' });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Файлы не были переданы' });
    }

    const uploaded = files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,
      url: `/uploads/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
    }));

    return res.json({
      success: true,
      count: uploaded.length,
      files: uploaded,
      urls: uploaded.map((f) => f.url),
    });
  });
});

// POST /api/exams/print-class-pack — Генерация комплекта вариантов для печати
router.post('/print-class-pack', requireAuth, async (req, res) => {
  try {
    const subject = (req.body?.subject as string) || 'math_profile';
    const count = Number(req.body?.count) || 4;
    const html = await pdfExportService.generateClassPackHtml(subject, count);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error: any) {
    console.error('Print class pack error:', error);
    return res.status(500).json({ error: error?.message || 'Ошибка генерации комплекта' });
  }
});

export default router;
