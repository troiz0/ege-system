import { useState } from 'react';
import { ShieldCheck, GraduationCap, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import type { DashboardSummary } from '../lib/types';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';

interface ParentConsoleViewProps {
  data: DashboardSummary;
  onSwitchToStudent: () => void;
}

interface UniversityTarget {
  id: string;
  name: string;
  faculty: string;
  passingScore: number;
  budgetPlaces: number;
}

const UNIVERSITIES: UniversityTarget[] = [
  {
    id: 'mipt',
    name: 'МФТИ (Физтех)',
    faculty: 'Прикладная математика и информатика (ФПМИ)',
    passingScore: 304,
    budgetPlaces: 120,
  },
  {
    id: 'hse',
    name: 'НИУ ВШЭ',
    faculty: 'Программная инженерия (ФКН) — БВИ / 300+',
    passingScore: 300,
    budgetPlaces: 140,
  },
  {
    id: 'bmstu',
    name: 'МГТУ им. Н.Э. Баумана',
    faculty: 'Информатика и вычислительная техника (ИУ)',
    passingScore: 300,
    budgetPlaces: 310,
  },
  {
    id: 'msu',
    name: 'МГУ им. М.В. Ломоносова',
    faculty: 'Мехмат / ВМК (275 б. + ДВИ)',
    passingScore: 275,
    budgetPlaces: 230,
  },
  {
    id: 'mirea',
    name: 'РТУ МИРЭА',
    faculty: 'Программная инженерия (ИИТ)',
    passingScore: 265,
    budgetPlaces: 280,
  },
  {
    id: 'mai',
    name: 'МАИ (Национальный исследовательский)',
    faculty: 'Информатика и прикладная математика',
    passingScore: 250,
    budgetPlaces: 240,
  },
  {
    id: 'mpei',
    name: 'НИУ «МЭИ» / Политех',
    faculty: 'Информационные технологии и радиоэлектроника',
    passingScore: 230,
    budgetPlaces: 350,
  },
  {
    id: 'regional',
    name: 'Опорный технический университет',
    faculty: 'Инженерно-технологический факультет',
    passingScore: 210,
    budgetPlaces: 400,
  },
];

export function ParentConsoleView({ data, onSwitchToStudent }: ParentConsoleViewProps) {
  const [selectedUniId, setSelectedUniId] = useState<string>('bmstu');
  const [isExporting, setIsExporting] = useState(false);
  const { addToast } = useToastStore();

  const targetSubjects = data.targetSubjectScores || [];
  const hasMocks = (data.mockExamAverage?.count ?? 0) > 0;
  const currentMathScore = hasMocks ? (data.mockExamAverage.average || 0) : 0;
  const targetMathScore = data.mockExamAverage.target || 85;

  // Достоверный расчет баллов по ВСЕМ пробникам целевых предметов (любые предметы ученика)
  const currentTotal3 = data.admissionTotalScore ?? (hasMocks ? Math.min(300, Math.round(currentMathScore * 3)) : 0);

  const selectedUni = UNIVERSITIES.find((u) => u.id === selectedUniId) || UNIVERSITIES[0];
  const deltaNeeded = selectedUni.passingScore - currentTotal3;

  // Реалистичный расчет вероятности зачисления на бюджет:
  const admissionProbability = (() => {
    if (!hasMocks && currentTotal3 === 0) return 0;
    if (deltaNeeded <= -10) return 98;
    if (deltaNeeded <= 0) return 92;
    if (deltaNeeded <= 10) return 78;
    if (deltaNeeded <= 20) return 55;
    if (deltaNeeded <= 35) return 35;
    return Math.max(15, Math.round(35 - (deltaNeeded - 35) * 0.4));
  })();

  const pureStudyFormatted = data.pureStudyTime?.formatted || (hasMocks ? `${Math.floor((data.mockExamAverage.count * 180) / 60)} ч` : '0 ч 0 мин');

  const handleDownloadMonthlyPdf = async () => {
    try {
      setIsExporting(true);
      const html = await api.getMonthlyReportHtml();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
      } else {
        addToast('error', 'Всплывающие окна заблокированы браузером');
      }
    } catch (e: any) {
      addToast('error', 'Ошибка генерации отчета: ' + (e.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Шапка родительского кабинета */}
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
              <ShieldCheck className="h-5 w-5 text-[#d4ff00]" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00] block mb-0.5">
                [ РОДИТЕЛЬСКИЙ РЕЖИМ // ОБЪЕКТИВНЫЙ КОНТРОЛЬ ]
              </span>
              <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-white md:text-3xl">
                Сводка готовности к поступлению в вуз
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadMonthlyPdf}
              disabled={isExporting}
              className="rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-200 transition-all hover:border-[#d4ff00]/60 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                {isExporting ? 'ФОРМИРОВАНИЕ...' : 'ОТЧЕТ ЗА МЕСЯЦ (PDF)'}
              </span>
            </button>
            <button
              onClick={onSwitchToStudent}
              className="rounded-none border border-white/10 bg-white/[0.02] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:text-white"
            >
              РЕЖИМ УЧЕНИКА →
            </button>
          </div>
        </div>

        {/* 3 главных родительских показателя */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              СТАТУС ПОДГОТОВКИ
            </div>
            <div className="mt-1 font-sans text-xl font-semibold tracking-wide text-white">
              {hasMocks ? (currentMathScore >= 80 ? 'ВЫСОКИЙ ШАНС' : currentMathScore >= 65 ? 'УВЕРЕННЫЙ' : 'ТРЕБУЕТ ВНИМАНИЯ') : 'НЕТ ДАННЫХ'}
            </div>
            <p className="mt-1 font-sans text-xs text-zinc-400 font-light">
              {hasMocks ? (
                <>Текущий средний балл: <strong className="text-[#d4ff00] font-normal">{currentMathScore} из 100</strong> (Цель: {targetMathScore})</>
              ) : (
                <>Пробники еще не сдавались (Цель: {targetMathScore})</>
              )}
            </p>
          </div>

          <div className="border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              ЧИСТОЕ ВРЕМЯ НА ПЛАТФОРМЕ
            </div>
            <div className="mt-1 font-display text-2xl font-bold tracking-normal text-[#d4ff00]">
              {pureStudyFormatted}
            </div>
            <p className="mt-1 font-sans text-xs text-zinc-400 font-light">
              Только активное решение тестов и пробников без простоев.
            </p>
          </div>

          <div className="border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              ДО ЭКЗАМЕНОВ ОСТАЛОСЬ
            </div>
            <div className="mt-1 font-display text-2xl font-bold tracking-normal text-white">
              {data.daysUntilExam} дней
            </div>
            <p className="mt-1 font-sans text-xs text-zinc-400 font-light">
              План подготовки выполнен на <strong className="text-white font-normal">{data.planProgress}%</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ДЕКОМПОЗИЦИЯ БАЛЛОВ ПО ВСЕМ ЦЕЛЕВЫМ ПРЕДМЕТАМ (ПРОБНИКИ И ПРОГНОЗ) */}
      {targetSubjects.length > 0 && (
        <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-3 gap-2">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00] block mb-0.5">
                [ ВСЕ ЦЕЛЕВЫЕ ПРЕДМЕТЫ // ТЕЛЕМЕТРИЯ ПРОБНИКОВ ]
              </span>
              <h2 className="font-display text-base font-bold uppercase tracking-tight text-white">
                Подтвержденные баллы по целевым предметам ({targetSubjects.length})
              </h2>
            </div>
            <div className="font-mono text-xs text-zinc-400">
              СУММА ВСЕХ ПРЕДМЕТОВ: <strong className="text-white font-normal">{data.targetSubjectsTotal || targetSubjects.reduce((s, t) => s + t.confirmedScore, 0)} Б.</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {targetSubjects.map((subj) => (
              <div key={subj.id} className="border border-white/10 bg-white/[0.015] p-3.5">
                <div className="flex justify-between items-start">
                  <span className="font-sans text-xs font-semibold text-zinc-200">{subj.subjectName}</span>
                  <span className="font-mono text-xs font-bold text-[#d4ff00] border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-1.5 py-0.5">
                    {subj.confirmedScore} б.
                  </span>
                </div>
                <div className="mt-2 font-mono text-[10px] text-zinc-400">
                  {subj.mockCount > 0 ? (
                    <span>Пробников: {subj.mockCount} (посл. {subj.latestScore} б. / ср. {subj.avgScore} б.)</span>
                  ) : (
                    <span>Пробник не сдавался (прогноз)</span>
                  )}
                </div>
                <div className="mt-1 flex justify-between items-center text-[10px] font-mono text-zinc-500 border-t border-white/[0.04] pt-1.5">
                  <span>Цель: {subj.targetScore} б.</span>
                  <span className={subj.confirmedScore >= subj.targetScore ? 'text-emerald-400' : 'text-amber-400'}>
                    {subj.confirmedScore >= subj.targetScore ? 'Выполнено' : `Дефицит: -${subj.targetScore - subj.confirmedScore} б.`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* КАЛЬКУЛЯТОР ШАНСОВ НА БЮДЖЕТ (ПРЕДИКТОР ПОСТУПЛЕНИЯ) */}
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
              <GraduationCap className="h-4 w-4 text-[#d4ff00]" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00] block mb-0.5">
                [ ПРЕДИКТОР ПОСТУПЛЕНИЯ // БЮДЖЕТНЫЕ МЕСТА ]
              </span>
              <h2 className="font-display text-base font-bold uppercase tracking-tight text-white">
                Калькулятор шансов на бюджетное отделение
              </h2>
            </div>
          </div>

          <span className="font-mono text-xs text-zinc-400">
            СУММА 3 ПРЕДМЕТОВ: <strong className="text-[#d4ff00] text-sm font-normal">{currentTotal3} Б.</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Селектор целевого университета */}
          <div className="space-y-2 lg:col-span-1">
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              ВЫБЕРИТЕ ЦЕЛЕВОЙ ВУЗ:
            </label>
            <div className="space-y-2">
              {UNIVERSITIES.map((uni) => (
                <button
                  key={uni.id}
                  onClick={() => setSelectedUniId(uni.id)}
                  className={`w-full text-left p-3 border transition-all rounded-none ${
                    selectedUniId === uni.id
                      ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-sans text-xs font-semibold tracking-wide">{uni.name}</span>
                    <span className="font-mono text-[11px] text-[#d4ff00]">{uni.passingScore} б.</span>
                  </div>
                  <div className="font-sans text-[11px] text-zinc-400 truncate mt-0.5 font-light">{uni.faculty}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Результат расчета вероятности */}
          <div className="border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between lg:col-span-2 backdrop-blur-xl">
            <div>
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
                    {selectedUni.name}
                  </h3>
                  <p className="font-sans text-xs text-zinc-400 mt-0.5 font-light">
                    Направление: {selectedUni.faculty} (Бюджетных мест: {selectedUni.budgetPlaces})
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Проходной балл</div>
                  <div className="font-display text-2xl font-bold tracking-normal text-white">{selectedUni.passingScore}</div>
                </div>
              </div>

              {/* Прогресс-бар шанса */}
              <div className="mt-6">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                    РАСЧЕТНАЯ ВЕРОЯТНОСТЬ ПОСТУПЛЕНИЯ:
                  </span>
                  <span className={`font-display text-2xl font-bold tracking-normal ${admissionProbability >= 85 ? 'text-emerald-400' : admissionProbability >= 70 ? 'text-[#d4ff00]' : 'text-amber-400'}`}>
                    {admissionProbability}%
                  </span>
                </div>

                <div className="h-1.5 w-full bg-white/10">
                  <div
                    className={`h-1.5 transition-all duration-500 ${
                      admissionProbability >= 85 ? 'bg-emerald-400' : admissionProbability >= 70 ? 'bg-[#d4ff00]' : 'bg-amber-400'
                    }`}
                    style={{ width: `${admissionProbability}%` }}
                  />
                </div>
              </div>

              {/* Дельта и вердикт */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em]">СУММА ЦЕЛЕВЫХ ПРЕДМЕТОВ</div>
                  <div className="font-display text-lg font-semibold tracking-normal text-white mt-0.5">
                    {currentTotal3} баллов
                  </div>
                  <div className="font-sans text-xs text-zinc-400 mt-1 font-light">
                    {targetSubjects.length > 0 
                      ? `Рассчитано по всем целевым предметам (${targetSubjects.length}): ${targetSubjects.map(s => `${s.subjectName}: ${s.confirmedScore} б.`).join(', ')}`
                      : `Подтверждено пробниками: ${currentMathScore} б.`}
                  </div>
                </div>

                <div className="border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em]">ДЕФИЦИТ ДО ПРОХОДНОГО</div>
                  <div className={`font-display text-lg font-semibold tracking-normal mt-0.5 ${deltaNeeded <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {deltaNeeded <= 0 ? 'ЗАПАС +' + Math.abs(deltaNeeded) + ' БАЛЛОВ' : 'НУЖНО ЕЩЕ +' + deltaNeeded + ' Б.'}
                  </div>
                  <div className="font-sans text-xs text-zinc-400 mt-1 font-light">
                    {deltaNeeded <= 0 
                      ? 'Гарантированное прохождение на бюджетное отделение' 
                      : `Для прохождения на бюджет требуется набрать еще +${deltaNeeded} вторичных баллов суммарно`}
                  </div>
                </div>
              </div>

              {/* Декомпозиция рекомендаций по целевым предметам */}
              {targetSubjects.length > 0 && deltaNeeded > 0 && (
                <div className="mt-4 border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-[0.2em] mb-2">
                    РЕКОМЕНДАЦИИ ПО ДОБОРУ БАЛЛОВ ПО ЦЕЛЕВЫМ ПРЕДМЕТАМ:
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {targetSubjects.map((subj, idx) => {
                      const share = Math.ceil(deltaNeeded / Math.max(1, targetSubjects.length));
                      const neededForSubj = Math.min(100, subj.confirmedScore + share);
                      const cleanName = subj.subjectName.replace(/\s*\(профиль\)|\s*\(базовая\)/gi, '');
                      return (
                        <div key={idx} className="flex justify-between items-center text-xs border border-white/[0.06] bg-black/40 px-2.5 py-1.5 font-sans">
                          <span className="font-semibold text-zinc-200">{cleanName}:</span>
                          <span className="font-mono text-zinc-400">
                            текущий <strong className="text-white font-normal">{subj.confirmedScore}</strong> б. → цель <strong className="text-[#d4ff00] font-normal">{neededForSubj}</strong> б. (+{share})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-white/[0.06] pt-3 flex items-center gap-2 text-xs font-sans text-zinc-400 font-light">
              <CheckCircle2 className="h-4 w-4 text-[#d4ff00] shrink-0" />
              <span>
                Прогноз рассчитан по всем пробникам целевых предметов с учетом актуальных проходных баллов вузов.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ТЕМЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ (ПОНЯТНЫЙ ЯЗЫК ДЛЯ РОДИТЕЛЯ) */}
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex h-8 w-8 items-center justify-center border border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
              [ ВНИМАНИЕ РОДИТЕЛЯ // ЗОНЫ РОСТА ]
            </span>
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-white">
              Что сейчас мешает получить более высокий балл
            </h2>
          </div>
        </div>

        {(() => {
          const validGaps = (data.criticalGaps || []).filter(
            (gap) => !/^(практическая|контрольная|цдз|самостоятельная|лабораторная|проверочная|школьная успеваемость|диагностическая)/i.test(gap.topic.trim())
          );
          if (validGaps.length === 0) {
            return (
              <p className="font-sans text-xs text-zinc-400 font-light">
                Критических системных ошибок не выявлено. Ученик стабильно справляется с основными блоками КИМ.
              </p>
            );
          }
          return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {validGaps.map((gap, i) => (
                <div key={i} className="border border-white/10 bg-white/[0.02] p-3.5 backdrop-blur-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400">
                    {gap.subject} • ЗОНА РОСТА №{i + 1}
                  </span>
                  <div className="mt-1 font-sans text-sm font-semibold tracking-wide text-white">
                    {gap.topic}
                  </div>
                  <p className="mt-2 font-sans text-xs text-zinc-400 leading-relaxed font-light">
                    По этой теме зафиксированы регулярные ошибки на пробных экзаменах. Рекомендуется повторить формулы или разобрать задачи с преподавателем.
                  </p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
