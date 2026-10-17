// Общие типы API и доменные типы фронтенда.

export type SubscriptionTier = 'FREE' | 'PRO';
export type Priority = 'low' | 'medium' | 'high';
export type HomeworkStatus = 'pending' | 'completed';
export type ScaleType = '5_point' | '10_point' | '100_point' | 'raw_fraction';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  googleId?: string | null;
  subscriptionTier: SubscriptionTier;
  isDemo: boolean;
  proExpiresAt?: string | null;
  selectedAiModel?: string;
  trafficUsedPercent?: number;
  freeAiRequestsLeft?: number;
  xp?: number;
  level?: number;
  onboardingCompleted?: boolean;
  role?: string;
  grade?: number | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface TargetSubject {
  id?: string;
  subjectName: string;
  targetScore: number;
  currentEstimatedScore?: number;
  examDate?: string;
}

export interface Profile {
  id?: string;
  userId?: string;
  email?: string;
  authProvider?: string;
  googleId?: string | null;
  telegramId?: string | null;
  telegramUsername?: string | null;
  isBanned?: boolean;
  banReason?: string | null;
  grade: number;
  track: string;
  prepStartDate: string;
  prepEndDate: string;
  prepMode: string;
  pace: string;
  weekdayStudyHours: number;
  weekendStudyHours: number;
  notes: string;
  remainingDays?: number;
  remainingWeeks?: number;
  targetSubjects: TargetSubject[];
  selectedAiModel: string;
  role?: 'student' | 'tutor' | 'teacher';
  targetTrack?: 'BASE_65' | 'SOLID_85' | 'OLYMP_95';
  meshIntegrationEnabled?: boolean;
  meshAiContextEnabled?: boolean;
  meshWeakTopicsEnabled?: boolean;
  meshPredictorInfluenceEnabled?: boolean;
  meshScheduleThrottlingEnabled?: boolean;
  xp?: number;
  level?: number;
  gamification?: GamificationTelemetry;
  onboardingCompleted?: boolean;
}

export interface GamificationTelemetry {
  xp: number;
  level: number;
  currentLevelXp: number;
  xpRequiredForLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
  status: string;
}

export interface MeshPrepSettings {
  meshIntegrationEnabled: boolean;
  meshAiContextEnabled: boolean;
  meshWeakTopicsEnabled: boolean;
  meshPredictorInfluenceEnabled: boolean;
  meshScheduleThrottlingEnabled: boolean;
  // Короткие псевдонимы (User model)
  meshEnabled?: boolean;
  meshChatContext?: boolean;
  meshWeakTopics?: boolean;
  meshScorePredictor?: boolean;
  meshScheduleAdaptation?: boolean;
  notificationsEnabled?: boolean;
}

export interface ScheduleItem {
  id: string;
  userId?: string;
  dayOfWeek: number;
  subject: string;
  originalMeshName?: string | null;
  topic?: string | null;
  startTime: string;
  endTime: string;
}

