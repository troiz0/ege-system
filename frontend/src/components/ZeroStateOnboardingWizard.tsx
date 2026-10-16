import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  ArrowRight,
  GraduationCap,
  X,
  Check,
  Terminal,
  Cpu,
  TrendingUp,
  BookOpen,
  Clock,
  Layers,
  Target,
  Shield,
} from 'lucide-react';
import { api } from '../lib/api';

interface ZeroStateOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ZeroStateOnboardingWizard({ isOpen, onClose }: ZeroStateOnboardingWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTrack, setSelectedTrack] = useState<string>('it');
  const [targetScore, setTargetScore] = useState<number>(85);

  const tracks = [
    {
      id: 'it',
      title: 'Физмат / IT',
      subjects: 'Математика (профиль) + Информатика + Русский',
      desc: 'Для поступления на ПМИ, ИВТ, Программную инженерию (МФТИ, ВШЭ, Бауманка, МИРЭА)',
      code: 'IT // SYS',
      icon: Terminal,
      targetSubjects: ['Математика (профиль)', 'Информатика', 'Русский язык'],
    },
    {
      id: 'eng',
      title: 'Инженерно-технический',
      subjects: 'Математика (профиль) + Физика + Русский',
      desc: 'Для поступления в МЭИ, МАИ, Политех Петра, МГТУ им. Баумана',
      code: 'ENG // TECH',
      icon: Cpu,
      targetSubjects: ['Математика (профиль)', 'Физика', 'Русский язык'],
    },
    {
      id: 'econ',
      title: 'Социально-экономический',
      subjects: 'Математика (профиль) + Обществознание + Русский',
      desc: 'Для поступления на Экономику, Менеджмент, Бизнес-информатику (ВШЭ, РАНХиГС, РЭУ)',
      code: 'ECON // FIN',
      icon: TrendingUp,
      targetSubjects: ['Математика (профиль)', 'Обществознание', 'Русский язык'],
    },
    {
      id: 'humanities',
      title: 'Гуманитарный / Лингвистика',
      subjects: 'Русский язык + Обществознание + История',
      desc: 'Для поступления на Юриспруденцию, Лингвистику, Медиакоммуникации (МГУ, МГИМО)',
      code: 'HUM // SOC',
      icon: BookOpen,
      targetSubjects: ['Русский язык', 'Обществознание', 'История'],
    },
  ];

  if (!isOpen) return null;

  const handleFinish = async (goToDiagnostic: boolean) => {
    try {
      localStorage.setItem('ege_onboarding_completed', 'true');
      localStorage.setItem('ege_user_track', selectedTrack);
      localStorage.setItem('ege_user_target_score', String(targetScore));

      const trackObj = tracks.find((t) => t.id === selectedTrack) || tracks[0];
      localStorage.setItem('ege_user_target_subjects', JSON.stringify(trackObj.targetSubjects));

      // Синхронизируем целевые предметы и флаг onboardingCompleted с профилем на бэкенде
      const currentProfile = await api.getProfile().catch(() => null);
      if (currentProfile) {
        await api.updateProfile({
          ...currentProfile,
          onboardingCompleted: true,
          targetTrack: targetScore >= 90 ? 'OLYMP_95' : targetScore >= 80 ? 'SOLID_85' : 'BASE_65',
          targetSubjects: trackObj.targetSubjects.map((s) => ({
            subjectName: s,
            targetScore,
          })),
        }).catch(() => {});
      } else {
        await api.updateProfile({
          onboardingCompleted: true,
        }).catch(() => {});
      }

      window.dispatchEvent(
        new CustomEvent('profile-target-subjects-updated', {
          detail: {
            track: selectedTrack,
            targetSubjects: trackObj.targetSubjects,
            targetScore,
          },
        })
      );
    } catch {
      /* noop */
    }
    onClose();
    if (goToDiagnostic) {
      navigate('/exam-pressure?mode=diagnostic');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl border border-white/20 bg-[#09090b]/95 backdrop-blur-2xl p-6 md:p-8 shadow-2xl space-y-6">
        {/* Кнопка закрытия */}
        <button
          onClick={() => handleFinish(false)}
          className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors"
          title="Пропустить настройку"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Шапка визарда */}
        <div className="space-y-1.5 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-5 items-center bg-[#d4ff00]/10 border border-[#d4ff00]/40 px-2 font-mono text-[10px] uppercase tracking-widest text-[#d4ff00]">
              [ ZERO-STATE ONBOARDING PROTOCOL ]
            </span>
            <span className="font-mono text-xs text-zinc-500">ШАГ {step} ИЗ 3</span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-white">
            {step === 1 && 'Выбор целевого профиля и предметов'}
            {step === 2 && 'Целевой балл и горизонт поступления'}
            {step === 3 && 'Стартовый экспресс-срез (15 минут)'}
          </h2>
        </div>

        {/* ШАГ 1: ВЫБОР ТРЕКА */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="font-sans text-xs text-zinc-400 font-light">
              Выберите ваш образовательный трек. Система автоматически откалибрует приоритеты заданий КИМ, банк задач и темы Дейли-спринта:
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {tracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTrack(t.id)}
                  className={`p-3.5 text-left border rounded-none transition-all flex flex-col justify-between ${
                    selectedTrack === t.id
                      ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white shadow-[0_0_15px_rgba(212,255,0,0.1)]'
                      : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center border border-[#d4ff00]/40 bg-[#d4ff00]/10">
                          <t.icon className="h-3.5 w-3.5 text-[#d4ff00]" />
                        </div>
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d4ff00]">
                          [{t.code}]
                        </span>
                      </div>
                      {selectedTrack === t.id && (
                        <Check className="h-4 w-4 text-[#d4ff00]" />
                      )}
                    </div>
                    <div className="font-sans text-sm font-semibold tracking-wide text-white">{t.title}</div>
                    <div className="font-mono text-[11px] text-[#d4ff00] mt-0.5">{t.subjects}</div>
                    <div className="font-sans text-[11px] text-zinc-400 mt-1 line-clamp-2 font-light">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setStep(2)}
                className="btn-lime flex items-center gap-2 px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
              >
                ДАЛЕЕ: ЦЕЛЕВОЙ БАЛЛ
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ШАГ 2: ЦЕЛЕВОЙ БАЛЛ И ВУЗЫ */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="font-sans text-xs text-zinc-400 font-light">
              Укажите желаемый целевой балл по профильному предмету. Мы рассчитаем допустимый процент ошибок в части 2:
            </p>

            <div className="space-y-3">
              {[
                {
                  target: 90,
                  label: '90+ БАЛЛОВ // ТОП-ВУЗЫ И ОЛИМПИАДНЫЙ РЕЗЕРВ',
                  desc: 'ВШЭ, МФТИ, МГУ, МГТУ им. Баумана. Требуется решение параметров (№18) и чисел (№19).',
                  color: 'text-[#d4ff00]',
                },
                {
                  target: 80,
                  label: '80–89 БАЛЛОВ // УВЕРЕННЫЙ БЮДЖЕТ',
                  desc: 'МЭИ, МАИ, РТУ МИРЭА, СПбПУ. Железобетонная часть 1 (100%) + уравнения, неравенства и экономическая.',
                  color: 'text-emerald-400',
                },
                {
                  target: 70,
                  label: '70–79 БАЛЛОВ // ОПОРНЫЕ ВУЗЫ',
                  desc: 'Региональные опорные университеты. Максимальная концентрация на первой части КИМ без права на ошибку.',
                  color: 'text-amber-400',
                },
              ].map((tier) => (
                <button
                  key={tier.target}
                  onClick={() => setTargetScore(tier.target)}
                  className={`w-full p-3.5 text-left border rounded-none transition-all flex items-start justify-between ${
                    targetScore === tier.target
                      ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-[#d4ff00]" />
                      <span className="font-mono text-xs uppercase tracking-wider text-white font-medium">{tier.label}</span>
                    </div>
                    <p className="font-sans text-xs text-zinc-400 font-light">{tier.desc}</p>
                  </div>
                  {targetScore === tier.target && (
                    <Check className="h-4 w-4 text-[#d4ff00] shrink-0 ml-3" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 hover:border-white/30 hover:text-white transition-all"
              >
                ← НАЗАД
              </button>
              <button
                onClick={() => setStep(3)}
                className="btn-lime flex items-center gap-2 px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em]"
              >
                ДАЛЕЕ: СТАРТОВЫЙ СРЕЗ
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ШАГ 3: ЭКСПРЕСС-СРЕЗ */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <Zap className="h-4 w-4" />
                <span className="font-mono text-xs uppercase tracking-[0.2em] font-medium">
                  СТАРТОВЫЙ ЭКСПРЕСС-СРЕЗ (15 МИНУТ // 5 ЗАДАНИЙ)
                </span>
              </div>
              <p className="font-sans text-xs text-zinc-300 leading-relaxed font-light">
                Чтобы нейросетевая модель построила индивидуальную траекторию и откалибровала тепловую карту пробелов, пройдите стартовый экспресс-срез. Он проверит 5 ключевых навыков кодификатора ФИПИ и определит стартовую точку без необходимости писать 4-часовой пробник.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] text-zinc-300 pt-1">
                <div className="flex items-center gap-2 border border-white/5 bg-white/[0.015] p-2.5">
                  <Clock className="h-3.5 w-3.5 text-[#d4ff00] shrink-0" />
                  <span>ВРЕМЯ: 15 МИНУТ</span>
                </div>
                <div className="flex items-center gap-2 border border-white/5 bg-white/[0.015] p-2.5">
                  <Layers className="h-3.5 w-3.5 text-[#d4ff00] shrink-0" />
                  <span>ФОРМАТ: ЭКСПРЕСС-КИМ</span>
                </div>
                <div className="flex items-center gap-2 border border-white/5 bg-white/[0.015] p-2.5">
                  <Target className="h-3.5 w-3.5 text-[#d4ff00] shrink-0" />
                  <span>ОЦЕНКА: КАЛИБРОВКА</span>
                </div>
                <div className="flex items-center gap-2 border border-white/5 bg-white/[0.015] p-2.5">
                  <Shield className="h-3.5 w-3.5 text-[#d4ff00] shrink-0" />
                  <span>БАНК ПРОБЕЛОВ: LIVE</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                onClick={() => handleFinish(false)}
                className="w-full sm:w-auto rounded-none border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white transition-all"
              >
                ПРОПУСТИТЬ И ПЕРЕЙТИ В КОНСОЛЬ
              </button>
              <button
                onClick={() => handleFinish(true)}
                className="w-full sm:w-auto btn-lime flex items-center justify-center gap-2 px-6 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(212,255,0,0.15)]"
              >
                <Zap className="h-4 w-4 fill-current" />
                НАЧАТЬ ЭКСПРЕСС-ДИАГНОСТИКУ (15 МИН)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
