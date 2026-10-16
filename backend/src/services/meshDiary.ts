/**
 * MeshDiaryService — сбор данных дневника МЭШ (school.mos.ru) по сохранённому
 * токену авторизации: профиль, расписание, домашние задания, оценки с темами
 * уроков, пробники ЕГЭ/ГИА и скачивание протоколов.
 *
 * ВАЖНО: серверы *.mos.ru блокируют запросы, пришедшие через прокси/VPN
 * (403 «You're not allowed...»). Поэтому запросы к МЭШ обязаны идти НАПРЯМУЮ,
 * минуя HTTP(S)_PROXY — за это отвечает ensureMeshNoProxy() ниже.
 */

import { normalizeMeshToken } from './meshAuth.js';

const MESH_BASE = 'https://school.mos.ru';
const STUDENT_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

/** Домены МЭШ, которые никогда не ходят через прокси (WAF mos.ru режет прокси). */
export const MESH_DIRECT_HOSTS = ['mos.ru', 'school.mos.ru', 'dnevnik.mos.ru'];

/**
 * Гарантирует, что NO_PROXY/no_proxy содержат домены МЭШ. Процесс бэкенда
 * запускается с NODE_USE_ENV_PROXY=1 (нужен OpenRouter), и без этого fetch()
 * отправляет запросы к school.mos.ru через прокси — МЭШ отвечает 403,
 * который раньше маскировался под «токен недействителен».
 * Вызывается при загрузке модуля (см. низ HTTP-секции).
 */
export function ensureMeshNoProxy(): boolean {
  let changed = false;
  for (const key of ['NO_PROXY', 'no_proxy']) {
    const current = (process.env[key] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const missing = MESH_DIRECT_HOSTS.filter((h) => !current.includes(h));
    if (missing.length > 0) {
      process.env[key] = [...current, ...missing].join(',');
      changed = true;
    }
  }
  return changed;
}

export class MeshDiaryError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'MeshDiaryError';
    this.status = status;
  }
}

export interface MeshStudent {
  studentId: string;
  name: string | null;
  className: string | null;
}

export interface MeshLesson {
  start: string;
  end: string | null;
  subject: string;
  topic: string | null;
  room: string | null;
  teacher: string | null;
}

export interface MeshAttachment {
  /** Название файла/материала. */
  name: string;
  /** Прямая ссылка на файл (школьный ej/attachments) либо null. */
  url: string | null;
  /** file — скачиваемый файл; test — тест ЦДЗ; material — материал библиотеки. */
  kind: 'file' | 'test' | 'material';
  /** Действие из МЭШ («Пройти», «Изучить») либо null. */
  action: string | null;
}

export interface MeshHomework {
  subject: string;
  description: string;
  deadline: string | null;
  attachments: MeshAttachment[];
  /** Отмечено выполненным в дневнике МЭШ (is_done). */
  done: boolean;
}

export interface MeshMark {
  subject: string;
  value: number;
  weight: number;
  topic: string | null;
  date: string | null;
}

export interface MeshSubjectGroup {
  subject: string;
  average: number;
  marks: MeshMark[];
}

export interface MeshDiagnostic {
  testId: string;
  subject: string;
  date: string | null;
  score: number | null;
  percent: number | null;
  status: string | null;
  reportUrl: string | null;
}

export interface MeshDiarySync {
  syncedAt: string;
  student: MeshStudent;
  scheduleDate: string;
  schedule: MeshLesson[];
  homeworks: MeshHomework[];
  marks: MeshSubjectGroup[];
  diagnostics: MeshDiagnostic[];
  counts: {
    lessons: number;
    homeworks: number;
    marks: number;
    subjects: number;
    diagnostics: number;
  };
  errors: string[];
}

type Obj = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Утилиты разбора JSON                                                */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const pad2 = (n: number): string => String(n).padStart(2, '0');

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  const lower = new Map<string, unknown>();
  for (const k of Object.keys(o)) lower.set(k.toLowerCase(), o[k]);
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => str(x)).filter((x): x is string => x !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (isObj(v)) return str(pick(v, ['full_name', 'name', 'short_name', 'title', 'label']));
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (isObj(v)) return num(pick(v, ['value', 'score', 'id']));
  return null;
}

function unwrapRoot(json: unknown): unknown {
  if (!isObj(json)) return json;
  for (const k of ['data', 'result', 'payload']) {
    const v = json[k];
    if (isObj(v) || Array.isArray(v)) return v;
  }
  return json;
}

