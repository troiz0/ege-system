import { useEffect, useState } from 'react';
import { BookOpen, School, X } from 'lucide-react';
import { api } from '../lib/api';
import { MeshAuthModal } from './MeshAuthModal';
import { dismissBanner, isBannerDismissed } from '../lib/mesh-auth.service';

/**
 * Плашка «Подключите дневник МЭШ» — показывается на дашборде
 * после регистрации/входа, пока аккаунт не подключён и не скрыт.
 */
export function MeshConnectBanner() {
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(isBannerDismissed());
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .getMeshStatus()
      .then((status) => {
        if (alive) setConnected(status.connected);
      })
      .catch(() => {
        /* статус недоступен — покажем плашку */
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (checking) return null;

  return (
    <>
      {!dismissed && !connected && (
        <div className="card-shelf mb-6 flex flex-col gap-4 p-5 shadow-none animate-fade-up sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-none border border-[#d4ff00]/25 bg-[#d4ff00]/10">
              <School className="h-5 w-5 text-[#d4ff00]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100 tracking-tight">
                Подключите дневник МЭШ
              </h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                Синхронизируйте расписание и оценки в один клик
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setModalOpen(true)}
              className="btn-lime text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Войти через МЭШ
            </button>
            <button
              onClick={() => {
                dismissBanner();
                setDismissed(true);
              }}
              aria-label="Скрыть баннер"
              title="Скрыть"
              className="p-2 text-zinc-500 hover:text-zinc-300 rounded-none transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Модалка живёт вне условия плашки: экран успеха не должен пропадать
          вместе с плашкой после подключения */}
      <MeshAuthModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={() => setConnected(true)}
      />
    </>
  );
}
