import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import profileRoutes from '../routes/profile.js';
import adminRoutes from '../routes/admin.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

describe('Admin & Profile Features Tests', () => {
  let adminToken: string;
  let adminId: string;
  let studentToken: string;
  let studentId: string;

  beforeAll(async () => {
    // Чистим тестовых пользователей и коды подтверждения
    await prisma.verificationCode.deleteMany({
      where: {
        OR: [
          { email: 'new_linked_email@example.com' },
          { email: 'student_feature_test@example.com' },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: 'vladimir.putin.offic@gmail.com' },
          { email: 'student_feature_test@example.com' },
          { email: 'student_delete_test@example.com' },
          { email: 'new_linked_email@example.com' },
        ],
      },
    });

    // Создаем админа
    const resAdmin = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'vladimir.putin.offic@gmail.com',
        password: 'AdminPassword123!',
        name: 'Admin Vlad',
      });
    adminToken = resAdmin.body.token;
    adminId = resAdmin.body.user.id;

    // Создаем тестового ученика
    const resStudent = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'student_feature_test@example.com',
        password: 'StudentPassword123!',
        name: 'Student Test',
      });
    studentToken = resStudent.body.token;
    studentId = resStudent.body.user.id;
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany({
      where: {
        OR: [
          { email: 'new_linked_email@example.com' },
          { email: 'student_feature_test@example.com' },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: adminId },
          { id: studentId },
          { email: 'student_delete_test@example.com' },
          { email: 'new_linked_email@example.com' },
        ],
      },
    });
    await prisma.$disconnect();
  });

  describe('Admin ban & unban system', () => {
    it('allows admin to ban a user with reason', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${studentId}/ban`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Систематическое нарушение правил платформы' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.isBanned).toBe(true);
      expect(res.body.user.banReason).toBe('Систематическое нарушение правил платформы');
    });

    it('rejects banned user requests with 403 ACCOUNT_BANNED', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_BANNED');
      expect(res.body.reason).toContain('Систематическое нарушение правил');
    });

    it('allows admin to unban a user', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${studentId}/unban`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.isBanned).toBe(false);

      // Now student can access profile again
      const profileRes = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(profileRes.status).toBe(200);
    });
  });

  describe('Google linking & unlinking', () => {
    it('unlinks google account when requested', async () => {
      // First set dummy googleId
      await prisma.user.update({
        where: { id: studentId },
        data: { googleId: 'google-oauth-12345' },
      });

      const profileBefore = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(profileBefore.body.googleId).toBe('google-oauth-12345');

      const unlinkRes = await request(app)
        .post('/api/profile/unlink-google')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(unlinkRes.status).toBe(200);
      expect(unlinkRes.body.success).toBe(true);

      const profileAfter = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(profileAfter.body.googleId).toBeNull();
    });
  });

  describe('Account deletion (152-ФЗ / GDPR)', () => {
    it('cascades and completely deletes user data', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student_delete_test@example.com',
          password: 'DeletePassword123!',
          name: 'Student For Deletion',
        });
      const delToken = regRes.body.token;
      const delId = regRes.body.user.id;

      // Delete account
      const delRes = await request(app)
        .delete('/api/profile/account')
        .set('Authorization', `Bearer ${delToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify user no longer exists in DB
      const userInDb = await prisma.user.findUnique({
        where: { id: delId },
      });
      expect(userInDb).toBeNull();
    });
  });

  describe('Email Linking with OTP Confirmation', () => {
    const newTargetEmail = 'new_linked_email@example.com';

    it('GET /api/profile returns email, authProvider, and telegramId', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('student_feature_test@example.com');
      expect(res.body.authProvider).toBeDefined();
    });

    it('requests email link verification code', async () => {
      const res = await request(app)
        .post('/api/profile/email/request-code')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ email: newTargetEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cooldownSeconds).toBe(60);

      const dbCode = await prisma.verificationCode.findFirst({
        where: { email: newTargetEmail },
      });
      expect(dbCode).not.toBeNull();
      expect(dbCode?.code).toHaveLength(6);
    });

    it('rejects wrong verification code', async () => {
      const res = await request(app)
        .post('/api/profile/email/verify-code')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ email: newTargetEmail, code: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Неверный или просроченный код подтверждения');
    });

    it('successfully links email with correct OTP code', async () => {
      const dbCode = await prisma.verificationCode.findFirst({
        where: { email: newTargetEmail },
        orderBy: { createdAt: 'desc' },
      });
      expect(dbCode).not.toBeNull();

      const res = await request(app)
        .post('/api/profile/email/verify-code')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ email: newTargetEmail, code: dbCode!.code });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.email).toBe(newTargetEmail);

      // Verify email was updated in database
      const userInDb = await prisma.user.findUnique({
        where: { id: studentId },
      });
      expect(userInDb?.email).toBe(newTargetEmail);

      // Verify GET /api/profile now reflects the new email
      const profileRes = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(profileRes.body.email).toBe(newTargetEmail);
    });
  });
});
