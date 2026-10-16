import React from 'react';
import { DashboardPage } from './DashboardPage';

/**
 * Console (Главная консоль управления)
 * Включает HUD-виджеты:
 * - «ПРОГНОЗ БАЛЛА: 78–84 [ ТЕМП: СТАБИЛЬНЫЙ ]»
 * - «СТАТУС НАГРУЗКИ: НОРМА / ПЕРЕГРУЗКА»
 * - «Повторение сегодня» (SM-2 Flashcards с 3D-флипом)
 * - Быстрый доступ к СИМУЛЯТОРУ ЭКЗАМЕНА
 */
export const Console: React.FC = () => {
  return <DashboardPage />;
};

export const ConsolePage = Console;
export default Console;
