import type { User } from '@prisma/client';
import type { ZodSchema } from 'zod';
import { decrypt } from '../../lib/crypto.js';
import { stripFences } from '../../lib/json.js';
import { aiGate, freeQuota } from '../../lib/usage.js';
import { FREE_AI_MODEL } from '../../config/aiDefaults.js';
import { getModelProviderConfig } from '../../config/models.js';
import { prisma } from '../../lib/prisma.js';
import { getKeyUsage } from '../openrouterKeys.js';
import { MOCK_ANALYSIS, MOCK_SCHEDULE, MOCK_HOMEWORK, MOCK_ATTACHMENT, MOCK_EXPLAIN, MOCK_MATERIAL, MOCK_VERDICT, MOCK_TRAINER_GENERATE, MOCK_FIPI_CHECK, MOCK_SOS } from './mocks.js';
import { errText } from '../../lib/errors.js';
import { aiCache } from './aiCache.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 60000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string }; cache_control?: { type: 'ephemeral' } }>;
}

/**
 * Подключает OpenRouter/Anthropic Prompt Caching:
 * кэширует большой системный промпт и контекст, снижая стоимость входных токенов на 90%.
 */
function applyPromptCaching(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'system') {
      if (typeof m.content === 'string') {
        return {
          role: 'system',
          content: [
            {
              type: 'text',
              text: m.content,
              cache_control: { type: 'ephemeral' },
            },
          ],
        };
      }
      if (Array.isArray(m.content) && m.content.length > 0) {
        return {
          role: 'system',
          content: m.content.map((item, idx) =>
            idx === 0 && item.type === 'text'
              ? { ...item, cache_control: { type: 'ephemeral' } }
              : item
          ),
        };
      }
    }
    return m;
  });
}

export interface ChatJsonOptions<T> {
  user: User;
  messages: ChatMessage[];
  schema: ZodSchema<T>;
  images?: string[]; // base64 data URLs
  mockType?: 'analysis' | 'schedule' | 'homework' | 'attachment' | 'explain' | 'material' | 'verdict' | 'trainer' | 'fipi' | 'sos';
  maxTokens?: number;
}

export interface ChatJsonResult<T> {
  data: T;
  demoMode: boolean;
  notice?: string;
}

function getMockForType<T>(mockType?: string): T {
  switch (mockType) {
    case 'analysis': return MOCK_ANALYSIS as unknown as T;
    case 'schedule': return MOCK_SCHEDULE as unknown as T;
    case 'homework': return MOCK_HOMEWORK as unknown as T;
    case 'attachment': return MOCK_ATTACHMENT as unknown as T;
    case 'explain': return MOCK_EXPLAIN as unknown as T;
    case 'material': return MOCK_MATERIAL as unknown as T;
    case 'verdict': return MOCK_VERDICT as unknown as T;
    case 'trainer': return MOCK_TRAINER_GENERATE as unknown as T;
    case 'fipi': return MOCK_FIPI_CHECK as unknown as T;
    case 'sos': return MOCK_SOS as unknown as T;
    default: return MOCK_ANALYSIS as unknown as T;
  }
}


export const MOCK_CHAT_REPLY =
  'Привет! Я твой эксперт ЕГЭ и ментор по поступлению. Над какими номерами КИМ или сложными темами работаем сегодня? Можем разобрать критерии второй части, решить тестовые задания или разобрать ошибки.';

export interface ChatTextOptions {
  user: User;
  messages: ChatMessage[];
  images?: string[]; // base64 data URLs (OpenAI Vision)
}

export interface ChatTextResult {
  reply: string;
  demoMode: boolean;
  notice?: string;
}

