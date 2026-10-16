import { prisma } from '../lib/prisma';
import { buildPlan, type PlanInput, type Pace, type PrepMode } from './planner';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher';

const HORIZON_DAYS: Record<PrepMode, number> = {
  extended: 45,
  full_year: 45,
  accelerated_6m: 30,
  express_1m: 14,
};

export interface GeneratedPlan {
  demoMode: boolean;
  notice?: string;
  count: number;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export async function generateStudyPlan(userId: string): Promise<GeneratedPlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      targetSubjects: true,
      weakTopics: true,
    },
  });

  if (!user) {
    throw new Error('Пользователь не найден');
  }

  if (user.targetSubjects.length === 0) {
    return {
      demoMode: false,
      notice: 'Добавьте целевые предметы в профиле, чтобы построить план',
      count: 0,
    };
  }

  const mode = (user.profile?.prepMode ?? 'full_year') as PrepMode;
  const pace = (user.profile?.pace ?? 'moderate') as Pace;

  const isMeshMaster = Boolean(user.meshEnabled ?? user.profile?.meshIntegrationEnabled);
  const throttleBySchedule = isMeshMaster && Boolean(
    user.meshScheduleAdaptation ?? user.profile?.meshScheduleThrottlingEnabled
  );
  const allowMeshWeakTopics = isMeshMaster && Boolean(
    user.meshWeakTopics ?? user.profile?.meshWeakTopicsEnabled
  );

  let lessonsByDow: Record<number, number> | undefined = undefined;
  if (throttleBySchedule) {
    const items = await prisma.scheduleItem.findMany({ where: { userId } });
    if (items.length > 0) {
      lessonsByDow = {};
      for (const item of items) {
        lessonsByDow[item.dayOfWeek] = (lessonsByDow[item.dayOfWeek] ?? 0) + 1;
      }
    }
  }

  const targetNames = user.targetSubjects.map((t) => t.subjectName);

  const input: PlanInput = {
    startDate: isoDate(new Date()),
    days: HORIZON_DAYS[mode],
    mode,
    pace,
    weekdayHours: user.profile?.weekdayStudyHours ?? 2,
    weekendHours: user.profile?.weekendStudyHours ?? 4,
    lessonsByDow,
    throttleBySchedule,
    subjects: user.targetSubjects.map((t) => ({
      name: t.subjectName,
      target: t.targetScore,
      current: t.currentEstimatedScore,
    })),
    weakTopics: user.weakTopics
      .filter((w) => !w.isResolved && isSubjectMatchingTarget(w.subject, targetNames) && (allowMeshWeakTopics || !w.topicName.startsWith('[МЭШ]')))
      .map((w) => ({
        subject: w.subject,
        topic: w.topicName,
        frequency: w.frequency,
      })),
  };

  const slots = buildPlan(input);

  await prisma.studyPlanItem.deleteMany({ where: { userId } });

  for (const slot of slots) {
    await prisma.studyPlanItem.create({
      data: {
        userId,
        targetDate: new Date(`${slot.date}T00:00:00Z`),
        subject: slot.subject,
        topic: slot.topic,
        kind: slot.kind,
        durationMinutes: slot.durationMinutes,
        priority: slot.priority,
      },
    });
  }

  return { demoMode: false, count: slots.length };
}
