import type { User } from '@prisma/client';
import { extractPdfText } from './pdfText';
import { chatJson } from './openrouterClient';
import { scheduleAiSchema, type ScheduleAiResult } from '../../ai/schemas';
import { SYS_SCHEDULE } from '../../ai/prompts';
import { normalizeMeshSubject, difficultyFor } from '../meshParsers';

export interface ParsedScheduleItem {
  dayOfWeek: number;
  subject: string;
  originalMeshName: string;
  startTime: string;
  endTime: string;
  difficulty: 'low' | 'medium' | 'high';
}

const DAY_MAP: Record<string, number> = {
  понедельник: 1,
  пн: 1,
  вторник: 2,
  вт: 2,
  среда: 3,
  среду: 3,
  ср: 3,
  четверг: 4,
  чт: 4,
  пятница: 5,
  пятницу: 5,
  пт: 5,
  суббота: 6,
  субботу: 6,
  сб: 6,
};

// NB: \b не работает с кириллицей (в \w входят только латинские символы),
// поэтому после дня требуем разделитель или цифру вручную.
const DAY_RE = /^\s*(понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|пн|вт|ср|чт|пт|сб)\s*(?:[,;\-–—]|\d)/i;
const TIME_RE = /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+)$/;

const isNoiseLine = (line: string): boolean =>
  /стр\.\s*\d/i.test(line) ||
  /^--/.test(line) ||
  /сохранено/i.test(line) ||
  /^\s*расписание/i.test(line) ||
  /^\d+\s+of\s+\d+/i.test(line);

// "8:30" -> "08:30" (схема подтверждения импорта требует HH:MM)
const padTime = (time: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : time;
};

// Детерминированный разбор текста школьного расписания вида
// "Понедельник, 28 сентября" + "08:30-09:10 Название предмета" (с переносами строк).
// Возвращает null, если формат не распознан (тогда используется AI-фолбэк).
export function parseScheduleText(text: string): ParsedScheduleItem[] | null {
  const items: ParsedScheduleItem[] = [];
  let currentDay = 0;
  let sawDayHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length === 0) continue;

    const dayMatch = DAY_RE.exec(line);
    if (dayMatch) {
      const day = DAY_MAP[dayMatch[1].toLowerCase()];
      if (day !== undefined) {
        currentDay = day;
        sawDayHeader = true;
        continue;
      }
    }

    const timeMatch = TIME_RE.exec(line);
    if (timeMatch) {
      if (!currentDay) continue;
      items.push({
        dayOfWeek: currentDay,
        subject: timeMatch[3].trim(),
        originalMeshName: timeMatch[3].trim(),
        startTime: padTime(timeMatch[1]),
        endTime: padTime(timeMatch[2]),
        difficulty: 'medium',
      });
      continue;
    }

    // Перенос длинного названия предмета на следующую строку
    if (currentDay && items.length > 0 && !isNoiseLine(line)) {
      const last = items[items.length - 1];
      const joiner = last.subject.endsWith('-') ? '' : ' ';
      last.subject = `${last.subject}${joiner}${line}`;
      last.originalMeshName = last.subject;
    }
  }

  if (!sawDayHeader || items.length === 0) return null;

  return items.map((item) => {
    const subject = normalizeMeshSubject(item.subject);
    return {
      ...item,
      subject,
      difficulty: difficultyFor(subject),
    };
  });
}

export async function parseSchedulePdf(user: User, pdfBuffer: Buffer): Promise<ParsedScheduleItem[]> {
  // Extract text from PDF
  const text = await extractPdfText(pdfBuffer);

  if (!text || text.trim().length === 0) {
    throw new Error('PDF не содержит текста');
  }

  // 1) Детерминированный локальный разбор (формат "День, число" + "HH:MM-HH:MM предмет")
  const local = parseScheduleText(text);
  if (local && local.length > 0) {
    return local;
  }

  // 2) Фолбэк: незнакомый формат — отдаём в AI
  const result = await chatJson<ScheduleAiResult>({
    user,
    messages: [
      { role: 'system', content: SYS_SCHEDULE },
      { role: 'user', content: `Текст расписания:\n\n${text}` },
    ],
    schema: scheduleAiSchema,
    mockType: 'schedule',
  });

  // Normalize subject names and estimate difficulty
  const normalized = result.data.items.map((item) => {
    const subject = normalizeMeshSubject(item.originalMeshName);
    const difficulty = difficultyFor(subject);

    return {
      dayOfWeek: item.dayOfWeek,
      subject,
      originalMeshName: item.originalMeshName,
      startTime: item.startTime,
      endTime: item.endTime,
      difficulty,
    };
  });

  return normalized;
}
