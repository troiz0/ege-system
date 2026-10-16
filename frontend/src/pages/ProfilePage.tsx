import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { CustomSelect } from '../components/ui/CustomSelect';
import { MeshConnectBanner } from '../components/MeshConnectBanner';
import { MeshConnectedCard } from '../components/MeshConnectedCard';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { User, Calendar, Plus, Trash2, FileText, Shield, Bell } from 'lucide-react';
import type { AiModel, Profile } from '../lib/types';
import { errText } from '../lib/errors';
import { EGE_SUBJECTS_LIST } from '../lib/subjects';

export function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [meshVersion, setMeshVersion] = useState(0);
  const [newSubject, setNewSubject] = useState('');
  const [newSubjectScore, setNewSubjectScore] = useState('100');
  const [targetTrack, setTargetTrack] = useState<'BASE_65' | 'SOLID_85' | 'OLYMP_95'>('SOLID_85');
  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [telegramBotUser, setTelegramBotUser] = useState<string>('ege_system_bot');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { addToast } = useToastStore();
  const { user } = useAuthStore();

  useEffect(() => {
    loadProfile();
    loadModels();
  }, []);

  const loadProfile = async () => {
    try {
      const result = await api.getProfile();
      setProfile(result);
      if (result.targetTrack) {
        setTargetTrack(result.targetTrack as any);
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const result = await api.getModels();
      setModels(result.models);
    } catch (error) {
      console.error('Failed to load models', error);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    try {
      await api.updateProfile({ ...profile, targetTrack, selectedAiModel: profile.selectedAiModel });
      if (profile.selectedAiModel) {
        await api.selectModel(profile.selectedAiModel).catch(() => null);
      }
      addToast('success', 'Профиль и стратегия обновлены');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения');
    }
  };

  const handleSelectTrack = async (track: 'BASE_65' | 'SOLID_85' | 'OLYMP_95') => {
    setTargetTrack(track);
    try {
      await api.updateProfile({ targetTrack: track });
      addToast('success', `Стратегия обновлена: ${track}`);
    } catch {
      addToast('error', 'Не удалось сохранить стратегию');
    }
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      addToast('info', 'Генерация официального отчета за месяц (PDF)...');
      const html = await api.getMonthlyReportHtml();
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
      } else {
        addToast('error', 'Всплывающие окна заблокированы браузером');
      }
    } catch {
      addToast('error', 'Ошибка экспорта отчета');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleGenerateTelegramToken = async () => {
    setIsGeneratingToken(true);
    try {
      const res = await api.generateTelegramToken('parent');
      setTelegramToken(res.token);
      setTelegramBotUser(res.botUsername);
      addToast('success', 'Токен связки Telegram получен!');
    } catch {
      addToast('error', 'Ошибка генерации токена');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleSimulateDigest = async () => {
    try {
      await api.simulateTelegramDigest();
      addToast('success', 'Еженедельный дайджест родителю успешно скомпилирован!');
    } catch {
      addToast('error', 'Ошибка симуляции дайджеста');
    }
  };

  const handleSimulateAlert = async () => {
    try {
      await api.simulateTelegramAlert('test_score_drop');
      addToast('info', 'Тестовый родительский алерт о проседании баллов сформирован!');
    } catch {
      addToast('error', 'Ошибка отправки алерта');
    }
  };

  // Смена класса из шапки: сразу в БД + мгновенно в сайдбар (без перезагрузки)
  const changeGrade = async (grade: number) => {
    if (!profile || grade === profile.grade) return;
    const prev = profile.grade;
    setProfile({ ...profile, grade });
    try {
      await api.updateProfile({ grade });
      window.dispatchEvent(
        new CustomEvent('profile-grade-updated', { detail: { grade } })
      );
      addToast('success', `Класс обновлён: ${grade}`);
    } catch (error) {
      setProfile({ ...profile, grade: prev });
      addToast('error', errText(error) || 'Ошибка сохранения класса');
    }
  };

  const clampScore = (value: string): number => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  };

  const availableSubjects = profile
    ? EGE_SUBJECTS_LIST.filter(
        (sub) =>
          !profile.targetSubjects.some(
            (t) =>
              t.subjectName.toLowerCase() === sub.name.toLowerCase() ||
              t.subjectName.toLowerCase() === sub.id.toLowerCase()
          )
      )
    : [];

  const addSubject = async () => {
    if (!profile || !newSubject) return;
    const updated = {
      ...profile,
      targetSubjects: [
        ...profile.targetSubjects,
        { subjectName: newSubject, targetScore: clampScore(newSubjectScore) },
      ],
    };
    setProfile(updated);
    setNewSubject('');
    setNewSubjectScore('100');
    try {
      await api.updateProfile(updated);
      addToast('success', `Предмет «${newSubject}» добавлен`);
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка сохранения предмета');
    }
  };

  const removeSubject = async (name: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      targetSubjects: profile.targetSubjects.filter((t) => t.subjectName !== name),
    };
    setProfile(updated);
    try {
      await api.updateProfile(updated);
      addToast('info', `Предмет «${name}» удален`);
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка удаления предмета');
    }
  };

  const changeTargetScore = (name: string, value: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      targetSubjects: profile.targetSubjects.map((t) =>
        t.subjectName === name ? { ...t, targetScore: clampScore(value) } : t
      ),
    });
  };

  if (loading) return <LoadingPage />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ ПРОФИЛЬ УЧЕНИКА ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            PROFILE
          </h1>
        </div>
        <div className="flex items-center gap-4 bg-white/[0.02] border border-white/10 px-4 py-2.5">
          <div>
            <span className="font-mono text-[10px] text-zinc-500 uppercase block">Уровень ученика</span>
            <span className="font-mono text-sm text-[#d4ff00] font-bold">
              LVL {profile.level ?? user?.level ?? 1}
            </span>
          </div>
          <div className="h-7 w-[1px] bg-white/10" />
          <div>
            <span className="font-mono text-[10px] text-zinc-500 uppercase block">Накопленный опыт</span>
            <span className="font-mono text-sm text-white font-bold">
              {profile.xp ?? user?.xp ?? 0} <span className="text-xs text-[#d4ff00]">XP</span>
            </span>
          </div>
        </div>
      </div>

        {/* МЭШ: плашка подключения (когда не подключено) или карточка
            подключённого профиля с отвязкой. key — перечитать статус
            после отвязки/подключения. */}
        <MeshConnectBanner key={`mesh-banner-${meshVersion}`} />
        <MeshConnectedCard
          key={`mesh-card-${meshVersion}`}
          onUnlinked={() => setMeshVersion((v) => v + 1)}
        />

        {/* Подготовка на основе данных из МЭШ */}
        <div className="card-shelf mb-4 p-4 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="hud-tag !text-[9px]">[ CONFIG // MESH PREPARATION ]</span>
              <span className="px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-[9px] uppercase font-bold tracking-wider rounded-none">
                НЕ РЕКОМЕНДУЕТСЯ
              </span>
              <span
                className={`font-mono text-[9px] font-bold px-1.5 py-0.5 border uppercase ${
                  profile.meshIntegrationEnabled
                    ? 'border-[#d4ff00]/40 text-[#d4ff00] bg-[#d4ff00]/10'
                    : 'border-white/10 text-zinc-400 bg-white/[0.02]'
                }`}
              >
                {profile.meshIntegrationEnabled ? 'АКТИВНА' : 'ВЫКЛЮЧЕНА (СТРОГИЙ КИМ)'}
              </span>
            </div>
            <h3 className="font-display text-sm font-bold uppercase text-white">
              Подготовка на основе данных из МЭШ
            </h3>
            <p className="text-xs text-zinc-400">
              {profile.meshIntegrationEnabled
                ? 'Оценки, темы и расписание МЭШ влияют на ИИ-чат, слабые темы и предикторы балла.'
                : 'Подготовка изолирована от школьных отметок и идет строго по стандарту КИМ ФИПИ.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings?tab=mesh_prep')}
            className="btn-ghost !text-[11px] !py-2 !px-4 font-mono uppercase tracking-wider text-[#d4ff00] border-[#d4ff00]/40 hover:bg-[#d4ff00]/10 whitespace-nowrap"
          >
            [ НАСТРОЙКА ФУНКЦИЙ → ]
          </button>
        </div>

        {/* User Info */}
        <div className="card-shelf mb-4 p-6">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex h-16 w-16 items-center justify-center bg-[#d4ff00] font-display text-2xl font-extrabold text-black">
              <User className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold tracking-tight text-white">{user?.name}</h2>
              <p className="text-sm font-light text-zinc-400">{user?.email}</p>
              {user?.isDemo && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs rounded-none">
                    DEMO
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {[9, 10, 11].map((g) => (
                <button
                  key={g}
                  onClick={() => void changeGrade(g)}
                  title={`${g} класс`}
                  className={`px-3 py-2 font-mono text-xs tracking-[0.15em] transition-colors border ${
                    profile.grade === g
                      ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.10] text-[#d4ff00] font-semibold'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
                  }`}
                >
                  {g}
                </button>
              ))}
              <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                класс
              </span>
            </div>
          </div>
        </div>

        {/* Unified Strategy & Target Subjects */}
        <div className="card-shelf mb-4 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-[#d4ff00]" />
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Стратегия подготовки и целевые баллы (КИМ-2027)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 font-sans mb-4 leading-relaxed">
            Выберите генеральный трек и настройте индивидуальные целевые баллы по каждому предмету. Симулятор, предикторы и матрица кодификатора синхронизируются с этой стратегией.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <button
              type="button"
              onClick={() => handleSelectTrack('BASE_65')}
              className={`p-4 border text-left transition-all rounded-none ${
                targetTrack === 'BASE_65'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                  : 'border-white/10 bg-zinc-950/40 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#d4ff00]">
                ТРЕК 1
              </div>
              <div className="font-display text-sm font-bold uppercase text-white mt-1">
                [ БАЗА: 60–70 БАЛЛОВ ]
              </div>
              <p className="font-sans text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Фокус на 100% Части 1 (задания 1–13) без перегрузки сложнейшими задачами Части 2.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTrack('SOLID_85')}
              className={`p-4 border text-left transition-all rounded-none ${
                targetTrack === 'SOLID_85'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                  : 'border-white/10 bg-zinc-950/40 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#d4ff00]">
                ТРЕК 2 (РЕКОМЕНДУЕМЫЙ)
              </div>
              <div className="font-display text-sm font-bold uppercase text-white mt-1">
                [ УВЕРЕННЫЕ: 75–85 БАЛЛОВ ]
              </div>
              <p className="font-sans text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Часть 1 + джентльменский набор Части 2: уравнения №14, неравенства №15, экономика №16.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTrack('OLYMP_95')}
              className={`p-4 border text-left transition-all rounded-none ${
                targetTrack === 'OLYMP_95'
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-white'
                  : 'border-white/10 bg-zinc-950/40 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#d4ff00]">
                ТРЕК 3
              </div>
              <div className="font-display text-sm font-bold uppercase text-white mt-1">
                [ ФОКУС: 90+ И ОЛИМПИАДЫ ]
              </div>
              <p className="font-sans text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Полный спектр КИМ: сложная стереометрия №17, параметры №18, теория чисел №19.
              </p>
            </button>
          </div>

          <div className="border-t border-white/[0.08] pt-5">
            <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-300 mb-3">
              [ ЦЕЛЕВЫЕ ПРЕДМЕТЫ И БАЛЛЫ ]
            </h4>
            <div className="space-y-3 mb-4">
              {profile.targetSubjects.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Предметы не выбраны — добавьте их ниже
                </p>
              )}
              {profile.targetSubjects.map((subject) => (
                <div
                  key={subject.subjectName}
                  className="flex items-center gap-3 rounded-none border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-200">{subject.subjectName}</div>
                    {subject.currentEstimatedScore ? (
                      <div className="text-sm text-zinc-400">
                        Текущий расчетный: {subject.currentEstimatedScore}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-500" htmlFor={`target-${subject.subjectName}`}>
                      Цель
                    </label>
                    <input
                      id={`target-${subject.subjectName}`}
                      type="number"
                      min={0}
                      max={100}
                      value={subject.targetScore}
                      onChange={(e) => changeTargetScore(subject.subjectName, e.target.value)}
                      className="field w-20 !px-2 !py-1.5 text-right font-mono text-[#d4ff00]"
                    />
                  </div>
                  <button
                    onClick={() => removeSubject(subject.subjectName)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                    title="Убрать предмет"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-white/[0.06]">
              <div className="flex-1 min-w-[200px]">
                <label className="field-label" htmlFor="new-subject">
                  Предмет
                </label>
                <CustomSelect
                  value={newSubject}
                  onChange={(v) => setNewSubject(v)}
                  placeholder="Выберите предмет..."
                  options={availableSubjects.map((sub) => ({
                    value: sub.name,
                    label: `${sub.icon} ${sub.name}`,
                  }))}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="new-subject-score">
                  Целевой балл
                </label>
                <input
                  id="new-subject-score"
                  type="number"
                  min={0}
                  max={100}
                  value={newSubjectScore}
                  onChange={(e) => setNewSubjectScore(e.target.value)}
                  className="field w-24"
                />
              </div>
              <button
                onClick={addSubject}
                disabled={!newSubject}
                className="btn-lime text-sm"
              >
                <Plus className="w-4 h-4" />
                Добавить
              </button>
            </div>
          </div>
        </div>

        {/* Telegram Notifications */}
        <div className="card-shelf mb-4 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-[#d4ff00]" />
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Telegram-уведомления родителям и ученику
            </h3>
          </div>
          <p className="text-xs text-zinc-400 font-sans mb-4 leading-relaxed">
            Подключите бота в Telegram для получения регулярных еженедельных дайджестов прогресса и экстренных алертов при проседании оценок или пропуске дедлайнов.
          </p>

          <div className="border border-white/10 bg-zinc-950/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 block">
                  СТАТУС ИНТЕГРАЦИИ:
                </span>
                <span className="font-mono text-xs text-[#d4ff00]">
                  {telegramToken ? 'ТОКЕН СГЕНЕРИРОВАН' : 'БОТ ГОТОВ К ПОДКЛЮЧЕНИЮ'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleGenerateTelegramToken}
                disabled={isGeneratingToken}
                className="rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 hover:shadow-glow transition-all"
              >
                {isGeneratingToken ? 'ГЕНЕРАЦИЯ...' : '[ ПОЛУЧИТЬ КОД ПРИВЯЗКИ ТЕЛЕГРАМ ]'}
              </button>
            </div>

            {telegramToken && (
              <div className="border border-[#d4ff00]/30 bg-[#d4ff00]/[0.05] p-3 space-y-2">
                <span className="font-mono text-[11px] text-zinc-300 block">
                  1. Откройте в Telegram: <strong>@{telegramBotUser}</strong>
                </span>
                <span className="font-mono text-[11px] text-zinc-300 block">
                  2. Отправьте боту команду:
                </span>
                <div className="flex items-center justify-between bg-zinc-900 p-2 font-mono text-xs text-[#d4ff00]">
                  <span>/start {telegramToken}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`/start ${telegramToken}`);
                      addToast('success', 'Команда скопирована');
                    }}
                    className="text-white hover:underline text-[10px] uppercase"
                  >
                    Скопировать
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleSimulateDigest}
                className="rounded-none border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:border-[#d4ff00] hover:text-[#d4ff00]"
              >
                [ ТЕСТОВЫЙ ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ]
              </button>
              <button
                type="button"
                onClick={handleSimulateAlert}
                className="rounded-none border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:border-amber-400 hover:text-amber-400"
              >
                [ ТЕСТОВЫЙ АЛЕРТ О ПРОСЕДАНИИ ]
              </button>
            </div>
          </div>
        </div>

        {/* Official Monthly PDF Report */}
        <div className="card-shelf mb-4 p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#d4ff00]" />
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
                  Официальный отчет подготовки за месяц (PDF)
                </h3>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-1">
                Генерирует сводный методический документ для родителей и репетитора: динамика баллов, закрытые пробелы, чистое время решения.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="rounded-none border border-white/20 bg-zinc-950/60 px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00] transition-all"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {isExportingPdf ? 'ГЕНЕРАЦИЯ...' : '[ СКАЧАТЬ ДЕТАЛЬНЫЙ ОТЧЕТ ЗА МЕСЯЦ (PDF) ]'}
              </span>
            </button>
          </div>
        </div>

        {/* AI Model Selection */}
        <div className="card-shelf mb-4 p-6">
          <h3 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-white">Модель AI</h3>
          <CustomSelect
            value={
              models.find(
                (m) =>
                  m.slug === profile.selectedAiModel ||
                  m.slug.replace(/:online$/, '') === profile.selectedAiModel?.replace(/:online$/, '')
              )?.slug || profile.selectedAiModel
            }
            onChange={async (v) => {
              setProfile({ ...profile, selectedAiModel: v });
              try {
                await api.selectModel(v);
                addToast('success', 'Модель AI обновлена');
              } catch (error) {
                addToast('error', errText(error) || 'Не удалось сохранить модель AI');
              }
            }}
            placeholder="Выберите модель..."
            options={[
              ...(models.length > 0 &&
              profile.selectedAiModel &&
              !models.some(
                (m) =>
                  m.slug === profile.selectedAiModel ||
                  m.slug.replace(/:online$/, '') === profile.selectedAiModel?.replace(/:online$/, '')
              )
                ? [{ value: profile.selectedAiModel, label: profile.selectedAiModel }]
                : []),
              ...models.map((model) => ({
                value: model.slug,
                label: `${model.label}${model.recommended ? ' [РЕКОМЕНДУЕТСЯ]' : ''}`,
              })),
            ]}
          />
        </div>

        {/* Preparation Schedule */}
        <div className="card-shelf mb-4 p-6">
          <h3 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-white">
            График подготовки
          </h3>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="field-label">
                Начало подготовки
              </label>
              <input
                type="date"
                value={profile.prepStartDate.split('T')[0]}
                onChange={(e) =>
                  setProfile({ ...profile, prepStartDate: e.target.value })
                }
                className="field"
              />
            </div>
            <div>
              <label className="field-label">
                Дата экзамена
              </label>
              <input
                type="date"
                value={profile.prepEndDate?.split('T')[0] || ''}
                onChange={(e) =>
                  setProfile({ ...profile, prepEndDate: e.target.value })
                }
                className="field"
              />
            </div>
          </div>

          {profile.remainingDays !== undefined && (
            <div className="flex items-center gap-2 mb-4 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              <span>
                Осталось {profile.remainingDays} дней ({profile.remainingWeeks} недель)
              </span>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">
                Темп
              </label>
              <CustomSelect
                value={profile.pace}
                onChange={(v) => setProfile({ ...profile, pace: v })}
                options={[
                  { value: 'moderate', label: 'Умеренный' },
                  { value: 'intensive', label: 'Интенсивный' },
                ]}
              />
            </div>
            <div>
              <label className="field-label">
                Часов в будни
              </label>
              <input
                type="number"
                step="0.5"
                value={profile.weekdayStudyHours}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    weekdayStudyHours: parseFloat(e.target.value),
                  })
                }
                className="field"
              />
            </div>
            <div>
              <label className="field-label">
                Часов в выходные
              </label>
              <input
                type="number"
                step="0.5"
                value={profile.weekendStudyHours}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    weekendStudyHours: parseFloat(e.target.value),
                  })
                }
                className="field"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card-shelf mb-4 p-6">
          <h3 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-white">Заметки</h3>
          <textarea
            value={profile.notes || ''}
            onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
            className="field h-32 resize-none"
            placeholder="Дополнительная информация, особенности подготовки..."
          />
        </div>

        <button
          onClick={handleSave}
          className="btn-lime w-full text-sm"
        >
          Сохранить изменения
        </button>
    </div>
  );
}
