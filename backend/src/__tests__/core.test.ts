import { describe, it, expect } from 'vitest';
import { normalizePercent, scoreError, gapLevel, resolveMax } from '../lib/normalize';
import { encrypt, decrypt } from '../lib/crypto';
import { aiGate, freeQuota, isProActive, usedPercent, remainingPercent, NOTICE_402 } from '../lib/usage';
import { stripFences, safeParse } from '../lib/json';
import { MODELS, approxRequestsPerMonth, niceRound, toPublicModel, isAllowedModel, getModelProviderConfig } from '../config/models';
import { addDays, dayMinutes, splitMinutes, buildPlan } from '../services/planner';
import { computeStats } from '../services/analysisStats';
import { normalizeMeshSubject, difficultyFor, resolveDeadline, priorityByDeadline, parseHomeworkLine, splitHomework } from '../services/meshParsers';

describe('normalize', () => {
  it('переводит оценки в проценты', () => {
    expect(normalizePercent(3, 5)).toBe(60);
    expect(normalizePercent(9, 10)).toBe(90);
    expect(normalizePercent(17, 25)).toBe(68);
    expect(normalizePercent(7, 0)).toBe(0);
    expect(normalizePercent(120, 100)).toBe(100);
  });
  it('уровни пробела: 3 из 5 - это пробел', () => {
    expect(gapLevel(60)).toBe('gap');
    expect(gapLevel(68)).toBe('mid');
    expect(gapLevel(80)).toBe('good');
  });
  it('валидирует оценку', () => {
    expect(scoreError('5_point', 6)).toBe('Оценка не может быть больше 5');
    expect(scoreError('raw_fraction', 3)).toBe('Укажите максимальный балл');
    expect(scoreError('raw_fraction', 3, 25)).toBeNull();
    expect(resolveMax('10_point')).toBe(10);
  });
});

describe('crypto и json', () => {
  it('шифрует и расшифровывает', () => {
    const k = 'a'.repeat(64);
    const c = encrypt('sk-or-v1-secret', k);
    expect(c).not.toBe('sk-or-v1-secret');
    expect(decrypt(c, k)).toBe('sk-or-v1-secret');
    expect(encrypt('x', k)).not.toBe(encrypt('x', k));
    expect(() => decrypt(c, 'b'.repeat(64))).toThrow();
    expect(() => encrypt('x', 'abcd')).toThrow();
  });
  it('чистит json-обёртки', () => {
    expect(stripFences('\u0060\u0060\u0060json\n{"a":1}\n\u0060\u0060\u0060')).toBe('{"a":1}');
    expect(safeParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeParse('нет')).toBeUndefined();
  });
});

const base = { subscriptionTier: 'FREE', proExpiresAt: null as Date | null, trafficUsedPercent: 0, freeAiRequestsLeft: 3, freeAiResetAt: null as Date | null, isDemo: false };
const now = new Date('2026-09-29T10:00:00Z');

describe('usage', () => {
  it('гейт AI', () => {
    expect(aiGate({ ...base, isDemo: true }, now)).toEqual({ ok: true, mode: 'demo' });
    expect(aiGate(base, now)).toEqual({ ok: true, mode: 'free' });
    expect(aiGate({ ...base, freeAiRequestsLeft: 0, freeAiResetAt: new Date('2026-10-03T00:00:00Z') }, now).ok).toBe(false);
    expect(aiGate({ ...base, freeAiRequestsLeft: 0, freeAiResetAt: new Date('2026-09-28T00:00:00Z') }, now)).toEqual({ ok: true, mode: 'free' });
    const pro = { ...base, subscriptionTier: 'PRO', proExpiresAt: new Date('2026-10-30T00:00:00Z') };
    expect(aiGate(pro, now)).toEqual({ ok: true, mode: 'pro' });
    const full = aiGate({ ...pro, trafficUsedPercent: 100 }, now);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.notice).toBe(NOTICE_402);
  });
  it('срок PRO и проценты', () => {
    expect(isProActive({ subscriptionTier: 'PRO', proExpiresAt: new Date('2026-09-01T00:00:00Z') }, now)).toBe(false);
    expect(isProActive({ subscriptionTier: 'PRO', proExpiresAt: null }, now)).toBe(true);
    expect(freeQuota({ freeAiRequestsLeft: 1, freeAiResetAt: new Date('2026-10-01T00:00:00Z') }, now).changed).toBe(false);
    expect(usedPercent(0.6, 3)).toBe(20);
    expect(usedPercent(5, 3)).toBe(100);
    expect(usedPercent(1, null)).toBe(0);
    expect(remainingPercent(18)).toBe(82);
  });
});

