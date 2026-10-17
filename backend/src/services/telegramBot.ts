import crypto from 'node:crypto';
import { Telegraf } from 'telegraf';
import { prisma } from '../lib/prisma.js';

export interface TelegramDigestData {
  studentName: string;
  totalStudyHours: number;
  mockExamCount: number;
  avgScore: number;
  scoreDelta: number;
  overdueHomeworkCount: number;
  weakTopicsCount: number;
  forecastBudget: 'HIGH' | 'MEDIUM' | 'LOW' | string;
}

export interface TelegramAlertData {
  type: 'BAD_GRADE' | 'EXAM_DROP' | 'HOMEWORK_OVERDUE' | string;
  title: string;
  details: string;
  severity: 'WARNING' | 'CRITICAL';
}

// Хранилище временных токенов для deep-link авторизации на сайте через бота
export interface PendingLoginSession {
  token: string;
  approved: boolean;
  telegramUser?: {
    id: number | string;
    first_name: string;
    username?: string;
  };
  userId?: string;
  createdAt: number;
}

export const pendingLoginSessions = new Map<string, PendingLoginSession>();
export const userBugReportPending = new Set<string>();

export interface BugReportSession {
  chatId: string;
  step: 'awaiting_report' | 'awaiting_optional_files';
  firstMessageText?: string;
  createdAt: number;
}

export const bugReportSessions = new Map<string, BugReportSession>();
export const recentMediaGroups = new Map<string, number>();

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Очистка устаревших сессий авторизации и баг-репортов
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of pendingLoginSessions.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      pendingLoginSessions.delete(key);
    }
  }
  for (const [chatId, session] of bugReportSessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      bugReportSessions.delete(chatId);
      userBugReportPending.delete(chatId);
    }
  }
  for (const [groupId, ts] of recentMediaGroups.entries()) {
    if (now - ts > 60 * 1000) {
      recentMediaGroups.delete(groupId);
    }
  }
}, 60 * 1000);

// Проверка URL для inline-кнопок Telegram (Telegram запрещает localhost/127.0.0.1)
function getValidButtonUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1') ||
    trimmed.includes('::1') ||
    !trimmed.includes('.')
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')) {
      return trimmed;
    }
  } catch {}
  return null;
}

export class TelegramBotService {
  public bot: Telegraf | null = null;
  public botUsername: string = 'ege_system_bot';
  public isInitialized = false;

  constructor() {
    this.initBot();
  }

