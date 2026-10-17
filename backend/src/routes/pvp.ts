import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { awardUserXp } from '../services/xpService.js';

const router = Router();

export interface PvpTask {
  id: number;
  number: number;
  title: string;
  statement: string;
  correctAnswer: string;
  explanation: string;
}

export interface PlayerState {
  userId: string;
  userName: string;
  solvedTasksCount: number;
  answers: Record<number, string>;
  finishedAt?: number;
  isSimulated?: boolean;
}

export interface PvpMatch {
  id: string;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: number;
  roundExpiresAt: number;
  tasks: PvpTask[];
  player1: PlayerState;
  player2: PlayerState;
  winnerId?: string | null;
  xpAwardedUserIds: string[];
}

// Банк быстрых задач первой части для режима BATTLEGROUND (математика/логика)
const PVP_TASKS_POOL: PvpTask[] = [
  {
    id: 101,
    number: 1,
    title: 'Планиметрия (треугольники)',
    statement: 'В треугольнике $ABC$ угол $C$ равен $90^\\circ$, $AC = 8$, $\\cos(A) = 0.8$. Найдите гипотенузу $AB$.',
    correctAnswer: '10',
    explanation: 'По определению косинуса: $\\cos(A) = \\frac{AC}{AB} \\implies AB = \\frac{AC}{\\cos(A)} = \\frac{8}{0.8} = 10$.',
  },
  {
    id: 102,
    number: 5,
    title: 'Теория вероятностей',
    statement: 'В сборнике билетов по математике всего 25 билетов, в 10 из них встречается вопрос по логарифмам. Найдите вероятность того, что в случайно выбранном на экзамене билете школьнику достанется вопрос по логарифмам.',
    correctAnswer: '0.4',
    explanation: 'Классическая вероятность: $P = \\frac{m}{n} = \\frac{10}{25} = \\frac{2}{5} = 0.4$.',
  },
  {
    id: 103,
    number: 6,
    title: 'Простейшие уравнения',
    statement: 'Найдите корень уравнения $\\sqrt{3x + 49} = 10$.',
    correctAnswer: '17',
    explanation: 'Возводим обе части в квадрат: $3x + 49 = 100 \\implies 3x = 51 \\implies x = 17$.',
  },
  {
    id: 104,
    number: 7,
    title: 'Вычисления и преобразования',
    statement: 'Найдите значение выражения $5^{3.6} \\cdot 5^{2.4} : 5^4$.',
    correctAnswer: '25',
    explanation: 'Используем свойства степеней: $5^{3.6 + 2.4 - 4} = 5^{6 - 4} = 5^2 = 25$.',
  },
  {
    id: 105,
    number: 8,
    title: 'Производная и касательная',
    statement: 'Прямая $y = 7x - 5$ параллельна касательной к графику функции $y = x^2 + 3x - 8$. Найдите абсциссу точки касания.',
    correctAnswer: '2',
    explanation: 'Угловой коэффициент касательной $k = 7$. Производная: $y\' = 2x + 3$. Приравниваем: $2x + 3 = 7 \\implies 2x = 4 \\implies x = 2$.',
  },
  {
    id: 106,
    number: 10,
    title: 'Текстовая задача на движение',
    statement: 'Поезд, двигаясь равномерно со скоростью 60 км/ч, проезжает мимо придорожного столба за 30 секунд. Найдите длину поезда в метрах.',
    correctAnswer: '500',
    explanation: 'Переводим скорость в м/с: $60\\,\\text{км/ч} = \\frac{60 \\cdot 1000}{3600} = \\frac{50}{3}\\,\\text{м/с}$. Длина $S = v \\cdot t = \\frac{50}{3} \\cdot 30 = 500\\,\\text{м}$.',
  },
  {
    id: 107,
    number: 12,
    title: 'Наибольшее/наименьшее значение функции',
    statement: 'Найдите точку максимума функции $y = x^3 - 48x + 17$.',
    correctAnswer: '-4',
    explanation: 'Производная $y\' = 3x^2 - 48$. При $y\' = 0 \\implies x^2 = 16 \\implies x = \\pm 4$. При переходе через $x = -4$ знак производной меняется с $+$ на $-$, следовательно, точка максимума $x = -4$.',
  },
];

// Внутрипамятное хранилище очереди и активных матчей
interface QueueEntry {
  userId: string;
  userName: string;
  queuedAt: number;
}

const queue: QueueEntry[] = [];
const matches = new Map<string, PvpMatch>();

const BOT_NAMES = [
  'Абитуриент Физтеха (Рейтинг 1840)',
  'Лицеист ВШЭ (Рейтинг 1920)',
  'Олимпиадник МГУ (Рейтинг 1890)',
  'Стобалльник СУНЦ (Рейтинг 1960)',
  'Нейро-Соперник EGE (Рейтинг 1880)',
];

