import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/crypto';
import { checkMeshToken, maskMeshToken, normalizeMeshToken, meshTokenSchema } from '../services/meshAuth';

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

function safeMask(enc: string | null): string | null {
  if (!enc || !ENCRYPTION_KEY) return null;
  try {
    return maskMeshToken(decrypt(enc, ENCRYPTION_KEY));
  } catch {
    return null;
  }
}

// GET /api/mesh — статус подключения аккаунта МЭШ
router.get('/', requireAuth, (req, res) => {
  try {
    const user = req.user!;
    return res.json({
      connected: Boolean(user.meshTokenEnc),
      connectedAt: user.meshConnectedAt ? user.meshConnectedAt.toISOString() : null,
      tokenMasked: safeMask(user.meshTokenEnc ?? null),
    });
  } catch (error) {
    console.error('Mesh status error:', error);
    return res.status(500).json({ error: 'Ошибка получения статуса МЭШ' });
  }
});

// POST /api/mesh — сохранить токен сессии МЭШ (шифруется AES-256-GCM)
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const body = z.object({ token: meshTokenSchema }).parse(req.body);

    const check = checkMeshToken(body.token);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
      return res.status(500).json({ error: 'Ключ шифрования не настроен' });
    }

    const token = normalizeMeshToken(body.token);
    if (token !== body.token.trim()) {
      console.error('[mesh] token normalized on save (Bearer prefix/whitespace removed)');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        meshTokenEnc: encrypt(token, ENCRYPTION_KEY),
        meshConnectedAt: new Date(),
      },
    });

    return res.json({ connected: true, tokenMasked: maskMeshToken(token) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректный токен', details: error.errors });
    }
    console.error('Mesh connect error:', error);
    return res.status(500).json({ error: 'Ошибка сохранения токена МЭШ' });
  }
});

// DELETE /api/mesh — отключить аккаунт МЭШ
router.delete('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    await prisma.user.update({
      where: { id: user.id },
      data: { meshTokenEnc: null, meshConnectedAt: null },
    });
    return res.json({ connected: false });
  } catch (error) {
    console.error('Mesh disconnect error:', error);
    return res.status(500).json({ error: 'Ошибка отключения МЭШ' });
  }
});

export default router;
