// Извлечение текста ошибок без использования `any`.
export function errText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}
