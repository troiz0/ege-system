import katex from 'katex';
import type { ExamTaskItem, ExamVariant } from './types';
import type { EgeSubjectConfig } from './subjects';

/**
 * Экспорт КИМ и бланков ответов для печати / сохранения в PDF.
 *
 * Без внешних зависимостей: открывается печатная версия в новом окне, дальше
 * браузер печатает её или сохраняет как PDF (диалог «Печать» → «Сохранить как PDF»).
 */

const ANSWER_CELLS = 17;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Текст с формулами $...$ / $$...$$ → безопасный HTML с KaTeX. */
function renderRichText(content: string): string {
  if (!content) return '';
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$]+?\$)/g);
  return parts
    .map((part) => {
      const isBlock = part.startsWith('$$') && part.endsWith('$$') && part.length >= 4;
      const isInline = !isBlock && part.startsWith('$') && part.endsWith('$') && part.length >= 2;
      if (isBlock || isInline) {
        const math = (isBlock ? part.slice(2, -2) : part.slice(1, -1)).trim();
        try {
          const html = katex.renderToString(math, { displayMode: isBlock, throwOnError: false });
          return isBlock ? `<div class="math-block">${html}</div>` : html;
        } catch {
          return escapeHtml(part);
        }
      }
      return escapeHtml(part).replace(/\r?\n/g, '<br>');
    })
    .join('');
}

/** Правила KaTeX из уже загруженных стилей приложения (шрифты резолвятся через <base>). */
function collectKatexCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // кросс-доменные стили недоступны
    }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText;
      if (text.includes('katex') || text.includes('KaTeX')) out.push(text);
    }
  }
  return out.join('\n');
}

