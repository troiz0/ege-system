import * as cheerio from 'cheerio';
import { prisma } from '../lib/prisma.js';
import { findSubjectConfig } from '../lib/subjects.js';
import {
  generateRandomExamVariant,
  type ExamTaskItem,
  type ExamVariant,
} from './fipiExamService.js';

export const RESHU_EGE_SUBDOMAINS: Record<string, string> = {
  math_profile: 'math-ege.sdamgia.ru',
  math_base: 'mathb-ege.sdamgia.ru',
  russian: 'rus-ege.sdamgia.ru',
  physics: 'phys-ege.sdamgia.ru',
  social: 'soc-ege.sdamgia.ru',
  informatics: 'inf-ege.sdamgia.ru',
  history: 'hist-ege.sdamgia.ru',
  biology: 'bio-ege.sdamgia.ru',
  chemistry: 'chem-ege.sdamgia.ru',
  literature: 'lit-ege.sdamgia.ru',
  geography: 'geo-ege.sdamgia.ru',
  english: 'en-ege.sdamgia.ru',
  german: 'de-ege.sdamgia.ru',
  french: 'fr-ege.sdamgia.ru',
  spanish: 'sp-ege.sdamgia.ru',
};

/**
 * Конвертация озвучки формулы СдамГИА / РешуЕГЭ (alt) в чистый LaTeX
 */
