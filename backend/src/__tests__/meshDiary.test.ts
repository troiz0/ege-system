import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MeshDiaryError,
  addDaysIso,
  ensureMeshNoProxy,
  getMeshDiagnostics,
  getMeshHomeworks,
  getMeshMarks,
  getMeshSchedule,
  getMeshStudent,
  homeworkHorizonEnd,
  normalizeDate,
  parseDiagnostics,
  parseHomeworks,
  parseMarks,
  parseSchedule,
  parseStudent,
  sanitizePdfFilename,
  schoolYearStart,
  splitRange,
  todayLocalIso,
} from '../services/meshDiary.js';
import { checkMeshToken, normalizeMeshToken } from '../services/meshAuth.js';

describe('parseStudent', () => {
  it('берёт student_id из children[0].id', () => {
    const s = parseStudent({
      children: [{ id: 'stu-123', full_name: 'Иванов Пётр', class_name: '8А' }],
    });
    expect(s.studentId).toBe('stu-123');
    expect(s.name).toBe('Иванов Пётр');
    expect(s.className).toBe('8А');
  });

  it('фолбэк на contingent_guid', () => {
    const s = parseStudent({ contingent_guid: 'guid-9' });
    expect(s.studentId).toBe('guid-9');
  });

  it('распаковывает data-обёртку', () => {
    const s = parseStudent({ data: { children: [{ id: 42 }] } });
    expect(s.studentId).toBe('42');
  });

  it('ошибка, если student_id нет', () => {
    expect(() => parseStudent({})).toThrow(MeshDiaryError);
  });
});

describe('parseSchedule', () => {
  it('плоский список уроков: время, предмет, кабинет, учитель', () => {
    const lessons = parseSchedule({
      lessons: [
        {
          start_time: '08:30',
          end_time: '09:15',
          subject: { name: 'Математика' },
          room: '305',
          teacher: { full_name: 'Иванова М.С.' },
        },
        {
          time: '09:25-10:10',
          subject_name: 'Русский язык',
          auditory: '210',
          teacher_name: 'Петрова А.В.',
        },
      ],
    });
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toMatchObject({
      start: '08:30',
      end: '09:15',
      subject: 'Математика',
      room: '305',
      teacher: 'Иванова М.С.',
    });
    expect(lessons[1]).toMatchObject({
      start: '09:25',
      end: '10:10',
      subject: 'Русский язык',
      room: '210',
      teacher: 'Петрова А.В.',
    });
  });

  it('формат с днями (days[].lessons[])', () => {
    const lessons = parseSchedule({
      days: [
        {
          date: '2026-10-01',
          lessons: [
            { start: '10:20', end: '11:05', subject_name: 'Физика', room: '12', teacher: 'Сидоров К.А.' },
          ],
        },
      ],
    });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ start: '10:20', subject: 'Физика' });
  });

  it('формат МЭШ schedule/short: begin_time/end_time + lesson_name как тема', () => {
    const lessons = parseSchedule({
      payload: [
        {
          date: '2026-10-05',
          lessons: [
            {
              lesson_id: 1643563196,
              begin_time: '09:30',
              end_time: '10:10',
              subject_name: 'Физика',
              lesson_name: 'Закон всемирного тяготения. Сила тяжести. Первая космическая скорость\n',
            },
          ],
        },
      ],
    });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      start: '09:30',
      end: '10:10',
      subject: 'Физика',
      topic: 'Закон всемирного тяготения. Сила тяжести. Первая космическая скорость',
    });
  });

  it('не дублирует тему, если lesson_name совпал с предметом', () => {
    const lessons = parseSchedule({
      lessons: [{ start_time: '08:30', end_time: '09:15', lesson_name: 'Физика' }],
    });
    expect(lessons).toHaveLength(1);
    expect(lessons[0].subject).toBe('Физика');
    expect(lessons[0].topic).toBeNull();
  });

  it('название из элективных полей и curriculum_plan, фолбэк «Занятие»', () => {
    const lessons = parseSchedule({
      lessons: [
        { start_time: '08:30', end_time: '09:15', course_name: 'Робототехника' },
        { start_time: '09:25', end_time: '10:10', discipline_name: 'Шахматы' },
        { start_time: '10:20', end_time: '11:05', activity_name: 'Волонтёрство' },
        {
          start_time: '11:15',
          end_time: '12:00',
          curriculum_plan: { theme_name: 'Проектная деятельность' },
        },
        { start_time: '12:10', end_time: '12:55' },
      ],
    });
    expect(lessons.map((l) => l.subject)).toEqual([
      'Робототехника',
      'Шахматы',
      'Волонтёрство',
      'Проектная деятельность',
      'Занятие',
    ]);
  });

  it('статусы выполнения: is_done, status=done, has_written_solution', () => {
    const items = parseHomeworks({
      items: [
        { subject: 'А', description: 'Д1', date: '2026-10-01', is_done: true },
        { subject: 'Б', description: 'Д2', date: '2026-10-01', status: 'done' },
        { subject: 'В', description: 'Д3', date: '2026-10-01', has_written_solution: 1 },
        { subject: 'Г', description: 'Д4', date: '2026-10-01', status: 'in_progress' },
        { subject: 'Д', description: 'Д5', date: '2026-10-01' },
      ],
    });
    expect(items.map((i) => i.done)).toEqual([true, true, true, false, false]);
  });

  it('пустой ответ — пустой список', () => {
    expect(parseSchedule({ lessons: [] })).toEqual([]);
    expect(parseSchedule(null)).toEqual([]);
  });
});

