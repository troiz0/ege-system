import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { chatJson } from './openrouterClient';
import { analysisAiSchema, type AnalysisAiResult } from '../../ai/schemas';
import { SYS_ANALYSIS, SYS_ANALYSIS_STRICT_KIM } from '../../ai/prompts';
import { computeStats, type StatsInput, type Stats } from '../analysisStats';
import { isSubjectMatchingTarget, isTextReferringToNonTarget } from '../../lib/subjectMatcher';

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const parseTopics = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

type FullUser = User & {
  profile: { pace: string; weekdayStudyHours: number; weekendStudyHours: number } | null;
  targetSubjects: { subjectName: string; targetScore: number; examDate: Date | null }[];
  scheduleItems: { dayOfWeek: number; startTime: string; endTime: string }[];
  homeworks: { status: string; deadline: Date; estimatedMinutes: number }[];
  testResults: { subject: string; normalizedPercent: number }[];
  mockExams: { subject: string; examDate: Date; totalScore: number; mistakeTopics: string | null }[];
  weakTopics: { subject: string; topicName: string; frequency: number; isResolved: boolean }[];
  studyPlanItems: { targetDate: Date; isCompleted: boolean }[];
};

interface AnalysisFlags {
  isScorePredictorEnabled: boolean;
  isWeakTopicsEnabled: boolean;
  isScheduleAdaptationEnabled: boolean;
}

