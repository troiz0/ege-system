import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { differenceInDays, differenceInWeeks } from 'date-fns';
import { OAuth2Client } from 'google-auth-library';
import { toCanonicalModelSlug, isAllowedModel } from '../config/models.js';
import { calculateLevelTelemetry } from '../services/gamificationService.js';
import { signToken } from '../lib/auth.js';
import { sendVerificationEmail } from '../services/emailService.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Конфигурация multer для загрузки аватаров пользователей
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve('uploads/avatars');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req: any, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(rawExt) ? rawExt : '.png';
    const userId = req.user?.id ? req.user.id.slice(0, 8) : 'user';
    cb(null, `avatar-${userId}-${Date.now()}${safeExt}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешена загрузка только изображений (PNG, JPG, WEBP, SVG, GIF)'));
    }
  },
});

const router = Router();

// GET отдаёт null для незаполненных полей — принимаем null обратно при сохранении.
// <input type="date"> на фронтенде шлёт YYYY-MM-DD — принимаем и дату,
// и полный datetime, дату приводим к UTC-полуночи (toDateOnly ниже).
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD или datetime')
  .refine(
    (s) => {
      const [m, d] = [Number(s.slice(5, 7)), Number(s.slice(8, 10))];
      return m >= 1 && m <= 12 && d >= 1 && d <= 31;
    },
    { message: 'Некорректная дата' }
  );
const dateOrDatetimeSchema = z.union([z.string().datetime(), dateOnlySchema]);

/** 'YYYY-MM-DD' -> UTC-полночь; datetime проходит как есть (уже провалидирован). */
function toDateOnly(v: string): Date {
  return v.length === 10 ? new Date(`${v}T00:00:00.000Z`) : new Date(v);
}

const targetSubjectSchema = z.object({
  subjectName: z.string().min(1),
  targetScore: z.number().int().min(0).max(100),
  currentEstimatedScore: z.number().int().min(0).max(100).nullish(),
  examDate: dateOrDatetimeSchema.nullish(),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Имя не может быть пустым').max(50, 'Слишком длинное имя (максимум 50 символов)').optional(),
  avatarUrl: z.string().trim().nullable().optional(),
  grade: z.number().int().min(9).max(11).optional(),
  track: z.string().optional(),
  targetTrack: z.enum(['BASE_65', 'SOLID_85', 'OLYMP_95']).optional(),
  role: z.enum(['student', 'tutor', 'teacher']).optional(),
  prepStartDate: dateOrDatetimeSchema.nullish(),
  prepEndDate: dateOrDatetimeSchema.nullish().or(z.literal('')),
  prepMode: z.enum(['extended', 'full_year', 'accelerated_6m', 'express_1m']).optional(),
  pace: z.enum(['moderate', 'intensive']).optional(),
  weekdayStudyHours: z.number().min(0).max(24).optional(),
  weekendStudyHours: z.number().min(0).max(24).optional(),
  notes: z.string().nullish(),
  meshIntegrationEnabled: z.boolean().optional(),
  meshAiContextEnabled: z.boolean().optional(),
  meshWeakTopicsEnabled: z.boolean().optional(),
  meshPredictorInfluenceEnabled: z.boolean().optional(),
  meshScheduleThrottlingEnabled: z.boolean().optional(),
  targetSubjects: z.array(targetSubjectSchema).optional(),
  selectedAiModel: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
});

// GET /api/profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    let profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
    });

    const targetSubjects = await prisma.targetSubject.findMany({
      where: { userId: user.id },
    });

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        avatarUrl: true,
        email: true,
        authProvider: true,
        telegramId: true,
        telegramUsername: true,
        role: true,
        targetTrack: true,
        selectedAiModel: true,
        xp: true,
        level: true,
        onboardingCompleted: true,
        googleId: true,
        isBanned: true,
        banReason: true,
      },
    });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { userId: user.id },
      });
    }

    // Calculate remaining days and weeks
    const now = new Date();
    const endDate = profile.prepEndDate || new Date(now.getFullYear() + 1, 5, 1); // June next year
    const remainingDays = Math.max(0, differenceInDays(endDate, now));
    const remainingWeeks = Math.max(0, Math.floor(differenceInWeeks(endDate, now)));

    const userXp = freshUser?.xp ?? 0;
    const userLevel = freshUser?.level ?? 1;
    const gamification = calculateLevelTelemetry(userXp, userLevel);

    return res.json({
      profile: {
        ...profile,
        remainingDays,
        remainingWeeks,
      },
      name: freshUser?.name || user.name,
      avatarUrl: freshUser?.avatarUrl || null,
      email: freshUser?.email || user.email,
      authProvider: freshUser?.authProvider || (user as any).authProvider || 'LOCAL',
      telegramId: freshUser?.telegramId || null,
      telegramUsername: freshUser?.telegramUsername || null,
      targetSubjects,
      selectedAiModel: toCanonicalModelSlug(freshUser?.selectedAiModel ?? user.selectedAiModel),
      role: freshUser?.role || 'student',
      targetTrack: freshUser?.targetTrack || 'SOLID_85',
      xp: userXp,
      level: userLevel,
      gamification,
      onboardingCompleted: freshUser?.onboardingCompleted ?? false,
      googleId: freshUser?.googleId || null,
      isBanned: freshUser?.isBanned ?? false,
      banReason: freshUser?.banReason || null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

// PUT /api/profile
router.put('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const data = updateProfileSchema.parse(req.body);

    // Update or create profile
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        grade: data.grade,
        track: data.track,
        prepStartDate: data.prepStartDate ? toDateOnly(data.prepStartDate) : undefined,
        // '' или null из формы — очищенная дата
        prepEndDate:
          data.prepEndDate === undefined || data.prepEndDate === null
            ? undefined
            : data.prepEndDate === ''
            ? null
            : toDateOnly(data.prepEndDate),
        prepMode: data.prepMode,
        pace: data.pace,
        weekdayStudyHours: data.weekdayStudyHours,
        weekendStudyHours: data.weekendStudyHours,
        notes: data.notes,
        meshIntegrationEnabled: data.meshIntegrationEnabled,
        meshAiContextEnabled: data.meshAiContextEnabled,
        meshWeakTopicsEnabled: data.meshWeakTopicsEnabled,
        meshPredictorInfluenceEnabled: data.meshPredictorInfluenceEnabled,
        meshScheduleThrottlingEnabled: data.meshScheduleThrottlingEnabled,
      },
      create: {
        userId: user.id,
        grade: data.grade ?? 10,
        track: data.track ?? 'IT-класс',
        prepStartDate: data.prepStartDate ? toDateOnly(data.prepStartDate) : new Date(),
        prepEndDate: data.prepEndDate ? toDateOnly(data.prepEndDate) : undefined,
        prepMode: data.prepMode ?? 'full_year',
        pace: data.pace ?? 'moderate',
        weekdayStudyHours: data.weekdayStudyHours ?? 2,
        weekendStudyHours: data.weekendStudyHours ?? 4,
        notes: data.notes,
        meshIntegrationEnabled: data.meshIntegrationEnabled ?? false,
        meshAiContextEnabled: data.meshAiContextEnabled ?? false,
        meshWeakTopicsEnabled: data.meshWeakTopicsEnabled ?? false,
        meshPredictorInfluenceEnabled: data.meshPredictorInfluenceEnabled ?? false,
        meshScheduleThrottlingEnabled: data.meshScheduleThrottlingEnabled ?? false,
      },
    });

    // Update target subjects if provided
    if (data.targetSubjects) {
      // Delete existing
      await prisma.targetSubject.deleteMany({
        where: { userId: user.id },
      });

      // Create new
      if (data.targetSubjects.length > 0) {
        await Promise.all(
          data.targetSubjects.map((subject) =>
            prisma.targetSubject.create({
              data: {
                userId: user.id,
                subjectName: subject.subjectName,
                targetScore: subject.targetScore,
                currentEstimatedScore: subject.currentEstimatedScore,
                examDate: subject.examDate ? toDateOnly(subject.examDate) : undefined,
              },
            })
          )
        );
      }
    }

    // Update User name, avatarUrl, targetTrack, role, selectedAiModel and onboardingCompleted if provided
    const userUpdateData: Record<string, unknown> = {};
    if (data.name !== undefined) userUpdateData.name = data.name;
    if (data.avatarUrl !== undefined) userUpdateData.avatarUrl = data.avatarUrl;
    if (data.targetTrack !== undefined) userUpdateData.targetTrack = data.targetTrack;
    if (data.role !== undefined) userUpdateData.role = data.role;
    if (data.onboardingCompleted !== undefined) userUpdateData.onboardingCompleted = data.onboardingCompleted;
    if (data.selectedAiModel !== undefined && data.selectedAiModel !== null) {
      if (isAllowedModel(data.selectedAiModel)) {
        userUpdateData.selectedAiModel = toCanonicalModelSlug(data.selectedAiModel);
      }
    }
    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        avatarUrl: true,
        role: true,
        targetTrack: true,
        selectedAiModel: true,
        xp: true,
        level: true,
        onboardingCompleted: true,
      },
    });

    const targetSubjects = await prisma.targetSubject.findMany({
      where: { userId: user.id },
    });

    // Calculate remaining days and weeks
    const now = new Date();
    const endDate = profile.prepEndDate || new Date(now.getFullYear() + 1, 5, 1);
    const remainingDays = Math.max(0, differenceInDays(endDate, now));
    const remainingWeeks = Math.max(0, Math.floor(differenceInWeeks(endDate, now)));

    return res.json({
      profile: {
        ...profile,
        remainingDays,
        remainingWeeks,
      },
      name: updatedUser?.name || user.name,
      avatarUrl: updatedUser?.avatarUrl || null,
      targetSubjects,
      selectedAiModel: toCanonicalModelSlug(updatedUser?.selectedAiModel ?? user.selectedAiModel),
      role: updatedUser?.role || 'student',
      targetTrack: updatedUser?.targetTrack || 'SOLID_85',
      xp: updatedUser?.xp ?? 0,
      level: updatedUser?.level ?? 1,
      onboardingCompleted: updatedUser?.onboardingCompleted ?? false,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные данные', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

// POST /api/profile/avatar — Загрузка файла аватара пользователя
router.post('/avatar', requireAuth, (req, res) => {
  uploadAvatar.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Размер файла аватара не должен превышать 5 МБ' });
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки аватара' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Файл аватара не был передан' });
    }

    try {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl },
        select: { id: true, name: true, avatarUrl: true },
      });

      return res.json({
        success: true,
        avatarUrl: updatedUser.avatarUrl,
        name: updatedUser.name,
      });
    } catch (saveError) {
      console.error('Save avatar error:', saveError);
      return res.status(500).json({ error: 'Ошибка сохранения аватара' });
    }
  });
});

// DELETE /api/profile/avatar — Сброс (удаление) аватара
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: null },
      select: { id: true, name: true, avatarUrl: true },
    });

    return res.json({
      success: true,
      avatarUrl: null,
      name: updatedUser.name,
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    return res.status(500).json({ error: 'Ошибка сброса аватара' });
  }
});

// POST /api/profile/link-google — Привязка Google-аккаунта к текущему профилю
router.post('/link-google', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { credential } = z.object({ credential: z.string().min(1, 'Токен Google обязателен') }).parse(req.body);

    if (!googleClient) {
      return res.status(500).json({ error: 'Google OAuth не настроен на сервере' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(400).json({ error: 'Невалидный Google токен' });
    }

    const googleId = payload.sub;

    // Проверяем: если этот googleId уже привязан к ДРУГОМУ пользователю
    const existing = await prisma.user.findFirst({
      where: {
        googleId,
        id: { not: user.id },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Этот Google аккаунт уже привязан к другому профилю' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId,
        avatarUrl: user.avatarUrl || payload.picture,
      },
    });

    return res.json({ success: true, googleId });
  } catch (error: any) {
    console.error('Ошибка привязки Google:', error);
    return res.status(400).json({ error: error?.message || 'Ошибка привязки Google-аккаунта' });
  }
});

// POST /api/profile/unlink-google — Отвязка Google-аккаунта
router.post('/unlink-google', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    await prisma.user.update({
      where: { id: user.id },
      data: { googleId: null },
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Ошибка отвязки Google:', error);
    return res.status(500).json({ error: 'Ошибка отвязки Google-аккаунта' });
  }
});

// DELETE /api/profile/account — Полное удаление аккаунта (152-ФЗ / GDPR)
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    await prisma.$transaction(async (tx) => {
      // Удаляем стрик активности
      await tx.gamificationStreak.deleteMany({ where: { userId: user.id } }).catch(() => null);
      // Каскадно удаляем пользователя и все связанные таблицы
      await tx.user.delete({ where: { id: user.id } });
    });

    // Очищаем сессионную cookie
    res.clearCookie('authToken');

    return res.json({ success: true, message: 'Аккаунт и персональные данные полностью удалены' });
  } catch (error: any) {
    console.error('Ошибка удаления аккаунта:', error);
    return res.status(500).json({ error: 'Ошибка при удалении аккаунта' });
  }
});

// POST /api/profile/email/request-code — Запрос кода подтверждения для привязки/смены email
router.post('/email/request-code', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { email } = z.object({ email: z.string().email('Некорректный email-адрес') }).parse(req.body);
    const targetEmail = email.trim().toLowerCase();

    // Проверяем текущий email
    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser && currentUser.email.toLowerCase() === targetEmail) {
      return res.status(400).json({ error: 'Этот email уже привязан к вашему аккаунту' });
    }

    // Проверяем, не занят ли email другим пользователем
    const existing = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (existing && existing.id !== user.id) {
      return res.status(400).json({ error: 'Этот email уже используется другим аккаунтом' });
    }

    // Проверяем кулдаун повторной отправки (60 сек)
    const lastCode = await prisma.verificationCode.findFirst({
      where: { email: targetEmail },
      orderBy: { createdAt: 'desc' },
    });
    if (lastCode) {
      const timePassed = Date.now() - new Date(lastCode.createdAt).getTime();
      const cooldownMs = 60 * 1000;
      if (timePassed < cooldownMs) {
        const secondsLeft = Math.ceil((cooldownMs - timePassed) / 1000);
        return res.status(429).json({
          error: `Запросить код повторно можно через ${secondsLeft}с...`,
          secondsLeft,
        });
      }
    }

    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.verificationCode.deleteMany({ where: { email: targetEmail } });
    await prisma.verificationCode.create({
      data: {
        email: targetEmail,
        code,
        payload: JSON.stringify({ userId: user.id, targetEmail }),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 минут
      },
    });

    const emailResult = await sendVerificationEmail({
      email: targetEmail,
      code,
      title: 'ПРИВЯЗКА EMAIL-АДРЕСА',
      description: 'Вы получили это письмо для подтверждения привязки нового адреса электронной почты к вашему профилю <strong style="color: #ffffff;">EGE.SYSTEM</strong>. Введите следующий 6-значный код:',
    });

    if (!emailResult.success && process.env.NODE_ENV === 'development') {
      return res.json({
        success: true,
        message: `[DEV] Ошибка SMTP (${emailResult.error}). Тестовый код: ${code}`,
        cooldownSeconds: 60,
        devCode: code,
      });
    }

    return res.json({
      success: true,
      message: `Код подтверждения отправлен на ${targetEmail}`,
      cooldownSeconds: 60,
      ...(emailResult.devMode ? { devCode: code } : {}),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Ошибка запроса кода email:', error);
    return res.status(500).json({ error: 'Ошибка отправки кода подтверждения' });
  }
});

// POST /api/profile/email/verify-code — Подтверждение кода и привязка email к аккаунту
router.post('/email/verify-code', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { email, code } = z.object({
      email: z.string().email('Некорректный email-адрес'),
      code: z.string().min(4, 'Введите код подтверждения'),
    }).parse(req.body);

    const targetEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const record = await prisma.verificationCode.findFirst({
      where: { email: targetEmail, code: cleanCode },
    });

    if (!record || new Date(record.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Неверный или просроченный код подтверждения' });
    }

    let payload: any = {};
    try {
      payload = JSON.parse(record.payload || '{}');
    } catch {
      /* noop */
    }

    if (payload.userId && payload.userId !== user.id) {
      return res.status(403).json({ error: 'Данный код был выдан для другой сессии' });
    }

    // Проверяем уникальность
    const existing = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (existing && existing.id !== user.id) {
      return res.status(400).json({ error: 'Этот email уже используется другим аккаунтом' });
    }

    // Обновляем email пользователя
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { email: targetEmail },
    });

    // Удаляем использованный код
    await prisma.verificationCode.deleteMany({ where: { email: targetEmail } });

    // Выпускаем обновленный JWT токен
    const token = signToken({ userId: updatedUser.id, email: updatedUser.email });
    res.cookie('authToken', token, COOKIE_OPTIONS);

    return res.json({
      success: true,
      email: updatedUser.email,
      message: 'Email успешно подтвержден и привязан к аккаунту',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Ошибка подтверждения кода email:', error);
    return res.status(500).json({ error: 'Ошибка подтверждения кода' });
  }
});

// POST /api/profile/email/resend-code — Повторная отправка кода привязки email
router.post('/email/resend-code', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { email } = z.object({ email: z.string().email('Некорректный email-адрес') }).parse(req.body);
    const targetEmail = email.trim().toLowerCase();

    const lastCode = await prisma.verificationCode.findFirst({
      where: { email: targetEmail },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastCode) {
      return res.status(400).json({ error: 'Сессия подтверждения не найдена. Запросите код заново' });
    }

    const timePassed = Date.now() - new Date(lastCode.createdAt).getTime();
    const cooldownMs = 60 * 1000;
    if (timePassed < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timePassed) / 1000);
      return res.status(429).json({
        error: `Запросить код повторно можно через ${secondsLeft}с...`,
        secondsLeft,
      });
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.verificationCode.deleteMany({ where: { email: targetEmail } });
    await prisma.verificationCode.create({
      data: {
        email: targetEmail,
        code: newCode,
        payload: lastCode.payload,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const emailResult = await sendVerificationEmail({
      email: targetEmail,
      code: newCode,
      title: 'ПРИВЯЗКА EMAIL-АДРЕСА',
      description: 'Вы получили это письмо для подтверждения привязки нового адреса электронной почты к вашему профилю <strong style="color: #ffffff;">EGE.SYSTEM</strong>. Введите следующий 6-значный код:',
    });

    if (!emailResult.success && process.env.NODE_ENV === 'development') {
      return res.json({
        success: true,
        message: `[DEV] Ошибка SMTP (${emailResult.error}). Новый код: ${newCode}`,
        cooldownSeconds: 60,
        devCode: newCode,
      });
    }

    return res.json({
      success: true,
      message: 'Новый код подтверждения отправлен на почту',
      cooldownSeconds: 60,
      ...(emailResult.devMode ? { devCode: newCode } : {}),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Ошибка повторной отправки кода:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
