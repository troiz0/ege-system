import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { chatJson } from '../services/ai/openrouterClient.js';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher.js';

const router = Router();

// GET /api/flashcards/due — карточки на сегодня
router.get('/due', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const now = new Date();

    const targetSubjects = await prisma.targetSubject.findMany({
      where: { userId: user.id },
      select: { subjectName: true },
    });
    const targetNames = targetSubjects.map((t) => t.subjectName);

    let cards = await prisma.flashcard.findMany({
      where: {
        userId: user.id,
        nextReviewDate: { lte: now },
      },
      orderBy: { nextReviewDate: 'asc' },
      take: 30,
    });

    if (targetNames.length > 0) {
      cards = cards.filter((c) => isSubjectMatchingTarget(c.subject, targetNames));
    }

    // Если нет просроченных, возвращаем до 10 любых карточек для повторения (только целевые предметы)
    if (cards.length === 0) {
      let anyCards = await prisma.flashcard.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      if (targetNames.length > 0) {
        anyCards = anyCards.filter((c) => isSubjectMatchingTarget(c.subject, targetNames));
      }
      cards = anyCards.slice(0, 10);
    }

    // Если у пользователя вообще нет карточек, создадим стартовый набор по его целевым предметам
    if (cards.length === 0) {
      const STARTER_COLLECTIONS: Array<{
        matcher: string;
        cards: Array<{ subject: string; topic: string; frontText: string; backText: string }>;
      }> = [
        {
          matcher: 'математик',
          cards: [
            {
              subject: 'Профильная математика',
              topic: 'Тригонометрия',
              frontText: 'Формула синуса двойного угла $\\sin(2\\alpha)$',
              backText: '$\\sin(2\\alpha) = 2\\sin(\\alpha)\\cos(\\alpha)$',
            },
            {
              subject: 'Профильная математика',
              topic: 'Логарифмы',
              frontText: 'Основное логарифмическое тождество $a^{\\log_a(b)}$ при $a > 0, a \\neq 1, b > 0$',
              backText: '$a^{\\log_a(b)} = b$',
            },
            {
              subject: 'Профильная математика',
              topic: 'Производная',
              frontText: 'Производная произведения $(u \\cdot v)\'$',
              backText: '$(u \\cdot v)\' = u\'v + uv\'$',
            },
          ],
        },
        {
          matcher: 'русск',
          cards: [
            {
              subject: 'Русский язык',
              topic: 'Орфоэпия (ударение)',
              frontText: 'Нормативное ударение: `тортЫ` или `тОрты`?',
              backText: '`тОрты` (ударение неподвижно на корне)',
            },
            {
              subject: 'Русский язык',
              topic: 'Паронимы',
              frontText: 'Разница между `дипломатический` и `дипломатичный`',
              backText: '`Дипломатический` — относящийся к дипломатии. `Дипломатичный` — вежливый, тонкий в отношениях.',
            },
            {
              subject: 'Русский язык',
              topic: 'Правописание Н/НН',
              frontText: 'Сколько Н пишется в слове `жареный` картофель без зависимых слов?',
              backText: 'Одна буква `н` (`жареный`) — отглагольное прилагательное несовершенного вида без зависимых слов.',
            },
          ],
        },
        {
          matcher: 'информатик',
          cards: [
            {
              subject: 'Информатика',
              topic: 'Кодирование информации',
              frontText: 'Сколько бит несет символ алфавита мощностью $N = 64$?',
              backText: '$2^i = N \\implies 2^i = 64 \\implies i = 6$ бит.',
            },
            {
              subject: 'Информатика',
              topic: 'Системы счисления',
              frontText: 'Перевод двоичного числа $1011_2$ в десятичную систему',
              backText: '$1011_2 = 1\\cdot 8 + 0\\cdot 4 + 1\\cdot 2 + 1\\cdot 1 = 11_{10}$.',
            },
          ],
        },
        {
          matcher: 'физик',
          cards: [
            {
              subject: 'Физика',
              topic: 'Кинематика',
              frontText: 'Формула перемещения при равноускоренном движении без времени: $S = \\dots$',
              backText: '$S = \\frac{v^2 - v_0^2}{2a}$',
            },
            {
              subject: 'Физика',
              topic: 'Термодинамика',
              frontText: 'КПД цикла Карно через температуры нагревателя и холодильника',
              backText: '$\\eta = \\frac{T_1 - T_2}{T_1} = 1 - \\frac{T_2}{T_1}$',
            },
          ],
        },
        {
          matcher: 'обществ',
          cards: [
            {
              subject: 'Обществознание',
              topic: 'Экономика',
              frontText: 'Что такое `олигополия`?',
              backText: 'Тип рыночной структуры, при котором господствует небольшое число крупных фирм.',
            },
          ],
        },
        {
          matcher: 'истори',
          cards: [
            {
              subject: 'История',
              topic: 'Даты',
              frontText: 'В каком году произошло Ледовое побоище?',
              backText: '`1242` год (5 апреля).',
            },
          ],
        },
      ];

      let matchedDeck = STARTER_COLLECTIONS.find((col) =>
        targetNames.some((t) => t.toLowerCase().includes(col.matcher))
      );

      if (!matchedDeck) {
        matchedDeck = STARTER_COLLECTIONS[0];
      }

      for (const card of matchedDeck.cards) {
        await prisma.flashcard.create({
          data: {
            userId: user.id,
            subject: card.subject,
            topic: card.topic,
            frontText: card.frontText,
            backText: card.backText,
            interval: 1,
            easeFactor: 2.5,
            repetitions: 0,
            nextReviewDate: new Date(),
          },
        });
      }

      cards = await prisma.flashcard.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      if (targetNames.length > 0) {
        cards = cards.filter((c) => isSubjectMatchingTarget(c.subject, targetNames));
      }
    }

    return res.json({ items: cards });
  } catch (error) {
    console.error('Get due flashcards error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки карточек для повторения' });
  }
});