export function sdamgiaAltToLatex(rawAlt: string): string {
  if (!rawAlt) return '';
  // Удаляем мягкие переносы и невидимые спецсимволы
  let s = rawAlt.replace(/[\u00AD\u200B]/g, '').replace(/[\u202F\u00A0]/g, ' ').trim();

  // Поддержка вложенных многоэтажных дробей (итеративный разбор изнутри наружу)
  let prevS = '';
  while (prevS !== s && /дробь:\s*числитель:/i.test(s)) {
    prevS = s;
    s = s.replace(
      /дробь:\s*числитель:\s*((?:(?!дробь:)[^,])*?)\s*,\s*знаменатель:\s*((?:(?!дробь:|конец дроби)[^])*?)\s*конец дроби/gi,
      '\\frac{$1}{$2}'
    );
  }

  s = s
    .replace(/косинус/gi, '\\cos ')
    .replace(/синус/gi, '\\sin ')
    .replace(/котангенс/gi, '\\cot ')
    .replace(/тангенс/gi, '\\tan ')
    .replace(/логарифм по основанию:\s*(.*?)\s*аргумента:\s*(.*?)\s*конец логарифма/gi, '\\log_{$1}($2)')
    .replace(/натуральный логарифм/gi, '\\ln ')
    .replace(/корень из:\s*начало аргумента:\s*(.*?)\s*конец аргумента/gi, '\\sqrt{$1}')
    .replace(/корень из\s+([0-9a-zA-Z\\]+)/gi, '\\sqrt{$1}')
    .replace(/дробь:\s*числитель:\s*(.*?)\s*,\s*знаменатель:\s*(.*?)\s*конец дроби/gi, '\\frac{$1}{$2}')
    .replace(/модуль:\s*начало аргумента:\s*(.*?)\s*конец аргумента/gi, '|$1|')
    .replace(/левая круглая скобка/gi, '(')
    .replace(/правая круглая скобка/gi, ')')
    .replace(/левая квадратная скобка/gi, '[')
    .replace(/правая квадратная скобка/gi, ']')
    .replace(/левая фигурная скобка/gi, '\\{')
    .replace(/правая фигурная скобка/gi, '\\}')
    .replace(/больше или равно/gi, '\\ge ')
    .replace(/меньше или равно/gi, '\\le ')
    .replace(/не равно/gi, '\\ne ')
    .replace(/равносильно/gi, '\\iff ')
    .replace(/умножить на|знак умножения/gi, '\\cdot ')
    .replace(/плюс/gi, ' + ')
    .replace(/минус/gi, ' - ')
    .replace(/равно/gi, ' = ')
    .replace(/градус(?:ов|а)?/gi, '^{\\circ}')
    .replace(/Пи/g, '\\pi')
    .replace(/бесконечность/gi, '\\infty')
    .replace(/принадлежит/gi, '\\in ')
    .replace(/не принадлежит/gi, '\\notin ')
    .replace(/в квадрате/gi, '^2')
    .replace(/в кубе/gi, '^3')
    .replace(/точка с запятой/gi, ';')
    .replace(/запятая/gi, ',')
    // Вектор из 1 буквы — строчный: \vec{a}; из 2 букв — прописной: \overrightarrow{AB}
    .replace(/вектор(?:а)?\s+([A-Za-z]{1,2})/gi, (_, p1) => {
      if (p1.length === 1) return `\\vec{${p1.toLowerCase()}}`;
      return `\\overrightarrow{${p1.toUpperCase()}}`;
    })
    .replace(/\\overrightarrow\s*([a-z])(?![{a-zA-Z])/g, (_, p1) => `\\vec{${p1}}`)
    .replace(/\\overrightarrow\s*([A-Z]{2})(?![{a-zA-Z])/g, (_, p1) => `\\overrightarrow{${p1}}`)
    .replace(/\\vec\s*([a-zA-Z]{1,2})(?![{a-zA-Z])/g, (_, p1) => `\\vec{${p1}}`)
    .replace(/\s+/g, ' ')
    .trim();

  let punct = '';
  if (/[.,;]$/.test(s)) {
    punct = s.slice(-1);
    s = s.slice(0, -1).trim();
  }
  return ` $${s}$` + (punct ? punct + ' ' : ' ');
}

export const FORBIDDEN_THEORY_PHRASES = [
  'Что проверяется и что нужно знать',
  'Элементы содержания по «Кодификатору»',
  'Справочник РЕШУ ЕГЭ',
  'Мы решали по алгоритму',
  'Пример задания и решение',
  'Правило:',
  'Кодификатор:',
  'Теория к заданию:',
  'Справочные материалы',
  'Пункт правила',
];

/**
 * Очистка блока HTML задачи/решения: формулы -> LaTeX, иллюстрации -> imageUrl, удаление мусора
 */
export function cleanHtmlToLatexText(
  $: cheerio.Root,
  container: cheerio.Cheerio,
  subdomain: string
): { text: string; imageUrl?: string } {
  const clone = container.clone();

  // Удаляем рекламу, мета-теги, кодификаторы, теорию и сторонние кнопки
  clone
    .find(
      '.align-left, .topic_desc, .pnotes, .our_header, .explanation, .solution, .minor, .sources, .topic, script, style, .similar, form, input, button, select, .explain_link, .prob_nums, .prob_answer, .answer, [class*="theory"], [class*="rule"], [class*="catalog"]'
    )
    .remove();

  // Удаляем дочерние элементы, текст которых содержит маркеры методичек/справочников
  clone.find('*').each((_i: number, el: cheerio.Element) => {
    const elText = $(el).text();
    for (const phrase of FORBIDDEN_THEORY_PHRASES) {
      if (elText.includes(phrase)) {
        $(el).remove();
        break;
      }
    }
  });

  let imageUrl: string | undefined = undefined;

  // Обработка картинок
  clone.find('img').each((_i: number, imgEl: cheerio.Element) => {
    const $img = $(imgEl);
    const cls = $img.attr('class') || '';
    const src = $img.attr('src') || '';
    const alt = $img.attr('alt') || '';

    const isFormula = cls.includes('tex') || src.includes('/formula/');
    if (isFormula) {
      const latex = sdamgiaAltToLatex(alt);
      $img.replaceWith(latex);
    } else if (src) {
      if (!imageUrl) {
        imageUrl = src.startsWith('http')
          ? src
          : `https://${subdomain}${src.startsWith('/') ? src : '/' + src}`;
      }
      $img.remove();
    }
  });

  // Сохраняем переносы строк для списков, пунктов условий и абзацев
  clone.find('br').replaceWith('\n');
  clone.find('p, div, tr, li, h1, h2, h3, h4, h5, h6').each((_i: number, el: cheerio.Element) => {
    $(el).prepend('\n\n');
  });

  // Получаем чистый текст
  let text = clone.text().replace(/[\u00AD\u200B]/g, '').replace(/[\u202F\u00A0]/g, ' ');

  // Удаляем мусорные методические плашки и учебные статьи, прикрепленные к концу решения/условия
  text = text
    .replace(/Пункт\s+правила[\s\S]*$/i, '')
    .replace(/Правило:[\s\S]*$/i, '')
    .replace(/Что\s+проверяется[\s\S]*$/i, '')
    .replace(/Справочник\s+РЕШУ[\s\S]*$/i, '')
    .replace(/Мы\s+решали\s+по\s+алгоритму[\s\S]*$/i, '')
    .replace(/Пример\s+задания\s+и\s+решение[\s\S]*$/i, '')
    .replace(/Критерии\s+оценивания[\s\S]*$/i, '')
    .replace(/Разбор\s+аналогичного[\s\S]*$/i, '')
    .replace(/Источник:[\s\S]*$/i, '')
    .replace(/Кодификатор:[\s\S]*$/i, '')
    .replace(/Теория\s+к\s+заданию:[\s\S]*$/i, '')
    .replace(/\\overrightarrow\s*([a-zA-Z]{1,2})(?![{a-zA-Z])/g, (_, p1) => `\\overrightarrow{${p1}}`)
    .replace(/\\vec\s*([a-zA-Z]{1,2})(?![{a-zA-Z])/g, (_, p1) => `\\vec{${p1}}`)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\n\s*)+([а-я]\))/g, '\n\n$2')
    .trim();

  return { text, imageUrl };
}

export class ReshuEgeService {
  /**
   * Получение или генерация случайного варианта КИМ из РешуЕГЭ с извлечением чистых структурированных данных
   */
  async fetchRandomVariant(subjectId = 'math_profile'): Promise<ExamVariant> {
    const cfg = findSubjectConfig(subjectId);
    const resolvedId = cfg.id;

    // 1. Проверяем кэш в базе данных: если есть 2+ сохраненных вариантов, с вероятностью 50% берем готовый
    try {
      const cachedList = await prisma.examVariantCache.findMany({
        where: { subjectId: resolvedId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (cachedList.length >= 2 && Math.random() < 0.5) {
        const randomIndex = Math.floor(Math.random() * cachedList.length);
        const parsed = JSON.parse(cachedList[randomIndex].dataJson) as ExamVariant;
        const hasCorruptedTasks = parsed.tasks.some(
          (t) =>
            t.statement.includes('Что проверяется и что нужно знать') ||
            t.statement.includes('Элементы содержания по «Кодификатору»') ||
            t.statement.includes('Справочник РЕШУ ЕГЭ') ||
            (t.solutionCriteria && t.solutionCriteria.length > 8000)
        );
        if (hasCorruptedTasks) {
          await prisma.examVariantCache
            .delete({ where: { id: cachedList[randomIndex].id } })
            .catch(() => {});
        } else {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('ExamVariantCache lookup warning:', e);
    }

    // 2. Запрос к РешуЕГЭ (СдамГИА)
    const subdomain = RESHU_EGE_SUBDOMAINS[resolvedId] || 'math-ege.sdamgia.ru';

    try {
      // Составляем URL для генерации теста со всеми заданиями спецификации
      const probParams: string[] = [];
      const totalCount = cfg.tasksCount || 20;
      for (let i = 1; i <= totalCount; i++) {
        probParams.push(`prob${i}=1`);
      }
      const generateUrl = `https://${subdomain}/test?a=generate&${probParams.join('&')}`;

      const res = await fetch(generateUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
        redirect: 'follow',
      });

      if (!res.ok) {
        throw new Error(`ReshuEGE responded with HTTP ${res.status}`);
      }

      const finalUrl = res.url;
      let variantNumber = Math.floor(100000 + Math.random() * 900000);
      const idMatch = finalUrl.match(/id=(\d+)/);
      let testId: string | null = null;
      if (idMatch && idMatch[1]) {
        testId = idMatch[1];
        variantNumber = parseInt(idMatch[1], 10);
      }

      // Запрашиваем версию теста print=true для извлечения эталонных ответов и решений
      let pageHtml = '';
      if (testId) {
        try {
          const printUrl = `https://${subdomain}/test?id=${testId}&print=true`;
          const printRes = await fetch(printUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
          });
          if (printRes.ok) {
            pageHtml = await printRes.text();
          }
        } catch (printErr) {
          console.warn('Failed to fetch print version, fallback to base HTML:', printErr);
        }
      }

      if (!pageHtml) {
        pageHtml = await res.text();
      }

      const $ = cheerio.load(pageHtml);
      const problemElements = $('.prob_maindiv, .problem_container');

      if (problemElements.length === 0) {
        throw new Error('No problems found on generated ReshuEGE page');
      }

      const tasks: ExamTaskItem[] = [];

      problemElements.each((index, el) => {
        const taskNum = index + 1;
        const isPart1 = taskNum <= cfg.part1Count;

        // Поиск оригинального ID задачи (ФИПИ / СдамГИА)
        let fipiId = $(el).find('.prob_nums a, .prob_num').first().text().trim();
        if (!fipiId) {
          const rawId = $(el).attr('id') || '';
          fipiId = rawId.replace(/[^0-9]/g, '') || String(taskNum);
        }

        // Клонируем контейнер задачи и убираем методические статьи/теорию до поиска тела условия
        const clone = $(el).clone();
        clone
          .find(
            '.align-left, .topic_desc, .pnotes, .our_header, .explanation, .solution, .minor, .sources, .topic, script, style, .similar, form, input, button, select, .explain_link, .prob_nums, .prob_answer, .answer, [class*="theory"], [class*="rule"]'
          )
          .remove();

        // Проверяем наличие текста для чтения (.probtext), характерного для заданий 1-3 и 22-26
        const probTextEl = clone.find('.probtext').first();
        let passage = '';
        if (probTextEl.length) {
          passage = cleanHtmlToLatexText($, probTextEl, subdomain).text;
          probTextEl.remove();
        }

        // Тело вопроса задания
        const pbody = clone.find('.pbody').first();
        const { text: questionText, imageUrl } = cleanHtmlToLatexText(
          $,
          pbody.length ? pbody : clone,
          subdomain
        );

        let statement = passage ? `${passage}\n\n${questionText}` : questionText;

        // Санити-чек: удаляем остатки теории, если они все еще просочились
        for (const phrase of FORBIDDEN_THEORY_PHRASES) {
          if (statement.includes(phrase)) {
            statement = statement.split(phrase)[0].trim();
          }
        }
        statement = statement.replace(/\n{3,}/g, '\n\n').trim();

        // Парсинг правильного ответа для части 1
        let rawAns = $(el).find('.answer').text().replace(/[\u00AD\u200B]/g, '').trim();
        rawAns = rawAns.replace(/^Ответ:\s*/i, '').trim();
        if (isPart1 && rawAns.endsWith('.')) {
          rawAns = rawAns.slice(0, -1).trim();
        }

        // Парсинг решения и критериев ФИПИ для части 2
        const solEl = $(el).find('.solution').first();
        let solutionCriteria: string | undefined = undefined;
        if (solEl.length) {
          const cleanedSol = cleanHtmlToLatexText($, solEl, subdomain).text;
          if (cleanedSol && !FORBIDDEN_THEORY_PHRASES.some((p) => cleanedSol.startsWith(p))) {
            solutionCriteria = cleanedSol;
          }
        }

        // Расчет первичного балла задачи
        let maxScore = 1;
        if (!isPart1) {
          if (resolvedId === 'math_profile') {
            if (taskNum >= 19) maxScore = 4;
            else if (taskNum === 18) maxScore = 3;
            else maxScore = 2; // 14, 15, 16, 17
          } else if (resolvedId === 'russian') {
            maxScore = 21; // сочинение
          } else {
            const part2Total = Math.max(1, cfg.maxScore - cfg.part1Count);
            maxScore = Math.max(2, Math.round(part2Total / Math.max(1, cfg.part2Count)));
          }

          if (!solutionCriteria) {
            solutionCriteria = `Официальные критерии ФИПИ для задания № ${taskNum} (${cfg.name}):\n• Критерий К1 (Обоснованность решения): 0–${maxScore - 1} б.\n• Критерий К2 (Точность вычислений и оформление): 0–1 б.`;
          }
        }

        tasks.push({
          taskNumber: taskNum,
          fipiId,
          topic: `Задание ${taskNum} // ${cfg.name}`,
          statement: statement || `Условие задания № ${taskNum}`,
          imageUrl,
          correctAnswer: rawAns || undefined,
          solutionCriteria: solutionCriteria || undefined,
          maxScore,
          type: isPart1 ? 'SHORT' : 'DETAILED',

          // Поля для обратной совместимости
          id: taskNum,
          part: isPart1 ? 1 : 2,
          number: taskNum,
          title: `Задание № ${taskNum} (ФИПИ #${fipiId})`,
          text: statement || `Условие задания № ${taskNum}`,
          fipiCriteria: solutionCriteria,
        });
      });

      const partA = Math.floor(variantNumber / 1000) % 1000;
      const partB = variantNumber % 1000;
      const variantCode = `${partA}-${partB}`;

      const variant: ExamVariant = {
        id: `reshu_${resolvedId}_var_${variantNumber}`,
        subject: resolvedId,
        subjectName: cfg.name,
        variantNumber,
        variantCode,
        title: `${cfg.name} — Вариант РешуЕГЭ № ${variantNumber}`,
        timeLimitSeconds: cfg.durationMinutes * 60,
        totalTasks: tasks.length,
        part1Count: cfg.part1Count,
        part2Count: cfg.part2Count,
        maxPrimaryScore: cfg.maxScore,
        tasks,
      };

      // 3. Сохраняем в кэш базы данных
      try {
        await prisma.examVariantCache.create({
          data: {
            subjectId: resolvedId,
            variantNumber,
            dataJson: JSON.stringify(variant),
          },
        });
      } catch (cacheErr) {
        console.warn('Failed to save ExamVariantCache:', cacheErr);
      }

      return variant;
    } catch (fetchErr) {
      console.warn(`ReshuEGE fetch failed for ${resolvedId}, falling back:`, fetchErr);

      // 4. Fallback 1: Любой готовый вариант из кэша
      try {
        const fallbackCached = await prisma.examVariantCache.findFirst({
          where: { subjectId: resolvedId },
          orderBy: { createdAt: 'desc' },
        });

        if (fallbackCached) {
          return JSON.parse(fallbackCached.dataJson) as ExamVariant;
        }
      } catch (dbErr) {
        console.warn('Fallback cache read error:', dbErr);
      }

      // 5. Fallback 2: Локальный генератор банка задач
      return generateRandomExamVariant(resolvedId);
    }
  }
}

export const reshuEgeService = new ReshuEgeService();
