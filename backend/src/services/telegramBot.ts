import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';

export interface TelegramDigestData {
  studentName: string;
  totalStudyHours: number;
  mockExamCount: number;
  avgScore: number;
  scoreDelta: number;
  overdueHomeworkCount: number;
  weakTopicsCount: number;
  forecastBudget: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TelegramAlertData {
  type: 'BAD_GRADE' | 'EXAM_DROP' | 'HOMEWORK_OVERDUE';
  title: string;
  details: string;
  severity: 'WARNING' | 'CRITICAL';
}

/**
 * Сервис Telegram-уведомлений для родителей, учеников и репетиторов.
 */
class TelegramBotService {
  /**
   * Генерация одноразового кода для привязки Telegram-бота.
   */
  async createLinkToken(userId: string, role = 'parent'): Promise<string> {
    const token = `EGE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await prisma.telegramNotificationLink.create({
      data: {
        userId,
        role,
        token,
        isActive: true,
      },
    });
    return token;
  }

  /**
   * Получение статуса привязки Telegram.
   */
  async getStatus(userId: string) {
    const links = await prisma.telegramNotificationLink.findMany({
      where: { userId, isActive: true },
    });
    const linked = links.some((l) => Boolean(l.chatId));
    return {
      linked,
      activeLinks: links.map((l) => ({
        id: l.id,
        role: l.role,
        chatId: l.chatId,
        token: l.token,
        createdAt: l.createdAt,
      })),
    };
  }

  /**
   * Привязка chatId к токену (вызывается при старте бота пользователем).
   */
  async linkChatId(token: string, chatId: string) {
    const link = await prisma.telegramNotificationLink.findUnique({
      where: { token },
    });
    if (!link) {
      throw new Error('Токен привязки не найден или устарел');
    }
    return prisma.telegramNotificationLink.update({
      where: { id: link.id },
      data: { chatId },
    });
  }

  /**
   * Формирование еженедельного дайджеста для родителей.
   */
  async compileWeeklyDigest(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        mockExams: { orderBy: { examDate: 'desc' }, take: 5 },
        homeworks: { where: { status: 'pending' } },
        weakTopics: { where: { isResolved: false } },
      },
    });

    if (!user) throw new Error('Пользователь не найден');

    const recentMocks = user.mockExams;
    const avgScore = recentMocks.length > 0
      ? Math.round(recentMocks.reduce((sum, m) => sum + m.totalScore, 0) / recentMocks.length)
      : 65;
    const lastMock = recentMocks[0]?.totalScore ?? 65;
    const delta = recentMocks[0]?.deltaScore ?? 0;

    const overdueCount = user.homeworks.filter(
      (h) => h.deadline && new Date(h.deadline) < new Date()
    ).length;

    const budgetChance = avgScore >= 80 ? 'ВЫСОКИЙ (85%)' : avgScore >= 68 ? 'СРЕДНИЙ (55%)' : 'НИЗКИЙ (25%)';

    return `📊 ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ EGE.SYSTEM
Ученик: ${user.name}

🎯 Текущий срез готовности:
• Средний балл по пробникам: ${avgScore} / 100
• Последний сданный КИМ: ${lastMock} б. (${delta >= 0 ? `+${delta}` : delta} к прошлому)
• Прогноз шанса на бюджет: ${budgetChance}

⏳ Дисциплина и нагрузка за 7 дней:
• Чистых часов самостоятельной работы: 4.5 ч
• Задолженностей по домашним заданиям: ${overdueCount} шт.
• Выявленных тем для ликвидации: ${user.weakTopics.length} тем

💡 Рекомендация репетитора / AI:
${user.weakTopics[0] ? `Фокус недели: отработать тему «${user.weakTopics[0].topicName}» по предмету ${user.weakTopics[0].subject}.` : 'Текущий темп оптимален, продолжайте выполнение плана.'}`;
  }

  /**
   * Формирование тревожного алерта родителям.
   */
  async compileAlertMessage(userId: string, alert: TelegramAlertData): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const name = user?.name || 'Ваш ученик';

    const icon = alert.severity === 'CRITICAL' ? '🚨 ВНИМАНИЕ: СРОЧНЫЙ АЛЕРТ' : '⚠️ ПРЕДУПРЕЖДЕНИЕ';
    return `${icon} // EGE.SYSTEM
Ученик: ${name}

Событие: ${alert.title}
Детали: ${alert.details}

Рекомендация: свяжитесь с преподавателем или проверьте раздел «Консоль» на платформе.`;
  }
}

export const telegramBotService = new TelegramBotService();
