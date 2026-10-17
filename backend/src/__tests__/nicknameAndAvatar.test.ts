import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import profileRoutes from '../routes/profile.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

describe('Nickname and Avatar Customization Tests', () => {
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: 'avatar_test_user@example.com' },
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'avatar_test_user@example.com',
        password: 'Password123!',
        name: 'InitialNick',
        grade: 11,
      });

    userToken = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: 'avatar_test_user@example.com' },
    });
  });

  it('1. GET /api/profile возвращает текущий никнейм и avatarUrl', async () => {
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('InitialNick');
    expect(res.body.avatarUrl).toBeNull();
  });

  it('2. PUT /api/profile успешно обновляет никнейм пользователя', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'CyberWarrior_2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('CyberWarrior_2026');

    // Проверяем в БД
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.name).toBe('CyberWarrior_2026');
  });

  it('3. PUT /api/profile отклоняет пустое имя', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: '   ',
      });

    expect(res.status).toBe(400);
  });

  it('4. PUT /api/profile позволяет установить пресетный аватар (Data URI / URL)', async () => {
    const testAvatarUrl = 'data:image/svg+xml;utf8,<svg><circle cx="10" cy="10" r="5" fill="%23d4ff00"/></svg>';

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        avatarUrl: testAvatarUrl,
      });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBe(testAvatarUrl);

    // Проверяем в БД
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.avatarUrl).toBe(testAvatarUrl);
  });

  it('5. POST /api/profile/avatar загружает файл изображения и сохраняет путь', async () => {
    // 1x1 transparent PNG buffer
    const fakePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await request(app)
      .post('/api/profile/avatar')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('avatar', fakePng, 'test-avatar.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/avatar-/);

    // Проверяем в БД
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.avatarUrl).toBe(res.body.avatarUrl);
  });

  it('6. DELETE /api/profile/avatar сбрасывает аватар к null', async () => {
    const res = await request(app)
      .delete('/api/profile/avatar')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.avatarUrl).toBeNull();

    // Проверяем в БД
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.avatarUrl).toBeNull();
  });
});