function buildStatsInput(user: FullUser, flags: AnalysisFlags): StatsInput {
  const today = isoDate(new Date());
  const examDates = user.targetSubjects
    .map((t) => t.examDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  // Если флаг адаптации расписания МЭШ выключен, исключаем расписание школы и школьные ДЗ
  const scheduleItems = flags.isScheduleAdaptationEnabled
    ? user.scheduleItems
    : user.scheduleItems.filter((s: any) => s.source !== 'mesh');

  const homeworks = flags.isScheduleAdaptationEnabled
    ? user.homeworks
    : user.homeworks.filter((h: any) => h.source !== 'mesh');

  const targetNames = user.targetSubjects.map((t) => t.subjectName);

  // Если флаг предиктора МЭШ выключен, рассчитываем прогноз СТРОГО по пробникам и задачам КИМ, исключив оценки МЭШ
  let tests = flags.isScorePredictorEnabled
    ? user.testResults
    : user.testResults.filter((t: any) => t.source !== 'mesh');
  if (targetNames.length > 0) {
    tests = tests.filter((t) => isSubjectMatchingTarget(t.subject, targetNames));
  }

  // Если флаг слабых тем МЭШ выключен, в список дефицитов включаем ТОЛЬКО ошибки из симулятора и тестов, исключая [МЭШ]
  // И СТРОГО фильтруем по целевым предметам ученика!
  let weakTopics = flags.isWeakTopicsEnabled
    ? user.weakTopics
    : user.weakTopics.filter((w) => !w.topicName.startsWith('[МЭШ]'));
  if (targetNames.length > 0) {
    weakTopics = weakTopics.filter((w) => isSubjectMatchingTarget(w.subject, targetNames));
  }

  const mocks = targetNames.length > 0
    ? user.mockExams.filter((m) => isSubjectMatchingTarget(m.subject, targetNames))
    : user.mockExams;

  return {
    today,
    examDate: examDates.length > 0 ? isoDate(examDates[0]) : null,
    pace: user.profile?.pace === 'intensive' ? 'intensive' : 'moderate',
    weekdayHours: user.profile?.weekdayStudyHours ?? 2,
    weekendHours: user.profile?.weekendStudyHours ?? 4,
    schedule: scheduleItems.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    homework: homeworks.map((h) => ({
      status: h.status,
      deadline: isoDate(h.deadline),
      estimatedMinutes: h.estimatedMinutes,
    })),
    tests: tests.map((t) => ({
      subject: t.subject,
      normalizedPercent: t.normalizedPercent,
    })),
    mocks: mocks.map((m) => ({
      subject: m.subject,
      examDate: isoDate(m.examDate),
      totalScore: m.totalScore,
      mistakeTopics: parseTopics(m.mistakeTopics),
    })),
    targets: user.targetSubjects.map((t) => ({
      subjectName: t.subjectName,
      targetScore: t.targetScore,
    })),
    weak: weakTopics.map((w) => ({
      subject: w.subject,
      topicName: w.topicName,
      frequency: w.frequency,
      isResolved: w.isResolved,
    })),
    plan: user.studyPlanItems.map((p) => ({
      targetDate: isoDate(p.targetDate),
      isCompleted: p.isCompleted,
    })),
  };
}

export interface MeshAnalysisSlice {
  connected: boolean;
  marksBySubject: Array<{ subject: string; average: number; count: number; twos: number; threes: number }>;
  problemSubjects: string[];
  homeworks: { total: number; pending: number; overdue: number; completed: number };
  weeklySchoolLoadHours: Record<number, number>;
  /** Темы из школьных оценок МЭШ за 30 дней (предмет, тема, последняя дата). */
  schoolTopics: Array<{ subject: string; topic: string; lastDate: string }>;
  /** Текущие темы недели из расписания МЭШ (точка, где ученик остановился). */
  currentWeekTopics: Array<{ subject: string; topic: string; dayOfWeek: number }>;
  /** Плохие оценки (<=3) по темам за 14 дней — кандидаты в «свежие пробелы». */
  freshGaps: Array<{ subject: string; topic: string; value: number; date: string }>;
}

/** Срез реальных школьных данных МЭШ из БД (мост sync -> Homework/TestResult/ScheduleItem). */
export async function buildMeshSlice(userId: string): Promise<MeshAnalysisSlice> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [marks, homeworks, schedule] = await Promise.all([
    prisma.testResult.findMany({
      where: { userId, source: 'mesh', testDate: { gte: since } },
    }),
    prisma.homework.findMany({ where: { userId, source: 'mesh' } }),
    prisma.scheduleItem.findMany({ where: { userId, source: 'mesh' } }),
  ]);
  const connected = marks.length > 0 || homeworks.length > 0 || schedule.length > 0;

  const bySubject = new Map<string, { sum: number; count: number; twos: number; threes: number }>();
  for (const m of marks) {
    const e = bySubject.get(m.subject) ?? { sum: 0, count: 0, twos: 0, threes: 0 };
    e.sum += m.score;
    e.count += 1;
    if (m.score === 2) e.twos += 1;
    if (m.score === 3) e.threes += 1;
    bySubject.set(m.subject, e);
  }
  const marksBySubject = [...bySubject.entries()].map(([subject, e]) => ({
    subject,
    average: Math.round((e.sum / Math.max(1, e.count)) * 100) / 100,
    count: e.count,
    twos: e.twos,
    threes: e.threes,
  }));
  const problemSubjects = marksBySubject
    .filter((s) => s.average < 4.0 || s.twos > 0)
    .map((s) => s.subject);

  const today = dayStartUtc(new Date());
  let pending = 0;
  let overdue = 0;
  let completed = 0;
  for (const h of homeworks) {
    if (h.status === 'completed') completed += 1;
    else {
      pending += 1;
      if (h.deadline < today) overdue += 1;
    }
  }

  const weeklySchoolLoadHours: Record<number, number> = {};
  for (const item of schedule) {
    const [sh, sm] = item.startTime.split(':').map(Number);
    const [eh, em] = item.endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) continue;
    const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (hours <= 0 || hours > 12) continue;
    weeklySchoolLoadHours[item.dayOfWeek] = Math.round(
      ((weeklySchoolLoadHours[item.dayOfWeek] ?? 0) + hours) * 10
    ) / 10;
  }

  // Хронология изученных тем: темы оценок МЭШ (у них есть даты) за 30 дней
  const topicLast = new Map<string, { subject: string; topic: string; lastDate: string }>();
  const freshGaps: MeshAnalysisSlice['freshGaps'] = [];
  const twoWeeksAgo = isoDate(new Date(Date.now() - 14 * 86_400_000));
  for (const m of marks) {
    if (!m.topic) continue;
    const d = isoDate(m.testDate);
    const k = `${m.subject}::${m.topic}`;
    const prev = topicLast.get(k);
    if (!prev || d > prev.lastDate) topicLast.set(k, { subject: m.subject, topic: m.topic, lastDate: d });
    if (m.score <= 3 && d >= twoWeeksAgo) {
      freshGaps.push({ subject: m.subject, topic: m.topic, value: m.score, date: d });
    }
  }
  const schoolTopics = [...topicLast.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  // Текущие темы недели из расписания МЭШ (точка, где ученик остановился)
  const seenWeek = new Set<string>();
  const currentWeekTopics: MeshAnalysisSlice['currentWeekTopics'] = [];
  const weekSchedule = schedule
    .filter((s) => s.topic)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  for (const s of weekSchedule) {
    const k = `${s.dayOfWeek}::${s.subject}::${s.topic}`;
    if (seenWeek.has(k)) continue;
    seenWeek.add(k);
    currentWeekTopics.push({ subject: s.subject, topic: s.topic as string, dayOfWeek: s.dayOfWeek });
  }

  return {
    connected,
    marksBySubject,
    problemSubjects,
    homeworks: { total: homeworks.length, pending, overdue, completed },
    weeklySchoolLoadHours,
    schoolTopics,
    currentWeekTopics,
    freshGaps,
  };
}

