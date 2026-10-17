import { create } from 'zustand';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'lime';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  isAlert?: boolean;
}

interface ConfirmDialogState {
  isOpen: boolean;
  options: ConfirmDialogOptions;
  resolve: ((value: boolean) => void) | null;
  open: (options: ConfirmDialogOptions, resolve: (value: boolean) => void) => void;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmDialogState>((set, get) => ({
  isOpen: false,
  options: { message: '' },
  resolve: null,
  open: (options, resolve) => {
    // Если предыдущий модал был открыт, разрешаем его как отмену
    const currentResolve = get().resolve;
    if (currentResolve) {
      currentResolve(false);
    }

    set({
      isOpen: true,
      options,
      resolve,
    });
  },
  close: (result: boolean) => {
    const { resolve } = get();
    if (resolve) {
      resolve(result);
    }
    set({
      isOpen: false,
      resolve: null,
    });
  },
}));

/**
 * Программное открытие HUD-диалога подтверждения вместо браузерного window.confirm().
 * Возвращает Promise<boolean>.
 */
export function hudConfirm(
  optionsOrMessage: string | ConfirmDialogOptions
): Promise<boolean> {
  const options: ConfirmDialogOptions =
    typeof optionsOrMessage === 'string'
      ? { message: optionsOrMessage }
      : optionsOrMessage;

  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().open(options, resolve);
  });
}

/**
 * Алиас для обратной совместимости.
 */
export const confirmAction = hudConfirm;

/**
 * Программное открытие информационного HUD-окна вместо браузерного window.alert().
 * Возвращает Promise<void>.
 */
export function hudAlert(
  optionsOrMessage: string | (Omit<ConfirmDialogOptions, 'isAlert'>)
): Promise<void> {
  const options: ConfirmDialogOptions =
    typeof optionsOrMessage === 'string'
      ? {
          message: optionsOrMessage,
          isAlert: true,
          confirmText: '[ ПОНЯТНО ]',
          variant: 'info',
        }
      : {
          ...optionsOrMessage,
          isAlert: true,
          confirmText: optionsOrMessage.confirmText ?? '[ ПОНЯТНО ]',
          variant: optionsOrMessage.variant ?? 'info',
        };

  return new Promise<void>((resolve) => {
    useConfirmStore.getState().open(options, () => resolve());
  });
}

// Перехват системного window.alert для показа кастомного HUD-окна
if (typeof window !== 'undefined') {
  window.alert = (message?: unknown) => {
    hudAlert(String(message ?? ''));
  };
}