export interface ScheduleItemInput {
  dayOfWeek: number;
  subject: string;
  originalMeshName?: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleLoad {
  loads: Array<{ day: number; hours: number }>;
}

export interface Homework {
  id: string;
  userId?: string;
  subject: string;
  title: string;
  description?: string | null;
  deadline: string;
  estimatedMinutes: number;
  priority: Priority;
  status: HomeworkStatus;
  source: string;
  meshAttachments?: string | null;
  hasAttachment: boolean;
  attachmentPath?: string | null;
  detectedTopics?: string | null;
  aiHint?: string | null;
  aiExplanation?: string | null;
}

export interface HomeworkInput {
  subject: string;
  title: string;
  description?: string;
  deadline: string;
  estimatedMinutes?: number;
  priority?: Priority;
  status?: HomeworkStatus;
}

export interface ParsedHomeworkItem {
  subject: string;
  title: string;
  description?: string;
  deadline: string;
  estimatedMinutes?: number;
  priority?: Priority;
  hasAttachment?: boolean;
}

export interface TestResult {
  id: string;
  userId?: string;
  subject: string;
  title: string;
  scaleType: ScaleType;
  score: number;
  maxScore: number;
  normalizedPercent: number;
  testDate: string;
  source: string;
  mistakeTopics?: string | null;
  comment?: string | null;
  photoPath?: string | null;
}
export interface TestInput {
  subject: string;
  title: string;
  scaleType: ScaleType;
  score: number;
  maxScore: number;
  testDate: string;
  mistakeTopics?: string[];
  comment?: string;
}

export interface MockExam {
  id: string;
  userId?: string;
  subject: string;
  examDate: string;
  totalScore: number;
  primaryScore?: number | null;
  missedTasks?: string | null;
  mistakeTopics?: string | null;
  deltaScore?: number | null;
  aiVerdict?: string | null;
  source?: string;
  timeSpentSeconds?: number | null;
}

export interface MockExamInput {
  subject: string;
  examDate: string;
  totalScore: number;
  primaryScore?: number;
  missedTasks?: string[];
  mistakeTopics?: string[];
  aiVerdict?: string;
  source?: string;
  timeSpentSeconds?: number;
}

export interface MockExamVerdict {
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  chronicTasks: string[];
  chronicTopics: string[];
  demoMode?: boolean;
  notice?: string;
}

export interface WeakTopic {
  id: string;
  userId?: string;
  subject: string;
  topicName: string;
  frequency: number;
  lastFailedDate: string;
  isResolved: boolean;
  masteryLevel: number;
  lastTestedAt?: string | null;
}

export interface Flashcard {
  id: string;
  userId: string;
  subject: string;
  topic: string;
  frontText: string;
  backText: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: string;
  createdAt: string;
}

export interface FlashcardReviewInput {
  rating: number; // 1 - 5
}

export interface ExamSimulation {
  id: string;
  userId: string;
  subject: string;
  variantNumber: number;
  targetScore: number;
  actualScore?: number | null;
  timeSpentSeconds: number;
  answers: string; // JSON string of Record<string, string>
  feedback?: string | null; // JSON string
  status: 'COMPLETED' | 'IN_PROGRESS';
  createdAt: string;
}

export interface ExamSimulationInput {
  subject: string;
  variantNumber?: number;
  targetScore: number;
  actualScore?: number;
  timeSpentSeconds: number;
  answers: Record<string, string>;
  feedback?: string;
  status?: 'COMPLETED' | 'IN_PROGRESS';
}

export interface ExamTaskItem {
  taskNumber: number;          // 1..27
  fipiId: string;              // ID задачи с РешуЕГЭ/ФИПИ
  topic: string;               // Название темы/линии задания
  statement: string;           // Чистый текст условия (без методичек и рекламы)
  imageUrl?: string;           // Ссылка на схему/график/чертеж, если есть
  correctAnswer?: string;      // Ключ/ответ для автопроверки части 1
  solutionCriteria?: string;   // Эталонное решение и критерии для части 2
  maxScore: number;            // Первичный балл (1, 2, 3...)
  type: 'SHORT' | 'DETAILED';

