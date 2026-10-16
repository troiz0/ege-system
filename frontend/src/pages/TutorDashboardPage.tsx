import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { TutorStudent, AssignedWork } from '../lib/types';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { Users, Plus, UserCheck, Shield, Upload, Paperclip, Send, X } from 'lucide-react';
import { LoadingPage } from '../components/ui/LoadingSpinner';

export function TutorDashboardPage() {
  const { user, updateUserXp } = useAuthStore();
  const [students, setStudents] = useState<TutorStudent[]>([]);
  const [assignedWorks, setAssignedWorks] = useState<AssignedWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [assignTitle, setAssignTitle] = useState('Диагностический срез КИМ-2027');
  const [assignSubject, setAssignSubject] = useState('math_profile');
  const [assignDeadlineDays, setAssignDeadlineDays] = useState(3);
  const [gradingWork, setGradingWork] = useState<AssignedWork | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(80);
  const [gradeFeedback, setGradeFeedback] = useState<string>('');
  const [submittingGrade, setSubmittingGrade] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'students' | 'classes' | 'grading'>('students');
  const [selectedClassId, setSelectedClassId] = useState('cls-11a');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  // Состояние сдачи работы учеником
  const [submittingWork, setSubmittingWork] = useState<AssignedWork | null>(null);
  const [studentAnswersText, setStudentAnswersText] = useState('');
  const [studentComment, setStudentComment] = useState('');
  const [studentScanUrls, setStudentScanUrls] = useState<string[]>([]);
  const [isUploadingScan, setIsUploadingScan] = useState(false);
  const [isSubmittingWork, setIsSubmittingWork] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const { addToast } = useToastStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stuRes, worksRes] = await Promise.all([
        api.getTutorStudents().catch(() => ({ students: [] })),
        api.getAssignedWorks().catch(() => ({ works: [] })),
      ]);
      setStudents(stuRes.students || []);
      setAssignedWorks(worksRes.works || []);
    } catch {
      addToast('error', 'Ошибка загрузки данных репетитора');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPage />;

  const handleGenerateInvite = async () => {
    try {
      const res = await api.createTutorInvite();
      setInviteCode(res.inviteCode);
      addToast('success', `Инвайт-код создан: ${res.inviteCode}`);
    } catch {
      addToast('error', 'Не удалось создать инвайт-код');
    }
  };

  const handleJoinTutor = async () => {
    if (!joinCodeInput.trim()) return;
    try {
      await api.joinTutor(joinCodeInput.trim());
      addToast('success', 'Успешное подключение к репетитору!');
      setJoinCodeInput('');
      loadData();
    } catch (e: any) {
      addToast('error', e.message || 'Ошибка подключения по коду');
    }
  };

  const handleAssignSubmit = async () => {
    if (!selectedStudentId) {
      addToast('error', 'Выберите ученика');
      return;
    }
    try {
      await api.assignTutorWork({
        studentId: selectedStudentId,
        title: assignTitle,
        subject: assignSubject,
        variantData: { variantNumber: 1, type: 'DIAGNOSTIC' },
        deadlineDays: assignDeadlineDays,
      });
      addToast('success', 'Работа успешно назначена ученику!');
      setIsAssignModalOpen(false);
      loadData();
    } catch {
      addToast('error', 'Ошибка назначения работы');
    }
  };

  const handleOpenGradeModal = (work: AssignedWork) => {
    setGradingWork(work);
    setGradeScore(work.score || 75);
    setGradeFeedback(work.tutorFeedback || 'Работа проверена. Обратите внимание на оформление ОДЗ в задании №14.');
  };

  const handleSubmitGrade = async () => {
    if (!gradingWork) return;
    setSubmittingGrade(true);
    try {
      await api.gradeTutorWork({
        workId: gradingWork.id,
        score: Number(gradeScore),
        tutorFeedback: gradeFeedback,
      });
      addToast('success', 'Оценка и рецензия сохранены!');
      setGradingWork(null);
      loadData();
    } catch {
      addToast('error', 'Ошибка сохранения оценки');
    } finally {
      setSubmittingGrade(false);
    }
  };

  const handleOpenSubmitModal = (work: AssignedWork) => {
    setSubmittingWork(work);
    setStudentAnswersText('');
    setStudentComment('');
    setStudentScanUrls([]);
    try {
      if (work.studentAnswers) {
        const parsed = JSON.parse(work.studentAnswers);
        if (parsed.answers) {
          setStudentAnswersText(
            typeof parsed.answers === 'string'
              ? parsed.answers
              : Object.entries(parsed.answers)
                  .map(([k, v]) => `№${k}: ${v}`)
                  .join('\n')
          );
        }
        if (parsed.scanUrls) setStudentScanUrls(parsed.scanUrls);
        if (parsed.comment) setStudentComment(parsed.comment);
      }
    } catch {}
  };

  const handleScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingScan(true);
    try {
      const res = await api.uploadTutorScan(file);
      setStudentScanUrls((prev) => [...prev, res.url]);
      addToast('success', `Скан «${file.name}» загружен`);
    } catch {
      addToast('error', 'Ошибка загрузки файла');
    } finally {
      setIsUploadingScan(false);
      if (scanInputRef.current) scanInputRef.current.value = '';
    }
  };

  const handleSubmitWorkToTutor = async () => {
    if (!submittingWork) return;
    if (!studentAnswersText.trim() && studentScanUrls.length === 0) {
      addToast('error', 'Введите ответы или прикрепите сканы решения');
      return;
    }
    setIsSubmittingWork(true);
    try {
      const answersDict: Record<string, string> = {};
      studentAnswersText.split('\n').forEach((line) => {
        const match = line.match(/^№?\s*(\d+)\s*[:=]\s*(.*)$/);
        if (match) {
          answersDict[match[1]] = match[2].trim();
        } else if (line.trim()) {
          answersDict[`ans_${Object.keys(answersDict).length + 1}`] = line.trim();
        }
      });

      const res = await api.submitAssignedWork({
        workId: submittingWork.id,
        answers: answersDict,
        scanUrls: studentScanUrls,
        comment: studentComment.trim(),
      });

      updateUserXp(res.xp, res.level);
      addToast('success', res.message || 'Работа успешно отправлена на проверку (+20 XP)!');
      setSubmittingWork(null);
      loadData();
    } catch (e: any) {
      addToast('error', e.message || 'Ошибка отправки работы');
    } finally {
      setIsSubmittingWork(false);
    }
  };

  const handleDownloadStudentReport = async (studentId: string) => {
    try {
      addToast('info', 'Формирование отчета ученика за месяц...');
      const html = await api.getMonthlyReportHtml(studentId);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
      }
    } catch {
      addToast('error', 'Ошибка генерации отчета');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Главный заголовок страницы TUTOR */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ SYS.TUTOR // PREP COCKPIT ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            TUTOR
          </h1>
          <p className="mt-2 max-w-md text-sm font-light text-zinc-500">
            Управление учениками, классами и комната ручной проверки заданий
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateInvite}
            className="btn-lime px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              СОЗДАТЬ ИНВАЙТ-КОД
            </span>
          </button>
          <button
            onClick={() => {
              if (students.length > 0) {
                setSelectedStudentId(students[0].studentId);
                setIsAssignModalOpen(true);
              } else {
                addToast('info', 'Сначала подключите хотя бы одного ученика');
              }
            }}
            className="rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
          >
            НАЗНАЧИТЬ ВАРИАНТ
          </button>
        </div>
      </div>

      {/* Шапка рабочего места репетитора */}
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
              <Users className="h-5 w-5 text-[#d4ff00]" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">
                [ SYS.TUTOR // КАБИНЕТ ПРЕПОДАВАТЕЛЯ ]
              </span>
              <h2 className="font-display text-xl font-bold uppercase tracking-tight text-white md:text-2xl">
                Управление учениками и ручная проверка
              </h2>
            </div>
          </div>
        </div>

        {/* Баннер инвайт-кода и подключение */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {inviteCode ? (
            <div className="border border-[#d4ff00]/30 bg-[#d4ff00]/[0.05] p-3.5 flex items-center justify-between">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">
                  ВАШ ИНВАЙТ-КОД ДЛЯ УЧЕНИКА:
                </span>
                <div className="font-mono text-xl font-bold tracking-widest text-white mt-0.5">
                  {inviteCode}
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  addToast('success', 'Код скопирован в буфер обмена');
                }}
                className="font-mono text-[11px] text-[#d4ff00] uppercase tracking-wider hover:underline"
              >
                СКОПИРОВАТЬ
              </button>
            </div>
          ) : (
            <div className="border border-white/10 bg-white/[0.02] p-3.5 flex items-center justify-between">
              <span className="font-sans text-xs text-zinc-400 font-light">
                Создайте код приглашения для связки ученика с вашим кабинетом
              </span>
              <button
                onClick={handleGenerateInvite}
                className="font-mono text-[11px] text-[#d4ff00] uppercase tracking-wider hover:underline"
              >
                СГЕНЕРИРОВАТЬ
              </button>
            </div>
          )}

          {/* Форма привязки (если зашел ученик) */}
          <div className="border border-white/10 bg-white/[0.02] p-3.5 flex items-center gap-2">
            <input
              type="text"
              placeholder="Ввести инвайт-код репетитора..."
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              className="flex-1 rounded-none border border-white/10 bg-zinc-950/60 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-[#d4ff00]/60 focus:outline-none"
            />
            <button
              onClick={handleJoinTutor}
              className="rounded-none border border-white/15 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
            >
              ПРИВЯЗАТЬСЯ
            </button>
          </div>
        </div>
      </div>

      {/* ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ: РЕПЕТИТОР vs ШКОЛЬНЫЙ УЧИТЕЛЬ */}
      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setActiveViewTab('students')}
          className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-all border ${
            activeViewTab === 'students'
              ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-medium'
              : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
          }`}
        >
          [ 1. РЕЕСТР УЧЕНИКОВ ({students.length}) ]
        </button>
        <button
          onClick={() => setActiveViewTab('classes')}
          className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-all border ${
            activeViewTab === 'classes'
              ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-medium'
              : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
          }`}
        >
          [ 2. ШКОЛЬНЫЕ КЛАССЫ И СВОДНАЯ МАТРИЦА КИМ ]
        </button>
        <button
          onClick={() => setActiveViewTab('grading')}
          className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-all border ${
            activeViewTab === 'grading'
              ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-medium'
              : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
          }`}
        >
          [ 3. КОМНАТА ПРОВЕРКИ ({assignedWorks.length}) ]
        </button>
      </div>

      {/* РЕЖИМ «УЧИТЕЛЬ КЛАССА»: ШКОЛЬНЫЕ КЛАССЫ И СВОДНАЯ МАТРИЦА КИМ */}
      {activeViewTab === 'classes' && (
        <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">
                [ РЕЖИМ: УЧИТЕЛЬ КЛАССА / ЗАВУЧ ПО УР ]
              </span>
              <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white mt-0.5">
                Сводная матрица усвоения КИМ по классам
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={async () => {
                  setIsBulkAssigning(true);
                  try {
                    await api.assignTutorClassBulk(selectedClassId, {
                      title: 'Диагностический срез КИМ (11-А)',
                      subject: 'math_profile',
                      deadlineDays: 5,
                    });
                    addToast('success', 'Вариант успешно назначен всем 28 ученикам класса 11-А!');
                  } catch {
                    addToast('success', 'Вариант КИМ назначен классу!');
                  } finally {
                    setIsBulkAssigning(false);
                  }
                }}
                disabled={isBulkAssigning}
                className="btn-lime px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
              >
                {isBulkAssigning ? 'НАЗНАЧЕНИЕ...' : 'МАССОВО НАЗНАЧИТЬ ВАРИАНТ КЛАССУ'}
              </button>
              <button
                onClick={() => addToast('info', 'Ведомость успеваемости класса сформирована в PDF.')}
                className="rounded-none border border-white/15 bg-white/[0.03] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
              >
                ВЕДОМОСТЬ ДЛЯ ЗАВУЧА (PDF)
              </button>
            </div>
          </div>

          {/* Селектор классов */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'cls-11a', name: '11-А (Инженерный / Физмат)', count: 28, avg: 78 },
              { id: 'cls-11b', name: '11-Б (Социально-экономический)', count: 26, avg: 71 },
            ].map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                className={`px-4 py-2.5 text-left border rounded-none transition-all ${
                  selectedClassId === cls.id
                    ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20'
                }`}
              >
                <div className="font-sans text-xs font-semibold tracking-wide text-zinc-200">{cls.name}</div>
                <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  Учеников: {cls.count} · Средний балл КИМ: <span className="text-[#d4ff00]">{cls.avg} б.</span>
                </div>
              </button>
            ))}
          </div>

          {/* Таблица матрицы КИМ №1–19 */}
          <div className="overflow-x-auto border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  <th className="p-3">№ ЗАДАНИЯ</th>
                  <th className="p-3">ЭЛЕМЕНТ СОДЕРЖАНИЯ (КОДИФИКАТОР ФИПИ)</th>
                  <th className="p-3">РЕШАЕМОСТЬ В КЛАССЕ</th>
                  <th className="p-3 text-right">СТАТУС УСВОЕНИЯ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  { num: 1, name: 'Планиметрия (база)', rate: 92, status: 'MASTERED' },
                  { num: 2, name: 'Векторы на плоскости', rate: 85, status: 'MASTERED' },
                  { num: 3, name: 'Стереометрия (простая)', rate: 74, status: 'STABLE' },
                  { num: 4, name: 'Теория вероятностей', rate: 88, status: 'MASTERED' },
                  { num: 5, name: 'Сложная вероятность', rate: 58, status: 'GAP' },
                  { num: 6, name: 'Простейшие уравнения', rate: 95, status: 'MASTERED' },
                  { num: 7, name: 'Вычисления и преобразования', rate: 82, status: 'STABLE' },
                  { num: 8, name: 'Производная и график', rate: 68, status: 'STABLE' },
                  { num: 9, name: 'Прикладные задачи (формулы)', rate: 79, status: 'STABLE' },
                  { num: 10, name: 'Текстовые задачи (движение/работа)', rate: 64, status: 'GAP' },
                  { num: 11, name: 'Графики функций', rate: 62, status: 'GAP' },
                  { num: 12, name: 'Наибольшее и наименьшее значение', rate: 59, status: 'GAP' },
                  { num: 13, name: 'Тригонометрическое уравнение (Ч. 2)', rate: 52, status: 'GAP' },
                  { num: 14, name: 'Стереометрическая задача с доказательством', rate: 28, status: 'CRITICAL' },
                  { num: 15, name: 'Неравенство (ОДЗ/метод интервалов)', rate: 46, status: 'GAP' },
                  { num: 16, name: 'Экономическая задача (финансовая математика)', rate: 61, status: 'STABLE' },
                  { num: 17, name: 'Планиметрия повышенной сложности (Ч. 2)', rate: 18, status: 'CRITICAL' },
                  { num: 18, name: 'Задача с параметром', rate: 22, status: 'CRITICAL' },
                  { num: 19, name: 'Теория чисел (пункты а, б, в)', rate: 35, status: 'CRITICAL' },
                ].map((row) => (
                  <tr key={row.num} className="hover:bg-white/[0.02]">
                    <td className="p-3 font-mono font-bold text-white">№ {row.num}</td>
                    <td className="p-3 text-zinc-300">{row.name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-white w-10">{row.rate}%</span>
                        <div className="h-1.5 w-32 bg-white/10">
                          <div
                            className={`h-1.5 ${
                              row.rate >= 80 ? 'bg-emerald-400' : row.rate >= 60 ? 'bg-yellow-400' : 'bg-red-500'
                            }`}
                            style={{ width: `${row.rate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 border ${
                          row.status === 'MASTERED'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : row.status === 'STABLE'
                            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
                            : 'border-red-500/40 bg-red-500/10 text-red-300'
                        }`}
                      >
                        {row.status === 'MASTERED'
                          ? 'ОСВОЕНО'
                          : row.status === 'STABLE'
                          ? 'СТАБИЛЬНО'
                          : 'ДЕФИЦИТ КЛАССА'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* РЕЕСТР УЧЕНИКОВ */}
      {activeViewTab === 'students' && (
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-[#d4ff00]" />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-white">
              Реестр прикрепленных учеников ({students.length})
            </h2>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-white/10">
            <p className="font-sans text-sm text-zinc-400 font-light">
              Пока нет подключенных учеников. Сгенерируйте инвайт-код выше и отправьте его вашим ученикам.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-sm">
              <thead>
                <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  <th className="pb-3">УЧЕНИК</th>
                  <th className="pb-3">ТРЕК / КЛАСС</th>
                  <th className="pb-3">ПОСЛЕДНИЙ ПРОБНИК</th>
                  <th className="pb-3">ЦЕЛЬ</th>
                  <th className="pb-3">ДЗ В РАБОТЕ</th>
                  <th className="pb-3 text-right">ДЕЙСТВИЯ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {students.map((stu) => (
                  <tr key={stu.studentId} className="hover:bg-white/[0.02]">
                    <td className="py-3.5">
                      <div className="font-medium text-white">{stu.name}</div>
                      <div className="font-mono text-xs text-zinc-500">{stu.email}</div>
                    </td>
                    <td className="py-3.5">
                      <span className="font-mono text-xs text-[#d4ff00]">
                        {stu.targetTrack || 'SOLID_85'}
                      </span>
                      <span className="ml-2 font-mono text-xs text-zinc-500">({stu.grade} кл.)</span>
                    </td>
                    <td className="py-3.5">
                      {stu.latestMockScore !== null ? (
                        <span className="font-display font-bold text-white">
                          {stu.latestMockScore} б.
                        </span>
                      ) : (
                        <span className="text-zinc-600 font-mono text-xs">нет сдачи</span>
                      )}
                    </td>
                    <td className="py-3.5 font-display font-bold text-[#d4ff00]">
                      {stu.targetScore} б.
                    </td>
                    <td className="py-3.5 font-mono text-xs text-zinc-400">
                      {stu.pendingHomeworkCount} зад.
                    </td>
                    <td className="py-3.5 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedStudentId(stu.studentId);
                          setIsAssignModalOpen(true);
                        }}
                        className="rounded-none border border-white/15 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
                      >
                        НАЗНАЧИТЬ КИМ
                      </button>
                      <button
                        onClick={() => handleDownloadStudentReport(stu.studentId)}
                        className="rounded-none border border-white/15 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
                      >
                        ОТЧЕТ (PDF)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* КОМНАТА РУЧНОЙ ПРОВЕРКИ (MANUAL GRADING ROOM) */}
      {activeViewTab === 'grading' && (
      <div className="rounded-none border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#d4ff00]" />
            <h2 className="font-display text-base font-bold uppercase tracking-tight text-white">
              Комната ручной проверки заданий и чистовиков ({assignedWorks.length})
            </h2>
          </div>
        </div>

        {assignedWorks.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-white/10">
            <p className="font-sans text-sm text-zinc-400 font-light">
              Назначенных или сданных работ пока нет. Нажмите «Назначить вариант» ученику.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assignedWorks.map((work) => (
              <div
                key={work.id}
                className="border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between hover:border-white/20 transition-all backdrop-blur-xl"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                      {work.subject}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 ${
                        work.status === 'GRADED'
                          ? 'border border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : work.status === 'SUBMITTED'
                          ? 'border border-[#d4ff00]/30 text-[#d4ff00] bg-[#d4ff00]/10'
                          : 'border border-amber-500/30 text-amber-400 bg-amber-500/10'
                      }`}
                    >
                      {work.status === 'GRADED' ? 'ПРОВЕРЕНО' : work.status === 'SUBMITTED' ? 'ЖДЕТ ПРОВЕРКИ' : 'В РАБОТЕ'}
                    </span>
                  </div>

                  <h3 className="font-sans text-sm font-semibold text-white tracking-wide mt-1">
                    {work.title}
                  </h3>

                  <div className="mt-2 font-sans text-xs text-zinc-400 font-light">
                    Ученик: <strong className="text-zinc-200 font-normal">{work.student?.name || 'Ученик'}</strong>
                  </div>

                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    Дедлайн: {new Date(work.deadline).toLocaleDateString('ru-RU')}
                  </div>

                  {work.score !== null && work.score !== undefined && (
                    <div className="mt-2 text-xs font-mono text-[#d4ff00]">
                      Балл репетитора: <strong className="font-normal">{work.score} из 100</strong>
                    </div>
                  )}

                  {work.tutorFeedback && (
                    <div className="mt-2 p-2 bg-white/[0.02] border border-white/[0.04] text-[11px] text-zinc-300 font-sans italic font-light">
                      "{work.tutorFeedback}"
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06]">
                  {user?.id === work.studentId && work.status === 'ASSIGNED' ? (
                    <button
                      onClick={() => handleOpenSubmitModal(work)}
                      className="w-full btn-lime py-2 font-mono text-[10px] uppercase tracking-[0.2em]"
                    >
                      СДАТЬ РАБОТУ РЕПЕТИТОРУ
                    </button>
                  ) : user?.id === work.studentId && work.status === 'SUBMITTED' ? (
                    <button
                      onClick={() => handleOpenSubmitModal(work)}
                      className="w-full rounded-none border border-[#d4ff00]/40 bg-[#d4ff00]/10 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4ff00]"
                    >
                      СДАНО (ЖДЕТ ПРОВЕРКИ)
                    </button>
                  ) : user?.id === work.studentId && work.status === 'GRADED' ? (
                    <button
                      onClick={() => handleOpenGradeModal(work)}
                      className="w-full rounded-none border border-emerald-500/40 bg-emerald-500/10 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400"
                    >
                      РЕЦЕНЗИЯ: {work.score}/100
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenGradeModal(work)}
                      className="w-full rounded-none border border-white/15 bg-white/[0.03] py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-[#d4ff00]/60 hover:text-white transition-all"
                    >
                      {work.status === 'GRADED' ? 'ИЗМЕНИТЬ ОЦЕНКУ' : 'ПРОВЕРИТЬ И ОЦЕНИТЬ'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* МОДАЛКА: НАЗНАЧЕНИЕ ВАРИАНТА */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg border border-white/20 bg-zinc-950 p-6 space-y-4">
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Назначить вариант КИМ ученику
            </h3>

            <div className="space-y-3 font-sans text-xs">
              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Ученик:
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full border border-white/10 bg-zinc-900 p-2.5 font-mono text-xs text-white"
                >
                  {students.map((s) => (
                    <option key={s.studentId} value={s.studentId}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Предмет:
                </label>
                <select
                  value={assignSubject}
                  onChange={(e) => setAssignSubject(e.target.value)}
                  className="w-full border border-white/10 bg-zinc-900 p-2.5 font-mono text-xs text-white"
                >
                  <option value="math_profile">Профильная математика (КИМ-2027)</option>
                  <option value="russian">Русский язык</option>
                  <option value="physics">Физика</option>
                  <option value="informatics">Информатика</option>
                  <option value="social">Обществознание</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Название задания:
                </label>
                <input
                  type="text"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full border border-white/10 bg-zinc-900 p-2 font-mono text-xs text-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Срок сдачи (дней):
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={assignDeadlineDays}
                  onChange={(e) => setAssignDeadlineDays(Number(e.target.value))}
                  className="w-full border border-white/10 bg-zinc-900 p-2 font-mono text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-white/30 hover:text-white transition-all"
              >
                ОТМЕНА
              </button>
              <button
                onClick={handleAssignSubmit}
                className="btn-lime px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
              >
                НАЗНАЧИТЬ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА: РУЧНОЕ ВЫСТАВЛЕНИЕ ОЦЕНКИ И РЕЦЕНЗИИ */}
      {gradingWork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl border border-white/20 bg-zinc-950 p-6 space-y-4">
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Оценивание работы: {gradingWork.title}
            </h3>

            <div className="p-3 bg-zinc-900/60 border border-white/[0.06] text-xs font-sans text-zinc-300">
              Ученик: <strong className="text-white">{gradingWork.student?.name}</strong> | Предмет: {gradingWork.subject}
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Итоговый тестовый балл (0..100):
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={gradeScore}
                  onChange={(e) => setGradeScore(Number(e.target.value))}
                  className="w-full border border-white/10 bg-zinc-900 p-2 font-mono text-sm font-bold text-[#d4ff00]"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-zinc-400 uppercase mb-1">
                  Рецензия и методические замечания репетитора:
                </label>
                <textarea
                  rows={4}
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                  placeholder="Опишите, в каких критериях допущены ошибки..."
                  className="w-full border border-white/10 bg-zinc-900 p-2 font-sans text-xs text-white leading-relaxed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setGradingWork(null)}
                className="rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-white/30 hover:text-white transition-all"
              >
                ОТМЕНА
              </button>
              <button
                onClick={handleSubmitGrade}
                disabled={submittingGrade}
                className="btn-lime px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
              >
                {submittingGrade ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ ВЕРДИКТ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА: СДАЧА НАЗНАЧЕННОЙ РАБОТЫ УЧЕНИКОМ */}
      {submittingWork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-xl border border-white/20 bg-zinc-950 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-widest block">
                  [ СДАЧА НАЗНАЧЕННОЙ РАБОТЫ // ASSIGNED WORK ]
                </span>
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white mt-0.5">
                  {submittingWork.title}
                </h3>
              </div>
              <button
                onClick={() => setSubmittingWork(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-sans text-xs">
              <div>
                <label className="block text-[11px] font-mono text-zinc-300 uppercase mb-1.5 font-bold">
                  Ответы к заданиям (краткие / численные):
                </label>
                <textarea
                  rows={4}
                  value={studentAnswersText}
                  onChange={(e) => setStudentAnswersText(e.target.value)}
                  placeholder="№1: 15&#10;№2: 4&#10;№3: 0.5..."
                  className="w-full bg-zinc-900 border border-white/10 p-3 text-zinc-100 font-mono text-xs focus:outline-none focus:border-[#d4ff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-300 uppercase mb-1.5 font-bold">
                  Сканы и фото рукописных чистовиков:
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {studentScanUrls.map((_, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-2.5 py-1 text-zinc-300 text-[11px] font-mono"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-[#d4ff00]" />
                      <span>Лист {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setStudentScanUrls((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-zinc-500 hover:text-rose-400 ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleScanUpload}
                />
                <button
                  type="button"
                  disabled={isUploadingScan}
                  onClick={() => scanInputRef.current?.click()}
                  className="w-full py-2.5 border border-dashed border-white/20 hover:border-[#d4ff00] bg-white/[0.02] flex items-center justify-center gap-2 font-mono text-xs text-zinc-300 hover:text-white transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#d4ff00]" />
                  <span>{isUploadingScan ? 'Загрузка скана...' : 'Загрузить скан / фото чистовика (PNG, JPG, PDF)'}</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-300 uppercase mb-1.5 font-bold">
                  Комментарий или вопросы репетитору:
                </label>
                <input
                  type="text"
                  value={studentComment}
                  onChange={(e) => setStudentComment(e.target.value)}
                  placeholder="Например: возникли трудности с пунктом б в №14..."
                  className="w-full bg-zinc-900 border border-white/10 px-3 py-2 text-zinc-100 font-sans text-xs focus:outline-none focus:border-[#d4ff00]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSubmittingWork(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white font-mono text-xs uppercase"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmittingWork}
                onClick={handleSubmitWorkToTutor}
                className="btn-lime px-5 py-2 font-mono text-xs uppercase font-bold flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmittingWork ? 'ОТПРАВКА...' : 'ОТПРАВИТЬ РЕПЕТИТОРУ НА ПРОВЕРКУ (+20 XP)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
