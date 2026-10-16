import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher';
import {
  MeshDiarySync,
  MeshHomework,
  MeshMark,
  MeshStudent,
  getMeshSchedule,
} from './meshDiary';

export interface MeshPersistReport {
  homeworks: { created: number; updated: number };
  marks: { created: number; skipped: number };
  lessons: { replaced: number };
  weakTopics: { upserted: number };
}

const EMPTY_REPORT: MeshPersistReport = {
  homeworks: { created: 0, updated: 0 },
  marks: { created: 0, skipped: 0 },
  lessons: { replaced: 0 },
  weakTopics: { upserted: 0 },
};

function meshKey(...parts: Array<string | number | null | undefined>): string {
  return `mesh:${createHash('sha1').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 20)}`;
}

function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toUtcDate(isoDay: string | null, fallback: Date): Date {
  if (isoDay && /^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    return new Date(`${isoDay}T00:00:00.000Z`);
  }
  return dayStartUtc(fallback);
}

/* ------------------------------------------------------------------ */
/* Домашние задания -> Homework                                        */
/* ------------------------------------------------------------------ */

async function persistHomeworks(
  userId: string,
  items: MeshHomework[],
  now: Date,
  report: MeshPersistReport
): Promise<void> {
  const today = dayStartUtc(now);
  // Автоперенос прошедших ДЗ в «Выполненные»: всё с датой раньше сегодняшней
  // (deadline < today) или с флагом done из МЭШ сразу помечаем как completed,
  // чтобы старые задания не висели в активных.
  for (const hw of items) {
    const key = meshKey('hw', hw.subject, hw.deadline, hw.description);
    const deadline = toUtcDate(hw.deadline, now);
    const priority = deadline < today ? 'high' : 'medium';
    const autoDone = hw.done || deadline < today;
    const meshAttachments = hw.attachments.length > 0 ? JSON.stringify(hw.attachments) : null;
    const existing = await prisma.homework.findUnique({
      where: { userId_externalKey: { userId, externalKey: key } },
    });
    if (existing) {
      // Статус completed пользователя не откатываем назад
      const status =
        existing.status === 'completed' || autoDone ? 'completed' : 'pending';
      await prisma.homework.update({
        where: { id: existing.id },
        data: {
          subject: hw.subject,
          title: hw.description.slice(0, 60),
          description: hw.description,
          deadline,
          priority,
          status,
          hasAttachment: hw.attachments.length > 0,
          meshAttachments,
        },
      });
      report.homeworks.updated += 1;
    } else {
      await prisma.homework.create({
        data: {
          userId,
          subject: hw.subject,
          title: hw.description.slice(0, 60),
          description: hw.description,
          deadline,
          estimatedMinutes: 30,
          priority,
          status: autoDone ? 'completed' : 'pending',
          source: 'mesh',
          externalKey: key,
          hasAttachment: hw.attachments.length > 0,
          meshAttachments,
        },
      });
      report.homeworks.created += 1;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Оценки -> TestResult (сохраняются для дневника МЭШ, без WeakTopic) */
/* ------------------------------------------------------------------ */

async function persistMarks(
  userId: string,
  groups: MeshDiarySync['marks'],
  now: Date,
  report: MeshPersistReport
): Promise<void> {
  // Проверяем настройки пользователя: разрешено ли школьным оценкам создавать записи в WeakTopic
  const [user, profile, targetSubjects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { meshEnabled: true, meshWeakTopics: true },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.targetSubject.findMany({ where: { userId } }),
  ]);
  const isMeshMaster = Boolean(user?.meshEnabled ?? profile?.meshIntegrationEnabled);
  const allowMeshWeakTopics = isMeshMaster && Boolean(user?.meshWeakTopics ?? profile?.meshWeakTopicsEnabled);
  const targetNames = targetSubjects.map((t) => t.subjectName);

  for (const group of groups) {
    const marks: MeshMark[] = group.marks;
    for (const m of marks) {
      if (!Number.isFinite(m.value) || m.value < 1 || m.value > 5) {
        report.marks.skipped += 1;
        continue;
      }
      const key = meshKey('mark', group.subject, m.date, m.value, m.weight, m.topic);
      const testDate = toUtcDate(m.date, now);
      const existing = await prisma.testResult.findUnique({
        where: { userId_externalKey: { userId, externalKey: key } },
      });
      const title = m.topic ? `Оценка ${m.value} · ${m.topic}` : `Оценка ${m.value}`;
      if (!existing) {
        await prisma.testResult.create({
          data: {
            userId,
            subject: group.subject,
            title,
            scaleType: '5_point',
            score: m.value,
            maxScore: 5,
            normalizedPercent: Math.round(m.value * 20 * 100) / 100,
            testDate,
            source: 'mesh',
            externalKey: key,
            topic: m.topic,
            mistakeTopics: null,
            comment: m.weight > 1 ? `Вес ${m.weight}` : null,
          },
        });
        report.marks.created += 1;
      }

      // Если в настройках пользователя явно включена подготовка по МЭШ и учет школьных оценок
      // И предмет входит в список целевых предметов ЕГЭ ученика!
      if (allowMeshWeakTopics && m.value <= 3 && m.topic) {
        if (targetNames.length === 0 || isSubjectMatchingTarget(group.subject, targetNames)) {
          const formattedTopic = `[МЭШ] ${m.topic}`;
          await prisma.weakTopic.upsert({
            where: {
              userId_subject_topicName: {
                userId,
                subject: group.subject,
                topicName: formattedTopic,
              },
            },
            update: {
              frequency: { increment: 1 },
              isResolved: false,
              lastFailedDate: testDate,
            },
            create: {
              userId,
              subject: group.subject,
              topicName: formattedTopic,
              frequency: 1,
              isResolved: false,
              lastFailedDate: testDate,
            },
          }).catch(() => {});
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Расписание недели -> ScheduleItem (замена mesh-слоя)                */
/* ------------------------------------------------------------------ */

function mondayOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (d.getDay() + 6) % 7; // Пн=0
  d.setDate(d.getDate() - shift);
  return d;
}

function parseHm(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function persistWeekSchedule(
  userId: string,
  token: string,
  student: MeshStudent,
  report: MeshPersistReport
): Promise<void> {
  const monday = mondayOfWeek(new Date());
  const dates: Array<{ iso: string; dow: number }> = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.push({ iso, dow: i + 1 });
  }
  const settled = await Promise.allSettled(
    dates.map((d) => getMeshSchedule(token, student.studentId, d.iso))
  );
  const rows: Array<{
    userId: string;
    dayOfWeek: number;
    subject: string;
    originalMeshName: string;
    topic: string | null;
    source: string;
    startTime: string;
    endTime: string;
    difficulty: string;
  }> = [];
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const lesson of r.value) {
      const endMin = parseHm(lesson.end);
      const startMin = parseHm(lesson.start);
      // МЭШ short-schedule отдаёт только время конца урока: начало = конец − 45 мин
      const end = endMin ?? (startMin !== null ? startMin + 45 : null);
      const start = startMin ?? (endMin !== null ? endMin - 45 : null);
      if (start === null || end === null) continue;
      rows.push({
        userId,
        dayOfWeek: dates[i].dow,
        subject: lesson.subject,
        originalMeshName: lesson.subject,
        topic: lesson.topic,
        source: 'mesh',
        startTime: hm(start),
        endTime: hm(end),
        difficulty: 'medium',
      });
    }
  });
  // createMany недоступен на SQLite — пишем по одному
  await prisma.scheduleItem.deleteMany({ where: { userId, source: 'mesh' } });
  for (const row of rows) {
    await prisma.scheduleItem.create({ data: row });
  }
  report.lessons.replaced = rows.length;
}

/* ------------------------------------------------------------------ */
/* Точка входа моста                                                   */
/* ------------------------------------------------------------------ */

export async function persistMeshDiary(
  userId: string,
  token: string,
  student: MeshStudent,
  result: MeshDiarySync
): Promise<MeshPersistReport> {
  const report: MeshPersistReport = {
    homeworks: { created: 0, updated: 0 },
    marks: { created: 0, skipped: 0 },
    lessons: { replaced: 0 },
    weakTopics: { upserted: 0 },
  };
  const now = new Date();
  // Последовательно (SQLite не любит параллельные записи)
  await persistHomeworks(userId, result.homeworks, now, report);
  await persistMarks(userId, result.marks, now, report);
  await persistWeekSchedule(userId, token, student, report);
  console.error(
    `[mesh-bridge] user ${userId}: HW +${report.homeworks.created}/~${report.homeworks.updated}, ` +
      `marks +${report.marks.created} (skip ${report.marks.skipped}), ` +
      `lessons ${report.lessons.replaced}, weakTopics ${report.weakTopics.upserted}`
  );
  return report;
}

export { EMPTY_REPORT };