describe('parseHomeworks', () => {
  it('вложенные по предметам задания с наследованием предмета', () => {
    const items = parseHomeworks({
      subjects: [
        {
          subject_name: 'Алгебра',
          homeworks: [
            {
              description: 'Упр. 12, № 345–350',
              due_date: '2026-10-02',
              attachments: [{ name: 'конспект.pdf' }, 'задание.png'],
            },
          ],
        },
        {
          subject_name: 'Физика',
          homeworks: [{ text: '§ 3, ответы на вопросы', date: '05.10.2026' }],
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      subject: 'Алгебра',
      description: 'Упр. 12, № 345–350',
      deadline: '2026-10-02',
      done: false,
      attachments: [
        { name: 'конспект.pdf', url: null, kind: 'material', action: null },
        { name: 'задание.png', url: null, kind: 'material', action: null },
      ],
    });
    expect(items[1]).toMatchObject({
      subject: 'Физика',
      description: '§ 3, ответы на вопросы',
      deadline: '2026-10-05',
    });
  });

  it('плоский список items', () => {
    const items = parseHomeworks({
      items: [
        { subject: 'Геометрия', description: 'Доказать теорему', deadline: '2026-10-03' },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ subject: 'Геометрия', deadline: '2026-10-03' });
  });

  it('materials МЭШ: файлы со ссылками, тесты и материалы без URL', () => {
    const items = parseHomeworks({
      payload: [
        {
          subject_name: 'Физика',
          description: 'Изучить параграф',
          date: '2026-09-10',
          materials: [
            {
              uuid: null,
              type: 'attachments',
              title: 'погрешности.pdf',
              urls: [{ url: 'https://school.mos.ru/ej/attachments/files/229/897/689/original/file.pdf', type: 'file_link' }],
              action_name: 'Изучить',
            },
            {
              uuid: '1e40afeb-f8ec-5b5d-a989-a7a69deab292',
              type: 'test_spec_binding',
              title: 'Задание ЕГЭ № 19',
              urls: [],
              action_name: 'Пройти',
            },
            {
              uuid: '3650c7e6-c6a9-5637-82e7-ea747dbaa05e',
              type: 'atomic_object',
              title: 'Решение планиметрических задач',
              urls: [],
              action_name: 'Изучить',
            },
          ],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].attachments).toEqual([
      {
        name: 'погрешности.pdf',
        url: 'https://school.mos.ru/ej/attachments/files/229/897/689/original/file.pdf',
        kind: 'file',
        action: 'Изучить',
      },
      { name: 'Задание ЕГЭ № 19', url: null, kind: 'test', action: 'Пройти' },
      { name: 'Решение планиметрических задач', url: null, kind: 'material', action: 'Изучить' },
    ]);
  });

  it('внутрь materials не спускается (нет фантомных заданий)', () => {
    const items = parseHomeworks({
      payload: [
        {
          subject_name: 'История',
          description: 'Параграф 5',
          date: '2026-09-10',
          materials: [{ type: 'atomic_object', title: 'Хрестоматия', description: 'Читать', urls: [] }],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe('Параграф 5');
  });

  it('без описания задание не попадает', () => {
    const items = parseHomeworks({ items: [{ subject: 'История', date: '2026-10-03' }] });
    expect(items).toEqual([]);
  });
});

describe('parseMarks', () => {
  it('оценки с темами, весами и средневзвешенным баллом', () => {
    const groups = parseMarks({
      data: {
        subjects: [
          {
            subject_name: 'Математика',
            evaluations: [
              { value: 5, weight: 2, lesson_topic: 'Теорема Пифагора', date: '2026-09-01' },
              { value: 4, weight: 1, topic_name: 'Квадратные уравнения', date: '2026-09-05' },
              { value: 3, weight: 3, comment: 'Пропущена тема', date: '2026-09-10' },
            ],
          },
        ],
      },
    });
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.subject).toBe('Математика');
    expect(g.marks).toHaveLength(3);
    // сортировка: свежие оценки сверху
    expect(g.marks[0]).toMatchObject({
      value: 3,
      weight: 3,
      topic: 'Пропущена тема',
      date: '2026-09-10',
    });
    const pifagor = g.marks.find((m) => m.topic === 'Теорема Пифагора')!;
    expect(pifagor).toMatchObject({ value: 5, weight: 2, date: '2026-09-01' });
    // (5*2 + 4*1 + 3*3) / (2+1+3) = 23/6
    expect(g.average).toBe(3.83);
  });

  it('группирует по предметам и считает вес по умолчанию = 1', () => {
    const groups = parseMarks({
      items: [
        { subject_name: 'Русский язык', value: '5', date: '2026-09-02' },
        { subject_name: 'Русский язык', value: 4, date: '2026-09-09' },
        { subject_name: 'Физика', value: 3, date: '2026-09-03' },
      ],
    });
    expect(groups.map((g) => g.subject)).toEqual(['Русский язык', 'Физика']);
    const ru = groups.find((g) => g.subject === 'Русский язык')!;
    expect(ru.average).toBe(4.5);
    expect(ru.marks[0].weight).toBe(1);
  });

  it('не ловит неоценочные поля', () => {
    expect(parseMarks({ items: [{ subject: 'История', text: 'нет оценок' }] })).toEqual([]);
  });
});

describe('parseDiagnostics', () => {
  it('парсит пробники: предмет, дата, балл, процент, статус, отчёт', () => {
    const items = parseDiagnostics({
      items: [
        {
          id: 101,
          subject_name: 'Русский язык',
          date: '2026-04-15',
          primary_score: 17,
          percent: 70.8,
          status: 'Проверено',
          report_url: 'https://school.mos.ru/files/report1.pdf',
        },
        {
          test_id: 't-2',
          exam_name: 'Математика',
          exam_date: '20.05.2026',
          score: 19,
          percentage: 65.5,
          check_status: 'Не проверено',
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      testId: '101',
      subject: 'Русский язык',
      date: '2026-04-15',
      score: 17,
      percent: 70.8,
      status: 'Проверено',
      reportUrl: 'https://school.mos.ru/files/report1.pdf',
    });
    expect(items[1]).toMatchObject({
      testId: 't-2',
      subject: 'Математика',
      date: '2026-05-20',
      score: 19,
      status: 'Не проверено',
    });
    expect(items[1].reportUrl).toBeNull();
  });

  it('пустой список — пусто', () => {
    expect(parseDiagnostics({ items: [] })).toEqual([]);
  });
});

describe('parseMarks: реальная форма /family/web/v1/marks', () => {
  it('строковое value, control_form_name -> тема, вес и дата', () => {
    const groups = parseMarks({
      payload: [
        {
          id: 3257455185,
          value: '3',
          weight: 1,
          date: '2026-10-02',
          subject_name: 'Алгебра и начала математического анализа',
          control_form_name: 'Решение задач',
          comment: '',
          created_at: '2026-10-02T12:14:00',
        },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].subject).toBe('Алгебра и начала математического анализа');
    expect(groups[0].average).toBe(3);
    expect(groups[0].marks[0]).toMatchObject({
      value: 3,
      weight: 1,
      topic: 'Решение задач',
      date: '2026-10-02',
    });
  });
});

describe('normalizeDate', () => {
  it('ISO остаётся ISO', () => {
    expect(normalizeDate('2026-10-05')).toBe('2026-10-05');
  });

  it('ДД.ММ.ГГГГ конвертируется', () => {
    expect(normalizeDate('05.10.2026')).toBe('2026-10-05');
    expect(normalizeDate('5.1.26')).toBe('2026-01-05');
  });

  it('ISO-датачаc со временем → дата', () => {
    expect(normalizeDate('2026-10-05T23:50:00')).toBe('2026-10-05');
  });

  it('timestamp в мс → дата', () => {
    expect(normalizeDate(Date.UTC(2026, 9, 5, 12, 0))).toBe('2026-10-05');
  });

  it('мусор и пустота → null', () => {
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('12:30')).toBeNull();
  });
});

describe('sanitizePdfFilename', () => {
  it('формирует имя вида Предмет_EGE_result.pdf', () => {
    expect(sanitizePdfFilename('Математика')).toBe('Математика_EGE_result.pdf');
    expect(sanitizePdfFilename('Математика / Профиль')).toBe('Математика-Профиль_EGE_result.pdf');
    expect(sanitizePdfFilename('')).toBe('mesh_EGE_result.pdf');
  });
});

describe('normalizeMeshToken', () => {
  it('срезает префикс Bearer и пробелы по краям', () => {
    expect(normalizeMeshToken('  Bearer abc123XYZ-09_+=  ')).toBe('abc123XYZ-09_+=');
  });

  it('удаляет переносы строк и пробелы внутри токена', () => {
    expect(normalizeMeshToken('abc\n123\r\nXYZ\t789')).toBe('abc123XYZ789');
    expect(normalizeMeshToken('Bearer\nabc 123')).toBe('abc123');
  });

  it('голый токен не трогает', () => {
    expect(normalizeMeshToken('opaque-token_123')).toBe('opaque-token_123');
  });

  it('checkMeshToken принимает токен с Bearer и переносами', () => {
    const jwt = [
      Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({ sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url'),
      'sig',
    ].join('.');
    expect(checkMeshToken(`Bearer ${jwt}\n`).ok).toBe(true);
  });
});

describe('ensureMeshNoProxy', () => {
  const OLD_UP = process.env.NO_PROXY;
  const OLD_LOW = process.env.no_proxy;
  afterEach(() => {
    if (OLD_UP === undefined) delete process.env.NO_PROXY;
    else process.env.NO_PROXY = OLD_UP;
    if (OLD_LOW === undefined) delete process.env.no_proxy;
    else process.env.no_proxy = OLD_LOW;
  });

  it('добавляет домены МЭШ в NO_PROXY/no_proxy', () => {
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    ensureMeshNoProxy();
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const v = (process.env[key] ?? '').toLowerCase();
      expect(v).toContain('school.mos.ru');
      expect(v).toContain('mos.ru');
    }
  });

  it('не дублирует уже имеющиеся записи', () => {
    process.env.NO_PROXY = 'localhost,mos.ru';
    delete process.env.no_proxy;
    ensureMeshNoProxy();
    const parts = (process.env.NO_PROXY ?? '').split(',');
    expect(parts.filter((p) => p.trim() === 'mos.ru')).toHaveLength(1);
  });
});

describe('meshFetch: заголовки и маппинг ошибок', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockFetchOnce(status: number, body: string): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status }))
    );
  }

  function silenceLogs(): void {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }

  it('шлёт полный набор служебных заголовков МЭШ', async () => {
    silenceLogs();
    let seen: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: unknown) => {
        seen = { ...((init as { headers: Record<string, string> }).headers) };
        return new Response(JSON.stringify({ children: [{ id: 's-1' }] }), {
          status: 200,
        });
      })
    );
    await getMeshStudent('hdr-probe-token-001');
    expect(seen['Auth-Token']).toBe('hdr-probe-token-001');
    expect(seen['Authorization']).toBe('Bearer hdr-probe-token-001');
    expect(seen['X-Mes-Subsystem']).toBe('familyweb');
    expect(seen['Client-Type']).toBe('student');
    expect(seen['Origin']).toBe('https://school.mos.ru');
    expect(seen['Referer']).toBe('https://school.mos.ru/');
    expect(seen['Cookie']).toBe('auth_token=hdr-probe-token-001');
    expect(seen['User-Agent']).toContain('Mozilla/5.0');
    expect(seen['Accept']).toBe('application/json');
  });

  it('401 -> ошибка недействительного токена (статус 401)', async () => {
    silenceLogs();
    mockFetchOnce(401, '{"error":"unauthorized"}');
    const err = await getMeshStudent('tok-401-aaa').catch((e) => e);
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/недействителен|истёк/i);
  });

  it('403 -> отдельная ошибка (статус 403, не «токен истёк»)', async () => {
    silenceLogs();
    mockFetchOnce(403, '{"message":"blocked"}');
    const err = await getMeshStudent('tok-403-bbb').catch((e) => e);
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/403/);
    expect(err.message).not.toMatch(/истёк/);
  });

  it('500 -> проброс upstream-статуса с номером', async () => {
    silenceLogs();
    mockFetchOnce(500, 'boom');
    const err = await getMeshStudent('tok-500-ccc').catch((e) => e);
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/500/);
  });

  it('сетевой сбой -> 502 «Нет связи»', async () => {
    silenceLogs();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      })
    );
    const err = await getMeshStudent('tok-net-ddd').catch((e) => e);
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/Нет связи/);
  });

  it('запросы данных несут Profile-Id', async () => {
    silenceLogs();
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init: unknown) => {
        calls.push({
          url: String(url),
          headers: { ...((init as { headers: Record<string, string> }).headers) },
        });
        if (String(url).includes('/profile')) {
          return new Response(JSON.stringify({ children: [{ id: 'stu-9' }] }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ lessons: [] }), { status: 200 });
      })
    );
    await getMeshSchedule('tok-profile-eee', 'stu-9', '2026-10-01');
    const sched = calls.find((c) => c.url.includes('/schedule/'));
    expect(sched?.headers['Profile-Id']).toBe('stu-9');
  });
});

