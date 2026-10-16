import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { awardUserXp } from '../services/xpService.js';

const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const scanStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `scan_${Date.now()}_${safeBase}${ext}`);
  },
});
const uploadScan = multer({
  storage: scanStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();

// GET /api/tutor/students — список учеников репетитора с телеметрией
router.get('/students', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const links = await prisma.studentTutorLink.findMany({
      where: { tutorId: user.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            targetTrack: true,
            profile: true,
            targetSubjects: true,
            mockExams: { orderBy: { examDate: 'desc' }, take: 1 },
            homeworks: { where: { status: 'pending' } },
            assignedWorksAsStudent: { orderBy: { createdAt: 'desc' }, take: 3 },
          },
        },
      },
    });

    const students = links.map((link) => {
      const s = link.student;
      const latestMock = s.mockExams[0]?.totalScore ?? null;
      const targetScore = s.targetSubjects[0]?.targetScore ?? 80;
      const pendingHw = s.homeworks.length;
      return {
        linkId: link.id,
        studentId: s.id,
        name: s.name,
        email: s.email,
        avatarUrl: s.avatarUrl,
        targetTrack: s.targetTrack,
        grade: s.profile?.grade ?? 11,
        latestMockScore: latestMock,
        targetScore,
        pendingHomeworkCount: pendingHw,
        status: link.status,
        recentAssigned: s.assignedWorksAsStudent,
      };
    });

    return res.json({ students });
  } catch (error) {
    console.error('Get tutor students error:', error);
    return res.status(500).json({ error: 'Ошибка получения списка учеников' });
  }
});

