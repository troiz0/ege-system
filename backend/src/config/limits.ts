export const PRO_KEY_LIMIT_USD = 3;
export const FREE_WEEKLY_REQUESTS = 3;
export const FREE_RESET_DAYS = 7;
export const FREE_MAX_FILES = 5;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const AI_TIMEOUT_MS = 60_000;
export const PLANS = {
  PRO_MONTH: { rub: 500, days: 30 },
  PRO_YEAR: { rub: 4500, days: 365 },
} as const;
export const PROMOS: Record<string, number> = { EGE2027: 0.1 };
