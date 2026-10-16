import type { User } from '@prisma/client';
import { readFileSync } from 'fs';
import { extractPdfText } from './pdfText';
import { chatJson } from './openrouterClient';
import { attachmentAiSchema, type AttachmentAiResult } from '../../ai/schemas';
import { SYS_ATTACHMENT } from '../../ai/prompts';

export interface AnalyzedAttachment {
  text: string;
  topics: string[];
  difficulty: 'low' | 'medium' | 'high';
  steps: string[];
  demoMode: boolean;
  notice?: string;
}

export async function analyzeAttachment(
  user: User,
  filePath: string,
  mimeType: string
): Promise<AnalyzedAttachment> {
  // Check if user has PRO
  if (user.subscriptionTier !== 'PRO' && !user.isDemo) {
    throw new Error('Разбор прикреплённых файлов доступен только в тарифе PRO');
  }

  let content: string | string[] = '';
  const images: string[] = [];

  // Process based on file type
  if (mimeType === 'application/pdf') {
    // Extract text from PDF
    const buffer = readFileSync(filePath);
    const text = await extractPdfText(buffer);
    content = `PDF содержит:\n${text}`;
  } else if (mimeType.startsWith('image/')) {
    // Read image as base64
    const buffer = readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    images.push(dataUrl);
    content = 'Разбери задание на изображении';
  } else {
    throw new Error('Неподдерживаемый тип файла');
  }

  // Send to AI for analysis
  const result = await chatJson<AttachmentAiResult>({
    user,
    messages: [
      { role: 'system', content: SYS_ATTACHMENT },
      { role: 'user', content },
    ],
    schema: attachmentAiSchema,
    images: images.length > 0 ? images : undefined,
    mockType: 'attachment',
  });

  return {
    text: result.data.text,
    topics: result.data.topics,
    difficulty: result.data.difficulty,
    steps: result.data.steps,
    demoMode: result.demoMode,
    notice: result.notice,
  };
}
