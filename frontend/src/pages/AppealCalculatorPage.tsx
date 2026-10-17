import React, { useState, useRef } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { errText } from '../lib/errors';
import { CustomSelect } from '../components/ui/CustomSelect';
import { EGE_SUBJECTS_LIST } from '../lib/subjects';
import {
  Scale,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileText,
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
} from 'lucide-react';

interface AppealAnalysisResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  verdictTitle: string;
  riskPercentage: number;
  summary: string;
  upside: {
    potentialDelta: number;
    arguments: string[];
    criteriaAnalysis: string;
  };
  downside: {
    riskDelta: number;
    vulnerabilities: string[];
    hiddenRisks: string;
  };
  commissionStrategy: string;
  attachmentUrls?: string[];
  demoMode?: boolean;
  notice?: string;
}

const COMMON_TASKS = [
  { number: '14', name: 'Уравнения и отбор корней', maxScore: 2 },
  { number: '15', name: 'Неравенства', maxScore: 2 },
  { number: '16', name: 'Экономическая задача', maxScore: 2 },
  { number: '17', name: 'Планиметрия (развернутая)', maxScore: 3 },
  { number: '18', name: 'Задача с параметром', maxScore: 4 },
  { number: '19', name: 'Теория чисел и логика', maxScore: 4 },
  { number: '27', name: 'Сочинение по русскому языку', maxScore: 21 },
];