describe('models', () => {
  it('не отдаёт цены наружу и считает запросы', () => {
    const p = toPublicModel(MODELS[0]) as unknown as Record<string, unknown>;
    expect('inPerM' in p || 'outPerM' in p).toBe(false);
    expect(niceRound(576)).toBe(580);
    expect(niceRound(173)).toBe(170);
    expect(approxRequestsPerMonth(MODELS[0])).toBeGreaterThan(0);
    expect(MODELS[0].recommended).toBe(true);
    expect(MODELS.find((m) => m.slug.includes('argon'))?.recommended).toBe(false);
    expect(MODELS.find((m) => m.slug.includes('argon'))?.label).toBe('Gemini 4 Argon');
    expect(isAllowedModel('google/gemini-4-argon')).toBe(true);
    expect(isAllowedModel('google/gemini-4-argon:online')).toBe(true);
    expect(isAllowedModel('google/gemini-3.8-flash')).toBe(true);
    expect(isAllowedModel('google/gemini-3.8-flash:online')).toBe(true);
    expect(isAllowedModel('x/y')).toBe(false);
    expect(getModelProviderConfig('google/gemini-4-argon')).toEqual({
      order: ['google-ai-studio/flex'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('google/gemini-4-argon:online')).toEqual({
      order: ['google-ai-studio/flex'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('openai/gpt-6-astra')).toEqual({
      order: ['openai/flex'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('openai/gpt-6.1-sol')).toEqual({
      order: ['openai/flex'],
      allow_fallbacks: true,
    });
    expect(getModelProviderConfig('google/gemini-3.8-flash')).toEqual({
      order: ['google-ai-studio/flex'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('anthropic/claude-haiku-5.5')).toEqual({
      order: ['google-vertex/global'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('anthropic/claude-sonnet-5.5')).toEqual({
      order: ['amazon-bedrock'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('anthropic/claude-opus-5.5')).toEqual({
      order: ['google-vertex/global'],
      allow_fallbacks: false,
    });
    expect(getModelProviderConfig('deepseek/deepseek-v4.1-flash')).toEqual({
      order: ['baidu/fp8'],
      allow_fallbacks: false,
    });
  });
  it('экономность убывает с ростом цены', () => {
    const s = [...MODELS].sort((a, b) => a.inPerM * 8 + a.outPerM * 3 - (b.inPerM * 8 + b.outPerM * 3));
    for (let i = 1; i < s.length; i++) expect(s[i].economy).toBeLessThanOrEqual(s[i - 1].economy);
  });
});

const lessons: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 8, 5: 6, 6: 0 };
const pin = {
  startDate: '2026-09-29', days: 14, mode: 'full_year' as const, pace: 'moderate' as const, weekdayHours: 2, weekendHours: 4, lessonsByDow: lessons,
  subjects: [{ name: 'Информатика', target: 90, current: 60 }, { name: 'Профильная математика', target: 80, current: 68 }, { name: 'Русский язык', target: 85, current: 80 }],
  weakTopics: [{ subject: 'Профильная математика', topic: 'Стереометрия', frequency: 3 }],
};

describe('planner', () => {
  it('минуты по дням', () => {
    expect(addDays('2026-09-29', 2)).toBe('2026-10-01');
    expect(dayMinutes('2026-09-29', pin)).toBe(120);
    expect(dayMinutes('2026-10-01', pin)).toBe(120);
    expect(dayMinutes('2026-09-30', pin)).toBe(120);
    expect(dayMinutes('2026-10-03', pin)).toBe(240);
    expect(dayMinutes('2026-10-04', pin)).toBe(180);
    expect(dayMinutes('2026-10-04', { ...pin, pace: 'intensive' })).toBe(285);
  });
  it('разбиение на слоты', () => {
    expect(splitMinutes(70)).toEqual([70]);
    expect(splitMinutes(240)).toEqual([80, 80, 80]);
    expect(splitMinutes(0)).toEqual([]);
    for (const t of [95, 100, 180, 285, 360, 480]) {
      const p = splitMinutes(t);
      expect(p.reduce((a, b) => a + b, 0)).toBe(t);
      expect(p.length).toBeLessThanOrEqual(4);
    }
  });
  it('строит план', () => {
    const plan = buildPlan(pin);
    for (let d = 0; d < 14; d++) {
      const date = addDays(pin.startDate, d);
      expect(plan.filter((x) => x.date === date).reduce((a, x) => a + x.durationMinutes, 0)).toBe(dayMinutes(date, pin));
    }
    const cnt = (n: string) => plan.filter((x) => x.subject === n).length;
    expect(cnt('Информатика')).toBeGreaterThan(cnt('Профильная математика'));
    expect(cnt('Профильная математика')).toBeGreaterThan(cnt('Русский язык'));
    expect(plan.some((x) => x.topic.includes('Стереометрия'))).toBe(true);
    expect(buildPlan(pin)).toEqual(plan);
    expect(buildPlan({ ...pin, subjects: [] })).toEqual([]);
    expect(buildPlan({ ...pin, subjects: [{ name: 'Эсперанто', target: 70, current: null }] }).length).toBeGreaterThan(0);
    const ex = buildPlan({ ...pin, mode: 'express_1m', pace: 'intensive' });
    expect(ex.reduce((a, x) => a + x.durationMinutes, 0)).toBeGreaterThan(plan.reduce((a, x) => a + x.durationMinutes, 0));
  });
});

describe('analysisStats', () => {
  const lesson = (d: number, n: number) => Array.from({ length: n }, (_, i) => ({ dayOfWeek: d, startTime: `${8 + i}:00`, endTime: `${8 + i}:45` }));
  it('считает нагрузку, темп, пробелы', () => {
    const s = computeStats({
      today: '2026-09-29', examDate: '2027-06-05', pace: 'moderate', weekdayHours: 2, weekendHours: 4,
      schedule: [...lesson(4, 8), ...lesson(3, 5)],
      homework: [{ status: 'pending', deadline: '2026-09-28', estimatedMinutes: 60 }, { status: 'pending', deadline: '2026-10-02', estimatedMinutes: 30 }, { status: 'completed', deadline: '2026-09-27', estimatedMinutes: 99 }],
      tests: [{ subject: 'Профильная математика', normalizedPercent: 60 }],
      mocks: [{ subject: 'Профильная математика', examDate: '2026-05-01', totalScore: 56, mistakeTopics: ['Стереометрия', 'Параметры'] }, { subject: 'Профильная математика', examDate: '2026-06-01', totalScore: 68, mistakeTopics: ['Стереометрия'] }],
      targets: [{ subjectName: 'Профильная математика', targetScore: 80 }, { subjectName: 'Информатика', targetScore: 90 }],
      weak: [{ subject: 'Профильная математика', topicName: 'Стереометрия', frequency: 2, isResolved: false }, { subject: 'Профильная математика', topicName: 'Параметры', frequency: 1, isResolved: false }, { subject: 'Физика', topicName: 'Оптика', frequency: 1, isResolved: true }],
      plan: [{ targetDate: '2026-09-28', isCompleted: true }, { targetDate: '2026-09-29', isCompleted: false }, { targetDate: '2026-10-05', isCompleted: false }],
    });
    expect(s.daysToExam).toBe(249);
    expect(s.heavyDays).toEqual([4]);
    expect(s.overdueHomework).toBe(1);
    expect(s.weeklyHours).toEqual({ school: 9.8, homework: 1.5, study: 18, total: 29.3 });
    expect(s.burnout.level).toBe('Низкий');
    expect(s.pacing.status).toBe('Требуется ускорение');
    expect(s.mockTrend[0].delta).toBe(12);
    expect(s.readiness).toEqual([{ subject: 'Профильная математика', readinessPercent: 78 }, { subject: 'Информатика', readinessPercent: 0 }]);
    expect(s.gaps.map((g) => `${g.topic}:${g.criticality}`)).toEqual(['Стереометрия:high', 'Параметры:low']);
  });
  it('высокий риск выгорания', () => {
    const s = computeStats({
      today: '2026-09-29', examDate: null, pace: 'intensive', weekdayHours: 5, weekendHours: 8,
      schedule: [1, 2, 3, 4, 5].flatMap((d) => lesson(d, 8)),
      homework: [{ status: 'pending', deadline: '2026-09-20', estimatedMinutes: 120 }, { status: 'pending', deadline: '2026-09-21', estimatedMinutes: 120 }],
      tests: [], mocks: [], targets: [], weak: [], plan: [],
    });
    expect(s.burnout.level).toBe('Высокий');
    expect(s.daysToExam).toBeNull();
    expect(s.pacing.status).toBe('В графике');
  });
});

describe('meshParsers', () => {
  const t = new Date('2026-09-29T10:00:00Z');
  it('нормализует названия', () => {
    expect(normalizeMeshSubject('26/27_11_РОВ 10у')).toBe('Разговоры о важном');
    expect(normalizeMeshSubject('26/27 Методы решения физических задач_10у')).toBe('Спецкурс по физике');
    expect(normalizeMeshSubject('Алгебра и начала математического анализа')).toBe('Математика');
    expect(normalizeMeshSubject('Физическая культура')).toBe('Физкультура');
    expect(normalizeMeshSubject('Физика')).toBe('Физика');
    expect(normalizeMeshSubject('Астрономия')).toBe('Астрономия');
    expect(difficultyFor('Математика')).toBe('high');
    expect(difficultyFor('Физкультура')).toBe('low');
    expect(difficultyFor('Литература')).toBe('medium');
  });
  it('даты и приоритеты', () => {
    expect(resolveDeadline('30.09', t)).toBe('2026-09-30');
    expect(resolveDeadline('28.09', t)).toBe('2027-09-28');
    expect(resolveDeadline('29.09', t)).toBe('2026-09-29');
    expect(resolveDeadline('01.10.26', t)).toBe('2026-10-01');
    expect(resolveDeadline('31.02', t)).toBeNull();
    expect(resolveDeadline('мусор', t)).toBeNull();
    expect(priorityByDeadline('2026-09-30', t)).toBe('high');
    expect(priorityByDeadline('2026-10-02', t)).toBe('medium');
    expect(priorityByDeadline('2026-10-10', t)).toBe('low');
  });
  it('разбирает ДЗ без AI', () => {
    const p = parseHomeworkLine('Физика на 30.09: пар. 15-16, задачи 3, 4, 5 (см. файл)', t);
    expect(p?.subject).toBe('Физика');
    expect(p?.deadline).toBe('2026-09-30');
    expect(p?.title).toBe('пар. 15-16');
    expect(p?.hasAttachmentPlaceholder).toBe(true);
    expect(p?.priority).toBe('high');
    const r = splitHomework('Алгебра на 02.10 - №12, 14\nЛитература: Не задано\nЧто-то непонятное без даты\n\nИнформатика на 05.10: задание в файле', t);
    expect(r.parsed.length).toBe(2);
    expect(r.rest.length).toBe(1);
    expect(r.parsed[0].subject).toBe('Математика');
    expect(r.parsed[1].hasAttachmentPlaceholder).toBe(true);
  });
});
