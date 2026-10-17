import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, School } from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import {
  maskMeshToken,
  storePendingToken,
  stripBearer,
  validateMeshToken,
} from '../lib/mesh-auth.service';

type CallbackState = 'working' | 'done' | 'manual' | 'error';

function readTokenFromUrl(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    search.get('auth_token') ??
    search.get('access_token') ??
    hash.get('access_token') ??
    hash.get('auth_token')
  );
}

/**
 * Страница-приёмник /auth/mesh/callback:
 * перехватывает токен из параметров URL и передаёт его
 * родительскому окну через window.postMessage, затем закрывается.
 */
export function AuthMeshCallback() {
  const [state, setState] = useState<CallbackState>('working');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    const raw = readTokenFromUrl();
    if (!raw) {
      setState('error');
      setMessage('Токен не найден в ссылке. Повторите вход через плашку подключения.');
      return;
    }

    const check = validateMeshToken(raw);
    if (!check.ok) {
      setState('error');
      setMessage(check.error ?? 'Токен не прошёл проверку');
      return;
    }

    const normalized = stripBearer(raw);

    // 1) Родительское окно — наше приложение (popup «Способ 1») → postMessage.
    let parentIsApp = false;
    if (window.opener && !window.opener.closed) {
      try {
        parentIsApp = window.opener.origin === window.location.origin;
      } catch {
        parentIsApp = false;
      }
      if (parentIsApp) {
        window.opener.postMessage(
          { type: 'mesh-auth-token', token: normalized },
          window.location.origin
        );
      }
    }

    if (parentIsApp) {
      setState('done');
      setMessage('Вход подтверждён — окно закроется автоматически');
      window.setTimeout(() => window.close(), 1500);
      return;
    }

    // 2) Обычная вкладка: кладём токен в localStorage — открытая модалка
    //    подхватит его через storage-событие. Показываем и резервное копирование.
    storePendingToken(normalized);
    setToken(normalized);
    setState('manual');
    setMessage(
      'Токен передан в приложение — вернитесь во вкладку с плашкой, подключение завершится автоматически. Если плашка не открыта, скопируйте токен и вставьте его вручную.'
    );
  }, []);

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      addToast('success', 'Токен скопирован в буфер обмена');
    } catch {
      addToast('error', 'Не удалось скопировать токен');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-md rounded-none border border-white/[0.08] bg-white/[0.02] p-8 text-center shadow-none backdrop-blur-xl">
        <div className="w-12 h-12 mx-auto mb-5 rounded-none bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
          <School className="w-6 h-6 text-cyan-400" />
        </div>

        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-cyan-400/90 mb-3">
          МЭШ · подключение
        </p>

        {state === 'working' && (
          <>
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
              Обрабатываем токен...
            </h1>
          </>
        )}

        {state === 'done' && (
          <div className="animate-alert-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-none bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
              Вход подтверждён
            </h1>
            <p className="text-sm text-zinc-400 mt-2">{message}</p>
          </div>
        )}

        {state === 'manual' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-none bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
              Токен получен
            </h1>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{message}</p>
            <div className="mt-5 flex items-center gap-2 rounded-none border border-white/[0.08] bg-white/[0.03] p-3">
              <code className="flex-1 min-w-0 text-xs text-zinc-300 font-mono truncate text-left">
                {token ? maskMeshToken(token) : ''}
              </code>
              <button
                onClick={() => void copyToken()}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-none border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/20"
              >
                <Copy className="w-3.5 h-3.5" />
                Скопировать
              </button>
            </div>
            <button
              onClick={() => window.close()}
              className="mt-5 text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
            >
              Закрыть окно
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-none bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
              Не удалось получить токен
            </h1>
            <p className="text-sm text-red-300/90 mt-2 leading-relaxed">{message}</p>
            <button
              onClick={() => window.close()}
              className="mt-5 text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
            >
              Закрыть окно
            </button>
          </>
        )}
      </div>
    </div>
  );
}