function getRandomTasks(count = 3): PvpTask[] {
  const shuffled = [...PVP_TASKS_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Очистка устаревших очередей (> 30 сек)
function cleanupQueue() {
  const now = Date.now();
  for (let i = queue.length - 1; i >= 0; i--) {
    if (now - queue[i].queuedAt > 30000) {
      queue.splice(i, 1);
    }
  }
}

// Поиск или создание матча
// POST /api/pvp/queue
router.post('/queue', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    cleanupQueue();

    // 1. Проверяем, нет ли уже активного незавершенного матча у пользователя
    for (const match of matches.values()) {
      if (match.status === 'ACTIVE') {
        if (match.player1.userId === user.id || match.player2.userId === user.id) {
          // Если время матча еще не истекло
          if (Date.now() < match.roundExpiresAt) {
            return res.json({
              status: 'MATCH_FOUND',
              matchId: match.id,
            });
          }
        }
      }
    }

    // 2. Ищем существующего соперника в очереди (не текущего пользователя)
    const opponentIndex = queue.findIndex((q) => q.userId !== user.id);

    if (opponentIndex >= 0) {
      const opponent = queue.splice(opponentIndex, 1)[0];
      // Убираем и текущего пользователя, если он был в очереди
      const selfIndex = queue.findIndex((q) => q.userId === user.id);
      if (selfIndex >= 0) queue.splice(selfIndex, 1);

      const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newMatch: PvpMatch = {
        id: matchId,
        status: 'ACTIVE',
        createdAt: Date.now(),
        roundExpiresAt: Date.now() + 90 * 1000, // 90 секунд раунд
        tasks: getRandomTasks(3),
        player1: {
          userId: user.id,
          userName: user.name || 'Кандидат в бюджет',
          solvedTasksCount: 0,
          answers: {},
        },
        player2: {
          userId: opponent.userId,
          userName: opponent.userName,
          solvedTasksCount: 0,
          answers: {},
        },
        xpAwardedUserIds: [],
      };

      matches.set(matchId, newMatch);
      return res.json({
        status: 'MATCH_FOUND',
        matchId,
      });
    }

    // 3. Если живого соперника нет, проверяем, сколько времени уже ждет текущий пользователь
    let selfEntry = queue.find((q) => q.userId === user.id);
    if (!selfEntry) {
      selfEntry = {
        userId: user.id,
        userName: user.name || 'Кандидат в бюджет',
        queuedAt: Date.now(),
      };
      queue.push(selfEntry);
    }

    const waitTime = Date.now() - selfEntry.queuedAt;

    // Если ожидание превысило 3 секунды — мгновенно спавним симулированного топового соперника
    if (waitTime >= 3000) {
      const selfIndex = queue.findIndex((q) => q.userId === user.id);
      if (selfIndex >= 0) queue.splice(selfIndex, 1);

      const randomBotName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newMatch: PvpMatch = {
        id: matchId,
        status: 'ACTIVE',
        createdAt: Date.now(),
        roundExpiresAt: Date.now() + 90 * 1000,
        tasks: getRandomTasks(3),
        player1: {
          userId: user.id,
          userName: user.name || 'Кандидат в бюджет',
          solvedTasksCount: 0,
          answers: {},
        },
        player2: {
          userId: `bot_${Date.now()}`,
          userName: randomBotName,
          solvedTasksCount: 0,
          answers: {},
          isSimulated: true,
        },
        xpAwardedUserIds: [],
      };

      matches.set(matchId, newMatch);
      return res.json({
        status: 'MATCH_FOUND',
        matchId,
      });
    }

    return res.json({
      status: 'WAITING',
      waitTimeMs: waitTime,
    });
  } catch (err) {
    console.error('PvP queue error:', err);
    return res.status(500).json({ error: 'Ошибка подбора соперника' });
  }
});

// DELETE /api/pvp/queue — отмена поиска
router.delete('/queue', requireAuth, (req, res) => {
  const user = req.user!;
  const idx = queue.findIndex((q) => q.userId === user.id);
  if (idx >= 0) queue.splice(idx, 1);
  return res.json({ status: 'LEFT' });
});