/** Все массивы в JSON уровнем вверх (снаружи внутрь), глубина ограничена. */
function allArrays(root: unknown, maxDepth = 8): unknown[][] {
  const out: unknown[][] = [];
  const seen = new Set<unknown>();
  let queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (depth > maxDepth || node === null || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      out.push(node);
      for (const x of node) queue.push({ node: x, depth: depth + 1 });
    } else if (isObj(node)) {
      for (const v of Object.values(node)) queue.push({ node: v, depth: depth + 1 });
    }
  }
  return out;
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Начало текущего учебного года (1 сентября): если сейчас сентябрь или позже —
 * 1 сентября этого года, иначе — прошлого. Оценки и ДЗ тянем с этой даты.
 */
export function schoolYearStart(now: Date = new Date()): string {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-09-01`;
}

/** Сегодня локальной датой YYYY-MM-DD. */
export function todayLocalIso(now: Date = new Date()): string {
  return localIso(now);
}

/** Сдвиг ISO-даты на deltaDays дней (горизонт будущих ДЗ: +30). */
export function addDaysIso(iso: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + deltaDays);
  return localIso(d);
}

/**
 * Конец горизонта домашних заданий: +14 дней от сегодня.
 * API МЭШ отсекает задания с дедлайном позже `to`, поэтому тянем с запасом
 * на две недели вперёд — иначе ДЗ на следующую неделю не попадут в выдачу.
 */
export function homeworkHorizonEnd(now: Date = new Date()): string {
  return addDaysIso(localIso(now), 14);
}

function parseIsoDay(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoOfDayTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Режет диапазон [from, to] (включительно) на отрезки по chunkDays дней.
 * API МЭШ не любит слишком широкие интервалы — идём отрезками по ~4 недели.
 */
export function splitRange(from: string, to: string, chunkDays = 28): Array<[string, string]> {
  const start = parseIsoDay(from);
  const end = parseIsoDay(to);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || chunkDays < 1) return [];
  const out: Array<[string, string]> = [];
  const step = chunkDays * 86_400_000;
  let cur = start;
  while (cur <= end) {
    const segEnd = Math.min(cur + step - 86_400_000, end);
    out.push([isoOfDayTs(cur), isoOfDayTs(segEnd)]);
    cur = segEnd + 86_400_000;
  }
  return out;
}

/** Нормализует дату любого вида в YYYY-MM-DD (или исходную строку, если формат неизвестен). */
export function normalizeDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? null : localIso(d);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ ,T]+.*)?$/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return s;
    return `${year}-${pad2(mon)}-${pad2(day)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return localIso(d);
    return s.slice(0, 10);
  }
  if (/^\d{1,2}:\d{2}/.test(s)) return null;
  return s;
}

/* ------------------------------------------------------------------ */
/* HTTP-клиент school.mos.ru (СТРОГО напрямую, без прокси)               */
/* ------------------------------------------------------------------ */

/** Браузерный User-Agent: WAF mos.ru режет дефолтные UA node/undici (403). */
const MESH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function meshHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    // Family Web API school.mos.ru ждёт токен и в заголовках, и в куке
    // auth_token (как у браузерной сессии после входа) — без полного набора
    // служебных заголовков edge отдаёт 403 «You're not allowed...».
    // Двойного «Bearer» нет — токен предварительно нормализован.
    'Auth-Token': token,
    Authorization: `Bearer ${token}`,
    'X-Mes-Subsystem': 'familyweb',
    'Client-Type': 'student',
    Origin: 'https://school.mos.ru',
    Referer: 'https://school.mos.ru/',
    Cookie: `auth_token=${token}`,
    'User-Agent': MESH_USER_AGENT,
    ...extra,
  };
}

/** Маска токена для логов (первые/последние 4 символа, середина скрыта). */
function maskForLog(token: string): string {
  if (token.length <= 10) return '••••';
  return `${token.slice(0, 4)}…${token.slice(-4)} (len=${token.length})`;
}

function logMeshUpstream(url: string, status: number, bodyHead: string): void {
  console.error(
    `[mesh] upstream GET ${url} -> ${status}; body: ${bodyHead.slice(0, 500)}`
  );
}

