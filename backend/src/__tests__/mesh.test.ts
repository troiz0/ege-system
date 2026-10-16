import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import meshRoutes from '../routes/mesh.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/mesh', meshRoutes);

function makeJwt(expSeconds: number): string {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: 'mesh-user', exp: Math.floor(Date.now() / 1000) + expSeconds });
  return `${header}.${payload}.signature-part`;
}

describe('Mesh connect API', () => {
  const email = 'meshuser@example.com';
  let token: string;
  const validJwt = makeJwt(3600);

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Test123!@#', name: 'Mesh User' });
    expect(res.status).toBe(201);
    token = res.body.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('401 без авторизации', async () => {
    const res = await request(app).get('/api/mesh');
    expect(res.status).toBe(401);
  });

  it('изначально аккаунт не подключён', async () => {
    const res = await request(app)
      .get('/api/mesh')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.tokenMasked).toBeNull();
  });

  it('сохраняет валидный JWT и возвращает маску', async () => {
    const res = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: validJwt });
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.tokenMasked).toMatch(/…/);
    expect(res.body.tokenMasked).not.toBe(validJwt);
    expect(res.body.tokenMasked).not.toContain('signature-part');
  });

  it('токен в БД зашифрован, а не хранится открытым', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.meshTokenEnc).toBeTruthy();
    expect(user?.meshTokenEnc).not.toBe(validJwt);
    expect(user?.meshConnectedAt).toBeTruthy();
  });

  it('GET отдаёт статус connected + маску', async () => {
    const res = await request(app)
      .get('/api/mesh')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.tokenMasked).toMatch(/…/);
    expect(res.body.connectedAt).toBeTruthy();
  });

  it('принимает токен с префиксом Bearer', async () => {
    const res = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: `Bearer ${makeJwt(7200)}` });
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
  });

  it('отклоняет слишком короткий токен', async () => {
    const res = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'short' });
    expect(res.status).toBe(400);
  });

  it('отклоняет просроченный JWT', async () => {
    const res = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: makeJwt(-60) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/истёк/i);
  });

  it('отклоняет токен с недопустимыми символами', async () => {
    const res = await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'токен с пробелами и кавычками "не годится"' });
    expect(res.status).toBe(400);
  });

  it('DELETE отключает аккаунт МЭШ', async () => {
    const del = await request(app)
      .delete('/api/mesh')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.connected).toBe(false);

    const res = await request(app)
      .get('/api/mesh')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.connected).toBe(false);
    expect(res.body.tokenMasked).toBeNull();

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.meshTokenEnc).toBeNull();
    expect(user?.meshConnectedAt).toBeNull();
  });
});
