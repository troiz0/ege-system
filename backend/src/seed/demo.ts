import { prisma } from '../lib/prisma.js';
import { MODELS } from '../config/models.js';

const DEFAULT_AI_MODEL = MODELS[0].slug; // google/gemini-3.8-flash

export async function seedDemoData(userId: string) {
  console.log(`Seeding demo data for user ${userId}...`);

  // Создаём профиль пользователя
  await prisma.userProfile.create({
    data: {
      userId,
      grade: 10,
      track: 'IT-класс',
      prepStartDate: new Date('2026-09-01'),
      prepEndDate: new Date('2027-06-15'),
      prepMode: 'full_year',
      pace: 'moderate',
      weekdayStudyHours: 2,
      weekendStudyHours: 4,
      notes: 'Демо-профиль с реалистичными данными',
    },
  });

  // Целевые предметы (SQLite не поддерживает createMany, используем create в цикле)
  await prisma.targetSubject.create({
    data: {
      userId,
      subjectName: 'Информатика',
      targetScore: 90,
      currentEstimatedScore: 75,
      examDate: new Date('2027-06-20'),
    },
  });

  await prisma.targetSubject.create({
    data: {
      userId,
      subjectName: 'Профильная математика',
      targetScore: 80,
      currentEstimatedScore: 68,
      examDate: new Date('2027-06-10'),
    },
  });

  await prisma.targetSubject.create({
    data: {
      userId,
      subjectName: 'Русский язык',
      targetScore: 85,
      currentEstimatedScore: 78,
      examDate: new Date('2027-06-05'),
    },
  });

  // Расписание: 5 дней, четверг самый тяжёлый (8 уроков), среда лёгкий (5 уроков)
  const schedule = [
    // Понедельник (6 уроков)
    { dayOfWeek: 1, subject: 'Русский язык', startTime: '08:30', endTime: '09:15', difficulty: 'medium' },
    { dayOfWeek: 1, subject: 'Алгебра', startTime: '09:25', endTime: '10:10', difficulty: 'high' },
    { dayOfWeek: 1, subject: 'Физика', startTime: '10:20', endTime: '11:05', difficulty: 'high' },
    { dayOfWeek: 1, subject: 'Английский язык', startTime: '11:25', endTime: '12:10', difficulty: 'medium' },
    { dayOfWeek: 1, subject: 'История', startTime: '12:20', endTime: '13:05', difficulty: 'low' },
    { dayOfWeek: 1, subject: 'Физкультура', startTime: '13:15', endTime: '14:00', difficulty: 'low' },

    // Вторник (7 уроков)
    { dayOfWeek: 2, subject: 'Информатика', startTime: '08:30', endTime: '09:15', difficulty: 'high' },
    { dayOfWeek: 2, subject: 'Геометрия', startTime: '09:25', endTime: '10:10', difficulty: 'high' },
    { dayOfWeek: 2, subject: 'Литература', startTime: '10:20', endTime: '11:05', difficulty: 'medium' },
    { dayOfWeek: 2, subject: 'Химия', startTime: '11:25', endTime: '12:10', difficulty: 'medium' },
    { dayOfWeek: 2, subject: 'Английский язык', startTime: '12:20', endTime: '13:05', difficulty: 'medium' },
    { dayOfWeek: 2, subject: 'Обществознание', startTime: '13:15', endTime: '14:00', difficulty: 'low' },
    { dayOfWeek: 2, subject: 'ОБЖ', startTime: '14:10', endTime: '14:55', difficulty: 'low' },

    // Среда (5 уроков - лёгкий день)
    { dayOfWeek: 3, subject: 'Алгебра', startTime: '08:30', endTime: '09:15', difficulty: 'high' },
    { dayOfWeek: 3, subject: 'Русский язык', startTime: '09:25', endTime: '10:10', difficulty: 'medium' },
    { dayOfWeek: 3, subject: 'Биология', startTime: '10:20', endTime: '11:05', difficulty: 'low' },
    { dayOfWeek: 3, subject: 'География', startTime: '11:25', endTime: '12:10', difficulty: 'low' },
    { dayOfWeek: 3, subject: 'Физкультура', startTime: '12:20', endTime: '13:05', difficulty: 'low' },

    // Четверг (8 уроков - тяжёлый день)
    { dayOfWeek: 4, subject: 'Информатика', startTime: '08:30', endTime: '09:15', difficulty: 'high' },
    { dayOfWeek: 4, subject: 'Информатика (практика)', startTime: '09:25', endTime: '10:10', difficulty: 'high', originalMeshName: 'Информатика' },
    { dayOfWeek: 4, subject: 'Геометрия', startTime: '10:20', endTime: '11:05', difficulty: 'high' },
    { dayOfWeek: 4, subject: 'Физика', startTime: '11:25', endTime: '12:10', difficulty: 'high' },
    { dayOfWeek: 4, subject: 'Английский язык', startTime: '12:20', endTime: '13:05', difficulty: 'medium' },
    { dayOfWeek: 4, subject: 'Русский язык', startTime: '13:15', endTime: '14:00', difficulty: 'medium' },
    { dayOfWeek: 4, subject: 'Литература', startTime: '14:10', endTime: '14:55', difficulty: 'medium' },
    { dayOfWeek: 4, subject: 'История', startTime: '15:05', endTime: '15:50', difficulty: 'low' },

    // Пятница (6 уроков)
    { dayOfWeek: 5, subject: 'Алгебра', startTime: '08:30', endTime: '09:15', difficulty: 'high' },
    { dayOfWeek: 5, subject: 'Физика', startTime: '09:25', endTime: '10:10', difficulty: 'high' },
    { dayOfWeek: 5, subject: 'Русский язык', startTime: '10:20', endTime: '11:05', difficulty: 'medium' },
    { dayOfWeek: 5, subject: 'Химия', startTime: '11:25', endTime: '12:10', difficulty: 'medium' },
    { dayOfWeek: 5, subject: 'Английский язык', startTime: '12:20', endTime: '13:05', difficulty: 'medium' },
    { dayOfWeek: 5, subject: 'Физкультура', startTime: '13:15', endTime: '14:00', difficulty: 'low' },
  ];

  // SQLite не поддерживает createMany, используем Promise.all
  await Promise.all(
    schedule.map((item) =>
      prisma.scheduleItem.create({
        data: { ...item, userId },
      })
    )
  );

  // Домашние задания (3 активных)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);

  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(23, 59, 0, 0);

  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  threeDaysLater.setHours(23, 59, 0, 0);

  await prisma.homework.create({
    data: {
      userId,
      subject: 'Информатика',
      title: 'Разобрать задачу 27 из ЕГЭ',
      description: 'Задание в файле task_27.pdf',
      deadline: tomorrow,
      estimatedMinutes: 60,
      priority: 'high',
      status: 'pending',
      hasAttachment: true,
      attachmentPath: '/uploads/demo/task_27.pdf',
      detectedTopics: JSON.stringify(['Динамическое программирование', 'Оптимизация']),
      aiHint: 'Попробуйте разложить задачу на подзадачи и использовать мемоизацию',
    },
  });

  await prisma.homework.create({
    data: {
      userId,
      subject: 'Профильная математика',
      title: 'Решить задания 12-14 из задачника',
      description: 'Тригонометрические уравнения',
      deadline: dayAfter,
      estimatedMinutes: 45,
      priority: 'medium',
      status: 'pending',
      hasAttachment: false,
      detectedTopics: JSON.stringify(['Тригонометрия', 'Уравнения']),
    },
  });

  await prisma.homework.create({
    data: {
      userId,
      subject: 'Русский язык',
      title: 'Написать сочинение по тексту',
      description: 'Формат ЕГЭ, задание 27',
      deadline: threeDaysLater,
      estimatedMinutes: 90,
      priority: 'medium',
      status: 'pending',
      hasAttachment: false,
      detectedTopics: JSON.stringify(['Сочинение', 'Аргументация']),
    },
  });

  // Оценки (4 записи)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  await prisma.testResult.create({
    data: {
      userId,
      subject: 'Профильная математика',
      title: 'Контрольная работа по тригонометрии',
      scaleType: '5_point',
      score: 3,
      maxScore: 5,
      normalizedPercent: 60,
      testDate: twoWeeksAgo,
      mistakeTopics: JSON.stringify(['Тригонометрические уравнения', 'Обратные функции']),
      comment: 'Ошибки в сложных уравнениях',
    },
  });

  await prisma.testResult.create({
    data: {
      userId,
      subject: 'Физика',
      title: 'Самостоятельная работа: Механика',
      scaleType: '10_point',
      score: 9,
      maxScore: 10,
      normalizedPercent: 90,
      testDate: weekAgo,
      mistakeTopics: JSON.stringify([]),
      comment: 'Отличный результат',
    },
  });

  await prisma.testResult.create({
    data: {
      userId,
      subject: 'Информатика',
      title: 'Тест по алгоритмам',
      scaleType: '100_point',
      score: 78,
      maxScore: 100,
      normalizedPercent: 78,
      testDate: weekAgo,
      mistakeTopics: JSON.stringify(['Динамическое программирование', 'Теория графов']),
    },
  });

  await prisma.testResult.create({
    data: {
      userId,
      subject: 'Русский язык',
      title: 'Диктант',
      scaleType: '5_point',
      score: 4,
      maxScore: 5,
      normalizedPercent: 80,
      testDate: new Date(),
      mistakeTopics: JSON.stringify(['Пунктуация']),
    },
  });

  // Пробники (2 записи с прогрессом)
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  await prisma.mockExam.create({
    data: {
      userId,
      subject: 'Профильная математика',
      examDate: twoMonthsAgo,
      totalScore: 56,
      primaryScore: 12,
      missedTasks: JSON.stringify(['13', '18']),
      mistakeTopics: JSON.stringify(['Стереометрия', 'Параметры']),
      deltaScore: null,
      aiVerdict: 'Первый пробник. Нужно усилить геометрию и параметры.',
    },
  });

  await prisma.mockExam.create({
    data: {
      userId,
      subject: 'Профильная математика',
      examDate: monthAgo,
      totalScore: 68,
      primaryScore: 15,
      missedTasks: JSON.stringify(['13', '18']),
      mistakeTopics: JSON.stringify(['Стереометрия', 'Параметры']),
      deltaScore: 12,
      aiVerdict: 'Прогресс +12 баллов! Продолжайте отрабатывать стереометрию.',
    },
  });

  // Слабые темы
  await prisma.weakTopic.create({
    data: {
      userId,
      subject: 'Профильная математика',
      topicName: 'Стереометрия',
      frequency: 2,
      lastFailedDate: monthAgo,
      isResolved: false,
    },
  });

  await prisma.weakTopic.create({
    data: {
      userId,
      subject: 'Профильная математика',
      topicName: 'Параметры',
      frequency: 2,
      lastFailedDate: monthAgo,
      isResolved: false,
    },
  });

  await prisma.weakTopic.create({
    data: {
      userId,
      subject: 'Профильная математика',
      topicName: 'Тригонометрия',
      frequency: 1,
      lastFailedDate: twoWeeksAgo,
      isResolved: false,
    },
  });

  // Материалы для изучения
  await prisma.topicStudyMaterial.create({
    data: {
      userId,
      subject: 'Профильная математика',
      topicName: 'Стереометрия',
      summaryTheory: 'Основные методы решения задач по стереометрии: метод координат, векторный метод, классические построения.',
      formulas: 'V_пирамиды = (1/3) * S_основания * h; V_конуса = (1/3) * π * r² * h; S_сферы = 4πr²',
      pitfalls: 'Не забывайте проверять единицы измерения и правильность построений',
      algorithm: '1. Построить чертёж\n2. Выбрать метод (координаты/векторы)\n3. Решить аналитически\n4. Проверить ответ',
      reshuEgeUrl: 'https://ege.sdamgia.ru/test?theme=116',
      fipiUrl: 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege#!/tab/173765699-13',
      videoQuery: 'стереометрия ЕГЭ профиль задание 13',
    },
  });

  await prisma.topicStudyMaterial.create({
    data: {
      userId,
      subject: 'Профильная математика',
      topicName: 'Тригонометрия',
      summaryTheory: 'Основные тригонометрические формулы, решение уравнений, отбор корней.',
      formulas: 'sin²x + cos²x = 1; sin(2x) = 2sin(x)cos(x); cos(2x) = cos²x - sin²x',
      pitfalls: 'Часто забывают про отбор корней на заданном промежутке',
      algorithm: '1. Упростить уравнение\n2. Найти общее решение\n3. Отобрать корни на промежутке',
      reshuEgeUrl: 'https://ege.sdamgia.ru/test?theme=43',
      fipiUrl: 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege#!/tab/173765699-12',
      videoQuery: 'тригонометрия ЕГЭ профиль задание 12',
    },
  });

  // План подготовки на 2 недели
  const today = new Date();
  const planItems = [];

  for (let day = 0; day < 14; day++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + day);
    targetDate.setHours(18, 0, 0, 0);

    if (targetDate.getDay() === 0) continue; // Пропускаем воскресенье

    const isWeekend = targetDate.getDay() === 6;

    if (day % 3 === 0) {
      planItems.push({
        userId,
        targetDate,
        subject: 'Профильная математика',
        topic: 'Стереометрия',
        kind: 'theory',
        durationMinutes: isWeekend ? 90 : 60,
        isCompleted: day < 3,
        priority: 'high',
        materialId: null,
      });
    } else if (day % 3 === 1) {
      planItems.push({
        userId,
        targetDate,
        subject: 'Профильная математика',
        topic: 'Стереометрия',
        kind: 'practice_kim',
        durationMinutes: isWeekend ? 120 : 60,
        isCompleted: day < 3,
        priority: 'high',
        materialId: null,
      });
    } else {
      planItems.push({
        userId,
        targetDate,
        subject: 'Информатика',
        topic: 'Динамическое программирование',
        kind: 'practice_kim',
        durationMinutes: isWeekend ? 90 : 45,
        isCompleted: false,
        priority: 'medium',
        materialId: null,
      });
    }
  }

  await Promise.all(
    planItems.map((item) =>
      prisma.studyPlanItem.create({
        data: item,
      })
    )
  );

  // AI Snapshot
  await prisma.aiAnalysisSnapshot.create({
    data: {
      userId,
      demoMode: true,
      rawResponseJson: JSON.stringify({
        summary: 'Демо-анализ нагрузки',
        verdict: 'Четверг перегружен (8 уроков). Рекомендуется перенести часть домашних заданий на среду.',
        risks: ['Перегрузка в четверг', 'Недостаточно времени на подготовку к ЕГЭ по математике'],
        recommendations: [
          'Добавить 30 минут ежедневной практики по стереометрии',
          'Перенести одно домашнее задание со среды на воскресенье',
        ],
      }),
    },
  });

  console.log('✅ Demo data seeded successfully');
}

// Если скрипт запущен напрямую
async function main() {
  try {
    // Очищаем старые данные если есть
    const existingUser = await prisma.user.findUnique({
      where: { email: 'demo@example.com' },
    });

    if (existingUser) {
      console.log('🗑️  Deleting existing demo user and related data...');
      await prisma.user.delete({
        where: { id: existingUser.id },
      });
    }

    // Создаём демо-пользователя
    const demoUser = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        name: 'Демо Пользователь',
        authProvider: 'DEMO',
        subscriptionTier: 'PRO',
        isDemo: true,
        selectedAiModel: DEFAULT_AI_MODEL,
        trafficUsedPercent: 18,
        freeAiRequestsLeft: 3,
      },
    });

    await seedDemoData(demoUser.id);
    console.log(`✅ Created demo user with ID: ${demoUser.id}`);
  } catch (error) {
    console.error('Error seeding data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем, если это главный модуль
if (import.meta.url.startsWith('file:')) {
  const modulePath = import.meta.url.slice(7);
  const scriptPath = process.argv[1].replace(/\\/g, '/');
  if (modulePath === scriptPath || modulePath.endsWith(scriptPath)) {
    main();
  }
}
