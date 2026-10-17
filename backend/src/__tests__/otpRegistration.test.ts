import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../routes/auth.js';
import { prisma } from '../lib/prisma.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

describe('Email OTP Registration Flow', () => {
  const testEmail = `otp_user_${Date.now()}@example.com`;
  const testPassword = 'securePassword123';
  const testName = 'Test Student';
  const testGrade = 11;

  beforeEach(async () => {
    // Чистим перед тестами
    await prisma.verificationCode.deleteMany({ where: { email: testEmail } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  it('1. Запрос кода: валидирует данные и создает запись с кодом в БД', async () => {
    const res = await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
        grade: testGrade,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/отправлен/i);

    // Проверяем, что в БД создалась запись VerificationCode
    const record = await prisma.verificationCode.findFirst({ where: { email: testEmail } });
    expect(record).not.toBeNull();
    expect(record?.code).toHaveLength(6);
    expect(record?.payload).toBeTruthy();

    const payload = JSON.parse(record!.payload);
    expect(payload.name).toBe(testName);
    expect(payload.grade).toBe(testGrade);
    expect(payload.passwordHash).toBeTruthy();
  });

  it('2. Ошибка при запросе кода для уже существующего пользователя', async () => {
    // Создаем пользователя
    await prisma.user.create({
      data: {
        email: testEmail,
        name: testName,
      },
    });

    const res = await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
        grade: testGrade,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/уже зарегистрирован/i);
  });

  it('3. Подтверждение кода: отклоняет неверный код', async () => {
    // Запрашиваем код
    await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
        grade: testGrade,
      });

    // Шлем неверный код
    const res = await request(app)
      .post('/api/auth/register/verify-code')
      .send({
        email: testEmail,
        code: '000000',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Неверный или устаревший код/i);
  });

  it('4. Подтверждение кода: верный код создает пользователя и авторизует', async () => {
    await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
        grade: testGrade,
      });

    const record = await prisma.verificationCode.findFirst({ where: { email: testEmail } });
    expect(record).not.toBeNull();

    const res = await request(app)
      .post('/api/auth/register/verify-code')
      .send({
        email: testEmail,
        code: record!.code,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeTruthy();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.name).toBe(testName);
    expect(res.body.user.grade).toBe(testGrade);

    const rawCookies = res.headers['set-cookie'] as string[] | string | undefined;
    expect(rawCookies).toBeDefined();
    const cookieArray: string[] = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
    expect(cookieArray.some((c) => typeof c === 'string' && c.includes('authToken='))).toBe(true);

    // Проверяем, что VerificationCode удален
    const remainingCode = await prisma.verificationCode.findFirst({ where: { email: testEmail } });
    expect(remainingCode).toBeNull();

    // Проверяем профиль пользователя с классом
    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { profile: true },
    });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.profile?.grade).toBe(testGrade);
  });

  it('5. Cooldown 60 секунд на повторную отправку кода', async () => {
    await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
        grade: testGrade,
      });

    // Сразу шлем запрос на resend
    const res = await request(app)
      .post('/api/auth/register/resend-code')
      .send({ email: testEmail });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Запросить код повторно можно через/i);
  });

  it('6. Регистрация с выбором 9 или 10 класса корректно сохраняет и возвращает выбранный класс', async () => {
    const customGradeEmail = `grade9_${Date.now()}@example.com`;
    await prisma.user.deleteMany({ where: { email: customGradeEmail } });
    await prisma.verificationCode.deleteMany({ where: { email: customGradeEmail } });

    // Запрос кода для 9 класса
    const reqRes = await request(app)
      .post('/api/auth/register/request-code')
      .send({
        email: customGradeEmail,
        password: testPassword,
        name: 'Девятиклассник',
        grade: 9,
      });
    expect(reqRes.status).toBe(200);

    const record = await prisma.verificationCode.findFirst({ where: { email: customGradeEmail } });
    expect(record).not.toBeNull();

    // Подтверждение кода
    const verifyRes = await request(app)
      .post('/api/auth/register/verify-code')
      .send({
        email: customGradeEmail,
        code: record!.code,
      });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.user.grade).toBe(9);

    const dbUser = await prisma.user.findUnique({
      where: { email: customGradeEmail },
      include: { profile: true },
    });
    expect(dbUser?.profile?.grade).toBe(9);

    await prisma.user.deleteMany({ where: { email: customGradeEmail } });
  });
});
