/**
 * backend/src/lib/subjectMatcher.ts
 * Утилита строгого сопоставления целевых предметов подготовки к ЕГЭ
 * Предотвращает утечку сторонних школьных предметов (английский, обществознание, физкультура и т.д.)
 * в виджеты КИМ ФИПИ, слабые темы, рекомендации и аналитику ученика.
 */

/** Нормализует строку для нечеткого поиска корня предмета */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е');
}

/** Сопоставляет предмет (из МЭШ, пробников или тренажера) с целевыми предметами ЕГЭ */
export function isSubjectMatchingTarget(subject: string, targetNames: string[]): boolean {
  if (!subject) return false;
  if (!targetNames || targetNames.length === 0) return true;

  const s = norm(subject);

  return targetNames.some((target) => {
    const t = norm(target);

    // Точное совпадение
    if (s === t) return true;

    // Математика (профиль / база) покрывает школьные разделы: алгебра, геометрия, матанализ, вероятность и статистика
    if (t.includes('математик')) {
      if (
        s.includes('математик') ||
        s.includes('алгебр') ||
        s.includes('геометр') ||
        s.includes('вероятност') ||
        s.includes('статистик') ||
        s.includes('тригонометр')
      ) {
        return true;
      }
    }

    // Информатика покрывает программирование и IT-дисциплины
    if (t.includes('информатик')) {
      if (
        s.includes('информатик') ||
        s.includes('программирован') ||
        s.includes('алгоритм') ||
        s.includes('код')
      ) {
        return true;
      }
    }

    // Русский язык
    if (t.includes('русск') && s.includes('русск')) return true;

    // Физика
    if (t.includes('физик') && s.includes('физик')) return true;

    // Химия
    if (t.includes('хими') && s.includes('хими')) return true;

    // Биология
    if (t.includes('биолог') && s.includes('биолог')) return true;

    // История
    if (t.includes('истори') && s.includes('истори')) return true;

    // Обществознание
    if (t.includes('обществ') && s.includes('обществ')) return true;

    // География
    if (t.includes('географ') && s.includes('географ')) return true;

    // Литература
    if (t.includes('литератур') && s.includes('литератур')) return true;

    // Иностранные языки
    if (t.includes('английск') && (s.includes('английск') || s.includes('иностранный (английский)'))) return true;
    if (t.includes('немецк') && s.includes('немецк')) return true;
    if (t.includes('французск') && s.includes('французск')) return true;
    if (t.includes('испанск') && s.includes('испанск')) return true;
    if (t.includes('китайск') && s.includes('китайск')) return true;

    return false;
  });
}

/**
 * Проверяет, упоминает ли текст рекомендации предмет или специфическую тему,
 * которая НЕ входит в список целевых предметов ученика.
 */
export function isTextReferringToNonTarget(text: string, targetNames: string[]): boolean {
  if (!text || !targetNames || targetNames.length === 0) return false;
  const lower = norm(text);

  // Маркеры нецелевых предметов
  const foreignMarkers = ['аудирование', 'listening', 'reading', 'speaking', 'английск', 'иностранн', 'лексик', 'grammar'];
  const historyMarkers = ['историческ', 'история россии', 'великая отечественная', 'рсср', 'князь', 'век'];
  const bioMarkers = ['ботаник', 'зоологи', 'генетик', 'митоз', 'мейоз', 'биологи'];
  const chemMarkers = ['химическ', 'реакции ионного', 'периодическ', 'органика', 'неорганика'];
  const physMarkers = ['законы ньютона', 'электромагнитн', 'термодинамик', 'кинематик', 'оптика'];
  const socMarkers = ['обществознани', 'право и политология', 'социологи', 'философи'];

  const hasForeign = targetNames.some((t) => norm(t).includes('английск') || norm(t).includes('иностранн'));
  const hasHistory = targetNames.some((t) => norm(t).includes('истори'));
  const hasBio = targetNames.some((t) => norm(t).includes('биолог'));
  const hasChem = targetNames.some((t) => norm(t).includes('хими'));
  const hasPhys = targetNames.some((t) => norm(t).includes('физик'));
  const hasSoc = targetNames.some((t) => norm(t).includes('обществ'));

  if (!hasForeign && foreignMarkers.some((m) => lower.includes(m))) return true;
  if (!hasHistory && historyMarkers.some((m) => lower.includes(m))) return true;
  if (!hasBio && bioMarkers.some((m) => lower.includes(m))) return true;
  if (!hasChem && chemMarkers.some((m) => lower.includes(m))) return true;
  if (!hasPhys && physMarkers.some((m) => lower.includes(m))) return true;
  if (!hasSoc && socMarkers.some((m) => lower.includes(m))) return true;

  return false;
}
