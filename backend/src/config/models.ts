import { PRO_KEY_LIMIT_USD } from './limits.js';

// Уровни 1..5, где 5 = лучше всегда (быстрее / экономнее / мощнее). Цена в $ за 1M токенов - ТОЛЬКО на backend.
// Цены сверены с OpenRouter на 29.09.2026.
export interface ModelInfo {
  slug: string;
  label: string;
  description: string;
  speed: 1 | 2 | 3 | 4 | 5;
  economy: 1 | 2 | 3 | 4 | 5;
  power: 1 | 2 | 3 | 4 | 5;
  vision: boolean;
  recommended: boolean;
  inPerM: number;
  outPerM: number;
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: 'allow' | 'deny';
  };
}

export const MODELS: ModelInfo[] = [
  {
    slug: 'google/gemini-3.8-flash:online',
    label: 'Gemini 3.8 Flash',
    description: 'Лучший баланс: быстро отвечает и хорошо рассуждает. Понимает фото и PDF. Подходит для большинства задач подготовки.',
    speed: 4,
    economy: 4,
    power: 4,
    vision: true,
    recommended: true,
    inPerM: 0.75,
    outPerM: 3.75,
    provider: {
      order: ['google-ai-studio/flex'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'openai/gpt-6.1-sol:online',
    label: 'GPT-6.1 Sol',
    description: 'Самая быстрая и лёгкая модель для оперативного разбора ДЗ, коротких советов и экспресс-ответов.',
    speed: 5,
    economy: 5,
    power: 3,
    vision: true,
    recommended: false,
    inPerM: 0.2,
    outPerM: 1.2,
    provider: {
      order: ['openai/flex'],
      allow_fallbacks: true,
    },
  },
  {
    slug: 'deepseek/deepseek-v4.1-flash:online',
    label: 'DeepSeek V4.1 Flash',
    description: 'Очень экономная модель с сильным рассуждением. Лимит почти не тратит, удобна для частых запросов и конспектов.',
    speed: 4,
    economy: 5,
    power: 4,
    vision: true,
    recommended: false,
    inPerM: 0.3,
    outPerM: 1.2,
    provider: {
      order: ['baidu/fp8'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'anthropic/claude-haiku-5.5:online',
    label: 'Claude Haiku 5.5',
    description: 'Сверхбыстрая и точная модель Anthropic. Отличная скорость формулирования ответов и экономия лимита.',
    speed: 5,
    economy: 5,
    power: 4,
    vision: true,
    recommended: false,
    inPerM: 0.4,
    outPerM: 1.8,
    provider: {
      order: ['google-vertex/global'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'openai/gpt-6-astra:online',
    label: 'GPT-6 Astra',
    description: 'Продвинутая модель OpenAI нового поколения. Высокая точность рассуждений, разбора формул и задач Части 1 и 2.',
    speed: 4,
    economy: 4,
    power: 4,
    vision: true,
    recommended: false,
    inPerM: 0.6,
    outPerM: 2.5,
    provider: {
      order: ['openai/flex'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'google/gemini-4-argon:online',
    label: 'Gemini 4 Argon',
    description: 'Флагманская сверхтяжёлая модель нового поколения. Максимальная глубина рассуждений, доказательств и сложнейших задач Части 2.',
    speed: 2,
    economy: 2,
    power: 5,
    vision: true,
    recommended: false,
    inPerM: 2.5,
    outPerM: 12.5,
    provider: {
      order: ['google-ai-studio/flex'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'anthropic/claude-sonnet-5.5:online',
    label: 'Claude Sonnet 5.5',
    description: 'Глубокий анализ нагрузки и рисков, аккуратный разбор пробников и рукописных решений Части 2.',
    speed: 3,
    economy: 2,
    power: 4,
    vision: true,
    recommended: false,
    inPerM: 2.0,
    outPerM: 10.0,
    provider: {
      order: ['amazon-bedrock'],
      allow_fallbacks: false,
    },
  },
  {
    slug: 'anthropic/claude-opus-5.5:online',
    label: 'Claude Opus 5.5',
    description: 'Максимальная мощность для самых сложных разборов. Отвечает основательно и тратит лимит быстрее всех.',
    speed: 2,
    economy: 1,
    power: 5,
    vision: true,
    recommended: false,
    inPerM: 5.0,
    outPerM: 25.0,
    provider: {
      order: ['google-vertex/global'],
      allow_fallbacks: false,
    },
  },
];

export const isAllowedModel = (slug: string): boolean => {
  const normalized = slug.endsWith(':online') ? slug : `${slug}:online`;
  return MODELS.some(
    (m) =>
      m.slug === normalized ||
      m.slug === slug ||
      m.slug.replace(/:online$/, '') === slug.replace(/:online$/, '')
  );
};

export const getModel = (slug: string): ModelInfo | undefined => {
  const normalized = slug.endsWith(':online') ? slug : `${slug}:online`;
  return MODELS.find(
    (m) =>
      m.slug === normalized ||
      m.slug === slug ||
      m.slug.replace(/:online$/, '') === slug.replace(/:online$/, '')
  );
};

export function getModelProviderConfig(modelSlug: string): { order?: string[]; allow_fallbacks?: boolean } | undefined {
  const clean = modelSlug.replace(/:online$/, '');
  const m = MODELS.find(
    (item) => item.slug === modelSlug || item.slug.replace(/:online$/, '') === clean
  );
  return m?.provider;
}

export function toCanonicalModelSlug(slug?: string | null): string {
  if (!slug) return MODELS[0].slug;
  const clean = slug.replace(/:online$/, '');
  const m = MODELS.find(
    (item) => item.slug === slug || item.slug.replace(/:online$/, '') === clean
  );
  return m ? m.slug : `${clean}:online`;
}

const TYPICAL_IN = 8000;
const TYPICAL_OUT = 3000;

export function niceRound(n: number): number {
  if (n < 20) return Math.max(1, Math.floor(n));
  if (n < 100) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

export function approxRequestsPerMonth(m: Pick<ModelInfo, 'inPerM' | 'outPerM'>): number {
  const perRequest = (TYPICAL_IN * m.inPerM + TYPICAL_OUT * m.outPerM) / 1_000_000;
  return niceRound(PRO_KEY_LIMIT_USD / perRequest);
}

export interface PublicModel {
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

export const toPublicModel = (m: ModelInfo): PublicModel => ({
  slug: m.slug,
  label: m.label,
  description: m.description,
  speed: m.speed,
  economy: m.economy,
  power: m.power,
  vision: m.vision,
  recommended: m.recommended,
  approxRequests: approxRequestsPerMonth(m),
});
