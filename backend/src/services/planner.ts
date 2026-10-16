import { topicsFor } from './syllabus.js';

export type PrepMode = 'extended' | 'full_year' | 'accelerated_6m' | 'express_1m';
export type Pace = 'moderate' | 'intensive';
export type Kind = 'theory' | 'practice_kim' | 'mistakes_review';
export type Priority = 'low' | 'medium' | 'high';

export interface PlanSubject { name: string; target: number; current: number | null }
export interface WeakInput { subject: string; topic: string; frequency: number }
export interface PlanInput {
  startDate: string;                       // YYYY-MM-DD
  days: number;                            // 7..60
  mode: PrepMode;
  pace: Pace;
  weekdayHours: number;
  weekendHours: number;
  lessonsByDow?: Record<number, number>;    // Сетка школьных уроков
  throttleBySchedule?: boolean;             // Флаг адаптации нагрузки под расписание МЭШ (из настроек)
  subjects: PlanSubject[];
  weakTopics: WeakInput[];                 // только нерешённые
}
export interface PlanSlot { date: string; subject: string; topic: string; kind: Kind; durationMinutes: number; priority: Priority }

const MODE_FACTOR: Record<PrepMode, number> = { extended: 0.85, full_year: 1, accelerated_6m: 1.15, express_1m: 1.3 };
const PACE_FACTOR: Record<Pace, number> = { moderate: 1, intensive: 1.2 };
const KIND_CYCLE: Record<PrepMode, Kind[]> = {
  extended: ['theory', 'practice_kim', 'theory', 'mistakes_review', 'practice_kim'],
  full_year: ['theory', 'practice_kim', 'theory', 'mistakes_review', 'practice_kim'],
  accelerated_6m: ['theory', 'practice_kim', 'practice_kim', 'mistakes_review'],
  express_1m: ['practice_kim', 'practice_kim', 'mistakes_review', 'theory'],
};

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dowOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export function dayMinutes(date: string, i: Pick<PlanInput, 'mode' | 'pace' | 'weekdayHours' | 'weekendHours' | 'lessonsByDow' | 'throttleBySchedule'>): number {
  const dow = dowOf(date);
  const weekend = dow === 0 || dow === 6;
  let m = (weekend ? i.weekendHours : i.weekdayHours) * 60 * MODE_FACTOR[i.mode] * PACE_FACTOR[i.pace];
  // Адаптация под расписание уроков МЭШ применяется только если включена соответствующая опция в настройках
  if (i.throttleBySchedule && i.lessonsByDow) {
    const lessons = i.lessonsByDow[dow] ?? 0;
    if (lessons >= 7) m = Math.min(m, 30);
    else if (lessons === 6) m *= 0.6;
    else if (lessons === 5) m *= 0.85;
  }
  if (dow === 0 && i.pace === 'moderate' && i.mode !== 'express_1m') m *= 0.75;
  m = Math.min(m, weekend ? 480 : 300);
  m = Math.floor(m / 5) * 5;
  return m < 20 ? 0 : m;
}

export function splitMinutes(total: number): number[] {
  if (total <= 0) return [];
  if (total <= 90) return [total];
  const n = Math.min(4, Math.ceil(total / 90));
  const base = Math.floor(total / n / 5) * 5;
  const parts = Array<number>(n).fill(base);
  parts[0] += total - base * n;
  return parts;
}

const uniq = (a: string[]): string[] => [...new Set(a)];

export function buildPlan(i: PlanInput): PlanSlot[] {
  const subs = i.subjects;
  if (subs.length === 0) return [];
  const weights = subs.map((s) => 10 + Math.max(5, s.target - (s.current ?? s.target - 20)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const cw = subs.map(() => 0);
  const st = subs.map((s) => {
    const weak = i.weakTopics
      .filter((w) => w.subject.toLowerCase() === s.name.toLowerCase())
      .sort((a, b) => b.frequency - a.frequency)
      .map((w) => w.topic);
    const syllabusTopics = topicsFor(s.name, s.target);
    return { weak, pool: uniq([...weak, ...syllabusTopics]), ti: 0, pi: 0, wi: 0, ki: 0 };
  });
  const out: PlanSlot[] = [];
  for (let d = 0; d < i.days; d++) {
    const date = addDays(i.startDate, d);
    const used = new Set<number>();
    for (const minutes of splitMinutes(dayMinutes(date, i))) {
      let pick = -1;
      for (let k = 0; k < subs.length; k++) cw[k] += weights[k];
      const free = subs.map((_, k) => k).filter((k) => !used.has(k));
      const allowed = free.length > 0 ? free : subs.map((_, k) => k);
      for (const k of allowed) if (pick === -1 || cw[k] > cw[pick]) pick = k;
      cw[pick] -= sumW;
      used.add(pick);
      const s = st[pick];
      const kind: Kind = minutes <= 30 ? (s.weak.length > 0 ? 'mistakes_review' : 'theory') : KIND_CYCLE[i.mode][s.ki++ % KIND_CYCLE[i.mode].length];
      let topic: string;
      let priority: Priority = 'medium';
      if (kind === 'theory') {
        const idx = s.ti++ % s.pool.length;
        topic = s.pool[idx];
        if (s.weak.includes(topic)) priority = 'high';
      } else if (kind === 'practice_kim') {
        topic = `Практика КИМ: ${s.pool[s.pi++ % s.pool.length]}`;
        if (i.mode === 'express_1m') priority = 'high';
      } else {
        topic = s.weak.length > 0 ? `Разбор ошибок: ${s.weak[s.wi++ % s.weak.length]}` : 'Разбор ошибок последнего пробника';
        priority = 'high';
      }
      out.push({ date, subject: subs[pick].name, topic, kind, durationMinutes: minutes, priority });
    }
  }
  return out;
}
