import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import profileRoutes from '../routes/profile.js';
import testsRoutes from '../routes/tests.js';
import homeworkRoutes from '../routes/homework.js';
import aiRoutes from '../routes/ai.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/ai', aiRoutes);

describe('API Integration Tests', () => {
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: 'testA@example.com' },
          { email: 'testB@example.com' },
        ],
      },
    });

    // Register user A
    const resA = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'testA@example.com',
        password: 'Test123!@#',
        name: 'Test User A',
      });
    userAToken = resA.body.token;
    userAId = resA.body.user.id;

    // Register user B
    const resB = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'testB@example.com',
        password: 'Test123!@#',
        name: 'Test User B',
      });
    userBToken = resB.body.token;
    userBId = resB.body.user.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: userAId }, { id: userBId }],
      },
    });
    await prisma.$disconnect();
  });

  describe('Auth', () => {
    it('should register a new user', async () => {
      await prisma.user.deleteMany({ where: { email: 'newuser@example.com' } });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          name: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('newuser@example.com');
      expect(res.body.token).toBeDefined();

      await prisma.user.delete({ where: { email: 'newuser@example.com' } });
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testA@example.com',
          password: 'Test123!@#',
          name: 'Duplicate',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('email уже существует');
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testA@example.com',
          password: 'Test123!@#',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('Route Protection', () => {
    it('should reject requests without token', async () => {
      const res = await request(app).get('/api/profile');

      expect(res.status).toBe(401);
    });

    it('should allow requests with valid token', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Profile update', () => {
    it('принимает дату экзамена в формате YYYY-MM-DD (как шлёт <input type="date">)', async () => {
      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ prepEndDate: '2027-06-01' });

      expect(res.status).toBe(200);
      expect(new Date(res.body.profile.prepEndDate).toISOString()).toBe(
        '2027-06-01T00:00:00.000Z'
      );
    });

    it('принимает полный datetime и пустую строку (очистка даты)', async () => {
      const full = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ prepEndDate: '2027-06-05T12:00:00.000Z' });
      expect(full.status).toBe(200);

      const cleared = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ prepEndDate: '' });
      expect(cleared.status).toBe(200);
      expect(cleared.body.profile.prepEndDate).toBeNull();
    });

    it('отклоняет мусор в дате', async () => {
      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ prepEndDate: 'не дата' });
      expect(res.status).toBe(400);
    });

    it('сохраняет выбранную модель AI через PUT /api/profile', async () => {
      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ selectedAiModel: 'openai/gpt-6-astra' });

      expect(res.status).toBe(200);
      expect(res.body.selectedAiModel).toBe('openai/gpt-6-astra:online');

      const getRes = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.selectedAiModel).toBe('openai/gpt-6-astra:online');
    });

    it('сохраняет выбранную модель AI через PUT /api/ai/select-model', async () => {
      const res = await request(app)
        .put('/api/ai/select-model')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ modelSlug: 'google/gemini-4-argon:online' });

      expect(res.status).toBe(200);
      expect(res.body.selectedAiModel).toBe('google/gemini-4-argon:online');

      const getRes = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.selectedAiModel).toBe('google/gemini-4-argon:online');
    });
  });

  describe('Homework PATCH', () => {
    it('переключает статус через isDone', async () => {
      const created = await request(app)
        .post('/api/homework')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Физика',
          title: 'Лабораторная',
          deadline: new Date(Date.now() + 86400000).toISOString(),
        });
      expect(created.status).toBe(201);
      const id = created.body.id;

      const done = await request(app)
        .patch(`/api/homework/${id}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ isDone: true });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('completed');

      const undone = await request(app)
        .patch(`/api/homework/${id}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ isDone: false });
      expect(undone.status).toBe(200);
      expect(undone.body.status).toBe('pending');
    });

    it('400 без полей и 404 для чужого id', async () => {
      const created = await request(app)
        .post('/api/homework')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Физика',
          title: 'Лабораторная',
          deadline: new Date(Date.now() + 86400000).toISOString(),
        });
      const id = created.body.id;

      const empty = await request(app)
        .patch(`/api/homework/${id}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});
      expect(empty.status).toBe(400);

      const alien = await request(app)
        .patch('/api/homework/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ isDone: true });
      expect(alien.status).toBe(404);
    });
  });

  describe('Data Isolation', () => {
    it('should isolate test results between users', async () => {
      // User A creates a test result
      const createRes = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Математика',
          title: 'Контрольная работа',
          scaleType: '5_point',
          score: 4,
          maxScore: 5,
          testDate: new Date().toISOString(),
        });

      expect(createRes.status).toBe(201);
      const testId = createRes.body.id;

      // User B should not see user A's test
      const listResB = await request(app)
        .get('/api/tests')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(listResB.status).toBe(200);
      expect(listResB.body.items.find((t: { id: string }) => t.id === testId)).toBeUndefined();

      // User B should not be able to access user A's test
      const getRes = await request(app)
        .get(`/api/tests/${testId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(getRes.status).toBe(404);

      // User A can access their own test
      const getResA = await request(app)
        .get(`/api/tests/${testId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getResA.status).toBe(200);
      expect(getResA.body.id).toBe(testId);
    });
  });

  describe('Normalization Calculation', () => {
    it('should correctly normalize 5-point scale', async () => {
      const res = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Физика',
          title: 'Тест',
          scaleType: '5_point',
          score: 3,
          maxScore: 5,
          testDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.normalizedPercent).toBe(60); // 3/5 = 60%
    });

    it('should correctly normalize 100-point scale', async () => {
      const res = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Информатика',
          title: 'ЕГЭ пробник',
          scaleType: '100_point',
          score: 75,
          maxScore: 100,
          testDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.normalizedPercent).toBe(75);
    });

    it('should handle edge cases', async () => {
      const res = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Русский язык',
          title: 'Диктант',
          scaleType: 'raw_fraction',
          score: 0,
          maxScore: 10,
          testDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.normalizedPercent).toBe(0);
    });
  });

  describe('Test creation defaults and photo attachment', () => {
    it('should default to 5-point scale when scaleType/maxScore omitted', async () => {
      const res = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Математика',
          title: 'Контрольная',
          score: 4,
          testDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.scaleType).toBe('5_point');
      expect(res.body.maxScore).toBe(5);
      expect(res.body.normalizedPercent).toBe(80);
    });

    it('should attach a photo to own test result', async () => {
      const createRes = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Физика',
          title: 'Лабораторная с фото',
          score: 5,
          testDate: new Date().toISOString(),
        });
      expect(createRes.status).toBe(201);
      const testId = createRes.body.id as string;

      // 1x1 PNG
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const uploadRes = await request(app)
        .post(`/api/tests/${testId}/attachment`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', png, 'photo.png');

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.photoPath).toMatch(/uploads\//);

      // чужому пользователю — 404
      const foreignRes = await request(app)
        .post(`/api/tests/${testId}/attachment`)
        .set('Authorization', `Bearer ${userBToken}`)
        .attach('file', png, 'photo.png');

      expect(foreignRes.status).toBe(404);
    });

    it('should reject non-image files', async () => {
      const createRes = await request(app)
        .post('/api/tests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Химия',
          title: 'Тест',
          score: 4,
          testDate: new Date().toISOString(),
        });
      const testId = createRes.body.id as string;

      const res = await request(app)
        .post(`/api/tests/${testId}/attachment`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', Buffer.from('not an image'), 'doc.txt');

      expect(res.status).not.toBe(200);
    });
  });
});
