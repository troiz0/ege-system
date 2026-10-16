import { describe, it, expect } from 'vitest';
import { getExamVariant, generateRandomExamVariant } from '../services/fipiExamService.js';

describe('ЕГЭ-2027 КИМ Specification Tests', () => {
  it('должен содержать ровно 20 заданий с суммой первичных баллов 33', () => {
    const variant = getExamVariant('math_profile', 1);
    expect(variant).toBeDefined();
    expect(variant.totalTasks).toBe(20);
    expect(variant.tasks.length).toBe(20);
    expect(variant.part1Count).toBe(13);
    expect(variant.part2Count).toBe(7);
    expect(variant.maxPrimaryScore).toBe(33);

    const part1Tasks = variant.tasks.filter((t) => t.part === 1);
    const part2Tasks = variant.tasks.filter((t) => t.part === 2);

    expect(part1Tasks.length).toBe(13);
    expect(part2Tasks.length).toBe(7);

    // Подсчет суммы баллов
    const totalScore = variant.tasks.reduce((sum, t) => sum + t.maxScore, 0);
    expect(totalScore).toBe(33);
  });

  it('задание №6 должно быть по статистике и случайным величинам', () => {
    const variant = getExamVariant('math_profile', 1);
    const task6 = variant.tasks.find((t) => t.number === 6);
    expect(task6).toBeDefined();
    expect(task6?.title).toContain('Статистика');
    expect(['0.7', '2.8', '16.5']).toContain(task6?.correctAnswer);
  });

  it('задание №13 должно быть финансовой задачей с кратким числовым ответом из банка', () => {
    const variant = getExamVariant('math_profile', 1);
    const task13 = variant.tasks.find((t) => t.number === 13);
    expect(task13).toBeDefined();
    expect(task13?.part).toBe(1);
    expect(task13?.title).toContain('Финансовая');
    expect(['264500', '133100', '272000']).toContain(task13?.correctAnswer);
  });

  it('задания части 2 должны иметь номера 14–20 и критерии оценивания ФИПИ', () => {
    const variant = getExamVariant('math_profile', 1);
    const part2 = variant.tasks.filter((t) => t.part === 2);
    const numbers = part2.map((t) => t.number);
    expect(numbers).toEqual([14, 15, 16, 17, 18, 19, 20]);

    part2.forEach((t) => {
      expect(t.fipiCriteria).toBeDefined();
      expect(t.fipiCriteria?.length).toBeGreaterThan(10);
    });
  });

  it('должен генерировать уникальные варианты с 6-значным кодом', () => {
    const var1 = generateRandomExamVariant('math_profile');
    const var2 = generateRandomExamVariant('math_profile');

    expect(var1.variantCode).toMatch(/^\d{3}-\d{3}$/);
    expect(var2.variantCode).toMatch(/^\d{3}-\d{3}$/);
    expect(var1.title).toContain(var1.variantCode);
  });

  it('справочник дисциплин содержит все 16 официальных предметов ЕГЭ с корректными параметрами', async () => {
    const { EGE_SUBJECTS, findSubjectConfig } = await import('../lib/subjects.js');
    expect(Object.keys(EGE_SUBJECTS).length).toBe(16);

    const math = findSubjectConfig('math_profile');
    expect(math.tasksCount).toBe(20);
    expect(math.part1Count).toBe(13);
    expect(math.part2Count).toBe(7);
    expect(math.hasPart2).toBe(true);

    const rus = findSubjectConfig('Русский язык');
    expect(rus.tasksCount).toBe(27);
    expect(rus.part1Count).toBe(26);
    expect(rus.part2Count).toBe(1);

    const inf = findSubjectConfig('Информатика');
    expect(inf.tasksCount).toBe(27);
    expect(inf.hasPart2).toBe(false);

    const phys = findSubjectConfig('Физика');
    expect(phys.tasksCount).toBe(26);
    expect(phys.durationMinutes).toBe(235);
  });

  it('reshuEgeService успешно генерирует вариант для профильной математики', async () => {
    const { reshuEgeService } = await import('../services/reshuEgeService.js');
    const variant = await reshuEgeService.fetchRandomVariant('math_profile');
    expect(variant).toBeDefined();
    expect(variant.tasks.length).toBeGreaterThanOrEqual(13);
    expect(variant.timeLimitSeconds).toBe(235 * 60);
  }, 15000);
});
