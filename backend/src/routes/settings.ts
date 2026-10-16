import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const updateSettingsSchema = z.object({
  // Поддержка обоих вариантов именования (короткие флаги КИМ / длинные флаги профиля)
  meshEnabled: z.boolean().optional(),
  meshIntegrationEnabled: z.boolean().optional(),

  meshChatContext: z.boolean().optional(),
  meshAiContextEnabled: z.boolean().optional(),

  meshWeakTopics: z.boolean().optional(),
  meshWeakTopicsEnabled: z.boolean().optional(),

  meshScorePredictor: z.boolean().optional(),
  meshPredictorInfluenceEnabled: z.boolean().optional(),

  meshScheduleAdaptation: z.boolean().optional(),
  meshScheduleThrottlingEnabled: z.boolean().optional(),

  notificationsEnabled: z.boolean().optional(),
});

// Общий обработчик сохранения (для PUT и PATCH)
async function handleUpdateSettings(req: Request, res: Response) {
  try {
    const user = req.user!;
    const data = updateSettingsSchema.parse(req.body);

    // Нормализуем значения (берем либо короткое, либо длинное имя, если передано)
    const meshEnabledVal = data.meshEnabled ?? data.meshIntegrationEnabled;
    const meshChatContextVal = data.meshChatContext ?? data.meshAiContextEnabled;
    const meshWeakTopicsVal = data.meshWeakTopics ?? data.meshWeakTopicsEnabled;
    const meshScorePredictorVal = data.meshScorePredictor ?? data.meshPredictorInfluenceEnabled;
    const meshScheduleAdaptationVal = data.meshScheduleAdaptation ?? data.meshScheduleThrottlingEnabled;

    // 1. Обновляем модель User (флаги в ядре)
    const userUpdateData: Record<string, boolean> = {};
    if (meshEnabledVal !== undefined) userUpdateData.meshEnabled = meshEnabledVal;
    if (meshChatContextVal !== undefined) userUpdateData.meshChatContext = meshChatContextVal;
    if (meshWeakTopicsVal !== undefined) userUpdateData.meshWeakTopics = meshWeakTopicsVal;
    if (meshScorePredictorVal !== undefined) userUpdateData.meshScorePredictor = meshScorePredictorVal;
    if (meshScheduleAdaptationVal !== undefined) userUpdateData.meshScheduleAdaptation = meshScheduleAdaptationVal;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: userUpdateData,
    });

    // 2. Обновляем модель UserProfile (совместимость со старым слоем профиля)
    const profileUpdateData: Record<string, boolean> = {};
    if (meshEnabledVal !== undefined) profileUpdateData.meshIntegrationEnabled = meshEnabledVal;
    if (meshChatContextVal !== undefined) profileUpdateData.meshAiContextEnabled = meshChatContextVal;
    if (meshWeakTopicsVal !== undefined) profileUpdateData.meshWeakTopicsEnabled = meshWeakTopicsVal;
    if (meshScorePredictorVal !== undefined) profileUpdateData.meshPredictorInfluenceEnabled = meshScorePredictorVal;
    if (meshScheduleAdaptationVal !== undefined) profileUpdateData.meshScheduleThrottlingEnabled = meshScheduleAdaptationVal;

    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: profileUpdateData,
      create: {
        userId: user.id,
        meshIntegrationEnabled: updatedUser.meshEnabled,
        meshAiContextEnabled: updatedUser.meshChatContext,
        meshWeakTopicsEnabled: updatedUser.meshWeakTopics,
        meshPredictorInfluenceEnabled: updatedUser.meshScorePredictor,
        meshScheduleThrottlingEnabled: updatedUser.meshScheduleAdaptation,
      },
    });

    const responsePayload = {
      // Короткие ключи (User)
      meshEnabled: updatedUser.meshEnabled,
      meshChatContext: updatedUser.meshChatContext,
      meshWeakTopics: updatedUser.meshWeakTopics,
      meshScorePredictor: updatedUser.meshScorePredictor,
      meshScheduleAdaptation: updatedUser.meshScheduleAdaptation,
      // Длинные ключи (UserProfile)
      meshIntegrationEnabled: profile.meshIntegrationEnabled,
      meshAiContextEnabled: profile.meshAiContextEnabled,
      meshWeakTopicsEnabled: profile.meshWeakTopicsEnabled,
      meshPredictorInfluenceEnabled: profile.meshPredictorInfluenceEnabled,
      meshScheduleThrottlingEnabled: profile.meshScheduleThrottlingEnabled,
      notificationsEnabled: data.notificationsEnabled ?? true,
    };

    return res.json({
      success: true,
      settings: responsePayload,
    });
  } catch (error) {
    console.error('Update settings error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные параметры настроек', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
}

// GET /api/settings или /api/config
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [dbUser, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          meshEnabled: true,
          meshChatContext: true,
          meshWeakTopics: true,
          meshScorePredictor: true,
          meshScheduleAdaptation: true,
        },
      }),
      prisma.userProfile.findUnique({
        where: { userId: user.id },
      }),
    ]);

    // Синхронизируем состояние: если профиль пустой, создаем его
    const meshEnabled = dbUser?.meshEnabled ?? profile?.meshIntegrationEnabled ?? false;
    const meshChatContext = dbUser?.meshChatContext ?? profile?.meshAiContextEnabled ?? false;
    const meshWeakTopics = dbUser?.meshWeakTopics ?? profile?.meshWeakTopicsEnabled ?? false;
    const meshScorePredictor = dbUser?.meshScorePredictor ?? profile?.meshPredictorInfluenceEnabled ?? false;
    const meshScheduleAdaptation = dbUser?.meshScheduleAdaptation ?? profile?.meshScheduleThrottlingEnabled ?? false;

    if (!profile) {
      await prisma.userProfile.create({
        data: {
          userId: user.id,
          meshIntegrationEnabled: meshEnabled,
          meshAiContextEnabled: meshChatContext,
          meshWeakTopicsEnabled: meshWeakTopics,
          meshPredictorInfluenceEnabled: meshScorePredictor,
          meshScheduleThrottlingEnabled: meshScheduleAdaptation,
        },
      }).catch(() => {});
    }

    return res.json({
      settings: {
        // Короткие ключи
        meshEnabled,
        meshChatContext,
        meshWeakTopics,
        meshScorePredictor,
        meshScheduleAdaptation,
        // Длинные ключи
        meshIntegrationEnabled: meshEnabled,
        meshAiContextEnabled: meshChatContext,
        meshWeakTopicsEnabled: meshWeakTopics,
        meshPredictorInfluenceEnabled: meshScorePredictor,
        meshScheduleThrottlingEnabled: meshScheduleAdaptation,
        notificationsEnabled: true,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// PUT /api/settings или /api/config
router.put('/', requireAuth, handleUpdateSettings);

// PATCH /api/settings или /api/config
router.patch('/', requireAuth, handleUpdateSettings);

export default router;
