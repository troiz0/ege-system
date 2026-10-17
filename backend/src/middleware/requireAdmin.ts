import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireAuth.js';

export const ADMIN_EMAILS = [
  'vladimir.putin.offic@gmail.com',
  'turdubaevtimur643@gmail.com',
];

/**
 * Проверка прав администратора для владельцев платформы
 */
export function isUserAdmin(email?: string | null, role?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((admin) => admin.toLowerCase() === cleanEmail) || role === 'admin';
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Не авторизован', code: 'UNAUTHORIZED' });
    return;
  }

  if (!isUserAdmin(user.email, (user as any).role)) {
    res.status(403).json({ error: '403 Forbidden // ACCESS DENIED' });
    return;
  }

  next();
}
