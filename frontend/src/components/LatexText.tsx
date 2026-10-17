import React, { useMemo } from 'react';
import katex from 'katex';
import { sanitizeMathText } from '../lib/mathSanitizer';

interface LatexTextProps {
  content?: string;
  text?: string;
  className?: string;
}

const LATEX_COMMAND_NAMES = new Set([
  'frac', 'sqrt', 'log', 'ln', 'sin', 'cos', 'tan', 'cot',
  'arcsin', 'arccos', 'arctan', 'pm', 'mp', 'cdot', 'times',
  'div', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta',
  'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'omega',
  'Delta', 'Omega', 'le', 'ge', 'ne', 'approx', 'equiv', 'sim',
  'infty', 'in', 'notin', 'subset', 'subseteq', 'cup', 'cap',
  'to', 'rightarrow', 'Rightarrow', 'Leftarrow', 'iff',
  'sum', 'prod', 'int', 'lim', 'vec', 'overrightarrow',
  'overline', 'underline', 'text', 'mathrm', 'left', 'right',
  'circ', 'degree', 'begin', 'end', 'cases', 'array', 'gathered', 'matrix'
]);

function isCyrillic(char: string): boolean {
  return /[а-яА-ЯёЁ]/.test(char);
}

/**
 * Нормализация записи векторов (\overrightarrowAB -> \overrightarrow{AB}, \vec c -> \vec{c})
 */
export function normalizeVectors(text: string): string {
  return text
    .replace(/\\overrightarrow\s*([a-zA-Z]{1,2})(?![{a-zA-Z])/g, (_, p1) => `\\overrightarrow{${p1}}`)
    .replace(/\\vec\s*([a-zA-Z]{1,2})(?![{a-zA-Z])/g, (_, p1) => `\\vec{${p1}}`);
}

/**
 * Авто-детект и оборачивание сырого LaTeX без долларов ($...$) в обычном тексте
 */
export function wrapRawLatexInPlainText(text: string): string {
  const anchorRegex = /\\([a-zA-Z]+)|\^\{|_\{/g;
  let match: RegExpExecArray | null;
  const regions: { start: number; end: number }[] = [];

  while ((match = anchorRegex.exec(text)) !== null) {
    if (match[1] && !LATEX_COMMAND_NAMES.has(match[1])) {
      continue;
    }

    const anchorStart = match.index;
    const anchorEnd = match.index + match[0].length;

    // Расширяем влево до границы слова, пунктуации или знака $
    let start = anchorStart;
    while (start > 0) {
      const prev = text[start - 1];
      if (isCyrillic(prev) || prev === '\n' || prev === '$') break;
      if (prev === ' ' && start > 1 && /[.,;:!?«"']/.test(text[start - 2])) {
        break;
      }
      if (/[.,;:!?«"']/.test(prev) && !/[0-9]/.test(text[start])) {
        break;
      }
      start--;
    }

    // Расширяем вправо с балансировкой скобок {} [] ()
    let end = anchorEnd;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;

    for (let i = start; i < anchorEnd; i++) {
      if (text[i] === '{') braceDepth++;
      if (text[i] === '}') braceDepth--;
      if (text[i] === '[') bracketDepth++;
      if (text[i] === ']') bracketDepth--;
      if (text[i] === '(') parenDepth++;
      if (text[i] === ')') parenDepth--;
    }

    while (end < text.length) {
      const ch = text[end];
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
      else if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;

      if (braceDepth > 0 || bracketDepth > 0 || parenDepth > 0) {
        end++;
        continue;
      }

      if (isCyrillic(ch) || ch === '\n' || ch === '$') {
        break;
      }

      // Знаки препинания в конце предложения (кроме десятичных точек 3.14 или 3,14)
      if (/[.,;:!?»"']/.test(ch)) {
        const next = text[end + 1];
        if ((ch === '.' || ch === ',') && /[0-9]/.test(next) && /[0-9]/.test(text[end - 1])) {
          end++;
          continue;
        }
        break;
      }

      end++;
    }

    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;

    if (start < end) {
      if (regions.length > 0 && start <= regions[regions.length - 1].end + 1) {
        regions[regions.length - 1].end = Math.max(regions[regions.length - 1].end, end);
      } else {
        regions.push({ start, end });
      }
    }
  }

  if (regions.length === 0) return text;

  let result = '';
  let cursor = 0;
  for (const r of regions) {
    result += text.slice(cursor, r.start);
    result += `$${text.slice(r.start, r.end)}$`;
    cursor = r.end;
  }
  result += text.slice(cursor);
  return result;
}

/**
 * Комплексная предобработка текста с LaTeX:
 * 1. Нормализация векторов
 * 2. Авто-оборачивание формул в $...$ без повреждения существующих $ и $$
 */
export function preprocessLatex(content: string): string {
  if (!content) return '';
  const sanitized = sanitizeMathText(content);
  const normalized = normalizeVectors(sanitized);
  // Блочные формулы $$...$$ могут быть многострочными, инлайн-формулы $...$ строго однострочные без переходов строк
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$(?:[^\$\n\r]|\\\$)+?\$)/g);

  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      return wrapRawLatexInPlainText(part);
    })
    .join('');
}

export const LatexText: React.FC<LatexTextProps> = ({ content, text, className = '' }) => {
  const rawText = content ?? text ?? '';
  if (!rawText) return null;

  const preprocessed = useMemo(() => preprocessLatex(rawText), [rawText]);

  // Разбиваем текст по математическим блокам $$...$$ (многострочные) и $...$ (однострочные)
  const parts = preprocessed.split(/(\$\$[\s\S]*?\$\$|\$(?:[^\$\n\r]|\\\$)+?\$)/g);

  let isBold = false;

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
          // Блочная формула
          const math = part.slice(2, -2).trim().replace(/^\$+|\$+$/g, '');
          try {
            const html = katex.renderToString(math, {
              displayMode: true,
              throwOnError: false,
              errorColor: '#f87171',
            });
            if (html.includes('class="katex-error"')) {
              return <span key={index} className="font-mono text-xs text-zinc-300">{part}</span>;
            }
            return (
              <span
                key={index}
                className="block my-2 overflow-x-auto py-1"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        } else if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
          // Инлайн формула
          const math = part.slice(1, -1).trim().replace(/^\$+|\$+$/g, '');
          try {
            const html = katex.renderToString(math, {
              displayMode: false,
              throwOnError: false,
              errorColor: '#f87171',
            });
            if (html.includes('class="katex-error"')) {
              return <span key={index} className={isBold ? 'font-bold text-zinc-100' : 'text-zinc-300'}>{part}</span>;
            }
            return (
              <span
                key={index}
                className={`inline-block px-0.5 ${isBold ? 'font-bold text-zinc-100' : ''}`}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }

        // Обычный текст: парсинг markdown **жирный шрифт**
        if (part.includes('**')) {
          const subparts = part.split(/(\*\*)/g);
          return (
            <React.Fragment key={index}>
              {subparts.map((sp, sIdx) => {
                if (sp === '**') {
                  isBold = !isBold;
                  return null;
                }
                if (!sp) return null;
                return isBold ? (
                  <strong key={sIdx} className="font-bold text-zinc-100">
                    {sp}
                  </strong>
                ) : (
                  <span key={sIdx}>{sp}</span>
                );
              })}
            </React.Fragment>
          );
        }

        return isBold ? (
          <strong key={index} className="font-bold text-zinc-100">
            {part}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </span>
  );
};

export default LatexText;
