import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { MATH_PROFILE_TASK_POOLS } from '../services/fipiExamService.js';
import { awardUserXp } from '../services/xpService.js';

const router = Router();

export interface SprintTaskDto {
  id: number;
  number: number;
  topic: string;
  statement: string;
  correctAnswer: string;
  explanation: string;
}

// Fallback пулы для русского языка, физики и информатики
const EXTRA_SUBJECT_POOLS: Record<string, SprintTaskDto[]> = {
  russian: [
    {
      id: 201,
      number: 4,
      topic: 'Орфоэпические нормы (ударение)',
      statement: 'В одном из приведённых ниже слов допущена ошибка в постановке ударения: НЕВЕРНО выделена буква, обозначающая ударный гласный звук. Выпишите это слово в нижнем регистре:\n\n`бАловать`, `красИвее`, `договОр`, `тортЫ`.',
      correctAnswer: 'баловать',
      explanation: 'Нормативное ударение: баловАть, балУю, баловАнный (инфинитив падает на окончание).',
    },
    {
      id: 202,
      number: 5,
      topic: 'Лексические нормы (паронимы)',
      statement: 'В одном из приведённых ниже предложений НЕВЕРНО употреблено выделенное слово. Исправьте лексическую ошибку, подобрав к выделенному слову пароним:\n\n«Командир части отдал строгий ДИПЛОМАТИЧЕСКИЙ приказ».',
      correctAnswer: 'дипломатичный',
      explanation: 'Дипломатический — относящийся к дипломатии (паспорт, курьер). Тонкий, расчетливый, вежливый — дипломатичный.',
    },
    {
      id: 203,
      number: 11,
      topic: 'Правописание суффиксов',
      statement: 'Укажите букву, пропущенную в словах одного ряда:\n\n`застра..вать`, `расклан..ваться`. (Запишите одну пропущенную гласную букву).',
      correctAnswer: 'и',
      explanation: 'В форме 1-го лица (я застраиваю, раскланиваюсь) суффикс -ива- сохраняется, поэтому пишется буква «и».',
    },
    {
      id: 204,
      number: 9,
      topic: 'Правописание корней',
      statement: 'Укажите вариант, в котором во всех словах одного ряда пропущена безударная проверяемая гласная корня: `прим..рять`, `подб..рать`, `р..стовщик`. Напишите корень первого слова.',
      correctAnswer: 'мир',
      explanation: 'Примирять — мир (проверяемая гласная корня).',
    },
  ],
  informatics: [
    {
      id: 401,
      number: 11,
      topic: 'Передача информации',
      statement: 'Скорость передачи данных по каналу связи равна $128\\,000$ бит/с. Сколько килобайт данных передается по этому каналу за $16$ секунд?',
      correctAnswer: '250',
      explanation: '$V = (128\\,000 \\times 16) / (8 \\times 1024) = 2\\,048\\,000 / 8192 = 250$ Кбайт.',
    },
    {
      id: 402,
      number: 8,
      topic: 'Системы счисления',
      statement: 'Сколько значащих нулей содержится в двоичной записи десятичного числа $68$?',
      correctAnswer: '5',
      explanation: '$68 = 64 + 4 = 2^6 + 2^2 = 1000100_2$. Значащих нулей: 5.',
    },
    {
      id: 403,
      number: 1,
      topic: 'Анализ графов и таблиц',
      statement: 'Между пунктами А, B, C, D, E, F проложены дороги. Длина кратчайшего пути из пункта А в пункт F по таблице смежности равна (в км):',
      correctAnswer: '13',
      explanation: 'Кратчайший маршрут A-B-E-F: $3 + 4 + 6 = 13$ км.',
    },
  ],
};

