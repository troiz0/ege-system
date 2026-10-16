import type { EgeSubjectConfig } from './subjects';

/**
 * Тайм-менеджер КИМ (Pacing Assistant).
 *
 * Чистая логика без UI: строит рекомендуемый тайминг по заданиям, оценивает
 * темп прохождения по ходу экзамена и анализирует, куда ушло время после сдачи.
 */

export type PacingSegmentKind = 'part1' | 'task' | 'reserve';

export interface PacingSegment {
  id: string;
  kind: PacingSegmentKind;
  label: string;
  /** Номера заданий в сегменте (для reserve — 0). */
  from: number;
  to: number;
  minutes: number;
  startMin: number;
  endMin: number;
}

export interface PacingPlan {
  totalMinutes: number;
  part1Minutes: number;
  part1Count: number;
  reserveMinutes: number;
  segments: PacingSegment[];
}

/** Авторская норма для профильной математики (на 235 минут). */
const MATH_PROFILE_NORMS = {
  part1: 45,
  tasks: { 14: 15, 15: 25, 16: 20, 17: 25, 18: 30, 19: 25, 20: 25 } as Record<number, number>,
};

/** Вес развернутого задания относительно краткого при распределении времени. */
const PART2_WEIGHT = 3;

export function buildPacingPlan(cfg: EgeSubjectConfig, totalSeconds: number): PacingPlan {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const part1Count = cfg.part1Count;
  const part2Count = cfg.hasPart2 ? cfg.part2Count : 0;

  let part1Minutes: number;
  let part2Minutes: Record<number, number> = {};
  let reserveMinutes: number;

  if (cfg.id === 'math_profile' && part2Count === 7) {
    const scale = totalMinutes / 235;
    part1Minutes = Math.round(MATH_PROFILE_NORMS.part1 * scale);
    let used = part1Minutes;
    for (let n = part1Count + 1; n <= part1Count + part2Count; n++) {
      const m = Math.round((MATH_PROFILE_NORMS.tasks[n] ?? 20) * scale);
      part2Minutes[n] = m;
      used += m;
    }
    reserveMinutes = Math.max(5, totalMinutes - used);
  } else {
    reserveMinutes = Math.max(15, Math.round(totalMinutes * 0.1));
    const workable = Math.max(1, totalMinutes - reserveMinutes);
    if (part2Count === 0) {
      part1Minutes = workable;
    } else {
      const part1Weight = part1Count;
      const part2Weight = part2Count * PART2_WEIGHT;
      part1Minutes = Math.round((workable * part1Weight) / (part1Weight + part2Weight));
      const rest = workable - part1Minutes;
      const perTask = Math.floor(rest / part2Count);
      for (let i = 0; i < part2Count; i++) {
        part2Minutes[part1Count + 1 + i] = perTask;
      }
      // Остаток округления — в последнее задание
      part2Minutes[part1Count + part2Count] += rest - perTask * part2Count;
    }
  }

  const segments: PacingSegment[] = [];
  let cursor = 0;

  segments.push({
    id: 'part1',
    kind: 'part1',
    label: part1Count > 1 ? `${1}–${part1Count}` : '1',
    from: 1,
    to: part1Count,
    minutes: part1Minutes,
    startMin: cursor,
    endMin: cursor + part1Minutes,
  });
  cursor += part1Minutes;

  for (let n = part1Count + 1; n <= part1Count + part2Count; n++) {
    const m = part2Minutes[n];
    segments.push({
      id: `task-${n}`,
      kind: 'task',
      label: String(n),
      from: n,
      to: n,
      minutes: m,
      startMin: cursor,
      endMin: cursor + m,
    });
    cursor += m;
  }

  const reserve = Math.max(0, totalMinutes - cursor);
  segments.push({
    id: 'reserve',
    kind: 'reserve',
    label: 'БЛАНК',
    from: 0,
    to: 0,
    minutes: reserve,
    startMin: cursor,
    endMin: cursor + reserve,
  });

  return { totalMinutes, part1Minutes, part1Count, reserveMinutes: reserve, segments };
}

export interface PacingProgress {
  part1Answered: number;
  /** Номера заданий части 2, по которым есть заметное содержимое. */
  part2Touched: number[];
}

export type PacingStatus = 'ahead' | 'on_track' | 'behind';

