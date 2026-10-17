import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatJson } from '../services/ai/openrouterClient.js';
import { fipiCheckSchema, appealRiskSchema } from '../ai/schemas.js';
import { prisma } from '../lib/prisma.js';
import { awardUserXp } from '../services/xpService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Настройка хранилища multer в backend/uploads
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `fipi_${unique}_${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 5,                  // до 5 файлов
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/pdf',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Недопустимый формат файла ${file.mimetype}. Разрешены: PNG, JPEG, WEBP, PDF`));
    }
  },
});

// Middleware для безопасной обработки загрузки до 5 файлов
const handleUpload = (req: any, res: any, next: any) => {
  upload.array('files', 5)(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Максимум 5 листов решения' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Размер файла превышает лимит (15 МБ)' });
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файлов' });
    }
    next();
  });
};

// POST /api/fipi-check/solution (поддерживает FormData с файлами и JSON)
router.post('/solution', requireAuth, handleUpload, async (req, res) => {
  try {
    const user = req.user!;
    const subject = (req.body?.subject || 'Профильная математика').trim();
    const taskNumber = (req.body?.taskNumber || '14').trim();
    const taskText = (req.body?.taskText || 'Задание развернутой части КИМ ЕГЭ').trim();
    const solutionText = (req.body?.solutionText || '').trim();

    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    const fileUrls = uploadedFiles.map((f) => `/uploads/${f.filename}`);

    // Подготовка изображений для мультимодального Vision API (OpenRouter Gemini Vision)
    const base64Images: string[] = [];
    for (const f of uploadedFiles) {
      try {
        const filePath = path.resolve(f.path || path.join(uploadDir, f.filename));
        if (fs.existsSync(filePath)) {
          const mime = f.mimetype || 'image/jpeg';
          if (mime.startsWith('image/')) {
            const buf = fs.readFileSync(filePath);
            base64Images.push(`data:${mime};base64,${buf.toString('base64')}`);
          }
        }
      } catch (err) {
        console.warn('Failed to read image for vision API:', err);
      }
    }

    // Предметные критерии ФИПИ
    const normSubj = subject.toLowerCase();
    let criteriaBlock = '';
    if (normSubj.includes('русск')) {
      criteriaBlock = `ОФИЦИАЛЬНЫЕ 12 КРИТЕРИЕВ СОЧИНЕНИЯ ФИПИ (К1–К12, максимум 21 первичный балл):
- К1 (0-1): Формулировка проблемы исходного текста.
- К2 (0-3): Пояснение к проблеме, 2 примера-иллюстрации и смысловая связь.
- К3 (0-1): Отражение позиции автора исходного текста.
- К4 (0-1): Отношение к позиции автора и собственное обоснование.
- К5 (0-2): Смысловая цельность, речевая связность и последовательность.
- К6 (0-1): Богатство речи и точность выражения мысли.
- К7 (0-3): Соблюдение орфографических норм (0 ошибок = 3б, 1-2 = 2б, 3-4 = 1б, 5+ = 0б).
- К8 (0-3): Соблюдение пунктуационных норм (0 ошибок = 3б, 1-2 = 2б, 3-4 = 1б, 5+ = 0б).
- К9 (0-2): Соблюдение грамматических норм (0 ошибок = 2б, 1-2 = 1б, 3+ = 0б).
- К10 (0-2): Соблюдение речевых норм (0 ошибок = 2б, 1-2 = 1б, 3+ = 0б).
- К11 (0-1): Соблюдение этических норм.
- К12 (0-1): Соблюдение фактологической точности.
ОБЯЗАТЕЛЬНО заполни массив detailedCriteria для каждого из 12 критериев К1–К12!`;
    } else if (normSubj.includes('обществ')) {
      criteriaBlock = `КРИТЕРИИ ОЦЕНИВАНИЯ РАЗВЕРНУТОЙ ЧАСТИ ОБЩЕСТВОЗНАНИЯ:
- Для сложного плана (№24): структура пунктов (не менее 3, из них 2+ детализированы в подпунктах).
- Для обоснования (№25): теоретическое раскрытие + 3 развернутых конкретных примера из РФ / истории.`;
    } else {
      criteriaBlock = `КРИТЕРИИ ОЦЕНИВАНИЯ ПРОФИЛЬНОЙ МАТЕМАТИКИ:
- Критерий К1 (Математическая обоснованность и логика):
  Оценивает правильность математических рассуждений, эквивалентность переходов (строгость использования знаков ⇔ и ⇒), полноту ограничений/ОДЗ, отбор корней на тригонометрической окружности или числовой прямой.
- Критерий К2 (Вычислительная точность и форма ответа):
  Оценивает чистоту вычислений, отсутствие арифметических описок и корректность записи итогового ответа.

СТРОЖАЙШЕЕ ИМПЕРАТИВНОЕ ПРАВИЛО ФИПИ (ZERO-TOLERANCE ДЛЯ ОДЗ И РАВНОСИЛЬНОСТИ):
Если в решении:
1) Проигнорирована область допустимых значений (ОДЗ) логарифмического/дробного/иррационального выражения;
2) Допущен неравносильный переход (возведение в четную степень без проверки знаков, появление посторонних корней или потеря корней);
3) Допущено деление на выражение, обращающееся в ноль,
ТО ТАКОЕ РЕШЕНИЕ АННУЛИРУЕТСЯ ПОЛНОСТЬЮ!
ЭКСПЕРТ ОБЯЗАН ВЫСТАВИТЬ СТРОГО 0 БАЛЛОВ (primaryScore: 0, k1Score: 0, k2Score: 0)!
Категорически запрещено начислять баллы за вычисления (k2Score > 0), если нарушено ОДЗ или равносильность!`;
    }

    const systemPrompt = `Ты — старший эксперт предметной комиссии ФИПИ по проверке развернутой части ЕГЭ (предмет: ${subject}).
Твоя цель — произвести строгую, беспристрастную и профессиональную оценку решения задания №${taskNumber} в соответствии с официальными критериями ФИПИ. Если прикреплены сканы чистовиков, тщательно распознай почерк ученика через Vision.

${criteriaBlock}

ФОРМАТ ОТВЕТА (строгий JSON):
{
  "primaryScore": число (суммарный первичный балл, например от 0 до 4, либо 0..21 для сочинения),
  "maxScore": число (максимальный первичный балл за данное задание),
  "k1Score": число (балл за К1 или содержание),
  "k1Max": число (максимум за К1),
  "k1Comment": строка (подробный методический комментарий эксперта с указанием на ОДЗ/логику),
  "k2Score": число (балл за К2 или грамотность),
  "k2Max": число (максимум за К2),
  "k2Comment": строка (комментарий эксперта по К2),
  "detailedCriteria": [
    { "id": "К1", "name": "Название критерия", "score": 1, "maxScore": 1, "comment": "пояснение" }
  ],
  "errors": [
    {
      "type": "logic" | "computation" | "notation" | "criteria",
      "description": "Описание ошибки",
      "quote": "Цитата места из решения, где допущена ошибка",
      "recommendation": "Как следовало оформить правильно"
    }
  ],
  "expertVerdict": "Итоговое развернутое резюме эксперта"
}`;

    let userPrompt = `Условие задачи №${taskNumber}:
${taskText}

Текст решения ученика:
${solutionText || '(Рукописное решение прикреплено в сканах чистовика)'}`;

    if (fileUrls.length > 0) {
      userPrompt += `\n\nПрикреплено файлов/страниц чистовика: ${fileUrls.length}. Ознакомься со сканами изображений чистовика.`;
    }

    const result = await chatJson({
      user,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      images: base64Images.length > 0 ? base64Images : undefined,
      schema: fipiCheckSchema,
      mockType: 'fipi',
    });

    const data = { ...result.data };

    // Программный гвард: если в математике обнаружена фатальная ошибка в ОДЗ или равносильности, принудительно обнуляем балл (правило ФИПИ)
    if (normSubj.includes('матем')) {
      const hasFatalLogicBreak = data.errors?.some((e) => {
        if (e.type !== 'logic') return false;
        const desc = (e.description + ' ' + (e.quote || '')).toLowerCase();
        // Оцениваем математическую суть нарушений, а не само присутствие слов 'ограничен' или 'посторонн'
        const isViolation =
          desc.includes('нарушение одз') ||
          desc.includes('не учтено одз') ||
          desc.includes('не учтена одз') ||
          desc.includes('игнорирование одз') ||
          desc.includes('неравносильный переход') ||
          desc.includes('деление на ноль') ||
          desc.includes('не отброшен посторонний корень') ||
          desc.includes('лишний посторонний корень') ||
          desc.includes('не отброшены посторонние корни') ||
          desc.includes('потеря корней') ||
          desc.includes('потеря корня');
        const isNotAffirmation = !desc.includes('верно') && !desc.includes('правильно') && !desc.includes('учтен');
        return isViolation && isNotAffirmation;
      });
      if (hasFatalLogicBreak) {
        data.primaryScore = 0;
        data.k1Score = 0;
        data.k2Score = 0;
        data.expertVerdict = `[ВЕРДИКТ ФИПИ: 0 БАЛЛОВ] Нарушение равносильности переходов или игнорирование ОДЗ полностью аннулирует решение. ${data.expertVerdict}`;
      }
    }

    return res.json({
      ...data,
      attachmentUrls: fileUrls,
      demoMode: result.demoMode,
      notice: result.notice,
    });
  } catch (error) {
    console.error('Fipi check solution error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные параметры решения', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка проверки решения экспертом' });
  }
});

// POST /api/fipi-check/appeal-risk (Двусторонний AI-анализ рисков апелляции: Upside vs Downside)
router.post('/appeal-risk', requireAuth, handleUpload, async (req, res) => {
  try {
    const user = req.user!;
    const subject = (req.body?.subject || 'Профильная математика').trim();
    const taskNumber = (req.body?.taskNumber || '14').trim();
    const currentScore = Number(req.body?.currentScore ?? 0);
    const maxScore = Number(req.body?.maxScore ?? 2);
    const taskText = (req.body?.taskText || 'Задание развернутой части КИМ ЕГЭ').trim();
    const solutionText = (req.body?.solutionText || '').trim();
    const studentComment = (req.body?.studentComment || '').trim();

    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    const fileUrls = uploadedFiles.map((f) => `/uploads/${f.filename}`);

    const base64Images: string[] = [];
    for (const f of uploadedFiles) {
      try {
        const filePath = path.resolve(f.path || path.join(uploadDir, f.filename));
        if (fs.existsSync(filePath)) {
          const mime = f.mimetype || 'image/jpeg';
          if (mime.startsWith('image/')) {
            const buf = fs.readFileSync(filePath);
            base64Images.push(`data:${mime};base64,${buf.toString('base64')}`);
          }
        }
      } catch (err) {
        console.warn('Failed to read scan for vision API:', err);
      }
    }

    const systemPrompt = `Ты — председатель Конфликтной комиссии ЕГЭ по предмету "${subject}" и ведущий эксперт ФИПИ.
Ученик планирует подать официальную апелляцию о несогласии с выставленными баллами за задание ${taskNumber}.
Текущий выставленный первичный балл: ${currentScore} из ${maxScore}.

ТВОЯ ЗАДАЧА — провести БЕСПРИСТРАСТНЫЙ ДВУСТОРОННИЙ АУДИТ РИСКОВ:
1. ПОТЕНЦИАЛ ПОВЫШЕНИЯ (Upside):
   - Есть ли в работе спорные моменты, где проверяющий эксперт проявил излишнюю строгость или не заметил альтернативного верного способа решения?
   - За что конкретно (по критериям ФИПИ К1, К2 и т.д.) можно отвоевать +1 или +2 балла?
2. РИСК ПОНИЖЕНИЯ (Downside):
   - ПРИНЦИП КОНФЛИКТНОЙ КОМИССИИ: работа перепроверяется ЦЕЛИКОМ, и комиссия вправе как повысить, так и ПОНИЗИТЬ балл.
   - Нет ли в решении других незамеченных экспертом дефектов (скрытая арифметика, нестрогие переходы, пропущенная ОДЗ, ошибки в терминологии), из-за которых комиссия СНИМЕТ балл?
3. ВЕРДИКТ И ШКАЛА РИСКА:
   - Если риск понижения велик (найдена скрытая ошибка): "riskLevel": "HIGH", "verdictTitle": "[ ОПАСНО: ВЫСОКИЙ РИСК ПОТЕРИ БАЛЛА ]", "riskPercentage": 75-95.
   - Если риска снижения нет, а аргументы железобетонные: "riskLevel": "LOW", "verdictTitle": "[ НИЗКИЙ РИСК: ПОДАВАТЬ ]", "riskPercentage": 10-25.
   - Если аргументы спорные и зависят от субъективного взгляда: "riskLevel": "MEDIUM", "verdictTitle": "[ УМЕРЕННЫЙ РИСК: ТРЕБУЕТ ВЗВЕШИВАНИЯ ]", "riskPercentage": 40-60.
4. СТРАТЕГИЯ ДЛЯ КОМИССИИ:
   - Конкретные фразы и ссылки на методические рекомендации ФИПИ-2027 для аргументации перед экспертами.

Верни ответ СТРОГО в JSON формате:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "verdictTitle": "[ НИЗКИЙ РИСК: ПОДАВАТЬ ]" | "[ ОПАСНО: ВЫСОКИЙ РИСК ПОТЕРИ БАЛЛА ]",
  "riskPercentage": 20,
  "summary": "Краткое резюме аудита",
  "upside": {
    "potentialDelta": 1,
    "arguments": ["аргумент 1", "аргумент 2"],
    "criteriaAnalysis": "подробный критериальный разбор потенциала"
  },
  "downside": {
    "riskDelta": 0,
    "vulnerabilities": ["уязвимость 1"],
    "hiddenRisks": "подробный разбор скрытых угроз работы"
  },
  "commissionStrategy": "Сценарий защиты на апелляции со ссылками на ФИПИ"
}`;

    let userPrompt = `Предмет: ${subject}
Задание: ${taskNumber}
Выставленный балл: ${currentScore} / ${maxScore}
Условие задачи:
${taskText}

Решение ученика (текст/транскрипция):
${solutionText || '(Скан рукописного чистовика прикреплен)'}`;

    if (studentComment) {
      userPrompt += `\n\nКомментарий ученика (почему не согласен с баллом):\n${studentComment}`;
    }

    if (fileUrls.length > 0) {
      userPrompt += `\n\nПрикреплено сканов чистовика: ${fileUrls.length}. Проанализируй изображения рукописного решения.`;
    }

    const result = await chatJson({
      user,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      images: base64Images.length > 0 ? base64Images : undefined,
      schema: appealRiskSchema,
      mockType: 'appeal',
    });

    // Начисляем +15 XP за аудит работы перед апелляцией
    const xpStats = await awardUserXp(prisma, user.id, 15, 'Аудит рисков апелляции');

    return res.json({
      ...result.data,
      attachmentUrls: fileUrls,
      demoMode: result.demoMode,
      notice: result.notice,
      xpAwarded: 15,
      newXp: xpStats?.xp,
      newLevel: xpStats?.level,
    });
  } catch (error) {
    console.error('Appeal risk audit error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректные параметры аудита', details: error.errors });
    }
    return res.status(500).json({ error: 'Ошибка анализа рисков апелляции' });
  }
});

export default router;
