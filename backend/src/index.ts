import './config/env.js';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import aiRoutes from './routes/ai.js';
import profileRoutes from './routes/profile.js';
import usageRoutes from './routes/usage.js';
import scheduleRoutes from './routes/schedule.js';
import homeworkRoutes from './routes/homework.js';
import testsRoutes from './routes/tests.js';
import mockExamsRoutes from './routes/mockExams.js';
import weakTopicsRoutes from './routes/weakTopics.js';
import materialsRoutes from './routes/materials.js';
import planRoutes from './routes/plan.js';
import analysisRoutes from './routes/analysis.js';
import dashboardRoutes from './routes/dashboard.js';
import meshRoutes from './routes/mesh.js';
import meshDiaryRoutes from './routes/meshDiary.js';
import trainerRoutes from './routes/trainer.js';
import fipiCheckRoutes from './routes/fipiCheck.js';
import studySosRoutes from './routes/studySos.js';
import flashcardsRoutes from './routes/flashcards.js';
import examSimulationsRoutes from './routes/examSimulations.js';
import examsRoutes from './routes/exams.js';
import tutorRoutes from './routes/tutor.js';
import mistakesRoutes from './routes/mistakes.js';
import telegramRoutes from './routes/telegram.js';
import reportsRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import sprintRoutes from './routes/sprint.js';
import pvpRoutes from './routes/pvp.js';
import matrixRoutes from './routes/matrix.js';
import { requireAuth } from './middleware/requireAuth.js';
import { verifyToken } from './lib/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';

// Security middleware (CSP под собранное SPA: Google Fonts, GSI, инлайн-стили)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        objectSrc: ["'none'"],
      },
    },
    // COOP/COEP выключены: ломают popup Google OAuth и загрузку Google Fonts
    crossOriginOpenerPolicy: { policy: 'unsafe-none' },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // 20 запросов за окно
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

function getClientIdentifier(req: express.Request): string {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = bearerToken ?? (req.cookies as Record<string, string> | undefined)?.authToken;
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload?.userId) return `user_${payload.userId}`;
    } catch {
      /* noop */
    }
  }
  return req.ip || 'anonymous';
}

// Rate limiting for AI endpoints (максимум 5 запросов в минуту на генерацию ответов ИИ)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 5, // максимум 5 запросов в минуту
  message: { error: 'Слишком много запросов к ИИ-сервисам (лимит: 5 запросов в минуту). Пожалуйста, подождите минуту.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Не ограничиваем GET/DELETE/OPTIONS запросы (чтение моделей, списка сессий, истории сообщений и т.д.)
    if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') {
      return true;
    }
    // Не ограничиваем создание пустой сессии чата или выбор модели
    if (req.path === '/chat/sessions' || req.path === '/select-model') {
      return true;
    }
    return false;
  },
  keyGenerator: (req) => getClientIdentifier(req),
});

app.use('/api/auth', authLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/fipi-check', aiLimiter);
app.use('/api/trainer', aiLimiter);
app.use('/api/study-sos', aiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/mock-exams', mockExamsRoutes);
app.use('/api/weak-topics', weakTopicsRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/study-plan', planRoutes);
app.use('/api/matrix', matrixRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/mesh', meshRoutes);
app.use('/api/mesh', meshDiaryRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/fipi-check', fipiCheckRoutes);
app.use('/api/study', studySosRoutes);
app.use('/api/flashcards', flashcardsRoutes);
app.use('/api/exam-simulations', examSimulationsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/tutor', tutorRoutes);
app.use('/api/mistakes', mistakesRoutes);
app.use('/api/sprint', sprintRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/config', settingsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Файлы вложений (фото работ, сканы чистовиков): доступ строго для авторизованных пользователей (152-ФЗ)
app.use('/uploads', requireAuth, express.static(path.resolve('uploads')));

// Serve frontend build (единый origin для хостинга)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Эндпоинт не найден' });
});

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Необработанная ошибка:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📍 CLIENT_ORIGIN: ${CLIENT_ORIGIN}`);
  console.log(`🔒 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});