function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function resolveGapPriority(
  topic: string,
  aiPriority?: string,
  statsCriticality?: 'low' | 'medium' | 'high'
): 'low' | 'medium' | 'high' {
  const normAi = aiPriority ? aiPriority.toLowerCase() : null;
  if (normAi === 'high' || normAi === 'medium' || normAi === 'low') {
    return normAi as 'low' | 'medium' | 'high';
  }

  const t = topic.toLowerCase();
  // Ошибки в первой части КИМ (№1–13 по математике, №1–26 по русскому) — базовые гарантированные баллы
  const isPart1 = /задани[ея]\s*(1[0-3]|[1-9])\b/i.test(t) || /задани[ея]\s*(2[0-6]|1[0-9]|[1-9])\b/i.test(t) || t.includes('часть 1') || t.includes('первая часть');
  // Сложнейшие задания повышенной сложности (параметры, теория чисел)
  const isHardPart2 = /параметр|теория чисел|свойства чисел|18|19|20|олимпиад/i.test(t);
  // Базовые задания части 2 (уравнения №14, неравенства №16, экономика)
  const isModeratePart2 = /задани[ея]\s*(1[4-7])\b|уравнени|неравенств|финансов/i.test(t);

  if (isPart1) return 'high';
  if (isHardPart2) return 'low';
  if (isModeratePart2) return 'medium';

  return statsCriticality ?? 'high';
}