export interface PacingEvaluation {
  current: PacingSegment;
  next: PacingSegment | null;
  minutesLeftInSegment: number;
  status: PacingStatus;
  /** Разница «фактически сделано − должно быть сделано» в минутах плана. */
  deltaMinutes: number;
  message: string;
}

const AHEAD_THRESHOLD_MIN = 5;
const BEHIND_THRESHOLD_MIN = 8;

export function evaluatePacing(
  plan: PacingPlan,
  elapsedSec: number,
  progress: PacingProgress
): PacingEvaluation {
  const elapsedMin = Math.max(0, elapsedSec / 60);
  const segs = plan.segments;
  const current =
    segs.find((s) => elapsedMin >= s.startMin && elapsedMin < s.endMin) ?? segs[segs.length - 1];
  const idx = segs.indexOf(current);
  const next = idx >= 0 && idx < segs.length - 1 ? segs[idx + 1] : null;
  const minutesLeftInSegment = Math.max(0, current.endMin - elapsedMin);

  // Сколько минут «плана» должно быть выполнено к этому моменту (резерв не считаем)
  let planned = 0;
  let actual = 0;
  for (const s of segs) {
    if (s.kind === 'reserve') continue;
    if (elapsedMin >= s.endMin) planned += s.minutes;
    else if (elapsedMin > s.startMin) planned += elapsedMin - s.startMin;

    if (s.kind === 'part1') {
      const frac = plan.part1Count > 0 ? Math.min(1, progress.part1Answered / plan.part1Count) : 0;
      actual += s.minutes * frac;
    } else if (progress.part2Touched.includes(s.from)) {
      actual += s.minutes;
    }
  }
  const deltaMinutes = actual - planned;

  const status: PacingStatus =
    deltaMinutes >= AHEAD_THRESHOLD_MIN
      ? 'ahead'
      : deltaMinutes <= -BEHIND_THRESHOLD_MIN
        ? 'behind'
        : 'on_track';

  return {
    current,
    next,
    minutesLeftInSegment,
    status,
    deltaMinutes,
    message: buildMessage(plan, current, next, status, minutesLeftInSegment),
  };
}

function zoneName(s: PacingSegment): string {
  if (s.kind === 'part1') return `задания ${s.from}–${s.to}`;
  if (s.kind === 'task') return `задание № ${s.from}`;
  return 'перенос ответов в бланки и проверка';
}

function buildMessage(
  _plan: PacingPlan,
  current: PacingSegment,
  next: PacingSegment | null,
  status: PacingStatus,
  left: number
): string {
  const leftTxt = `${Math.ceil(left)} мин`;
  if (current.kind === 'reserve') {
    return 'Время переносить ответы в бланки и проверять записи. Новые сложные задачи — только если всё готово.';
  }
  const base = `Сейчас по плану: ${zoneName(current)} (осталось ~${leftTxt}).`;
  if (status === 'behind') {
    return `${base} Вы отстаёте от графика: пропустите застрявшую задачу и вернитесь к ней в конце.`;
  }
  if (status === 'ahead') {
    return `${base} Вы опережаете график — сохраните запас на сложные задачи${
      next && next.kind !== 'reserve' ? ` (дальше: ${zoneName(next)})` : ''
    }.`;
  }
  return `${base} Темп в норме${next ? `, дальше: ${zoneName(next)}` : ''}.`;
}

export interface PacingAlert {
  id: string;
  /** Срабатывает, когда до конца экзамена осталось не больше указанного числа минут. */
  atRemainingMin: number;
  severity: 'warn' | 'critical';
  text: string;
}

export function getPacingAlerts(plan: PacingPlan): PacingAlert[] {
  const alerts: PacingAlert[] = [];
  alerts.push({
    id: 'blank30',
    atRemainingMin: 30,
    severity: 'warn',
    text: 'Внимание! Осталось 30 минут: рекомендуем завершить черновики и заполнить чистовые бланки.',
  });
  if (plan.reserveMinutes > 30) {
    alerts.push({
      id: 'reserve',
      atRemainingMin: plan.reserveMinutes,
      severity: 'warn',
      text: 'Начался резерв на бланки: переносите ответы и проверяйте записи.',
    });
  }
  alerts.push({
    id: 'last10',
    atRemainingMin: 10,
    severity: 'critical',
    text: 'Осталось 10 минут! Проверьте перенос ответов в бланк № 1 и № 2.',
  });
  return alerts.sort((a, b) => b.atRemainingMin - a.atRemainingMin);
}

