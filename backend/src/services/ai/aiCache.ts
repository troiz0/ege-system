import crypto from 'node:crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tokensEstimate?: number;
}

export class AiCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;
  private estimatedTokensSaved = 0;

  constructor(maxEntries = 1000, defaultTtlMs = 2 * 60 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Вычисляет детерминированный SHA-256 хеш по модели, сообщениям и параметрам.
   */
  computeKey(params: {
    model: string;
    messages: unknown;
    extra?: unknown;
    temperature?: number;
  }): string {
    const serialized = JSON.stringify({
      m: params.model,
      msgs: params.messages,
      extra: params.extra ?? null,
      t: params.temperature ?? 0.7,
    });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Обновляем позицию для LRU (перевставка)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    if (entry.tokensEstimate) {
      this.estimatedTokensSaved += entry.tokensEstimate;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs?: number, tokensEstimate = 500): void {
    // LRU вытеснение
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      tokensEstimate,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: string;
    estimatedTokensSaved: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%';
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      estimatedTokensSaved: this.estimatedTokensSaved,
    };
  }
}

export const aiCache = new AiCache();
