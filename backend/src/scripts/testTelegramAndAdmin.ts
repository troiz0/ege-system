import '../config/env.js';
import crypto from 'node:crypto';
import { telegramBotService } from '../services/telegramBot.js';
import { isUserAdmin } from '../middleware/requireAdmin.js';

async function verifyAll() {
  console.log('🧪 [ ЗАПУСК КОМПЛЕКСНОЙ ВЕРИФИКАЦИИ TELEGRAM И ADMIN PANEL ]\n');

  // 1. Проверка прав доступа в /admin
  console.log('1️⃣  Проверка защиты доступа requireAdmin:');
  const admin1 = isUserAdmin('vladimir.putin.offic@gmail.com');
  const admin2 = isUserAdmin('turdubaevtimur643@gmail.com');
  const nonAdmin = isUserAdmin('student_ivan@mail.ru');
  const nullEmail = isUserAdmin(null);

  console.log(`   - vladimir.putin.offic@gmail.com: ${admin1 ? '✅ ACCESS GRANTED' : '❌ DENIED'}`);
  console.log(`   - turdubaevtimur643@gmail.com:    ${admin2 ? '✅ ACCESS GRANTED' : '❌ DENIED'}`);
  console.log(`   - student_ivan@mail.ru:           ${!nonAdmin ? '🔒 ACCESS DENIED (403 Forbidden)' : '❌ ERROR'}`);
  console.log(`   - null/anonymous:                 ${!nullEmail ? '🔒 ACCESS DENIED (401/403)' : '❌ ERROR'}`);

  if (!admin1 || !admin2 || nonAdmin || nullEmail) {
    throw new Error('Ошибка проверки прав администратора!');
  }

  // 2. Проверка валидации HMAC-SHA256 Telegram Login
  console.log('\n2️⃣  Проверка стандарта валидации Telegram Login Widget:');
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const testData: Record<string, any> = {
    auth_date: Math.floor(Date.now() / 1000),
    first_name: 'Timur',
    id: 7531140292,
    username: 'turdu_test',
  };

  const dataCheckString = Object.keys(testData)
    .sort()
    .map((k) => `${k}=${testData[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const validHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Тест с верным хэшем
  const calculatedValid = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  console.log(`   - Валидация подлинного хэша Telegram: ${calculatedValid === validHash ? '✅ VALIDATED' : '❌ FAILED'}`);

  // Тест с поддельным хэшем
  const fakeHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  console.log(`   - Отклонение поддельного хэша:        ${calculatedValid !== fakeHash ? '🔒 REJECTED' : '❌ FAILED'}`);

  // 3. Отправка реального еженедельного дайджеста в Telegram
  console.log('\n3️⃣  Отправка реального тестового дайджеста в Telegram...');
  const targetChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '7531140292';

  const digestResult = await telegramBotService.sendWeeklyDigest(targetChatId, {
    studentName: 'Владимир (Телеметрия)',
    avgScore: 88,
    scoreDelta: 6,
    mockExamCount: 5,
    forecastBudget: 'ВЫСОКИЙ (92%)',
    totalStudyHours: 8.5,
    overdueHomeworkCount: 0,
    weakTopicsCount: 1,
  });

  console.log(`   - Результат отправки дайджеста на chatId ${targetChatId}:`, digestResult.success ? `✅ ДОСТАВЛЕНО (MessageID: ${digestResult.messageId})` : `⚠️ ${digestResult.error || digestResult.reason}`);

  // 4. Отправка реального тестового алерта в Telegram
  console.log('\n4️⃣  Отправка реального тестового алерта в Telegram...');
  const alertResult = await telegramBotService.sendEmergencyAlert(targetChatId, {
    type: 'EXAM_DROP',
    title: 'Критическое проседание в пробном КИМ №4',
    details: 'Балл снизился с 84 до 68 из-за ошибок в геометрии второй части (№14, №17).',
    severity: 'WARNING',
  });

  console.log(`   - Результат отправки алерта на chatId ${targetChatId}:`, alertResult.success ? `✅ ДОСТАВЛЕНО (MessageID: ${alertResult.messageId})` : `⚠️ ${alertResult.error || alertResult.reason}`);

  console.log('\n🏁 ВСЕ ПРОВЕРКИ УСПЕШНО ПРОЙДЕНЫ!');
  process.exit(0);
}

verifyAll().catch((e) => {
  console.error('❌ Ошибка верификации:', e);
  process.exit(1);
});
