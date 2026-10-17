import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { CustomSelect } from '../components/ui/CustomSelect';
import { MeshConnectBanner } from '../components/MeshConnectBanner';
import { MeshConnectedCard } from '../components/MeshConnectedCard';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { hudConfirm } from '../store/confirmStore';
import { PRESET_AVATARS, type PresetAvatar } from '../lib/presetAvatars';
import { User, Calendar, Plus, Trash2, FileText, Shield, Zap, Camera, Sparkles, Upload, Check } from 'lucide-react';
import type { AiModel, Profile } from '../lib/types';
import { errText } from '../lib/errors';
import { EGE_SUBJECTS_LIST } from '../lib/subjects';
import { calculateClientLevelTelemetry } from '../lib/gamification';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisScript: Promise<void> | null = null;

function loadGoogleSdk(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (!gisScript) {
    gisScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisScript = null;
        reject(new Error('Не удалось загрузить Google Sign-In SDK'));
      };
      document.head.appendChild(script);
    });
  }
  return gisScript;
}

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
  const [telegramStatus, setTelegramStatus] = useState<{
    linked: boolean;
    botUsername: string;
    chatId?: string | null;
  } | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Email linking state (OTP flow)
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [emailStep, setEmailStep] = useState<'input' | 'code'>('input');
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDevCode, setEmailDevCode] = useState<string | null>(null);

  const { addToast } = useToastStore();
  const { user } = useAuthStore();

  // Никнейм и Аватар
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showPresetAvatars, setShowPresetAvatars] = useState(false);
  const [customAvatarUrlInput, setCustomAvatarUrlInput] = useState('');
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProfile();
    loadModels();
    loadTelegramStatus();
  }, []);

  const loadProfile = async () => {
    try {
      const result = await api.getProfile();
      setProfile(result);
      if (result.name) {
        setNameInput(result.name);
      }
      if (result.targetTrack) {
        setTargetTrack(result.targetTrack as any);
      }
      if (result.email || result.name || result.avatarUrl !== undefined) {
        useAuthStore.getState().updateUser({
          email: result.email,
          name: result.name || user?.name,
          avatarUrl: result.avatarUrl,
          telegramId: result.telegramId,
          telegramUsername: result.telegramUsername,
        });
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  const loadTelegramStatus = async () => {
    try {
      const res = await api.getTelegramStatus();
      setTelegramStatus({
        linked: res.linked,
        botUsername: res.botUsername || telegramBotUser,
        chatId: res.link?.chatId || null,
      });
      if (res.botUsername) {
        setTelegramBotUser(res.botUsername);
      }
      if (res.telegramId || res.telegramUsername) {
        useAuthStore.getState().updateUser({
          telegramId: res.telegramId,
          telegramUsername: res.telegramUsername,
        });
      }
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const isAlreadyLinked = Boolean(
      telegramStatus?.linked ||
      profile?.telegramId ||
      user?.telegramId ||
      profile?.telegramUsername ||
      user?.telegramUsername
    );
    if (telegramToken && !isAlreadyLinked) {
      interval = setInterval(async () => {
        try {
          const res = await api.getTelegramStatus();
          if (res.linked) {
            setTelegramStatus({
              linked: true,
              botUsername: res.botUsername || telegramBotUser,
              chatId: res.link?.chatId || null,
            });
            setTelegramToken(null);
            addToast('success', 'Telegram-бот успешно привязан!');
            await loadProfile();
          }
        } catch { }
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [telegramToken, telegramStatus?.linked, profile?.telegramId]);

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

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      addToast('error', 'Позывной не может быть пустым');
      return;
    }
    if (trimmed.length > 50) {
      addToast('error', 'Слишком длинное имя (максимум 50 символов)');
      return;
    }
    setIsSavingName(true);
    try {
      await api.updateProfile({ name: trimmed });
      useAuthStore.getState().updateUser({ name: trimmed });
      setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
      addToast('success', `Позывной сохранён: ${trimmed}`);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка обновления позывного');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('error', 'Пожалуйста, выберите изображение (PNG, JPG, SVG, WEBP, GIF)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast('error', 'Размер файла превышает 5 МБ');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const res = await api.uploadAvatar(file);
      setProfile((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl } : prev));
      useAuthStore.getState().updateUser({ avatarUrl: res.avatarUrl });
      addToast('success', 'Аватар успешно загружен и сохранён');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка загрузки аватара');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarFileInputRef.current) {
        avatarFileInputRef.current.value = '';
      }
    }
  };

  const handleSelectPresetAvatar = async (preset: PresetAvatar) => {
    setIsUploadingAvatar(true);
    try {
      await api.updateProfile({ avatarUrl: preset.dataUrl });
      useAuthStore.getState().updateUser({ avatarUrl: preset.dataUrl });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: preset.dataUrl } : prev));
      addToast('success', `Установлен аватар: ${preset.name}`);
      setShowPresetAvatars(false);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сохранения аватара');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleApplyCustomUrlAvatar = async () => {
    const url = customAvatarUrlInput.trim();
    if (!url) {
      addToast('error', 'Укажите ссылку на изображение');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
      addToast('error', 'Ссылка должна начинаться с https:// или data:');
      return;
    }
    setIsUploadingAvatar(true);
    try {
      await api.updateProfile({ avatarUrl: url });
      useAuthStore.getState().updateUser({ avatarUrl: url });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
      setCustomAvatarUrlInput('');
      addToast('success', 'Аватар по ссылке успешно установлен');
      setShowPresetAvatars(false);
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка применения аватара');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleResetAvatar = async () => {
    const ok = await hudConfirm({
      title: 'СБРОС АВАТАРА',
      message: 'Вы действительно хотите удалить текущий аватар и вернуться к стандартному инициалу?',
      confirmText: '[ СБРОСИТЬ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteAvatar();
      useAuthStore.getState().updateUser({ avatarUrl: null });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      addToast('info', 'Аватар сброшен');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка сброса аватара');
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

  const [telegramLinkUrl, setTelegramLinkUrl] = useState<string | null>(null);

  const handleGenerateTelegramToken = async () => {
    setIsGeneratingToken(true);
    try {
      const res = await api.generateTelegramToken('parent');
      setTelegramToken(res.token);
      setTelegramBotUser(res.botUsername);
      setTelegramLinkUrl(res.linkUrl || `https://t.me/${res.botUsername}?start=link_${res.token}`);
      addToast('success', 'Токен связки Telegram получен!');
    } catch {
      addToast('error', 'Ошибка генерации токена');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleSimulateDigest = async () => {
    try {
      const res = await api.simulateTelegramDigest();
      if (res.delivered) {
        addToast('success', `Еженедельный дайджест отправлен в Telegram (чат: ${res.sentTo})!`);
      } else {
        addToast('info', 'Дайджест скомпилирован. Подключите бота для получения сообщений в Telegram.');
      }
    } catch {
      addToast('error', 'Ошибка симуляции дайджеста');
    }
  };

  const handleSimulateAlert = async () => {
    try {
      const res = await api.simulateTelegramAlert('test_score_drop');
      if (res.delivered) {
        addToast('success', `Тестовый алерт отправлен в Telegram (чат: ${res.sentTo})!`);
      } else {
        addToast('info', 'Тестовый алерт сформирован. Подключите бота для получения сообщений в Telegram.');
      }
    } catch {
      addToast('error', 'Ошибка отправки алерта');
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (emailCooldown > 0) {
      timer = setInterval(() => {
        setEmailCooldown((prev) => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [emailCooldown]);

  const handleRequestEmailCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      addToast('error', 'Введите корректный email адрес');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await api.requestEmailLinkCode(cleanEmail);
      setEmailStep('code');
      setEmailCooldown(res.cooldownSeconds || 60);
      if (res.devCode) {
        setEmailDevCode(res.devCode);
      } else {
        setEmailDevCode(null);
      }
      addToast('success', res.message || 'Код подтверждения отправлен на почту!');
    } catch (err) {
      addToast('error', errText(err) || 'Не удалось отправить код подтверждения');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanCode = emailCodeInput.trim();
    if (cleanCode.length !== 6) {
      addToast('error', 'Код подтверждения должен состоять из 6 цифр');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await api.verifyEmailLinkCode(cleanEmail, cleanCode);
      addToast('success', res.message || 'Email успешно привязан к аккаунту!');
      setProfile((prev) => (prev ? { ...prev, email: res.email } : prev));
      useAuthStore.getState().updateUser({ email: res.email });
      setIsLinkingEmail(false);
      setEmailStep('input');
      setEmailCodeInput('');
      setEmailInput('');
      setEmailDevCode(null);
    } catch (err) {
      addToast('error', errText(err) || 'Неверный код подтверждения');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleResendEmailCode = async () => {
    if (emailCooldown > 0 || emailLoading) return;
    const cleanEmail = emailInput.trim().toLowerCase();
    setEmailLoading(true);
    try {
      const res = await api.resendEmailLinkCode(cleanEmail);
      setEmailCooldown(res.cooldownSeconds || 60);
      if (res.devCode) {
        setEmailDevCode(res.devCode);
      }
      addToast('success', res.message || 'Новый код подтверждения отправлен');
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка отправки кода');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLinkGoogle = async (credential: string) => {
    try {
      const res = await api.linkGoogle(credential);
      setProfile((prev) => (prev ? { ...prev, googleId: res.user?.googleId || 'linked' } : prev));
      addToast('success', 'Google-аккаунт успешно привязан!');
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка привязки Google');
    }
  };

  const handleUnlinkGoogle = async () => {
    setIsUnlinkingGoogle(true);
    try {
      await api.unlinkGoogle();
      setProfile((prev) => (prev ? { ...prev, googleId: null } : prev));
      addToast('info', 'Google-аккаунт отвязан');
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка отвязки Google');
    } finally {
      setIsUnlinkingGoogle(false);
    }
  };


  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || profile?.googleId) return;

    let cancelled = false;
    loadGoogleSdk()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (response.credential) {
              await handleLinkGoogle(response.credential);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          locale: 'ru',
        });
      })
      .catch((err) => console.warn('GIS error:', err));

    return () => {
      cancelled = true;
      if (googleButtonRef.current) googleButtonRef.current.innerHTML = '';
    };
  }, [profile?.googleId]);

  const handleConfirmDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await api.deleteAccount();
      useAuthStore.getState().logout();
      addToast('info', 'Ваш аккаунт и все данные успешно удалены');
      navigate('/');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка при удалении аккаунта');
      setIsDeletingAccount(false);
    }
  };

  // Смена класса из шапки: сразу в БД + мгновенно в сайдбар (без перезагрузки)
  const changeGrade = async (grade: number) => {
    if (!profile || grade === profile.grade) return;
    const prev = profile.grade;
    setProfile({ ...profile, grade });
    useAuthStore.getState().updateUserGrade(grade);
    try {
      await api.updateProfile({ grade });
      window.dispatchEvent(
        new CustomEvent('profile-grade-updated', { detail: { grade } })
      );
      addToast('success', `Класс обновлён: ${grade}`);
    } catch (error) {
      setProfile({ ...profile, grade: prev });
      useAuthStore.getState().updateUserGrade(prev);
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

  const effectiveXp = profile.xp ?? user?.xp ?? 0;
  const effectiveLevel = profile.level ?? user?.level ?? 1;
  const lvlTelemetry = calculateClientLevelTelemetry(effectiveXp, effectiveLevel);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-tag mb-3">[ ПРОФИЛЬ УЧЕНИКА ]</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            PROFILE
          </h1>
        </div>
        <div className="flex flex-col gap-2 bg-white/[0.02] border border-white/10 px-4 py-2.5 min-w-[260px]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Уровень ученика</span>
              <span className="font-mono text-sm text-[#d4ff00] font-bold">
                LVL {lvlTelemetry.level} // {lvlTelemetry.status}
              </span>
            </div>
            <div className="h-7 w-[1px] bg-white/10" />
            <div className="text-right">
              <span className="font-mono text-[10px] text-zinc-500 uppercase block">Опыт ({lvlTelemetry.currentLevelXp}/{lvlTelemetry.xpRequiredForLevel} XP)</span>
              <span className="font-mono text-sm text-white font-bold">
                {lvlTelemetry.xp} <span className="text-xs text-[#d4ff00]">XP</span>
              </span>
            </div>
          </div>
          {/* Прогресс-бар текущего уровня */}
          <div className="w-full bg-zinc-900 border border-white/10 h-2 overflow-hidden" role="progressbar" aria-valuenow={lvlTelemetry.levelProgressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="bg-[#d4ff00] h-full transition-all duration-300"
              style={{ width: `${lvlTelemetry.levelProgressPercent}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[9px] text-zinc-500">
            <span>ДО СЛЕДУЮЩЕГО РАНГА: {lvlTelemetry.xpToNextLevel} XP</span>
            <span className="text-[#d4ff00] font-bold">{lvlTelemetry.levelProgressPercent}%</span>
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
              className={`font-mono text-[9px] font-bold px-1.5 py-0.5 border uppercase ${profile.meshIntegrationEnabled
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

      {/* [ IDENTITY // ПЕРСОНАЛИЗАЦИЯ ПРОФИЛЯ ] */}
      <div className="card-shelf mb-4 p-6 relative overflow-hidden border border-white/10">
        <div className="flex items-center justify-between gap-4 mb-5 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#d4ff00]" />
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Идентификация // Ник и аватар
            </h3>
          </div>
          <span className="hud-tag !text-[9px]">[ IDENTITY & AVATAR PROTOCOL ]</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Слева: аватар, загрузка и быстрое управление */}
          <div className="md:col-span-4 flex flex-col items-center sm:items-start text-center sm:text-left gap-3">
            <div className="relative group">
              <div className="pointer-events-none absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-[#d4ff00]" />
              <div className="pointer-events-none absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-[#d4ff00]" />
              <div className="pointer-events-none absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-[#d4ff00]" />
              <div className="pointer-events-none absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-[#d4ff00]" />

              {/* Отображение аватара */}
              {user?.avatarUrl || profile.avatarUrl ? (
                <img
                  src={user?.avatarUrl || profile.avatarUrl || ''}
                  alt={user?.name || 'Avatar'}
                  className="w-24 h-24 md:w-28 md:h-28 object-cover bg-zinc-950 border border-white/20 rounded-none shadow-md"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-24 h-24 md:w-28 md:h-28 bg-[#d4ff00] text-black font-display font-black text-4xl flex items-center justify-center rounded-none shadow-md">
                  {((nameInput || user?.name || 'U')[0] || 'U').toUpperCase()}
                </div>
              )}

              {/* Оверлей при наведении для быстрой смены */}
              <button
                type="button"
                onClick={() => avatarFileInputRef.current?.click()}
                title="Загрузить новое фото"
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[#d4ff00] font-mono text-[10px] uppercase font-bold"
              >
                <Camera className="w-5 h-5" />
                <span>ИЗМЕНИТЬ</span>
              </button>
            </div>

            {/* Скрытый input file */}
            <input
              type="file"
              ref={avatarFileInputRef}
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={handleAvatarFileUpload}
              className="hidden"
            />

            {/* Кнопки управления аватаром */}
            <div className="flex flex-wrap gap-2 w-full justify-center sm:justify-start pt-1">
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={() => avatarFileInputRef.current?.click()}
                className="btn-ghost !text-[10px] !py-1.5 !px-2.5 font-mono uppercase tracking-wider border-white/20 text-zinc-300 hover:text-white hover:border-[#d4ff00]/60 flex items-center gap-1.5 rounded-none"
              >
                <Upload className="w-3.5 h-3.5 text-[#d4ff00]" />
                <span>[ {isUploadingAvatar ? 'ЗАГРУЗКА...' : 'ЗАГРУЗИТЬ ФОТО'} ]</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPresetAvatars((v) => !v)}
                className={`btn-ghost !text-[10px] !py-1.5 !px-2.5 font-mono uppercase tracking-wider flex items-center gap-1.5 rounded-none transition-colors ${
                  showPresetAvatars
                    ? 'border-[#d4ff00] text-[#d4ff00] bg-[#d4ff00]/10'
                    : 'border-white/20 text-zinc-300 hover:text-white hover:border-[#d4ff00]/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#d4ff00]" />
                <span>[ КАТАЛОГ HUD ]</span>
              </button>

              {(user?.avatarUrl || profile.avatarUrl) && (
                <button
                  type="button"
                  onClick={handleResetAvatar}
                  className="btn-ghost !text-[10px] !py-1.5 !px-2.5 font-mono uppercase tracking-wider border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500 flex items-center gap-1.5 rounded-none"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>[ СБРОСИТЬ ]</span>
                </button>
              )}
            </div>
          </div>

          {/* Справа: редактирование ника, класс, статус */}
          <div className="md:col-span-8 space-y-4">
            <div>
              <label className="hud-tag block mb-1.5 text-zinc-400">
                ПОЗЫВНОЙ // НИКНЕЙМ УЧЕНИКА:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={nameInput}
                    maxLength={50}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveName();
                      }
                    }}
                    placeholder="Введите ваш ник..."
                    className="w-full rounded-none border border-white/20 bg-black/60 px-3.5 py-2.5 font-mono text-sm text-white placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none transition-colors"
                  />
                  <span className="absolute right-3 top-3 font-mono text-[10px] text-zinc-600">
                    {nameInput.length}/50
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isSavingName || !nameInput.trim() || nameInput.trim() === (user?.name || '')}
                  onClick={handleSaveName}
                  className="btn-lime !py-2.5 !px-5 text-xs font-mono font-bold uppercase tracking-wider rounded-none disabled:opacity-40 disabled:pointer-events-none transition-all shadow-none whitespace-nowrap"
                >
                  {isSavingName ? 'СОХРАНЕНИЕ...' : '[ СОХРАНИТЬ НИК ]'}
                </button>
              </div>
              <p className="font-mono text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                * Отображается в PvP Battleground, AI-Чате, Сайдбаре и официальных КИМ-отчетах.
              </p>
            </div>

            {/* Класс и метаданные аккаунта */}
            <div className="pt-2 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="hud-tag block mb-1.5 text-zinc-400">ТЕКУЩИЙ КЛАСС:</span>
                <div className="flex items-center gap-1.5">
                  {[9, 10, 11].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => void changeGrade(g)}
                      title={`${g} класс`}
                      className={`px-3 py-1.5 font-mono text-xs tracking-[0.15em] transition-colors border ${
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

              <div className="text-right">
                <span className="hud-tag block mb-1 text-zinc-500">EMAIL АККАУНТА:</span>
                <span className="font-mono text-xs text-zinc-300">{profile?.email || user?.email}</span>
                {user?.isDemo && (
                  <span className="ml-2 px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] font-mono rounded-none">
                    DEMO
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Разворачивающийся каталог тактических HUD-аватаров */}
        {showPresetAvatars && (
          <div className="mt-6 pt-5 border-t border-white/10 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4ff00]" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  КАТАЛОГ ТАКТИЧЕСКИХ HUD-АВАТАРОВ EGE.SYSTEM:
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetAvatars(false)}
                className="text-zinc-500 hover:text-white transition-colors text-xs font-mono"
              >
                [ СВЕРНУТЬ ✕ ]
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRESET_AVATARS.map((preset) => {
                const isSelected = (user?.avatarUrl || profile.avatarUrl) === preset.dataUrl;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPresetAvatar(preset)}
                    className={`group relative p-3 border text-left transition-all ${
                      isSelected
                        ? 'border-[#d4ff00] bg-[#d4ff00]/10 shadow-sm'
                        : 'border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="relative mb-2 aspect-square w-full overflow-hidden border border-white/10 bg-zinc-950 flex items-center justify-center">
                      <img
                        src={preset.dataUrl}
                        alt={preset.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-[#d4ff00] text-black p-0.5 font-bold">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-[10px] font-bold text-white truncate uppercase">
                      {preset.name}
                    </div>
                    <div className="font-mono text-[8px] text-[#d4ff00] tracking-wider uppercase mt-0.5">
                      {preset.badge}
                    </div>
                    <p className="text-[10px] text-zinc-400 font-sans line-clamp-2 mt-1 leading-snug">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Ввод ссылки на кастомное изображение */}
            <div className="p-3 bg-zinc-950/80 border border-white/10 space-y-2 mt-3">
              <label className="hud-tag block text-zinc-400">
                ИЛИ ВСТАВЬТЕ ССЫЛКУ НА ВНЕШНЕЕ ИЗОБРАЖЕНИЕ (URL):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAvatarUrlInput}
                  onChange={(e) => setCustomAvatarUrlInput(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="flex-1 rounded-none border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomUrlAvatar}
                  disabled={!customAvatarUrlInput.trim()}
                  className="rounded-none border border-white/20 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs uppercase text-zinc-300 hover:text-white hover:border-[#d4ff00] disabled:opacity-40"
                >
                  [ ПРИМЕНИТЬ ]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* [ ПРОКАЧКА // УРОВЕНЬ И ОПЫТ ] */}
      <div className="card-shelf mb-4 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#d4ff00]/60" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#d4ff00]/60" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#d4ff00]/60" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#d4ff00]/60" />

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#d4ff00]" />
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
              Прокачка // Уровень и опыт
            </h3>
          </div>
          <span className="hud-tag !text-[9px]">[ GAMIFICATION ENGINE ]</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Слева: крупный бейдж текущего уровня и динамический статус */}
          <div className="md:col-span-4 flex items-center gap-3">
            <div className="px-3.5 py-2 bg-[#d4ff00]/10 border border-[#d4ff00]/40 font-mono font-black text-xl md:text-2xl text-[#d4ff00] rounded-none tracking-tight whitespace-nowrap">
              LVL [ {lvlTelemetry.level} ]
            </div>
            <div>
              <span className="font-mono text-[10px] text-zinc-500 uppercase block tracking-wider">
                СТАТУС УЧЕНИКА
              </span>
              <span className="font-mono text-xs font-bold text-white tracking-widest uppercase">
                {lvlTelemetry.status}
              </span>
            </div>
          </div>

          {/* По центру: полоса прогресса уровня */}
          <div className="md:col-span-5 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-1.5 font-mono text-xs text-zinc-300">
              <span className="text-zinc-400">ПРОГРЕСС УРОВНЯ</span>
              <span className="text-white font-semibold">
                {lvlTelemetry.currentLevelXp} / {lvlTelemetry.xpRequiredForLevel} XP ({lvlTelemetry.levelProgressPercent}%)
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-none overflow-hidden">
              <div
                className="bg-[#d4ff00] h-full transition-all"
                style={{ width: `${lvlTelemetry.levelProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Справа счетчик */}
          <div className="md:col-span-3 flex md:justify-end">
            <div className="w-full md:w-auto px-3 py-2 bg-white/[0.02] border border-white/10 font-mono text-[11px] text-zinc-300 text-center tracking-wider">
              [ ДО СЛЕДУЮЩЕГО УРОВНЯ: ЕЩЕ {lvlTelemetry.xpToNextLevel} XP ]
            </div>
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
            className={`p-4 border text-left transition-all rounded-none ${targetTrack === 'BASE_65'
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
            className={`p-4 border text-left transition-all rounded-none ${targetTrack === 'SOLID_85'
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
            className={`p-4 border text-left transition-all rounded-none ${targetTrack === 'OLYMP_95'
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

      {/* Security & External Accounts */}
      <div className="card-shelf mb-4 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-[#d4ff00]" />
          <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
            Безопасность и привязка аккаунтов
          </h3>
        </div>
        <p className="text-xs text-zinc-400 font-sans mb-4 leading-relaxed">
          Управление контактным email, кодами подтверждения и авторизацией сторонних профилей.
        </p>

        <div className="space-y-4">
          {/* Email binding block with OTP confirmation */}
          <div className="border border-white/10 bg-zinc-950/60 p-4">
            {(() => {
              const currentEmail = profile.email || user?.email || '';
              const isTempTelegramEmail = currentEmail.endsWith('@telegram.ege.system');

              return (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">

                          <span className="font-mono text-xs uppercase tracking-wider text-zinc-200">
                            EMAIL АККАУНТА:
                          </span>
                        </div>
                        {isTempTelegramEmail ? (
                          <span className="border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                            [ ВРЕМЕННЫЙ EMAIL TELEGRAM ]
                          </span>
                        ) : (
                          <span className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#d4ff00] font-bold">
                            [ ПОДТВЕРЖДЕН ]
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-zinc-300 mt-1">
                        {currentEmail || 'Не указан'}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono mt-1">
                        {isTempTelegramEmail
                          ? 'Вы вошли через Telegram. Привяжите личный email для получения системных уведомлений и восстановления доступа.'
                          : 'Email используется для авторизации, восстановления пароля и отправки отчетов.'}
                      </p>
                    </div>

                    {!isLinkingEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLinkingEmail(true);
                          setEmailStep('input');
                          setEmailInput(isTempTelegramEmail ? '' : currentEmail);
                          setEmailCodeInput('');
                          setEmailDevCode(null);
                        }}
                        className={`shrink-0 rounded-none border px-4 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${isTempTelegramEmail
                            ? 'border-[#d4ff00] bg-[#d4ff00] text-black hover:brightness-110 shadow-none'
                            : 'border-white/20 bg-zinc-900 text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00]'
                          }`}
                      >
                        {isTempTelegramEmail ? '[ ПРИВЯЗАТЬ EMAIL ]' : '[ ИЗМЕНИТЬ EMAIL ]'}
                      </button>
                    )}
                  </div>

                  {/* Inline OTP verification form */}
                  {isLinkingEmail && (
                    <div className="mt-4 border border-[#d4ff00]/30 bg-[#d4ff00]/[0.03] p-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="font-mono text-xs uppercase tracking-wider text-[#d4ff00] font-bold">
                          {emailStep === 'input'
                            ? '// ШАГ 1: ВВЕДИТЕ НОВЫЙ EMAIL ДЛЯ ПРИВЯЗКИ'
                            : '// ШАГ 2: ВВЕДИТЕ 6-ЗНАЧНЫЙ КОД ПОДТВЕРЖДЕНИЯ'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsLinkingEmail(false);
                            setEmailStep('input');
                            setEmailCodeInput('');
                            setEmailDevCode(null);
                          }}
                          className="font-mono text-[11px] text-zinc-500 hover:text-white uppercase"
                        >
                          [ Отмена ]
                        </button>
                      </div>

                      {emailStep === 'input' ? (
                        <form onSubmit={handleRequestEmailCode} className="space-y-3">
                          <label className="font-mono text-[11px] text-zinc-400 block">
                            На указанный адрес будет отправлен 6-значный проверочный код:
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="email"
                              required
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              placeholder="student@example.com"
                              className="field flex-1 font-mono text-sm"
                              disabled={emailLoading}
                              autoFocus
                            />
                            <button
                              type="submit"
                              disabled={emailLoading || !emailInput.trim()}
                              className="rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-50"
                            >
                              {emailLoading ? 'ОТПРАВКА...' : '[ ПОЛУЧИТЬ КОД ]'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyEmailCode} className="space-y-3">
                          <div className="font-mono text-xs text-zinc-300">
                            Код подтверждения отправлен на <span className="text-[#d4ff00] font-bold">{emailInput}</span>.
                          </div>

                          {emailDevCode && (
                            <div className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 p-2.5 font-mono text-xs text-[#d4ff00]">
                              [DEV OTP CODE]: <strong className="tracking-widest ml-1">{emailDevCode}</strong>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              required
                              value={emailCodeInput}
                              onChange={(e) => setEmailCodeInput(e.target.value.replace(/\D/g, ''))}
                              placeholder="000000"
                              className="field w-full sm:w-44 text-center font-mono text-lg tracking-[0.3em] font-bold text-[#d4ff00]"
                              disabled={emailLoading}
                              autoFocus
                            />
                            <button
                              type="submit"
                              disabled={emailLoading || emailCodeInput.length !== 6}
                              className="rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-50"
                            >
                              {emailLoading ? 'ПРОВЕРКА...' : '[ ПОДТВЕРДИТЬ И ПРИВЯЗАТЬ ]'}
                            </button>
                            <button
                              type="button"
                              onClick={handleResendEmailCode}
                              disabled={emailCooldown > 0 || emailLoading}
                              className="rounded-none border border-white/20 bg-zinc-900 px-3 py-2 font-mono text-xs uppercase text-zinc-300 hover:text-white disabled:opacity-40"
                            >
                              {emailCooldown > 0 ? `ПОВТОР ЧЕРЕЗ ${emailCooldown}С` : '[ ОТПРАВИТЬ СНОВА ]'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEmailStep('input');
                                setEmailCodeInput('');
                                setEmailDevCode(null);
                              }}
                              className="text-zinc-500 hover:text-zinc-300 font-mono text-xs underline px-2 py-1"
                            >
                              Сменить адрес
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Telegram account link & telemetry */}
          <div className="border border-white/10 bg-zinc-950/60 p-4">
            {(() => {
              const isTgLinked = Boolean(
                telegramStatus?.linked ||
                profile?.telegramId ||
                user?.telegramId ||
                profile?.telegramUsername ||
                user?.telegramUsername
              );
              const effectiveTgUsername = profile?.telegramUsername || user?.telegramUsername;

              return (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-wider text-zinc-200">
                          TELEGRAM СИНХРОНИЗАЦИЯ:
                        </span>
                        {isTgLinked ? (
                          <span className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#d4ff00] font-bold">
                            [ TELEGRAM: ПРИВЯЗАН ]
                          </span>
                        ) : (
                          <span className="border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                            [ НЕ ПРИВЯЗАН ]
                          </span>
                        )}
                        {isTgLinked && effectiveTgUsername && (
                          <span className="font-mono text-xs text-zinc-300">
                            @{effectiveTgUsername}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 font-mono mt-1">
                        {isTgLinked
                          ? 'Telegram-аккаунт синхронизирован. Вы получаете еженедельные дайджесты и экстренные алерты успеваемости.'
                          : 'Привяжите Telegram-бота для получения аналитических дайджестов, алертов и быстрого входа.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateTelegramToken}
                        disabled={isGeneratingToken}
                        className="rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 shadow-none transition-all disabled:opacity-50"
                      >
                        {isGeneratingToken
                          ? 'ГЕНЕРАЦИЯ...'
                          : isTgLinked
                            ? '[ ПЕРЕПРИВЯЗАТЬ TELEGRAM ]'
                            : '[ ПРИВЯЗАТЬ TELEGRAM ]'}
                      </button>
                    </div>
                  </div>

                  {telegramToken && (
                    <div className="border border-[#d4ff00]/30 bg-[#d4ff00]/[0.05] p-3 space-y-3">
                      <span className="font-mono text-[11px] text-zinc-300 block">
                        Перейдите по прямой ссылке для мгновенной привязки телеметрии к боту:
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={telegramLinkUrl || `https://t.me/${telegramBotUser}?start=link_${telegramToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-none border border-[#d4ff00] bg-[#d4ff00] px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 shadow-none transition-all"
                        >
                          ⚡ [ ПЕРЕЙТИ В TELEGRAM БОТА ]
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const link = telegramLinkUrl || `https://t.me/${telegramBotUser}?start=link_${telegramToken}`;
                            navigator.clipboard.writeText(link);
                            addToast('success', 'Ссылка привязки скопирована');
                          }}
                          className="rounded-none border border-white/20 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00]"
                        >
                          Скопировать ссылку
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900 p-2 font-mono text-xs text-[#d4ff00] border border-white/10">
                        <span className="truncate">/start link_{telegramToken}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`/start link_${telegramToken}`);
                            addToast('success', 'Команда скопирована');
                          }}
                          className="text-white hover:underline text-[10px] uppercase ml-2 flex-shrink-0"
                        >
                          Скопировать
                        </button>
                      </div>
                    </div>
                  )}

                  {isTgLinked && (
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
                  )}
                </div>
              );
            })()}
          </div>

          {/* Google account link */}
          <div className="border border-white/10 bg-zinc-950/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-wider text-zinc-200">
                    GOOGLE СИНХРОНИЗАЦИЯ:
                  </span>
                  {profile.googleId ? (
                    <span className="border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#d4ff00]">
                      [ GOOGLE: ПРИВЯЗАН ]
                    </span>
                  ) : (
                    <span className="border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      [ НЕ ПРИВЯЗАН ]
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 font-mono mt-1">
                  {profile.googleId
                    ? 'Ваш Google-профиль успешно синхронизирован с аккаунтом.'
                    : 'Привяжите Google для входа в один клик с любого устройства.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {profile.googleId ? (
                  <button
                    type="button"
                    onClick={handleUnlinkGoogle}
                    disabled={isUnlinkingGoogle}
                    className="rounded-none border border-white/20 bg-zinc-900 px-3.5 py-2 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
                  >
                    {isUnlinkingGoogle ? 'ОТВЯЗКА...' : '[ ОТВЯЗАТЬ ]'}
                  </button>
                ) : (
                  <div ref={googleButtonRef} className="min-h-[40px] flex items-center" />
                )}
              </div>
            </div>
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

      {/* Опасная зона // 152-ФЗ / GDPR */}
      <div className="mt-8 border border-red-500/20 bg-red-500/[0.02] p-5 rounded-none">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] text-red-500 uppercase tracking-widest block">
                // ОПАСНАЯ ЗОНА
            </span>
            <h4 className="font-display text-base font-bold text-white uppercase mt-0.5">
              Удаление профиля и всех персональных данных
            </h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Полное удаление данных связанных с аккаунтом в соответствии со стандартами 152-ФЗ и GDPR.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="shrink-0 rounded-none border border-red-500/30 bg-transparent px-4 py-2 font-mono text-xs font-semibold uppercase text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-colors"
          >
            [ УДАЛИТЬ АККАУНТ И ВСЕ ДАННЫЕ ]
          </button>
        </div>
      </div>

      {/* Терминальное модальное окно подтверждения удаления */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-red-500/40 bg-[#09090b] p-6 rounded-none shadow-2xl">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-3 mb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-red-400">
                ⚠️ [ EGE.SYSTEM // КРИТИЧЕСКАЯ ОПЕРАЦИЯ ]
              </span>
              <button
                type="button"
                onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
                className="font-mono text-zinc-500 hover:text-white text-xs"
              >
                [ ЗАКРЫТЬ ]
              </button>
            </div>

            <div className="space-y-4">
              <div className="border border-red-500/20 bg-red-500/[0.04] p-4 font-mono text-xs text-red-300 leading-relaxed">
                Это действие необратимо. Все данные аккаунта будут стерты навсегда.
              </div>

              <p className="font-sans text-xs text-zinc-400">
                В соответствии с 152-ФЗ и регламентом защиты данных все связанные записи из базы данных платформы будут безвозвратно удалены. Восстановить прогресс или подписку будет невозможно.
              </p>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-none border border-white/20 bg-zinc-900 px-4 py-2 font-mono text-xs uppercase text-zinc-300 hover:text-white"
                >
                  [ ОТМЕНА ]
                </button>
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={handleConfirmDeleteAccount}
                  className="rounded-none border border-red-500 bg-red-600 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {isDeletingAccount ? 'УДАЛЕНИЕ ДАННЫХ...' : '[ ПОДТВЕРЖДАЮ УДАЛЕНИЕ ]'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
