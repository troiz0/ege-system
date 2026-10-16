import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { chatJson } from './openrouterClient';
import { materialAiSchema, type MaterialAiResult } from '../../ai/schemas';
import { SYS_MATERIAL } from '../../ai/prompts';
import { reshuUrl, FIPI_URL } from '../links';
import { formulasToImage } from '../formulasImage';

export interface TopicMaterial {
  id?: string;
  subject?: string;
  topicName?: string;
  summaryTheory: string;
  formulas: string;
  /** SVG-картинка формул на фоне вкладки (data URI). */
  formulasImage?: string | null;
  pitfalls: string;
  algorithm: string;
  reshuEgeUrl: string;
  fipiUrl: string;
  videoQuery: string;
  demoMode: boolean;
  notice?: string;
}

/** Добивает formulasImage для строк, созданных до введения картинок. */
export async function ensureFormulasImage(material: {
  id: string;
  formulas: string | null;
  formulasImage: string | null;
}): Promise<string | null> {
  if (material.formulasImage) return material.formulasImage;
  const image = formulasToImage(material.formulas);
  if (!image) return null;
  await prisma.topicStudyMaterial.update({
    where: { id: material.id },
    data: { formulasImage: image },
  });
  return image;
}

export async function generateMaterialForTopic(
  user: User,
  subject: string,
  topicName: string
): Promise<TopicMaterial> {
  // Check if material already exists in cache
  const existing = await prisma.topicStudyMaterial.findUnique({
    where: {
      userId_subject_topicName: {
        userId: user.id,
        subject,
        topicName,
      },
    },
  });

  if (existing) {
    const formulasImage = await ensureFormulasImage(existing);
    return {
      ...existing,
      formulas: existing.formulas || '',
      formulasImage,
      pitfalls: existing.pitfalls || '',
      algorithm: existing.algorithm || '',
      reshuEgeUrl: existing.reshuEgeUrl || '',
      fipiUrl: existing.fipiUrl || '',
      videoQuery: existing.videoQuery || '',
      demoMode: false,
    };
  }

  // Generate new material via AI
  const result = await chatJson<MaterialAiResult>({
    user,
    messages: [
      { role: 'system', content: SYS_MATERIAL },
      { role: 'user', content: `Предмет: ${subject}\nТема: ${topicName}` },
    ],
    schema: materialAiSchema,
    mockType: 'material',
    maxTokens: 2500,
  });

  // Build links
  const reshuEgeUrl = reshuUrl(subject, topicName);
  const fipiUrl = FIPI_URL;

  // Save to database (including demo materials, so the knowledge base works)
  const saved = await prisma.topicStudyMaterial.create({
    data: {
      userId: user.id,
      subject,
      topicName,
      summaryTheory: result.data.summaryTheory,
      formulas: result.data.formulas,
      formulasImage: formulasToImage(result.data.formulas),
      pitfalls: result.data.pitfalls,
      algorithm: result.data.algorithm,
      reshuEgeUrl,
      fipiUrl,
      videoQuery: result.data.videoQuery,
    },
  });

  return {
    ...saved,
    formulas: saved.formulas || '',
    formulasImage: saved.formulasImage || null,
    pitfalls: saved.pitfalls || '',
    algorithm: saved.algorithm || '',
    reshuEgeUrl: saved.reshuEgeUrl || '',
    fipiUrl: saved.fipiUrl || '',
    videoQuery: saved.videoQuery || '',
    demoMode: result.demoMode,
    notice: result.notice,
  };
}
