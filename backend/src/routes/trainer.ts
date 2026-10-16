import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { chatJson } from '../services/ai/openrouterClient.js';
import { trainerGenerateSchema, trainerVerifySchema } from '../ai/schemas.js';

const router = Router();

const generateInputSchema = z.object({
  topic: z.string().min(1),
  subject: z.string().min(1),
});

// POST /api/trainer/generate
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { topic, subject } = generateInputSchema.parse(req.body);

    const systemPrompt = `Ты — ведущий методист и составитель КИМ ЕГЭ по предмету "${subject}".
Сгенерируй ровно 3 практические задачи формата ФИПИ строго по теме "${topic}".
ТРЕБОВАНИЯ:
1. Задачи должны быть разного уровня (1 базовая, 1 повышенная, 1 формат второй части/высокая).
2. Все математические выражения, формулы, переменные, корни, дроби и системы ОБЯЗАТЕЛЬНО оборачивай в LaTeX разметку $...$ (для инлайн формул) или $$...$$ (для блочных формул).
3. Для каждой задачи предоставь 4 четких варианта ответа (массив строк options), правильный ответ (correctAnswer), понятное объяснение решения методом Сократа (explanation) и критерий/номер прототипа ФИПИ (fipiCriteria).
4. Ответ верни в строгом формате JSON: { "questions": [ { "id": "1", "question": "...", "options": ["..."], "correctAnswer": "...", "explanation": "...", "fipiCriteria": "..." } ] }`;

    const result = await chatJson({
      user,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Сгенерируй 3 задачи ФИПИ с LaTeX формулами по теме: "${topic}"` },
      ],
      schema: trainerGenerateSchema,
      mockType: 'trainer',
    });

    return res.json({
      subject,
      topic,
      questions: result.data.questions,
      demoMode: result.demoMode,
      notice: result.notice,
    });
  } catch (error) {
    console.error('Trainer generate error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные параметры', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка генерации задач тренажера' });
  }
});

const verifyInputSchema = z.object({
  topic: z.string().min(1),
  subject: z.string().min(1),
  questionId: z.string().min(1),
  userAnswer: z.string(),
  correctAnswer: z.string(),
  question: z.string(),
});

// POST /api/trainer/verify
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { topic, subject, userAnswer, correctAnswer, question } = verifyInputSchema.parse(req.body);

    const cleanUser = userAnswer.trim().toLowerCase().replace(/[\$\s]/g, '').replace(/,/g, '.');
    const cleanCorrect = correctAnswer.trim().toLowerCase().replace(/[\$\s]/g, '').replace(/,/g, '.');

    const isMatch = cleanUser === cleanCorrect;

    // Запрос к AI для сократовского разбора
    let socraticFeedback = '';
    let hint = '';

    if (isMatch) {
      socraticFeedback = `Великолепно! Твой ответ $${correctAnswer}$ абсолютно верен. Ты точно применил нужную формулу и не попался в ловушку составителей.`;
    } else {
      try {
        const verifyPrompt = `Ты — наставник ЕГЭ, обучающий методом Сократа.
Ученик дал неверный ответ на задачу.
Задача: "${question}"
Правильный ответ: "${correctAnswer}"
Ответ ученика: "${userAnswer}"
Твоя задача — НЕ называть правильный ответ в лоб, а мягко указать на логический тупик или вычислительное расхождение, дать подсказку (hint) и задать один наводящий сократовский вопрос в socraticFeedback, который подтолкнет ученика пересчитать. Все формулы пиши в KaTeX ($...$).
Верни JSON: { "isCorrect": false, "socraticFeedback": "...", "hint": "..." }`;

        const aiCheck = await chatJson({
          user,
          messages: [{ role: 'system', content: verifyPrompt }],
          schema: trainerVerifySchema,
          mockType: 'trainer',
        });
        socraticFeedback = aiCheck.data.socraticFeedback;
        hint = aiCheck.data.hint || 'Проверь ОДЗ и знаки при переносе слагаемых.';
      } catch {
        socraticFeedback = `Ответ не совсем сошелся. Обрати внимание на условия применимости формулы: совпадает ли ОДЗ с полученным значением?`;
        hint = `Попробуй подставить свой результат обратно в уравнение.`;
      }
    }

    // Обновляем WeakTopic masteryLevel
    let existingWeakTopic = await prisma.weakTopic.findUnique({
      where: {
        userId_subject_topicName: {
          userId: user.id,
          subject,
          topicName: topic,
        },
      },
    });

    if (!existingWeakTopic) {
      existingWeakTopic = await prisma.weakTopic.create({
        data: {
          userId: user.id,
          subject,
          topicName: topic,
          masteryLevel: 0.2,
          lastTestedAt: new Date(),
        },
      });
    }

    const currentMastery = existingWeakTopic.masteryLevel ?? 0.2;
    const delta = isMatch ? 0.25 : -0.1;
    const newMasteryLevel = Math.max(0.0, Math.min(1.0, Math.round((currentMastery + delta) * 100) / 100));
    const isResolved = newMasteryLevel >= 0.8;

    await prisma.weakTopic.update({
      where: { id: existingWeakTopic.id },
      data: {
        masteryLevel: newMasteryLevel,
        isResolved,
        lastTestedAt: new Date(),
      },
    });

    return res.json({
      isCorrect: isMatch,
      socraticFeedback,
      hint,
      correctAnswer,
      newMasteryLevel,
    });
  } catch (error) {
    console.error('Trainer verify error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные ответа', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка проверки ответа' });
  }
});

const submitInputSchema = z.object({
  topic: z.string().min(1),
  subject: z.string().min(1),
  totalQuestions: z.number().int().min(1),
  correctCount: z.number().int().min(0),
  masteryLevel: z.number().optional(),
});

// POST /api/trainer/submit - Фиксация результатов блиц-теста и сохранение в TestResult + WeakTopic
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { topic, subject, totalQuestions, correctCount } = submitInputSchema.parse(req.body);

    let existingWeakTopic = await prisma.weakTopic.findUnique({
      where: {
        userId_subject_topicName: {
          userId: user.id,
          subject,
          topicName: topic,
        },
      },
    });

    if (!existingWeakTopic) {
      existingWeakTopic = await prisma.weakTopic.create({
        data: {
          userId: user.id,
          subject,
          topicName: topic,
          masteryLevel: 0.2,
          lastTestedAt: new Date(),
        },
      });
    }

    // Расчет прогресса темы на основе результатов блица
    // 3/3 -> 0.85 (>= 0.75 зеленая)
    // 2/3 -> 0.60 (35-74% желтая)
    // 1/3 -> 0.45 (35-74% желтая)
    // 0/3 -> 0.20 (< 35% красная)
    const ratio = correctCount / totalQuestions;
    let targetMastery: number;
    if (ratio >= 0.99) {
      targetMastery = 0.85;
    } else if (ratio >= 0.66) {
      targetMastery = 0.60;
    } else if (ratio >= 0.33) {
      targetMastery = 0.45;
    } else {
      targetMastery = 0.20;
    }

    const currentMastery = existingWeakTopic.masteryLevel ?? 0.2;
    const newMasteryLevel = Math.max(0.0, Math.min(1.0, Math.max(currentMastery, targetMastery)));
    const isResolved = newMasteryLevel >= 0.75;

    await prisma.weakTopic.update({
      where: { id: existingWeakTopic.id },
      data: {
        masteryLevel: newMasteryLevel,
        isResolved,
        lastTestedAt: new Date(),
      },
    });

    // Сохранение факта прохождения блиц-теста в TestResult
    const testResult = await prisma.testResult.create({
      data: {
        userId: user.id,
        subject,
        title: `Блиц-тест: ${topic}`,
        scaleType: 'raw_fraction',
        score: correctCount,
        maxScore: totalQuestions,
        normalizedPercent: Math.round(ratio * 100),
        testDate: new Date(),
        source: 'manual',
        topic,
        comment: `Пройден блиц-тест в 3D-графе знаний. Верно: ${correctCount} из ${totalQuestions} (${Math.round(ratio * 100)}%)`,
      },
    });

    return res.json({
      success: true,
      newMasteryLevel,
      isResolved,
      testResultId: testResult.id,
    });
  } catch (error) {
    console.error('Trainer submit error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные параметры теста', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения результатов блиц-теста' });
  }
});

export default router;
