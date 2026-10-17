import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from './components/ToastContainer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { AuthMeshCallback } from './pages/AuthMeshCallback';
import { DashboardPage } from './pages/DashboardPage';
import { HomeworkPage } from './pages/HomeworkPage';
import { TestsPage } from './pages/TestsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { MockExamsPage } from './pages/MockExamsPage';
import { EgePlanPage } from './pages/EgePlanPage';
import { AIChat } from './pages/AIChat';
import { TutorDashboardPage } from './pages/TutorDashboardPage';
import { MistakesPage } from './pages/MistakesPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { PlatformFooter } from './components/PlatformFooter';
import { Sidebar } from './components/Sidebar';

// Тяжелые страницы и компоненты с 3D/KaTeX/графиками грузятся динамически (code-splitting)
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const MeshDiaryPage = lazy(() => import('./pages/MeshDiaryPage'));
const MaterialsPage = lazy(() => import('./pages/MaterialsPage'));
const ExamPressureSimulatorPage = lazy(() => import('./pages/ExamPressureSimulatorPage'));
const ExpertModePage = lazy(() => import('./pages/ExpertModePage'));
const AppealCalculatorPage = lazy(() => import('./pages/AppealCalculatorPage'));
const PvPArenaPage = lazy(() => import('./pages/PvPArenaPage'));

function MainLayout() {
  const location = useLocation();
  const isChat = location.pathname === '/chat';
  const isExam = location.pathname === '/exam-pressure';

  return (
    <div className="page-velvet flex flex-col overflow-x-clip bg-[#09090b] text-zinc-100 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Мягкий радиальный свет сверху — глубина без шума */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(212,255,0,0.05),rgba(255,255,255,0))]" />
      <Sidebar />
      <main
        className={`relative w-full max-w-full min-w-0 flex-1 ${
          isChat
            ? 'h-[calc(100dvh-60px)] pt-[64px] pb-1 px-2 md:px-4 lg:h-screen lg:pt-4 lg:pb-4 lg:px-6 overflow-hidden flex flex-col'
            : 'overflow-x-hidden px-4 pb-12 pt-20 md:px-8 lg:h-screen lg:overflow-y-auto lg:pt-8 flex flex-col justify-between'
        }`}
      >
        <div>
          <Suspense
            fallback={
              <div className="p-8 text-zinc-500 font-mono text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff00] animate-ping" />
                <span>[ ЗАГРУЗКА МОДУЛЯ СИСТЕМЫ... ]</span>
              </div>
            }
          >
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/console" element={<DashboardPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/homework" element={<HomeworkPage />} />
              <Route path="/tests" element={<TestsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/config" element={<SettingsPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/mock-exams" element={<MockExamsPage />} />
              <Route path="/mesh-diary" element={<MeshDiaryPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/ege-plan" element={<EgePlanPage />} />
              <Route path="/plan" element={<EgePlanPage />} />
              <Route path="/chat" element={<AIChat />} />
              <Route path="/exam-pressure" element={<ExamPressureSimulatorPage />} />
              <Route path="/expert-mode" element={<ExpertModePage />} />
              <Route path="/appeal-calculator" element={<AppealCalculatorPage />} />
              <Route path="/arena" element={<PvPArenaPage />} />
              <Route path="/pvp" element={<PvPArenaPage />} />
              <Route path="/tutor" element={<TutorDashboardPage />} />
              <Route path="/mistakes" element={<MistakesPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route index element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
        {!isChat && !isExam && <div className="mt-12"><PlatformFooter /></div>}
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        {/* Главная — публичный иммерсивный протокол */}
        <Route
          path="/"
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#09090b]" />}>
              <LandingPage />
            </Suspense>
          }
        />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/mesh/callback" element={<AuthMeshCallback />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
