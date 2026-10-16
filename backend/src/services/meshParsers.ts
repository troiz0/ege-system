export type Difficulty = 'low' | 'medium' | 'high';
export type Priority = 'low' | 'medium' | 'high';

const RULES: [RegExp, string][] = [
  [/^ров$|разговоры о важном/i, 'Разговоры о важном'],
  [/методы решения физических задач/i, 'Спецкурс по физике'],
  [/физическая культура|физкультура/i, 'Физкультура'],
  [/основы безопасности|^обж$/i, 'ОБЖ'],
  [/алгебра|геометри|математи|вероятность/i, 'Математика'],
  [/информатик/i, 'Информатика'],
  [/русский язык/i, 'Русский язык'],
  [/литератур/i, 'Литература'],
  [/английский|иностранный/i, 'Английский язык'],
  [/^физика/i, 'Физика'],
  [/хими/i, 'Химия'],
  [/биолог/i, 'Биология'],
  [/истори/i, 'История'],
  [/обществознани/i, 'Обществознание'],
  [/географи/i, 'География'],
  [/индивидуальный проект/i, 'Индивидуальный проект'],
];

const HIGH = new Set(['Математика', 'Физика', 'Химия', 'Информатика', 'Спецкурс по физике']);
const LOW = new Set(['Физкультура', 'Разговоры о важном', 'ОБЖ', 'География', 'Индивидуальный проект']);

export function normalizeMeshSubject(raw: string): string {
  let s = raw.trim();
  const hadYear = /^\d{2}\/\d{2}[\s_-]*/.test(s);
  s = s.replace(/^\d{2}\/\d{2}[\s_-]*/, '');
  if (hadYear) s = s.replace(/^\d{1,2}[_\s]+/, '');
  s = s.replace(/[\s_]*\d{1,2}[а-яa-z]{1,2}$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, name] of RULES) if (re.test(s)) return name;
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : raw.trim();
}

export const difficultyFor = (subject: string): Difficulty => (HIGH.has(subject) ? 'high' : LOW.has(subject) ? 'low' : 'medium');

const pad = (n: number): string => String(n).padStart(2, '0');

// "28.09" | "28.09.26" | "28.09.2026" | "2026-09-28" -> "YYYY-MM-DD"; без года берётся ближайшая будущая дата
export function resolveDeadline(input: string, today: Date = new Date()): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (iso) return input.trim();
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const todayStr = today.toISOString().slice(0, 10);
  let year = today.getUTCFullYear();
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  else if (`${year}-${pad(mon)}-${pad(day)}` < todayStr) year += 1;
  const d = new Date(Date.UTC(year, mon - 1, day));
  if (d.getUTCMonth() !== mon - 1) return null;
  return `${year}-${pad(mon)}-${pad(day)}`;
}

export function priorityByDeadline(deadline: string, today: Date = new Date()): Priority {
  const diff = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return diff <= 1 ? 'high' : diff <= 3 ? 'medium' : 'low';
}

export const estimateMinutes = (text: string): number => Math.min(90, Math.max(15, Math.round((15 + text.length / 4) / 5) * 5));
export const hasAttachmentMark = (text: string): boolean => /см\.?\s*файл|задание в файле/i.test(text);
export const isEmptyHomework = (text: string): boolean => /не задано/i.test(text);

export interface ParsedHomework {
  subject: string; title: string; description: string; deadline: string;
  estimatedMinutes: number; priority: Priority; hasAttachmentPlaceholder: boolean;
}

const LINE_RE = /^([^:]+?)\s+на\s+(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*[:\-–—]\s*(.+)$/i;

export function parseHomeworkLine(line: string, today: Date = new Date()): ParsedHomework | null {
  const m = LINE_RE.exec(line.trim());
  if (!m) return null;
  const deadline = resolveDeadline(m[2], today);
  if (!deadline) return null;
  const desc = m[3].trim();
  return {
    subject: normalizeMeshSubject(m[1]),
    title: desc.split(/;|,\s/)[0].slice(0, 60),
    description: desc,
    deadline,
    estimatedMinutes: estimateMinutes(desc),
    priority: priorityByDeadline(deadline, today),
    hasAttachmentPlaceholder: hasAttachmentMark(desc),
  };
}

// Возвращает разобранные строки и строки, которые остаются для AI-фолбэка
export function splitHomework(text: string, today: Date = new Date()): { parsed: ParsedHomework[]; rest: string[] } {
  const parsed: ParsedHomework[] = [];
  const rest: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !isEmptyHomework(l))) {
    const p = parseHomeworkLine(line, today);
    if (p) parsed.push(p); else rest.push(line);
  }
  return { parsed, rest };
}