describe('schoolYearStart / splitRange', () => {
  it('1 сентября: до сентября — прошлый год, с сентября — текущий', () => {
    expect(schoolYearStart(new Date(2026, 9, 2))).toBe('2026-09-01');
    expect(schoolYearStart(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(schoolYearStart(new Date(2026, 7, 31))).toBe('2025-09-01');
    expect(schoolYearStart(new Date(2027, 0, 15))).toBe('2026-09-01');
  });

  it('addDaysIso сдвигает дату, мусор возвращает как есть', () => {
    expect(addDaysIso('2026-10-02', 30)).toBe('2026-11-01');
    expect(addDaysIso('2026-10-02', -2)).toBe('2026-09-30');
    expect(addDaysIso('2026-01-01', 1)).toBe('2026-01-02');
    expect(addDaysIso('мусор', 30)).toBe('мусор');
  });

  it('homeworkHorizonEnd — +14 дней от сегодня', () => {
    expect(homeworkHorizonEnd(new Date(2026, 9, 2))).toBe('2026-10-16');
  });

  it('режет диапазон на отрезки по 28 дней', () => {
    expect(splitRange('2026-09-01', '2026-10-02')).toEqual([
      ['2026-09-01', '2026-09-28'],
      ['2026-09-29', '2026-10-02'],
    ]);
    expect(splitRange('2026-10-02', '2026-10-02')).toEqual([['2026-10-02', '2026-10-02']]);
    expect(splitRange('2026-10-03', '2026-10-02')).toEqual([]);
    expect(splitRange('мусор', '2026-10-02')).toEqual([]);
  });
});

describe('getMeshHomeworks: период и склейка отрезков', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ходит отрезками с from/to и склеивает без дублей', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        urls.push(u);
        const from = new URL(u).searchParams.get('from') ?? '';
        const items =
          from <= '2026-09-28'
            ? [{ subject_name: 'Алгебра', description: 'Упр. 1', due_date: '2026-09-05' }]
            : [
                { subject_name: 'Алгебра', description: 'Упр. 1', due_date: '2026-09-05' },
                { subject_name: 'Физика', description: 'Пар. 2', due_date: '2026-10-01' },
              ];
        return new Response(JSON.stringify(items), { status: 200 });
      })
    );
    const items = await getMeshHomeworks('tok-hw-range-001', 'stu-1', '2026-09-01', '2026-10-02');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('from=2026-09-01');
    expect(urls[1]).toContain('from=2026-09-29');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.subject).sort()).toEqual(['Алгебра', 'Физика']);
  });

  it('401 в отрезке пробрасывается сразу', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
    const err = await getMeshHomeworks('tok-hw-401-002', 'stu-1', '2026-09-01', '2026-10-02').catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(401);
  });

  it('по умолчанию тянет с 1 сентября по +30 дней (будущие ДЗ включены)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        urls.push(String(url));
        return new Response(JSON.stringify([]), { status: 200 });
      })
    );
    await getMeshHomeworks('tok-hw-default-007', 'stu-1');
    const tos = urls.map((u) => new URL(u).searchParams.get('to'));
    const froms = urls.map((u) => new URL(u).searchParams.get('from'));
    expect(froms[0]).toBe(schoolYearStart());
    expect(tos[tos.length - 1]).toBe(homeworkHorizonEnd());
    expect(homeworkHorizonEnd() > todayLocalIso()).toBe(true);
  });
});

