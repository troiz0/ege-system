import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Send, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { errText } from '../lib/errors';
import { RegisterForm } from './RegisterForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name] = useState('');
  const [loading, setLoading] = useState(false);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [tgSession, setTgSession] = useState<{ token: string; botUrl: string; botUsername: string } | null>(null);
  const [tgPolling, setTgPolling] = useState(false);

  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (tgPolling && tgSession?.token) {
      timer = setInterval(async () => {
        try {
          const res = await api.checkTelegramLoginSession(tgSession.token);
          if (res.approved && res.user) {
            setUser(res.user);
            setTgPolling(false);
            setTgModalOpen(false);
            onClose();
            addToast('success', 'Вход через Telegram успешно выполнен!');
            navigate('/dashboard');
          }
        } catch {
          // ignore polling tick error
        }
      }, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tgPolling, tgSession, navigate, setUser, onClose, addToast]);

  const handleStartTelegramAuth = async () => {
    const popup = window.open('about:blank', '_blank');
    setLoading(true);
    try {
      const res = await api.createTelegramLoginSession();
      setTgSession(res);
      setTgModalOpen(true);
      setTgPolling(true);
      if (popup && !popup.closed) {
        popup.location.href = res.botUrl;
      }
      addToast('info', 'Нажмите «Запустить» в Telegram-боте для завершения входа');
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      addToast('error', errText(err) || 'Не удалось запустить авторизацию через Telegram');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.login(email, password);
      addToast('success', 'Вход выполнен!');
      setUser(result.user);
      onClose();
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-md border border-white/10 bg-[#09090b] p-6 text-zinc-100 shadow-none">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-500 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="hud-tag mb-2">[ EGE.SYSTEM // ACCESS CONTROL ]</p>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white mb-4">
          {mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
        </h2>

        {/* Telegram Direct Login Button */}
        <button
          type="button"
          onClick={handleStartTelegramAuth}
          disabled={loading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-none border border-[#d4ff00] bg-black py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[#d4ff00] transition-colors hover:bg-[#d4ff00]/10 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span>[ ВОЙТИ ЧЕРЕЗ TELEGRAM ]</span>
        </button>

        {tgModalOpen && tgSession && (
          <div className="mb-4 border border-[#d4ff00]/40 bg-[#d4ff00]/[0.06] p-3 text-xs space-y-2.5">
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

        <div className="my-4 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="hud-tag">ИЛИ ЧЕРЕЗ EMAIL</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {mode === 'register' ? (
          <RegisterForm
            onSuccess={(user) => {
              setUser(user);
              onClose();
              navigate('/dashboard');
            }}
            onSwitchToLogin={() => setMode('login')}
            initialEmail={email}
            initialPassword={password}
            initialName={name}
          />
        ) : (
          <>
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="hud-tag mb-1 block">EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-none border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
                  placeholder="student@ege.system"
                  required
                />
              </div>

              <div>
                <label className="hud-tag mb-1 block">ПАРОЛЬ</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-none border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-none bg-[#d4ff00] py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:brightness-110 disabled:opacity-50"
              >
                {loading && <LoadingSpinner size="sm" />}
                [ Войти ]
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between font-mono text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setMode('register')}
                className="hover:text-zinc-200 uppercase"
              >
                Создать аккаунт
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
