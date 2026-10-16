import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import {
  MESH_LOGIN_URL,
  MESH_TOKEN_REFRESH_URL,
  extractMeshToken,
  saveMeshToken,
  validateMeshToken,
} from '../lib/mesh-auth.service';

type Step = 'form' | 'success';

interface MeshAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function MeshAuthModal({ isOpen, onClose, onConnected }: MeshAuthModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [savedMasked, setSavedMasked] = useState<string | null>(null);
  const { addToast } = useToastStore();

  const reset = useCallback(() => {
    setStep('form');
    setTokenInput('');
    setError(null);
    setIsConnecting(false);
    setSavedMasked(null);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const openLogin = () => {
    window.open(MESH_LOGIN_URL, '_blank', 'noopener,noreferrer');
  };

  const openTokenRefresh = () => {
    window.open(MESH_TOKEN_REFRESH_URL, '_blank', 'noopener,noreferrer');
  };

  const handleConnect = async () => {
    setError(null);
    const extracted = extractMeshToken(tokenInput);
    const check = validateMeshToken(extracted);
    if (!check.ok) {
      setError(check.error ?? 'Токен не прошёл проверку');
      return;
    }
    setIsConnecting(true);
    try {
      // Валидация и сохранение через бэкенд (POST /api/mesh).
      const masked = await saveMeshToken(extracted);
      setSavedMasked(masked);
      setTokenInput('');
      setStep('success');
      onConnected?.();
    } catch (err) {
      setError(errText(err) || 'Не удалось подключить дневник');
    } finally {
      setIsConnecting(false);
    }
  };

  const copyToken = async () => {
    const token = savedMasked;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      addToast('success', 'Маскированный токен скопирован в буфер обмена');
    } catch {
      addToast('error', 'Не удалось скопировать токен');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Подключение дневника МЭШ" size="md">
      {step === 'form' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Подключите аккаунт МЭШ, чтобы синхронизировать расписание и оценки.
            Это займёт меньше минуты: войдите на сайт МЭШ и вставьте токен ниже.
          </p>

          {/* Шаг 1 — вход в аккаунт */}
          <div className="card-shelf p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-none border border-[#d4ff00]/30 bg-[#d4ff00]/10 text-xs font-semibold text-[#d4ff00]">
                1
              </span>
              <h3 className="text-sm font-semibold text-zinc-100">Вход в аккаунт</h3>
            </div>
            <button
              onClick={openLogin}
              className="btn-ghost mt-3 w-full text-sm"
            >
              <Globe className="h-4 w-4 text-[#d4ff00]" />
              1. Открыть school.mos.ru
            </button>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Если вы уже залогинены в МЭШ на этом устройстве — сразу переходите к шагу 2.
            </p>
          </div>

          {/* Шаг 2 — получение токена */}
          <div className="card-shelf p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-none border border-[#d4ff00]/30 bg-[#d4ff00]/10 text-xs font-semibold text-[#d4ff00]">
                2
              </span>
              <h3 className="text-sm font-semibold text-zinc-100">Получение токена</h3>
            </div>
            <button
              onClick={openTokenRefresh}
              className="btn-lime mt-3 w-full text-sm"
            >
              <KeyRound className="h-4 w-4" />
              2. Получить токен МЭШ
            </button>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              В новой вкладке откроется текст ответа. Скопируйте значение поля
              authentication_token или весь текст страницы целиком и вставьте в поле ниже.
            </p>

            <div className="mt-3">
              <textarea
                id="mesh-token-input"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Вставьте токен или JSON ответа"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                className="field resize-y font-mono"
              />
              {error && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <button
                onClick={() => void handleConnect()}
                disabled={!tokenInput.trim() || isConnecting}
                className="btn-lime mt-3 w-full text-sm"
              >
                {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isConnecting ? 'Подключаем...' : 'Подключить дневник'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="py-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-none bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-4 animate-alert-in">
            <CheckCircle2 className="w-7 h-7 text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-100 tracking-tight">
            Аккаунт МЭШ подключён
          </h3>
          <p className="text-sm text-zinc-400 mt-1.5 max-w-sm leading-relaxed">
            Токен сохранён в профиле и зашифрован на сервере. Расписание и оценки
            синхронизируются автоматически.
          </p>

          <div className="mt-5 flex w-full max-w-sm items-center gap-2 rounded-none border border-white/[0.08] bg-white/[0.03] p-3">
            <code className="min-w-0 flex-1 truncate text-left font-mono text-xs text-zinc-300">
              {savedMasked ?? '••••••••••••'}
            </code>
            <button
              onClick={() => void copyToken()}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-none border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/20"
            >
              <Copy className="h-3.5 w-3.5" />
              Скопировать
            </button>
          </div>

          <button
            onClick={onClose}
            className="btn-lime mt-6 px-6 text-sm"
          >
            Готово
          </button>
        </div>
      )}
    </Modal>
  );
}
