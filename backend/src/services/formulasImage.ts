/**
 * Формулы — картинкой, а не текстом: AI присылает формулы строками,
 * а здесь они упаковываются в SVG-изображение на фоне вкладки (#09090b).
 * Фронтенд показывает его тегом <img>, фон совпадает один в один.
 */

const BG = '#09090b';
const FG = '#ececf1';
const FONT_SIZE = 17;
const LINE_HEIGHT = 30;
const PAD_X = 24;
const PAD_TOP = 34;
const PAD_BOTTOM = 24;
const WIDTH = 760;
const MAX_LINES = 24;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Текст формул -> data-URI SVG-изображения. Пустой ввод даёт null. */
export function formulasToImage(text: string | null | undefined): string | null {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);
  if (lines.length === 0) return null;

  const height = PAD_TOP + (lines.length - 1) * LINE_HEIGHT + PAD_BOTTOM;
  const rows = lines
    .map(
      (line, i) =>
        `<text x="${PAD_X}" y="${PAD_TOP + i * LINE_HEIGHT}" font-family="JetBrains Mono, Consolas, Menlo, monospace" font-size="${FONT_SIZE}" fill="${FG}">${escapeXml(line)}</text>`
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">` +
    `<rect width="${WIDTH}" height="${height}" fill="${BG}"/>${rows}</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
