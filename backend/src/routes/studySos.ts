import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { chatJson } from '../services/ai/openrouterClient.js';
import { sosSchema } from '../ai/schemas.js';

const router = Router();

const sosParamsSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
});

async function handleGenerateSos(req: any, res: any) {
  try {
    const user = req.user!;
    const input = {
      subject: req.body?.subject || req.query?.subject,
      topic: req.body?.topic || req.query?.topic,
    };
    const { subject, topic } = sosParamsSchema.parse(input);

    const systemPrompt = `Ты — топовый преподаватель ЕГЭ. Твоя задача — составить экстремально сжатую, практичную шпаргалку «SOS: 15 минут до контрольной или экзамена» по теме "${topic}" (предмет: ${subject}) БЕЗ «воды».

ТРЕБОВАНИЯ К КОНТЕНТУ:
1. "formulas": Ровно 3 ключевые формулы (title, latex, note). LaTeX формулы оборачивай в чистый LaTeX без знаков доллара в свойстве latex (например: "\\sin^2(x) + \\cos^2(x) = 1").
2. "pitfalls": Ровно 2 типичные ловушки составителей КИМ, на которых теряют баллы большинство выпускников.
3. "algorithm": Ровно 1 пошаговый алгоритм решения типовой задачи из 3-6 коротких четких шагов.

Формат JSON:
{
  "formulas": [{ "title": "...", "latex": "...", "note": "..." }],
  "pitfalls": [{ "title": "...", "explanation": "..." }],
  "algorithm": [{ "step": 1, "instruction": "..." }]
}`;

    const result = await chatJson({
      user,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Составь SOS-шпаргалку по теме: "${topic}"` },
      ],
      schema: sosSchema,
      mockType: 'sos',
    });

    // Автоматическое сохранение шпаргалки в базу данных (TopicStudyMaterial)
    const title = topic.startsWith('[SOS]') ? topic : `[SOS] ${topic}`;
    const formulasText = result.data.formulas
      .map((f, i) => `${i + 1}. ${f.title}: $${f.latex}$ (${f.note})`)
      .join('\n');
    const pitfallsText = result.data.pitfalls
      .map((p) => `⚠️ ${p.title}\n${p.explanation}`)
      .join('\n\n');
    const algorithmText = result.data.algorithm
      .map((a) => `Шаг ${a.step}: ${a.instruction}`)
      .join('\n');
    const summary = `[SOS: 15 МИНУТ ДО КОНТРОЛЬНОЙ]\nТема: ${topic} (${subject})\nЭкспресс-конспект для быстрого повторения ключевых формул и обхода ловушек.`;

    let savedMaterialId: string | undefined = undefined;
    try {
      const saved = await prisma.topicStudyMaterial.upsert({
        where: {
          userId_subject_topicName: {
            userId: user.id,
            subject,
            topicName: title,
          },
        },
        create: {
          userId: user.id,
          subject,
          topicName: title,
          summaryTheory: summary,
          formulas: formulasText,
          pitfalls: pitfallsText,
          algorithm: algorithmText,
        },
        update: {
          summaryTheory: summary,
          formulas: formulasText,
          pitfalls: pitfallsText,
          algorithm: algorithmText,
          createdAt: new Date(),
        },
      });
      savedMaterialId = saved.id;
    } catch (saveErr) {
      console.warn('Failed to auto-save SOS material to database:', saveErr);
    }

    return res.json({
      subject,
      topic,
      title,
      ...result.data,
      isSos: true,
      materialId: savedMaterialId,
      demoMode: result.demoMode,
      notice: result.notice,
    });
  } catch (error) {
    console.error('Study SOS error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Не указаны обязательные параметры subject или topic' });
    }
    return res.status(500).json({ error: 'Ошибка генерации SOS-конспекта' });
  }
}

// Поддержка GET и POST запросов
router.get('/sos', requireAuth, handleGenerateSos);
router.post('/sos', requireAuth, handleGenerateSos);

export default router;
