import { describe, it, expect, beforeEach } from 'vitest';
import { AiCache } from '../services/ai/aiCache.js';

describe('AiCache', () => {
  let cache: AiCache;

  beforeEach(() => {
    cache = new AiCache(10, 1000); // 10 entries max, 1s TTL
  });

  it('сохраняет и отдает кэшированное значение по ключу', () => {
    const key = cache.computeKey({
      model: 'anthropic/claude-haiku-5.5:online',
      messages: [{ role: 'user', content: 'Привет' }],
    });

    expect(cache.get(key)).toBeNull();

    cache.set(key, { reply: 'Привет из кэша!' }, 5000, 300);

    const hit = cache.get<{ reply: string }>(key);
    expect(hit).toEqual({ reply: 'Привет из кэша!' });

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.estimatedTokensSaved).toBe(300);
  });

  it('удаляет записи по истечению TTL', async () => {
    const key = cache.computeKey({
      model: 'google/gemini-3.8-flash:online',
      messages: [{ role: 'user', content: 'Тест TTL' }],
    });

    cache.set(key, 'данные', 50); // 50ms TTL
    expect(cache.get(key)).toBe('данные');

    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(cache.get(key)).toBeNull();
  });

  it('вытесняет старые записи при превышении maxEntries (LRU)', () => {
    const smallCache = new AiCache(2, 60000);

    smallCache.set('k1', 'v1');
    smallCache.set('k2', 'v2');
    expect(smallCache.get('k1')).toBe('v1'); // k1 становится свежее, чем k2

    smallCache.set('k3', 'v3'); // должно вытеснить k2

    expect(smallCache.get('k1')).toBe('v1');
    expect(smallCache.get('k2')).toBeNull();
    expect(smallCache.get('k3')).toBe('v3');
  });

  it('генерирует одинаковый ключ для идентичных параметров', () => {
    const k1 = cache.computeKey({
      model: 'openai/gpt-6-astra:online',
      messages: [{ role: 'system', content: 'Промпт' }, { role: 'user', content: 'Вопрос' }],
      temperature: 0.7,
    });

    const k2 = cache.computeKey({
      model: 'openai/gpt-6-astra:online',
      messages: [{ role: 'system', content: 'Промпт' }, { role: 'user', content: 'Вопрос' }],
      temperature: 0.7,
    });

    const k3 = cache.computeKey({
      model: 'openai/gpt-6-astra:online',
      messages: [{ role: 'system', content: 'Промпт' }, { role: 'user', content: 'Другой вопрос' }],
      temperature: 0.7,
    });

    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
