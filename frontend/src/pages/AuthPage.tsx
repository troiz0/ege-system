import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Link000, Link001 } from '../components/ui/skiper-ui/skiper40';
import { Send, ExternalLink, ShieldCheck } from 'lucide-react';
import { errText } from '../lib/errors';
import { RegisterForm } from '../components/RegisterForm';

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

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [tgSession, setTgSession] = useState<{ token: string; botUrl: string; botUsername: string } | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const navigate = useNavigate();
  const { setUser, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleAuth = async (credential: string) => {
    try {
      const result = await api.googleAuth(credential);
      setUser(result.user);
      addToast('success', 'Вход через Google выполнен!');
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка входа через Google');
    }
  };

  const handleTelegramAuth = async (data: any) => {
    try {
      setLoading(true);
      const result = await api.loginWithTelegram(data);
      setUser(result.user);
      addToast('success', 'Вход через Telegram выполнен!');
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка входа через Telegram');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Поддержка глобального колбэка виджета Telegram Login
    (window as any).onTelegramAuth = (user: any) => {
      void handleTelegramAuth(user);
    };
    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (tgPolling && tgSession?.token) {
      timer = setInterval(async () => {
        try {
          const res = await api.checkTelegramLoginSession(tgSession.token);
          if (res.approved && res.user) {
            setUser(res.user);
            setTgPolling(false);
            addToast('success', 'Вход через Telegram успешно подтвержден!');
            navigate('/dashboard');
          }
        } catch {
          // ignore tick error
        }
      }, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tgPolling, tgSession, navigate, setUser, addToast]);

  const handleStartTelegramAuth = async () => {
    const popup = window.open('about:blank', '_blank');
    setLoading(true);
    try {
      const res = await api.createTelegramLoginSession();
      setTgSession(res);
      setTgPolling(true);
      if (popup && !popup.closed) {
        popup.location.href = res.botUrl;
      }
      addToast('info', 'Нажмите «Запустить» в Telegram-боте для завершения входа');
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      addToast('error', errText(err) || 'Ошибка запуска входа через Telegram');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }
    let cancelled = false;

    loadGoogleSdk()
      .then(() => {
        if (cancelled || !googleButtonRef.current || !window.google) {
          return;
        }
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void handleGoogleAuth(response.credential);
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          // Ширина по контейнеру: фикс 320px вылезает за карточку на 360px-экранах
          width: Math.max(
            200,
            Math.min(320, googleButtonRef.current.clientWidth || 320)
          ),
          locale: 'ru',
        });
      })
      .catch((error: unknown) => {
        console.warn(errText(error));
      });

    return () => {
      cancelled = true;
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = '';
      }
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await api.login(email, password);
      addToast('success', 'Вход выполнен!');
      setUser(result.user);
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Произошла ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const result = await api.loginDemo();
      setUser(result.user);
      addToast('success', 'Вход в демо-режим выполнен!');
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка входа в демо-режим');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoData = () => {
    setEmail('demo@example.com');
    setPassword('Demo123!@#');
    if (mode === 'register') {
      setName('Демо Пользователь');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] p-4 text-zinc-100">
      {/* Фон: мягкий свет сверху + сетка */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(212,255,0,0.05),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 hud-grid" />
      <span className="hud-tag pointer-events-none absolute left-5 top-5 hidden sm:inline">
        [ ВХОД // СЕЗОН 2027 ]
      </span>
      <span className="hud-tag pointer-events-none absolute right-5 top-5 hidden sm:inline">
        EGE.SYSTEM © 2026
      </span>

      <div className="relative grid w-full max-w-5xl overflow-hidden border border-white/10 bg-[#08080a]/90 backdrop-blur-xl md:grid-cols-2">
        {/* Левая панель — display-манифест */}
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 p-10 md:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(212,255,0,0.09),transparent_70%)]" />
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center bg-[#d4ff00] font-display text-base font-extrabold text-black">
              E
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-200">
              EGE.SYSTEM
            </span>
          </a>
          <div>
            <p className="hud-tag mb-5">[ ВХОД В ЛИЧНЫЙ КАБИНЕТ ]</p>
            <p className="display-giant max-w-full text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tight break-words leading-[0.95]">
              С ВОЗВРАЩЕНИЕМ,
              <span className="block text-white/20">УЧЕНИК</span>
            </p>
            <p className="mt-6 max-w-[280px] text-sm font-light leading-relaxed text-zinc-500">
              Расписание. Слабые темы. Пробники с разбором. План до дня сдачи.
            </p>
          </div>
          <p className="hud-tag">EGE.SYSTEM © 2026</p>
        </div>

        {/* Правая панель — форма */}
        <div className="box-border p-4 sm:p-8 md:p-10">
          <p className="hud-tag mb-4 text-center md:text-left">
            {mode === 'login' ? '[ AUTH // LOGIN ]' : '[ AUTH // REGISTER ]'}
          </p>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight">
            {mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}
          </h1>

          {/* Tabs */}
          <div className="mb-6 mt-6 grid grid-cols-2 gap-1.5 border border-white/10 bg-white/[0.02] p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`py-2 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors border ${mode === m
                  ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.02]'
                  }`}
              >
                {m === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>

          {mode === 'register' ? (
            <RegisterForm
              onSuccess={(user) => {
                setUser(user);
                navigate('/dashboard');
              }}
              onSwitchToLogin={() => setMode('login')}
              initialEmail={email}
              initialPassword={password}
              initialName={name}
            />
          ) : (
            <>
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="hud-tag mb-2 block">CHANNEL // EMAIL</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-white/10 bg-white/[0.02] px-4 py-2.5 text-zinc-100 placeholder-zinc-600 backdrop-blur-xl focus:border-[#d4ff00]/60 focus:outline-none"
                    placeholder="student@ege.system"
                    required
                  />
                </div>

                <div>
                  <label className="hud-tag mb-2 block">KEY // ПАРОЛЬ</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-white/10 bg-white/[0.02] px-4 py-2.5 text-zinc-100 placeholder-zinc-600 backdrop-blur-xl focus:border-[#d4ff00]/60 focus:outline-none"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 bg-[#d4ff00] py-3.5 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-all shadow-none hover:brightness-110 disabled:opacity-50"
                >
                  {loading && <LoadingSpinner size="sm" />}
                  [ Войти ]
                </button>
              </form>

              <button
                onClick={fillDemoData}
                className="mt-3 w-full border border-white/10 bg-white/[0.02] py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-[#d4ff00]/40 hover:text-zinc-100"
              >
                [ Fill demo credentials ]
              </button>
            </>
          )}

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/10" />
            <span className="hud-tag">OR</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {GOOGLE_CLIENT_ID && (
            <div className="flex w-full flex-col items-center gap-1.5 overflow-hidden">
              <div ref={googleButtonRef} className="w-full max-w-[320px]" />
              <span className="hud-tag">Continue via Google</span>
            </div>
          )}

          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="mt-3 w-full border border-[#d4ff00]/40 bg-[#d4ff00]/[0.06] py-3.5 font-mono text-[11px] uppercase tracking-[0.25em] text-[#d4ff00] transition-all hover:bg-[#d4ff00]/[0.12] disabled:opacity-50"
          >
            [ Демо-вход ]
          </button>

          {/* Telegram Login Button */}
          <button
            type="button"
            onClick={handleStartTelegramAuth}
            disabled={loading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-none border border-[#d4ff00] bg-black py-3.5 font-mono text-[11px] uppercase tracking-[0.25em] text-[#d4ff00] transition-all hover:bg-[#d4ff00]/10 disabled:opacity-50 shadow-none"
          >
            <Send className="h-4 w-4" />
            <span>[ ВОЙТИ ЧЕРЕЗ TELEGRAM ]</span>
          </button>

          {tgPolling && tgSession && (
            <div className="mt-3 border border-[#d4ff00]/40 bg-[#d4ff00]/[0.06] p-3 text-xs space-y-2.5">
              <div className="flex items-center gap-2 text-[#d4ff00] font-mono font-bold">
                <ShieldCheck className="h-4 w-4" />
                <span>ОЖИДАНИЕ ВХОДА ЧЕРЕЗ БОТА</span>
              </div>
              <p className="text-zinc-300 font-sans text-[11px] leading-relaxed">
                Нажмите кнопку ниже, чтобы открыть бота <strong>@{tgSession.botUsername}</strong> и нажать «Запустить»:
              </p>
              <a
                href={tgSession.botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-[#d4ff00] bg-[#d4ff00] text-black py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-all hover:bg-white hover:border-white shadow-none rounded-none"
              >
                <span>[ ПЕРЕЙТИ В БОТА И НАЖАТЬ СТАРТ ]</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div className="flex items-center justify-between gap-2 pt-1 font-mono text-[10px] text-zinc-400">
                <span className="truncate">/start login_{tgSession.token}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`/start login_${tgSession.token}`);
                    addToast('success', 'Команда скопирована');
                  }}
                  className="text-[#d4ff00] hover:underline whitespace-nowrap"
                >
                  [ Копировать ]
                </button>
              </div>
              <div className="pt-1 text-right">
                <button
                  type="button"
                  onClick={() => setTgPolling(false)}
                  className="font-mono text-[10px] uppercase text-zinc-500 hover:text-white"
                >
                  [ Отмена ]
                </button>
              </div>
            </div>
          )}

          <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-500">
            Авторизуясь, вы подтверждаете согласие с{' '}
            <a href="/terms" className="text-zinc-400 underline decoration-zinc-600 hover:text-[#d4ff00] transition-colors">
              Пользовательским соглашением
            </a>{' '}
            и{' '}
            <a href="/privacy" className="text-zinc-400 underline decoration-zinc-600 hover:text-[#d4ff00] transition-colors">
              Политикой конфиденциальности
            </a>{' '}
            в соответствии с 152-ФЗ.
          </p>

          <div className="mt-6 flex items-center justify-center gap-7 text-sm text-zinc-500">
            <Link000 href="/" className="transition-colors hover:text-[#d4ff00]">
              Главная
            </Link000>
            <Link000 href="/materials" className="transition-colors hover:text-[#d4ff00]">
              Материалы
            </Link000>
            <Link001 href="mailto:support@ege-ai.ru" className="transition-colors hover:text-[#d4ff00]">
              Поддержка
            </Link001>
          </div>
        </div>
      </div>
    </div>
  );
}
