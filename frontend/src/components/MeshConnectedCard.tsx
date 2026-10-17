import { useEffect, useState } from 'react';
import { CalendarDays, KeyRound, Link2Off, RefreshCw, School, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { removeMeshToken } from '../lib/mesh-auth.service';
import { clearDiarySnapshot, saveDiarySnapshot } from '../lib/meshDiary.service';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import type { MeshStatus } from '../lib/types';

interface MeshConnectedCardProps {
  /** Вызывается после успешной отвязки — например, чтобы перечитать статус плашки. */
  onUnlinked?: () => void;
}

/**
 * Карточка «Дневник МЭШ подключён» на странице профиля:
 * маска токена, дата подключения, отвязка и примечание
 * об ограниченном сроке действия токена.
 */
export function MeshConnectedCard({ onUnlinked }: MeshConnectedCardProps) {
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    let alive = true;
    api
      .getMeshStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        /* статус недоступен — карточку не показываем */
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (checking || !status?.connected) return null;

  const connectedDate = status.connectedAt
    ? new Date(status.connectedAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const unlink = async () => {
    setBusy(true);
    try {
      await removeMeshToken();
      clearDiarySnapshot();
      addToast('success', 'Профиль МЭШ отвязан');
      onUnlinked?.();
    } catch (err) {
      addToast('error', errText(err) || 'Не удалось отвязать профиль');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncMeshDiary();
      saveDiarySnapshot(result);
      const c = result.counts;
      if (result.errors.length > 0) {
        addToast('warning', `Синхронизировано частично: ${result.errors[0]}`);
      } else {
        addToast(
          'success',
          `Синхронизировано: ${c.lessons} уроков, ${c.homeworks} заданий, ${c.marks} оценок, ${c.diagnostics} пробников`
        );
      }
    } catch (err) {
      addToast('error', errText(err) || 'Не удалось синхронизировать данные');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-4 p-5 bg-zinc-900/70 backdrop-blur border border-white/[0.08] rounded-none shadow-none animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-none bg-green-500/10 border border-green-500/25 flex items-center justify-center flex-shrink-0">
            <School className="w-5 h-5 text-green-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-zinc-100 tracking-tight">
                Дневник МЭШ подключён
              </h3>
              <span className="px-2 py-0.5 rounded-none bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-medium">
                активен
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5">
              Расписание и оценки синхронизируются автоматически
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              {status.tokenMasked && (
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Токен{' '}
                  <code className="font-mono text-zinc-400">{status.tokenMasked}</code>
                </span>
              )}
              {connectedDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Подключён: {connectedDate}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <button
            onClick={() => void sync()}
            disabled={syncing || busy}
            className="btn-lime text-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Синхронизация…' : 'Синхронизировать данные'}
          </button>
          <button
            onClick={() => void unlink()}
            disabled={busy || syncing}
            className="btn-ghost text-sm disabled:opacity-60"
          >
            <Link2Off className="w-4 h-4" />
            {busy ? 'Отвязка…' : 'Отвязать'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 p-3.5 bg-warm-orange/10 border border-warm-orange/20 rounded-none">
        <ShieldAlert className="w-4 h-4 text-warm-orange flex-shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-300 leading-relaxed">
          Срок действия токена МЭШ ограничен. Если функции, связанные с МЭШ,
          перестали работать — отвяжите аккаунт и подключите заново, чтобы
          обновить токен.
        </p>
      </div>
    </div>
  );
}