  private async initBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN не задан в .env. Бот не запущен.');
      return;
    }

    try {
      let agent: any = undefined;
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxyUrl) {
        try {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          agent = new HttpsProxyAgent(proxyUrl);
        } catch (err) {
          console.warn('Could not load HttpsProxyAgent for Telegram:', err);
        }
      }

      this.bot = new Telegraf(token, {
        telegram: { agent },
      });

      this.setupHandlers();

      // Не запускаем polling в тестовой среде Vitest
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        // Получаем информацию о боте
        this.bot.telegram
          .getMe()
          .then((me) => {
            if (me.username) {
              this.botUsername = me.username;
            }
            console.log(`🤖 Telegram-бот авторизован: @${this.botUsername} (${me.first_name})`);
          })
          .catch((err) => {
            console.warn('⚠️  Не удалось получить getMe бота Telegram:', err.message);
          });

        this.bot
          .launch({ dropPendingUpdates: true })
          .then(() => {
            this.isInitialized = true;
            console.log(`✅ Telegram-бот успешно запущен в режиме polling: @${this.botUsername}`);
          })
          .catch((err) => {
            console.warn('⚠️  Предупреждение запуска polling бота Telegram:', err.message);
          });

        // Graceful shutdown
        process.once('SIGINT', () => this.bot?.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));
      }
    } catch (err: any) {
      console.error('Ошибка инициализации Telegram-бота:', err?.message || err);
    }
  }

  private setupHandlers() {
    if (!this.bot) return;

    this.bot.catch((err: any, ctx) => {
      console.error(`Ошибка в обработчике Telegram бота для обновления ${ctx.update.update_id}:`, err);
    });

    // Обработка команды /start
    this.bot.command('start', async (ctx) => {
      try {
        const text = ctx.message.text || '';
        const parts = text.split(' ');
        const payload = (parts[1] || (ctx as any).payload || (ctx as any).startPayload || '').trim();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        // 1. Если передана диплинк-ссылка привязки (/start link_<token> или /start <token> или /start bug)
        if (payload) {
          if (payload === 'bug') {
            const chatId = String(ctx.chat.id);
            userBugReportPending.add(chatId);
            bugReportSessions.set(chatId, {
              chatId,
              step: 'awaiting_report',
              createdAt: Date.now(),
            });
            await ctx.reply(
              `🛠 [ EGE.SYSTEM // РЕГИСТРАЦИЯ ДЕФЕКТА ]\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Опишите проблему, с которой вы столкнулись на платформе.\n\n` +
              `📎 Вы можете прикрепить файл (скриншот, документ, лог ошибки, видео) или написать текстовое описание.\n` +
              `💡 Для отмены отправки используйте команду /cancel.`
            );
            return;
          }

          // Проверяем, не является ли это сессией входа через deep-link (/start login_<token>)
          if (payload.startsWith('login_')) {
            const loginToken = payload.replace(/^login_/, '').trim();
            const session = pendingLoginSessions.get(loginToken) || pendingLoginSessions.get(loginToken.toLowerCase());
            if (session) {
              session.approved = true;
              session.telegramUser = {
                id: ctx.from.id,
                first_name: ctx.from.first_name,
                username: ctx.from.username,
              };

              const validBtnUrl = getValidButtonUrl(frontendUrl);
              const extra = validBtnUrl
                ? { reply_markup: { inline_keyboard: [[{ text: '⚡ Открыть EGE.SYSTEM', url: validBtnUrl }]] } }
                : {};

              await ctx.reply(
                `🔐 [ EGE.SYSTEM // АВТОРИЗАЦИЯ УСПЕШНА ]\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Вход на сайт успешно подтвержден для аккаунта: ${ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name} (ID: ${ctx.from.id}).\n\n` +
                `Вернитесь во вкладку браузера — авторизация завершится автоматически!\n\n` +
                `🌐 Платформа: ${frontendUrl}`,
                extra
              );
              return;
            } else {
              await ctx.reply(
                `⚠️ [ EGE.SYSTEM // СЕССИЯ ВХОДА УСТАРЕЛА ]\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Ссылка для входа устарела или сервер был перезапущен.\n\n` +
                `Пожалуйста, вернитесь на сайт и нажмите кнопку «[ ВОЙТИ ЧЕРЕЗ TELEGRAM ]» заново:\n` +
                `👉 ${frontendUrl}/auth`
              );
              return;
            }
          }

          // Привязка диплинка телеметрии: /start link_<token> или /start EGE-XXXXXX
          const cleanToken = payload.replace(/^link_/, '').trim().toUpperCase();
          const link = await prisma.telegramNotificationLink.findFirst({
            where: {
              OR: [
                { token: payload },
                { token: cleanToken },
                { token: `link_${cleanToken}` },
                { token: { equals: cleanToken } },
                { token: { equals: payload } },
              ],
            },
            include: { user: true },
          });

          if (link) {
            const chatId = String(ctx.chat.id);
            await prisma.telegramNotificationLink.update({
              where: { id: link.id },
              data: {
                chatId,
                isActive: true,
              },
            });

            // Если у пользователя еще не заполнен telegramId, заполняем
            if (!link.user.telegramId) {
              await prisma.user.update({
                where: { id: link.userId },
                data: {
                  telegramId: String(ctx.from.id),
                  telegramUsername: ctx.from.username || null,
                },
              }).catch(() => null);
            }

            const dashboardUrl = `${frontendUrl}/dashboard`;
            const validBtnUrl = getValidButtonUrl(dashboardUrl);
            const extra = validBtnUrl
              ? { reply_markup: { inline_keyboard: [[{ text: '📊 Открыть Консоль EGE.SYSTEM', url: validBtnUrl }]] } }
              : {};

            await ctx.reply(
              `✅ [ EGE.SYSTEM // ТЕЛЕМЕТРИЯ ПОДКЛЮЧЕНА ]\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Телеметрия успешно активирована для ученика: ${link.user.name}!\n` +
              `Вы будете получать еженедельные аналитические дайджесты и экстренные алерты об оценках.\n\n` +
              `📊 Личный кабинет: ${dashboardUrl}`,
              extra
            );
            return;
          } else {
            // Токен был передан, но не найден в базе данных
            const profileUrl = `${frontendUrl}/profile`;
            await ctx.reply(
              `⚠️ [ EGE.SYSTEM // ОШИБКА ПРИВЯЗКИ ]\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Код привязки «${payload}» не найден или устарел.\n\n` +
              `Пожалуйста, перейдите в профиль на платформе и сгенерируйте актуальный код:\n` +
              `👉 ${profileUrl}\n\n` +
              `Затем нажмите на ссылку или отправьте команду /start link_<КОД>.`
            );
            return;
          }
        }

        // Если старт без параметров — приветствие и подробная инструкция по привязке
        const validBtnUrl = getValidButtonUrl(frontendUrl);
        const replyExtra = validBtnUrl
          ? { reply_markup: { inline_keyboard: [[{ text: '🌐 Перейти на платформу', url: validBtnUrl }]] } }
          : {};

        await ctx.reply(
          `👋 [ EGE.SYSTEM // AI-АССИСТЕНТ И ТЕЛЕМЕТРИЯ ]\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Добро пожаловать в официальный бот платформы EGE.SYSTEM!\n\n` +
          `Для отслеживания прогресса подготовки к ЕГЭ/ОГЭ, получения еженедельных дайджестов успеваемости и экстренных алертов об оценках необходимо привязать ваш аккаунт к боту.\n\n` +
          `⚡ ДЛЯ ПРИВЯЗКИ АККАУНТА EGE.SYSTEM:\n` +
          `1. Войдите в личный кабинет на сайте:\n` +
          `   👉 ${frontendUrl}/profile\n` +
          `2. В блоке «Telegram-уведомления» нажмите кнопку:\n` +
          `   [ ПОЛУЧИТЬ КОД ПРИВЯЗКИ ТЕЛЕГРАМ ]\n` +
          `3. Нажмите на сгенерированную ссылку или отправьте полученную команду в этот чат (например: /start link_EGE-XXXXXX)\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Доступные команды:\n` +
          `/status — проверить статус синхронизации с сайтом\n` +
          `/digest — запросить свежий аналитический дайджест\n` +
          `/bug — сообщить об ошибке разработчику\n` +
          `/help — справка по командам бота\n\n` +
          `🌐 Платформа: ${frontendUrl}`,
          replyExtra
        );
      } catch (error) {
        console.error('Ошибка в /start:', error);
        await ctx.reply('⚠️ Произошла ошибка при обработке команды.').catch(() => null);
      }
    });

    // Обработка команды /status
    this.bot.command('status', async (ctx) => {
      try {
        const chatId = String(ctx.chat.id);
        const link = await prisma.telegramNotificationLink.findFirst({
          where: { chatId, isActive: true },
          include: { user: { include: { profile: true } } },
        });

        if (!link) {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          await ctx.reply(
            `⚠️ [ EGE.SYSTEM // СТАТУС: НЕ ПРИВЯЗАН ]\n\n` +
            `Ваш Telegram-аккаунт еще не привязан к личному кабинету.\n` +
            `Получите код привязки в разделе профиля: ${frontendUrl}/profile`
          );
          return;
        }

        const { user } = link;
        await ctx.reply(
          `📊 [ СТАТУС СИНХРОНИЗАЦИИ EGE.SYSTEM ]\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Ученик: ${user.name}\n` +
          `📧 Email: ${user.email}\n` +
          `🎓 Класс: ${user.profile?.grade ? `${user.profile.grade}` : 'не указан'}\n` +
          `⚡ Уровень: LVL ${user.level} (${user.xp} XP)\n` +
          `🔔 Тип уведомлений: ${link.role.toUpperCase()}\n` +
          `✅ Телеметрия активна и функционирует\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } catch (error) {
        console.error('Ошибка в /status:', error);
      }
    });

    // Обработка команды /digest
    this.bot.command('digest', async (ctx) => {
      try {
        const chatId = String(ctx.chat.id);
        const link = await prisma.telegramNotificationLink.findFirst({
          where: { chatId, isActive: true },
        });

        if (!link) {
          await ctx.reply('⚠️ Аккаунт не привязан. Сначала привяжите Telegram в личном кабинете на сайте.');
          return;
        }

        const digest = await this.compileWeeklyDigest(link.userId);
        await ctx.reply(digest);
      } catch (error) {
        console.error('Ошибка в /digest:', error);
        await ctx.reply('⚠️ Не удалось сформировать дайджест.').catch(() => null);
      }
    });

    // Обработка команды /bug
    this.bot.command('bug', async (ctx) => {
      const chatId = String(ctx.chat.id);
      userBugReportPending.add(chatId);
      bugReportSessions.set(chatId, {
        chatId,
        step: 'awaiting_report',
        createdAt: Date.now(),
      });
      await ctx.reply(
        `🛠 [ EGE.SYSTEM // РЕГИСТРАЦИЯ ДЕФЕКТА ]\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Опишите проблему, с которой вы столкнулись на платформе.\n\n` +
        `📎 Вы можете прикрепить файл (скриншот, документ, лог ошибки, видео) или написать текстовое описание.\n` +
        `💡 Для отмены отправки используйте команду /cancel.`
      );
    });

    // Отмена режима отправки баг-репорта
    this.bot.command(['cancel', 'done'], async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (userBugReportPending.has(chatId) || bugReportSessions.has(chatId)) {
        userBugReportPending.delete(chatId);
        bugReportSessions.delete(chatId);
        await ctx.reply('✅ Режим отправки баг-репорта закрыт.');
      }
    });

    // Обработка команды /help
    this.bot.command('help', async (ctx) => {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      await ctx.reply(
        `🤖 [ EGE.SYSTEM // СПРАВКА И КОМАНДЫ ]\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `/start — запуск бота и привязка профиля\n` +
        `/status — проверить статус синхронизации с платформой\n` +
        `/digest — запросить свежий аналитический дайджест\n` +
        `/bug — сообщить об ошибке разработчику (поддерживает файлы и скриншоты)\n` +
        `/cancel — отменить ввод баг-репорта\n` +
        `/help — данная справочная информация\n\n` +
        `Платформа: ${frontendUrl}`
      );
    });

    // Обработка сообщений пользователей (баг-репорты с полной поддержкой файлов и медиа)
    this.bot.on('message', async (ctx, next) => {
      try {
        const chatId = String(ctx.chat.id);
        const message: any = ctx.message;
        if (!message) return next();

        // Пропускаем команды бота
        if (message.text && message.text.startsWith('/')) {
          return next();
        }

        const isMediaGroupPart = message.media_group_id && recentMediaGroups.has(message.media_group_id);
        const hasPendingReport = userBugReportPending.has(chatId) || bugReportSessions.has(chatId) || isMediaGroupPart;

        if (hasPendingReport) {
          const session = bugReportSessions.get(chatId);
          const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
          const username = ctx.from?.username;
          const fromId = ctx.from?.id;
          const dateStr = new Date().toLocaleString('ru-RU');
          const userText = message.text || message.caption || '';

          // Определяем любые типы прикрепленных файлов и медиа
          const document = message.document;
          const photoArray = message.photo && Array.isArray(message.photo) && message.photo.length > 0 ? message.photo : null;
          const video = message.video;
          const audio = message.audio;
          const voice = message.voice;
          const animation = message.animation;

          const hasMedia = Boolean(document || photoArray || video || audio || voice || animation);

          if (message.media_group_id) {
            recentMediaGroups.set(message.media_group_id, Date.now());
          }

          const isAddition = session?.step === 'awaiting_optional_files';
          const header = isAddition
            ? `[ДОПОЛНЕНИЕ К БАГ-РЕПОРТУ // EGE.SYSTEM]`
            : `[НОВЫЙ БАГ-РЕПОРТ // EGE.SYSTEM]`;

          let fileInfoStr = '';
          if (document) {
            const sizeStr = formatFileSize(document.file_size);
            fileInfoStr = `📎 Файл: ${document.file_name || 'документ'}${sizeStr ? ` (${sizeStr})` : ''}\n`;
          } else if (photoArray) {
            fileInfoStr = `🖼 Скриншот / Изображение\n`;
          } else if (video) {
            fileInfoStr = `🎥 Видеозапись\n`;
          } else if (voice || audio) {
            fileInfoStr = `🎙 Голосовое / Аудио\n`;
          } else if (animation) {
            fileInfoStr = `🎞 Анимация / GIF\n`;
          }

          const userDesc = userText
            ? `Текст: ${userText}`
            : (session?.firstMessageText ? `Текст (из первого сообщения): ${session.firstMessageText}` : 'Без текстового описания');

          const reportText =
            `${header}\n` +
            `От: @${username || 'нет_юзернейма'} (ID: ${fromId})\n` +
            `Дата: ${dateStr}\n` +
            fileInfoStr +
            userDesc;

          const MAX_CAPTION_LEN = 1000;
          const safeCaption = reportText.length > MAX_CAPTION_LEN ? reportText.slice(0, 997) + '...' : reportText;

          if (adminChatId && this.bot) {
            try {
              if (document) {
                // Прямая пересылка файла администратору (pdf, log, doc, zip, uncompressed img и т.д.)
                await this.bot.telegram.sendDocument(adminChatId, document.file_id, {
                  caption: safeCaption,
                });
              } else if (photoArray) {
                const largestPhoto = photoArray[photoArray.length - 1];
                await this.bot.telegram.sendPhoto(adminChatId, largestPhoto.file_id, {
                  caption: safeCaption,
                });
              } else if (video) {
                await this.bot.telegram.sendVideo(adminChatId, video.file_id, {
                  caption: safeCaption,
                });
              } else if (animation) {
                await this.bot.telegram.sendAnimation(adminChatId, animation.file_id, {
                  caption: safeCaption,
                });
              } else if (voice) {
                await this.bot.telegram.sendVoice(adminChatId, voice.file_id, {
                  caption: safeCaption,
                });
              } else if (audio) {
                await this.bot.telegram.sendAudio(adminChatId, audio.file_id, {
                  caption: safeCaption,
                });
              } else {
                await this.bot.telegram.sendMessage(adminChatId, reportText);
              }

              // Если описание длиннее лимита caption, досылаем полный текст отдельным сообщением
              if (hasMedia && reportText.length > MAX_CAPTION_LEN) {
                await this.bot.telegram.sendMessage(adminChatId, reportText);
              }
            } catch (err: any) {
              console.error('Ошибка отправки файла баг-репорта администратору, пробуем резервную отправку:', err?.message || err);
              try {
                await this.bot.telegram.sendMessage(adminChatId, reportText);
                await this.bot.telegram.forwardMessage(adminChatId, ctx.chat.id, message.message_id);
              } catch (fwdErr: any) {
                console.error('Критический сбой резервной отправки баг-репорта:', fwdErr?.message || fwdErr);
              }
            }
          } else {
            console.warn('TELEGRAM_ADMIN_CHAT_ID не настроен. Баг-репорт:', reportText);
          }

          if (hasMedia) {
            userBugReportPending.delete(chatId);
            bugReportSessions.delete(chatId);
            await ctx.reply(
              `✅ [ EGE.SYSTEM // ДЕФЕКТ ЗАРЕГИСТРИРОВАН ]\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Файл и информация успешно переданы разработчику платформы.\n` +
              `Благодарим за помощь в улучшении системы!`
            );
          } else {
            if (session) {
              session.step = 'awaiting_optional_files';
              session.firstMessageText = userText;
            } else {
              bugReportSessions.set(chatId, {
                chatId,
                step: 'awaiting_optional_files',
                firstMessageText: userText,
                createdAt: Date.now(),
              });
            }
            await ctx.reply(
              `✅ Описание проблемы принято и передано разработчику!\n\n` +
              `📎 Если у вас есть файл (скриншот, лог ошибки или документ) — отправьте его следующим сообщением.\n` +
              `Если файлов нет — всё зафиксировано, можете продолжать работу (или отправьте /done).`
            );
          }
          return;
        }
      } catch (err) {
        console.error('Ошибка обработки сообщения в Telegram-боте:', err);
      }
      return next();
    });
  }

  /**
   * Генерация одноразового кода для привязки Telegram-бота.
   */
  async createLinkToken(userId: string, role = 'parent'): Promise<{ token: string; botUsername: string; linkUrl: string }> {
    const rawCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const token = `EGE-${rawCode}`;

    await prisma.telegramNotificationLink.create({
      data: {
        userId,
        role,
        token,
        isActive: true,
      },
    });

    const botUsername = this.botUsername;
    const linkUrl = `https://t.me/${botUsername}?start=link_${token}`;

    return {
      token,
      botUsername,
      linkUrl,
    };
  }

  /**
   * Получение статуса привязки Telegram.
   */
  async getStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, telegramUsername: true },
    });

    let links = await prisma.telegramNotificationLink.findMany({
      where: { userId, isActive: true },
    });

    // Если у пользователя есть telegramId (вошел через Telegram), но нет записи NotificationLink, создаем ее
    if (user?.telegramId && (!links.length || !links.some((l) => l.chatId === user.telegramId))) {
      const rawCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      const token = `EGE-TG-${rawCode}`;
      const newLink = await prisma.telegramNotificationLink.create({
        data: {
          userId,
          chatId: user.telegramId,
          role: 'student',
          token,
          isActive: true,
        },
      }).catch(() => null);
      if (newLink) {
        links = [newLink, ...links];
      }
    }

    const effectiveChatId = links.find((l) => Boolean(l.chatId))?.chatId || user?.telegramId || null;
    const linked = Boolean(effectiveChatId);

    return {
      linked,
      isLinked: linked,
      telegramId: user?.telegramId || null,
      telegramUsername: user?.telegramUsername || null,
      botUsername: this.botUsername,
      activeLinks: links.map((l) => ({
        id: l.id,
        role: l.role,
        chatId: l.chatId || user?.telegramId || null,
        token: l.token,
        createdAt: l.createdAt,
      })),
      link: links[0] || (user?.telegramId ? { chatId: user.telegramId, role: 'student' } : null),
    };
  }

  /**
   * Привязка chatId к токену.
   */
  async linkChatId(token: string, chatId: string) {
    const cleanToken = token.replace(/^link_/, '').trim();
    const link = await prisma.telegramNotificationLink.findFirst({
      where: {
        OR: [
          { token },
          { token: cleanToken },
          { token: `link_${cleanToken}` },
        ],
      },
    });
    if (!link) {
      throw new Error('Токен привязки не найден или устарел');
    }
    return prisma.telegramNotificationLink.update({
      where: { id: link.id },
      data: { chatId, isActive: true },
    });
  }

  /**
   * Отправка произвольного сообщения через Telegram Bot API.
   */
  async sendMessage(chatId: string, text: string) {
    if (!this.bot) {
      console.warn(`[TelegramBot] Отправка пропущена: бот не инициализирован. ChatId: ${chatId}`);
      return { success: false, reason: 'bot_not_initialized' };
    }
    try {
      const result = await this.bot.telegram.sendMessage(chatId, text);
      return { success: true, messageId: result.message_id };
    } catch (err: any) {
      console.error(`[TelegramBot] Ошибка отправки сообщения на ${chatId}:`, err?.message || err);
      return { success: false, error: err?.message || 'send_error' };
    }
  }

  /**
   * Реальная отправка еженедельного дайджеста в Telegram.
   */
  async sendWeeklyDigest(chatId: string, digestData?: TelegramDigestData | null, userId?: string) {
    let message: string;
    if (userId) {
      message = await this.compileWeeklyDigest(userId);
    } else if (digestData) {
      message = this.formatDigestHud(digestData);
    } else {
      message = `📊 [ EGE.SYSTEM // ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ]\nТелеметрия успеваемости активна.`;
    }
    return this.sendMessage(chatId, message);
  }

  /**
   * Реальная отправка тревожного алерта в Telegram.
   */
  async sendEmergencyAlert(chatId: string, alertData: TelegramAlertData, userId?: string) {
    let message: string;
    if (userId) {
      message = await this.compileAlertMessage(userId, alertData);
    } else {
      const icon = alertData.severity === 'CRITICAL' ? '🚨 [ ВНИМАНИЕ: СРОЧНЫЙ АЛЕРТ ]' : '⚠️ [ ПРЕДУПРЕЖДЕНИЕ ]';
      message = `${icon} // EGE.SYSTEM\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `СОБЫТИЕ: ${alertData.title}\n` +
        `ДЕТАЛИ: ${alertData.details}\n\n` +
        `Рекомендация: проверьте консоль на платформе или свяжитесь с преподавателем.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ ${process.env.FRONTEND_URL || 'http://localhost:3000'}/console`;
    }
    return this.sendMessage(chatId, message);
  }

  /**
   * Рассылка экстренного системного уведомления всем привязанным аккаунтам.
   */
  async broadcastMessage(text: string) {
    const links = await prisma.telegramNotificationLink.findMany({
      where: { chatId: { not: null }, isActive: true },
    });

    const uniqueChatIds = Array.from(new Set(links.map((l) => l.chatId).filter(Boolean))) as string[];

    // Если задан чат админа, добавляем его в список рассылки
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminChat && !uniqueChatIds.includes(adminChat)) {
      uniqueChatIds.push(adminChat);
    }

    const results: Array<{ chatId: string; success: boolean; error?: string }> = [];
    for (const chatId of uniqueChatIds) {
      const res = await this.sendMessage(chatId, text);
      results.push({ chatId, success: res.success, error: (res as any).error });
    }

    return {
      total: uniqueChatIds.length,
      sent: results.filter((r) => r.success).length,
      details: results,
    };
  }

  /**
   * Форматирование структуры данных дайджеста в HUD-стиле.
   */
  formatDigestHud(data: TelegramDigestData): string {
    const deltaStr = data.scoreDelta >= 0 ? `+${data.scoreDelta}` : `${data.scoreDelta}`;
    const readiness = data.mockExamCount === 0
      ? `• Пробники: еще не сдавались\n• Шанс на бюджет: Не определен (нет данных)\n• Призыв к действию: Для формирования персонального среза пройдите первый пробник в Симуляторе.`
      : `• Средний балл по пробникам: ${data.avgScore} / 100\n• Динамика: ${deltaStr} б. за отчетный период\n• Сданных КИМ: ${data.mockExamCount}\n• Шанс на бюджет: ${data.forecastBudget}`;
    const studyHoursStr = (data.totalStudyHours && data.totalStudyHours > 0) ? `${data.totalStudyHours} ч` : '0 ч';
    const recommendation = data.mockExamCount === 0
      ? 'Для формирования персонального среза пройдите первый пробник в Симуляторе.'
      : 'Сфокусируйтесь на ликвидации слабых тем в разделе «Консоль».';

    return `📊 [ EGE.SYSTEM // ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Ученик: ${data.studentName}

🎯 СРЕЗ ГОТОВНОСТИ К ЭКЗАМЕНУ:
${readiness}

⏳ ДИСЦИПЛИНА И НАГРУЗКА (7 ДНЕЙ):
• Часов самостоятельной работы: ${studyHoursStr}
• Задолженностей по заданиям: ${data.overdueHomeworkCount} шт.
• Тем на ликвидацию: ${data.weakTopicsCount} тем

💡 РЕКОМЕНДАЦИЯ AI:
${recommendation}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Платформа: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`;
  }

  /**
   * Формирование еженедельного дайджеста из БД в HUD-стиле.
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

    // Расчет реальных чистых часов подготовки за последние 7 дней (пробники + симуляции)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSimulations = await prisma.examSimulation.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
      select: { timeSpentSeconds: true },
    });

    const weekMockSeconds = recentMocks
      .filter((m) => new Date(m.examDate) >= sevenDaysAgo)
      .reduce((sum, m) => sum + (m.timeSpentSeconds || 0), 0);
    const weekSimSeconds = recentSimulations.reduce((sum, s) => sum + (s.timeSpentSeconds || 0), 0);
    const totalWeekSeconds = weekMockSeconds + weekSimSeconds;
    const studyHoursFormatted = totalWeekSeconds > 0
      ? `${Math.round((totalWeekSeconds / 3600) * 10) / 10} ч`
      : '0 ч';

    let readinessSection = '';
    if (recentMocks.length === 0) {
      readinessSection = `• Пробники: еще не сдавались\n• Прогноз шанса на бюджет: Не определен (нет данных)\n• Призыв к действию: Для формирования персонального среза пройдите первый пробник в Симуляторе.`;
    } else {
      const avgScore = Math.round(
        recentMocks.reduce((sum, m) => sum + m.totalScore, 0) / recentMocks.length
      );
      const lastMock = recentMocks[0]?.totalScore;
      const delta =
        recentMocks[0]?.deltaScore ??
        (recentMocks.length > 1 ? recentMocks[0].totalScore - recentMocks[1].totalScore : null);
      const deltaStr = delta !== null ? ` (${delta >= 0 ? `+${delta}` : delta} к прошлому)` : '';

      const budgetChance =
        avgScore >= 80 ? 'ВЫСОКИЙ (85%+)' : avgScore >= 68 ? 'СРЕДНИЙ (55%)' : 'НИЗКИЙ (25%)';

      readinessSection = `• Средний балл по пробникам: ${avgScore} / 100\n• Последний КИМ: ${lastMock} б.${deltaStr}\n• Прогноз шанса на бюджет: ${budgetChance}`;
    }

    const overdueCount = user.homeworks.filter(
      (h) => h.deadline && new Date(h.deadline) < new Date()
    ).length;

    const focusTopic = recentMocks.length === 0
      ? 'Для формирования персонального среза пройдите первый пробник в Симуляторе.'
      : user.weakTopics[0]
      ? `Фокус недели: отработать тему «${user.weakTopics[0].topicName}» по предмету ${user.weakTopics[0].subject}.`
      : 'Текущий темп оптимален, продолжайте выполнение ежедневного плана.';

    return `📊 [ EGE.SYSTEM // ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Ученик: ${user.name}

🎯 СРЕЗ ГОТОВНОСТИ К ЭКЗАМЕНУ:
${readinessSection}

⏳ ДИСЦИПЛИНА И НАГРУЗКА (7 ДНЕЙ):
• Чистых часов подготовки: ${studyHoursFormatted}
• Задолженностей по заданиям: ${overdueCount} шт.
• Выявленных тем для ликвидации: ${user.weakTopics.length} тем

💡 РЕКОМЕНДАЦИЯ AI // ТЬЮТОРА:
${focusTopic}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Платформа: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/console`;
  }

  /**
   * Формирование тревожного алерта в HUD-стиле.
   */
  async compileAlertMessage(userId: string, alert: TelegramAlertData): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const name = user?.name || 'Ваш ученик';

    const icon = alert.severity === 'CRITICAL' ? '🚨 [ СРОЧНЫЙ СИСТЕМНЫЙ АЛЕРТ ]' : '⚠️ [ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ ]';
    return `${icon} // EGE.SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Ученик: ${name}

⚡ Событие: ${alert.title}
📋 Детали: ${alert.details}

💡 Рекомендация: свяжитесь с преподавателем или проверьте раздел «Консоль» на платформе.
━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 ${process.env.FRONTEND_URL || 'http://localhost:3000'}/console`;
  }
}

export const telegramBotService = new TelegramBotService();
