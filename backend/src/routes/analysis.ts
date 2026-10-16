import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { performComplexAnalysis } from '../services/ai/analysisService';
import { errText } from '../lib/errors.js';

const router = Router();

// POST /api/analysis/run
router.post('/run', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    const analysis = await performComplexAnalysis(user.id);

    return res.json({
      analysis,
      demoMode: analysis.demoMode,
      notice: analysis.notice,
    });
  } catch (error) {
    console.error('Run analysis error:', error);
    return res.status(500).json({ error: errText(error) || 'Ошибка выполнения анализа' });
  }
});

// GET /api/analysis/latest
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    const snapshot = await prisma.aiAnalysisSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      return res.status(404).json({ error: 'Анализ не найден' });
    }

    const analysis = JSON.parse(snapshot.rawResponseJson);

    return res.json({
      analysis,
      createdAt: snapshot.createdAt,
      demoMode: snapshot.demoMode,
    });
  } catch (error) {
    console.error('Get latest analysis error:', error);
    return res.status(500).json({ error: 'Ошибка получения анализа' });
  }
});

// GET /api/analysis/telemetry — предиктор итогового балла и трекер выгорания
router.get('/telemetry', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { calculateTelemetryPredictor } = await import('../services/analyticsPredictor.js');
    const result = await calculateTelemetryPredictor(user.id);
    return res.json(result);
  } catch (error) {
    console.error('Get telemetry error:', error);
    return res.status(500).json({ error: 'Ошибка расчета телеметрии и предиктора' });
  }
});

export default router;

