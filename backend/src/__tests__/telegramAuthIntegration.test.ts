import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import { pendingLoginSessions } from '../services/telegramBot.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

describe('Telegram Auth End-to-End Integration Tests', () => {
  const testTgId = '999888777';
  const testTgUsername = 'test_tg_user_login';
  const testTgEmail = `${testTgUsername}@telegram.ege.system`;

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testTgEmail },
          { telegramId: testTgId },
          { telegramUsername: testTgUsername },
        ],
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testTgEmail },
          { telegramId: testTgId },
          { telegramUsername: testTgUsername },
        ],
      },
    });
  });

  it('1. Инициация deep-link сессии входа POST /api/auth/telegram/session', async () => {
    const res = await request(app).post('/api/auth/telegram/session');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.botUsername).toBeDefined();
    expect(res.body.botUrl).toContain(`start=login_${res.body.token}`);
    expect(pendingLoginSessions.has(res.body.token)).toBe(true);
  });

  it('2. Проверка статуса неодобренной сессии GET /api/auth/telegram/check', async () => {
    const sessionRes = await request(app).post('/api/auth/telegram/session');
    const token = sessionRes.body.token;

    const checkRes = await request(app).get(`/api/auth/telegram/check?token=${token}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.approved).toBe(false);
  });

  it('3. Подтверждение сессии Telegram-ботом и успешный вход пользователя', async () => {
    const sessionRes = await request(app).post('/api/auth/telegram/session');
    const token = sessionRes.body.token;

    // Имитируем подтверждение ботом по клику в Telegram
    const session = pendingLoginSessions.get(token);
    expect(session).toBeDefined();
    if (session) {
      session.approved = true;
      session.telegramUser = {
        id: testTgId,
        first_name: 'Тестовый Пользователь ТГ',
        username: testTgUsername,
      };
    }

    // Проверяем эндпоинт check
    const checkRes = await request(app).get(`/api/auth/telegram/check?token=${token}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.approved).toBe(true);
    expect(checkRes.body.token).toBeDefined();
    expect(checkRes.body.user).toBeDefined();
    expect(checkRes.body.user.telegramId || checkRes.body.user.email).toBeDefined();

    // Проверяем установку cookie
    const cookies = checkRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('authToken='))).toBe(true);
  });

  it('4. Заблокированный пользователь получает 403 при попытке входа через Telegram', async () => {
    // Блокируем пользователя
    await prisma.user.updateMany({
      where: { telegramId: testTgId },
      data: { isBanned: true, banReason: 'Нарушение правил для теста' },
    });

    const sessionRes = await request(app).post('/api/auth/telegram/session');
    const token = sessionRes.body.token;

    const session = pendingLoginSessions.get(token);
    if (session) {
      session.approved = true;
      session.telegramUser = {
        id: testTgId,
        first_name: 'Тестовый Пользователь ТГ',
        username: testTgUsername,
      };
    }

    const checkRes = await request(app).get(`/api/auth/telegram/check?token=${token}`);
    expect(checkRes.status).toBe(403);
    expect(checkRes.body.error).toContain('заблокирован');
    expect(checkRes.body.isBanned).toBe(true);
  });
});
