export interface StatsInput {
  today: string;                    // YYYY-MM-DD
  examDate: string | null;
  pace: 'moderate' | 'intensive';
  weekdayHours: number;
  weekendHours: number;
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[];
  homework: { status: string; deadline: string; estimatedMinutes: number }[];
  tests: { subject: string; normalizedPercent: number }[];
  mocks: { subject: string; examDate: string; totalScore: number; mistakeTopics: string[] }[];
  targets: { subjectName: string; targetScore: number }[];
  weak: { subject: string; topicName: string; frequency: number; isResolved: boolean }[];
  plan: { targetDate: string; isCompleted: boolean }[];
}
export type Level = 'Низкий' | 'Средний' | 'Высокий';
export type Pacing = 'Опережает график' | 'В графике' | 'Требуется ускорение';
export interface Gap { subject: string; topic: string; criticality: 'low' | 'medium' | 'high' }
export interface Stats {
  daysToExam: number | null;
  weeklyHours: { school: number; homework: number; study: number; total: number };
  heavyDays: number[];
  overdueHomework: number;
  burnout: { score: number; level: Level };
  pacing: { ratio: number; status: Pacing };
  readiness: { subject: string; readinessPercent: number }[];
  mockTrend: { subject: string; first: number; last: number; delta: number; target: number | null }[];
  gaps: Gap[];
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n));
const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const key = (s: string): string => s.trim().toLowerCase();

export function computeStats(i: StatsInput): Stats {
  const perDay: Record<number, { min: number; n: number }> = {};
  for (const s of i.schedule) {
    const d = (perDay[s.dayOfWeek] ??= { min: 0, n: 0 });
    d.min += Math.max(0, toMin(s.endTime) - toMin(s.startTime));
    d.n += 1;
  }
  const schoolH = Object.values(perDay).reduce((a, d) => a + d.min, 0) / 60;
  const heavyDays = Object.entries(perDay).filter(([, d]) => d.n >= 7).map(([k]) => Number(k)).sort();
  const pending = i.homework.filter((h) => h.status === 'pending');
  const overdue = pending.filter((h) => h.deadline < i.today).length;
  const hwH = pending.filter((h) => dayDiff(i.today, h.deadline) <= 7).reduce((a, h) => a + h.estimatedMinutes, 0) / 60;
  const studyH = i.weekdayHours * 5 + i.weekendHours * 2;
  const total = schoolH + hwH + studyH;

  let score = clamp((total - 40) / 30, 0, 1) * 50;
  score += Math.min(15, heavyDays.length * 5) + Math.min(15, overdue * 5);
  if (i.pace === 'intensive') score += 10;
  score = Math.round(clamp(score, 0, 100));
  const level: Level = score < 35 ? 'Низкий' : score < 65 ? 'Средний' : 'Высокий';

  const due = i.plan.filter((p) => p.targetDate <= i.today);
  const done = i.plan.filter((p) => p.isCompleted).length;
  const ratio = due.length === 0 ? 1 : r1(done / due.length);
  const status: Pacing = ratio >= 1.1 ? 'Опережает график' : ratio >= 0.8 ? 'В графике' : 'Требуется ускорение';

  const mockTrend = [...new Set(i.mocks.map((m) => key(m.subject)))].map((k) => {
    const list = i.mocks.filter((m) => key(m.subject) === k).sort((a, b) => a.examDate.localeCompare(b.examDate));
    const t = i.targets.find((x) => key(x.subjectName) === k);
    return { subject: list[0].subject, first: list[0].totalScore, last: list[list.length - 1].totalScore, delta: list[list.length - 1].totalScore - list[0].totalScore, target: t ? t.targetScore : null };
  });

  const readiness = i.targets.map((t) => {
    const k = key(t.subjectName);
    const mk = mockTrend.find((m) => key(m.subject) === k);
    const tp = i.tests.filter((x) => key(x.subject) === k).map((x) => x.normalizedPercent);
    const mockP = mk ? clamp((mk.last / t.targetScore) * 100, 0, 100) : null;
    const testP = tp.length > 0 ? tp.reduce((a, b) => a + b, 0) / tp.length : null;
    const v = mockP !== null && testP !== null ? 0.7 * mockP + 0.3 * testP : mockP ?? testP ?? 0;
    return { subject: t.subjectName, readinessPercent: Math.round(v) };
  });

  const mockCount: Record<string, number> = {};
  for (const m of i.mocks) for (const t of new Set(m.mistakeTopics)) mockCount[key(t)] = (mockCount[key(t)] ?? 0) + 1;
  const gaps: Gap[] = i.weak
    .filter((w) => !w.isResolved)
    .map((w) => {
      const chronic = (mockCount[key(w.topicName)] ?? 0) >= 2;
      const t = w.topicName.toLowerCase();
      // Ошибки в заданиях части 1 (№1–13 по математике, №1–26 по русскому) — базовые баллы, высший приоритет ликвидации
      const isPart1 = /задани[ея]\s*(1[0-3]|[1-9])\b/i.test(t) || /задани[ея]\s*(2[0-6]|1[0-9]|[1-9])\b/i.test(t) || t.includes('часть 1') || t.includes('первая часть');
      // Сложнейшие задания повышенной сложности части 2 (параметры, теория чисел)
      const isHardPart2 = /параметр|теория чисел|свойства чисел|18|19|20|олимпиад/i.test(t);
      // Базовые задания части 2 (уравнения №14, неравенства №16, экономика)
      const isModeratePart2 = /задани[ея]\s*(1[4-7])\b|уравнени|неравенств|финансов/i.test(t);

      let criticality: Gap['criticality'] = 'high';
      if (chronic || w.frequency >= 3) {
        criticality = 'high';
      } else if (isPart1) {
        criticality = 'high';
      } else if (isHardPart2) {
        criticality = 'low';
      } else if (isModeratePart2) {
        criticality = 'medium';
      } else {
        criticality = w.frequency === 1 ? 'high' : 'medium';
      }

      const priorityWeight = criticality === 'high' ? 50 : criticality === 'medium' ? 20 : 0;
      return { subject: w.subject, topic: w.topicName, criticality, f: w.frequency + (chronic ? 10 : 0) + priorityWeight };
    })
    .sort((a, b) => b.f - a.f)
    .slice(0, 6)
    .map(({ subject, topic, criticality }) => ({ subject, topic, criticality }));

  return {
    daysToExam: i.examDate ? Math.max(0, dayDiff(i.today, i.examDate)) : null,
    weeklyHours: { school: r1(schoolH), homework: r1(hwH), study: r1(studyH), total: r1(total) },
    heavyDays, overdueHomework: overdue, burnout: { score, level }, pacing: { ratio, status },
    readiness, mockTrend, gaps,
  };
}