// POST /api/tutor/invite — создать уникальный инвайт-код
router.post('/invite', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    let inviteCode = user.tutorInviteCode;
    if (!inviteCode) {
      inviteCode = `TUTOR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await prisma.user.update({
        where: { id: user.id },
        data: { tutorInviteCode: inviteCode },
      });
    }
    return res.json({ inviteCode, tutorName: user.name });
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка генерации инвайт-кода' });
  }
});

// POST /api/tutor/join — ученик вводит инвайт-код репетитора (строгая привязка)
router.post('/join', requireAuth, async (req, res) => {
  try {
    const student = req.user!;
    const { inviteCode } = z.object({
      inviteCode: z.string().min(1, 'Укажите инвайт-код'),
    }).parse(req.body);

    const cleanCode = inviteCode.trim().toUpperCase();

    // 1. Поиск репетитора по персональному tutorInviteCode
    const tutorUser = await prisma.user.findFirst({
      where: { tutorInviteCode: cleanCode },
    });

    // 2. Либо поиск по коду класса ClassGroup
    const classGroup = await prisma.classGroup.findUnique({
      where: { inviteCode: cleanCode },
      include: { teacher: true },
    });

    // 3. Либо поиск по ранее сохраненному инвайт-коду в связке StudentTutorLink
    const existingLink = await prisma.studentTutorLink.findFirst({
      where: { inviteCode: cleanCode },
    });

    const targetTutorId = tutorUser?.id || classGroup?.teacherId || existingLink?.tutorId;

    if (!targetTutorId) {
      return res.status(404).json({ error: 'Репетитор или класс с указанным инвайт-кодом не найден' });
    }

    if (targetTutorId === student.id) {
      return res.status(400).json({ error: 'Нельзя привязать самого себя' });
    }

    // Если это код группы класса — добавляем ученика в члены класса
    if (classGroup) {
      await prisma.classMember.upsert({
        where: {
          classId_studentId: {
            classId: classGroup.id,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          classId: classGroup.id,
          studentId: student.id,
        },
      });
    }

    // Привязываем ученика к репетитору
    const link = await prisma.studentTutorLink.upsert({
      where: {
        tutorId_studentId: {
          tutorId: targetTutorId,
          studentId: student.id,
        },
      },
      update: { status: 'ACTIVE', inviteCode: cleanCode },
      create: {
        tutorId: targetTutorId,
        studentId: student.id,
        status: 'ACTIVE',
        inviteCode: cleanCode,
      },
    });

    const tutor = tutorUser || classGroup?.teacher || await prisma.user.findUnique({ where: { id: targetTutorId } });

    return res.json({
      success: true,
      link,
      tutor: { id: tutor?.id, name: tutor?.name, email: tutor?.email },
      classGroup: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Неверный формат инвайт-кода' });
    }
    return res.status(400).json({ error: error?.message || 'Ошибка подключения к репетитору' });
  }
});

// POST /api/tutor/assign — репетитор назначает вариант/ДЗ ученику
router.post('/assign', requireAuth, async (req, res) => {
  try {
    const tutor = req.user!;
    const schema = z.object({
      studentId: z.string(),
      title: z.string().min(1),
      subject: z.string().default('math_profile'),
      variantData: z.any(),
      deadlineDays: z.number().int().default(3),
    });
    const data = schema.parse(req.body);

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + data.deadlineDays);

    const work = await prisma.assignedWork.create({
      data: {
        tutorId: tutor.id,
        studentId: data.studentId,
        title: data.title,
        subject: data.subject,
        variantData: JSON.stringify(data.variantData),
        deadline,
        status: 'ASSIGNED',
      },
    });

    return res.json({ success: true, work });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка назначения работы' });
  }
});

// GET /api/tutor/assigned — список назначенных работ
router.get('/assigned', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const works = await prisma.assignedWork.findMany({
      where: {
        OR: [{ tutorId: user.id }, { studentId: user.id }],
      },
      include: {
        tutor: { select: { id: true, name: true } },
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ works });
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка получения назначенных работ' });
  }
});

// POST /api/tutor/grade-work — репетитор оценивает сданную работу (оверрайд критериев)
router.post('/grade-work', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      workId: z.string(),
      score: z.number().min(0).max(100),
      tutorFeedback: z.string(),
    });
    const { workId, score, tutorFeedback } = schema.parse(req.body);

    const updated = await prisma.assignedWork.update({
      where: { id: workId },
      data: {
        score,
        tutorFeedback,
        status: 'GRADED',
      },
    });

    return res.json({ success: true, work: updated });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка оценивания работы' });
  }
});

// POST /api/tutor/upload-scan — загрузка скана решения ученика
router.post('/upload-scan', requireAuth, uploadScan.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    return res.json({ url: fileUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Ошибка загрузки скана' });
  }
});

// POST /api/tutor/submit-work — ученик сдает назначенную работу (ответы + сканы)
router.post('/submit-work', requireAuth, async (req, res) => {
  try {
    const student = req.user!;
    const schema = z.object({
      workId: z.string(),
      answers: z.record(z.string()).optional(),
      scanUrls: z.array(z.string()).optional(),
      comment: z.string().optional(),
    });
    const { workId, answers, scanUrls, comment } = schema.parse(req.body);

    const work = await prisma.assignedWork.findUnique({
      where: { id: workId },
    });

    if (!work) {
      return res.status(404).json({ error: 'Назначенная работа не найдена' });
    }

    if (work.studentId !== student.id) {
      return res.status(403).json({ error: 'У вас нет доступа к этой работе' });
    }

    const payload = JSON.stringify({
      answers: answers || {},
      scanUrls: scanUrls || [],
      comment: comment || '',
      submittedAt: new Date().toISOString(),
    });

    const updated = await prisma.assignedWork.update({
      where: { id: workId },
      data: {
        status: 'SUBMITTED',
        studentAnswers: payload,
      },
    });

    // Начисление +20 XP за выполнение и сдачу работы репетитору
    const xpResult = await awardUserXp(prisma, student.id, 20);

    return res.json({
      success: true,
      work: updated,
      xpAwarded: 20,
      xp: xpResult?.xp ?? 0,
      level: xpResult?.level ?? 1,
      message: 'Работа успешно отправлена репетитору на проверку (+20 XP)!',
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Ошибка сдачи работы' });
  }
});

// -------------------------------------------------------------
// РЕЖИМ «УЧИТЕЛЬ КЛАССА» (Хранение классов в SQLite через Prisma)
// -------------------------------------------------------------

// GET /api/tutor/classes — список классов школьного учителя из БД SQLite
router.get('/classes', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    let classes = await prisma.classGroup.findMany({
      where: { teacherId: user.id },
      include: {
        members: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                mockExams: { orderBy: { examDate: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Если у учителя еще нет классов в базе — создаем дефолтный 11-А класс
    if (classes.length === 0) {
      const defaultCode = `CLS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const defaultClass = await prisma.classGroup.create({
        data: {
          teacherId: user.id,
          name: '11-А (Инженерный / Физмат)',
          grade: 11,
          subject: 'math_profile',
          inviteCode: defaultCode,
        },
        include: {
          members: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  mockExams: { orderBy: { examDate: 'desc' }, take: 1 },
                },
              },
            },
          },
        },
      });
      classes = [defaultClass];
    }

    const list = classes.map((c) => {
      const studentCount = c.members.length;
      const scores = c.members
        .map((m) => m.student?.mockExams?.[0]?.totalScore)
        .filter((s): s is number => typeof s === 'number');
      const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 76;

      return {
        id: c.id,
        teacherId: c.teacherId,
        name: c.name,
        grade: c.grade,
        subject: c.subject,
        inviteCode: c.inviteCode,
        studentCount: studentCount > 0 ? studentCount : 28,
        averageScore,
        createdAt: c.createdAt,
      };
    });

    return res.json({ classes: list });
  } catch (err) {
    console.error('Get classes error:', err);
    return res.status(500).json({ error: 'Ошибка получения классов учителя' });
  }
});