function isAllowedMeshUrl(raw: string): boolean {
  try {
    const u = new URL(raw, MESH_BASE);
    return u.protocol === 'https:' && /(^|\.)mos\.ru$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function meshFetch(
  rawToken: string,
  pathOrUrl: string,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const token = normalizeMeshToken(rawToken);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${MESH_BASE}${pathOrUrl}`;
  if (!isAllowedMeshUrl(url)) {
    throw new MeshDiaryError('Недопустимый адрес в МЭШ', 400);
  }
  let res: Response;
  try {
    console.error(`[mesh] GET ${url} (token ${maskForLog(token)})`);
    res = await fetch(url, {
      method: 'GET',
      headers: meshHeaders(token, extraHeaders),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[mesh] network error GET ${url}: ${msg}`);
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new MeshDiaryError('МЭШ не отвечает (таймаут)', 504);
    }
    throw new MeshDiaryError(`Нет связи с school.mos.ru: ${msg}`, 502);
  }
  if (res.status === 401) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    logMeshUpstream(url, 401, body);
    throw new MeshDiaryError(
      'Токен МЭШ недействителен или истёк — отвяжите профиль и подключите заново',
      401
    );
  }
  if (res.status === 403) {
    // 403 от МЭШ: токен не принят API (нужен свежий auth_token браузерной
    // сессии school.mos.ru) либо запрос отклонён edge. Детали — в логе выше.
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    logMeshUpstream(url, 403, body);
    throw new MeshDiaryError(
      'МЭШ отклонил запрос (403) — скопируйте свежий токен со страницы school.mos.ru ' +
        '(auth_token), отвяжите профиль и подключите заново. Если не поможет — попробуйте позже',
      403
    );
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    logMeshUpstream(url, res.status, body);
    // Пробрасываем upstream-статус как есть (404/429/5xx), чтобы вызывающий код
    // мог различать «нет данных» и настоящие сбои.
    throw new MeshDiaryError(`МЭШ вернул ошибку ${res.status}`, res.status);
  }
  return res;
}

// Домены МЭШ — напрямую, без прокси (см. ensureMeshNoProxy выше).
ensureMeshNoProxy();

async function meshJson(
  token: string,
  path: string,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  const res = await meshFetch(token, path, extraHeaders);
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new MeshDiaryError('МЭШ вернул некорректный JSON', 502);
  }
}

/* ------------------------------------------------------------------ */
/* Профиль: student_id                                                 */
/* ------------------------------------------------------------------ */

export function parseStudent(json: unknown): MeshStudent {
  const root = unwrapRoot(json);
  if (!isObj(root)) throw new MeshDiaryError('Пустой профиль МЭШ', 502);
  const children = Array.isArray(root.children) ? root.children : [];
  const child = children.find(isObj) ?? null;
  const studentIdRaw =
    (child ? pick(child, ['id', 'contingent_guid', 'student_id']) : null) ??
    pick(root, ['contingent_guid', 'student_id', 'id']);
  const studentId = str(studentIdRaw);
  if (!studentId) {
    throw new MeshDiaryError('Не удалось получить student_id из профиля МЭШ', 502);
  }
  return {
    studentId,
    name: (child ? str(pick(child, ['full_name', 'name', 'fio'])) : null) ??
      str(pick(root, ['full_name', 'name'])),
    className:
      (child ? str(pick(child, ['class_name', 'className', 'klass', 'grade'])) : null) ?? null,
  };
}

const studentCache = new Map<string, { student: MeshStudent; at: number }>();

export async function getMeshStudent(rawToken: string): Promise<MeshStudent> {
  const token = normalizeMeshToken(rawToken);
  const hit = studentCache.get(token);
  if (hit && Date.now() - hit.at < STUDENT_TTL_MS) return hit.student;
  const json = await meshJson(token, '/api/family/web/v1/profile');
  const student = parseStudent(json);
  if (studentCache.size > 200) studentCache.clear();
  studentCache.set(token, { student, at: Date.now() });
  return student;
}

/* ------------------------------------------------------------------ */
/* Расписание на день                                                  */
/* ------------------------------------------------------------------ */

const TIME_KEYS = [
  'start_time', 'start', 'begin', 'begin_time', 'beginTime', 'lesson_start', 'time_start', 'timeFrom', 'from', 'time',
];
const END_KEYS = ['end_time', 'end', 'endTime', 'finish', 'lesson_end', 'time_end', 'timeTo', 'to'];
const SUBJECT_KEYS = [
  'subject', 'subject_name', 'lesson_name',
  'course_name', 'courseName', 'discipline_name', 'disciplineName',
  'activity_name', 'activityName', 'plan_theme', 'planTheme',
  'name', 'title', 'discipline',
];
const LESSON_TOPIC_KEYS = [
  'lesson_name', 'lesson_topic', 'topic', 'topic_name', 'theme', 'plan_theme', 'planTheme',
];
const ROOM_KEYS = ['room', 'room_name', 'auditory', 'auditorium', 'cabinet', 'classroom', 'place'];
const TEACHER_KEYS = ['teacher', 'teacher_name', 'teacherFio', 'educator', 'full_name', 'fio', 'employee'];

function isGenericPlaceholder(name: string | null | undefined): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();
  return lower === 'занятие' || lower === 'урок' || lower === 'внеурочная деятельность' || lower === 'внеурочка';
}