// ============================================================================
// Анализ после экзамена: «Где вы потеряли больше всего времени?»
// ============================================================================

export interface TaskTimeRow {
  task: number;
  spentSec: number;
  normSec: number;
  overSec: number;
}

export interface TimeAnalysis {
  part1SpentSec: number;
  part1NormSec: number;
  part2SpentSec: number;
  part2NormSec: number;
  /** Время без привязки к заданию (чтение КИМ, навигация). */
  untrackedSec: number;
  unusedSec: number;
  rows: TaskTimeRow[];
  sinks: TaskTimeRow[];
  insights: string[];
}

export function analyzeTaskTimes(
  plan: PacingPlan,
  taskTimes: Record<number, number>,
  totalSec: number,
  spentTotalSec: number
): TimeAnalysis {
  const part1Norm = plan.part1Count > 0 ? (plan.part1Minutes * 60) / plan.part1Count : 0;
  const part2Norms: Record<number, number> = {};
  for (const s of plan.segments) {
    if (s.kind === 'task') part2Norms[s.from] = s.minutes * 60;
  }

  const rows: TaskTimeRow[] = [];
  let part1Spent = 0;
  let part2Spent = 0;
  let untracked = 0;

  for (const [key, sec] of Object.entries(taskTimes)) {
    const task = Number(key);
    if (!task) {
      untracked += sec;
      continue;
    }
    const isPart1 = task <= plan.part1Count;
    const norm = isPart1 ? part1Norm : part2Norms[task] ?? 0;
    if (isPart1) part1Spent += sec;
    else part2Spent += sec;
    rows.push({ task, spentSec: sec, normSec: norm, overSec: Math.max(0, sec - norm) });
  }
  rows.sort((a, b) => a.task - b.task);

  const sinks = [...rows]
    .filter((r) => r.overSec > 30)
    .sort((a, b) => b.overSec - a.overSec)
    .slice(0, 3);

  const part2NormTotal = Object.values(part2Norms).reduce((a, b) => a + b, 0);
  const part1NormTotal = plan.part1Minutes * 60;
  const unused = Math.max(0, totalSec - spentTotalSec);

  const insights: string[] = [];
  if (rows.length === 0) {
    insights.push(
      'Недостаточно данных: время фиксируется по заданию, в поле ответа которого вы работали. Кликайте в поле/вкладку задания, над которым работаете.'
    );
  } else {
    if (part1Spent > part1NormTotal * 1.2) {
      insights.push(
        `Часть 1 заняла ${fmtMin(part1Spent)} при норме ${fmtMin(part1NormTotal)} — это съело время развёрнутой части. Отрабатывайте скорость на типовых заданиях.`
      );
    } else if (part1Spent > 0 && part1Spent < part1NormTotal * 0.6) {
      insights.push(
        `Часть 1 решена быстро (${fmtMin(part1Spent)} при норме ${fmtMin(part1NormTotal)}) — используйте запас на перепроверку вычислений.`
      );
    }
    if (part2NormTotal > 0 && part2Spent > part2NormTotal * 1.15) {
      insights.push(
        `Развёрнутая часть: ${fmtMin(part2Spent)} при норме ${fmtMin(part2NormTotal)}. Договоритесь с собой о «потолке» минут на одну задачу.`
      );
    }
    for (const s of sinks) {
      insights.push(
        `Задание № ${s.task}: ${fmtMin(s.spentSec)} при норме ${fmtMin(s.normSec)} (перерасход ${fmtMin(s.overSec)}).`
      );
    }
    if (untracked > totalSec * 0.1) {
      insights.push(
        `${fmtMin(untracked)} ушло на чтение КИМ и навигацию без работы в полях ответа — планируйте проход по варианту заранее.`
      );
    }
    if (unused < plan.reserveMinutes * 60 * 0.3 && totalSec > 0) {
      insights.push(
        'Резерв на заполнение бланков почти не остался. В реальном экзамене закладывайте минимум 15–20 минут на перенос ответов.'
      );
    }
    if (insights.length === 0) {
      insights.push('Время распределено по плану. Продолжайте в том же духе!');
    }
  }

  return {
    part1SpentSec: part1Spent,
    part1NormSec: part1NormTotal,
    part2SpentSec: part2Spent,
    part2NormSec: part2NormTotal,
    untrackedSec: untracked,
    unusedSec: unused,
    rows,
    sinks,
    insights,
  };
}

export function fmtMin(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}