const PRINT_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; color: #000; background: #fff; line-height: 1.4; }
  .toolbar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 14px; background: #111; color: #d4ff00; font: 13px/1.3 monospace; }
  .toolbar button { background: #d4ff00; color: #000; border: 0; padding: 8px 16px; font: bold 12px monospace; cursor: pointer; text-transform: uppercase; }
  .toolbar span { color: #bbb; }
  .sheet { padding: 6mm 0; }
  .page-break { page-break-after: always; break-after: page; }
  section.sheet:last-of-type { page-break-after: auto; break-after: auto; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: .02em; }
  h2 { font-size: 13pt; margin: 6mm 0 2mm; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 1mm; }
  .meta { text-align: center; font-size: 11pt; margin-bottom: 4mm; }
  .instruction { border: 1.5px solid #000; padding: 4mm; font-size: 11pt; }
  .instruction ul { margin: 2mm 0 0 5mm; padding: 0; }
  .task { margin: 0 0 5mm; page-break-inside: avoid; break-inside: avoid; }
  .task-head { font-weight: bold; margin-bottom: 1mm; }
  .task-head small { font-weight: normal; color: #444; margin-left: 4px; }
  .task img, .task svg { max-width: 100%; max-height: 70mm; display: block; margin: 3mm auto; background: #ffffff !important; }
  @media print {
    .task img.dark-drawing, .task img[src*="dark"], .task img.invert-on-print {
      filter: invert(1) hue-rotate(180deg) contrast(150%) brightness(100%) !important;
    }
    .task img, .task svg {
      filter: contrast(140%) grayscale(100%);
      background: #ffffff !important;
    }
  }
  .math-block { margin: 2mm 0; text-align: center; overflow: hidden; }
  .answer-line { margin-top: 3mm; font-size: 10pt; color: #555; }
  /* Официальный Бланк ответов № 1 (Рособрнадзор / ФИПИ) */
  .blank-official { border: 2px solid #000; padding: 3mm 4mm; margin: 0 auto; font-family: Arial, sans-serif; color: #000; background: #fff; }
  .b-top-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
  .b-main-title h1 { font-size: 13pt; font-weight: 900; margin: 0; text-align: left; text-transform: uppercase; letter-spacing: 0.04em; }
  .b-main-title p { font-size: 8.5pt; margin: 1mm 0 0; font-weight: bold; text-transform: uppercase; }
  .b-barcode-box { text-align: right; font-family: 'Courier New', monospace; font-size: 8pt; }
  .b-barcode { border: 1px dashed #000; padding: 1.5mm 3mm; letter-spacing: 2px; font-weight: bold; margin-bottom: 1mm; font-size: 9.5pt; }
  .b-reg-grid { display: grid; grid-template-columns: auto auto 1fr auto auto auto; gap: 2.5mm; align-items: end; margin-bottom: 2.5mm; }
  .b-field-box label { display: block; font-size: 6.8pt; font-weight: bold; text-transform: uppercase; margin-bottom: 0.8mm; white-space: nowrap; }
  .b-samples-box { border: 1.5px solid #000; padding: 1.5mm; margin-bottom: 2.5mm; }
  .b-samples-head { font-size: 7pt; font-weight: bold; text-transform: uppercase; margin-bottom: 1mm; text-align: center; }
  .b-sample-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.8mm; font-family: 'Courier New', monospace; font-size: 8.5pt; font-weight: bold; }
  .b-sample-ch { width: 4.1mm; height: 5.1mm; border: 1px solid #777; display: flex; align-items: center; justify-content: center; }
  .b-sec-hdr { font-size: 8pt; font-weight: bold; text-transform: uppercase; text-align: center; background: #000; color: #fff; padding: 1mm 2mm; margin: 2mm 0; letter-spacing: 0.04em; }
  .b-grid-2col { display: grid; grid-template-columns: 1fr 1fr; column-gap: 5mm; row-gap: 1.4mm; margin-bottom: 2.5mm; }
  .b-arow { display: flex; align-items: center; }
  .b-anum { width: 6.5mm; font-size: 8.5pt; font-weight: bold; text-align: right; padding-right: 1.5mm; font-family: Arial, sans-serif; }
  .b-acell { width: 4.2mm; height: 5.2mm; border: 1px solid #000; margin-right: -1px; background: #fff; }
  .b-replace-box { border-top: 2px solid #000; padding-top: 1.5mm; margin-top: 2mm; }
  .b-replace-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 5mm; row-gap: 1.5mm; margin-top: 1.5mm; }
  .b-rep-row { display: flex; align-items: center; }
  .b-rep-num { font-size: 7pt; font-weight: bold; text-transform: uppercase; margin-right: 1.5mm; width: 6.5mm; text-align: right; }
  .b-rep-split { margin: 0 1.5mm; font-weight: bold; font-size: 8pt; }
  .b-foot-hint { font-size: 6.8pt; color: #444; margin-top: 2mm; border-top: 1px solid #888; padding-top: 1mm; line-height: 1.25; }
  /* Бланк № 2 */
  .lined { height: 220mm; border: 1.5px solid #000; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 7.4mm, #888 7.4mm, #888 7.9mm); }
  .meta-line { display: flex; gap: 6mm; font-size: 10pt; margin: 2mm 0 3mm; }
  .meta-line span { flex: 1; border-bottom: 1px solid #000; padding-bottom: 5mm; }
  @media print {
    .toolbar { display: none !important; }
    .sheet { padding: 0; }
  }
`;

function openPrintWindow(title: string, bodyHtml: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;

  const katexCss = collectKatexCss();
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<base href="${window.location.origin}/">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>${katexCss}</style>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">Печать / Сохранить как PDF</button>
  <span>В диалоге печати выберите «Сохранить как PDF», формат A4, без колонтитулов.</span>
</div>
${bodyHtml}
<script>
  window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
</script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ч ${m.toString().padStart(2, '0')} мин (${minutes} мин)`;
}

function getSubjectCode(name: string): string {
  if (/русск/i.test(name)) return '01';
  if (/профиль/i.test(name)) return '02';
  if (/физик/i.test(name)) return '03';
  if (/хим/i.test(name)) return '04';
  if (/информ/i.test(name)) return '05';
  if (/биолог/i.test(name)) return '06';
  if (/истор/i.test(name)) return '07';
  if (/географ/i.test(name)) return '08';
  if (/англ/i.test(name)) return '09';
  if (/обществ/i.test(name)) return '10';
  if (/литератур/i.test(name)) return '11';
  if (/базов/i.test(name)) return '12';
  return '00';
}

function cells(count: number, cls: string): string {
  return Array.from({ length: count }, () => `<div class="${cls}"></div>`).join('');
}

function buildBlank1(cfg: EgeSubjectConfig, part1Count: number): string {
  // Адаптация количества строк под выбранный предмет (20 для математики профиль, 27 для русского)
  const isRussian = /русск/i.test(cfg.name);
  const isMath = /математ/i.test(cfg.name);
  const totalRows = isRussian ? 27 : isMath ? 20 : Math.max(part1Count, 20);
  const half = Math.ceil(totalRows / 2);

  const makeRow = (n: number) =>
    `<div class="b-arow"><div class="b-anum">${n}</div><div class="cells">${cells(ANSWER_CELLS, 'b-acell')}</div></div>`;

  const col1 = Array.from({ length: half }, (_, i) => makeRow(i + 1)).join('');
  const col2 = Array.from({ length: totalRows - half }, (_, i) => makeRow(half + i + 1)).join('');

  // Замена ошибочных ответов: 6 строк
  const repRows = Array.from({ length: 6 }, (_, idx) => {
    return `<div class="b-rep-row">
      <div class="b-rep-num">${idx + 1}</div>
      <div class="cells">${cells(2, 'b-acell')}</div>
      <span class="b-rep-split">=</span>
      <div class="cells">${cells(ANSWER_CELLS, 'b-acell')}</div>
    </div>`;
  });
  const repCol1 = repRows.slice(0, 3).join('');
  const repCol2 = repRows.slice(3, 6).join('');

  const sampleChars = '0123456789,-АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('');
  const sampleHtml = sampleChars.map((c) => `<div class="b-sample-ch">${c}</div>`).join('');
  const subjCode = getSubjectCode(cfg.name);

  return `<section class="sheet page-break">
  <div class="blank-official">
    <div class="b-top-bar">
      <div class="b-main-title">
        <h1>ЕДИНЫЙ ГОСУДАРСТВЕННЫЙ ЭКЗАМЕН</h1>
        <p>БЛАНК ОТВЕТОВ № 1 // РОСОБРНАДЗОР</p>
      </div>
      <div class="b-barcode-box">
        <div class="b-barcode">||| | || |||| | ||| 77019284</div>
        <span>ФОРМА 1-ЕГЭ</span>
      </div>
    </div>

    <!-- Поля регистрации -->
    <div class="b-reg-grid">
      <div class="b-field-box">
        <label>Код региона</label>
        <div class="cells">${cells(2, 'b-acell')}</div>
      </div>
      <div class="b-field-box">
        <label>Код предмета</label>
        <div class="cells">
          <div class="b-acell" style="display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:8.5pt">${subjCode[0]}</div>
          <div class="b-acell" style="display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:8.5pt">${subjCode[1]}</div>
        </div>
      </div>
      <div class="b-field-box">
        <label>Название предмета</label>
        <div style="border-bottom:1.5px solid #000;height:5.2mm;font-weight:bold;font-size:8pt;text-transform:uppercase;padding-left:1mm;display:flex;align-items:center">
          ${escapeHtml(cfg.name)}
        </div>
      </div>
      <div class="b-field-box">
        <label>Код ОО</label>
        <div class="cells">${cells(4, 'b-acell')}</div>
      </div>
      <div class="b-field-box">
        <label>Класс</label>
        <div class="cells">${cells(3, 'b-acell')}</div>
      </div>
      <div class="b-field-box">
        <label>Подпись участника</label>
        <div style="width:25mm;height:5.2mm;border:1px solid #000;background:#fafafa"></div>
      </div>
    </div>

    <!-- Образец написания цифр и букв -->
    <div class="b-samples-box">
      <div class="b-samples-head">Образец написания цифр и букв:</div>
      <div class="b-sample-row">${sampleHtml}</div>
    </div>

    <!-- Результаты выполнения заданий с кратким ответом -->
    <div class="b-sec-hdr">РЕЗУЛЬТАТЫ ВЫПОЛНЕНИЯ ЗАДАНИЙ С КРАТКИМ ОТВЕТОМ (ЧАСТЬ 1)</div>
    <div class="b-grid-2col">
      <div>${col1}</div>
      <div>${col2}</div>
    </div>

    <!-- Замена ошибочных ответов на задания с кратким ответом -->
    <div class="b-replace-box">
      <div class="b-sec-hdr" style="background:#333">ЗАМЕНА ОШИБОЧНЫХ ОТВЕТОВ НА ЗАДАНИЯ С КРАТКИМ ОТВЕТОМ</div>
      <div style="font-size:6.8pt;text-transform:uppercase;margin-bottom:1mm;color:#333">
        Укажите номер задания (2 клетки) и запишите исправленный ответ (17 знакомест):
      </div>
      <div class="b-replace-grid">
        <div>${repCol1}</div>
        <div>${repCol2}</div>
      </div>
    </div>

    <div class="b-foot-hint">
      Заполнять чёрной гелевой или капиллярной ручкой. Каждый символ, запятая и знак «минус» записываются в отдельную клетку строго по образцу. Исправления вне блока «Замена ошибочных ответов» не допускаются.
    </div>
  </div>
</section>`;
}

function buildBlank2(cfg: EgeSubjectConfig, sheets = 2): string {
  const one = (n: number) => `<section class="sheet page-break">
  <div class="blank-title">
    <h1>Бланк ответов № 2 — лист ${n}</h1>
    <div class="stamp">Тренировочный бланк<br>не является официальным образцом</div>
  </div>
  <div class="meta">ЕГЭ // ${escapeHtml(cfg.name)} // задания с развёрнутым ответом</div>
  <div class="meta-line"><span>Номер задания:</span><span>Код предмета:</span><span>Лист №:</span></div>
  <div class="lined"></div>
</section>`;
  return Array.from({ length: sheets }, (_, i) => one(i + 1)).join('');
}

function buildInstruction(cfg: EgeSubjectConfig, variant: ExamVariant): string {
  const totalMin = Math.round(variant.timeLimitSeconds / 60);
  const part2 = variant.part2Count;
  return `<div class="instruction">
  <strong>Инструкция по выполнению работы.</strong>
  <ul>
    <li>На выполнение экзаменационной работы отводится <strong>${hoursLabel(totalMin)}</strong>.</li>
    <li>Работа состоит из <strong>${variant.totalTasks}</strong> заданий${
      part2 > 0
        ? `: часть 1 — ${variant.part1Count} заданий с кратким ответом, часть 2 — ${part2} заданий с развёрнутым ответом`
        : ' с кратким ответом'
    }.</li>
    <li>Ответы к заданиям части 1 записываются в бланк ответов № 1 по образцу: каждый символ в отдельной клетке.</li>
    ${part2 > 0 ? '<li>Решения заданий части 2 записываются на бланке ответов № 2 полно и обоснованно.</li>' : ''}
    <li>Максимальный первичный балл: <strong>${variant.maxPrimaryScore ?? cfg.maxScore}</strong>.</li>
    <li>Разрешается использовать черновик. Записи в черновике не проверяются.</li>
  </ul>
</div>`;
}

function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function buildTask(task: ExamTaskItem): string {
  const num = task.taskNumber || task.number || 0;
  const body = task.statement || task.text || '';
  const img = task.imageUrl
    ? `<img src="${escapeHtml(absoluteUrl(task.imageUrl))}" alt="Иллюстрация к заданию ${num}">`
    : '';
  const maxScore = task.maxScore ? `<small>(${task.maxScore} б.)</small>` : '';
  const answerLine =
    task.type === 'SHORT' ? '<div class="answer-line">Ответ: ______________________</div>' : '';
  return `<div class="task"><div class="task-head">${num}. ${maxScore}</div>${renderRichText(body)}${img}${answerLine}</div>`;
}

export interface PrintOptions {
  /** Добавить бланк № 1 / № 2 после КИМ (по умолчанию да). */
  withBlanks?: boolean;
}

/** Печать КИМ варианта (+ бланки). Возвращает false, если браузер заблокировал окно. */
export function printVariant(
  variant: ExamVariant,
  cfg: EgeSubjectConfig,
  options: PrintOptions = {}
): boolean {
  const withBlanks = options.withBlanks !== false;
  const sorted = [...variant.tasks].sort(
    (a, b) => (a.taskNumber || a.number || 0) - (b.taskNumber || b.number || 0)
  );
  const part1Tasks = sorted.filter((t) => t.type === 'SHORT');
  const part2Tasks = sorted.filter((t) => t.type !== 'SHORT');

  const code = variant.variantCode ? `Вариант ${escapeHtml(variant.variantCode)}` : `Вариант № ${variant.variantNumber}`;

  const kim = `<section class="sheet ${withBlanks ? 'page-break' : ''}">
  <h1>Единый государственный экзамен по предмету «${escapeHtml(cfg.name)}»</h1>
  <div class="meta">Контрольные измерительные материалы // ${code}</div>
  ${buildInstruction(cfg, variant)}
  ${part1Tasks.length ? `<h2>Часть 1</h2>${part1Tasks.map(buildTask).join('')}` : ''}
  ${
    part2Tasks.length
      ? `<h2>Часть 2</h2><p style="font-size:10.5pt;margin:0 0 3mm">Для записи ответов на задания этой части используйте бланк ответов № 2.</p>${part2Tasks.map(buildTask).join('')}`
      : ''
  }
</section>`;

  const blanks = withBlanks
    ? buildBlank1(cfg, variant.part1Count) + (variant.part2Count > 0 ? buildBlank2(cfg) : '')
    : '';

  return openPrintWindow(`КИМ — ${cfg.name} — ${code}`, kim + blanks);
}

/** Печать чистых бланков для выбранного предмета (без варианта КИМ). */
export function printBlanks(cfg: EgeSubjectConfig): boolean {
  const body =
    buildBlank1(cfg, cfg.part1Count) + (cfg.hasPart2 && cfg.part2Count > 0 ? buildBlank2(cfg) : '');
  return openPrintWindow(`Бланки ответов — ${cfg.name}`, body);
}