// GET /api/sprint — Динамическая выборка 3 задач для дейли-спринта
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const subject = (req.query.subject as string) || 'math_profile';
    const normSubj = subject.toLowerCase();

    const selectedTasks: SprintTaskDto[] = [];
    let taskIdCounter = 9000;

    // 1. Поиск нерешенных ошибок пользователя (MistakeEntry)
    const mistakes = await prisma.mistakeEntry.findMany({
      where: {
        userId: user.id,
        status: 'UNRESOLVED',
        ...(normSubj.includes('math') || normSubj.includes('матем')
          ? { subject: { contains: 'math' } }
          : { subject: { contains: normSubj } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    for (const m of mistakes) {
      if (m.correctAnswer) {
        selectedTasks.push({
          id: taskIdCounter++,
          number: m.taskNumber,
          topic: `Работа над ошибкой: №${m.taskNumber}`,
          statement: m.statement,
          correctAnswer: m.correctAnswer,
          explanation: m.explanation || 'Решите задачу и проверьте вычисления.',
        });
      }
    }

    // 2. Поиск проблемных тем с наименьшим masteryLevel (WeakTopic)
    if (selectedTasks.length < 3) {
      const weakTopics = await prisma.weakTopic.findMany({
        where: {
          userId: user.id,
          isResolved: false,
          ...(normSubj.includes('math') || normSubj.includes('матем')
            ? { subject: { contains: 'math' } }
            : { subject: { contains: normSubj } }),
        },
        orderBy: { masteryLevel: 'asc' },
        take: 3,
      });

      for (const wt of weakTopics) {
        if (selectedTasks.length >= 3) break;
        // Извлекаем номер задания из названия темы (например "№4" или "Задание 6")
        const match = wt.topicName.match(/№\s*(\d+)/i) || wt.topicName.match(/задание\s*(\d+)/i);
        const taskNum = match ? parseInt(match[1], 10) : null;
        if (taskNum && taskNum <= 13 && MATH_PROFILE_TASK_POOLS[taskNum]) {
          const pool = MATH_PROFILE_TASK_POOLS[taskNum];
          const candidate = pool[Math.floor(Math.random() * pool.length)];
          if (candidate && candidate.correctAnswer) {
            selectedTasks.push({
              id: taskIdCounter++,
              number: taskNum,
              topic: `${candidate.topic || wt.topicName}`,
              statement: candidate.text,
              correctAnswer: candidate.correctAnswer,
              explanation: candidate.fipiCriteria || `Решение задания №${taskNum}.`,
            });
          }
        }
      }
    }

    // 3. Добор задач из пулов заданий (часть 1, № 1–13)
    const isMath = normSubj.includes('math') || normSubj.includes('матем');
    if (isMath) {
      const availableNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
      // Перемешиваем номера заданий
      const shuffled = availableNums.sort(() => 0.5 - Math.random());
      for (const num of shuffled) {
        if (selectedTasks.length >= 3) break;
        if (selectedTasks.some((t) => t.number === num)) continue;

        const pool = MATH_PROFILE_TASK_POOLS[num];
        if (pool && pool.length > 0) {
          const candidate = pool[Math.floor(Math.random() * pool.length)];
          if (candidate && candidate.correctAnswer) {
            selectedTasks.push({
              id: taskIdCounter++,
              number: num,
              topic: candidate.topic || `Задание №${num}`,
              statement: candidate.text,
              correctAnswer: candidate.correctAnswer,
              explanation: candidate.fipiCriteria || `Отработка задания №${num}.`,
            });
          }
        }
      }
    } else {
      const extraPool = EXTRA_SUBJECT_POOLS[normSubj] || EXTRA_SUBJECT_POOLS.russian;
      for (const task of extraPool) {
        if (selectedTasks.length >= 3) break;
        if (!selectedTasks.some((t) => t.id === task.id)) {
          selectedTasks.push(task);
        }
      }
    }

    return res.json({
      subject,
      tasks: selectedTasks.slice(0, 3),
    });
  } catch (error) {
    console.error('Get daily sprint error:', error);
    return res.status(500).json({ error: 'Ошибка генерации дейли-спринта' });
  }
});

// POST /api/sprint/complete — завершение дейли-спринта и начисление +15 XP
router.post('/complete', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const schema = z.object({
      subject: z.string().optional().default('math_profile'),
      correctCount: z.number().int().min(0).max(3).optional().default(3),
      totalCount: z.number().int().default(3),
    });
    schema.parse(req.body);

    // Начисляем +15 XP пользователю в SQLite
    const updatedUser = await awardUserXp(prisma, user.id, 15);

    return res.json({
      success: true,
      message: 'Дейли-спринт успешно завершен! +15 XP начислено.',
      xpGained: 15,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Complete sprint error:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка завершения дейли-спринта' });
  }
});

export default router;
