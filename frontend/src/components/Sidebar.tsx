import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { hudConfirm } from '../store/confirmStore';
import { api } from '../lib/api';
import {
  LayoutDashboard,
  Brain,
  Calendar,
  ClipboardList,
  FileText,
  Target,
  BookMarked,
  CalendarDays,
  School,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  MessageSquare,
  Clock,
  BookX,
  Users,
  Swords,
  Scale,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { Badge } from './ui/Badge';

const menuGroups = [
  {
    title: 'OVERVIEW',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Консоль', code: 'DASH' },
      { path: '/analysis', icon: Brain, label: 'AI-Аналитика', code: 'AI' },
    ],
  },
  {
    title: 'STUDY LOOP',
    items: [
      { path: '/schedule', icon: Calendar, label: 'Расписание', code: 'SCH' },
      { path: '/homework', icon: ClipboardList, label: 'Задания', code: 'HW' },
      { path: '/mesh-diary', icon: School, label: 'Дневник МЭШ', code: 'MESH' },
      { path: '/chat', icon: MessageSquare, label: 'AI-Чат', code: 'CHAT' },
      { path: '/arena', icon: Swords, label: 'BATTLEGROUND', code: 'PVP' },
    ],
  },
  {
    title: 'TELEMETRY',
    items: [
      { path: '/tests', icon: FileText, label: 'Оценки', code: 'TST' },
      { path: '/mock-exams', icon: Target, label: 'Пробники', code: 'MOCK' },
      { path: '/exam-pressure', icon: Clock, label: 'Симулятор экзамена', code: 'EXAM' },
      { path: '/expert-mode', icon: ShieldCheck, label: 'ЕГЭ-Эксперт', code: 'EXPR' },
      { path: '/appeal-calculator', icon: Scale, label: 'Апелляция', code: 'APPL' },
      { path: '/mistakes', icon: BookX, label: 'Книга ошибок', code: 'ERR' },
    ],
  },
  {
    title: 'KNOWLEDGE',
    items: [
      { path: '/materials', icon: BookMarked, label: 'База знаний', code: 'KB' },
    ],
  },
  {
    title: 'PLAN',
    items: [
      { path: '/ege-plan', icon: CalendarDays, label: 'План подготовки', code: 'PLAN' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { path: '/tutor', icon: Users, label: 'Репетитор', code: 'TUTR' },
      { path: '/profile', icon: User, label: 'Профиль', code: 'USR' },
      { path: '/settings', icon: Settings, label: 'Параметры', code: 'CFG' },
    ],
  },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [grade, setGrade] = useState<number | null>(user?.grade ?? null);

  useEffect(() => {
    if (typeof user?.grade === 'number') {
      setGrade(user.grade);
    }
  }, [user?.grade]);

  // Класс из профиля (не хардкод): подгрузка + мгновенное обновление
  // после смены класса на странице профиля (событие profile-grade-updated)
  useEffect(() => {
    if (!user?.id) {
      setGrade(null);
      return;
    }
    let alive = true;
    api
      .getProfile()
      .then((p) => {
        if (alive && typeof p.grade === 'number') {
          setGrade(p.grade);
        }
      })
      .catch(() => {});
    const onGrade = (e: Event) => {
      const g = (e as CustomEvent<{ grade?: unknown }>).detail?.grade;
      if (typeof g === 'number') {
        setGrade(g);
        useAuthStore.getState().updateUserGrade(g);
      }
    };
    window.addEventListener('profile-grade-updated', onGrade);
    return () => {
      alive = false;
      window.removeEventListener('profile-grade-updated', onGrade);
    };
  }, [user?.id]);

  const handleLogout = async () => {
    const ok = await hudConfirm({
      title: 'ВЫХОД ИЗ СИСТЕМЫ',
      message: 'Вы уверены, что хотите выйти из аккаунта?',
      confirmText: '[ ВЫЙТИ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'danger',
    });
    if (!ok) return;
    logout();
    setIsMobileMenuOpen(false);
  };

  // При открытом мобильном меню блокируем скролл страницы
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileMenuOpen]);

  const isAdmin =
    user &&
    (user.email === 'vladimir.putin.offic@gmail.com' ||
      user.email === 'turdubaevtimur643@gmail.com' ||
      (user as any).role === 'admin');

  const renderSidebarNav = () => (
    <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4 pr-1 scrollbar-thin">
      {menuGroups.map((group) => {
        let items = group.items;
        if (group.title === 'SYSTEM' && isAdmin) {
          items = [
            ...items,
            { path: '/admin', icon: Terminal, label: 'Админ-панель', code: 'ROOT' },
          ];
        }
        return (
          <div key={group.title}>
            <h2 className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
              {group.title}
            </h2>
            <div className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 border px-3 py-2 transition-all duration-200 ${
                      isActive
                        ? 'border-[#d4ff00]/40 bg-[#d4ff00]/[0.07] text-zinc-100'
                        : 'border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-200'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">{item.label}</span>
                  <span className="ml-auto font-mono text-[8px] tracking-[0.2em] opacity-40">
                    {item.code}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const renderUserCell = () => {
    const displayName = user?.name || 'Пользователь';
    const firstLetter = (displayName[0] || 'U').toUpperCase();
    const currentGrade = typeof user?.grade === 'number' ? user.grade : grade;
    const roleText = (user as any)?.role === 'tutor' 
      ? 'РЕПЕТИТОР // ЭКСПЕРТ' 
      : (user as any)?.role === 'teacher' 
      ? 'УЧИТЕЛЬ // ЭКСПЕРТ' 
      : typeof currentGrade === 'number'
      ? `УЧЕНИК // ${currentGrade} КЛАСС`
      : 'УЧЕНИК';

    return (
      <div className="mt-auto shrink-0 border-t border-zinc-800/60 pt-4">
        <div className="border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[#d4ff00] font-display text-base font-extrabold text-black">
              {firstLetter}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-semibold text-zinc-100">{displayName}</span>
                <span className="font-mono text-[9px] text-[#d4ff00] font-bold border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-1.5 py-0.5">
                  LVL {user?.level ?? 1}
                </span>
              </div>
              <div className="font-mono text-[9px] tracking-[0.2em] text-zinc-500 flex items-center justify-between mt-0.5">
                <span>{roleText}</span>
                <span className="text-zinc-400 font-bold">{user?.xp ?? 0} XP</span>
              </div>
            </div>
          </div>
          {user?.isDemo && (
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="warning" className="font-mono text-[9px] tracking-[0.2em]">DEMO MODE</Badge>
            </div>
          )}
          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={() => setIsMobileMenuOpen(false)}
              className="mb-2 block w-full border border-[#d4ff00]/40 bg-[#d4ff00]/10 px-3 py-1.5 text-center font-mono text-[9px] tracking-[0.2em] text-[#d4ff00] uppercase transition-colors hover:bg-[#d4ff00]/20"
            >
              [ ROOT // АДМИН-ЦЕНТР ]
            </NavLink>
          )}
          <NavLink
            to="/profile"
            onClick={() => setIsMobileMenuOpen(false)}
            className="mb-2 block w-full border border-white/10 bg-white/[0.03] px-3 py-2 text-center font-mono text-[10px] tracking-[0.25em] text-zinc-200 uppercase transition-colors hover:border-[#d4ff00]/50 hover:text-white"
          >
            Открыть профиль
          </NavLink>
        </div>
        <button
          onClick={handleLogout}
          className="mt-2 flex w-full items-center justify-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600 transition-colors hover:text-zinc-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Выйти из аккаунта</span>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Мобильная шапка — копия дизайна главной страницы:
          fixed, h-60px, z-100, bg-[#09090b]/70 + blur */}
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/10 bg-[#09090b]/70 backdrop-blur-xl lg:hidden">
        <div className="flex h-[60px] items-center justify-between px-5">
          <NavLink to="/" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
            <span className="flex h-7 w-7 items-center justify-center bg-[#d4ff00] font-display text-sm font-extrabold text-black">
              E
            </span>
            <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-zinc-200">
              EGE.SYSTEM
            </span>
          </NavLink>
          <button
            onClick={() => setIsMobileMenuOpen((v) => !v)}
            aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            className="inline-flex items-center gap-2 rounded-none border border-white/15 bg-white/[0.03] p-2 font-mono text-[10px] uppercase text-zinc-100 backdrop-blur-xl transition-all hover:border-[#d4ff00]/70 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Затемнение фона при открытом меню (клик — закрыть), строго под хедером */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Мобильное меню — строго под хедером: top-60px, z-90 (< z-100 хедера).
          Только горизонтальный сдвиг: translateX(-100%) / translateX(0).
          Контент начинается сверху (justify-start), скролл внутри навигации. */}
      <div
        aria-hidden={!isMobileMenuOpen}
        className={`fixed bottom-0 left-0 right-0 top-[60px] z-[90] flex h-[calc(100dvh-60px)] w-full flex-col justify-start overflow-hidden border-b border-zinc-800 bg-[#0a0a0a] px-4 py-4 transition-transform duration-300 lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden">
          {renderSidebarNav()}
          {renderUserCell()}
        </div>
      </div>

      {/* Desktop Sidebar — стоит как вкопанный: логотип сверху, навигация скроллится, профиль снизу. */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-[#0a0a0a] p-4 lg:flex">
        {/* Шапка сайдбара: десктоп */}
        <div className="shrink-0 border-b border-zinc-800/60 px-1 pb-4">
          <NavLink to="/" className="group flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center bg-[#d4ff00] font-display text-base font-extrabold text-black">
              E
            </span>
            <span>
              <span className="block font-mono text-[11px] tracking-[0.3em] text-zinc-100">
                EGE.SYSTEM
              </span>
              <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.25em] text-zinc-500">
                <span className="h-1 w-1 rounded-none bg-[#d4ff00] animate-pulse-dot" />
                STATUS: OPTIMAL
              </span>
            </span>
            <ArrowUpRight className="ml-auto h-4 w-4 text-zinc-600 transition-all group-hover:text-[#d4ff00]" />
          </NavLink>
        </div>

        {/* Скроллируемая навигация */}
        {renderSidebarNav()}

        {/* Прижатая ячейка пользователя */}
        {renderUserCell()}
      </aside>
    </>
  );
}