/** Текстовый чат без JSON-схемы (для AI-Чата): с гейтом лимитов и демо-фолбэком. */
export async function chatText({ user, messages, images }: ChatTextOptions): Promise<ChatTextResult> {
  if (user.isDemo) {
    return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'Демо-режим: показан пример ответа' };
  }
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'Пользователь не найден' };
  const gate = aiGate(dbUser);
  if (!gate.ok) return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: gate.notice };

  let apiKey: string | null = null;
  let model = user.selectedAiModel || FREE_AI_MODEL;
  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  if (user.subscriptionTier === 'PRO' && user.openrouterKeyEnc && encryptionKey) {
    try {
      apiKey = decrypt(user.openrouterKeyEnc, encryptionKey);
    } catch {
      apiKey = process.env.OPENROUTER_API_KEY || null;
    }
  } else {
    apiKey = process.env.OPENROUTER_API_KEY || null;
  }
  if (!apiKey) return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'Ключ OpenRouter не настроен. Показан демо-ответ.' };

  // Изображения — мультимодально к последнему сообщению пользователя (OpenAI Vision)
  const finalMessages: ChatMessage[] = [...messages];
  if (images && images.length > 0) {
    for (let i = finalMessages.length - 1; i >= 0; i--) {
      if (finalMessages[i].role === 'user' && typeof finalMessages[i].content === 'string') {
        finalMessages[i] = {
          role: 'user',
          content: [
            { type: 'text', text: finalMessages[i].content as string },
            ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: img } })),
          ],
        };
        break;
      }
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const targetModel = model.endsWith(':online') ? model : `${model}:online`;
    const providerConfig = getModelProviderConfig(model);

    // 1. Проверка кэша ответов (0 токенов при повторных запросах)
    const cacheKey = aiCache.computeKey({
      model: targetModel,
      messages: finalMessages,
      temperature: 0.7,
    });
    const cached = aiCache.get<ChatTextResult>(cacheKey);
    if (cached) {
      console.log(`[AI Cache] HIT for chatText ${targetModel} (0 tokens spent)`);
      return cached;
    }

    // 2. OpenRouter/Anthropic Prompt Caching (кэширует системный контекст, экономя 90% токенов)
    const cachedMessages = applyPromptCaching(finalMessages);

    const requestBody: Record<string, unknown> = {
      model: targetModel,
      messages: cachedMessages,
      temperature: 0.7,
    };
    if (providerConfig) {
      requestBody.provider = providerConfig;
    }

    let response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
        'X-Title': 'EGE AI Tutor',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // 3. Если личный ключ вернул 401 — автоматически переключаемся на системный ключ
    if (response.status === 401 && apiKey !== process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY) {
      console.warn('Personal key returned 401, falling back to system key...');
      apiKey = process.env.OPENROUTER_API_KEY;
      response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
          'X-Title': 'EGE AI Tutor',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    }

    // 4. Если целевой провайдер (flex, bedrock и т.д.) перегружен или вернул 429/5xx/400 — повторяем с автопереключением
    if (!response.ok && (response.status === 429 || response.status >= 500 || response.status === 400)) {
      console.warn(`chatText primary endpoint returned ${response.status}, retrying with fallback provider...`);
      const fallbackBody = {
        ...requestBody,
        provider: providerConfig ? { ...providerConfig, allow_fallbacks: true } : undefined,
      };
      const retryResponse = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
          'X-Title': 'EGE AI Tutor',
        },
        body: JSON.stringify(fallbackBody),
        signal: controller.signal,
      });
      if (retryResponse.ok) {
        response = retryResponse;
      }
    }

    clearTimeout(timeoutId);
    if (!response.ok) {
      if (response.status === 402) {
        return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'Месячный лимит токенов исчерпан (100%). Показан демо-ответ.' };
      }
      if (response.status === 429) {
        return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'Слишком много запросов. Показан демо-ответ.' };
      }
      throw new Error(`OpenRouter error ${response.status}`);
    }
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from AI');

    // Сохраняем в кэш ответов
    aiCache.set(cacheKey, { reply, demoMode: false });
    if (gate.mode === 'free') {
      const quota = freeQuota(dbUser);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          freeAiRequestsLeft: Math.max(0, quota.left - 1),
          ...(quota.changed ? { freeAiResetAt: quota.resetAt } : {}),
        },
      });
    }
    return { reply, demoMode: false };
  } catch (error) {
    console.error('chatText error:', error);
    return { reply: MOCK_CHAT_REPLY, demoMode: true, notice: 'AI временно недоступен, показан демонстрационный ответ.' };
  }
}

