// frontend/src/components/SkillTreeGrid.tsx
// Интерактивная 2D Карта навыков и пробелов (Skill Tree / Roadmap) по кодификаторам ФИПИ

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { EGE_SUBJECTS } from '../lib/subjects';
import {
  getSyllabusForSubject,
  type SyllabusTopic,
  type SyllabusSection,
} from '../lib/fipiSyllabus';
import type { WeakTopic, TargetSubject } from '../lib/types';
import { SosCheatSheetModal } from './SosCheatSheetModal';
import { TargetedQuizModal } from './TargetedQuizModal';

export interface SkillTreeGridProps {
  weakTopics?: WeakTopic[];
  targetSubjects?: TargetSubject[];
  onTopicTested?: () => void;
}

// Базовые уровни освоения для ключевых тем при отсутствии записей об ошибках
const BASELINE_MASTERY_MAP: Record<string, number> = {
  'Тригонометрические уравнения и отбор корней': 0.85,
  'Логарифмические и показательные неравенства (метод рационализации)': 0.45,
  'Уравнения и системы с параметром (аналитический и графический методы)': 0.15,
  'Исследование функций с помощью производной (экстремумы, наибольшее/наименьшее)': 0.82,
  'Планиметрия: многоугольники, вписанные и описанные окружности': 0.5,
  'Стереометрия: сечения многогранников, расстояния и углы в пространстве': 0.22,
  'Финансовая математика (дифференцированные и аннуитетные платежи)': 0.78,
  'Классическая вероятность и теоремы о вероятностях событий': 0.88,
  'Свойства чисел и делимость, диофантовы уравнения': 0.28,
  'Преобразования числовых и буквенных выражений (степени, корни, логарифмы)': 0.9,
  'Правописание корней (безударные проверяемые, непроверяемые, чередующиеся)': 0.85,
  'Правописание личных окончаний глаголов и суффиксов причастий': 0.38,
  'Пунктуация в сложносочинённом предложении и простом с однородными членами': 0.76,
  'Знаки препинания в сложноподчинённом предложении (СПП)': 0.65,
  'Морфологические нормы (формы существительных, числительных, глаголов)': 0.42,
  'Кинематика материальной точки': 0.84,
  'Законы сохранения импульса и энергии': 0.48,
  'Электромагнитная индукция, закон Фарадея': 0.25,
  'Основы термодинамики, КПД теплового двигателя': 0.62,
  'Кодирование информации, измерение информации': 0.85,
  'Динамическое программирование (задачи на поиск оптимального пути)': 0.35,
  'Обработка больших числовых последовательностей': 0.2,
};

