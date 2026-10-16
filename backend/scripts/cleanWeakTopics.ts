import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.weakTopic.findMany();

  const toDelete = all.filter((w) => {
    const t = w.topicName;
    const s = w.subject;
    return (
      t.includes('МЭШ') ||
      t.includes('ЦДЗ') ||
      t.includes('успеваемость') ||
      t.includes('Практическая работа') ||
      t.includes('Контрольная работа') ||
      t.includes('Опрос') ||
      t.includes('Учебное задание') ||
      t.includes('письменный опрос') ||
      t.includes('Решение задач') ||
      t.includes('Личное письмо') ||
      t.includes('Диагностическая работа') ||
      t.includes('Самостоятельная работа') ||
      t.includes('Доклад') ||
      t.includes('Реферат') ||
      t.includes('Диалог') ||
      t.includes('Полилог') ||
      t.includes('Словарный диктант') ||
      t.includes('Письменный ответ') ||
      t.includes('Тест') ||
      t.includes('Устный ответ') ||
      t === 'Общая тема' ||
      s.includes('Основы безопасности')
    );
  });

  if (toDelete.length > 0) {
    const deleted = await prisma.weakTopic.deleteMany({
      where: {
        id: { in: toDelete.map((x) => x.id) },
      },
    });
    console.log(`Deleted ${deleted.count} additional school task type records.`);
  }

  const remaining = await prisma.weakTopic.findMany();
  console.log(`Final authentic EGE topics in WeakTopic (${remaining.length}):`);
  for (const item of remaining) {
    console.log(` + [${item.subject}] ${item.topicName} (freq: ${item.frequency})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
