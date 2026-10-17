import '../config/env.js';
import { Telegraf } from 'telegraf';

async function setupBotProfile() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ Ошибка: переменная TELEGRAM_BOT_TOKEN не задана в .env файле.');
    process.exit(1);
  }

  console.log('⚡ Инициализация настройки профиля Telegram-бота EGE.SYSTEM...');

  try {
    let agent: any = undefined;
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
      try {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
        console.log(`🌐 Использование HTTP-прокси: ${proxyUrl}`);
      } catch (err) {
        console.warn('Предупреждение загрузки прокси-агента:', err);
      }
    }

    const bot = new Telegraf(token, {
      telegram: { agent },
    });

    const me = await bot.telegram.getMe();
    console.log(`🤖 Бот найден: @${me.username} (ID: ${me.id}, Имя: ${me.first_name})`);

    // 1. Имя бота (setMyName)
    console.log('1️⃣  Обновление имени бота (setMyName)...');
    await bot.telegram.setMyName('EGE.SYSTEM // AI-Ассистент');
    console.log('   ✅ Имя успешно установлено: "EGE.SYSTEM // AI-Ассистент"');

    // 2. Полное описание бота (setMyDescription) — отображается до нажатия кнопки Start
    console.log('2️⃣  Обновление описания (setMyDescription)...');
    await bot.telegram.setMyDescription(
      'Официальный бот платформы EGE.SYSTEM. Еженедельная аналитика прогресса ЕГЭ/ОГЭ, алерты об оценках и мгновенная связь с AI-тьютором.'
    );
    console.log('   ✅ Описание успешно установлено.');

    // 3. Короткое описание бота (setMyShortDescription) — отображается в шапке профиля бота
    console.log('3️⃣  Обновление краткого описания (setMyShortDescription)...');
    await bot.telegram.setMyShortDescription(
      'Телеметрия подготовки к ЕГЭ и контроль успеваемости EGE.SYSTEM.'
    );
    console.log('   ✅ Краткое описание успешно установлено.');

    // 4. Меню команд бота (setMyCommands)
    console.log('4️⃣  Установка списка команд (setMyCommands)...');
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Запустить телеметрию и привязать аккаунт' },
      { command: 'status', description: 'Проверить статус синхронизации с сайтом' },
      { command: 'digest', description: 'Получить свежий дайджест успеваемости' },
      { command: 'bug', description: 'Сообщить об ошибке разработчику' },
      { command: 'help', description: 'Справка по командам и платформе' },
    ]);
    console.log('   ✅ Список команд успешно зарегистрирован: /start, /status, /digest, /bug, /help');

    console.log('\n🎉 [ ПРОФИЛЬ БОТА УСПЕШНО НАСТРОЕН // EGE.SYSTEM ]');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 Для установки аватарки бота:');
    console.log('1. Откройте диалог с официальным ботом @BotFather');
    console.log('2. Отправьте команду: /setuserpic');
    console.log(`3. Выберите бота: @${me.username}`);
    console.log('4. Прикрепите сгенерированный файл: public/bot-avatar.png');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error: any) {
    console.error('❌ Ошибка при настройке профиля бота:', error?.message || error);
    process.exit(1);
  }
}

setupBotProfile();
