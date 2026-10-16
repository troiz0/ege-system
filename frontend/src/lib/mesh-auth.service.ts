import { api } from './api';

/** Страница входа МЭШ (открывается в новой вкладке). */
export const MESH_LOGIN_URL = 'https://school.mos.ru/';

/**
 * Эндпоинт выдачи токена: открывает в новой вкладке JSON
 * вида {"authentication_token": "..."}.
 */
export const MESH_TOKEN_REFRESH_URL =
  'https://school.mos.ru/?backUrl=https%3A%2F%2Fschool.mos.ru%2Fv2%2Ftoken%2Frefresh%3FroleId%3D1%26subsystem%3D2';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OPAQUE_RE = /^[A-Za-z0-9_\-.+/=]+$/;

export const MESH_TOKEN_KEY = 'mesh_token';
export const MESH_BANNER_KEY = 'mesh_banner_dismissed';
export const MESH_PENDING_KEY = 'mesh_pending_token';

// --- Токен "в пути" (передача между вкладками) ---

/** Записать токен из другой вкладки нашего origin (storage-событие разбудит модалку). */
export function storePendingToken(token: string): void {
  try {
    localStorage.setItem(MESH_PENDING_KEY, token);
  } catch {
    /* приватный режим — хранилище недоступно */
  }
}

export function readPendingToken(): string | null {
  try {
    return localStorage.getItem(MESH_PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingToken(): void {
  try {
    localStorage.removeItem(MESH_PENDING_KEY);
  } catch {
    /* noop */
  }
}

export interface MeshTokenCheck {
  ok: boolean;
  error?: string;
}

export function stripBearer(token: string): string {
  // Чистим и префикс Bearer, и ВЕСЬ whitespace (переносы строк из вставки).
  return token
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '');
}

function jwtExp(token: string): { ok: boolean; exp: number | null } {
  try {
    const payloadPart = token.split('.')[1];
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: unknown };
    return { ok: true, exp: typeof payload.exp === 'number' ? payload.exp : null };
  } catch {
    return { ok: false, exp: null };
  }
}

/** Проверка формата (Bearer/JWT) и срока действия токена. */
export function validateMeshToken(raw: string): MeshTokenCheck {
  const token = stripBearer(raw);

  if (!token) return { ok: false, error: 'Токен пуст' };
  if (token.length < 16) return { ok: false, error: 'Токен слишком короткий' };
  if (token.length > 4096) return { ok: false, error: 'Токен слишком длинный' };

  if (JWT_RE.test(token)) {
    const { ok, exp } = jwtExp(token);
    if (!ok) return { ok: false, error: 'Неверный формат JWT-токена' };
    if (exp !== null && exp * 1000 <= Date.now()) {
      return { ok: false, error: 'Срок действия токена истёк' };
    }
    return { ok: true };
  }

  if (!OPAQUE_RE.test(token)) {
    return { ok: false, error: 'Недопустимые символы в токене' };
  }
  return { ok: true };
}

/** Маскирование: только первые и последние 6 символов. */
export function maskMeshToken(raw: string): string {
  const token = stripBearer(raw);
  if (token.length <= 14) return '••••••';
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}

// --- Локальное состояние (152-ФЗ: сырые токены не сохраняются на клиенте) ---

export function getStoredMeshToken(): string | null {
  try {
    // 152-ФЗ: удаляем любые устаревшие сырые токены из localStorage
    localStorage.removeItem(MESH_TOKEN_KEY);
  } catch {
    /* noop */
  }
  return null;
}

export function storeMeshToken(_token: string): void {
  // 152-ФЗ: намеренно noop — токен передаётся и хранится исключительно на сервере в шифрованном виде (AES-256-GCM)
}

export function clearStoredMeshToken(): void {
  try {
    localStorage.removeItem(MESH_TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export function isBannerDismissed(): boolean {
  try {
    return localStorage.getItem(MESH_BANNER_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissBanner(): void {
  try {
    localStorage.setItem(MESH_BANNER_KEY, '1');
  } catch {
    /* noop */
  }
}

/** Валидация + сохранение на бэкенд (шифрование AES-256-GCM). В localStorage сырой токен не пишется. */
export async function saveMeshToken(raw: string): Promise<string> {
  const token = extractMeshToken(raw);
  const check = validateMeshToken(token);
  if (!check.ok) throw new Error(check.error);

  const normalized = stripBearer(token);
  const result = await api.saveMeshToken(normalized);
  return result.tokenMasked;
}

export async function removeMeshToken(): Promise<void> {
  try {
    await api.deleteMeshToken();
  } finally {
    clearStoredMeshToken();
  }
}

/**
 * Авто-парсинг поля ввода: принимает либо «голый» токен,
 * либо целиком JSON ответа /v2/token/refresh
 * вида {"authentication_token": "..."} (возможны пробелы/переносы).
 */
export function extractMeshToken(input: string): string {
  const raw = input.trim();
  if (!raw) return '';

  // Быстрый путь: похоже на голый токен без JSON-обёртки.
  if (!raw.includes('{') && !raw.includes('"')) {
    return stripBearer(raw);
  }

  // 1) Пробуем распарсить как JSON целиком.
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      for (const key of ['authentication_token', 'access_token', 'auth_token', 'token']) {
        const value = parsed[key];
        if (typeof value === 'string' && value.trim()) {
          return stripBearer(value);
        }
      }
    }
  } catch {
    /* не чистый JSON — пробуем regex ниже */
  }

  // 2) Regex-фолбэк: вытаскиваем значение поля из сырого текста страницы.
  const match = raw.match(/"(?:authentication_token|access_token|auth_token)"\s*:\s*"([^"]+)"/);
  if (match?.[1]) {
    return stripBearer(match[1]);
  }

  // 3) Иначе считаем, что вставили сам токен (с Bearer-префиксом или без).
  return stripBearer(raw);
}