export const AppealCalculatorPage: React.FC = () => {
  const { addToast } = useToastStore();

  const [subject, setSubject] = useState<string>('Математика (профиль)');
  const [taskNumber, setTaskNumber] = useState<string>('14');
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(2);
  const [taskText, setTaskText] = useState<string>(
    'Решите уравнение: 2*cos(x)^2 + 5*sin(x) - 4 = 0. Укажите корни на отрезке [pi; 5pi/2].'
  );
  const [solutionText, setSolutionText] = useState<string>('');
  const [studentComment, setStudentComment] = useState<string>(
    'Эксперт поставил 0 баллов, посчитав, что отбор на тригонометрическом круге не оформлен, хотя дуга и концы отрезка подписаны.'
  );

  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<AppealAnalysisResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTaskSelect = (num: string) => {
    setTaskNumber(num);
    const found = COMMON_TASKS.find((t) => t.number === num);
    if (found) {
      setMaxScore(found.maxScore);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const chosen = Array.from(e.target.files);
    if (files.length + chosen.length > 5) {
      addToast('error', 'Максимально разрешено загрузить до 5 листов чистовика');
      return;
    }
    setFiles((prev) => [...prev, ...chosen]);
  };

  const handleRemoveFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskText.trim()) {
      addToast('error', 'Укажите условие задачи');
      return;
    }
    if (!solutionText.trim() && files.length === 0) {
      addToast('error', 'Введите текст решения или прикрепите фото чистовика');
      return;
    }

    setAnalyzing(true);
    setResult(null);

    try {
      const res = await api.checkAppealRisk({
        subject,
        taskNumber,
        currentScore,
        maxScore,
        taskText,
        solutionText,
        studentComment,
        files,
      });

      setResult(res);
      if (typeof res.newXp === 'number' && typeof res.newLevel === 'number') {
        useAuthStore.getState().updateUserXp(res.newXp, res.newLevel);
      }
      addToast(
        res.riskLevel === 'LOW' ? 'success' : res.riskLevel === 'HIGH' ? 'error' : 'info',
        `[ АУДИТ ЗАВЕРШЕН // ВЕРДИКТ: ${res.verdictTitle} ]`
      );
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка анализа рисков апелляции');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      {/* HUD-шапка калькулятора */}
      <div className="border-b border-white/[0.08] pb-6">
        <p className="hud-tag mb-2">[ FIPI // APPEAL_RISK_CALCULATOR ]</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white uppercase md:text-5xl">
          AI APPEAL RISK CALCULATOR
        </h1>
        <p className="mt-1 text-xs md:text-sm text-zinc-400 font-light max-w-xl leading-relaxed">
          Беспристрастный аудит рукописного решения нейросетью по двойному критерию: потенциал отвоевать баллы (Upside)
          против риска снижения балла из-за скрытых ошибок при тотальной перепроверке (Downside).
        </p>
      </div>

      {/* Форма ввода параметров апелляции */}
      <form onSubmit={handleAnalyze} className="card-shelf p-6 md:p-8 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Предмет */}
          <div>
            <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
              Учебная дисциплина:
            </label>
            <CustomSelect
              value={subject}
              onChange={(val) => setSubject(val)}
              placeholder="Выберите предмет..."
              options={EGE_SUBJECTS_LIST.map((sub) => ({
                value: sub.name,
                label: `${sub.icon} ${sub.name}`,
              }))}
            />
          </div>

          {/* Номер задачи */}
          <div>
            <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
              Номер задания развернутой части:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={taskNumber}
                onChange={(e) => handleTaskSelect(e.target.value)}
                placeholder="№14 или №27"
                className="field w-full rounded-none text-xs md:text-sm bg-black border-white/10 font-mono py-2 px-3"
              />
            </div>
          </div>

          {/* Первичный балл */}
          <div>
            <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
              Выставленный балл / Максимум:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={maxScore}
                value={currentScore}
                onChange={(e) => setCurrentScore(Math.max(0, parseInt(e.target.value) || 0))}
                className="field w-20 rounded-none text-xs md:text-sm bg-black border-white/10 font-mono font-bold text-[#d4ff00] py-2 px-2.5"
              />
              <span className="font-mono text-zinc-500 text-xs">из</span>
              <input
                type="number"
                min={1}
                max={30}
                value={maxScore}
                onChange={(e) => setMaxScore(Math.max(1, parseInt(e.target.value) || 1))}
                className="field w-20 rounded-none text-xs md:text-sm bg-black border-white/10 font-mono text-zinc-300 py-2 px-2.5"
              />
              <span className="font-mono text-[10px] text-zinc-500 uppercase">первичных</span>
            </div>
          </div>
        </div>

        {/* Быстрые пресеты заданий */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="font-mono text-[10px] text-zinc-500 uppercase self-center mr-1">Быстрый выбор:</span>
          {COMMON_TASKS.map((t) => (
            <button
              key={t.number}
              type="button"
              onClick={() => handleTaskSelect(t.number)}
              className={`px-2.5 py-1 font-mono text-xs uppercase border transition-all rounded-none ${
                taskNumber === t.number
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-bold ring-1 ring-[#d4ff00]'
                  : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
              }`}
            >
              №{t.number} ({t.maxScore} б.)
            </button>
          ))}
        </div>

        {/* Условие задачи */}
        <div>
          <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
            Условие задания КИМ:
          </label>
          <textarea
            rows={2}
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="Вставьте точный текст условия задачи из бланка..."
            className="field w-full rounded-none text-xs bg-black/60 border-white/10 font-mono p-3"
          />
        </div>

        {/* Решение ученика */}
        <div>
          <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
            Текст решения или набранные формулы (при наличии):
          </label>
          <textarea
            rows={3}
            value={solutionText}
            onChange={(e) => setSolutionText(e.target.value)}
            placeholder="Если решение набрано текстом или формулами, вставьте сюда..."
            className="field w-full rounded-none text-xs bg-black/60 border-white/10 font-mono p-3"
          />
        </div>

        {/* Загрузка сканов чистовика */}
        <div>
          <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
            Прикрепить фото / сканы чистовиков (до 5 листов):
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost !py-2 !px-4 text-xs font-mono flex items-center gap-2 border-white/20 text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00] rounded-none"
            >
              <Upload className="w-4 h-4 text-[#d4ff00]" />
              [ ЗАГРУЗИТЬ СКАНЫ ЧИСТОВИКА ]
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <span className="font-mono text-[10px] text-zinc-500">
              Форматы: JPG, PNG, WEBP, PDF (до 15 МБ)
            </span>
          </div>

          {/* Список выбранных файлов */}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1 bg-zinc-900 border border-white/10 font-mono text-xs text-zinc-300"
                >
                  <FileText className="w-3.5 h-3.5 text-[#d4ff00]" />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    className="text-zinc-500 hover:text-red-400 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Претензия ученика */}
        <div>
          <label className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-1.5 font-medium">
            В чем заключается ваша претензия к проверке?
          </label>
          <input
            type="text"
            value={studentComment}
            onChange={(e) => setStudentComment(e.target.value)}
            placeholder="Например: Эксперт не заметил сноску на чертеже или снял балл за отсутствие слова 'Ответ'..."
            className="field w-full rounded-none text-xs bg-black/60 border-white/10 py-2 px-3"
          />
        </div>

        {/* Кнопка запуска проверки */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={analyzing}
            className="btn-lime w-full sm:w-auto !py-2.5 !px-6 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 rounded-none shadow-[0_0_20px_rgba(212,255,0,0.25)]"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>АНАЛИЗ РИСКОВ КОНФЛИКТНОЙ КОМИССИИ...</span>
              </>
            ) : (
              <>
                <Scale className="w-4 h-4" />
                <span>[ РАССЧИТАТЬ РИСК АПЕЛЛЯЦИИ ]</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* РЕЗУЛЬТАТ АУДИТА В СТИЛЕ EGE.SYSTEM HUD */}
      {result && (
        <div className="space-y-6 animate-in slide-in-from-bottom duration-200">
          {/* Главный вердикт и шкала риска */}
          <div
            className={`card-shelf p-6 md:p-8 border rounded-none space-y-6 ${
              result.riskLevel === 'LOW'
                ? 'border-green-500/60 bg-green-950/15'
                : result.riskLevel === 'HIGH'
                ? 'border-red-500/60 bg-red-950/15'
                : 'border-amber-500/60 bg-amber-950/15'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
              <div>
                <span
                  className={`font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-1 ${
                    result.riskLevel === 'LOW'
                      ? 'text-green-400'
                      : result.riskLevel === 'HIGH'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                >
                  {result.riskLevel === 'LOW' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  ВЕРДИКТ АУДИТА КОНФЛИКТНОЙ КОМИССИИ
                </span>
                <h2 className="text-2xl md:text-3xl font-display font-black text-white uppercase tracking-tight">
                  {result.verdictTitle}
                </h2>
                <p className="mt-1 font-mono text-xs text-zinc-400">{result.summary}</p>
              </div>

              {/* Процент риска */}
              <div className="text-right">
                <span className="font-mono text-[10px] text-zinc-400 uppercase block">Уровень угрозы понижения:</span>
                <span
                  className={`text-4xl font-display font-black ${
                    result.riskLevel === 'LOW'
                      ? 'text-green-400'
                      : result.riskLevel === 'HIGH'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                >
                  {result.riskPercentage}%
                </span>
              </div>
            </div>

            {/* Визуальная шкала риска */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono text-[10px] text-zinc-500 uppercase">
                <span>0% — Безопасно</span>
                <span>50% — Зона риска</span>
                <span>100% — Гарантированное снижение</span>
              </div>
              <div className="h-3 w-full bg-zinc-900 border border-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    result.riskLevel === 'LOW'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                      : result.riskLevel === 'HIGH'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500'
                      : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                  }`}
                  style={{ width: `${result.riskPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Двусторонний разбор: UPSIDE vs DOWNSIDE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Левая колонка: ПОТЕНЦИАЛ ПОВЫШЕНИЯ (UPSIDE) */}
            <div className="card-shelf p-5 space-y-4 border-l-4 border-l-green-400 bg-zinc-950/70">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <h3 className="font-mono text-xs font-bold text-green-400 uppercase tracking-wider">
                    [ ПОТЕНЦИАЛ ПОВЫШЕНИЯ // UPSIDE ]
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs font-bold">
                  +{result.upside.potentialDelta} БАЛЛ
                </span>
              </div>

              <div className="space-y-3 font-sans text-xs text-zinc-300 leading-relaxed">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">
                    АРГУМЕНТЫ ДЛЯ ОТСТАИВАНИЯ БАЛЛА:
                  </span>
                  <ul className="list-disc list-inside space-y-1.5 text-zinc-300">
                    {result.upside.arguments.map((arg, i) => (
                      <li key={i}>{arg}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-white/[0.06] pt-2">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">
                    КРИТЕРИАЛЬНЫЙ РАЗБОР:
                  </span>
                  <p className="text-zinc-400 bg-black/40 p-2.5 border border-white/[0.06]">
                    {result.upside.criteriaAnalysis}
                  </p>
                </div>
              </div>
            </div>

            {/* Правая колонка: РИСК ПОНИЖЕНИЯ (DOWNSIDE) */}
            <div className="card-shelf p-5 space-y-4 border-l-4 border-l-red-500 bg-zinc-950/70">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <h3 className="font-mono text-xs font-bold text-red-400 uppercase tracking-wider">
                    [ РИСК ПОНИЖЕНИЯ // DOWNSIDE ]
                  </h3>
                </div>
                <span
                  className={`px-2 py-0.5 border font-mono text-xs font-bold ${
                    result.downside.riskDelta > 0
                      ? 'bg-red-500/15 border-red-500/40 text-red-400'
                      : 'bg-zinc-800 border-white/10 text-zinc-400'
                  }`}
                >
                  {result.downside.riskDelta > 0 ? `-${result.downside.riskDelta} БАЛЛ` : '0 РИСК'}
                </span>
              </div>

              <div className="space-y-3 font-sans text-xs text-zinc-300 leading-relaxed">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">
                    УЯЗВИМОСТИ И СКРЫТЫЕ ОШИБКИ:
                  </span>
                  <ul className="list-disc list-inside space-y-1.5 text-zinc-300">
                    {result.downside.vulnerabilities.map((vuln, i) => (
                      <li key={i}>{vuln}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-white/[0.06] pt-2">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-1">
                    АНАЛИЗ УГРОЗ ТОТАЛЬНОЙ ПЕРЕПРОВЕРКИ:
                  </span>
                  <p className="text-zinc-400 bg-black/40 p-2.5 border border-white/[0.06]">
                    {result.downside.hiddenRisks}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Стратегия защиты перед конфликтной комиссией */}
          <div className="card-shelf p-6 border border-[#d4ff00]/40 space-y-3 bg-zinc-950">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#d4ff00]" />
              <h3 className="font-mono text-xs font-bold text-[#d4ff00] uppercase tracking-wider">
                [ ТАКТИКА ДЛЯ ЗАСЕДАНИЯ КОНФЛИКТНОЙ КОМИССИИ ]
              </h3>
            </div>
            <p className="font-sans text-xs md:text-sm text-zinc-300 leading-relaxed bg-black/50 p-4 border border-white/[0.08]">
              {result.commissionStrategy}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppealCalculatorPage;
