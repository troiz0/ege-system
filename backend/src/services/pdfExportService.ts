import katex from 'katex';
import { prisma } from '../lib/prisma.js';
import { generateRandomExamVariant } from './fipiExamService.js';
import { findSubjectConfig } from '../lib/subjects.js';
import { isSubjectMatchingTarget } from '../lib/subjectMatcher.js';
import { sanitizeMathText } from '../lib/mathSanitizer.js';

function renderRichText(content: string): string {
  if (!content) return '';
  const sanitized = sanitizeMathText(content);
  // Авто-оборачивание любых незакавыченных LaTeX команд (\frac, \sqrt, \vec, \alpha, \text и т.д.)
  const autoWrapped = sanitized.replace(/(?<!\$)\\([a-zA-Z]+(?:\s*\{[^{}]*\}|\s*\[[^\[\]]*\]|[0-9a-zA-Z_])*)(?!\$)/g, '$$$1$');
  const parts = autoWrapped.split(/(\$\$[\s\S]*?\$\$|\$(?:[^\$\n\r]|\\\$)+?\$)/g);
  return parts
    .map((part) => {
      const isBlock = part.startsWith('$$') && part.endsWith('$$') && part.length >= 4;
      const isInline = !isBlock && part.startsWith('$') && part.endsWith('$') && part.length >= 2;
      if (isBlock || isInline) {
        const math = (isBlock ? part.slice(2, -2) : part.slice(1, -1)).trim();
        try {
          const html = katex.renderToString(math, { displayMode: isBlock, throwOnError: false });
          return isBlock ? `<div class="math-block" style="margin: 6px 0; text-align: center;">${html}</div>` : html;
        } catch {
          return part;
        }
      }
      return part.replace(/\r?\n/g, '<br>');
    })
    .join('');
}

