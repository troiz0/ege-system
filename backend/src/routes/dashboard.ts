import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { differenceInDays } from 'date-fns';
import { isSubjectMatchingTarget, isTextReferringToNonTarget } from '../lib/subjectMatcher';

const router = Router();

// GET /api/dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Get profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
    });

    // Get target subjects
    const targetSubjects = await prisma.targetSubject.findMany({
      where: { userId: user.id },
    });

    // Days to exam
    let daysToExam: number | null = null;
    if (profile?.prepEndDate) {
      daysToExam = Math.max(0, differenceInDays(profile.prepEndDate, new Date()));
    } else if (targetSubjects.length > 0 && targetSubjects[0].examDate) {
      daysToExam = Math.max(0, differenceInDays(targetSubjects[0].examDate, new Date()));
    }

    // Plan progress
    const planItems = await prisma.studyPlanItem.findMany({
      where: { userId: user.id },
    });
    const totalPlanItems = planItems.length;
    const completedPlanItems = planItems.filter((item) => item.isCompleted).length;
    const planProgressPercent = totalPlanItems > 0 ? Math.round((completedPlanItems / totalPlanItems) * 100) : 0;

    // Today's schedule load
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const todaySchedule = await prisma.scheduleItem.findMany({
      where: {
        userId: user.id,
        dayOfWeek: today === 0 ? 6 : today, // Convert Sunday to 6
      },
    });
    const todayLoadHours = todaySchedule.reduce((sum, item) => {
      const [startH, startM] = item.startTime.split(':').map(Number);
      const [endH, endM] = item.endTime.split(':').map(Number);
      const hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
      return sum + hours;
    }, 0);

    // Nearest deadlines (next 3)
    const upcomingHomework = await prisma.homework.findMany({
      where: {
        userId: user.id,
        status: 'pending',
        deadline: { gte: new Date() },
      },
      orderBy: { deadline: 'asc' },
      take: 3,
    });

    // Average mock exam score vs target
    const mockExams = await prisma.mockExam.findMany({
      where: { userId: user.id },
      orderBy: { examDate: 'desc' },
    });
    
    let avgMockScore: number | null = null;
    let targetScore: number | null = null;
    
    const targetSubjectNames = targetSubjects.map((t) => t.subjectName);

    // Детальный расчет баллов по ВСЕМ пробникам целевых предметов (любые предметы ученика)
    const targetSubjectScores = targetSubjects.map((ts) => {
      const subjectMocks = mockExams.filter((m) => isSubjectMatchingTarget(m.subject, [ts.subjectName]));
      const mockCount = subjectMocks.length;
      const latestScore = mockCount > 0 ? subjectMocks[0].totalScore : null;
      const avgScore = mockCount > 0 ? Math.round(subjectMocks.reduce((s, m) => s + m.totalScore, 0) / mockCount) : null;
      const bestScore = mockCount > 0 ? Math.max(...subjectMocks.map((m) => m.totalScore)) : null;
      const confirmedScore = latestScore ?? ts.currentEstimatedScore ?? 0;

      return {
        id: ts.id,
        subjectName: ts.subjectName,
        targetScore: ts.targetScore,
        currentEstimatedScore: ts.currentEstimatedScore,
        mockCount,
        latestScore,
        avgScore,
        bestScore,
        confirmedScore,
      };
    });

    if (mockExams.length > 0 && targetSubjects.length > 0) {
      // Group by subject and get latest (только по целевым предметам)
      const targetMocks = mockExams.filter((m) => isSubjectMatchingTarget(m.subject, targetSubjectNames));
      if (targetMocks.length > 0) {
        const latestBySubject: Record<string, number> = {};
        targetMocks.forEach((exam) => {
          if (!latestBySubject[exam.subject]) {
            latestBySubject[exam.subject] = exam.totalScore;
          }
        });
        
        const scores = Object.values(latestBySubject);
        avgMockScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
        
        // Average target
        targetScore = Math.round(
          targetSubjects.reduce((sum, s) => sum + s.targetScore, 0) / targetSubjects.length
        );
      }
    }

    const sortedScores = [...targetSubjectScores].sort((a, b) => b.confirmedScore - a.confirmedScore);
    const admissionTriad = sortedScores.slice(0, 3);
    const admissionTotalScore = admissionTriad.length >= 3
      ? admissionTriad.reduce((sum, item) => sum + item.confirmedScore, 0)
      : admissionTriad.length > 0
      ? Math.round(admissionTriad.reduce((sum, item) => sum + item.confirmedScore, 0) * (3 / admissionTriad.length))
      : (avgMockScore ? avgMockScore * 3 : 0);

    const targetSubjectsTotal = targetSubjectScores.reduce((sum, item) => sum + item.confirmedScore, 0);

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, targetTrack: true },
    });
    const targetTrack = dbUser?.targetTrack || 'SOLID_85';
    const userRole = dbUser?.role || 'student';

    // Top 3 critical gaps (weak topics with highest frequency, filtered by track AND target subjects)
    let criticalGaps = await prisma.weakTopic.findMany({
      where: {
        userId: user.id,
        isResolved: false,
      },
      orderBy: { frequency: 'desc' },
      take: 50,
    });

    // Фильтруем общие форматы школьных работ (Практическая работа, Контрольная работа, ЦДЗ и т.п.)
    const GENERIC_FORMAT_REGEX = /^(практическая работа|контрольная работа|цдз|самостоятельная работа|лабораторная работа|проверочная работа|диагностическая работа|тест|зачет|школьная успеваемость|ответ на уроке|домашнее задание|работа на уроке|тестирование|урок \d+)/i;
    criticalGaps = criticalGaps.filter((g) => !GENERIC_FORMAT_REGEX.test(g.topicName.trim()));

    // Строго исключаем нецелевые предметы
    if (targetSubjectNames.length > 0) {
      criticalGaps = criticalGaps.filter((g) => isSubjectMatchingTarget(g.subject, targetSubjectNames));
    }

    if (targetTrack === 'BASE_65') {
      criticalGaps = criticalGaps.filter(
        (g) => !/параметр|стереометр|чисел|теория чисел|уравнения высших степеней/i.test(g.topicName)
      );
    }
    criticalGaps = criticalGaps.slice(0, 3);

    // Расчет чистого времени подготовки на платформе (секунды в пробниках и симуляциях)
    const [allMocks, allSims] = await Promise.all([
      prisma.mockExam.findMany({
        where: { userId: user.id },
        select: { timeSpentSeconds: true },
      }),
      prisma.examSimulation.findMany({
        where: { userId: user.id },
        select: { timeSpentSeconds: true },
      }),
    ]);

    const pureStudySeconds =
      allMocks.reduce((sum, m) => sum + (m.timeSpentSeconds || 0), 0) +
      allSims.reduce((sum, s) => sum + (s.timeSpentSeconds || 0), 0);
    const pureStudyHours = Math.round((pureStudySeconds / 3600) * 10) / 10;

    // Next study plan slot (строго по целевым предметам)
    const nextPlanSlot = await prisma.studyPlanItem.findFirst({
      where: {
        userId: user.id,
        isCompleted: false,
        targetDate: { gte: new Date() },
        ...(targetSubjectNames.length > 0 ? { subject: { in: targetSubjectNames } } : {}),
      },
      orderBy: { targetDate: 'asc' },
    });

    // Short tips from latest analysis (санитизация: только целевые предметы)
    const latestAnalysis = await prisma.aiAnalysisSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    
    let tips: string[] = [];
    if (latestAnalysis) {
      try {
        const analysis = JSON.parse(latestAnalysis.rawResponseJson) as {
          actionableRecommendations?: Array<string | { text?: string; day?: string }>;
        };
        const recs = analysis.actionableRecommendations;
        if (Array.isArray(recs)) {
          tips = recs
            .map((rec) => (typeof rec === 'string' ? rec : rec.text ?? ''))
            .filter((text): text is string => Boolean(text))
            .filter((text) => !isTextReferringToNonTarget(text, targetSubjectNames))
            .slice(0, 3);
        }
      } catch (e) {
        console.warn('Failed to parse analysis JSON:', e);
      }
    }

    // Реальная активность пользователя за 91 день (для виджета стрика платформы, исключая школьные оценки МЭШ)
    const ninetyOneDaysAgo = new Date();
    ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91);
    ninetyOneDaysAgo.setHours(0, 0, 0, 0);

    const [recentMocks, recentTests, recentHomeworks, recentMaterials, recentSimulations, recentFlashcards, recentChatMessages] = await Promise.all([
      prisma.mockExam.findMany({
        where: { userId: user.id, examDate: { gte: ninetyOneDaysAgo } },
        select: { examDate: true, subject: true, totalScore: true },
      }),
      prisma.testResult.findMany({
        where: { userId: user.id, source: { not: 'mesh' }, testDate: { gte: ninetyOneDaysAgo } },
        select: { testDate: true, subject: true, score: true, title: true },
      }),
      prisma.homework.findMany({
        where: { userId: user.id, status: 'completed', source: { not: 'mesh' }, createdAt: { gte: ninetyOneDaysAgo } },
        select: { createdAt: true, subject: true, title: true },
      }),
      prisma.topicStudyMaterial.findMany({
        where: { userId: user.id, createdAt: { gte: ninetyOneDaysAgo } },
        select: { createdAt: true, subject: true, topicName: true },
      }),
      prisma.examSimulation.findMany({
        where: { userId: user.id, createdAt: { gte: ninetyOneDaysAgo } },
        select: { createdAt: true, subject: true, actualScore: true },
      }),
      prisma.flashcard.findMany({
        where: { userId: user.id, createdAt: { gte: ninetyOneDaysAgo } },
        select: { createdAt: true, subject: true },
      }),
      prisma.chatMessage.findMany({
        where: { role: 'user', createdAt: { gte: ninetyOneDaysAgo }, session: { userId: user.id } },
        select: { createdAt: true },
      }),
    ]);

    const activityByDate: Record<string, { count: number; details: string[] }> = {};
    const addActivity = (d: Date, detail: string) => {
      const key = d.toISOString().split('T')[0];
      if (!activityByDate[key]) activityByDate[key] = { count: 0, details: [] };
      activityByDate[key].count += 1;
      activityByDate[key].details.push(detail);
    };

    recentMocks.forEach((m) => addActivity(m.examDate, `Пробник: ${m.subject} (${m.totalScore} б.)`));
    recentSimulations.forEach((s) => addActivity(s.createdAt, `Симуляция КИМ: ${s.subject}`));
    recentTests.forEach((t) => addActivity(t.testDate, `Тест: ${t.subject} (${t.title || t.score})`));
    recentHomeworks.forEach((h) => addActivity(h.createdAt, `ДЗ на платформе: ${h.subject}`));
    recentMaterials.forEach((mat) => addActivity(mat.createdAt, `Конспект: ${mat.topicName}`));
    recentFlashcards.forEach((f) => addActivity(f.createdAt, `Флеш-карта: ${f.subject}`));
    recentChatMessages.forEach((c) => addActivity(c.createdAt, `Вопрос AI-тьютору`));

    return res.json({
      daysToExam,
      planProgress: {
        total: totalPlanItems,
        completed: completedPlanItems,
        percent: planProgressPercent,
      },
      todayLoad: {
        hours: Math.round(todayLoadHours * 10) / 10,
        classes: todaySchedule.length,
        lessons: todaySchedule.map((item) => ({
          subject: item.subject,
          startTime: item.startTime,
          endTime: item.endTime,
          topic: item.topic,
          source: item.source,
        })),
      },
      upcomingDeadlines: upcomingHomework.map((hw) => ({
        id: hw.id,
        subject: hw.subject,
        title: hw.title,
        deadline: hw.deadline,
        priority: hw.priority,
      })),
      mockExamStats: {
        avgScore: avgMockScore,
        targetScore,
        delta: avgMockScore !== null && targetScore !== null ? avgMockScore - targetScore : null,
        count: mockExams.length,
      },
      criticalGaps: criticalGaps.map((gap) => ({
        id: gap.id,
        subject: gap.subject,
        topic: gap.topicName,
        frequency: gap.frequency,
      })),
      nextPlanSlot: nextPlanSlot ? {
        id: nextPlanSlot.id,
        date: nextPlanSlot.targetDate,
        subject: nextPlanSlot.subject,
        topic: nextPlanSlot.topic,
        duration: nextPlanSlot.durationMinutes,
      } : null,
      tips,
      activityTimeline: activityByDate,
      role: userRole,
      targetTrack,
      pureStudyTime: {
        seconds: pureStudySeconds,
        hours: pureStudyHours,
        formatted: `${Math.floor(pureStudySeconds / 3600)} ч ${Math.floor((pureStudySeconds % 3600) / 60)} мин`,
      },
      targetSubjectScores,
      admissionTotalScore: Math.min(300, admissionTotalScore),
      targetSubjectsTotal,
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки дашборда' });
  }
});

export default router;