// GET /api/pvp/match/:id — телеметрия матча
router.get('/match/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const match = matches.get(req.params.id);

    if (!match) {
      return res.status(404).json({ error: 'Матч не найден или уже завершен' });
    }

    const isPlayer1 = match.player1.userId === user.id;
    const isPlayer2 = match.player2.userId === user.id;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: 'Вы не являетесь участником этой дуэли' });
    }

    const self = isPlayer1 ? match.player1 : match.player2;
    const opponent = isPlayer1 ? match.player2 : match.player1;

    const now = Date.now();
    const elapsedSec = Math.floor((now - match.createdAt) / 1000);
    const secondsLeft = Math.max(0, Math.floor((match.roundExpiresAt - now) / 1000));

    // Для симулированного соперника динамически рассчитываем реалистичный прогресс решения
    if (opponent.isSimulated && match.status === 'ACTIVE') {
      let botSolved = 0;
      if (elapsedSec >= 16) botSolved = 1;
      if (elapsedSec >= 44) botSolved = 2;
      if (elapsedSec >= 72) botSolved = 3;
      opponent.solvedTasksCount = botSolved;
      if (botSolved === 3 && !opponent.finishedAt) {
        opponent.finishedAt = now;
      }
    }

    // Проверяем условие автозавершения: время вышло ИЛИ хотя бы один решил все 3 задачи
    const isTimeExpired = secondsLeft <= 0;
    const eitherFinishedAll = self.solvedTasksCount >= 3 || opponent.solvedTasksCount >= 3;

    if ((isTimeExpired || eitherFinishedAll) && match.status === 'ACTIVE') {
      match.status = 'COMPLETED';

      // Определяем победителя
      if (self.solvedTasksCount > opponent.solvedTasksCount) {
        match.winnerId = self.userId;
      } else if (opponent.solvedTasksCount > self.solvedTasksCount) {
        match.winnerId = opponent.userId;
      } else {
        // Ничья по количеству — побеждает решивший быстрее
        const selfTime = self.finishedAt || now;
        const oppTime = opponent.finishedAt || now;
        if (selfTime < oppTime) {
          match.winnerId = self.userId;
        } else if (oppTime < selfTime) {
          match.winnerId = opponent.userId;
        } else {
          match.winnerId = null; // абсолютная ничья
        }
      }
    }

    // Начисление +30 XP победителю
    let userXpAwarded = 0;
    if (match.status === 'COMPLETED' && match.winnerId === user.id) {
      if (!match.xpAwardedUserIds.includes(user.id)) {
        match.xpAwardedUserIds.push(user.id);
        await awardUserXp(prisma, user.id, 30, 'Победа в PvP Battleground');
        userXpAwarded = 30;
      }
    }

    // Всегда отдаем актуальные XP и Level пользователя из базы данных
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { xp: true, level: true },
    });
    const newXp = freshUser?.xp ?? 0;
    const newLevel = freshUser?.level ?? 1;

    // Безопасный список задач: пока матч активен — ответы скрыты!
    const isCompleted = match.status === 'COMPLETED';
    const clientTasks = match.tasks.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      statement: t.statement,
      correctAnswer: isCompleted ? t.correctAnswer : undefined,
      explanation: isCompleted ? t.explanation : undefined,
    }));

    return res.json({
      matchId: match.id,
      status: match.status,
      secondsLeft,
      roundExpiresAt: match.roundExpiresAt,
      tasks: clientTasks,
      self: {
        userId: self.userId,
        userName: self.userName,
        solvedCount: self.solvedTasksCount,
        answers: self.answers,
      },
      opponent: {
        userId: opponent.userId,
        userName: opponent.userName,
        solvedCount: opponent.solvedTasksCount,
        currentTaskNum: Math.min(3, opponent.solvedTasksCount + 1),
      },
      isWinner: match.winnerId === user.id,
      isDraw: isCompleted && match.winnerId === null,
      winnerId: match.winnerId,
      xpAwarded: userXpAwarded,
      newLevel,
      newXp,
    });
  } catch (err) {
    console.error('PvP match error:', err);
    return res.status(500).json({ error: 'Ошибка получения данных матча' });
  }
});

// POST /api/pvp/match/:id/answer — отправка ответа на задачу
const answerSchema = z.object({
  taskIndex: z.number().int().min(0).max(2),
  answer: z.string().trim(),
});

router.post('/match/:id/answer', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { taskIndex, answer } = answerSchema.parse(req.body);

    const match = matches.get(req.params.id);
    if (!match || match.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Матч завершен или не существует' });
    }

    const isPlayer1 = match.player1.userId === user.id;
    const isPlayer2 = match.player2.userId === user.id;
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const player = isPlayer1 ? match.player1 : match.player2;
    const task = match.tasks[taskIndex];
    if (!task) {
      return res.status(400).json({ error: 'Задание не найдено' });
    }

    player.answers[taskIndex] = answer;

    const cleanInput = answer.replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();
    const cleanExpected = task.correctAnswer.replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();

    const isCorrect = cleanInput === cleanExpected;
    if (isCorrect) {
      player.solvedTasksCount = Math.min(3, player.solvedTasksCount + 1);
      if (player.solvedTasksCount === 3 && !player.finishedAt) {
        player.finishedAt = Date.now();
      }
    }

    return res.json({
      isCorrect,
      solvedCount: player.solvedTasksCount,
      allSolved: player.solvedTasksCount === 3,
    });
  } catch (err) {
    console.error('PvP answer error:', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректный формат ответа', details: err.errors });
    }
    return res.status(500).json({ error: 'Ошибка отправки ответа' });
  }
});

export default router;