function subjectOf(o: Obj): string | null {
  // 1. Ищем специфические поля внеурочки / курсов / активностей:
  for (const k of ['activity_name', 'activityName', 'course_name', 'courseName', 'discipline_name', 'disciplineName']) {
    const val = str(o[k]);
    if (val && !isGenericPlaceholder(val)) return val.trim();
  }

  // 2. Прямой предмет
  for (const k of ['subject_name', 'subject', 'lesson_name', 'discipline', 'name', 'title']) {
    const val = str(o[k]);
    if (val && !isGenericPlaceholder(val)) return val.trim();
  }

  // 3. Вложенный план: curriculum_plan (элективы/внеурочка)
  const cp = o.curriculum_plan;
  if (isObj(cp)) {
    for (const k of ['activity_name', 'activityName', 'course_name', 'courseName', 'theme_name', 'theme', 'name', 'title']) {
      const val = str(cp[k]);
      if (val && !isGenericPlaceholder(val)) return val.trim();
    }
  }

  // 4. Вложенные details
  const details = o.details;
  if (isObj(details)) {
    for (const k of ['activity_name', 'activityName', 'course_name', 'courseName', 'theme_name', 'theme', 'name', 'topic', 'lesson_topic']) {
      const val = str(details[k]);
      if (val && !isGenericPlaceholder(val)) return val.trim();
    }
  }

  // 5. Тема урока или внеурочки как название предмета (например, "Разговоры о важном")
  for (const k of LESSON_TOPIC_KEYS) {
    const val = str(o[k]);
    if (val && !isGenericPlaceholder(val)) return val.trim();
  }

  // 6. Любое непустое значение
  const direct = str(pick(o, SUBJECT_KEYS));
  return direct;
}

function lessonLike(o: Obj): boolean {
  if (pick(o, TIME_KEYS) !== null) return true;
  return (
    pick(o, SUBJECT_KEYS) !== null &&
    (pick(o, END_KEYS) !== null || pick(o, ROOM_KEYS) !== null || pick(o, TEACHER_KEYS) !== null)
  );
}

function parseLesson(o: Obj): MeshLesson | null {
  let start = str(pick(o, TIME_KEYS));
  let end = str(pick(o, END_KEYS));
  if (!end && start && /\d{1,2}:\d{2}/.test(start) && /[-–—]/.test(start)) {
    const [a, b] = start.split(/[-–—]/);
    start = a.trim();
    end = b?.trim() || null;
  }
  let subject = subjectOf(o);
  if (!subject && !start) return null;
  let topic = str(pick(o, LESSON_TOPIC_KEYS));

  // Если subject остался пустым или плейсхолдером, но есть тема — ставим тему в subject
  if ((!subject || isGenericPlaceholder(subject)) && topic && !isGenericPlaceholder(topic)) {
    subject = topic;
    topic = null;
  }

  // lesson_name одновременно предмет и тема — не дублируем
  if (topic && subject && topic.trim().toLowerCase() === subject.trim().toLowerCase()) {
    topic = null;
  }

  return {
    start: start ?? '',
    end,
    subject: subject ?? 'Занятие',
    topic,
    room: str(pick(o, ROOM_KEYS)),
    teacher: str(pick(o, TEACHER_KEYS)),
  };
}

export function parseSchedule(json: unknown): MeshLesson[] {
  const root = unwrapRoot(json);
  const arrays = allArrays(root);
  let best: Obj[] = [];
  for (const a of arrays) {
    const items = a.filter(isObj);
    if (items.length === 0) continue;
    const hits = items.filter(lessonLike).length;
    if (hits > 0 && hits >= Math.ceil(items.length / 2)) {
      best = items;
      break;
    }
    if (best.length === 0 && hits > 0) best = items;
  }
  const lessons: MeshLesson[] = [];
  for (const item of best) {
    const lesson = parseLesson(item);
    if (lesson) lessons.push(lesson);
  }
  lessons.sort((x, y) => (x.start || 'zz').localeCompare(y.start || 'zz', 'ru'));
  return lessons;
}

export async function getMeshSchedule(
  token: string,
  studentId: string,
  date: string
): Promise<MeshLesson[]> {
  const json = await meshJson(
    token,
    `/api/family/web/v1/schedule/short?student_id=${encodeURIComponent(studentId)}&dates=${encodeURIComponent(date)}`,
    { 'Profile-Id': studentId }
  );
  return parseSchedule(json);
}

/* ------------------------------------------------------------------ */
/* Домашние задания                                                    */
/* ------------------------------------------------------------------ */

const DESC_KEYS = ['description', 'text', 'task', 'content', 'homework_text', 'homework', 'assignment'];
const DEADLINE_KEYS = ['due_date', 'dueDate', 'deadline', 'date_to', 'end_date', 'till_date', 'control_date', 'date'];
const HW_SUBJECT_KEYS = ['subject_name', 'subject', 'lesson', 'lesson_name', 'discipline'];
const ATTACH_KEYS = ['attachments', 'files', 'materials', 'links', 'documents', 'resources'];
const DONE_KEYS = ['is_done', 'isDone', 'done', 'completed', 'has_written_solution'];
const DONE_STATUS_KEYS = ['status', 'homework_status', 'state'];
const DONE_STATUS_VALUES = ['done', 'completed', 'выполнено', 'выполнена', 'готово'];

