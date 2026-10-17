import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { hudConfirm } from '../store/confirmStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  Users,
  HardDrive,
  Activity,
  Send,
  Cpu,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Radio,
  Terminal,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import { errText } from '../lib/errors';

const ADMIN_EMAILS = [
  'vladimir.putin.offic@gmail.com',
  'turdubaevtimur643@gmail.com',
];

export function AdminPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [openRouterStats, setOpenRouterStats] = useState<any>(null);

  // Форма рассылки
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('INFO');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<any>(null);

  // Действия
  const [isMigrating, setIsMigrating] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [actionLog, setActionLog] = useState<string | null>(null);

  // Фильтры пользователей
  const [searchQuery, setSearchQuery] = useState('');

  // Бан пользователей
  const [selectedUserForBan, setSelectedUserForBan] = useState<any | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [isBanning, setIsBanning] = useState(false);
  const [isUnbanning, setIsUnbanning] = useState<string | null>(null);

  const isAdmin =
    user &&
    (ADMIN_EMAILS.some((admin) => admin.toLowerCase() === user.email?.toLowerCase()) ||
      (user as any).role === 'admin');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true });
      return;
    }
    if (!isAdmin) {
      addToast('error', '403 Forbidden // ACCESS DENIED');
      navigate('/dashboard', { replace: true });
      return;
    }
    loadData();
  }, [isAuthenticated, isAdmin, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, u, or] = await Promise.all([
        api.getAdminMetrics().catch(() => null),
        api.getAdminUsers().catch(() => ({ items: [] })),
        api.getAdminOpenRouter().catch(() => null),
      ]);
      setMetrics(m);
      setUsersList(u.items || []);
      setOpenRouterStats(or);
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка загрузки данных админ-панели');
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastMessage) {
      addToast('error', 'Заполните заголовок и текст сообщения');
      return;
    }

    setIsBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await api.broadcastTelegramMessage({
        title: broadcastTitle,
        message: broadcastMessage,
        severity: broadcastSeverity,
      });
      setBroadcastResult(res.result);
      addToast('success', `Рассылка отправлена: ${res.result.sent} из ${res.result.total} аккаунтов`);
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка отправки рассылки');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleRunMigration = async () => {
    const ok = await hudConfirm({
      title: 'СИНХРОНИЗАЦИЯ БАЗЫ ДАННЫХ',
      message: 'Запустить синхронизацию схемы БД (prisma db push)?',
      description: 'Будут применены последние изменения моделей Prisma в производственную базу данных.',
      confirmText: '[ ЗАПУСТИТЬ МИГРАЦИЮ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'warning',
    });
    if (!ok) return;
    setIsMigrating(true);
    try {
      const res = await api.runAdminMigration();
      setActionLog(`[MIGRATION SUCCESS]\n${res.stdout}`);
      addToast('success', 'Схема базы данных успешно синхронизирована');
      await loadData();
    } catch (err) {
      setActionLog(`[MIGRATION ERROR]\n${errText(err)}`);
      addToast('error', 'Ошибка выполнения миграции');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleClearCache = async () => {
    const ok = await hudConfirm({
      title: 'ОЧИСТКА КЭША ВАРИАНТОВ',
      message: 'Очистить кэш вариантов РешуЕГЭ?',
      description: 'Все предзагруженные локальные варианты будут сброшены и скачаны заново при следующих обращениях.',
      confirmText: '[ ОЧИСТИТЬ КЭШ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'warning',
    });
    if (!ok) return;
    setIsClearingCache(true);
    try {
      const res = await api.clearAdminCache();
      setActionLog(`[CACHE CLEARED]\n${res.message}`);
      addToast('success', res.message);
      await loadData();
    } catch (err) {
      setActionLog(`[CACHE ERROR]\n${errText(err)}`);
      addToast('error', 'Ошибка сброса кэша');
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleOpenBanModal = (u: any) => {
    setSelectedUserForBan(u);
    setBanReasonInput('Нарушение регламента платформы EGE.SYSTEM');
  };

  const handleConfirmBan = async () => {
    if (!selectedUserForBan) return;
    if (!banReasonInput.trim()) {
      addToast('error', 'Укажите причину блокировки');
      return;
    }
    setIsBanning(true);
    try {
      const res = await api.banUser(selectedUserForBan.id, banReasonInput.trim());
      setUsersList((prev) =>
        prev.map((u) =>
          u.id === selectedUserForBan.id
            ? { ...u, isBanned: true, banReason: banReasonInput.trim(), bannedAt: new Date().toISOString() }
            : u
        )
      );
      if (res.telegramNotificationSent) {
        addToast('success', 'Пользователь заблокирован. Уведомление отправлено в Telegram.');
      } else {
        addToast('success', 'Пользователь заблокирован.');
      }
      setSelectedUserForBan(null);
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка блокировки пользователя');
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setIsUnbanning(userId);
    try {
      await api.unbanUser(userId);
      setUsersList((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, isBanned: false, banReason: null, bannedAt: null }
            : u
        )
      );
      addToast('success', 'Пользователь успешно разблокирован');
    } catch (err) {
      addToast('error', errText(err) || 'Ошибка разблокировки пользователя');
    } finally {
      setIsUnbanning(null);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center font-mono text-xs text-zinc-400">
        <LoadingSpinner size="md" />
        <span className="ml-3">[ АВТОРИЗАЦИЯ ДОСТУПА К КОМАНДНОМУ ЦЕНТРУ... ]</span>
      </div>
    );
  }

  const filteredUsers = usersList.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.telegramUsername && u.telegramUsername.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Шапка командного центра */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 bg-[#d4ff00] animate-pulse" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d4ff00]">
              [ ROOT // COMMAND CENTER // EGE.SYSTEM ]
            </p>
          </div>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-white md:text-4xl">
            ADMINISTRATION CONSOLE
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="border border-white/10 bg-zinc-900/40 px-3 py-2 font-mono text-[11px] text-zinc-300">
            <span className="text-zinc-500 uppercase block text-[9px]">ОПЕРАТОР:</span>
            <span className="text-[#d4ff00] font-bold">{user?.email}</span>
          </div>
          <div className="border border-white/10 bg-zinc-900/40 px-3 py-2 font-mono text-[11px] text-zinc-300">
            <span className="text-zinc-500 uppercase block text-[9px]">БОТ:</span>
            <span className="text-white font-bold">@{metrics?.botUsername || 'ege_system_bot'}</span>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 border border-white/10 bg-zinc-900/40 px-3 py-2 font-mono text-xs text-zinc-300 hover:border-[#d4ff00] hover:text-[#d4ff00] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>[ ОБНОВИТЬ ]</span>
          </button>
        </div>
      </div>

      {/* 1. Блок Метрик платформы */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-white/10 bg-zinc-900/40 p-4 shadow-none">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">Всего аккаунтов</span>
            <Users className="h-4 w-4 text-[#d4ff00]" />
          </div>
          <p className="font-display text-3xl font-extrabold text-white">
            {metrics?.totalUsers ?? 0}
          </p>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Зарегистрированных учеников и тьюторов
          </p>
        </div>

        <div className="border border-white/10 bg-zinc-900/40 p-4 shadow-none">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">Активные сессии (7д)</span>
            <Activity className="h-4 w-4 text-[#d4ff00]" />
          </div>
          <p className="font-display text-3xl font-extrabold text-[#d4ff00]">
            {metrics?.activeSessions ?? 0}
          </p>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Активные пользователи
          </p>
        </div>

        <div className="border border-white/10 bg-zinc-900/40 p-4 shadow-none">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">База данных SQLite</span>
            <HardDrive className="h-4 w-4 text-[#d4ff00]" />
          </div>
          <p className="font-display text-3xl font-extrabold text-white">
            {metrics?.dbSizeFormatted ?? '0 MB'}
          </p>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            dev.db локальное хранилище данных
          </p>
        </div>

        <div className="border border-white/10 bg-zinc-900/40 p-4 shadow-none">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">Связки Telegram</span>
            <Send className="h-4 w-4 text-[#d4ff00]" />
          </div>
          <p className="font-display text-3xl font-extrabold text-[#d4ff00]">
            {metrics?.telegramLinkedCount ?? 0}
          </p>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Подключенных активных чатов бота
          </p>
        </div>
      </div>

      {/* 2. Мониторинг OpenRouter & Системные действия */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* OpenRouter Телеметрия */}
        <div className="border border-white/10 bg-zinc-900/40 p-5 shadow-none space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#d4ff00]" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                Мониторинг OpenRouter AI Core
              </h2>
            </div>
            <span className="font-mono text-[10px] text-zinc-400 uppercase border border-white/10 px-2 py-0.5">
              {openRouterStats?.configured ? 'АКТИВЕН' : 'ДЕМО-РЕЖИМ'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="border border-white/[0.06] bg-black/40 p-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 block">
                USED CREDITS
              </span>
              <span className="font-mono text-lg font-bold text-white">
                ${openRouterStats?.liveStats?.usage?.toFixed(3) || '0.000'}
              </span>
            </div>
            <div className="border border-white/[0.06] bg-black/40 p-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 block">
                BALANCE LIMIT
              </span>
              <span className="font-mono text-lg font-bold text-[#d4ff00]">
                ${openRouterStats?.liveStats?.limit || '100.00'}
              </span>
            </div>
            <div className="border border-white/[0.06] bg-black/40 p-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 block">
                AI ВЫЗОВОВ
              </span>
              <span className="font-mono text-lg font-bold text-white">
                {openRouterStats?.totalAiSnapshots ?? 0}
              </span>
            </div>
          </div>

          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span>Модель по умолчанию:</span>
              <span className="text-zinc-200">{openRouterStats?.defaultModel || 'google/gemini-3.8-flash'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span>Выпущенных ключей ученикам:</span>
              <span className="text-[#d4ff00]">{openRouterStats?.usersWithKeys ?? 0} шт.</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Лимит запросов API:</span>
              <span className="text-zinc-200">
                {openRouterStats?.liveStats?.rate_limit?.requests || 200} req /{' '}
                {openRouterStats?.liveStats?.rate_limit?.interval || '10s'}
              </span>
            </div>
          </div>
        </div>

        {/* Управление и запуск миграций */}
        <div className="border border-white/10 bg-zinc-900/40 p-5 shadow-none space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#d4ff00]" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                Операционные команды ядра
              </h2>
            </div>
          </div>

          <p className="font-sans text-xs text-zinc-400">
            Прямое управление схемой SQLite базы данных и оперативным кэшем парсера КИМ.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={isMigrating}
              className="flex items-center justify-center gap-2 border border-white/20 bg-black px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-[#d4ff00] hover:text-[#d4ff00] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isMigrating ? 'animate-spin' : ''}`} />
              <span>[ ЗАПУСК МИГРАЦИЙ ]</span>
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="flex items-center justify-center gap-2 border border-white/20 bg-black px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>[ СБРОС КЭША РЕШУЕГЭ ]</span>
            </button>
          </div>

          {actionLog && (
            <div className="border border-white/10 bg-black p-3 font-mono text-[11px] text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {actionLog}
            </div>
          )}
        </div>
      </div>

      {/* 3. Экстренная системная рассылка в Telegram */}
      <div className="border border-white/10 bg-zinc-900/40 p-5 shadow-none space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#d4ff00]" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Экстренная системная рассылка в Telegram
            </h2>
          </div>
          <span className="font-mono text-[10px] text-zinc-400 uppercase">
            ПОЛУЧАТЕЛЕЙ: {metrics?.telegramLinkedCount ?? 0} ЧАТОВ
          </span>
        </div>

        <form onSubmit={handleBroadcast} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="hud-tag mb-1 block">ТЕМА ОПОВЕЩЕНИЯ</label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Обновление заданий банка ФИПИ 2027 // Важная информация"
                className="w-full rounded-none border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="hud-tag mb-1 block">УРОВЕНЬ СРОЧНОСТИ</label>
              <select
                value={broadcastSeverity}
                onChange={(e) => setBroadcastSeverity(e.target.value as any)}
                className="w-full rounded-none border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#d4ff00] focus:outline-none"
              >
                <option value="INFO">INFO // Информационное</option>
                <option value="WARNING">WARNING // Предупреждение</option>
                <option value="CRITICAL">CRITICAL // Экстренное</option>
              </select>
            </div>
          </div>

          <div>
            <label className="hud-tag mb-1 block">ТЕКСТ СООБЩЕНИЯ (ПОСТУПИТ ВСЕМ ПОЛЬЗОВАТЕЛЯМ В TELEGRAM)</label>
            <textarea
              rows={3}
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Уважаемые ученики! Доступен новый тренировочный срез по профильной математике..."
              className="w-full rounded-none border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="font-mono text-[10px] text-zinc-500">
              * Сообщение форматируется по EGE.SYSTEM HUD-стандарту с прикреплением ссылки на платформу.
            </p>
            <button
              type="submit"
              disabled={isBroadcasting}
              className="flex items-center gap-2 rounded-none border border-[#d4ff00] bg-[#d4ff00] px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 shadow-none transition-all disabled:opacity-50"
            >
              {isBroadcasting ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
              <span>[ ВЫПОЛНИТЬ РАССЫЛКУ В TELEGRAM ]</span>
            </button>
          </div>
        </form>

        {broadcastResult && (
          <div className="border border-white/10 bg-black/80 p-3 font-mono text-xs space-y-1">
            <div className="flex items-center gap-2 text-[#d4ff00]">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Отчет рассылки: успешно доставлено {broadcastResult.sent} из {broadcastResult.total}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Таблица учеников и пользователей */}
      <div className="border border-white/10 bg-zinc-900/40 p-5 shadow-none space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#d4ff00]" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Реестр учеников и телеметрии ({filteredUsers.length})
            </h2>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по email, имени, @username..."
              className="w-full rounded-none border border-white/10 bg-black px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500 bg-black/40">
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Имя // Роль</th>
                <th className="px-3 py-2.5">Класс</th>
                <th className="px-3 py-2.5">Стрик</th>
                <th className="px-3 py-2.5">Уровень (XP)</th>
                <th className="px-3 py-2.5">Telegram статус</th>
                <th className="px-3 py-2.5">Статус</th>
                <th className="px-3 py-2.5">Дата регистрации</th>
                <th className="px-3 py-2.5 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-zinc-200">{u.email}</div>
                      {u.isDemo && (
                        <span className="text-[9px] text-amber-400 uppercase font-bold">[DEMO]</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      <div>{u.name}</div>
                      <span className="text-[9px] text-zinc-500 uppercase">{u.role}</span>
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {u.grade} класс
                    </td>
                    <td className="px-3 py-3 font-bold text-[#d4ff00]">
                      {u.streak} дн.
                    </td>
                    <td className="px-3 py-3 text-zinc-200">
                      <span className="text-[#d4ff00] font-bold">LVL {u.level}</span>
                      <span className="text-zinc-500 ml-1">({u.xp} XP)</span>
                    </td>
                    <td className="px-3 py-3">
                      {u.telegramLinked ? (
                        <span className="inline-flex items-center gap-1.5 border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2 py-0.5 text-[10px] text-[#d4ff00]">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>TG: {u.telegramUsername ? `@${u.telegramUsername}` : 'LINKED'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-500">
                          НЕТ ПРИВЯЗКИ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {u.isBanned ? (
                        <span
                          title={u.banReason ? `Причина бана: ${u.banReason}` : 'Заблокирован'}
                          className="inline-flex items-center gap-1 border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 font-mono cursor-help"
                        >
                          <Ban className="h-3 w-3" />
                          <span>[ ЗАБАНЕН ]</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2 py-0.5 text-[10px] text-[#d4ff00] font-mono">
                          [ АКТИВЕН ]
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {u.isBanned ? (
                        <button
                          type="button"
                          onClick={() => handleUnbanUser(u.id)}
                          disabled={isUnbanning === u.id}
                          className="rounded-none border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#d4ff00] hover:bg-[#d4ff00]/20 disabled:opacity-50 transition-colors"
                        >
                          {isUnbanning === u.id ? '...' : '[ РАЗБАНИТЬ ]'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenBanModal(u)}
                          className="rounded-none border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-red-400 hover:bg-red-500/20 hover:border-red-500 transition-colors"
                        >
                          [ ЗАБАНИТЬ ]
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно бана пользователя */}
      {selectedUserForBan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md border border-red-500/40 bg-[#09090b] p-6 rounded-none shadow-2xl">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-3 mb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                [ БЛОКИРОВКА ПОЛЬЗОВАТЕЛЯ ]
              </span>
              <button
                type="button"
                onClick={() => !isBanning && setSelectedUserForBan(null)}
                className="font-mono text-zinc-500 hover:text-white text-xs"
              >
                [ ЗАКРЫТЬ ]
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="border border-white/10 bg-black/50 p-3 space-y-1">
                <div className="text-zinc-400">
                  ПОЛЬЗОВАТЕЛЬ: <span className="text-white font-bold">{selectedUserForBan.name}</span>
                </div>
                <div className="text-zinc-400">
                  EMAIL: <span className="text-zinc-200">{selectedUserForBan.email}</span>
                </div>
                <div className="text-zinc-400">
                  TELEGRAM: <span className="text-[#d4ff00]">{selectedUserForBan.telegramLinked ? 'ПРИВЯЗАН (получит алерт)' : 'НЕТ ПРИВЯЗКИ'}</span>
                </div>
              </div>

              <div>
                <label className="hud-tag mb-1.5 block text-zinc-400">ПРИЧИНА БЛОКИРОВКИ:</label>
                <textarea
                  rows={3}
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  placeholder="Укажите причину блокировки..."
                  className="w-full rounded-none border border-white/10 bg-black/60 p-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="text-[10px] text-zinc-500 leading-relaxed">
                * При блокировке доступ ко всем API платформы будет немедленно закрыт (403 ACCOUNT_BANNED). При наличии привязки Telegram бот отправит официальное уведомление с указанной причиной.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  disabled={isBanning}
                  onClick={() => setSelectedUserForBan(null)}
                  className="rounded-none border border-white/20 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs uppercase text-zinc-300 hover:text-white"
                >
                  [ ОТМЕНА ]
                </button>
                <button
                  type="button"
                  disabled={isBanning}
                  onClick={handleConfirmBan}
                  className="rounded-none border border-red-500 bg-red-600 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {isBanning ? 'БЛОКИРОВКА...' : '[ ПОДТВЕРДИТЬ БАН ]'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AdminPage;
