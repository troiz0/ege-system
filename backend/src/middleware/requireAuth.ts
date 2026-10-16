import { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';
import { verifyToken, JwtPayload } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export interface AuthUser extends JwtPayload, User {}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = bearerToken ?? req.cookies?.authToken;

  if (!token) {
    res.status(401).json({ error: 'Не авторизован', code: 'NO_TOKEN' });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Токен просрочен или недействителен', code: 'TOKEN_EXPIRED' });
    return;
  }

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!dbUser) {
      res.status(401).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
      return;
    }

    req.user = { ...payload, ...dbUser } as AuthUser;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}