  // Legacy aliases для обратной совместимости
  id?: number;
  part?: 1 | 2;
  number?: number;
  title?: string;
  text?: string;
  fipiCriteria?: string;
}

export type ExamTask = ExamTaskItem;

export interface ExamVariant {
  id: string;
  subject: string;
  subjectName: string;
  variantNumber: number;
  variantCode?: string;
  title: string;
  timeLimitSeconds: number;
  totalTasks: number;
  part1Count: number;
  part2Count: number;
  maxPrimaryScore?: number;
  tasks: ExamTaskItem[];
}

export interface TrainerQuizQuestion {
  id: string;
  question: string;
  options?: string[] | null;
  correctAnswer: string;
  explanation: string;
  fipiCriteria?: string;
}

export interface TrainerGenerateResponse {
  subject: string;
  topic: string;
  questions: TrainerQuizQuestion[];
  demoMode?: boolean;
}

export interface TrainerVerifyResult {
  isCorrect: boolean;
  socraticFeedback: string;
  newMasteryLevel: number;
  hint?: string;
  correctAnswer: string;
  xpAwarded?: number;
  gamification?: GamificationTelemetry;
}

export interface FipiErrorItem {
  type: 'logic' | 'computation' | 'notation' | 'criteria';
  description: string;
  quote?: string;
  recommendation: string;
}

export interface FipiCheckResult {
  primaryScore: number;
  maxScore: number;
  k1Score: number;
  k1Max: number;
  k1Comment: string;
  k2Score: number;
  k2Max: number;
  k2Comment: string;
  errors: FipiErrorItem[];
  expertVerdict: string;
  demoMode?: boolean;
}

export interface SosFormula {
  title: string;
  latex: string;
  note: string;
}

export interface SosPitfall {
  title: string;
  explanation: string;
}

export interface SosAlgorithmStep {
  step: number;
  instruction: string;
}

export interface SosSummary {
  subject: string;
  topic: string;
  formulas: SosFormula[];
  pitfalls: SosPitfall[];
  algorithm: SosAlgorithmStep[];
  demoMode?: boolean;
}

export interface AnalyticsTelemetry {
  predictor: {
    hasEnoughData?: boolean;
    minScore: number | null;
    maxScore: number | null;
    estimatedScore: number | null;
    predictedScore?: number | null;
    scoreRange?: string | null;
    confidencePercent: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    meshAveragePercent: number;
    recentMockScores: number[];
    weeksLeft: number;
  };
  burnout: {
    status: 'OPTIMAL' | 'OVERLOAD' | 'LOW';
    loadRatio: number; // e.g. 0.85
    weeklyLessonHours: number;
    weeklyHomeworkHours: number;
    targetWeeklyCapacityHours: number;
    recommendation: string;
  };
}


export interface StudyMaterial {
  id: string;
  userId?: string;
  subject: string;
  topicName: string;
  summaryTheory: string;
  formulas?: string | null;
  /** SVG-картинка формул на фоне вкладки (data URI). */
  formulasImage?: string | null;
  pitfalls?: string | null;
  algorithm?: string | null;
  reshuEgeUrl?: string | null;
  fipiUrl?: string | null;
  videoQuery?: string | null;
  createdAt?: string;
}

export interface MaterialGenerationResult {
  material: StudyMaterial;
  cached: boolean;
  demoMode?: boolean;
  notice?: string;
}

export interface PlanItem {
  id: string;
  targetDate: string;
  subject: string;
  topic: string;
  kind: string;
  durationMinutes: number;
  priority: Priority;
  isCompleted: boolean;
}

export interface PlanProgress {
  total: number;
  completed: number;
  percent: number;
}

export interface PlanResponse {
  items: PlanItem[];
  progress: PlanProgress;
  demoMode?: boolean;
  notice?: string;
}

export interface ComplexAnalysis {
  pacingStatus: { status: string; explanation: string };
  priorityGaps: Array<{
    subject: string;
    topic: string;
    criticality: string;
    reason: string;
  }>;
  mockExamAnalysis: string;
  actionableRecommendations: Array<{ day: string; text: string }>;
  subjectReadiness: Array<{ subject: string; readinessPercent: number }>;
  demoMode?: boolean;
  notice?: string;
}

export interface AnalysisResult {
  analysis: ComplexAnalysis;
  demoMode?: boolean;
  notice?: string;
}

export interface LatestAnalysisResult {
  analysis: ComplexAnalysis;
  createdAt: string;
  demoMode?: boolean;
}

export interface DashboardSummary {
  daysUntilExam: number;
  planProgress: number;
  todayLoad: {
    hours: number;
    lessons: number;
    lessonsList: Array<{
      subject: string;
      startTime: string;
      endTime: string;
      topic: string | null;
      source: string;
    }>;
  };
  upcomingDeadlines: Array<{
    id: string;
    subject: string;
    title: string;
    deadline: string;
  }>;
  mockExamAverage: { average: number; target: number; count: number };
  criticalGaps: Array<{ subject: string; topic: string; criticality: string }>;
  nextPlanSlot: {
    id?: string;
    date: string;
    subject: string;
    topic: string;
    duration: number;
  } | null;
  aiAdvice: string[];
  activityTimeline?: Record<string, { count: number; details: string[] }>;
  role?: 'student' | 'tutor' | 'teacher';
  targetTrack?: 'BASE_65' | 'SOLID_85' | 'OLYMP_95';
  pureStudyTime?: {
    seconds: number;
    hours: number;
    formatted: string;
  };
  targetSubjectScores?: Array<{
    id: string;
    subjectName: string;
    targetScore: number;
    currentEstimatedScore: number | null;
    mockCount: number;
    latestScore: number | null;
    avgScore: number | null;
    bestScore: number | null;
    confirmedScore: number;
  }>;
  admissionTotalScore?: number;
  targetSubjectsTotal?: number;
}

// Соответствует PublicModel в backend/src/config/models.ts
export interface AiModel {
  slug: string;
  label: string;
  description: string;
  speed: number;
  economy: number;
  power: number;
  vision: boolean;
  recommended: boolean;
  approxRequests: number;
}

export interface ModelsResult {
  models: AiModel[];
  currentModel?: string;
  tier?: SubscriptionTier;
}


export interface MeshStatus {
  connected: boolean;
  connectedAt: string | null;
  tokenMasked: string | null;
}

/* Дневник МЭШ: данные, собираемые MeshDiaryService на бэкенде */

export interface MeshStudentInfo {
  studentId: string;
  name: string | null;
  className: string | null;
}

export interface MeshLesson {
  start: string;
  end: string | null;
  subject: string;
  topic: string | null;
  room: string | null;
  teacher: string | null;
}

export interface MeshAttachment {
  name: string;
  url: string | null;
  kind: 'file' | 'test' | 'material';
  action: string | null;
}

export interface MeshHomework {
  subject: string;
  description: string;
  deadline: string | null;
  attachments: MeshAttachment[];
  done?: boolean;
}

export interface MeshMark {
  subject: string;
  value: number;
  weight: number;
  topic: string | null;
  date: string | null;
}

export interface MeshSubjectGroup {
  subject: string;
  average: number;
  marks: MeshMark[];
}

export interface MeshDiagnostic {
  testId: string;
  subject: string;
  date: string | null;
  score: number | null;
  percent: number | null;
  status: string | null;
  reportUrl: string | null;
}

export interface MeshDiarySync {
  syncedAt: string;
  student: MeshStudentInfo | null;
  scheduleDate: string;
  schedule: MeshLesson[];
  homeworks: MeshHomework[];
  marks: MeshSubjectGroup[];
  diagnostics: MeshDiagnostic[];
  counts: {
    lessons: number;
    homeworks: number;
    marks: number;
    subjects: number;
    diagnostics: number;
  };
  errors: string[];
  persisted?: {
    homeworks: { created: number; updated: number };
    marks: { created: number; skipped: number };
    lessons: { replaced: number };
    weakTopics: { upserted: number };
  } | null;
}

export interface MeshExplainResult {
  topic: string;
  egePrototype: string | null;
  steps: string[];
  formulas: string;
  sourceName: string;
  demoMode: boolean;
  notice?: string;
}

export interface MeshExplainInput {
  subject?: string;
  description?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface MistakeEntry {
  id: string;
  userId: string;
  subject: string;
  taskNumber: number;
  fipiId?: string | null;
  statement: string;
  userAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
  status: 'UNRESOLVED' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AssignedWork {
  id: string;
  tutorId: string;
  studentId: string;
  title: string;
  subject: string;
  variantData: string;
  deadline: string;
  status: 'ASSIGNED' | 'SUBMITTED' | 'GRADED';
  score?: number | null;
  tutorFeedback?: string | null;
  studentAnswers?: string | null;
  createdAt: string;
  updatedAt: string;
  tutor?: { id: string; name: string };
  student?: { id: string; name: string; email: string };
}

export interface TutorStudent {
  linkId: string;
  studentId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  targetTrack?: string;
  grade: number;
  latestMockScore?: number | null;
  targetScore: number;
  pendingHomeworkCount: number;
  status: string;
  recentAssigned?: AssignedWork[];
}
