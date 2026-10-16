import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import authRoutes from '../routes/auth.js';
import meshRoutes from '../routes/mesh.js';
import meshDiaryRoutes from '../routes/meshDiary.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/mesh', meshRoutes);
app.use('/api/mesh', meshDiaryRoutes);

const PROFILE = { children: [{ id: 'stu-bridge-1', full_name: 'Тест Ученик', class_name: '10А' }] };
const SCHEDULE = {
  lessons: [
    {
      start_time: '08:30',
      end_time: '09:15',
      subject_name: 'Алгебра',
      lesson_name: 'Теорема Пифагора',
      room: '101',
      teacher_name: 'Иванова',
    },
  ],
};
const daysAheadIso = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgoIso = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HOMEWORKS = {
  items: [
    { subject_name: 'Алгебра', description: 'Упр. 1', due_date: daysAheadIso(3), is_done: false },
    { subject_name: 'Физика', description: 'Пар. 2', due_date: daysAheadIso(4), is_done: true },
    { subject_name: 'История', description: 'Стр. 10', due_date: daysAgoIso(30), is_done: false },
  ],
};
const MARKS = {
  payload: [
    {
      subject_name: 'Алгебра',
      value: '3',
      weight: 2,
      date: daysAgoIso(5),
      control_form_name: 'Контрольная',
    },
    {
      subject_name: 'Алгебра',
      value: '2',
      weight: 1,
      date: daysAgoIso(20),
      control_form_name: 'Ответ',
    },
  ],
};

function stubMeshFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/profile')) return new Response(JSON.stringify(PROFILE), { status: 200 });
      if (u.includes('/schedule/')) return new Response(JSON.stringify(SCHEDULE), { status: 200 });
      if (u.includes('/homeworks')) return new Response(JSON.stringify(HOMEWORKS), { status: 200 });
      if (u.includes('/marks')) return new Response(JSON.stringify(MARKS), { status: 200 });
      return new Response('{"code":"NoResourceFound"}', { status: 404 });
    })
  );
}

describe('Mesh bridge: sync -> БД разделов', () => {
  const email = 'meshbridge@example.com';
  let token: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Test123!@#', name: 'Bridge User' });
    expect(res.status).toBe(201);
    token = res.body.token;
    // Включаем флаги МЭШ для проверки создания слабых тем
    await prisma.user.update({
      where: { email },
      data: { meshEnabled: true, meshWeakTopics: true },
    });
    stubMeshFetch();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.homework.deleteMany({ where: { userId: user.id } });
      await prisma.testResult.deleteMany({ where: { userId: user.id } });
      await prisma.scheduleItem.deleteMany({ where: { userId: user.id } });
      await prisma.weakTopic.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it('sync сохраняет ДЗ/оценки/расписание в БД и возвращает persisted', async () => {
    await request(app)
      .post('/api/mesh')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'bridge-opaque-token-1234567890' })
      .expect(200);

    const res = await request(app)
      .post('/api/mesh/diary/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBeDefined();
    expect(res.body.persisted.homeworks.created).toBe(3);
    expect(res.body.persisted.marks.created).toBe(2);
    expect(res.body.persisted.lessons.replaced).toBe(6);
    expect(res.body.errors).toEqual([]);

    const user = (await prisma.user.findUnique({ where: { email } }))!;
    const hw = await prisma.homework.findMany({ where: { userId: user.id, source: 'mesh' } });
    expect(hw).toHaveLength(3);
    expect(hw.find((h) => h.subject === 'Физика')?.status).toBe('completed');
    expect(hw.find((h) => h.subject === 'Алгебра')?.status).toBe('pending');
    // Старое сентябрьское ДЗ без флага — автозавершено (старше недели)
    expect(hw.find((h) => h.subject === 'История')?.status).toBe('completed');

    const marks = await prisma.testResult.findMany({
      where: { userId: user.id, source: 'mesh' },
    });
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => m.scaleType === '5_point' && m.maxScore === 5)).toBe(true);

    const lessons = await prisma.scheduleItem.findMany({
      where: { userId: user.id, source: 'mesh' },
    });
    expect(lessons).toHaveLength(6);
    expect(lessons.every((l) => l.dayOfWeek >= 1 && l.dayOfWeek <= 6)).toBe(true);
    expect(lessons.every((l) => l.topic === 'Теорема Пифагора')).toBe(true);

    const weak = await prisma.weakTopic.findMany({ where: { userId: user.id } });
    // Тема плохой оценки с префиксом МЭШ
    expect(weak.some((w) => w.topicName === '[МЭШ] Контрольная' || w.topicName === 'Контрольная')).toBe(true);
  });

  it('повторный sync не плодит дубликаты', async () => {
    const res = await request(app)
      .post('/api/mesh/diary/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.persisted.homeworks.created).toBe(0);
    expect(res.body.persisted.homeworks.updated).toBe(3);
    expect(res.body.persisted.marks.created).toBe(0);

    const user = (await prisma.user.findUnique({ where: { email } }))!;
    expect(await prisma.homework.count({ where: { userId: user.id, source: 'mesh' } })).toBe(3);
    expect(await prisma.testResult.count({ where: { userId: user.id, source: 'mesh' } })).toBe(2);
    expect(
      await prisma.scheduleItem.count({ where: { userId: user.id, source: 'mesh' } })
    ).toBe(6);
  });

  it('buildMeshSlice: темы, свежие пробелы и темы недели', async () => {
    const { buildMeshSlice } = await import('../services/ai/analysisService.js');
    const user = (await prisma.user.findUnique({ where: { email } }))!;
    const slice = await buildMeshSlice(user.id);
    expect(slice.connected).toBe(true);
    // Тема плохой оценки за 30 дней
    expect(slice.schoolTopics.some((t) => t.topic === 'Контрольная')).toBe(true);
    // Тройка попадает в свежие пробелы
    expect(
      slice.freshGaps.some((g) => g.subject === 'Алгебра' && g.topic === 'Контрольная')
    ).toBe(true);
    // Темы расписания недели
    expect(
      slice.currentWeekTopics.some((t) => t.topic === 'Теорема Пифагора')
    ).toBe(true);
    // Проблемный предмет (средний 4.0? алгебра avg (3*2+5)/3=3.67 < 4.0)
    expect(slice.problemSubjects).toContain('Алгебра');
  });
});
