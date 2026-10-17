import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth, AuthRequest } from '../middleware/requireAuth.js';
import { createUserKey } from '../services/openrouterKeys.js';
import { seedDemoData } from '../seed/demo.js';
import { telegramBotService, pendingLoginSessions } from '../services/telegramBot.js';
import { sendVerificationEmail } from '../services/emailService.js';

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
  grade: z.coerce.number().int().min(1).max(11).optional().default(11),
});

const registerRequestSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  name: z.string().min(1, 'Имя обязательно'),
  grade: z.coerce.number().int().min(1).max(11).optional().default(11),
});

const verifyCodeSchema = z.object({
  email: z.string().email('Некорректный email'),
  code: z.string().regex(/^\d{6}$/, 'Код должен содержать ровно 6 цифр'),
});

const resendCodeSchema = z.object({
  email: z.string().email('Некорректный email'),
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
    const { email, password, name, grade } = registerSchema.parse(req.body);

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
        profile: {
          create: {
            grade: Number(grade || 11),
          },
        },
      },
      include: {
        profile: true,
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? Number(grade || 11),
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

// POST /api/auth/register/request-code
router.post('/register/request-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, grade } = registerRequestSchema.parse(req.body);

    // Проверяем, существует ли пользователь
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
      return;
    }

    // Генерация 6-значного кода
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Хеширование пароля через bcrypt (saltRounds = 10)
    const passwordHash = await hashPassword(password);

    // Удаление старых кодов для этого email и сохранение нового с expiresAt на 10 минут
    await prisma.verificationCode.deleteMany({ where: { email } });
    await prisma.verificationCode.create({
      data: {
        email,
        code,
        payload: JSON.stringify({ passwordHash, name, grade }),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Отправка письма через emailService
    const emailResult = await sendVerificationEmail({ email, code });

    if (!emailResult.success && process.env.NODE_ENV === 'development') {
      res.json({
        success: true,
        message: `[DEV] Ошибка SMTP (${emailResult.error}). Код: ${code}`,
        devCode: code,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Код отправлен на указанную почту',
      ...(emailResult.devMode ? { devCode: code } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка запроса кода регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/register/verify-code
router.post('/register/verify-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = verifyCodeSchema.parse(req.body);

    const record = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      res.status(400).json({ error: 'Неверный или устаревший код подтверждения' });
      return;
    }

    let payload: { passwordHash: string; name: string; grade?: number };
    try {
      payload = JSON.parse(record.payload);
    } catch {
      res.status(400).json({ error: 'Ошибка структуры данных кода подтверждения' });
      return;
    }

    const { passwordHash, name, grade } = payload;

    // Дополнительная проверка на случай параллельной регистрации
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.verificationCode.deleteMany({ where: { email } });
      res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        authProvider: 'LOCAL',
        subscriptionTier: 'PRO',
        profile: {
          create: {
            grade: Number(grade || 11),
          },
        },
      },
      include: {
        profile: true,
      },
    });

    // Персональный ключ OpenRouter
    const keyResult = await createUserKey(user.id);
    if (!keyResult.success) {
      console.warn(`⚠️  Ключ OpenRouter не выпущен для ${user.id}: ${keyResult.error}`);
    }

    // Удаляем использованные коды
    await prisma.verificationCode.deleteMany({ where: { email } });

    // Генерируем токен и куки
    const token = signToken({ userId: user.id, email: user.email });
    res.cookie('authToken', token, COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? (grade ? Number(grade) : 11),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка верификации кода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/register/resend-code
router.post('/register/resend-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = resendCodeSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
      return;
    }

    const lastCode = await prisma.verificationCode.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastCode) {
      res.status(400).json({ error: 'Запрос на регистрацию не найден. Пожалуйста, начните сначала' });
      return;
    }

    const timePassed = Date.now() - new Date(lastCode.createdAt).getTime();
    const cooldownMs = 60 * 1000;
    if (timePassed < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timePassed) / 1000);
      res.status(429).json({
        error: `Запросить код повторно можно через ${secondsLeft}с...`,
        secondsLeft,
      });
      return;
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.verificationCode.deleteMany({ where: { email } });
    await prisma.verificationCode.create({
      data: {
        email,
        code: newCode,
        payload: lastCode.payload,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const emailResult = await sendVerificationEmail({ email, code: newCode });

    if (!emailResult.success && process.env.NODE_ENV === 'development') {
      res.json({
        success: true,
        message: `[DEV] Ошибка SMTP (${emailResult.error}). Новый код: ${newCode}`,
        devCode: newCode,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Новый код отправлен на указанную почту',
      ...(emailResult.devMode ? { devCode: newCode } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Ошибка повторной отправки кода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? null,
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
    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (user) {
      // Привязываем Google ID, если ещё не привязан
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: picture },
          include: { profile: true },
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
          profile: {
            create: {
              grade: 11,
            },
          },
        },
        include: { profile: true },
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? 11,
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
        role: user.role ?? 'student',
        grade: 10,
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
        role: true,
        profile: {
          select: {
            grade: true,
          },
        },
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

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        proExpiresAt: user.proExpiresAt,
        selectedAiModel: user.selectedAiModel,
        trafficUsedPercent: user.trafficUsedPercent,
        freeAiRequestsLeft: user.freeAiRequestsLeft,
        isDemo: user.isDemo,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        onboardingCompleted: user.onboardingCompleted ?? false,
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? null,
      },
    });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Валидация подписи Telegram Login Widget по спецификации:
// HMAC-SHA256(data_check_string, SHA256(bot_token))
function verifyTelegramLoginHash(data: Record<string, any>, botToken: string): boolean {
  if (!botToken || !data.hash) return false;

  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .filter((key) => fields[key] !== undefined && fields[key] !== null && fields[key] !== '')
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Проверка срока давности (максимум 24 часа)
  if (fields.auth_date) {
    const now = Math.floor(Date.now() / 1000);
    if (now - Number(fields.auth_date) > 86400) {
      return false;
    }
  }

  return calculatedHash.toLowerCase() === String(hash).toLowerCase();
}

// POST /api/auth/telegram — вход через Telegram Login Widget
router.post('/telegram', async (req: Request, res: Response): Promise<void> => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'Telegram Bot не настроен на сервере' });
      return;
    }

    const { id, first_name, last_name, username, photo_url, hash } = req.body || {};

    if (!id || !hash) {
      res.status(400).json({ error: 'Не переданы обязательные параметры Telegram (id, hash)' });
      return;
    }

    // Проверка хэша
    const isValid = verifyTelegramLoginHash(req.body, botToken);
    if (!isValid) {
      res.status(401).json({ error: 'Невалидная подпись Telegram Login Widget' });
      return;
    }

    const telegramId = String(id);
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { telegramId },
          ...(username ? [{ telegramUsername: username }] : []),
        ],
      },
      include: { profile: true },
    });

    if (!user) {
      const link = await prisma.telegramNotificationLink.findFirst({
        where: { chatId: telegramId, isActive: true },
        include: { user: { include: { profile: true } } },
      });
      if (link && link.user) {
        user = link.user;
      }
    }

    if (user && user.isBanned) {
      res.status(403).json({
        error: `Ваш аккаунт заблокирован. Причина: ${user.banReason || 'Нарушение правил платформы'}`,
        isBanned: true,
      });
      return;
    }

    if (!user) {
      const tgEmail = username
        ? `${username.toLowerCase()}@telegram.ege.system`
        : `tg_${telegramId}@telegram.ege.system`;

      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: tgEmail },
        include: { profile: true },
      });
      if (existingUserByEmail) {
        user = await prisma.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            telegramId,
            telegramUsername: username || null,
            avatarUrl: photo_url || existingUserByEmail.avatarUrl,
          },
          include: { profile: true },
        });
      } else {
        const displayName = [first_name, last_name].filter(Boolean).join(' ') || username || 'Telegram User';
        user = await prisma.user.create({
          data: {
            email: tgEmail,
            name: displayName,
            avatarUrl: photo_url || null,
            telegramId,
            telegramUsername: username || null,
            authProvider: 'TELEGRAM',
            subscriptionTier: 'PRO',
            profile: {
              create: {
                grade: 11,
              },
            },
          },
          include: { profile: true },
        });

        const keyResult = await createUserKey(user.id);
        if (!keyResult.success) {
          console.warn(`⚠️ Ключ OpenRouter не выпущен для ${user.id}: ${keyResult.error}`);
        }
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId,
          telegramUsername: username || user.telegramUsername,
          avatarUrl: photo_url || user.avatarUrl,
        },
        include: { profile: true },
      });
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? null,
      },
    });
  } catch (error) {
    console.error('Ошибка входа через Telegram:', error);
    res.status(500).json({ error: 'Ошибка сервера при авторизации через Telegram' });
  }
});

