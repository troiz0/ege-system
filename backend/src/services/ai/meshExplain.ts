import type { User } from '@prisma/client';
import { extractPdfText } from './pdfText';
import { chatJson } from './openrouterClient';
import { explainAiSchema, type ExplainAiResult } from '../../ai/schemas';
import { SYS_EXPLAIN } from '../../ai/prompts';

export interface MeshExplainInput {
  subject?: string;
  description?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  meshToken?: string;
}

export interface MeshExplainResult extends ExplainAiResult {
  sourceName: string;
  demoMode: boolean;
  notice?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 8000;
const MESH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function isAllowedFileUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    // SSRF-guard: качаем только https-ссылки МЭШ
    return u.protocol === 'https:' && /(^|\.)mos\.ru$/.test(u.hostname);
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(last) || 'файл МЭШ';
  } catch {
    return 'файл МЭШ';
  }
}

function guessKind(url: string, contentType: string): 'pdf' | 'image' | 'text' | 'unknown' {
  const ct = contentType.toLowerCase();
  if (ct.includes('pdf') || /\.pdf(\?|$)/i.test(url)) return 'pdf';
  if (ct.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return 'image';
  if (ct.startsWith('text/') || /\.(txt|md|csv)(\?|$)/i.test(url)) return 'text';
  return 'unknown';
}

async function downloadAttachment(
  url: string,
  meshToken?: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const headers: Record<string, string> = { 'User-Agent': MESH_UA };
  if (meshToken) {
    headers['Auth-Token'] = meshToken;
    headers.Cookie = `auth_token=${meshToken}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Не удалось скачать файл МЭШ (статус ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error('Скачан пустой файл');
  if (buffer.length > MAX_BYTES) throw new Error('Файл слишком большой для разбора (макс. 8 МБ)');
  return { buffer, contentType: res.headers.get('content-type') ?? '' };
}

/**
 * AI-разбор задания из МЭШ: текст ДЗ и/или прикреплённый файл
 * (PDF/текст извлекаем, изображения шлём мультимодально).
 */
export async function explainMeshAttachment(
  user: User,
  input: MeshExplainInput
): Promise<MeshExplainResult> {
  if (user.subscriptionTier !== 'PRO' && !user.isDemo) {
    throw new Error('AI-разбор файлов доступен только в тарифе PRO');
  }
  const description = input.description?.trim() ?? '';
  if (!input.attachmentUrl && !description) {
    throw new Error('Нет файла и текста задания для разбора');
  }

  let content = `Предмет: ${input.subject?.trim() || '—'}`;
  if (description) content += `\nЗадание: ${description}`;
  const images: string[] = [];
  let sourceName = 'текст задания';

  if (input.attachmentUrl) {
    if (!isAllowedFileUrl(input.attachmentUrl)) {
      throw new Error('Ссылка должна вести на файл school.mos.ru по https');
    }
    const fallbackName = input.attachmentName?.trim() || fileNameFromUrl(input.attachmentUrl);
    sourceName = fallbackName;
    // Файл может не скачаться (сеть, права, формат) — НЕ валим разбор:
    // деградируем до текста задания + названия файла.
    try {
      const { buffer, contentType } = await downloadAttachment(input.attachmentUrl, input.meshToken);
      const kind = guessKind(input.attachmentUrl, contentType);
      if (kind === 'pdf') {
        const text = await extractPdfText(buffer);
        content += `\n\nТекст из PDF «${sourceName}»:\n${text.slice(0, MAX_TEXT)}`;
      } else if (kind === 'image') {
        const mime = contentType.split(';')[0].trim() || 'image/jpeg';
        images.push(`data:${mime};base64,${buffer.toString('base64')}`);
        content += `\n\nК заданию приложено изображение «${sourceName}» — разбери его.`;
      } else if (kind === 'text') {
        content += `\n\nТекст файла «${sourceName}»:\n${buffer.toString('utf8').slice(0, MAX_TEXT)}`;
      } else {
        content += `\n\nК заданию приложен файл «${sourceName}» (тип ${contentType || 'неизвестен'}) — разбери задание по описанию.`;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[mesh-explain] файл недоступен (${sourceName}): ${reason} — разбор по тексту`);
      content += `\n\nФайл «${sourceName}» скачать не удалось. Разбери задание по тексту и дай ключевую теорию, формулы и типовые ловушки ЕГЭ по этой теме.`;
    }
  }

  const result = await chatJson<ExplainAiResult>({
    user,
    messages: [
      { role: 'system', content: SYS_EXPLAIN },
      { role: 'user', content },
    ],
    schema: explainAiSchema,
    images: images.length > 0 ? images : undefined,
    mockType: 'explain',
  });
  return { ...result.data, sourceName, demoMode: result.demoMode, notice: result.notice };
}