export const SkillTreeGrid: React.FC<SkillTreeGridProps> = ({
  weakTopics = [],
  targetSubjects = [],
  onTopicTested,
}) => {
  const allSubjectNames = useMemo(() => Object.values(EGE_SUBJECTS).map((s) => s.name), []);
  const targetNames = useMemo(() => targetSubjects.map((t) => t.subjectName), [targetSubjects]);

  const availableSubjects = useMemo(() => {
    if (targetNames.length === 0) return allSubjectNames;
    const targets = targetNames.filter((name) => allSubjectNames.includes(name));
    return targets.length > 0 ? targets : allSubjectNames;
  }, [allSubjectNames, targetNames]);

  const [selectedSubject, setSelectedSubject] = useState<string>(
    availableSubjects[0] || 'Математика (профиль)'
  );

  React.useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'in_progress' | 'mastered'>('all');

  // Локальные оверрайды освоения тем (обновляются после прохождения блиц-теста)
  const [masteryOverrides, setMasteryOverrides] = useState<Record<string, number>>({});

  // Состояние модалок
  const [activeModalTopic, setActiveModalTopic] = useState<{
    title: string;
    mastery: number;
  } | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);

  const syllabus = useMemo(() => getSyllabusForSubject(selectedSubject), [selectedSubject]);

  // Вычисление освоения темы
  const getTopicStats = (topic: SyllabusTopic) => {
    // 1. Проверяем локальный оверрайд
    if (typeof masteryOverrides[topic.title] === 'number') {
      const level = masteryOverrides[topic.title];
      const pct = Math.round(level * 100);
      return {
        masteryLevel: level,
        masteryPercent: pct,
        status: pct >= 75 ? ('mastered' as const) : pct >= 40 ? ('in_progress' as const) : ('critical' as const),
      };
    }

    // 2. Ищем среди фактических weakTopics из БД
    const topicLower = topic.title.toLowerCase();
    const keywords = topic.keywords || [];
    const matchedWeak = weakTopics.find((wt) => {
      const name = wt.topicName.toLowerCase();
      if (name.includes(topicLower) || topicLower.includes(name)) return true;
      return keywords.some((kw) => name.includes(kw.toLowerCase()));
    });

    if (matchedWeak) {
      const level = typeof matchedWeak.masteryLevel === 'number' ? matchedWeak.masteryLevel : 0.25;
      const pct = Math.round(level * 100);
      return {
        masteryLevel: level,
        masteryPercent: pct,
        status: pct >= 75 ? ('mastered' as const) : pct >= 40 ? ('in_progress' as const) : ('critical' as const),
      };
    }

    // 3. Базовый уровень из карты или по умолчанию
    const baseLevel = BASELINE_MASTERY_MAP[topic.title] ?? (topic.importance === 'high' ? 0.35 : 0.65);
    const pct = Math.round(baseLevel * 100);
    return {
      masteryLevel: baseLevel,
      masteryPercent: pct,
      status: pct >= 75 ? ('mastered' as const) : pct >= 40 ? ('in_progress' as const) : ('critical' as const),
    };
  };

  // Сводная статистика по предмету
  const overallStats = useMemo(() => {
    let total = 0;
    let masteredCount = 0;
    let inProgressCount = 0;
    let criticalCount = 0;
    let sumPercent = 0;

    for (const sec of syllabus.sections) {
      for (const t of sec.topics) {
        total++;
        const { masteryPercent, status } = getTopicStats(t);
        sumPercent += masteryPercent;
        if (status === 'mastered') masteredCount++;
        else if (status === 'in_progress') inProgressCount++;
        else criticalCount++;
      }
    }

    const avg = total > 0 ? Math.round(sumPercent / total) : 0;
    return { total, masteredCount, inProgressCount, criticalCount, avg };
  }, [syllabus, weakTopics, masteryOverrides]);

  // Фильтрация секций и тем
  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return syllabus.sections
      .map((section: SyllabusSection) => {
        const matchingTopics = section.topics.filter((topic: SyllabusTopic) => {
          const { status } = getTopicStats(topic);

          // Фильтр по статусу
          if (statusFilter !== 'all' && status !== statusFilter) {
            return false;
          }

          // Поиск по названию или заданиям КИМ
          if (query) {
            const inTitle = topic.title.toLowerCase().includes(query);
            const inKims = topic.kimTasks.some((k) => `№${k}`.includes(query) || `${k}`.includes(query));
            const inKeywords = (topic.keywords || []).some((kw) => kw.toLowerCase().includes(query));
            return inTitle || inKims || inKeywords;
          }

          return true;
        });

        return {
          ...section,
          topics: matchingTopics,
        };
      })
      .filter((section) => section.topics.length > 0);
  }, [syllabus, searchQuery, statusFilter, weakTopics, masteryOverrides]);

  const handleOpenSos = (title: string, mastery: number) => {
    setActiveModalTopic({ title, mastery });
    setIsSosOpen(true);
  };

  const handleOpenQuiz = (title: string, mastery: number) => {
    setActiveModalTopic({ title, mastery });
    setIsQuizOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ВЕРХНЯЯ ПАНЕЛЬ: ПЕРЕКЛЮЧАТЕЛЬ ПРЕДМЕТОВ И СТАТИСТИКА */}
      <div className="border border-white/10 bg-zinc-900/40 p-4 md:p-6 backdrop-blur-md rounded-none">
        {/* Переключатель целевых предметов */}
        <div className="mb-5 flex flex-wrap gap-2">
          {availableSubjects.map((subj) => {
            const isActive = subj === selectedSubject;
            return (
              <button
                key={subj}
                onClick={() => {
                  setSelectedSubject(subj);
                  setSearchQuery('');
                }}
                className={`px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors rounded-none border ${
                  isActive
                    ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00] font-medium'
                    : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
                }`}
              >
                {subj}
              </button>
            );
          })}
        </div>

        {/* Сводный прогресс по выбранному предмету */}
        <div className="pt-4 border-t border-white/[0.06] flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1">
              [ ROADMAP // ФИПИ КОДИФИКАТОР {syllabus.officialYear} ]
            </p>
            <h2 className="font-display text-xl md:text-2xl font-extrabold uppercase text-white tracking-tight">
              КАРТА НАВЫКОВ
            </h2>
            <p className="font-sans text-xs text-zinc-400 mt-0.5">
              {selectedSubject} • Тематическая структура спецификации ЕГЭ
            </p>
          </div>

          {/* Индикаторы статусов и общий процент */}
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-[10px] uppercase font-bold">
                [ ОСВОЕНО // {overallStats.masteredCount} ]
              </span>
              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] uppercase font-bold">
                [ В ПРОЦЕССЕ // {overallStats.inProgressCount} ]
              </span>
              <span className="px-2.5 py-1 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-[10px] uppercase font-bold">
                [ ПРОБЕЛЫ // {overallStats.criticalCount} ]
              </span>
            </div>

            <div className="border-l border-white/10 pl-4 text-right">
              <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest block">
                ГОТОВНОСТЬ
              </span>
              <span className="font-mono text-2xl md:text-3xl font-black text-[#d4ff00]">
                {overallStats.avg}%
              </span>
            </div>
          </div>
        </div>

        {/* Общая полоса прогресса предмета */}
        <div className="mt-4 w-full bg-zinc-800/80 h-1 overflow-hidden">
          <div
            className="h-full bg-[#d4ff00] transition-all duration-500"
            style={{ width: `${overallStats.avg}%` }}
          />
        </div>
      </div>

      {/* ПАНЕЛЬ ПОИСКА И БЫСТРЫХ ФИЛЬТРОВ */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Поиск */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по теме (напр. 'логарифмы', '№15', 'стереометрия')..."
            className="w-full bg-zinc-950/60 border border-white/10 px-3.5 py-2 pl-9 text-xs md:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#d4ff00]/50 rounded-none transition-colors"
          />
        </div>

        {/* Фильтр по статусу */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border rounded-none transition-all ${
              statusFilter === 'all'
                ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00] font-medium'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ ВСЕ // {overallStats.total} ]
          </button>
          <button
            onClick={() => setStatusFilter('critical')}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border rounded-none transition-all ${
              statusFilter === 'critical'
                ? 'border-red-400/60 bg-red-500/[0.08] text-red-400 font-medium'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ ПРОБЕЛЫ // {overallStats.criticalCount} ]
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border rounded-none transition-all ${
              statusFilter === 'in_progress'
                ? 'border-amber-400/60 bg-amber-500/[0.08] text-amber-400 font-medium'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ В ПРОЦЕССЕ // {overallStats.inProgressCount} ]
          </button>
          <button
            onClick={() => setStatusFilter('mastered')}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border rounded-none transition-all ${
              statusFilter === 'mastered'
                ? 'border-emerald-400/60 bg-emerald-500/[0.08] text-emerald-400 font-medium'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            [ ОСВОЕНО // {overallStats.masteredCount} ]
          </button>
        </div>
      </div>

      {/* СЕТКА БЛОКОВ И КАРТОЧЕК ТЕМ (SKILL TREE) */}
      {filteredSections.length === 0 ? (
        <div className="py-16 text-center border border-white/[0.08] bg-zinc-900/30">
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            [ ПО ВАШЕМУ ЗАПРОСУ НИЧЕГО НЕ НАЙДЕНО ]
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredSections.map((section: SyllabusSection) => {
            const sectionTotal = section.topics.length;
            const sectionMastered = section.topics.filter(
              (t) => getTopicStats(t).status === 'mastered'
            ).length;

            return (
              <div key={section.id} className="space-y-3">
                {/* Заголовок тематического блока */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 pt-2">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[11px] text-[#d4ff00] uppercase tracking-[0.2em]">
                      [ БЛОК {section.code} ]
                    </span>
                    <h3 className="font-sans text-sm md:text-base font-bold text-white uppercase tracking-wider">
                      {section.title}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    [ {sectionMastered} / {sectionTotal} ОСВОЕНО ]
                  </span>
                </div>

                {/* Сетка карточек тем блока */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.topics.map((topic: SyllabusTopic) => {
                    const { masteryLevel, masteryPercent, status } = getTopicStats(topic);

                    return (
                      <div
                        key={topic.id}
                        className="min-w-0 rounded-none border border-white/[0.08] bg-zinc-900/40 p-4 md:p-5 flex flex-col justify-between hover:border-white/20 transition-colors"
                      >
                        <div>
                          {/* Верхняя строка карточки: КИМ-номер и бейдж статуса */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            {topic.kimTasks.length > 0 ? (
                              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/[0.03] text-zinc-400">
                                КИМ №{topic.kimTasks.join(', №')}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/[0.03] text-zinc-500">
                                КОД {topic.code}
                              </span>
                            )}

                            {status === 'mastered' && (
                              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400 font-semibold shrink-0">
                                [ ОСВОЕНО // {masteryPercent}% ]
                              </span>
                            )}
                            {status === 'in_progress' && (
                              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-400 font-semibold shrink-0">
                                [ В ПРОЦЕССЕ // {masteryPercent}% ]
                              </span>
                            )}
                            {status === 'critical' && (
                              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-red-500/30 bg-red-500/10 text-red-400 font-semibold shrink-0">
                                [ ПРОБЕЛ // {masteryPercent}% ]
                              </span>
                            )}
                          </div>

                          {/* Название темы */}
                          <h4 className="font-sans text-sm font-semibold text-zinc-100 leading-snug tracking-normal mb-4 min-h-[2.5rem]">
                            {topic.title}
                          </h4>
                        </div>

                        <div>
                          {/* Прогресс-бар освоения темы: тонкий 2px */}
                          <div className="w-full bg-zinc-800/80 h-1 overflow-hidden mb-3">
                            <div
                              className={`h-full transition-all duration-300 ${
                                status === 'mastered'
                                  ? 'bg-green-400'
                                  : status === 'in_progress'
                                  ? 'bg-amber-400'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${masteryPercent}%` }}
                            />
                          </div>

                          {/* Кнопки действий: ЧИСТЫЙ ХАД, БЕЗ ЭМОДЗИ */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                            <button
                              onClick={() => handleOpenSos(topic.title, masteryLevel)}
                              className="py-2 px-2 border border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] text-zinc-300 hover:text-white font-mono text-[11px] uppercase tracking-wider flex items-center justify-center transition-colors rounded-none"
                              title="Открыть конспект и шпаргалку по теме"
                            >
                              [ ШПАРГАЛКА ]
                            </button>

                            <button
                              onClick={() => handleOpenQuiz(topic.title, masteryLevel)}
                              className="py-2 px-2 bg-[#d4ff00] hover:bg-[#b8dd00] text-black font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center transition-colors rounded-none"
                              title="Запустить блиц-тренировку из 3 задач на закрытие пробела"
                            >
                              [ БЛИЦ-ТЕСТ ]
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Интегрированные модалки SOS-шпаргалки и Блиц-теста */}
      {activeModalTopic && (
        <>
          <SosCheatSheetModal
            isOpen={isSosOpen}
            onClose={() => setIsSosOpen(false)}
            subject={selectedSubject}
            topic={activeModalTopic.title}
            onSaved={() => {
              if (onTopicTested) onTopicTested();
            }}
          />

          <TargetedQuizModal
            isOpen={isQuizOpen}
            onClose={() => {
              setIsQuizOpen(false);
              if (onTopicTested) onTopicTested();
            }}
            subject={selectedSubject}
            topic={activeModalTopic.title}
            initialMastery={activeModalTopic.mastery}
            onMasteryUpdated={(newLevel: number) => {
              setMasteryOverrides((prev) => ({
                ...prev,
                [activeModalTopic.title]: newLevel,
              }));
              if (onTopicTested) onTopicTested();
            }}
          />
        </>
      )}
    </div>
  );
};

export default SkillTreeGrid;