// POST /api/auth/telegram/session — инициировать deep-link сессию входа через бота
router.post('/telegram/session', (_req: Request, res: Response): void => {
  const token = crypto.randomBytes(16).toString('hex');
  pendingLoginSessions.set(token, {
    token,
    approved: false,
    createdAt: Date.now(),
  });
  const botUsername = telegramBotService.botUsername;
  const botUrl = `https://t.me/${botUsername}?start=login_${token}`;
  res.json({ token, botUsername, botUrl });
});

// GET /api/auth/telegram/check — проверить подтверждение deep-link сессии входа
router.get('/telegram/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Параметр token обязателен' });
      return;
    }

    const session = pendingLoginSessions.get(token);
    if (!session) {
      res.status(404).json({ error: 'Сессия не найдена или устарела' });
      return;
    }

    if (!session.approved || !session.telegramUser) {
      res.json({ approved: false });
      return;
    }

    const tgUser = session.telegramUser;
    const telegramId = String(tgUser.id);
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { telegramId },
          ...(tgUser.username ? [{ telegramUsername: tgUser.username }] : []),
        ],
      },
      include: { profile: true },
    });

    if (!user) {
      const link = await prisma.telegramNotificationLink.findFirst({
        where: { chatId: telegramId, isActive: true },
        include: { user: { include: { profile: true } } },
      });
      if (link && link.user) {
        user = link.user;
      }
    }

    if (user && user.isBanned) {
      res.status(403).json({
        error: `Ваш аккаунт заблокирован. Причина: ${user.banReason || 'Нарушение правил платформы'}`,
        isBanned: true,
      });
      return;
    }

    if (!user) {
      const tgEmail = tgUser.username
        ? `${tgUser.username.toLowerCase()}@telegram.ege.system`
        : `tg_${telegramId}@telegram.ege.system`;

      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: tgEmail },
        include: { profile: true },
      });
      if (existingUserByEmail) {
        user = await prisma.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            telegramId,
            telegramUsername: tgUser.username || null,
          },
          include: { profile: true },
        });
      } else {
        const displayName = tgUser.first_name || tgUser.username || 'Telegram User';
        user = await prisma.user.create({
          data: {
            email: tgEmail,
            name: displayName,
            telegramId,
            telegramUsername: tgUser.username || null,
            authProvider: 'TELEGRAM',
            subscriptionTier: 'PRO',
            profile: {
              create: {
                grade: 11,
              },
            },
          },
          include: { profile: true },
        });

        const keyResult = await createUserKey(user.id);
        if (!keyResult.success) {
          console.warn(`⚠️ Ключ OpenRouter не выпущен для ${user.id}: ${keyResult.error}`);
        }
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId,
          telegramUsername: tgUser.username || user.telegramUsername,
        },
        include: { profile: true },
      });
    }

    // Удаляем использованную сессию
    pendingLoginSessions.delete(token);

    const authToken = signToken({ userId: user.id, email: user.email });
    res.cookie('authToken', authToken, COOKIE_OPTIONS);
    res.json({
      approved: true,
      token: authToken,
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
        role: user.role ?? 'student',
        grade: user.profile?.grade ?? null,
      },
    });
  } catch (error) {
    console.error('Ошибка проверки Telegram сессии:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