/** true для true/1/'1'/'true' (флаг выполнения ДЗ в МЭШ). */
function boolFlag(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

/** Выполнено ли ДЗ по флагам МЭШ (is_done/done/… или status = done/completed). */
function isDoneHomework(o: Obj): boolean {
  if (boolFlag(pick(o, DONE_KEYS))) return true;
  const st = str(pick(o, DONE_STATUS_KEYS));
  return !!st && DONE_STATUS_VALUES.includes(st.toLowerCase());
}
const ATTACH_NAME_KEYS = ['title', 'name', 'file_name', 'filename', 'fileName', 'label'];
const ATTACH_URL_KEYS = ['url', 'link', 'href', 'file_url', 'fileUrl', 'src', 'download_url'];

/** Имя файла из URL (последний сегмент пути, URL-декодированный). */
function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    const decoded = decodeURIComponent(last);
    return decoded || url;
  } catch {
    return url;
  }
}

/** Первый http(s)-URL из urls[]-массива материала либо прямых полей ссылки. */
function attachmentUrlOf(item: Obj): string | null {
  const urls = item.urls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === 'string' && /^https?:\/\//.test(u.trim())) return u.trim();
      if (isObj(u)) {
        const s = str(pick(u, ATTACH_URL_KEYS));
        if (s && /^https?:\/\//.test(s)) return s;
      }
    }
  }
  const direct = str(pick(item, ATTACH_URL_KEYS));
  if (direct && /^https?:\/\//.test(direct)) return direct;
  return null;
}

function attachmentKindOf(item: Obj, url: string | null): MeshAttachment['kind'] {
  if (str(pick(item, ['type'])) === 'test_spec_binding') return 'test';
  if (url) return 'file';
  return 'material';
}

/**
 * Вложения ДЗ. МЭШ кладёт их в materials[]: type 'attachments' — реальные файлы
 * (urls[].url вида school.mos.ru/ej/attachments/...), остальные типы
 * (test_spec_binding, atomic_object, ...) — тесты ЦДЗ/материалы библиотеки
 * с uuid/title/action_name, но без прямых ссылок — отдаём их карточками без URL.
 */