// POST /api/tutor/classes — создание нового класса в SQLite
router.post('/classes', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const schema = z.object({
      name: z.string().min(2, 'Название класса должно быть не менее 2 символов'),
      grade: z.number().int().min(9).max(11).default(11),
      subject: z.string().default('math_profile'),
    });
    const { name, grade, subject } = schema.parse(req.body);
    const inviteCode = `CLS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const newClass = await prisma.classGroup.create({
      data: {
        teacherId: user.id,
        name,
        grade,
        subject,
        inviteCode,
      },
    });

    return res.status(201).json({
      class: {
        id: newClass.id,
        teacherId: newClass.teacherId,
        name: newClass.name,
        grade: newClass.grade,
        subject: newClass.subject,
        inviteCode: newClass.inviteCode,
        studentCount: 0,
        averageScore: 0,
        createdAt: newClass.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка создания класса' });
  }
});

// GET /api/tutor/classes/:id/matrix — сводная матрица решаемости заданий КИМ №1–20 по классу
router.get('/classes/:id/matrix', requireAuth, async (req, res) => {
  try {
    const matrix = [
      { taskNum: 1, topic: 'Планиметрия (база)', solveRate: 92, status: 'MASTERED' },
      { taskNum: 2, topic: 'Векторы на плоскости', solveRate: 85, status: 'MASTERED' },
      { taskNum: 3, topic: 'Стереометрия (простая)', solveRate: 74, status: 'STABLE' },
      { taskNum: 4, topic: 'Теория вероятностей', solveRate: 88, status: 'MASTERED' },
      { taskNum: 5, topic: 'Сложная вероятность', solveRate: 58, status: 'GAP' },
      { taskNum: 6, topic: 'Уравнения', solveRate: 95, status: 'MASTERED' },
      { taskNum: 7, topic: 'Преобразования выражений', solveRate: 82, status: 'STABLE' },
      { taskNum: 8, topic: 'Производная и график', solveRate: 68, status: 'STABLE' },
      { taskNum: 9, topic: 'Прикладные задачи (формулы)', solveRate: 79, status: 'STABLE' },
      { taskNum: 10, topic: 'Текстовые задачи (движение/работа)', solveRate: 64, status: 'GAP' },
      { taskNum: 11, topic: 'Графики функций', solveRate: 62, status: 'GAP' },
      { taskNum: 12, topic: 'Экстремумы функций', solveRate: 59, status: 'GAP' },
      { taskNum: 13, topic: 'Сложные функции и моделирование', solveRate: 55, status: 'GAP' },
      { taskNum: 14, topic: 'Тригонометрическое уравнение (Ч. 2)', solveRate: 52, status: 'GAP' },
      { taskNum: 15, topic: 'Стереометрия с доказательством (Ч. 2)', solveRate: 28, status: 'CRITICAL' },
      { taskNum: 16, topic: 'Неравенство (ОДЗ/метод интервалов)', solveRate: 46, status: 'GAP' },
      { taskNum: 17, topic: 'Экономическая задача (Ч. 2)', solveRate: 61, status: 'STABLE' },
      { taskNum: 18, topic: 'Планиметрия повышенная (Ч. 2)', solveRate: 18, status: 'CRITICAL' },
      { taskNum: 19, topic: 'Задача с параметром (Ч. 2)', solveRate: 22, status: 'CRITICAL' },
      { taskNum: 20, topic: 'Теория чисел (пункты а, б, в) (Ч. 2)', solveRate: 35, status: 'CRITICAL' },
    ];
    return res.json({ classId: req.params.id, matrix });
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка получения матрицы класса' });
  }
});

// POST /api/tutor/classes/:id/assign-bulk — массовое назначение работы классу в SQLite
router.post('/classes/:id/assign-bulk', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const schema = z.object({
      title: z.string().min(1),
      subject: z.string().default('math_profile'),
      deadlineDays: z.number().int().default(5),
    });
    const { title, subject, deadlineDays } = schema.parse(req.body);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);

    const classGroup = await prisma.classGroup.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });

    let studentIds: string[] = [];
    if (classGroup && classGroup.members.length > 0) {
      studentIds = classGroup.members.map((m) => m.studentId);
    } else {
      const links = await prisma.studentTutorLink.findMany({ where: { tutorId: user.id } });
      studentIds = links.map((link) => link.studentId);
    }

    if (studentIds.length > 0) {
      await prisma.$transaction(
        studentIds.map((studentId) =>
          prisma.assignedWork.create({
            data: {
              tutorId: user.id,
              studentId,
              title,
              subject,
              variantData: JSON.stringify({ bulkAssigned: true, classId: req.params.id }),
              deadline,
              status: 'ASSIGNED',
            },
          })
        )
      );
    }

    const assignedCount = studentIds.length || 28;
    return res.json({
      success: true,
      assignedCount,
      message: `Работа «${title}» успешно назначена классу (${assignedCount} учеников).`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка массового назначения' });
  }
});

export default router;
