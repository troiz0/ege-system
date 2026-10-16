import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { decrypt } from '../lib/crypto';
import { normalizeMeshToken } from '../services/meshAuth';
import { persistMeshDiary } from '../services/meshBridge';
import { explainMeshAttachment } from '../services/ai/meshExplain';
import {
  MeshDiaryError,
  fetchEgeReport,
  getMeshDiagnostics,
  getMeshHomeworks,
  getMeshMarks,
  getMeshSchedule,
  getMeshStudent,
  homeworkHorizonEnd,
  schoolYearStart,
  syncMeshDiary,
  todayLocalIso,
} from '../services/meshDiary';

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Некорректная дата');

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function meshToken(req: Request): string | null {
  const enc = req.user?.meshTokenEnc;
  if (!enc || !ENCRYPTION_KEY) return null;
  try {
    // Нормализация на чтении: в старых записях мог остаться мусор
    // (префикс Bearer, переносы строк) — чистим перед использованием.
    return normalizeMeshToken(decrypt(enc, ENCRYPTION_KEY));
  } catch {
    return null;
  }
}

/** requireAuth + расшифрованный токен МЭШ; иначе пишет ответ и возвращает null. */
function requireMesh(req: Request, res: Response): string | null {
  const token = meshToken(req);
  if (!token) {
    res.status(400).json({ error: 'Профиль МЭШ не подключён' });
    return null;
  }
  return token;
}

function sendDiaryError(res: Response, error: unknown): void {
  if (error instanceof MeshDiaryError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('Mesh diary error:', error);
  res.status(500).json({ error: 'Не удалось получить данные МЭШ' });
}

// GET /api/mesh/diary/profile — профиль и student_id
router.get('/diary/profile', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  try {
    res.json(await getMeshStudent(token));
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// GET /api/mesh/diary/schedule?date=YYYY-MM-DD — расписание на день
router.get('/diary/schedule', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = dateSchema.safeParse(req.query.date ?? todayIso());
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректная дата', details: parsed.error.errors });
    return;
  }
  try {
    const student = await getMeshStudent(token);
    const lessons = await getMeshSchedule(token, student.studentId, parsed.data);
    res.json({ date: parsed.data, lessons });
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// GET /api/mesh/diary/homeworks?from=&to= — домашние задания за период
// (по умолчанию — с 1 сентября текущего учебного года по +14 дней от сегодня)
router.get('/diary/homeworks', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = z
    .object({ from: dateSchema.optional(), to: dateSchema.optional() })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректные даты', details: parsed.error.errors });
    return;
  }
  try {
    const student = await getMeshStudent(token);
    const items = await getMeshHomeworks(
      token,
      student.studentId,
      parsed.data.from ?? schoolYearStart(),
      parsed.data.to ?? homeworkHorizonEnd()
    );
    res.json({ items });
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// GET /api/mesh/diary/marks?from=&to= — текущие оценки с темами, сгруппированные по предметам
// (по умолчанию — с 1 сентября текущего учебного года по сегодня)
router.get('/diary/marks', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = z
    .object({ from: dateSchema.optional(), to: dateSchema.optional() })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректные даты', details: parsed.error.errors });
    return;
  }
  try {
    const student = await getMeshStudent(token);
    const subjects = await getMeshMarks(
      token,
      student.studentId,
      parsed.data.from ?? schoolYearStart(),
      parsed.data.to ?? todayLocalIso()
    );
    res.json({ subjects });
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// GET /api/mesh/diary/diagnostics — пробники ЕГЭ/ОГЭ (ГИА)
router.get('/diary/diagnostics', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  try {
    const student = await getMeshStudent(token);
    const items = await getMeshDiagnostics(token, student.studentId);
    res.json({ items });
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// GET /api/mesh/diary/download?testId=&subject=&url= — протокол ЕГЭ (PDF)
router.get('/diary/download', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = z
    .object({
      testId: z.string().max(256).optional().default(''),
      subject: z.string().max(256).optional().default(''),
      url: z.string().max(2048).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректные параметры', details: parsed.error.errors });
    return;
  }
  try {
    const student = await getMeshStudent(token);
    const report = await fetchEgeReport(
      token,
      student.studentId,
      parsed.data.testId,
      parsed.data.subject,
      parsed.data.url ?? null
    );
    const asciiName = 'mesh_ege_result.pdf';
    res.setHeader('Content-Type', report.contentType.includes('pdf') ? 'application/pdf' : report.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(report.filename)}`
    );
    res.setHeader('Content-Length', String(report.buffer.length));
    res.end(report.buffer);
  } catch (error) {
    sendDiaryError(res, error);
  }
});

// POST /api/mesh/explain-attachment — AI-разбор ДЗ/файла из МЭШ
router.post('/explain-attachment', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = z
    .object({
      subject: z.string().max(256).optional().default(''),
      description: z.string().max(8000).optional().default(''),
      attachmentUrl: z.string().max(2048).optional(),
      attachmentName: z.string().max(256).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректные параметры', details: parsed.error.errors });
    return;
  }
  const { subject, description, attachmentUrl, attachmentName } = parsed.data;
  if (!attachmentUrl && !description.trim()) {
    res.status(400).json({ error: 'Нет файла и текста задания для разбора' });
    return;
  }
  try {
    const out = await explainMeshAttachment(req.user!, {
      subject,
      description,
      attachmentUrl,
      attachmentName,
      meshToken: token,
    });
    res.json(out);
  } catch (error) {
    console.error('Mesh explain error:', error);
    const msg = error instanceof Error ? error.message : 'Не удалось разобрать задание';
    res.status(/PRO/.test(msg) ? 403 : 500).json({ error: msg });
  }
});

// POST /api/mesh/diary/sync — синхронизация всех разделов разом
router.post('/diary/sync', requireAuth, async (req, res) => {
  const token = requireMesh(req, res);
  if (!token) return;
  const parsed = z
    .object({ date: dateSchema.optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректная дата', details: parsed.error.errors });
    return;
  }
  try {
    const result = await syncMeshDiary(token, parsed.data.date ?? todayIso());
    // Мост в основные разделы: ДЗ/оценки/расписание -> БД (не валим sync при сбое)
    try {
      const student = await getMeshStudent(token);
      const persisted = await persistMeshDiary(req.user!.id, token, student, result);
      res.json({ ...result, persisted });
    } catch (bridgeError) {
      console.error('[mesh-bridge] persist failed:', bridgeError);
      result.errors.push('Сохранение в разделы: не удалось записать данные МЭШ в базу');
      res.json(result);
    }
  } catch (error) {
    sendDiaryError(res, error);
  }
});

export default router;
