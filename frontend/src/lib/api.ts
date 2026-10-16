import type {
  AnalysisResult,
  AuthResponse,
  AuthUser,
  DashboardSummary,
  MeshDiagnostic,
  MeshDiarySync,
  MeshExplainInput,
  MeshExplainResult,
  MeshHomework,
  MeshLesson,
  MeshStatus,
  MeshSubjectGroup,
  Homework,
  HomeworkInput,
  LatestAnalysisResult,
  MaterialGenerationResult,
  MockExam,
  MockExamInput,
  MockExamVerdict,
  ModelsResult,
  PlanResponse,
  Profile,
  ParsedHomeworkItem,
  ScheduleItem,
  ScheduleItemInput,
  ScheduleLoad,
  StudyMaterial,
  TargetSubject,
  TestInput,
  TestResult,
  WeakTopic,
  Flashcard,
  ExamSimulation,
  ExamSimulationInput,
  TrainerGenerateResponse,
  TrainerVerifyResult,
  FipiCheckResult,
  SosSummary,
  AnalyticsTelemetry,
  ExamVariant,
  ExamTask,
  MistakeEntry,
  AssignedWork,
  TutorStudent,
} from './types';

// '' (сборка для хостинга) => относительные /api-запросы к тому же origin
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ApiError {
  error: string;
  details?: unknown;
}

