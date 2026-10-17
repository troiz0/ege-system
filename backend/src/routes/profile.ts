import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { differenceInDays, differenceInWeeks } from 'date-fns';
import { toCanonicalModelSlug, isAllowedModel } from '../config/models.js';
import { calculateLevelTelemetry } from '../services/gamificationService.js';

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
        role: true,
        targetTrack: true,
        selectedAiModel: true,
        xp: true,
        level: true,
        onboardingCompleted: true,
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
      targetSubjects,
      selectedAiModel: toCanonicalModelSlug(freshUser?.selectedAiModel ?? user.selectedAiModel),
      role: freshUser?.role || 'student',
      targetTrack: freshUser?.targetTrack || 'SOLID_85',
      xp: userXp,
      level: userLevel,
      gamification,
      onboardingCompleted: freshUser?.onboardingCompleted ?? false,
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

    // Update User targetTrack, role, selectedAiModel and onboardingCompleted if provided
    const userUpdateData: Record<string, unknown> = {};
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

export default router;