export async function chatJson<T>({ user, messages, schema, images, mockType, maxTokens }: ChatJsonOptions<T>): Promise<ChatJsonResult<T>> {
  // Demo users always get mocks
  if (user.isDemo) {
    return {
      data: getMockForType(mockType),
      demoMode: true,
      notice: 'Демо-режим: показаны реалистичные примеры данных',
    };
  }

  // Check if user can make AI requests
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return {
      data: getMockForType(mockType),
      demoMode: true,
      notice: 'Пользователь не найден',
    };
  }

  const gate = aiGate(dbUser);
  if (!gate.ok) {
    return {
      data: getMockForType(mockType),
      demoMode: true,
      notice: gate.notice,
    };
  }

  // Determine API key and model
  let apiKey: string | null = null;
  let model = user.selectedAiModel || FREE_AI_MODEL;
  const encryptionKey = process.env.ENCRYPTION_KEY || '';

  if (user.subscriptionTier === 'PRO' && user.openrouterKeyEnc && encryptionKey) {
    try {
      apiKey = decrypt(user.openrouterKeyEnc, encryptionKey);
      // Use selected model for PRO users
    } catch (err) {
      console.error('Failed to decrypt user key:', err);
      apiKey = process.env.OPENROUTER_API_KEY || null;
    }
  } else {
    apiKey = process.env.OPENROUTER_API_KEY || null;
  }

  if (!apiKey) {
    return {
      data: getMockForType(mockType),
      demoMode: true,
      notice: 'Ключ OpenRouter не настроен. Показаны демо-данные.',
    };
  }

  // Prepare messages with images if provided
  const finalMessages = [...messages];
  if (images && images.length > 0) {
    const lastMessage = finalMessages[finalMessages.length - 1];
    if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
      lastMessage.content = [
        { type: 'text', text: lastMessage.content },
        ...images.map(img => ({ type: 'image_url' as const, image_url: { url: img } })),
      ];
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const targetModel = model.endsWith(':online') ? model : `${model}:online`;
    const providerConfig = getModelProviderConfig(model);

    // 1. Проверка кэша ответов (экономия 100% токенов для структурированных данных)
    const cacheKey = aiCache.computeKey({
      model: targetModel,
      messages: finalMessages,
      extra: mockType,
      temperature: 0.7,
    });
    const cached = aiCache.get<ChatJsonResult<T>>(cacheKey);
    if (cached) {
      console.log(`[AI Cache] HIT for chatJson ${targetModel} (0 tokens spent)`);
      return cached;
    }

    // 2. OpenRouter/Anthropic Prompt Caching (кэширует системный контекст и схемы)
    const cachedMessages = applyPromptCaching(finalMessages);

    const requestBody: Record<string, unknown> = {
      model: targetModel,
      messages: cachedMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      ...(maxTokens ? { max_tokens: maxTokens } : mockType === 'material' ? { max_tokens: 2500 } : {}),
    };
    if (providerConfig) {
      requestBody.provider = providerConfig;
    }

    let response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
        'X-Title': 'EGE AI Tutor',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // 3. Если личный ключ вернул 401 — автоматически переключаемся на системный ключ
    if (response.status === 401 && apiKey !== process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY) {
      console.warn('Personal key returned 401 in chatJson, falling back to system key...');
      apiKey = process.env.OPENROUTER_API_KEY;
      response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
          'X-Title': 'EGE AI Tutor',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    }

    // 4. Если целевой провайдер перегружен (429/5xx/400) — повторяем с автопереключением
    if (!response.ok && (response.status === 429 || response.status >= 500 || response.status === 400)) {
      console.warn(`chatJson primary endpoint returned ${response.status}, retrying with fallback provider...`);
      const fallbackBody = {
        ...requestBody,
        provider: providerConfig ? { ...providerConfig, allow_fallbacks: true } : undefined,
      };
      const retryResponse = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
          'X-Title': 'EGE AI Tutor',
        },
        body: JSON.stringify(fallbackBody),
        signal: controller.signal,
      });
      if (retryResponse.ok) {
        response = retryResponse;
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      // Handle quota exceeded (402)
      if (response.status === 402) {
        return {
          data: getMockForType(mockType),
          demoMode: true,
          notice: 'Месячный лимит токенов исчерпан (100%). Дождитесь ежемесячного сброса или переключитесь на более лёгкую модель.',
        };
      }

      // Handle rate limit (429)
      if (response.status === 429) {
        return {
          data: getMockForType(mockType),
          demoMode: true,
          notice: 'Слишком много запросов. Попробуйте через несколько минут.',
        };
      }

      // Handle server errors (5xx)
      if (response.status >= 500) {
        return {
          data: getMockForType(mockType),
          demoMode: true,
          notice: 'Сервис AI временно недоступен. Показаны демо-данные.',
        };
      }

      throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI');
    }

    // Clean and parse JSON
    const cleaned = stripFences(content);
    const parsed = JSON.parse(cleaned);

    // Validate with zod schema
    const validated = schema.parse(parsed);

    // Update usage counters
    if (gate.mode === 'free') {
      const quota = freeQuota(dbUser);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          freeAiRequestsLeft: Math.max(0, quota.left - 1),
          ...(quota.changed ? { freeAiResetAt: quota.resetAt } : {}),
        },
      });
    } else if (gate.mode === 'pro' && user.openrouterKeyId) {
      // Обновляем процент расхода персонального ключа (fire-and-forget)
      void getKeyUsage(user.id).catch(() => undefined);
    }

    // Сохраняем в кэш ответов (100% экономия при повторном разборе тех же данных)
    aiCache.set(cacheKey, { data: validated, demoMode: false });

    return {
      data: validated,
      demoMode: false,
    };

  } catch (error) {
    console.error('chatJson error:', error);

    // Handle timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: getMockForType(mockType),
        demoMode: true,
        notice: 'Запрос превысил таймаут. Показаны демо-данные.',
      };
    }

    // Handle network errors
    if (errText(error).includes('fetch') || errText(error).includes('network')) {
      return {
        data: getMockForType(mockType),
        demoMode: true,
        notice: 'Сеть недоступна. Показаны демо-данные.',
      };
    }

    // Handle JSON parse errors - retry once with clarification
    if (error instanceof SyntaxError || errText(error).includes('JSON')) {
      console.warn('Invalid JSON received, using fallback');
      return {
        data: getMockForType(mockType),
        demoMode: true,
        notice: 'Ошибка обработки ответа AI. Показаны демо-данные.',
      };
    }

    // For any other error, return mock
    return {
      data: getMockForType(mockType),
      demoMode: true,
      notice: 'Произошла ошибка при обращении к AI. Показаны демо-данные.',
    };
  }
}