export class PdfExportService {
  /**
   * Генерация печатного комплекта для класса из 4 параллельных вариантов с бланками и шахматкой ключей.
   */
  async generateClassPackHtml(subject = 'math_profile', count = 4): Promise<string> {
    const cfg = findSubjectConfig(subject);
    const variants = [];
    for (let i = 1; i <= count; i++) {
      variants.push(generateRandomExamVariant(cfg.id));
    }

    // Таблица ключей (Шахматка) для учителя
    const maxPart1 = cfg.part1Count || 13;
    let answerMatrixRows = '';
    for (let t = 1; t <= maxPart1; t++) {
      const rowAnswers = variants
        .map((v) => {
          const task = v.tasks.find((taskItem) => (taskItem.taskNumber || taskItem.number) === t);
          return `<td style="border: 1px solid #111; padding: 6px; text-align: center; font-weight: bold;">${task?.correctAnswer || '—'}</td>`;
        })
        .join('');
      answerMatrixRows += `<tr><td style="border: 1px solid #111; padding: 6px; text-align: center; background: #eee; font-weight: bold;">№ ${t}</td>${rowAnswers}</tr>`;
    }

    // Генерация страниц вариантов
    const variantsHtml = variants
      .map((v, idx) => {
        const variantNum = idx + 1;
        const tasksHtml = v.tasks
          .map((taskItem) => {
            const num = taskItem.taskNumber || taskItem.number;
            const isPart1 = (taskItem.part || 1) === 1;
            const bodyHtml = renderRichText(taskItem.statement || taskItem.text || '');
            const diagramHtml = taskItem.imageUrl
              ? `<div style="text-align: center; margin: 8px 0;">
                  <img src="${taskItem.imageUrl}" alt="Чертеж к заданию №${num}" class="task-diagram" style="max-height: 180px; max-width: 100%; object-fit: contain; background: #fff; filter: contrast(130%) grayscale(100%);" />
                </div>`
              : '';

            return `
              <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed #ccc; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-bottom: 4px;">
                  <span>Задание № ${num} [${isPart1 ? 'Краткий ответ' : `Развернутый ответ • ${taskItem.maxScore} б.`}]</span>
                  <span style="color: #666; font-size: 11px;">${taskItem.topic || ''}</span>
                </div>
                <div style="font-size: 13px; line-height: 1.5; color: #111;">${bodyHtml}</div>
                ${diagramHtml}
                ${
                  isPart1
                    ? `<div style="margin-top: 8px; font-size: 11px; color: #444;">Ответ: [____________________]</div>`
                    : `<div style="margin-top: 8px; font-size: 11px; color: #666; font-style: italic;">Решение и ответ запишите в бланке ответов № 2.</div>`
                }
              </div>
            `;
          })
          .join('');

        return `
          <div style="page-break-after: always; padding: 24px; font-family: 'Times New Roman', Times, serif;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 18px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #444;">Единый Государственный Экзамен — КИМ-2027</div>
              <h2 style="margin: 6px 0; font-size: 18px; text-transform: uppercase;">${cfg.name}</h2>
              <div style="font-weight: bold; font-size: 14px;">ВАРИАНТ № ${variantNum} (Код: ${v.variantCode || v.id})</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px;">Время выполнения: ${cfg.durationMinutes} мин. // Всего заданий: ${v.totalTasks} (Часть 1: ${cfg.part1Count}, Часть 2: ${cfg.part2Count})</div>
            </div>
            ${tasksHtml}
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Пакет для класса — ${cfg.name}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" />
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .task-diagram { filter: contrast(150%) grayscale(100%) !important; background: #fff !important; }
          }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #000; background: #fff; line-height: 1.4; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          .task-diagram { max-width: 100%; max-height: 180px; display: block; margin: 4px auto; background: #fff; filter: contrast(130%) grayscale(100%); }
          .math-block { margin: 4px 0; text-align: center; }
        </style>
      </head>
      <body>
        <!-- ШАХМАТКА КЛЮЧЕЙ ДЛЯ ПРЕПОДАВАТЕЛЯ -->
        <div style="page-break-after: always; padding: 32px; font-family: sans-serif;">
          <div style="border-bottom: 3px solid #000; padding-bottom: 12px; margin-bottom: 24px;">
            <h1 style="font-size: 20px; text-transform: uppercase; margin: 0;">ВЕДОМОСТЬ КЛЮЧЕЙ И ОТВЕТОВ ДЛЯ УЧИТЕЛЯ</h1>
            <div style="font-size: 13px; color: #555; margin-top: 4px;">Предмет: <b>${cfg.name}</b> • Комплект на 4 варианта • КИМ-2027</div>
          </div>
          <table style="margin-bottom: 24px;">
            <thead>
              <tr style="background: #222; color: #fff;">
                <th style="border: 1px solid #111; padding: 8px;">Номер</th>
                <th style="border: 1px solid #111; padding: 8px;">Вариант 1</th>
                <th style="border: 1px solid #111; padding: 8px;">Вариант 2</th>
                <th style="border: 1px solid #111; padding: 8px;">Вариант 3</th>
                <th style="border: 1px solid #111; padding: 8px;">Вариант 4</th>
              </tr>
            </thead>
            <tbody>
              ${answerMatrixRows}
            </tbody>
          </table>
          <div style="background: #f8f8f8; border: 1px solid #ddd; padding: 12px; font-size: 12px; line-height: 1.5;">
            <b>Инструкция по проверке:</b> Ответы части 1 сверяются строго по ведомости. В части 2 каждый шаг оценивается по официальным предметным критериям ФИПИ.
          </div>
        </div>

        ${variantsHtml}
      </body>
      </html>
    `;
  }

  /**
   * Генерация ежемесячного отчета Month-over-Month для родителей и репетитора.
   */
  async generateMonthlyReportHtml(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        targetSubjects: true,
        mockExams: { orderBy: { examDate: 'desc' }, take: 10 },
        weakTopics: { orderBy: { frequency: 'desc' } },
        homeworks: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!user) throw new Error('Пользователь не найден');

    const profile = user.profile;
    const targetNames = user.targetSubjects.map((t) => t.subjectName);
    const target = user.targetSubjects[0];
    const mocks = targetNames.length > 0
      ? user.mockExams.filter((m) => isSubjectMatchingTarget(m.subject, targetNames))
      : user.mockExams;
    const latestScore = mocks[0]?.totalScore ?? null;
    const avgScore = mocks.length > 0 ? Math.round(mocks.reduce((s, m) => s + m.totalScore, 0) / mocks.length) : null;
    const relevantWeak = targetNames.length > 0
      ? user.weakTopics.filter((w) => isSubjectMatchingTarget(w.subject, targetNames))
      : user.weakTopics;
    const resolvedTopics = relevantWeak.filter((w) => w.isResolved).length;
    const pendingTopics = relevantWeak.filter((w) => !w.isResolved);

    const completedHw = user.homeworks.filter((h) => h.status === 'completed').length;
    const hwPercent = user.homeworks.length > 0 ? Math.round((completedHw / user.homeworks.length) * 100) : 100;

    const mockRows = mocks
      .slice(0, 5)
      .map((m) => `
        <tr>
          <td style="border: 1px solid #ddd; padding: 6px;">${new Date(m.examDate).toLocaleDateString('ru-RU')}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${m.subject}</td>
          <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${m.totalScore} / 100</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${m.primaryScore ?? '—'}</td>
          <td style="border: 1px solid #ddd; padding: 6px; color: ${(m.deltaScore ?? 0) >= 0 ? 'green' : 'red'};">${(m.deltaScore ?? 0) >= 0 ? `+${m.deltaScore}` : m.deltaScore ?? '0'}</td>
        </tr>
      `)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ежемесячный педагогический отчет — ${user.name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; padding: 32px; max-width: 800px; margin: 0 auto; line-height: 1.5; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #f0f0f0; border: 1px solid #ddd; padding: 8px; text-align: left; }
          .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 24px; }
          .stat-box { display: inline-block; width: 31%; border: 1px solid #ddd; padding: 12px; margin-right: 2%; box-sizing: border-box; background: #fafafa; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 1.5px;">EGE.SYSTEM // MONTH-OVER-MONTH PEDAGOGICAL AUDIT</div>
          <h1 style="margin: 4px 0; font-size: 22px;">ЕЖЕМЕСЯЧНЫЙ ОТЧЕТ О ПОДГОТОВКЕ К ЕГЭ</h1>
          <div style="font-size: 13px; color: #444;">Ученик: <b>${user.name}</b> (${profile?.grade ? `${profile.grade} класс` : 'класс не указан'}) • Дата среза: <b>${new Date().toLocaleDateString('ru-RU')}</b></div>
        </div>

        <div style="margin-bottom: 24px;">
          <div class="stat-box">
            <div style="font-size: 11px; color: #666;">ТЕКУЩИЙ СРЕЗ</div>
            <div style="font-size: 24px; font-weight: bold; color: #000;">${latestScore !== null ? `${latestScore} / 100` : '—'}</div>
            <div style="font-size: 10px; color: #888;">${avgScore !== null ? `Средний: ${avgScore} б.` : 'Пробники не сдавались'}</div>
          </div>
          <div class="stat-box">
            <div style="font-size: 11px; color: #666;">ЦЕЛЕВОЙ БАЛЛ</div>
            <div style="font-size: 24px; font-weight: bold; color: #222;">${target?.targetScore ?? 85} б.</div>
            <div style="font-size: 10px; color: #888;">${latestScore !== null ? `Дефицит: ${Math.max(0, (target?.targetScore ?? 85) - latestScore)} б.` : 'Дефицит: —'}</div>
          </div>
          <div class="stat-box" style="margin-right: 0;">
            <div style="font-size: 11px; color: #666;">ДИСЦИПЛИНА ДЗ</div>
            <div style="font-size: 24px; font-weight: bold; color: green;">${hwPercent}%</div>
            <div style="font-size: 10px; color: #888;">Сдано: ${completedHw} из ${user.homeworks.length}</div>
          </div>
        </div>

        <h3 style="margin-bottom: 8px;">1. ДИНАМИКА НАПИСАНИЯ ПРОБНЫХ ЭКЗАМЕНОВ (КИМ-2027)</h3>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Предмет</th>
              <th>Тестовый балл</th>
              <th>Первичный</th>
              <th>Дельта</th>
            </tr>
          </thead>
          <tbody>
            ${mockRows || '<tr><td colspan="5" style="text-align: center; padding: 12px;">Пробных экзаменов за период не зафиксировано</td></tr>'}
          </tbody>
        </table>

        <h3 style="margin-bottom: 8px;">2. КАРТА ДЕФИЦИТОВ И ЗАКРЫТЫХ ТЕМ</h3>
        <p>Успешно закрыто тем по кодификатору: <b>${resolvedTopics}</b>. Остаются в активной отработке: <b>${pendingTopics.length}</b>.</p>
        <ul style="padding-left: 20px;">
          ${pendingTopics.slice(0, 5).map((w) => `<li><b>${w.subject}</b>: ${w.topicName} (ошибок: ${w.frequency})</li>`).join('') || '<li>Все зафиксированные темы усвоены.</li>'}
        </ul>

        <h3 style="margin-bottom: 8px; margin-top: 24px;">3. РЕЦЕНЗИЯ ПРЕПОДАВАТЕЛЯ ДЛЯ РОДИТЕЛЕЙ</h3>
        <div style="border: 1px solid #ccc; padding: 16px; background: #fafafa; font-style: italic;">
          «Ученик демонстрирует стабильную динамику в заданиях базовой части. Для гарантированного преодоления порога в 80+ баллов необходимо сфокусироваться на оформлении геометрических доказательств и точности вычислений в задачах с экономическим содержанием. Дисциплина выполнения домашних заданий хорошая.»
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #555;">
          <div>Подпись преподавателя: ___________________</div>
          <div>EGE.SYSTEM Verified Telemetry</div>
        </div>
      </body>
      </html>
    `;
  }
}

export const pdfExportService = new PdfExportService();