export function parseAttachments(o: Obj): MeshAttachment[] {
  const out: MeshAttachment[] = [];
  const seen = new Set<string>();
  const push = (a: MeshAttachment): void => {
    const key = `${a.url ?? ''}::${a.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  for (const key of ATTACH_KEYS) {
    const v = o[key];
    if (v === undefined || v === null || v === '') continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      if (typeof item === 'string') {
        const s = item.trim();
        if (!s) continue;
        const url = /^https?:\/\//.test(s) ? s : null;
        push({ name: url ? fileNameFromUrl(s) : s, url, kind: url ? 'file' : 'material', action: null });
        continue;
      }
      if (!isObj(item)) continue;
      const name = str(pick(item, ATTACH_NAME_KEYS)) ?? str(pick(item, ['description']));
      const url = attachmentUrlOf(item);
      if (!name && !url) continue;
      push({
        name: name ?? (url ? fileNameFromUrl(url) : 'Материал'),
        url,
        kind: attachmentKindOf(item, url),
        action: str(pick(item, ['action_name', 'action'])),
      });
    }
  }
  return out;
}

/** Ключи, внутрь которых не спускаемся при сборе ДЗ (вложения — листья). */
const NO_DESCEND_KEYS = new Set(ATTACH_KEYS);

function collectHomeworks(node: unknown, inheritedSubject: string | null, out: MeshHomework[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collectHomeworks(x, inheritedSubject, out);
    return;
  }
  if (!isObj(node)) return;
  const subject = str(pick(node, HW_SUBJECT_KEYS)) ?? inheritedSubject;
  const description = str(pick(node, DESC_KEYS));
  if (description && (subject || pick(node, DEADLINE_KEYS) !== null)) {
    out.push({
      subject: subject ?? 'Без предмета',
      description,
      deadline: normalizeDate(pick(node, DEADLINE_KEYS)),
      attachments: parseAttachments(node),
      done: isDoneHomework(node),
    });
  }
  for (const [k, v] of Object.entries(node)) {
    if (NO_DESCEND_KEYS.has(k)) continue;
    if (Array.isArray(v) || isObj(v)) collectHomeworks(v, subject, out);
  }
}

export function parseHomeworks(json: unknown): MeshHomework[] {
  const out: MeshHomework[] = [];
  collectHomeworks(unwrapRoot(json), null, out);
  return out;
}

/** Ключ дедупликации ДЗ при склейке отрезков дат. */
export function homeworkKey(h: MeshHomework): string {
  const att = h.attachments.map((a) => a.url ?? a.name).join('|');
  return [h.subject, h.description, h.deadline ?? '', att].join('::');
}

/**
 * Домашние задания за период [from, to] (по умолчанию — с 1 сентября
 * по +30 дней от сегодня: API отсекает задания с дедлайном позже `to`).
 * Период бьём на отрезки по 28 дней и ходим параллельно: API МЭШ ограничивает
 * ширину интервала. 401/403 пробрасываем сразу (проблема токена), иначе склеиваем
 * успешные отрезки с дедупликацией; если не удался ни один — бросаем первую ошибку.
 */
export async function getMeshHomeworks(
  token: string,
  studentId: string,
  from: string = schoolYearStart(),
  to: string = homeworkHorizonEnd()
): Promise<MeshHomework[]> {
  const segments = splitRange(from, to);
  const ranges = segments.length > 0 ? segments : [[from, to] as [string, string]];
  const profileHeader = { 'Profile-Id': studentId };
  const results = await Promise.allSettled(
    ranges.map(async ([f, t]) => {
      const json = await meshJson(
        token,
        `/api/family/web/v1/homeworks?student_id=${encodeURIComponent(studentId)}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
        profileHeader
      );
      return parseHomeworks(json);
    })
  );
  for (const r of results) {
    if (r.status === 'rejected' && r.reason instanceof MeshDiaryError && (r.reason.status === 401 || r.reason.status === 403)) {
      throw r.reason;
    }
  }
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<MeshHomework[]> => r.status === 'fulfilled'
  );
  if (fulfilled.length === 0) {
    const first = results[0];
    throw first.status === 'rejected' ? first.reason : new MeshDiaryError('Не удалось получить домашние задания', 502);
  }
  const seen = new Set<string>();
  const merged: MeshHomework[] = [];
  for (const r of fulfilled) {
    for (const h of r.value) {
      const k = homeworkKey(h);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(h);
      }
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Оценки с темами уроков                                              */
/* ------------------------------------------------------------------ */

const VALUE_KEYS = ['value', 'evaluation', 'mark', 'grade', 'mark_value'];
const WEIGHT_KEYS = ['weight', 'coefficient', 'coef', 'weight_coefficient'];
const TOPIC_KEYS = [
  'lesson_topic',
  'topic_name',
  'lesson_theme',
  'topic',
  'comment',
  'theme',
  'control_form_name',
];
const MARK_SUBJECT_KEYS = ['subject_name', 'subject', 'discipline', 'lesson_name'];
const MARK_DATE_KEYS = ['date', 'created_at', 'set_date', 'date_str'];

function parseMarkValue(v: unknown): number | null {
  if (isObj(v)) return parseMarkValue(pick(v, VALUE_KEYS));
  return num(v);
}

function parseWeight(v: unknown): number {
  const n = num(v);
  return n !== null && n > 0 ? n : 1;
}

function collectMarks(node: unknown, inheritedSubject: string | null, out: MeshMark[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collectMarks(x, inheritedSubject, out);
    return;
  }
  if (!isObj(node)) return;
  const subject = str(pick(node, MARK_SUBJECT_KEYS)) ?? inheritedSubject;
  const value = parseMarkValue(pick(node, VALUE_KEYS));
  if (value !== null) {
    out.push({
      subject: subject ?? 'Без предмета',
      value,
      weight: parseWeight(pick(node, WEIGHT_KEYS)),
      topic: str(pick(node, TOPIC_KEYS)),
      date: normalizeDate(pick(node, MARK_DATE_KEYS)),
    });
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v) || isObj(v)) collectMarks(v, subject, out);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseMarks(json: unknown): MeshSubjectGroup[] {
  const marks: MeshMark[] = [];
  collectMarks(unwrapRoot(json), null, marks);
  const bySubject = new Map<string, MeshMark[]>();
  for (const m of marks) {
    const list = bySubject.get(m.subject);
    if (list) list.push(m);
    else bySubject.set(m.subject, [m]);
  }
  const groups: MeshSubjectGroup[] = [];
  for (const [subject, list] of bySubject) {
    let sum = 0;
    let sumW = 0;
    for (const m of list) {
      sum += m.value * m.weight;
      sumW += m.weight;
    }
    const plain = list.reduce((acc, m) => acc + m.value, 0) / list.length;
    const average = round2(sumW > 0 ? sum / sumW : plain);
    list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    groups.push({ subject, average, marks: list });
  }
  groups.sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));
  return groups;
}