describe('getMeshMarks: диапазон с 1 сентября', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('запрашивает marks с from/to', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        seenUrl = String(url);
        return new Response(
          JSON.stringify([
            { subject_name: 'Алгебра', value: '5', weight: 1, date: '2026-09-10' },
          ]),
          { status: 200 }
        );
      })
    );
    const groups = await getMeshMarks('tok-marks-range-003', 'stu-1', '2026-09-01', '2026-10-02');
    expect(seenUrl).toContain('/api/family/web/v1/marks?');
    expect(seenUrl).toContain('from=2026-09-01');
    expect(seenUrl).toContain('to=2026-10-02');
    expect(groups).toHaveLength(1);
    expect(groups[0].average).toBe(5);
  });
});

describe('getMeshDiagnostics: 404 -> пустой список', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('все 404 — возвращает [] без ошибки', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"code":"NoResourceFound"}', { status: 404 }))
    );
    const items = await getMeshDiagnostics('tok-diag-404-004', 'stu-1');
    expect(items).toEqual([]);
  });

  it('portfolio 401 + family 404 — возвращает [] без ошибки', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('/portfolio/')) {
          return new Response('{"apikey":null}', { status: 401 });
        }
        return new Response('{}', { status: 404 });
      })
    );
    const items = await getMeshDiagnostics('tok-diag-mix-005', 'stu-1');
    expect(items).toEqual([]);
  });

  it('настоящая ошибка (500) — пробрасывается', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('/portfolio/')) {
          return new Response('{"apikey":null}', { status: 401 });
        }
        return new Response('boom', { status: 500 });
      })
    );
    const err = await getMeshDiagnostics('tok-diag-500-006', 'stu-1').catch((e) => e);
    expect(err).toBeInstanceOf(MeshDiaryError);
    expect(err.status).toBe(500);
  });
});