interface ParsedScheduleResult {
  items: ScheduleItemInput[];
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: HeadersInit = isFormData
      ? { ...options.headers }
      : {
          'Content-Type': 'application/json',
          ...options.headers,
        };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'Произошла ошибка',
        }));
        throw new Error(error.error);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Ошибка сети');
    }
  }

  // Auth
  async register(email: string, password: string, name: string) {
    return this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  async login(email: string, password: string) {
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async googleAuth(credential: string) {
    return this.request<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
  }

  async loginDemo() {
    return this.request<AuthResponse>('/api/auth/demo', {
      method: 'POST',
    });
  }

  async logout() {
    return this.request<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  }

  async getMe() {
    return this.request<{ user: AuthUser }>('/api/auth/me');
  }

  // Profile
  async getProfile() {
    const data = await this.request<{
      profile: Partial<Profile>;
      targetSubjects?: TargetSubject[];
      selectedAiModel?: string;
    }>('/api/profile');

    const p = data.profile ?? {};
    return {
      ...p,
      grade: p.grade ?? 10,
      track: p.track ?? '',
      prepStartDate: p.prepStartDate ?? '',
      prepEndDate: p.prepEndDate ?? '',
      prepMode: p.prepMode ?? 'full_year',
      pace: p.pace ?? 'moderate',
      weekdayStudyHours: p.weekdayStudyHours ?? 0,
      weekendStudyHours: p.weekendStudyHours ?? 0,
      notes: p.notes ?? '',
      meshIntegrationEnabled: p.meshIntegrationEnabled ?? false,
      meshAiContextEnabled: p.meshAiContextEnabled ?? false,
      meshWeakTopicsEnabled: p.meshWeakTopicsEnabled ?? false,
      meshPredictorInfluenceEnabled: p.meshPredictorInfluenceEnabled ?? false,
      meshScheduleThrottlingEnabled: p.meshScheduleThrottlingEnabled ?? false,
      targetSubjects: (data.targetSubjects ?? []).map((s) => ({
        ...s,
        currentEstimatedScore: s.currentEstimatedScore ?? undefined,
        examDate: s.examDate ?? undefined,
      })),
      selectedAiModel: data.selectedAiModel ?? p.selectedAiModel ?? '',
    };
  }

  async updateProfile(data: Partial<Profile>) {
    return this.request<{
      profile: Profile;
      targetSubjects: TargetSubject[];
      selectedAiModel?: string;
    }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Settings / Конфигурация подготовки по МЭШ
  async getSettings() {
    const res = await this.request<{ settings: import('./types').MeshPrepSettings }>('/api/config');
    return res.settings;
  }

  async updateSettings(settings: Partial<import('./types').MeshPrepSettings>) {
    const res = await this.request<{ success: boolean; settings: import('./types').MeshPrepSettings }>('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return res.settings;
  }

  // Schedule
  async getSchedule() {
    const data = await this.request<{ items: ScheduleItem[] }>('/api/schedule');
    return data.items;
  }

  async getScheduleLoad() {
    const data = await this.request<{ loadByDay: Record<string, number> }>(
      '/api/schedule/load'
    );
    const loads: ScheduleLoad['loads'] = Object.entries(data.loadByDay ?? {}).map(
      ([day, hours]) => ({ day: Number(day), hours })
    );
    return { loads };
  }

  async createScheduleItem(data: ScheduleItemInput) {
    return this.request<ScheduleItem>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduleItem(id: string, data: Partial<ScheduleItemInput>) {
    return this.request<ScheduleItem>(`/api/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteScheduleItem(id: string) {
    return this.request<{ success: boolean }>(`/api/schedule/${id}`, {
      method: 'DELETE',
    });
  }

  async importSchedulePdf(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${this.baseUrl}/api/schedule/import-pdf`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Не удалось распарсить PDF',
      }));
      throw new Error(error.error);
    }
    return (await response.json()) as ParsedScheduleResult;
  }

  async confirmScheduleImport(items: ScheduleItemInput[]) {
    return this.request<{ items: ScheduleItem[] }>(
      '/api/schedule/import-confirm',
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      }
    );
  }

  // Homework
  async getHomework(status?: string) {
    const query = status ? `?status=${status}` : '';
    const data = await this.request<{ items: Homework[] }>(
      `/api/homework${query}`
    );
    return data.items;
  }

  async getHomeworkById(id: string) {
    return this.request<Homework>(`/api/homework/${id}`);
  }

  async createHomework(data: HomeworkInput) {
    return this.request<Homework>('/api/homework', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateHomework(id: string, data: Partial<HomeworkInput>) {
    return this.request<Homework>(`/api/homework/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteHomework(id: string) {
    return this.request<{ success: boolean }>(`/api/homework/${id}`, {
      method: 'DELETE',
    });
  }

  async parseHomeworkText(text: string) {
    return this.request<{ items: ParsedHomeworkItem[] }>(
      '/api/homework/parse-text',
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    );
  }

  async confirmHomeworkImport(items: ParsedHomeworkItem[]) {
    return this.request<{ items: Homework[] }>('/api/homework/import-confirm', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async uploadHomeworkAttachment(id: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${this.baseUrl}/api/homework/${id}/attachment`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Не удалось загрузить файл',
      }));
      throw new Error(error.error);
    }
    return (await response.json()) as { success?: boolean; homework?: Homework };
  }

  async analyzeHomework(id: string) {
    return this.request<{ success?: boolean; analysis?: string; hint?: string }>(
      `/api/homework/${id}/analyze`,
      {
        method: 'POST',
      }
    );
  }

  async toggleHomework(id: string, isDone: boolean) {
    return this.request<Homework>(`/api/homework/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone }),
    });
  }

  async explainHomework(id: string, refresh = false) {
    return this.request<MeshExplainResult & { cached?: boolean }>(
      `/api/homework/${id}/ai-explain`,
      {
        method: 'POST',
        body: JSON.stringify({ refresh }),
      }
    );
  }

  async sendAiChat(message: string, history?: Array<{ role: string; content: string }>) {
    return this.request<{ reply: string; demoMode?: boolean; notice?: string }>(
      '/api/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({ message, history }),
      }
    );
  }

  // AI-Чат: мульти-сессии с историей в БД
  async getChatSessions() {
    return this.request<{
      sessions: Array<{
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
        _count?: { messages: number };
      }>;
    }>('/api/ai/chat/sessions');
  }

  async createChatSession(title?: string) {
    return this.request<{
      session: { id: string; title: string; createdAt: string; updatedAt: string };
    }>('/api/ai/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    });
  }

  async renameChatSession(id: string, title: string) {
    return this.request<{
      session: { id: string; title: string; createdAt: string; updatedAt: string };
    }>(`/api/ai/chat/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteChatSession(id: string) {
    return this.request<{ success: boolean }>(`/api/ai/chat/sessions/${id}`, {
      method: 'DELETE',
    });
  }

  async getChatMessages(id: string) {
    return this.request<{
      session: { id: string; title: string; createdAt: string; updatedAt: string };
      messages: Array<{
        id: string;
        role: string;
        content: string;
        attachments?: string | null;
        createdAt: string;
      }>;
    }>(`/api/ai/chat/sessions/${id}/messages`);
  }

  async uploadChatAttachments(id: string, files: File[]) {
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    const response = await fetch(`${this.baseUrl}/api/ai/chat/sessions/${id}/attachments`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Не удалось загрузить файлы',
      }));
      throw new Error(error.error);
    }
    return (await response.json()) as {
      attachments: Array<{ name: string; url: string; mimeType: string; size: number }>;
    };
  }

  async sendChatSessionMessage(
    id: string,
    message: string,
    attachments?: Array<{ name: string; url: string; mimeType: string; size: number }>
  ) {
    return this.request<{
      reply: string;
      demoMode?: boolean;
      notice?: string;
      userMessage: {
        id: string;
        role: string;
        content: string;
        attachments?: string | null;
        createdAt: string;
      };
      assistantMessage: { id: string; role: string; content: string; createdAt: string };
      session: { id: string; title: string; createdAt: string; updatedAt: string };
    }>(`/api/ai/chat/sessions/${id}/message`, {
      method: 'POST',
      body: JSON.stringify({ message, attachments: attachments ?? [] }),
    });
  }

  // Tests
  async getTests(subject?: string) {
    const query = subject ? `?subject=${subject}` : '';
    const data = await this.request<{ items: TestResult[] }>(
      `/api/tests${query}`
    );
    return data.items;
  }

  async getTestById(id: string) {
    return this.request<TestResult>(`/api/tests/${id}`);
  }

  async createTest(data: TestInput) {
    return this.request<TestResult>('/api/tests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTest(id: string, data: Partial<TestInput>) {
    return this.request<TestResult>(`/api/tests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTest(id: string) {
    return this.request<{ success: boolean }>(`/api/tests/${id}`, {
      method: 'DELETE',
    });
  }

  async uploadTestPhoto(id: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${this.baseUrl}/api/tests/${id}/attachment`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Не удалось загрузить фото',
      }));
      throw new Error(error.error);
    }
    return (await response.json()) as TestResult;
  }

  /** URL файла из uploads/ (работает и в dev, и на хостинге) */
  fileUrl(path: string) {
    const clean = path.replace(/^\/+/, '');
    return this.baseUrl ? `${this.baseUrl}/${clean}` : `/${clean}`;
  }

  // Mock Exams
  async getMockExams(subject?: string) {
    const query = subject ? `?subject=${subject}` : '';
    const data = await this.request<{ items: MockExam[] }>(
      `/api/mock-exams${query}`
    );
    return data.items;
  }

  async getMockExamById(id: string) {
    return this.request<MockExam>(`/api/mock-exams/${id}`);
  }

  async createMockExam(data: MockExamInput) {
    return this.request<MockExam>('/api/mock-exams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMockExam(id: string, data: Partial<MockExamInput>) {
    return this.request<MockExam>(`/api/mock-exams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMockExam(id: string) {
    return this.request<{ success: boolean }>(`/api/mock-exams/${id}`, {
      method: 'DELETE',
    });
  }

  async getMockExamVerdict(subject: string) {
    return this.request<MockExamVerdict>(
      `/api/mock-exams/${encodeURIComponent(subject)}/verdict`,
      {
        method: 'POST',
      }
    );
  }

  // Weak Topics
  async getWeakTopics(subject?: string, isResolved?: boolean) {
    const params = new URLSearchParams();
    if (subject) params.append('subject', subject);
    if (isResolved !== undefined) params.append('isResolved', String(isResolved));
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await this.request<{ items: WeakTopic[] }>(
      `/api/weak-topics${query}`
    );
    return data.items;
  }

  async updateWeakTopic(id: string, isResolved: boolean) {
    return this.request<WeakTopic>(`/api/weak-topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isResolved }),
    });
  }

  // Materials
  async getMaterials(subject?: string, topicName?: string) {
    const params = new URLSearchParams();
    if (subject) params.append('subject', subject);
    if (topicName) params.append('topicName', topicName);
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await this.request<{ items: StudyMaterial[] }>(
      `/api/materials${query}`
    );
    return data.items;
  }

  async getMaterialById(id: string) {
    return this.request<StudyMaterial>(`/api/materials/${id}`);
  }

  async generateMaterial(subject: string, topicName: string) {
    return this.request<MaterialGenerationResult>('/api/materials/generate', {
      method: 'POST',
      body: JSON.stringify({ subject, topicName }),
    });
  }

  // Plan
  async getPlan(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<PlanResponse>(`/api/plan${query}`);
  }

  async generatePlan() {
    return this.request<PlanResponse>('/api/plan/generate', {
      method: 'POST',
    });
  }

  async updatePlanItem(
    id: string,
    patch: { isCompleted?: boolean; targetDate?: string }
  ) {
    return this.request<{ item: unknown; progress: PlanResponse['progress'] }>(
      `/api/plan/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
  }

  // Analysis
  async runAnalysis() {
    return this.request<AnalysisResult>('/api/analysis/run', {
      method: 'POST',
    });
  }

  async getLatestAnalysis() {
    return this.request<LatestAnalysisResult>('/api/analysis/latest');
  }

  // Dashboard
  async getDashboard() {
    const d = await this.request<{
      daysToExam?: number;
      planProgress?: { percent?: number };
      todayLoad?: {
        hours?: number;
        classes?: number;
        lessons?: DashboardSummary['todayLoad']['lessonsList'];
      };
      upcomingDeadlines?: DashboardSummary['upcomingDeadlines'];
      mockExamStats?: { avgScore?: number; targetScore?: number; count?: number };
      criticalGaps?: Array<{ subject: string; topic: string; frequency: number }>;
      nextPlanSlot?: DashboardSummary['nextPlanSlot'];
      tips?: string[];
    }>('/api/dashboard');

    const summary: DashboardSummary = {
      daysUntilExam: d.daysToExam ?? 0,
      planProgress: d.planProgress?.percent ?? 0,
      todayLoad: {
        hours: d.todayLoad?.hours ?? 0,
        lessons: d.todayLoad?.classes ?? 0,
        lessonsList: (d.todayLoad?.lessons ?? []).map((l) => ({
          subject: l.subject ?? '',
          startTime: l.startTime ?? '',
          endTime: l.endTime ?? '',
          topic: l.topic ?? null,
          source: l.source ?? 'manual',
        })),
      },
      upcomingDeadlines: d.upcomingDeadlines ?? [],
      mockExamAverage: {
        average: d.mockExamStats?.avgScore ?? 0,
        target: d.mockExamStats?.targetScore ?? 0,
        count: d.mockExamStats?.count ?? 0,
      },
      criticalGaps: (d.criticalGaps ?? []).map((g) => ({
        subject: g.subject,
        topic: g.topic,
        criticality:
          g.frequency >= 3 ? 'high' : g.frequency === 2 ? 'medium' : 'low',
      })),
      nextPlanSlot: d.nextPlanSlot ?? null,
      aiAdvice: d.tips ?? [],
      activityTimeline: (d as unknown as { activityTimeline?: Record<string, { count: number; details: string[] }> }).activityTimeline ?? {},
    };
    return summary;
  }

  // Models
  async getModels() {
    return this.request<ModelsResult>('/api/ai/models');
  }

  async selectModel(modelSlug: string) {
    return this.request<{ selectedAiModel: string }>('/api/ai/select-model', {
      method: 'PUT',
      body: JSON.stringify({ modelSlug }),
    });
  }

  // МЭШ (Московская электронная школа)
  async getMeshStatus() {
    return this.request<MeshStatus>('/api/mesh');
  }

  async saveMeshToken(token: string) {
    return this.request<{ connected: boolean; tokenMasked: string }>('/api/mesh', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async deleteMeshToken() {
    return this.request<{ connected: boolean }>('/api/mesh', { method: 'DELETE' });
  }

  // Дневник МЭШ (расписание, ДЗ, оценки, пробники ЕГЭ)
  async syncMeshDiary(date?: string) {
    return this.request<MeshDiarySync>('/api/mesh/diary/sync', {
      method: 'POST',
      body: JSON.stringify(date ? { date } : {}),
    });
  }

  async getMeshDiarySchedule(date: string) {
    return this.request<{ date: string; lessons: MeshLesson[] }>(
      `/api/mesh/diary/schedule?date=${encodeURIComponent(date)}`
    );
  }

  async getMeshDiaryHomeworks() {
    return this.request<{ items: MeshHomework[] }>('/api/mesh/diary/homeworks');
  }

  async getMeshDiaryMarks() {
    return this.request<{ subjects: MeshSubjectGroup[] }>('/api/mesh/diary/marks');
  }

  async getMeshDiaryDiagnostics() {
    return this.request<{ items: MeshDiagnostic[] }>('/api/mesh/diary/diagnostics');
  }

  async explainMeshAttachment(input: MeshExplainInput) {
    return this.request<MeshExplainResult>('/api/mesh/explain-attachment', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async downloadMeshEgeResult(testId: string, subject: string, reportUrl?: string) {
    const params = new URLSearchParams();
    params.set('testId', testId);
    params.set('subject', subject);
    if (reportUrl) params.set('url', reportUrl);
    const response = await fetch(`${this.baseUrl}/api/mesh/diary/download?${params.toString()}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Не удалось скачать протокол ЕГЭ',
      }));
      throw new Error(error.error);
    }
    return response.blob();
  }

  // 1. Блиц-тренажер по слабым темам
  async generateTrainerQuiz(topic: string, subject: string) {
    return this.request<TrainerGenerateResponse>('/api/trainer/generate', {
      method: 'POST',
      body: JSON.stringify({ topic, subject }),
    });
  }

  async verifyTrainerAnswer(params: {
    topic: string;
    subject: string;
    questionId: string;
    userAnswer: string;
    correctAnswer: string;
    question: string;
  }) {
    return this.request<TrainerVerifyResult>('/api/trainer/verify', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async submitTrainerQuiz(params: {
    topic: string;
    subject: string;
    totalQuestions: number;
    correctCount: number;
  }) {
    return this.request<{ success: boolean; newMasteryLevel: number; isResolved: boolean; testResultId: string }>(
      '/api/trainer/submit',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  }

  // 2. AI-Эксперт проверки решений ФИПИ
  async checkFipiSolution(input: {
    subject: string;
    taskNumber?: string;
    taskText?: string;
    solutionText?: string;
    files?: File[];
  }) {
    const formData = new FormData();
    formData.append('subject', input.subject);
    if (input.taskNumber) formData.append('taskNumber', input.taskNumber);
    if (input.taskText) formData.append('taskText', input.taskText);
    if (input.solutionText) formData.append('solutionText', input.solutionText);
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        formData.append('files', file);
      }
    }
    return this.request<FipiCheckResult>('/api/fipi-check/solution', {
      method: 'POST',
      body: formData,
    });
  }

  // 3. Режим SOS / 15 минут до контрольной
  async getStudySos(subject: string, topic: string) {
    return this.request<SosSummary>(
      `/api/study/sos?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`
    );
  }

  // 4. Умные карточки (Flashcards / SM-2)
  async getDueFlashcards() {
    return this.request<{ items: Flashcard[] }>('/api/flashcards/due');
  }

  async getAllFlashcards() {
    return this.request<{ items: Flashcard[] }>('/api/flashcards');
  }

  async reviewFlashcard(id: string, rating: number) {
    return this.request<Flashcard>(`/api/flashcards/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  async generateFlashcardsFromMistakes() {
    return this.request<{ created: number; items: Flashcard[] }>(
      '/api/flashcards/generate-from-mistakes',
      { method: 'POST' }
    );
  }

  // 5. Предиктор итогового балла и трекер выгорания
  async getTelemetryPredictor() {
    return this.request<AnalyticsTelemetry>('/api/analysis/telemetry');
  }

  // 6. Симулятор экзамена (Exam Simulation)
  async createExamSimulation(data: ExamSimulationInput) {
    return this.request<ExamSimulation>('/api/exam-simulations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getExamSimulations() {
    return this.request<{ items: ExamSimulation[] }>('/api/exam-simulations');
  }

  async getExamSimulation(id: string) {
    return this.request<ExamSimulation>(`/api/exam-simulations/${id}`);
  }

  // 7. Официальный банк заданий КИМ и загрузка сканов решений
  async getExamVariant(subject = 'math_profile', variantNumber = 1) {
    return this.request<ExamVariant>(
      `/api/exams/variant?subject=${encodeURIComponent(subject)}&variantNumber=${variantNumber}`
    );
  }

  async uploadExamScans(files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${this.baseUrl}/api/exams/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Ошибка загрузки файлов сканов',
      }));
      throw new Error(error.error);
    }

    return (await response.json()) as {
      success: boolean;
      count: number;
      files: Array<{ originalName: string; filename: string; url: string; size: number }>;
      urls: string[];
    };
  }

  async startExamSimulation(subject = 'math_profile') {
    return this.request<{
      variant: ExamVariant;
      startedAt: string;
    }>('/api/exams/start', {
      method: 'POST',
      body: JSON.stringify({ subject }),
    });
  }

  async submitExamSimulation(data: {
    subject: string;
    variantNumber?: number;
    variantCode?: string;
    timeSpentSeconds: number;
    part1Answers: Record<string, string>;
    part2Solutions: Record<string, { text: string; scanUrls: Array<{ name: string; url: string; size: number }> }>;
    variantTasks?: ExamTask[];
  }) {
    return this.request<{
      success: boolean;
      mockExam: MockExam;
      simulation: ExamSimulation;
      results: {
        totalScore: number;
        primaryScore: number;
        correctPart1Count: number;
        missedTasks: string[];
        mistakeTopics: string[];
        deltaScore?: number | null;
        timeSpentSeconds: number;
      };
    }>('/api/exams/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Mistake Book APIs
  async getMistakes(subject?: string, status?: string) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      mistakes: MistakeEntry[];
      stats: { total: number; unresolvedCount: number; resolvedCount: number };
    }>(`/api/mistakes${qs}`);
  }

  async resolveMistake(id: string, answer: string) {
    return this.request<{
      success: boolean;
      isCorrect: boolean;
      message: string;
      mistake?: MistakeEntry;
      correctAnswer?: string;
    }>(`/api/mistakes/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  }

  // Tutor Workstation APIs
  async getTutorStudents() {
    return this.request<{ students: TutorStudent[] }>('/api/tutor/students');
  }

  async createTutorInvite() {
    return this.request<{ inviteCode: string; inviteLink: string }>('/api/tutor/invite', {
      method: 'POST',
    });
  }

  async joinTutor(inviteCode: string) {
    return this.request<{ success: boolean; link: any }>('/api/tutor/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async assignTutorWork(data: {
    studentId: string;
    title: string;
    subject: string;
    variantData: any;
    deadlineDays: number;
  }) {
    return this.request<{ success: boolean; work: AssignedWork }>('/api/tutor/assign', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAssignedWorks() {
    return this.request<{ works: AssignedWork[] }>('/api/tutor/assigned');
  }

  async gradeTutorWork(data: { workId: string; score: number; tutorFeedback: string }) {
    return this.request<{ success: boolean; work: AssignedWork }>('/api/tutor/grade-work', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTutorClasses() {
    return this.request<{ classes: Array<{ id: string; name: string; grade: number; subject: string; studentCount: number; averageScore: number }> }>('/api/tutor/classes');
  }

  async getTutorClassMatrix(classId: string) {
    return this.request<{ classId: string; matrix: Array<{ taskNum: number; topic: string; solveRate: number; status: string }> }>(`/api/tutor/classes/${classId}/matrix`);
  }

  async assignTutorClassBulk(classId: string, data: { title: string; subject: string; deadlineDays: number }) {
    return this.request<{ success: boolean; assignedCount: number; message: string }>(`/api/tutor/classes/${classId}/assign-bulk`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Telegram Notifications APIs
  async getTelegramStatus() {
    return this.request<{
      isLinked: boolean;
      link: { id: string; role: string; token: string; isActive: boolean; createdAt: string } | null;
      botUsername: string;
    }>('/api/telegram/status');
  }

  async generateTelegramToken(role = 'parent') {
    return this.request<{
      token: string;
      botUsername: string;
      instructions: string;
    }>('/api/telegram/token', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }

  async simulateTelegramDigest() {
    return this.request<{ success: boolean; message: string; digest: any }>('/api/telegram/simulate-digest', {
      method: 'POST',
    });
  }

  async simulateTelegramAlert(dropType = 'test_score_drop') {
    return this.request<{ success: boolean; message: string; alert: any }>('/api/telegram/simulate-alert', {
      method: 'POST',
      body: JSON.stringify({ dropType }),
    });
  }

  // Reports & PDF Print APIs
  async getClassPackHtml(subject = 'math_profile', count = 4) {
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`${this.baseUrl}/api/reports/class-pack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subject, count }),
    });
    return res.text();
  }

  async getMonthlyReportHtml(studentId?: string) {
    const token = localStorage.getItem('token') || '';
    const url = studentId
      ? `${this.baseUrl}/api/reports/student/${studentId}/monthly-pdf`
      : `${this.baseUrl}/api/reports/monthly-pdf`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.text();
  }

  // Daily Sprint APIs
  async getDailySprint(subject = 'math_profile'): Promise<{ tasks: any[] }> {
    return this.request<{ tasks: any[] }>(`/api/sprint?subject=${encodeURIComponent(subject)}`);
  }

  async completeDailySprint(answers: Record<string, string>, subject = 'math_profile'): Promise<{
    success: boolean;
    xpAwarded: number;
    xp: number;
    level: number;
  }> {
    return this.request('/api/sprint/complete', {
      method: 'POST',
      body: JSON.stringify({ answers, subject }),
    });
  }

  // Student Assigned Work Submission APIs
  async submitAssignedWork(data: {
    workId: string;
    answers?: Record<string, string>;
    scanUrls?: string[];
    comment?: string;
  }): Promise<{
    success: boolean;
    work: AssignedWork;
    xpAwarded: number;
    xp: number;
    level: number;
    message: string;
  }> {
    return this.request('/api/tutor/submit-work', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadTutorScan(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/api/tutor/upload-scan', {
      method: 'POST',
      body: formData,
    });
  }
}

export const api = new ApiClient(API_BASE);
