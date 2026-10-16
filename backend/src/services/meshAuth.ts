import { z } from 'zod';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OPAQUE_RE = /^[A-Za-z0-9_\-.+/=]+$/;

export const meshTokenSchema = z.string().min(1).max(8192);

/**
 * Нормализация токена, вставленного пользователем: trim, срез префикса
 * `Bearer ` (без учёта регистра) и удаление ВСЕХ пробельных символов
 * (пробелы/переносы строк внутри и по краям — частая причина «битого» токена).
 * Base64/base64url и opaque-токены МЭШ пробелов не содержат, чистка безопасна.
 */
export function normalizeMeshToken(raw: string): string {
  return raw
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '');
}

export function stripBearer(token: string): string {
  return normalizeMeshToken(token);
}

function jwtExp(token: string): { ok: boolean; exp: number | null } {
  try {
    const payloadPart = token.split('.')[1];
    const json = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { exp?: unknown };
    return { ok: true, exp: typeof payload.exp === 'number' ? payload.exp : null };
  } catch {
    return { ok: false, exp: null };
  }
}

export interface MeshTokenCheck {
  ok: boolean;
  error?: string;
}

export function checkMeshToken(raw: string): MeshTokenCheck {
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

export function maskMeshToken(raw: string): string {
  const token = stripBearer(raw);
  if (token.length <= 14) return '••••••';
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}
