import type { MeshAttachment, MeshDiarySync } from './types';

const SNAPSHOT_KEY = 'mesh_diary_snapshot';

/** Нормализация вложения (старые снапшоты хранили attachments как string[]). */
function normalizeAttachment(a: unknown): MeshAttachment {
  if (typeof a === 'string') {
    return { name: a, url: null, kind: 'material', action: null };
  }
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>;
    const name = typeof o.name === 'string' && o.name ? o.name : 'Материал';
    const url = typeof o.url === 'string' ? o.url : null;
    const kind =
      o.kind === 'file' || o.kind === 'test' || o.kind === 'material'
        ? o.kind
        : url
          ? 'file'
          : 'material';
    const action = typeof o.action === 'string' ? o.action : null;
    return { name, url, kind, action };
  }
  return { name: 'Материал', url: null, kind: 'material', action: null };
}

/** Локальный кэш последней синхронизации дневника МЭШ (localStorage). */
export function loadDiarySnapshot(): MeshDiarySync | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeshDiarySync;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.marks)) return null;
    if (Array.isArray(parsed.homeworks)) {
      for (const hw of parsed.homeworks) {
        hw.attachments = (hw.attachments ?? []).map(normalizeAttachment);
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDiarySnapshot(snapshot: MeshDiarySync): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage недоступен — работаем без кэша */
  }
}

export function clearDiarySnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/** Сегодняшняя дата в локальном часовом поясе, YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysIso(iso: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + deltaDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Цвет среднего балла по новым порогам 5-балльной шкалы. */
export function gradeColor(avg: number): string {
  if (avg >= 4.51) return 'text-green-400';
  if (avg >= 3.51) return 'text-yellow-400';
  if (avg >= 2.51) return 'text-orange-400';
  return 'text-red-400';
}

/** Пороги четвертных оценок: для «3» — от 2.51, для «4» — от 3.51, для «5» — от 4.51. */
export const GRADE_THRESHOLDS = { three: 2.51, four: 3.51, five: 4.51 } as const;

function pluralizeFives(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'пятёрку';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'пятёрки';
  return 'пятёрок';
}

/**
 * Калькулятор «сколько пятёрок нужно до следующего балла».
 * S — сумма оценок (в 5-балльной шкале), N — их количество.
 * Формула среднего арифметического: ceil((порог * N - S) / (5 - порог)).
 */
export function nextGradeInfo(avg: number, sum: number, count: number): string | null {
  if (!Number.isFinite(avg) || count <= 0) return null;
  const need = (threshold: number): number => {
    const raw = (threshold * count - sum) / (5 - threshold);
    return raw <= 0 ? 0 : Math.ceil(raw);
  };
  if (avg >= GRADE_THRESHOLDS.five) return 'Текущая оценка: 5 (отлично)';
  if (avg >= GRADE_THRESHOLDS.four) {
    const n = need(GRADE_THRESHOLDS.five);
    return `До «5» (4.51): нужно получить ${n} ${pluralizeFives(n)}`;
  }
  if (avg >= GRADE_THRESHOLDS.three) {
    const n = need(GRADE_THRESHOLDS.four);
    return `До «4» (3.51): нужно получить ${n} ${pluralizeFives(n)}`;
  }
  const n = need(GRADE_THRESHOLDS.three);
  return `До «3» (2.51): нужно получить ${n} ${pluralizeFives(n)}`;
}

export function formatDateRu(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «Понедельник» — день недели заглавными (первая буква заглавная). */
export function formatWeekdayRu(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const s = d.toLocaleDateString('ru-RU', { weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «Понедельник, 5 октября» — для секций будущих заданий. */
export function formatDayRu(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const s = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «Пятница, 2 октября 2026 г.» — для шапки расписания. */
export function formatDateWeekdayRu(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const s = d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatShortDateRu(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Имя файла протокола: `${subject}_EGE_result.pdf` (как на бэкенде). */
export function egePdfFilename(subject: string): string {
  const cleaned = subject
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .trim();
  return `${cleaned.length > 0 ? cleaned : 'mesh'}_EGE_result.pdf`;
}

/** Сохраняет Blob на диск пользователя (качественный аналог `download`). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
