import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import meshRoutes from '../routes/mesh.js';
import meshDiaryRoutes from '../routes/meshDiary.js';
import homeworkRoutes from '../routes/homework.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/mesh', meshRoutes);
app.use('/api/mesh', meshDiaryRoutes);
app.use('/api/homework', homeworkRoutes);

describe('POST /api/mesh/explain-attachment', () => {
  const email = 'meshexplain@example.com';
  let token: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Test123!@#', name: 'Explain User' });
    expect(reg.status).toBe(201);
    token = reg.body.token;
    // Демо-флаг: chatJson отдаёт моки без живого OpenRouter.
    // ВАЖНО: не используем /api/auth/demo — он общий и затёр бы чужой MESH-токен.
    await prisma.user.update({ where: { email }, data: { isDemo: true } });
    const conn = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'explain-opaque-token-1234567890' });
    expect(conn.status).toBe(200);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url).includes('/ej/attachments/')) {
          return new Response('Текст задания из файла', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          });
        }
        throw new Error('unexpected fetch in explain test');
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it('400 без файла и текста', async () => {
    const res = await request(app)
      .post('/api/mesh/explain-attachment')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Алгебра' });
    expect(res.status).toBe(400);
  });

  it('разбирает текст задания (демо -> мок)', async () => {
    const res = await request(app)
      .post('/api/mesh/explain-attachment')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Алгебра', description: 'Реши уравнение x^2 = 4' });
    expect(res.status).toBe(200);
    expect(res.body.topic).toBeTruthy();
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(res.body.demoMode).toBe(true);
  });

  it('скачивает текстовый файл МЭШ и разбирает', async () => {
    const res = await request(app)
      .post('/api/mesh/explain-attachment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Физика',
        description: 'Прочитай файл',
        attachmentUrl: 'https://school.mos.ru/ej/attachments/files/1/2/3/original/a.txt',
        attachmentName: 'a.txt',
      });
    expect(res.status).toBe(200);
    expect(res.body.sourceName).toBe('a.txt');
    expect(res.body.topic).toBeTruthy();
  });

  it('отклоняет ссылку не из МЭШ', async () => {
    const res = await request(app)
      .post('/api/mesh/explain-attachment')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Алгебра', attachmentUrl: 'https://evil.example.com/f.pdf' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/school\.mos\.ru/);
  });
});

describe('POST /api/homework/:id/ai-explain', () => {
  const email = 'meshexplain2@example.com';
  let token: string;
  let userId: string;
  let withFileId: string;
  let textOnlyId: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Test123!@#', name: 'Explain HW User' });
    expect(reg.status).toBe(201);
    token = reg.body.token;
    const user = (await prisma.user.findUnique({ where: { email } }))!;
    userId = user.id;
    await prisma.user.update({ where: { email }, data: { isDemo: true } });
    const withFile = await prisma.homework.create({
      data: {
        userId,
        subject: 'Физика',
        title: 'Проработать файл',
        description: 'стр. 390-393. Проработать файл Погрешности',
        deadline: new Date(),
        source: 'mesh',
        externalKey: 'mesh:test-hw-file-001',
        meshAttachments: JSON.stringify([
          { name: 'погрешности.pdf', url: null, kind: 'material', action: 'Изучить' },
        ]),
      },
    });
    withFileId = withFile.id;
    const textOnly = await prisma.homework.create({
      data: {
        userId,
        subject: 'Алгебра',
        title: 'Упр. 5',
        description: 'Реши квадратное уравнение',
        deadline: new Date(),
        source: 'manual',
        externalKey: null,
      },
    });
    textOnlyId = textOnly.id;
  });

  afterAll(async () => {
    await prisma.homework.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('разбирает задание МЭШ с вложением без URL (по тексту, без блокировки)', async () => {
    const res = await request(app)
      .post(`/api/homework/${withFileId}/ai-explain`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.topic).toBeTruthy();
    expect(Array.isArray(res.body.steps)).toBe(true);
  });

  it('разбирает обычное задание без файлов (graceful, без 400)', async () => {
    const res = await request(app)
      .post(`/api/homework/${textOnlyId}/ai-explain`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.topic).toBeTruthy();
  });

  it('404 для чужого/несуществующего id', async () => {
    const res = await request(app)
      .post('/api/homework/00000000-0000-0000-0000-000000000000/ai-explain')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
