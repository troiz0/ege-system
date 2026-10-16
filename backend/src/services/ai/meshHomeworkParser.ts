import type { User } from '@prisma/client';
import { chatJson } from './openrouterClient';
import { homeworkAiSchema, type HomeworkAiResult } from '../../ai/schemas';
import { SYS_HOMEWORK } from '../../ai/prompts';
import { addDays, parse, isBefore } from 'date-fns';

export interface ParsedHomework {
  subject: string;
  title: string;
  description: string;
  deadline: Date;
  estimatedMinutes: number;
  priority: 'low' | 'medium' | 'high';
  hasAttachment: boolean;
}

function parseDeadline(deadlineStr: string): Date {
  const now = new Date();
  
  // Try full date format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadlineStr)) {
    return parse(deadlineStr, 'yyyy-MM-dd', now);
  }

  // Try DD.MM format (without year)
  if (/^\d{1,2}\.\d{1,2}$/.test(deadlineStr)) {
    const [day, month] = deadlineStr.split('.').map(Number);
    const thisYear = now.getFullYear();
    let date = new Date(thisYear, month - 1, day);

    // If the date is in the past, assume next year
    if (isBefore(date, now)) {
      date = new Date(thisYear + 1, month - 1, day);
    }

    return date;
  }

  // Default: 3 days from now
  return addDays(now, 3);
}

function estimateHomeworkTime(description: string): number {
  const lower = description.toLowerCase();
  
  // Short tasks
  if (lower.includes('повторить') || lower.includes('прочитать параграф')) {
    return 20;
  }

  // Medium tasks
  if (lower.includes('задач') && lower.match(/\d+-\d+/)) {
    const match = lower.match(/(\d+)-(\d+)/);
    if (match) {
      const count = parseInt(match[2]) - parseInt(match[1]) + 1;
      return Math.min(count * 5, 60);
    }
  }

  // Long tasks
  if (lower.includes('лабораторная') || lower.includes('сочинение') || lower.includes('проект')) {
    return 90;
  }

  return 30;
}

function estimatePriority(deadline: Date, subject: string): 'low' | 'medium' | 'high' {
  const now = new Date();
  const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Target subjects get higher priority
  const isTarget = ['математика', 'информатика', 'русский'].some(s => subject.toLowerCase().includes(s));

  if (hoursUntil < 24) return 'high';
  if (hoursUntil < 48) return isTarget ? 'high' : 'medium';
  if (hoursUntil < 72) return 'medium';
  return isTarget ? 'medium' : 'low';
}

export async function parseHomeworkText(user: User, text: string): Promise<ParsedHomework[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Текст домашних заданий пуст');
  }

  // Send to AI for parsing
  const result = await chatJson<HomeworkAiResult>({
    user,
    messages: [
      { role: 'system', content: SYS_HOMEWORK },
      { role: 'user', content: text },
    ],
    schema: homeworkAiSchema,
    mockType: 'homework',
  });

  // Process and enrich homework items
  const processed = result.data.items
    .filter((item) => {
      // Filter out "Не задано" entries
      const lower = item.title.toLowerCase() + item.description.toLowerCase();
      return !lower.includes('не задано') && !lower.includes('нет задания');
    })
    .map((item) => {
      const deadline = parseDeadline(item.deadline);
      const estimatedMinutes = estimateHomeworkTime(item.description);
      const priority = estimatePriority(deadline, item.subject);

      // Check for attachment placeholders
      const descLower = item.description.toLowerCase();
      const hasAttachment = 
        descLower.includes('см. файл') ||
        descLower.includes('задание в файле') ||
        descLower.includes('см файл') ||
        descLower.includes('в прикреплённом файле');

      return {
        subject: item.subject,
        title: item.title.slice(0, 100), // Limit title length
        description: item.description,
        deadline,
        estimatedMinutes,
        priority,
        hasAttachment,
      };
    });

  return processed;
}