// GET /api/flashcards — все карточки (отфильтрованные по целевым предметам)
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const targetSubjects = await prisma.targetSubject.findMany({
      where: { userId: user.id },
      select: { subjectName: true },
    });
    const targetNames = targetSubjects.map((t) => t.subjectName);

    let items = await prisma.flashcard.findMany({
      where: { userId: user.id },
      orderBy: { nextReviewDate: 'asc' },
    });

    if (targetNames.length > 0) {
      items = items.filter((c) => isSubjectMatchingTarget(c.subject, targetNames));
    }

    return res.json({ items });
  } catch (error) {
    console.error('Get all flashcards error:', error);
    return res.status(500).json({ error: 'Ошибка получения карточек' });
  }
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

// POST /api/flashcards/:id/review — обработка оценки по SM-2
router.post('/:id/review', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { rating } = reviewSchema.parse(req.body);

    const card = await prisma.flashcard.findUnique({ where: { id } });
    if (!card || card.userId !== user.id) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }

    // Алгоритм SuperMemo-2 (SM-2):
    // q: rating [1..5]
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    const q = rating;
    let newEaseFactor = card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (newEaseFactor < 1.3) newEaseFactor = 1.3;
    newEaseFactor = Math.round(newEaseFactor * 100) / 100;

    let newInterval: number;
    let newRepetitions: number;

    if (q < 3) {
      // Ответ неверный или очень трудный — сброс повторений
      newRepetitions = 0;
      newInterval = 1;
    } else {
      // Ответ правильный
      if (card.repetitions === 0) {
        newInterval = 1;
      } else if (card.repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(card.interval * newEaseFactor);
      }
      newRepetitions = card.repetitions + 1;
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    const updated = await prisma.flashcard.update({
      where: { id },
      data: {
        easeFactor: newEaseFactor,
        interval: newInterval,
        repetitions: newRepetitions,
        nextReviewDate,
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Review flashcard error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
    }
    return res.status(500).json({ error: 'Ошибка обновления интервала карточки' });
  }
});

// POST /api/flashcards/generate-from-mistakes — автогенерация колоды из слабых тем и ошибок
router.post('/generate-from-mistakes', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [weakTopics, mocks, homeworks] = await Promise.all([
      prisma.weakTopic.findMany({ where: { userId: user.id }, take: 5 }),
      prisma.mockExam.findMany({ where: { userId: user.id }, take: 2, orderBy: { examDate: 'desc' } }),
      prisma.homework.findMany({ where: { userId: user.id }, take: 5, orderBy: { createdAt: 'desc' } }),
    ]);

    const topicsList = weakTopics.map((w) => w.topicName);
    mocks.forEach((m) => {
      if (m.mistakeTopics) {
        try {
          const parsed = JSON.parse(m.mistakeTopics);
          if (Array.isArray(parsed)) topicsList.push(...parsed);
        } catch {}
      }
    });

    homeworks.forEach((h) => {
      if (h.detectedTopics) {
        try {
          const parsed = JSON.parse(h.detectedTopics);
          if (Array.isArray(parsed)) topicsList.push(...parsed);
        } catch {}
      }
    });

    const uniqueTopics = Array.from(new Set(topicsList)).slice(0, 4);
    const targetTopics = uniqueTopics.length > 0 ? uniqueTopics : ['Тригонометрические формулы', 'Логарифмические уравнения', 'Стереометрия сечения'];

    const deckSchema = z.object({
      cards: z.array(
        z.object({
          subject: z.string(),
          topic: z.string(),
          frontText: z.string(),
          backText: z.string(),
        })
      ),
    });

    const prompt = `Сгенерируй набор из 3-4 карточек с интервальным повторением (Anki/SM-2) для подготовки к ЕГЭ.
Темы, в которых допущены ошибки: ${targetTopics.join(', ')}.
На лицевой стороне (frontText) — краткий проверяющий вопрос или формула с пропуском (используй KaTeX $...$).
На обратной стороне (backText) — точный ответ, формула и мнемоническая подсказка.`;

    const generated = await chatJson({
      user,
      messages: [{ role: 'user', content: prompt }],
      schema: deckSchema,
      mockType: 'material',
    });

    const createdCards = [];
    for (const c of generated.data.cards) {
      const card = await prisma.flashcard.create({
        data: {
          userId: user.id,
          subject: c.subject || 'Профильная математика',
          topic: c.topic || targetTopics[0],
          frontText: c.frontText,
          backText: c.backText,
          interval: 1,
          easeFactor: 2.5,
          repetitions: 0,
          nextReviewDate: new Date(),
        },
      });
      createdCards.push(card);
    }

    return res.json({ created: createdCards.length, items: createdCards });
  } catch (error) {
    console.error('Generate flashcards from mistakes error:', error);
    return res.status(500).json({ error: 'Ошибка генерации колоды из ошибок' });
  }
});

export default router;
