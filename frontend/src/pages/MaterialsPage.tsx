import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { CustomSelect } from '../components/ui/CustomSelect';
import { useToastStore } from '../store/toastStore';
import { BookMarked, Sparkles, Search, X, ListChecks, Lightbulb, AlertTriangle, Link as LinkIcon, ShieldCheck, Share2, Layers } from 'lucide-react';
import { LatexText } from '../components/LatexText';
import { SkillTreeGrid } from '../components/SkillTreeGrid';
import { FipiSolutionChecker } from '../components/FipiSolutionChecker';
import { FipiSyllabusTracker } from '../components/FipiSyllabusTracker';
import type { StudyMaterial as Material, WeakTopic, TargetSubject } from '../lib/types';
import { errText } from '../lib/errors';

const SUBJECTS = ['Математика (профиль)', 'Русский язык', 'Физика', 'Информатика', 'Биология', 'Обществознание', 'Химия', 'История', 'География', 'Литература', 'Английский язык'];

export function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [targetSubjects, setTargetSubjects] = useState<TargetSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'materials' | 'fipi' | 'syllabus'>('roadmap');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Material | null>(null);
  const [gen, setGen] = useState({ open: false, subject: SUBJECTS[0], topic: '', busy: false });
  const { addToast } = useToastStore();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [list, wtRes, profileRes] = await Promise.all([
        api.getMaterials(),
        api.getWeakTopics().catch(() => [] as WeakTopic[]),
        api.getProfile().catch(() => null),
      ]);
      setItems(list);
      setWeakTopics(Array.isArray(wtRes) ? wtRes : []);
      if (profileRes?.targetSubjects && profileRes.targetSubjects.length > 0) {
        setTargetSubjects(profileRes.targetSubjects);
        setGen((s) => ({ ...s, subject: profileRes.targetSubjects[0].subjectName }));
      }
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось загрузить материалы');
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (!gen.topic.trim()) {
      addToast('error', 'Укажите тему');
      return;
    }
    setGen((s) => ({ ...s, busy: true }));
    try {
      const result = await api.generateMaterial(gen.subject, gen.topic.trim());
      addToast('success', result.cached ? 'Материал уже был в базе' : 'Материал сгенерирован');
      if (result.notice) addToast('info', result.notice);
      setGen({ open: false, subject: SUBJECTS[0], topic: '', busy: false });
      await load();
      if (result.material) setSelected(result.material);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось сгенерировать материал');
      setGen((s) => ({ ...s, busy: false }));
    }
  };

  if (loading) return <LoadingPage />;

  const subjects = Array.from(new Set(items.map((i) => i.subject)));
  const filtered = items.filter(
    (i) =>
      (subjectFilter === 'all' || i.subject === subjectFilter) &&
      (query.trim() === '' ||
        i.topicName.toLowerCase().includes(query.toLowerCase()) ||
        i.subject.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-tag mb-3">[ KNOWLEDGE // THEORY & SKILL_ROADMAP ]</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
              KNOWLEDGE
            </h1>
            <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
              Карта навыков и пробелов, конспекты по темам ЕГЭ, SOS-шпаргалки и критериальная проверка ФИПИ
            </p>
          </div>
          <button
            onClick={() => setGen({ ...gen, open: true })}
            className="btn-lime text-sm"
          >
            <Sparkles className="h-5 w-5" />
            Сгенерировать материал
          </button>
        </div>

        {/* Навигационные табы раздела KNOWLEDGE */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-white/[0.08] pb-3">
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
              activeTab === 'roadmap'
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                : 'border-white/[0.08] bg-zinc-900/50 text-zinc-400 hover:text-white'
            }`}
          >
            <Share2 className="w-4 h-4 text-[#d4ff00]" />
            [ 1. КАРТА НАВЫКОВ И ПРОБЕЛОВ ]
          </button>

          <button
            onClick={() => setActiveTab('materials')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
              activeTab === 'materials'
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                : 'border-white/[0.08] bg-zinc-900/50 text-zinc-400 hover:text-white'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            [ 2. КАТАЛОГ КОНСПЕКТОВ ({items.length}) ]
          </button>

          <button
            onClick={() => setActiveTab('fipi')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
              activeTab === 'fipi'
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                : 'border-white/[0.08] bg-zinc-900/50 text-zinc-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#d4ff00]" />
            [ 3. AI-ЭКСПЕРТ ФИПИ (ЧАСТЬ 2) ]
          </button>

          <button
            onClick={() => setActiveTab('syllabus')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-all flex items-center gap-2 ${
              activeTab === 'syllabus'
                ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                : 'border-white/[0.08] bg-zinc-900/50 text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 text-[#d4ff00]" />
            [ 4. МАТРИЦА ФИПИ ]
          </button>
        </div>

        {/* ТАБ 1: ИНТЕРАКТИВНАЯ КАРТА НАВЫКОВ И ПРОБЕЛОВ (SKILL TREE / ROADMAP) */}
        {activeTab === 'roadmap' && (
          <div className="mb-8">
            <SkillTreeGrid
              weakTopics={weakTopics}
              targetSubjects={targetSubjects}
              onTopicTested={load}
            />
          </div>
        )}

        {/* ТАБ 3: AI-ЭКСПЕРТ ФИПИ */}
        {activeTab === 'fipi' && (
          <div className="mb-8">
            <FipiSolutionChecker />
          </div>
        )}

        {/* ТАБ 4: ИНТЕРАКТИВНАЯ МАТРИЦА КОДИФИКАТОРА ФИПИ */}
        {activeTab === 'syllabus' && (
          <div className="mb-8">
            <FipiSyllabusTracker
              weakTopics={weakTopics}
              targetSubjects={targetSubjects}
              onTopicTested={load}
            />
          </div>
        )}

        {/* ТАБ 2: КАТАЛОГ МАТЕРИАЛОВ */}
        {activeTab === 'materials' && (
          <div className="mt-2">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по теме..."
                  className="field !pl-9"
                />
              </div>
              <div className="sm:w-56">
                <CustomSelect
                  value={subjectFilter}
                  onChange={(v) => setSubjectFilter(v)}
                  options={[
                    { value: 'all', label: 'Все предметы' },
                    ...subjects.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<BookMarked className="h-10 w-10" />}
                title="Материалов пока нет"
                description="Сгенерируйте конспект по теме ЕГЭ — теория, формулы, типичные ловушки и алгоритм решения"
                action={{ label: 'Сгенерировать материал', onClick: () => setGen({ ...gen, open: true }) }}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((material) => (
                  <button
                    key={material.id}
                    onClick={() => setSelected(material)}
                    className="card-shelf p-5 text-left transition-colors hover:border-[#d4ff00]/30"
                  >
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">{material.subject}</div>
                    <div className="mb-2 font-display font-bold tracking-tight text-white">{material.topicName}</div>
                    <p className="line-clamp-3 text-sm font-light text-zinc-500">{material.summaryTheory}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {gen.open && (
        <div className="modal-veil" onClick={() => setGen({ ...gen, open: false })}>
          <div
            className="modal-body max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-tight text-white">
                <Sparkles className="h-5 w-5 text-[#d4ff00]" />
                Генерация материала
              </h2>
              <button onClick={() => setGen({ ...gen, open: false })} className="text-zinc-500 transition-colors hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="field-label">Предмет</label>
                <CustomSelect
                  value={gen.subject}
                  onChange={(v) => setGen({ ...gen, subject: v })}
                  options={SUBJECTS.map((s) => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <label className="field-label">Тема</label>
                <input
                  value={gen.topic}
                  onChange={(e) => setGen({ ...gen, topic: e.target.value })}
                  placeholder="Например: Квадратные уравнения"
                  className="field"
                />
              </div>
              <button
                onClick={generate}
                disabled={gen.busy}
                className="btn-lime w-full text-sm"
              >
                {gen.busy ? 'Генерируем...' : 'Создать конспект'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-veil" onClick={() => setSelected(null)}>
          <div
            className="modal-body max-w-3xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">{selected.subject}</div>
                <h2 className="font-display text-xl font-bold tracking-tight text-white">{selected.topicName}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 transition-colors hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                  <BookMarked className="h-4 w-4 text-[#d4ff00]" />
                  Теория
                </h3>
                <div className="whitespace-pre-line text-sm font-light leading-relaxed text-zinc-400">
                  <LatexText content={selected.summaryTheory} />
                </div>
              </section>

              {selected.formulas && (
                <section className="max-w-full overflow-hidden">
                  <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                    <ListChecks className="h-4 w-4 text-[#d4ff00]" />
                    Формулы
                  </h3>
                  <div className="max-w-full space-y-2 overflow-x-auto whitespace-pre-wrap break-words border border-white/10 bg-black/60 p-4 text-sm text-zinc-300">
                    {selected.formulas.split('\n').map((line, idx) => (
                      <div key={idx} className="overflow-x-auto py-1">
                        <LatexText content={line} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selected.algorithm && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                    <ListChecks className="h-4 w-4 text-[#d4ff00]" />
                    Алгоритм решения
                  </h3>
                  <div className="whitespace-pre-line text-sm font-light leading-relaxed text-zinc-400">
                    <LatexText content={selected.algorithm} />
                  </div>
                </section>
              )}

              {selected.pitfalls && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Типичные ловушки
                  </h3>
                  <div className="whitespace-pre-line text-sm font-light leading-relaxed text-zinc-400">
                    <LatexText content={selected.pitfalls} />
                  </div>
                </section>
              )}

              {(selected.reshuEgeUrl || selected.fipiUrl || selected.videoQuery) && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                    <Lightbulb className="h-4 w-4 text-[#d4ff00]" />
                    Практика
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {selected.reshuEgeUrl && (
                      <a
                        href={selected.reshuEgeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-[#d4ff00] hover:brightness-110"
                      >
                        <LinkIcon className="h-4 w-4" /> Задачи на Решу.ЕГЭ
                      </a>
                    )}
                    {selected.fipiUrl && (
                      <a
                        href={selected.fipiUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-[#d4ff00] hover:brightness-110"
                      >
                        <LinkIcon className="h-4 w-4" /> Демоверсия ФИПИ
                      </a>
                    )}
                    {selected.videoQuery && (
                      <span className="text-sm font-light text-zinc-500">Видео: {selected.videoQuery}</span>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaterialsPage;
