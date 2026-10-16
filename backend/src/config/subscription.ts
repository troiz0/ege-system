export interface Plan {
  name: 'PRO_MONTH' | 'PRO_YEAR';
  label: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    name: 'PRO_MONTH',
    label: 'PRO на месяц',
    price: 500,
    currency: 'RUB',
    durationDays: 30,
    features: [
      'Персональный ключ OpenRouter с ежемесячным лимитом',
      'Выбор флагманских моделей (Claude, GPT, Gemini)',
      'Глубокий анализ нагрузки и рисков переутомления',
      'Мультимодальный разбор файлов (Vision)',
      'Разбор пробников с прогнозом балла',
      'Приоритетная генерация плана с динамическим пересчётом',
      'Бейдж PRO',
    ],
  },
  {
    name: 'PRO_YEAR',
    label: 'PRO на учебный год',
    price: 4500,
    currency: 'RUB',
    durationDays: 365,
    features: [
      'Персональный ключ OpenRouter с ежемесячным лимитом',
      'Выбор флагманских моделей (Claude, GPT, Gemini)',
      'Глубокий анализ нагрузки и рисков переутомления',
      'Мультимодальный разбор файлов (Vision)',
      'Разбор пробников с прогнозом балла',
      'Приоритетная генерация плана с динамическим пересчётом',
      'Бейдж PRO',
      'Экономия 1000₽ по сравнению с помесячной оплатой',
    ],
  },
];

export const FREE_FEATURES = [
  'До 3 AI-анализов в неделю (системный пул)',
  'До 5 файлов ДЗ',
  'Базовый расчёт расписания',
  'Ручной ввод тестов',
  'Стандартные материалы',
];

export interface PromoCode {
  code: string;
  discount: number; // процент скидки
  expiresAt?: Date;
}

export const PROMO_CODES: PromoCode[] = [
  { code: 'EGE2027', discount: 10 },
  { code: 'STUDENT2027', discount: 15 },
];

export function getPromoCode(code: string): PromoCode | undefined {
  const promo = PROMO_CODES.find((p) => p.code.toUpperCase() === code.toUpperCase());
  if (!promo) return undefined;
  if (promo.expiresAt && promo.expiresAt < new Date()) return undefined;
  return promo;
}

export function calculatePrice(planName: 'PRO_MONTH' | 'PRO_YEAR', promoCode?: string): number {
  const plan = PLANS.find((p) => p.name === planName);
  if (!plan) return 0;

  let price = plan.price;

  if (promoCode) {
    const promo = getPromoCode(promoCode);
    if (promo) {
      price = price * (1 - promo.discount / 100);
    }
  }

  return Math.round(price * 100) / 100;
}
