import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getKeyUsage } from '../services/openrouterKeys';

const router = Router();

// GET /api/usage
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (user.subscriptionTier === 'PRO') {
      // PRO: return percentage-based usage
      let usedPercent = user.trafficUsedPercent;
      
      // Try to get fresh usage data if key exists
      if (user.openrouterKeyEnc && user.openrouterKeyId) {
        try {
          const usage = await getKeyUsage(user.id);
          usedPercent = usage.usedPercent;
        } catch (error) {
          console.warn('Failed to fetch fresh usage, using cached:', error);
        }
      }

      const remainingPercent = Math.max(0, 100 - usedPercent);

      return res.json({
        tier: 'PRO',
        usedPercent: Math.round(usedPercent),
        remainingPercent: Math.round(remainingPercent),
      });
    } else {
      // FREE: return request count
      return res.json({
        tier: 'FREE',
        requestsLeft: user.freeAiRequestsLeft,
        requestsTotal: 3,
      });
    }
  } catch (error) {
    console.error('Get usage error:', error);
    return res.status(500).json({ error: 'Ошибка получения статистики использования' });
  }
});

export default router;
