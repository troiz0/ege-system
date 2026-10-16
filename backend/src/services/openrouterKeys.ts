import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { PRO_KEY_LIMIT_USD } from '../config/limits.js';
import { errText } from '../lib/errors.js';

const OPENROUTER_MANAGEMENT_KEY = process.env.OPENROUTER_MANAGEMENT_KEY || '';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT = 10000;

interface OpenRouterKeyResponse {
  key: string;
  id: string;
  name: string;
  limit: number;
}

interface KeyUsageResponse {
  usage: number;
  limit: number;
}

export async function createUserKey(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!OPENROUTER_MANAGEMENT_KEY) {
    console.warn('⚠️  OPENROUTER_MANAGEMENT_KEY не установлен, пропускаем создание ключа');
    return { success: false, error: 'OpenRouter Management API не настроен' };
  }

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.warn('⚠️  ENCRYPTION_KEY должен быть 64 hex-символа');
    return { success: false, error: 'Шифрование не настроено' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${OPENROUTER_API_BASE}/keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_MANAGEMENT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `ege-ai-user-${userId}`,
        limit: PRO_KEY_LIMIT_USD,
        limit_reset: 'monthly',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter API error:', response.status, errorText);
      return { success: false, error: `Ошибка OpenRouter API: ${response.status}` };
    }

    const data = await response.json() as OpenRouterKeyResponse;

    // Шифруем ключ и сохраняем
    const encrypted = encrypt(data.key, ENCRYPTION_KEY);

    await prisma.user.update({
      where: { id: userId },
      data: {
        openrouterKeyEnc: encrypted,
        openrouterKeyId: data.id,
        trafficUsedPercent: 0,
      },
    });

    console.log(`✅ Создан персональный ключ для пользователя ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Ошибка при создании ключа OpenRouter:', errText(error));
    return { success: false, error: 'Не удалось создать персональный ключ' };
  }
}

export async function revokeUserKey(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.openrouterKeyId) {
    return;
  }

  try {
    // Удаляем локальную запись
    await prisma.user.update({
      where: { id: userId },
      data: {
        openrouterKeyEnc: null,
        openrouterKeyId: null,
        trafficUsedPercent: 0,
      },
    });

    // Пытаемся удалить ключ через API (опционально)
    if (OPENROUTER_MANAGEMENT_KEY) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      await fetch(`${OPENROUTER_API_BASE}/keys/${user.openrouterKeyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_MANAGEMENT_KEY}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
    }

    console.log(`🗑️  Ключ отозван для пользователя ${userId}`);
  } catch (error) {
    console.error('⚠️  Ошибка при отзыве ключа:', errText(error));
  }
}

export async function getKeyUsage(userId: string): Promise<{ usedPercent: number; remainingPercent: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.openrouterKeyEnc || !user?.openrouterKeyId) {
    return { usedPercent: 0, remainingPercent: 100 };
  }

  try {
    if (!ENCRYPTION_KEY) {
      console.warn('⚠️  ENCRYPTION_KEY не установлен, возвращаем последнее сохранённое значение');
      return {
        usedPercent: user.trafficUsedPercent,
        remainingPercent: 100 - user.trafficUsedPercent,
      };
    }

    const userKey = decrypt(user.openrouterKeyEnc, ENCRYPTION_KEY);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Пробуем GET /key
    let response = await fetch(`${OPENROUTER_API_BASE}/key`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Если 404, пробуем GET /auth/key
    if (response.status === 404) {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT);

      response = await fetch(`${OPENROUTER_API_BASE}/auth/key`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userKey}`,
        },
        signal: controller2.signal,
      });

      clearTimeout(timeout2);
    }

    if (!response.ok) {
      console.warn('⚠️  OpenRouter API вернул ошибку, используем сохранённое значение');
      return {
        usedPercent: user.trafficUsedPercent,
        remainingPercent: 100 - user.trafficUsedPercent,
      };
    }

    const data = await response.json() as KeyUsageResponse;

    const usedPercent = Math.min(100, Math.max(0, (data.usage / data.limit) * 100));
    const remainingPercent = 100 - usedPercent;

    // Сохраняем обновлённое значение
    await prisma.user.update({
      where: { id: userId },
      data: { trafficUsedPercent: Math.round(usedPercent * 10) / 10 },
    });

    return {
      usedPercent: Math.round(usedPercent * 10) / 10,
      remainingPercent: Math.round(remainingPercent * 10) / 10,
    };
  } catch (error) {
    console.warn('⚠️  Ошибка при получении использования ключа:', errText(error));
    return {
      usedPercent: user.trafficUsedPercent,
      remainingPercent: 100 - user.trafficUsedPercent,
    };
  }
}
