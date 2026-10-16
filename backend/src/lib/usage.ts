import { FREE_WEEKLY_REQUESTS, FREE_RESET_DAYS } from '../config/limits';

export const NOTICE_402 =
  'Месячный лимит токенов исчерпан (100%). Дождитесь ежемесячного сброса или переключитесь на более лёгкую модель';
export const NOTICE_FREE = 'Бесплатные AI-запросы на этой неделе закончились. Они обновятся автоматически, или подключите PRO.';
export const NOTICE_UNAVAILABLE = 'AI временно недоступен, показан демонстрационный ответ. Попробуйте позже.';

export interface UsageUser {
  subscriptionTier: string;
  proExpiresAt: Date | null;
  trafficUsedPercent: number;
  freeAiRequestsLeft: number;
  freeAiResetAt: Date | null;
  isDemo: boolean;
}

const DAY = 86_400_000;

// PRO с proExpiresAt = null (демо-аккаунт) считается активным бессрочно
export function isProActive(u: Pick<UsageUser, 'subscriptionTier' | 'proExpiresAt'>, now: Date = new Date()): boolean {
  return u.subscriptionTier === 'PRO' && (u.proExpiresAt === null || u.proExpiresAt.getTime() > now.getTime());
}

export function usedPercent(usage: number, limit: number | null | undefined): number {
  if (!limit || limit <= 0 || !Number.isFinite(usage)) return 0;
  return Math.round(Math.min(100, Math.max(0, (usage / limit) * 100)) * 10) / 10;
}

export const remainingPercent = (used: number): number => Math.round((100 - used) * 10) / 10;

export function freeQuota(
  u: Pick<UsageUser, 'freeAiRequestsLeft' | 'freeAiResetAt'>,
  now: Date = new Date(),
): { left: number; resetAt: Date; changed: boolean } {
  if (!u.freeAiResetAt || now.getTime() >= u.freeAiResetAt.getTime()) {
    return { left: FREE_WEEKLY_REQUESTS, resetAt: new Date(now.getTime() + FREE_RESET_DAYS * DAY), changed: true };
  }
  return { left: u.freeAiRequestsLeft, resetAt: u.freeAiResetAt, changed: false };
}

export type AiGate =
  | { ok: true; mode: 'demo' | 'pro' | 'free' }
  | { ok: false; code: 'LIMIT_PRO' | 'LIMIT_FREE'; notice: string };

export function aiGate(u: UsageUser, now: Date = new Date()): AiGate {
  if (u.isDemo) return { ok: true, mode: 'demo' };
  if (isProActive(u, now)) {
    return u.trafficUsedPercent >= 100 ? { ok: false, code: 'LIMIT_PRO', notice: NOTICE_402 } : { ok: true, mode: 'pro' };
  }
  return freeQuota(u, now).left > 0 ? { ok: true, mode: 'free' } : { ok: false, code: 'LIMIT_FREE', notice: NOTICE_FREE };
}
