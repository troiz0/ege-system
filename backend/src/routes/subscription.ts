import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/requireAuth.js';
import { PLANS, FREE_FEATURES, calculatePrice } from '../config/subscription.js';
import { createUserKey, revokeUserKey, getKeyUsage } from '../services/openrouterKeys.js';

const router = Router();

// GET /api/subscription/plans
router.get('/plans', (_req, res): void => {
  res.json({
    plans: PLANS,
    freeFeatures: FREE_FEATURES,
  });
});

// GET /api/subscription/status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        subscriptionTier: true,
        proExpiresAt: true,
        trafficUsedPercent: true,
        freeAiRequestsLeft: true,
        freeAiResetAt: true,
        isDemo: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Проверяем срок действия PRO
    if (user.subscriptionTier === 'PRO' && user.proExpiresAt && user.proExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { subscriptionTier: 'FREE' },
      });
      await revokeUserKey(req.user!.userId);
      user.subscriptionTier = 'FREE';
    }

    interface AiStatus {
      usedPercent?: number;
      remainingPercent?: number;
      requestsLeft?: number;
      resetAt?: Date | null;
    }
    let aiStatus: AiStatus = {};

    if (user.subscriptionTier === 'PRO') {
      const usage = await getKeyUsage(req.user!.userId);
      aiStatus = {
        usedPercent: usage.usedPercent,
        remainingPercent: usage.remainingPercent,
      };
    } else {
      aiStatus = {
        requestsLeft: user.freeAiRequestsLeft,
        resetAt: user.freeAiResetAt,
      };
    }

    res.json({
      tier: user.subscriptionTier,
      proExpiresAt: user.proExpiresAt,
      isDemo: user.isDemo,
      aiStatus,
    });
  } catch (error) {
    console.error('Ошибка получения статуса подписки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const checkoutSchema = z.object({
  planName: z.enum(['PRO_MONTH', 'PRO_YEAR']),
  promoCode: z.string().optional(),
  paymentMethod: z.literal('MOCK_CARD'),
});

// POST /api/subscription/checkout
router.post('/checkout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { planName, promoCode, paymentMethod } = checkoutSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const plan = PLANS.find((p) => p.name === planName);
    if (!plan) {
      res.status(400).json({ error: 'Неверный тариф' });
      return;
    }

    const amount = calculatePrice(planName, promoCode);

    // Создаём транзакцию
    const transaction = await prisma.paymentTransaction.create({
      data: {
        userId: user.id,
        planName,
        amount,
        currency: plan.currency,
        status: 'SUCCESS',
        paymentMethod,
        promoCode,
      },
    });

    // Обновляем подписку
    const proExpiresAt = new Date();
    proExpiresAt.setDate(proExpiresAt.getDate() + plan.durationDays);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: 'PRO',
        proExpiresAt,
      },
    });

    // Выпускаем персональный ключ (только если не демо)
    if (!user.isDemo) {
      const keyResult = await createUserKey(user.id);
      if (!keyResult.success) {
        console.warn(`⚠️  Не удалось создать ключ для пользователя ${user.id}: ${keyResult.error}`);
      }
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
      },
      subscription: {
        tier: 'PRO',
        expiresAt: proExpiresAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка checkout:', error);
    res.status(500).json({ error: 'Ошибка при оформлении подписки' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (user.subscriptionTier === 'FREE') {
      res.status(400).json({ error: 'У вас уже бесплатный тариф' });
      return;
    }

    // Отменяем подписку
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: 'FREE',
        proExpiresAt: null,
      },
    });

    // Отзываем ключ
    await revokeUserKey(user.id);

    res.json({
      success: true,
      message: 'Подписка отменена',
    });
  } catch (error) {
    console.error('Ошибка отмены подписки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/subscription/demo-pro — активация PRO в песочнице (без оплаты)
router.post('/demo-pro', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (user.subscriptionTier === 'PRO' && user.proExpiresAt && user.proExpiresAt > new Date()) {
      res.status(400).json({ error: 'PRO уже активирован' });
      return;
    }

    const proExpiresAt = new Date();
    proExpiresAt.setDate(proExpiresAt.getDate() + 30);

    const [transaction] = await prisma.$transaction([
      prisma.paymentTransaction.create({
        data: {
          userId,
          planName: 'PRO_MONTH',
          amount: 0,
          currency: 'RUB',
          status: 'SUCCESS',
          paymentMethod: 'TEST_GATEWAY',
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'PRO', proExpiresAt },
      }),
    ]);

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
      },
      subscription: {
        tier: 'PRO',
        expiresAt: proExpiresAt,
      },
    });
  } catch (error: unknown) {
    console.error('Ошибка активации демо-PRO:', error);
    res.status(500).json({ error: 'Не удалось активировать PRO' });
  }
});

export default router;
