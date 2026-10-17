// frontend/src/components/FipiSyllabusTracker.tsx
// Интерактивная матрица кодификатора ФИПИ (Syllabus Tracker)

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTopicProgress,
  calculateSyllabusStats,
  getSyllabusForSubject,
  type SyllabusTopic,
  type TopicMasteryStatus,
} from '../lib/fipiSyllabus';
import { EGE_SUBJECTS } from '../lib/subjects';
import type { WeakTopic, TargetSubject } from '../lib/types';
import { SosCheatSheetModal } from './SosCheatSheetModal';
import { TargetedQuizModal } from './TargetedQuizModal';
import {
  Search,
  CheckCircle2,
  Clock,
  CircleDashed,
  Zap,
  Flame,
  ChevronDown,
  ChevronUp,
  Bot,
} from 'lucide-react';

interface FipiSyllabusTrackerProps {
  weakTopics?: WeakTopic[];
  targetSubjects?: TargetSubject[];
  onTopicTested?: () => void;
}

export const FipiSyllabusTracker: React.FC<FipiSyllabusTrackerProps> = ({
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
  const [statusFilter, setStatusFilter] = useState<'all' | TopicMasteryStatus>('all');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'math-algebra': true,
    'rus-ortho': true,
    'phys-mech': true,
    'inf-alg': true,
    'soc-man': true,
  });

  // Модалки
  const [activeModalTopic, setActiveModalTopic] = useState<{
    subject: string;
    topic: SyllabusTopic;
    masteryLevel: number;
  } | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);

  const syllabus = useMemo(() => getSyllabusForSubject(selectedSubject), [selectedSubject]);

  // Фильтрация weakTopics по выбранному предмету (если совпадает)
  const relevantWeakTopics = useMemo(() => {
    return weakTopics.filter(
      (wt) =>
        !wt.subject ||
        wt.subject.toLowerCase().includes(selectedSubject.toLowerCase()) ||
        selectedSubject.toLowerCase().includes(wt.subject.toLowerCase())
    );
  }, [weakTopics, selectedSubject]);

  // Статистика по кодификатору
  const stats = useMemo(() => {
    return calculateSyllabusStats(syllabus, relevantWeakTopics);
  }, [syllabus, relevantWeakTopics]);

  // Переключение аккордеона
  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId] === undefined ? false : !prev[sectionId],
    }));
  };

  const navigate = useNavigate();

  const handleExplainWithAi = (topicTitle: string, subjectName: string) => {
    const autoPrompt = `Привет! Я изучаю тему из кодификатора ЕГЭ: «${topicTitle}» (${subjectName}).\n1. Объясни мне суть темы простыми словами и дай ключевые формулы.\n2. Покажи 2 главные ловушки составителей КИМ в этой теме.\n3. Дай один типовой пример из ЕГЭ и разбери его по шагам.`;
    navigate('/chat', {
      state: {
        topic: `Разбор: ${topicTitle}`,
        topicName: topicTitle,
        subject: subjectName,
        autoPrompt,
        autoSend: true,
      },
    });
  };

  const handleOpenSos = (topic: SyllabusTopic, mastery: number) => {
    setActiveModalTopic({
      subject: selectedSubject,
      topic,
      masteryLevel: mastery,
    });
    setIsSosOpen(true);
  };

  const handleOpenQuiz = (topic: SyllabusTopic, mastery: number) => {
    setActiveModalTopic({
      subject: selectedSubject,
      topic,
      masteryLevel: mastery,
    });
    setIsQuizOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ПАНЕЛЬ ВЫБОРА ПРЕДМЕТА И СТАТИСТИКИ */}
      <div className="bg-zinc-950/80 border border-white/[0.08] p-5 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 bg-[#d4ff00] animate-pulse" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#d4ff00]">
                [ ОФИЦИАЛЬНЫЙ КОДИФИКАТОР ФИПИ {syllabus.officialYear} ]
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white tracking-wide">
              МАТРИЦА ЭЛЕМЕНТОВ СОДЕРЖАНИЯ КИМ
            </h2>
            <p className="text-xs font-mono text-zinc-400 mt-1">
              {syllabus.fipiDoc} • Синхронизация с базой знаний и тренировками
            </p>
          </div>

          {/* Селектор предметов */}
          <div className="flex flex-wrap gap-2">
            {availableSubjects.map((subj) => (
              <button
                key={subj}
                onClick={() => setSelectedSubject(subj)}
                className={`px-3 py-1.5 font-mono text-xs uppercase transition-all border ${
                  selectedSubject === subj
                    ? 'border-[#d4ff00] bg-[#d4ff00]/15 text-[#d4ff00] font-bold'
                    : 'border-white/[0.08] bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-white/20'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>

        {/* СВОДНЫЕ ИНДИКАТОРЫ ПРОГРЕССА */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="p-3 bg-zinc-900/50 border border-white/[0.06]">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              ОСВОЕНИЕ КОДИФИКАТОРА
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-[#d4ff00]">
                {stats.overallPercent}%
              </span>
              <span className="font-mono text-xs text-zinc-400">покрытия</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 mt-2 overflow-hidden">
              <div
                className="h-full bg-[#d4ff00] transition-all duration-500"
                style={{ width: `${stats.overallPercent}%` }}
              />
            </div>
          </div>

          <div className="p-3 bg-zinc-900/50 border border-white/[0.06]">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#d4ff00]" />
              ОСВОЕНО ТЕМ
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-white">
                {stats.mastered}
              </span>
              <span className="font-mono text-xs text-zinc-500">/ {stats.totalTopics}</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-1.5">
              Уровень владения ≥ 80%
            </div>
          </div>

          <div className="p-3 bg-zinc-900/50 border border-white/[0.06]">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-amber-400" />
              В ПРОЦЕССЕ
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-amber-400">
                {stats.inProgress}
              </span>
              <span className="font-mono text-xs text-zinc-500">/ {stats.totalTopics}</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-1.5">
              Есть тренировки (1–79%)
            </div>
          </div>

          <div className="p-3 bg-zinc-900/50 border border-white/[0.06]">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <CircleDashed className="w-3 h-3 text-zinc-500" />
              НЕ НАЧАТО
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-zinc-400">
                {stats.notStarted}
              </span>
              <span className="font-mono text-xs text-zinc-500">/ {stats.totalTopics}</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-1.5">
              Требуется первый тест
            </div>
          </div>
        </div>

        {/* ПАНЕЛЬ ПОИСКА И ФИЛЬТРОВ */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по теме, разделу или номеру задания (например: 13, неравенства, производная)..."
              className="w-full bg-black/60 border border-white/[0.1] text-xs font-mono text-white placeholder-zinc-500 pl-9 pr-3 py-2 focus:outline-none focus:border-[#d4ff00] transition-colors"
            />
          </div>

          {/* Фильтры статуса */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Все темы' },
                { id: 'mastered', label: 'Освоенные' },
                { id: 'in_progress', label: 'В процессе' },
                { id: 'not_started', label: 'Не начатые' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1.5 font-mono text-[11px] uppercase transition-colors whitespace-nowrap border ${
                  statusFilter === f.id
                    ? 'border-white/40 bg-white/10 text-white font-semibold'
                    : 'border-white/[0.06] bg-transparent text-zinc-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* СПИСОК РАЗДЕЛОВ И ТЕМ */}
      <div className="space-y-4">
        {syllabus.sections.map((section) => {
          // Фильтрация тем внутри раздела
          const filteredTopics = section.topics.filter((topic) => {
            const prog = getTopicProgress(topic, relevantWeakTopics);

            // Фильтр по статусу
            if (statusFilter !== 'all' && prog.status !== statusFilter) {
              return false;
            }

            // Поисковый запрос
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase().trim();
              const matchTitle = topic.title.toLowerCase().includes(q);
              const matchCode = topic.code.toLowerCase().includes(q);
              const matchTask = topic.kimTasks.some((t) => t.toString() === q || `№${t}` === q || `№ ${t}` === q);
              const matchKeywords = (topic.keywords || []).some((kw) => kw.toLowerCase().includes(q));
              if (!matchTitle && !matchCode && !matchTask && !matchKeywords) {
                return false;
              }
            }

            return true;
          });

          if (filteredTopics.length === 0 && (searchQuery.trim() || statusFilter !== 'all')) {
            return null; // Прячем пустые разделы при активном поиске/фильтре
          }

          const isExpanded = expandedSections[section.id] ?? true;

          // Статистика раздела
          const sectionMastered = filteredTopics.filter(
            (t) => getTopicProgress(t, relevantWeakTopics).status === 'mastered'
          ).length;

          return (
            <div
              key={section.id}
              className="bg-zinc-950/70 border border-white/[0.08] transition-all hover:border-white/15"
            >
              {/* Заголовок раздела (аккордеон) */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left border-b border-white/[0.06] bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs px-2 py-0.5 bg-white/5 border border-white/10 text-[#d4ff00]">
                    РАЗДЕЛ {section.code}
                  </span>
                  <h3 className="font-display text-base font-bold text-white tracking-wide">
                    {section.title}
                  </h3>
                  <span className="hidden sm:inline-block font-mono text-[11px] text-zinc-500">
                    ({sectionMastered} из {filteredTopics.length} освоено)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-24 sm:w-32 h-1.5 bg-zinc-800 hidden sm:block overflow-hidden">
                    <div
                      className="h-full bg-[#d4ff00]"
                      style={{
                        width: `${filteredTopics.length > 0 ? (sectionMastered / filteredTopics.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </div>
              </button>

              {/* Темы раздела */}
              {isExpanded && (
                <div className="divide-y divide-white/[0.04]">
                  {filteredTopics.map((topic) => {
                    const prog = getTopicProgress(topic, relevantWeakTopics);

                    return (
                      <div
                        key={topic.id}
                        className="p-4 sm:px-5 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Левая колонка: Код, название темы, привязанные задания */}
                        <div className="flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-zinc-400">
                              [{topic.code}]
                            </span>
                            <span className="font-medium text-sm text-zinc-100">
                              {topic.title}
                            </span>
                            {topic.importance === 'high' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-red-950/60 border border-red-500/40 text-red-300">
                                КЛЮЧЕВАЯ ТЕМА
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono text-[10px] text-zinc-500 uppercase">
                              Линии КИМ:
                            </span>
                            {topic.kimTasks.map((taskNum) => (
                              <span
                                key={taskNum}
                                className="px-1.5 py-0.2 bg-zinc-900 border border-white/10 font-mono text-[10px] text-zinc-300"
                              >
                                №{taskNum}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Правая колонка: Прогресс освоения и кнопки быстрого действия */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-white/[0.04]">
                          {/* Индикатор статуса */}
                          <div className="w-32">
                            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                              <span
                                className={
                                  prog.status === 'mastered'
                                    ? 'text-[#d4ff00]'
                                    : prog.status === 'in_progress'
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                                }
                              >
                                {prog.status === 'mastered'
                                  ? '[ ОСВОЕНО ]'
                                  : prog.status === 'in_progress'
                                  ? '[ В ПРОЦЕССЕ ]'
                                  : '[ НЕ НАЧАТО ]'}
                              </span>
                              <span className="text-zinc-400 font-bold">
                                {prog.masteryPercent}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-900 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  prog.status === 'mastered'
                                    ? 'bg-[#d4ff00]'
                                    : prog.status === 'in_progress'
                                    ? 'bg-amber-400'
                                    : 'bg-zinc-700'
                                }`}
                                style={{ width: `${Math.max(5, prog.masteryPercent)}%` }}
                              />
                            </div>
                          </div>

                          {/* Кнопка: Разобрать с ИИ */}
                          <button
                            type="button"
                            onClick={() => handleExplainWithAi(topic.title, selectedSubject)}
                            className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:text-[#d4ff00] hover:border-[#d4ff00]/50 rounded-none text-xs px-3 py-1.5 font-mono uppercase flex items-center gap-1.5 transition-all"
                            title="Открыть тему в AI-чате и сразу сгенерировать глубокий разбор"
                          >
                            <Bot className="w-3.5 h-3.5 text-[#d4ff00]" />
                            <span>РАЗОБРАТЬ С ИИ</span>
                          </button>

                          {/* Кнопка: SOS-Конспект */}
                          <button
                            type="button"
                            onClick={() => handleOpenSos(topic, prog.masteryPercent)}
                            className="px-2.5 py-1.5 bg-zinc-900 border border-white/10 hover:border-amber-400/50 hover:bg-amber-950/20 text-zinc-300 hover:text-amber-300 font-mono text-[11px] uppercase flex items-center gap-1.5 transition-all"
                            title="Сгенерировать краткую SOS-шпаргалку по формулам и алгоритмам"
                          >
                            <Flame className="w-3 h-3 text-amber-400" />
                            <span className="hidden sm:inline">ШПАРГАЛКА</span>
                            <span className="sm:hidden">SOS</span>
                          </button>

                          {/* Кнопка: Блиц-тест */}
                          <button
                            type="button"
                            onClick={() => handleOpenQuiz(topic, prog.masteryPercent)}
                            className="px-2.5 py-1.5 bg-[#d4ff00]/10 border border-[#d4ff00]/40 hover:bg-[#d4ff00]/20 hover:border-[#d4ff00] text-[#d4ff00] font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-all"
                            title="Пройти блиц-тренажер из 3 заданий по этой теме"
                          >
                            <Zap className="w-3 h-3" />
                            <span>ТЕСТ</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* МОДАЛКИ БЛИЦ-ТЕСТА И SOS-ШПАРГАЛКИ */}
      {activeModalTopic && (
        <>
          <SosCheatSheetModal
            isOpen={isSosOpen}
            onClose={() => {
              setIsSosOpen(false);
              setActiveModalTopic(null);
            }}
            subject={activeModalTopic.subject}
            topic={activeModalTopic.topic.title}
            onSaved={() => {
              if (onTopicTested) onTopicTested();
            }}
          />

          <TargetedQuizModal
            isOpen={isQuizOpen}
            onClose={() => {
              setIsQuizOpen(false);
              setActiveModalTopic(null);
              if (onTopicTested) onTopicTested();
            }}
            subject={activeModalTopic.subject}
            topic={activeModalTopic.topic.title}
            initialMastery={activeModalTopic.masteryLevel / 100}
            onMasteryUpdated={() => {
              if (onTopicTested) onTopicTested();
            }}
          />
        </>
      )}
    </div>
  );
};

export default FipiSyllabusTracker;
