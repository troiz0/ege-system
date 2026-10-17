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
    if (t.includes('математик') || t.includes('math')) {
      if (
        s.includes('математик') ||
        s.includes('алгебр') ||
        s.includes('геометр') ||
        s.includes('вероятност') ||
        s.includes('статистик') ||
        s.includes('тригонометр') ||
        s.includes('math')
      ) {
        return true;
      }
    }

    // Информатика покрывает программирование и IT-дисциплины
    if (t.includes('информатик') || t.includes('inf')) {
      if (
        s.includes('информатик') ||
        s.includes('программирован') ||
        s.includes('алгоритм') ||
        s.includes('код') ||
        s.includes('inf') ||
        s.includes('cs')
      ) {
        return true;
      }
    }

    // Русский язык
    if ((t.includes('русск') || t.includes('rus')) && (s.includes('русск') || s.includes('rus'))) return true;

    // Физика
    if ((t.includes('физик') || t.includes('phys')) && (s.includes('физик') || s.includes('phys'))) return true;

    // Химия
    if ((t.includes('хими') || t.includes('chem')) && (s.includes('хими') || s.includes('chem'))) return true;

    // Биология
    if ((t.includes('биолог') || t.includes('bio')) && (s.includes('биолог') || s.includes('bio'))) return true;

    // История
    if ((t.includes('истори') || t.includes('hist')) && (s.includes('истори') || s.includes('hist'))) return true;

    // Обществознание
    if ((t.includes('обществ') || t.includes('soc')) && (s.includes('обществ') || s.includes('soc'))) return true;

    // География
    if ((t.includes('географ') || t.includes('geo')) && (s.includes('географ') || s.includes('geo'))) return true;

    // Литература
    if ((t.includes('литератур') || t.includes('lit')) && (s.includes('литератур') || s.includes('lit'))) return true;

    // Иностранные языки
    if ((t.includes('английск') || t.includes('eng')) && (s.includes('английск') || s.includes('eng') || s.includes('иностранный'))) return true;
    if (t.includes('немецк') && (s.includes('немецк') || s.includes('deu'))) return true;
    if (t.includes('французск') && (s.includes('французск') || s.includes('fra'))) return true;
    if (t.includes('испанск') && (s.includes('испанск') || s.includes('spa'))) return true;
    if (t.includes('китайск') && (s.includes('китайск') || s.includes('chi'))) return true;

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
