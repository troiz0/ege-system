// frontend/src/components/ActivityHeatmapWidget.tsx
// 90-дневная тепловая карта активности (GitHub / Cyberpunk style) и трекер стрика

import React, { useMemo, useState } from 'react';
import { Flame, Trophy } from 'lucide-react';

interface DayActivity {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3;
  details: string[];
}

export interface ActivityHeatmapWidgetProps {
  activityTimeline?: Record<string, { count: number; details: string[] }>;
}

function getDaysStreakLabel(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'дней подряд';
  if (rem === 1) return 'день';
  if (rem >= 2 && rem <= 4) return 'дня подряд';
  return 'дней подряд';
}

function getDaysRecordLabel(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (rem === 1) return 'день';
  if (rem >= 2 && rem <= 4) return 'дня';
  return 'дней';
}

export const ActivityHeatmapWidget: React.FC<ActivityHeatmapWidgetProps> = ({ activityTimeline }) => {
  const [hoveredDay, setHoveredDay] = useState<DayActivity | null>(null);

  // Генерируем 90 дней (13 недель) до сегодняшнего дня на основе реальных данных
  const { days, currentStreak, bestStreak, totalActions, activeDaysCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list: DayActivity[] = [];
    const numDays = 91; // 13 недель ровно

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];

      const entry = activityTimeline?.[dateKey];
      const count = entry?.count ?? 0;
      const details = entry?.details ?? [];

      let level: 0 | 1 | 2 | 3 = 0;
      if (count >= 5) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      list.push({
        date: d,
        dateKey,
        count,
        level,
        details,
      });
    }

    // Подсчет стрика (с конца, с защитой от утреннего сброса)
    let curStreak = 0;
    const todayIndex = list.length - 1;
    const hasActionToday = list[todayIndex].count > 0;
    const hasActionYesterday = todayIndex > 0 && list[todayIndex - 1].count > 0;

    if (hasActionToday) {
      for (let i = todayIndex; i >= 0; i--) {
        if (list[i].count > 0) {
          curStreak++;
        } else {
          break;
        }
      }
    } else if (hasActionYesterday) {
      // Сегодня действий еще не было, но вчера активность зафиксирована — сохраняем стрик
      for (let i = todayIndex - 1; i >= 0; i--) {
        if (list[i].count > 0) {
          curStreak++;
        } else {
          break;
        }
      }
    } else {
      curStreak = 0;
    }

    let bStreak = 0;
    let tempStreak = 0;
    let total = 0;
    let activeDays = 0;

    for (const d of list) {
      total += d.count;
      if (d.count > 0) {
        activeDays++;
        tempStreak++;
        if (tempStreak > bStreak) bStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    return {
      days: list,
      currentStreak: curStreak,
      bestStreak: Math.max(bStreak, curStreak),
      totalActions: total,
      activeDaysCount: activeDays,
    };
  }, [activityTimeline]);

  // Разбиваем дни по неделям (колонки)
  const weeks = useMemo(() => {
    const cols: DayActivity[][] = [];
    let currentWeek: DayActivity[] = [];

    // Дополняем первую неделю пустыми слотами для выравнивания дня недели (начиная с Пн)
    const firstDay = days[0].date.getDay();
    const leadingEmpty = (firstDay + 6) % 7; // 0 для Пн, 6 для Вс
    for (let i = 0; i < leadingEmpty; i++) {
      currentWeek.push({
        date: new Date(0),
        dateKey: `empty-${i}`,
        count: -1,
        level: 0,
        details: [],
      });
    }

    for (const d of days) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        cols.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      cols.push(currentWeek);
    }
    return cols;
  }, [days]);

  return (
    <div className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-md">
      {/* Заголовок виджета в едином дизайне */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Flame className="h-5 w-5 text-[#d4ff00]" strokeWidth={1.5} />
          <div>
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">
              [ STREAK // ПЛАТФОРМЕННАЯ АКТИВНОСТЬ ]
            </span>
            <h3 className="font-display text-base font-bold uppercase tracking-tight text-white">
              СТРИК ПОДГОТОВКИ
            </h3>
          </div>
        </div>

        {/* СТРИК СЧЕТЧИКИ */}
        <div className="flex items-center gap-2.5">
          <div className="border border-white/10 bg-white/[0.02] px-3.5 py-1.5 flex items-center gap-2.5">
            <Flame className="h-4 w-4 text-[#d4ff00]" strokeWidth={1.5} />
            <div>
              <div className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest leading-none">
                ТЕКУЩИЙ СТРИК
              </div>
              <div className="font-display text-sm font-bold text-white mt-0.5">
                <span className="text-[#d4ff00] text-base">{currentStreak}</span>{' '}
                <span className="text-[11px] text-zinc-400 font-sans font-normal uppercase tracking-wider">
                  {getDaysStreakLabel(currentStreak)}
                </span>
              </div>
            </div>
          </div>

          <div className="border border-white/10 bg-white/[0.02] px-3.5 py-1.5 hidden sm:flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
            <div>
              <div className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest leading-none">
                РЕКОРД
              </div>
              <div className="font-display text-sm font-bold text-zinc-200 mt-0.5">
                <span className="text-white text-base">{bestStreak}</span>{' '}
                <span className="text-[11px] text-zinc-400 font-sans font-normal uppercase tracking-wider">
                  {getDaysRecordLabel(bestStreak)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* СЕТКА ТЕПЛОВОЙ КАРТЫ */}
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="min-w-[680px]">
          <div className="flex gap-1.5 items-start">
            {/* Метки дней недели */}
            <div className="flex flex-col gap-1.5 pr-2 pt-0.5 font-mono text-[9px] text-zinc-600 select-none">
              <span className="h-3.5 leading-3.5">ПН</span>
              <span className="h-3.5 leading-3.5 opacity-0">ВТ</span>
              <span className="h-3.5 leading-3.5">СР</span>
              <span className="h-3.5 leading-3.5 opacity-0">ЧТ</span>
              <span className="h-3.5 leading-3.5">ПТ</span>
              <span className="h-3.5 leading-3.5 opacity-0">СБ</span>
              <span className="h-3.5 leading-3.5 opacity-0">ВС</span>
            </div>

            {/* Колонки недель */}
            <div className="flex gap-1.5 flex-1">
              {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-1.5">
                  {week.map((day, dIndex) => {
                    if (day.count === -1) {
                      return <div key={dIndex} className="w-3.5 h-3.5 opacity-0" />;
                    }

                    return (
                      <button
                        key={dIndex}
                        type="button"
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-3.5 h-3.5 transition-all rounded-none border ${
                          day.level === 3
                            ? 'bg-[#d4ff00] border-white'
                            : day.level === 2
                            ? 'bg-[#d4ff00]/60 border-[#d4ff00]/80'
                            : day.level === 1
                            ? 'bg-[#d4ff00]/20 border-[#d4ff00]/40'
                            : 'bg-white/[0.03] border-white/[0.06] hover:border-white/30'
                        }`}
                        title={`${day.dateKey}: ${day.count} активностей`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ПОДВАЛ С ЛЕГЕНДОЙ И ИНСПЕКТОРОМ ДНЯ */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            {/* Инспектор наведенного дня */}
            <div className="text-zinc-400 flex items-center gap-2 min-h-[22px]">
              {hoveredDay ? (
                <>
                  <span className="text-white font-bold">
                    {hoveredDay.date.toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                    })}
                    :
                  </span>
                  {hoveredDay.count > 0 ? (
                    <span className="text-[#d4ff00]">
                      {hoveredDay.count} {hoveredDay.count === 1 ? 'действие' : 'действия'}
                      {hoveredDay.details.length > 0 && ` (${hoveredDay.details.join(', ')})`}
                    </span>
                  ) : (
                    <span className="text-zinc-500">Нет активности в этот день</span>
                  )}
                </>
              ) : (
                <span className="text-zinc-500">
                  {activeDaysCount} активных дней из 90 • {totalActions} учебных действий
                </span>
              )}
            </div>

            {/* Легенда уровней */}
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 select-none">
              <span>Меньше</span>
              <div className="w-3 h-3 bg-white/[0.03] border border-white/[0.06]" />
              <div className="w-3 h-3 bg-[#d4ff00]/20 border border-[#d4ff00]/40" />
              <div className="w-3 h-3 bg-[#d4ff00]/60 border-[#d4ff00]/80" />
              <div className="w-3 h-3 bg-[#d4ff00] border-white" />
              <span>Больше</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityHeatmapWidget;
