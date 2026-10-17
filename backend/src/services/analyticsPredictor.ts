import { prisma } from '../lib/prisma.js';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher.js';

export interface TelemetryPredictorResult {
  predictor: {
    hasEnoughData: boolean;
    minScore: number | null;
    maxScore: number | null;
    estimatedScore: number | null;
    predictedScore: number | null;
    scoreRange?: string | null;
    confidencePercent: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    meshAveragePercent: number;
    recentMockScores: number[];
    weeksLeft: number;
  };
  burnout: {
    status: 'OPTIMAL' | 'OVERLOAD' | 'LOW';
    loadRatio: number;
    weeklyLessonHours: number;
    weeklyHomeworkHours: number;
    targetWeeklyCapacityHours: number;
    recommendation: string;
  };
}

export async function calculateTelemetryPredictor(userId: string): Promise<TelemetryPredictorResult> {
  const [user, profile, tests, mocks, scheduleItems, homeworks, targetSubjects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        meshEnabled: true,
        meshScorePredictor: true,
        meshScheduleAdaptation: true,
      },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.testResult.findMany({
      where: { userId },
      orderBy: { testDate: 'desc' },
      take: 20,
    }),
    prisma.mockExam.findMany({
      where: { userId },
      orderBy: { examDate: 'desc' },
      take: 5,
    }),
    prisma.scheduleItem.findMany({ where: { userId } }),
    prisma.homework.findMany({
      where: { userId, status: 'pending' },
    }),
    prisma.targetSubject.findMany({ where: { userId } }),
  ]);

  const isMeshMaster = Boolean(user?.meshEnabled ?? profile?.meshIntegrationEnabled);
  const useMeshInPredictor = isMeshMaster && Boolean(user?.meshScorePredictor ?? profile?.meshPredictorInfluenceEnabled);
  const useMeshSchedule = isMeshMaster && Boolean(user?.meshScheduleAdaptation ?? profile?.meshScheduleThrottlingEnabled);

  // 1. Расчет оставшихся недель до экзамена
  let weeksLeft = 12;
  const examDate = targetSubjects[0]?.examDate || profile?.prepEndDate;
  if (examDate) {
    const diffMs = new Date(examDate).getTime() - Date.now();
    const diffWeeks = Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
    weeksLeft = Math.min(52, diffWeeks);
  }

  const targetNames = targetSubjects.map((t) => t.subjectName);

  // 2. Средний процент успеваемости (КИМ или КИМ+МЭШ) строго по целевым предметам
  let relevantTests = useMeshInPredictor ? tests : tests.filter((t) => t.source !== 'mesh');
  if (targetNames.length > 0) {
    relevantTests = relevantTests.filter((t) => isSubjectMatchingTarget(t.subject, targetNames));
  }
  let meshAveragePercent = 74;
  if (relevantTests.length > 0) {
    const sum = relevantTests.reduce((acc, t) => acc + (t.normalizedPercent || 70), 0);
    meshAveragePercent = Math.round(sum / relevantTests.length);
  }

  // 3. Последние 3 пробника строго по целевым предметам
  const targetMocks = targetNames.length > 0
    ? mocks.filter((m) => isSubjectMatchingTarget(m.subject, targetNames))
    : mocks;
  const recentMockScores = targetMocks.slice(0, 3).map((m) => m.totalScore);

  // 4. Индикатор выгорания: если адаптация расписания включена — учитываем уроки МЭШ, иначе — только подготовка к ЕГЭ
  const relevantSchedule = useMeshSchedule ? scheduleItems : scheduleItems.filter((s) => s.source !== 'mesh');
  const relevantHomeworks = useMeshSchedule ? homeworks : homeworks.filter((h) => h.source !== 'mesh');

  // В расписании каждый урок ~45 мин (0.75 ч)
  const weeklyLessonHours = Math.round(relevantSchedule.length * 0.75 * 10) / 10 || (useMeshSchedule ? 22.5 : 8.0);
  // ДЗ: суммарно estimatedMinutes в неделю (или за все ожидающие)
  const totalHwMinutes = relevantHomeworks.reduce((acc, h) => acc + (h.estimatedMinutes || 30), 0);
  const weeklyHomeworkHours = Math.round((totalHwMinutes / 60) * 10) / 10 || (useMeshSchedule ? 8.0 : 3.0);

  // Емкость пользователя из профиля
  const weekdayHours = profile?.weekdayStudyHours || 2.5;
  const weekendHours = profile?.weekendStudyHours || 4.0;
  const targetWeeklyCapacityHours = Math.round((weekdayHours * 5 + weekendHours * 2) * 10) / 10 || 20.5;

  const totalLoadHours = weeklyLessonHours + weeklyHomeworkHours;
  const loadRatio = Math.round((totalLoadHours / (targetWeeklyCapacityHours + 18)) * 100) / 100;

  let burnoutStatus: 'OPTIMAL' | 'OVERLOAD' | 'LOW' = 'OPTIMAL';
  let recommendation = 'Текущий темп сбалансирован. Запланируй 1 вечер полного отдыха в воскресенье.';

  if (loadRatio > 1.15) {
    burnoutStatus = 'OVERLOAD';
    recommendation = 'Критическая перегрузка: сократи решение дополнительных тестов в будни. Фокусируйся только на слабых темах!';
  } else if (loadRatio < 0.75) {
    burnoutStatus = 'LOW';
    recommendation = 'Нагрузка ниже целевой. Есть запас для добавления 1-2 блиц-тренажеров в расписание.';
  }

  // Честный расчет достаточности данных: если у пользователя нет ни одного пробника и решено < 5 задач
  const hasMocks = mocks.length > 0;
  const solvedTasksCount = relevantTests.length;
  const hasEnoughData = hasMocks || solvedTasksCount >= 5;

  if (!hasEnoughData) {
    return {
      predictor: {
        hasEnoughData: false,
        minScore: null,
        maxScore: null,
        estimatedScore: null,
        predictedScore: null,
        scoreRange: null,
        confidencePercent: 0,
        trend: 'STABLE',
        meshAveragePercent: relevantTests.length > 0 ? meshAveragePercent : 0,
        recentMockScores: [],
        weeksLeft,
      },
      burnout: {
        status: burnoutStatus,
        loadRatio,
        weeklyLessonHours,
        weeklyHomeworkHours,
        targetWeeklyCapacityHours,
        recommendation,
      },
    };
  }

  // Динамика/тренд (только по реальным пробникам)
  let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
  if (recentMockScores.length >= 2) {
    const diff = recentMockScores[0] - recentMockScores[recentMockScores.length - 1];
    if (diff >= 3) trend = 'UP';
    else if (diff <= -3) trend = 'DOWN';
  }

  const latestMock = recentMockScores.length > 0
    ? recentMockScores[0]
    : (relevantTests[0]?.normalizedPercent || meshAveragePercent);
  const mockAverage = recentMockScores.length > 0
    ? recentMockScores.reduce((a, b) => a + b, 0) / recentMockScores.length
    : meshAveragePercent;

  // Предиктор итогового балла с доверительным интервалом
  // По умолчанию оценка строится строго на пробниках и задачах КИМ (50% последний, 50% средний).
  // Только если в настройках явно включена опция влияния МЭШ, подмешивается средний балл школы (вес 30%).
  const paceBonus = trend === 'UP' ? Math.min(6, Math.round(weeksLeft * 0.35)) : trend === 'DOWN' ? -2 : 2;
  const baseEstimated = useMeshInPredictor
    ? Math.round(latestMock * 0.35 + mockAverage * 0.35 + meshAveragePercent * 0.3 + paceBonus)
    : Math.round(latestMock * 0.5 + mockAverage * 0.5 + paceBonus);
  const estimatedScore = Math.min(98, Math.max(40, baseEstimated));
  
  // Доверительный интервал
  const spread = trend === 'UP' ? 3 : 4;
  const minScore = Math.max(40, estimatedScore - spread);
  const maxScore = Math.min(100, estimatedScore + spread);
  const confidencePercent = relevantTests.length >= 5 && mocks.length >= 2 ? 88 : 76;

  return {
    predictor: {
      hasEnoughData: true,
      minScore,
      maxScore,
      estimatedScore,
      predictedScore: estimatedScore,
      scoreRange: `${minScore}–${maxScore}`,
      confidencePercent,
      trend,
      meshAveragePercent,
      recentMockScores,
      weeksLeft,
    },
    burnout: {
      status: burnoutStatus,
      loadRatio,
      weeklyLessonHours,
      weeklyHomeworkHours,
      targetWeeklyCapacityHours,
      recommendation,
    },
  };
}
