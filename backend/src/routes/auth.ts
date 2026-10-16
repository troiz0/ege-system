import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth, AuthRequest } from '../middleware/requireAuth.js';
import { createUserKey } from '../services/openrouterKeys.js';
import { seedDemoData } from '../seed/demo.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
};

// Схемы валидации
const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  name: z.string().min(1, 'Имя обязательно'),
});

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

const googleAuthSchema = z.object({
  credential: z
    .string({ required_error: 'Не передан токен Google' })
    .min(1, 'Google ID token обязателен'),
});

// Ошибки разбора/подписи/аудитории ID-токена Google (нужен ответ 401, а не 500)
function isGoogleTokenError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const info = `${error.name} ${error.message}`;
  return /TokenInvalid|JsonWebToken|Jwks|Wrong recipient|Signature verification|id token/i.test(info);
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    // Проверяем, существует ли пользователь
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }

    // Создаём пользователя (подписка выдаётся автоматически, во фронтенде не показывается)
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        authProvider: 'LOCAL',
        subscriptionTier: 'PRO',
      },
    });

    // Персональный ключ OpenRouter с месячным лимитом $3 — не блокируем регистрацию при сбое
    const keyResult = await createUserKey(user.id);
    if (!keyResult.success) {
      console.warn(`⚠️  Ключ OpenRouter не выпущен для ${user.id}: ${keyResult.error}`);
    }

    // Генерируем токен
    const token = signToken({ userId: user.id, email: user.email });

    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        isDemo: user.isDemo,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        onboardingCompleted: user.onboardingCompleted ?? false,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    // Проверяем срок действия PRO
    if (user.subscriptionTier === 'PRO' && user.proExpiresAt && user.proExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'FREE' },
      });
      user.subscriptionTier = 'FREE';
    }

    const token = signToken({ userId: user.id, email: user.email });

    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        isDemo: user.isDemo,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        onboardingCompleted: user.onboardingCompleted ?? false,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = googleAuthSchema.parse(req.body);

    if (!googleClient) {
      res.status(500).json({ error: 'Google OAuth не настроен' });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Невалидный Google токен' });
      return;
    }

    const { email, name, picture, sub: googleId } = payload;

    // Ищем существующего пользователя
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Привязываем Google ID, если ещё не привязан
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: picture },
        });
      }
    } else {
      // Создаём нового пользователя (авто-PRO, как и при обычной регистрации)
      user = await prisma.user.create({
        data: {
          email,
          name: name || 'Пользователь Google',
          avatarUrl: picture,
          googleId,
          authProvider: 'GOOGLE',
          subscriptionTier: 'PRO',
        },
      });

      const keyResult = await createUserKey(user.id);
      if (!keyResult.success) {
        console.warn(`⚠️  Ключ OpenRouter не выпущен для ${user.id}: ${keyResult.error}`);
      }
    }

    // Проверяем срок действия PRO
    if (user.subscriptionTier === 'PRO' && user.proExpiresAt && user.proExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'FREE' },
      });
      user.subscriptionTier = 'FREE';
    }

    const token = signToken({ userId: user.id, email: user.email });

    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        isDemo: user.isDemo,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        onboardingCompleted: user.onboardingCompleted ?? false,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    if (isGoogleTokenError(error)) {
      res.status(401).json({ error: 'Неверный или просроченный токен Google' });
      return;
    }
    console.error('Ошибка Google OAuth:', error);
    res.status(500).json({ error: 'Ошибка авторизации через Google' });
  }
});

// POST /api/auth/demo
router.post('/demo', async (_req: Request, res: Response): Promise<void> => {
  try {
    const DEMO_EMAIL = 'demo@ege-ai.ru';
    const DEMO_PASSWORD = 'password123';

    // Ищем или создаём демо-пользователя
    let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!user) {
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          name: 'Демо-пользователь',
          authProvider: 'DEMO',
          subscriptionTier: 'PRO',
          isDemo: true,
          trafficUsedPercent: 18,
        },
      });

      // Заполняем демо-данными
      await seedDemoData(user.id);
    }

    const token = signToken({ userId: user.id, email: user.email });

    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        isDemo: user.isDemo,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        onboardingCompleted: user.onboardingCompleted ?? false,
      },
    });
  } catch (error) {
    console.error('Ошибка демо-входа:', error);
    res.status(500).json({ error: 'Ошибка создания демо-аккаунта' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('authToken');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        subscriptionTier: true,
        proExpiresAt: true,
        selectedAiModel: true,
        trafficUsedPercent: true,
        freeAiRequestsLeft: true,
        isDemo: true,
        xp: true,
        level: true,
        onboardingCompleted: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Проверяем срок действия PRO
    if (user.subscriptionTier === 'PRO' && user.proExpiresAt && user.proExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'FREE' },
      });
      user.subscriptionTier = 'FREE';
    }

    res.json({ user });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