export async function getMeshMarks(
  token: string,
  studentId: string,
  from: string = schoolYearStart(),
  to: string = todayLocalIso()
): Promise<MeshSubjectGroup[]> {
  const json = await meshJson(
    token,
    `/api/family/web/v1/marks?student_id=${encodeURIComponent(studentId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { 'Profile-Id': studentId }
  );
  return parseMarks(json);
}

/* ------------------------------------------------------------------ */
/* Пробники ЕГЭ / ОГЭ (ГИА)                                            */
/* ------------------------------------------------------------------ */

const DIAG_SUBJECT_KEYS = ['subject_name', 'subject', 'exam_name', 'examSubject', 'name', 'title'];
const DIAG_DATE_KEYS = ['date', 'exam_date', 'passing_date', 'date_str', 'test_date'];
const SCORE_KEYS = ['primary_score', 'score', 'points', 'balls', 'primary_result', 'result'];
const PERCENT_KEYS = ['percent', 'percentage', 'percents', 'percent_done', 'progress'];
const STATUS_KEYS = ['status', 'check_status', 'state', 'verification_status', 'checked'];
const REPORT_KEYS = ['report_url', 'pdf_url', 'protocol_url', 'report_link', 'file_url', 'report'];
const ID_KEYS = ['id', 'test_id', 'diagnostics_id', 'uuid', 'guid'];

function reportUrlOf(o: Obj): string | null {
  const v = pick(o, REPORT_KEYS);
  if (v === null) return null;
  const s = str(v);
  if (s && /^https?:\/\//.test(s)) return s;
  if (typeof v === 'string' && v.startsWith('/')) return `${MESH_BASE}${v}`;
  if (isObj(v)) {
    const link = str(pick(v, ['url', 'href', 'link', 'file', 'src']));
    if (link) return link.startsWith('/') ? `${MESH_BASE}${link}` : link;
  }
  return null;
}

function diagLike(o: Obj): boolean {
  return (
    pick(o, DIAG_SUBJECT_KEYS) !== null &&
    (pick(o, SCORE_KEYS) !== null || pick(o, PERCENT_KEYS) !== null || pick(o, STATUS_KEYS) !== null)
  );
}

export function parseDiagnostics(json: unknown): MeshDiagnostic[] {
  const root = unwrapRoot(json);
  const arrays = allArrays(root);
  let best: Obj[] = [];
  for (const a of arrays) {
    const items = a.filter(isObj);
    if (items.length === 0) continue;
    const hits = items.filter(diagLike).length;
    if (hits > 0 && hits >= Math.ceil(items.length / 2)) {
      best = items;
      break;
    }
    if (best.length === 0 && hits > 0) best = items;
  }
  const out: MeshDiagnostic[] = [];
  for (const o of best) {
    const subject = str(pick(o, DIAG_SUBJECT_KEYS));
    const score = num(pick(o, SCORE_KEYS));
    if (!subject && score === null) continue;
    out.push({
      testId: str(pick(o, ID_KEYS)) ?? '',
      subject: subject ?? 'Пробник',
      date: normalizeDate(pick(o, DIAG_DATE_KEYS)),
      score,
      percent: num(pick(o, PERCENT_KEYS)),
      status: str(pick(o, STATUS_KEYS)),
      reportUrl: reportUrlOf(o),
    });
  }
  return out;
}

export async function getMeshDiagnostics(
  token: string,
  studentId: string
): Promise<MeshDiagnostic[]> {
  // Кандидаты: portfolio-сервис требует отдельный apikey и с семейным
  // auth_token обычно недоступен (401) — это норма, а не ошибка.
  // Если МЭШ отвечает 404 (у ученика пробников нет, напр. 10 класс без ЕГЭ),
  // возвращаем пустой список БЕЗ ошибки — таб покажет «пробников пока нет».
  const candidates: Array<{ url: string; portfolio: boolean }> = [
    {
      url: `/api/portfolio/web/v1/students/${encodeURIComponent(studentId)}/diagnostics`,
      portfolio: true,
    },
    {
      url: `/api/family/web/v1/independent_tests?student_id=${encodeURIComponent(studentId)}`,
      portfolio: false,
    },
  ];
  const profileHeader = { 'Profile-Id': studentId };
  let lastError: unknown = null;
  for (const c of candidates) {
    try {
      const json = await meshJson(token, c.url, profileHeader);
      const items = parseDiagnostics(json);
      if (items.length > 0) return items;
    } catch (error) {
      if (error instanceof MeshDiaryError && error.status === 404) {
        lastError = error;
        continue;
      }
      if (error instanceof MeshDiaryError && error.status === 401 && c.portfolio) {
        console.error('[mesh] portfolio недоступен с семейным токеном (нужен apikey) — пропускаем');
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastError) {
    console.error(
      `[mesh] пробники не найдены (${lastError instanceof Error ? lastError.message : lastError}) — возвращаем пустой список`
    );
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Скачивание протокола ЕГЭ                                            */
/* ------------------------------------------------------------------ */

export function sanitizePdfFilename(subject: string): string {
  const cleaned = subject
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .trim();
  const base = cleaned.length > 0 ? cleaned : 'mesh';
  return `${base}_EGE_result.pdf`;
}

async function fetchReportCandidate(
  token: string,
  url: string,
  extraHeaders?: Record<string, string>
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const res = await meshFetch(token, url, extraHeaders);
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('json')) {
    let json: unknown;
    try {
      json = (await res.json()) as unknown;
    } catch {
      return null;
    }
    const u = unwrapRoot(json);
    const root = isObj(u) ? u : isObj(json) ? json : null;
    const link = root
      ? str(pick(root, ['url', 'file_url', 'pdf_url', 'report_url', 'href']))
      : null;
    if (!link || !isAllowedMeshUrl(link)) return null;
    const res2 = await meshFetch(token, link.startsWith('/') ? `${MESH_BASE}${link}` : link);
    const buffer = Buffer.from(await res2.arrayBuffer());
    if (buffer.length === 0) return null;
    return { buffer, contentType: res2.headers.get('content-type') ?? 'application/pdf' };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) return null;
  return { buffer, contentType: contentType || 'application/pdf' };
}

/**
 * Скачивает протокол/отчёт пробника ЕГЭ: сначала по прямой ссылке из
 * диагностики, затем по типовым путям отчётов МЭШ.
 */
export async function fetchEgeReport(
  token: string,
  studentId: string,
  testId: string,
  subject: string,
  reportUrl?: string | null
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const candidates: string[] = [];
  if (reportUrl) candidates.push(reportUrl);
  if (testId) {
    candidates.push(
      `/api/portfolio/web/v1/students/${encodeURIComponent(studentId)}/diagnostics/${encodeURIComponent(testId)}/report`
    );
    candidates.push(
      `/api/family/web/v1/independent_tests/${encodeURIComponent(testId)}/report`
    );
  }
  let lastError: unknown = null;
  const profileHeader = studentId ? { 'Profile-Id': studentId } : undefined;
  for (const url of candidates) {
    try {
      const result = await fetchReportCandidate(token, url, profileHeader);
      if (result) {
        return { ...result, filename: sanitizePdfFilename(subject || testId || 'result') };
      }
    } catch (error) {
      if (error instanceof MeshDiaryError && error.status === 401) throw error;
      lastError = error;
    }
  }
  if (lastError instanceof MeshDiaryError) throw lastError;
  throw new MeshDiaryError('Протокол ЕГЭ не найден в МЭШ', 404);
}

/* ------------------------------------------------------------------ */
/* Синхронизация всех разделов                                         */
/* ------------------------------------------------------------------ */

export async function syncMeshDiary(token: string, date: string): Promise<MeshDiarySync> {
  const student = await getMeshStudent(token);
  const from = schoolYearStart();
  const to = todayLocalIso();
  const hwTo = homeworkHorizonEnd();
  const [sched, hw, marks, diag] = await Promise.allSettled([
    getMeshSchedule(token, student.studentId, date),
    getMeshHomeworks(token, student.studentId, from, hwTo),
    getMeshMarks(token, student.studentId, from, to),
    getMeshDiagnostics(token, student.studentId),
  ]);

  const errors: string[] = [];
  const schedule = sched.status === 'fulfilled' ? sched.value : [];
  const homeworks = hw.status === 'fulfilled' ? hw.value : [];
  const markGroups = marks.status === 'fulfilled' ? marks.value : [];
  const diagnostics = diag.status === 'fulfilled' ? diag.value : [];
  if (sched.status === 'rejected') errors.push(`Расписание: ${errMsg(sched.reason)}`);
  if (hw.status === 'rejected') errors.push(`Домашние задания: ${errMsg(hw.reason)}`);
  if (marks.status === 'rejected') errors.push(`Оценки: ${errMsg(marks.reason)}`);
  if (diag.status === 'rejected') errors.push(`Пробники ЕГЭ: ${errMsg(diag.reason)}`);

  const totalMarks = markGroups.reduce((acc, g) => acc + g.marks.length, 0);
  return {
    syncedAt: new Date().toISOString(),
    student,
    scheduleDate: date,
    schedule,
    homeworks,
    marks: markGroups,
    diagnostics,
    counts: {
      lessons: schedule.length,
      homeworks: homeworks.length,
      marks: totalMarks,
      subjects: markGroups.length,
      diagnostics: diagnostics.length,
    },
    errors,
  };
}

function errMsg(error: unknown): string {
  if (error instanceof MeshDiaryError) return error.message;
  if (error instanceof Error) return error.message;
  return 'неизвестная ошибка';
}
