import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Link000, Link001 } from '../components/ui/skiper-ui/skiper40';
import { errText } from '../lib/errors';

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
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const { addToast } = useToastStore();
  const googleButtonRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let result;
      if (mode === 'register') {
        result = await api.register(email, password, name);
        addToast('success', 'Регистрация успешна!');
      } else {
        result = await api.login(email, password);
        addToast('success', 'Вход выполнен!');
      }
      
      setUser(result.user);
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Произошла ошибка');
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
        EGE.SYSTEM © 2027
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
          <p className="hud-tag">EGE.SYSTEM © 2027</p>
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
                className={`py-2 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors border ${
                  mode === m
                    ? 'border-[#d4ff00]/60 bg-[#d4ff00]/[0.08] text-[#d4ff00]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.02]'
                }`}
              >
                {m === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="hud-tag mb-2 block">CALLSIGN // ИМЯ</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-white/10 bg-white/[0.02] px-4 py-2.5 text-zinc-100 placeholder-zinc-600 backdrop-blur-xl focus:border-[#d4ff00]/60 focus:outline-none"
                  placeholder="Оператор"
                  required
                />
              </div>
            )}

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
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-[#d4ff00] py-3.5 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-all hover:shadow-glow hover:brightness-110 disabled:opacity-50"
            >
              {loading && <LoadingSpinner size="sm" />}
              [ {mode === 'login' ? 'Войти' : 'Создать аккаунт'} ]
            </button>
          </form>

          <button
            onClick={fillDemoData}
            className="mt-3 w-full border border-white/10 bg-white/[0.02] py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-[#d4ff00]/40 hover:text-zinc-100"
          >
            [ Fill demo credentials ]
          </button>

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
