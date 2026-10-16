import type { z } from 'zod';

// Утилиты для работы с ошибками без использования `any`.
export function errText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

export function isZodError(error: unknown): error is z.ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'ZodError'
  );
}