function buildPriorityGaps(
  stats: Stats,
  aiGaps: AnalysisAiResult['gapReasons'],
  fallbackSubject: string,
  allowMeshWeakTopics = false,
  targetNames: string[] = []
): Array<{ subject: string; topic: string; criticality: 'low' | 'medium' | 'high'; reason: string }> {
  const byTopic = new Map(stats.gaps.map((g) => [g.topic.toLowerCase(), g]));
  const filteredAiGaps = allowMeshWeakTopics
    ? aiGaps
    : aiGaps.filter((g) => !g.topic.includes('МЭШ') && !g.reason.toLowerCase().includes('мэш') && !g.reason.toLowerCase().includes('школ'));

  const fromAi = filteredAiGaps
    .map((g) => {
      const known = byTopic.get(g.topic.toLowerCase());
      const criticality = resolveGapPriority(g.topic, g.priority, known?.criticality);
      return {
        subject: known?.subject ?? fallbackSubject,
        topic: g.topic,
        criticality,
        reason: g.reason,
      };
    })
    .filter((g) => targetNames.length === 0 || isSubjectMatchingTarget(g.subject, targetNames));

  const aiTopics = new Set(filteredAiGaps.map((g) => g.topic.toLowerCase()));
  const fromStats = stats.gaps
    .filter((g) => !aiTopics.has(g.topic.toLowerCase()) && (allowMeshWeakTopics || !g.topic.includes('МЭШ')))
    .filter((g) => targetNames.length === 0 || isSubjectMatchingTarget(g.subject, targetNames))
    .map((g) => ({
      subject: g.subject,
      topic: g.topic,
      criticality: resolveGapPriority(g.topic, undefined, g.criticality),
      reason: 'Тема повторяется в ошибках КИМ — включена в приоритетные пробелы',
    }));

  const rank = (c: 'low' | 'medium' | 'high') => (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
  return [...fromAi, ...fromStats]
    .sort((a, b) => rank(b.criticality) - rank(a.criticality))
    .slice(0, 6);
}

export interface ComplexAnalysis {
  burnoutRisk: {
    level: 'Низкий' | 'Средний' | 'Высокий';
    explanation: string;
  };
  pacingStatus: {
    status: 'Опережает график' | 'В графике' | 'Требуется ускорение';
    explanation: string;
  };
  priorityGaps: Array<{
    subject: string;
    topic: string;
    criticality: 'low' | 'medium' | 'high';
    reason: string;
  }>;
  mockExamAnalysis: string;
  actionableRecommendations: Array<{
    day: string;
    text: string;
  }>;
  subjectReadiness: Array<{
    subject: string;
    readinessPercent: number;
  }>;
  demoMode: boolean;
  notice?: string;
}

export async function performComplexAnalysis(userId: string): Promise<ComplexAnalysis> {
  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      targetSubjects: true,
      scheduleItems: true,
      homeworks: true,
      testResults: true,
      mockExams: true,
      weakTopics: true,
      studyPlanItems: true,
    },
  });

  if (!user) {
    throw new Error('Пользователь не найден');
  }

  const targetNames = user.targetSubjects.map((t) => t.subjectName);
  const targetSubjectsStr = targetNames.length > 0
    ? user.targetSubjects.map((t) => `${t.subjectName} (цель: ${t.targetScore} б.)`).join(', ')
    : 'не указаны';

  // Читаем реальные флаги настроек пользователя
  const isMeshMasterEnabled = Boolean(user.meshEnabled ?? user.profile?.meshIntegrationEnabled);
  const isScorePredictorEnabled = isMeshMasterEnabled && Boolean(user.meshScorePredictor ?? user.profile?.meshPredictorInfluenceEnabled);
  const isWeakTopicsEnabled = isMeshMasterEnabled && Boolean(user.meshWeakTopics ?? user.profile?.meshWeakTopicsEnabled);
  const isScheduleAdaptationEnabled = isMeshMasterEnabled && Boolean(user.meshScheduleAdaptation ?? user.profile?.meshScheduleThrottlingEnabled);

  // Build analysis stats с фильтрацией по флагам и целевым предметам
  const stats = computeStats(
    buildStatsInput(user, {
      isScorePredictorEnabled,
      isWeakTopicsEnabled,
      isScheduleAdaptationEnabled,
    })
  );

  // Prepare context and prompts for AI
  const context = JSON.stringify(stats, null, 2);
  let systemPrompt = SYS_ANALYSIS_STRICT_KIM;
  let userPrompt = `Статистика и контекст подготовки к ЕГЭ:\n\n${context}\n\nЦелевые предметы ученика: ${targetSubjectsStr}.\nРежим: СТРОГИЙ КИМ ФИПИ-2027. Интеграция с электронным дневником МЭШ полностью отключена. Анализируй результаты подготовки СТРОГО по спецификации ЕГЭ и ИСКЛЮЧИТЕЛЬНО по целевым предметам (${targetSubjectsStr}). Запрещено включать любые сторонние предметы в пробелы и рекомендации.`;

  if (isMeshMasterEnabled) {
    const mesh = await buildMeshSlice(userId);
    const meshContext = JSON.stringify(mesh, null, 2);
    systemPrompt = SYS_ANALYSIS;
    userPrompt = `Статистика и контекст:\n\n${context}\n\nЦелевые предметы ученика: ${targetSubjectsStr}.\nРеальные школьные данные из МЭШ (дневник):\n\n${meshContext}\nВсе приоритетные дефициты и рекомендации должны быть строго направлены на целевые предметы ученика.`;
  }

  // Send to AI
  const result = await chatJson<AnalysisAiResult>({
    user,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    schema: analysisAiSchema,
    mockType: 'analysis',
  });

  // Map to response format
  const fallbackSubject = user.targetSubjects[0]?.subjectName ?? 'Математика (профиль)';
  
  // Санитизация рекомендаций: исключаем рекомендации по нецелевым предметам
  const cleanRecommendations = result.data.recommendations.filter((rec) => {
    return !isTextReferringToNonTarget(rec.text, targetNames);
  });

  const analysis: ComplexAnalysis = {
    burnoutRisk: {
      level: stats.burnout.level,
      explanation: result.data.burnoutExplanation,
    },
    pacingStatus: {
      status: stats.pacing.status,
      explanation: result.data.pacingExplanation,
    },
    priorityGaps: buildPriorityGaps(stats, result.data.gapReasons, fallbackSubject, isWeakTopicsEnabled, targetNames),
    mockExamAnalysis: result.data.mockExamAnalysis,
    actionableRecommendations: cleanRecommendations,
    subjectReadiness: stats.readiness,
    demoMode: result.demoMode,
    notice: result.notice,
  };

  await prisma.aiAnalysisSnapshot.create({
    data: {
      userId: user.id,
      demoMode: analysis.demoMode,
      rawResponseJson: JSON.stringify(analysis),
    },
  });

  return analysis;
}
