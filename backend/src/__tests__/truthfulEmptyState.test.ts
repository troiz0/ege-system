import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { telegramBotService } from '../services/telegramBot.js';
import { calculateTelemetryPredictor } from '../services/analyticsPredictor.js';

describe('Truthful Empty State Tests (No Fake Hardcoded Data)', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Create clean new user with 0 mocks and 0 tests
    const user = await prisma.user.create({
      data: {
        email: `empty-state-${Date.now()}@example.com`,
        name: 'Новый Ученик',
        role: 'student',
      },
    });
    testUserId = user.id;

    await prisma.userProfile.create({
      data: {
        userId: testUserId,
        grade: 11,
      },
    });
  });

  afterEach(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => null);
    }
  });

  it('Telegram bot weekly digest outputs truthful empty state without fake numbers', async () => {
    const digest = await telegramBotService.compileWeeklyDigest(testUserId);

    // 1. Should not have fake 72
    expect(digest).not.toContain('72 / 100');
    expect(digest).not.toContain('72/');

    // 2. Should not have fake delta +3
    expect(digest).not.toContain('+3 к прошлому');

    // 3. Should not have fake 5.5 hours
    expect(digest).not.toContain('5.5 ч');

    // 4. Should state that mocks have not been taken yet
    expect(digest).toContain('• Пробники: еще не сдавались');

    // 5. Should show 0 study hours for the last 7 days
    expect(digest).toContain('• Чистых часов подготовки: 0 ч');

    // 6. Should include CTA to take first mock in simulator
    expect(digest).toContain('Для формирования персонального среза пройдите первый пробник в Симуляторе.');
  });

  it('Analytics predictor returns hasEnoughData: false and predictedScore: null for empty profiles', async () => {
    const result = await calculateTelemetryPredictor(testUserId);

    expect(result.predictor.hasEnoughData).toBe(false);
    expect(result.predictor.predictedScore).toBeNull();
    expect(result.predictor.estimatedScore).toBeNull();
    expect(result.predictor.minScore).toBeNull();
    expect(result.predictor.maxScore).toBeNull();
    expect(result.predictor.scoreRange).toBeNull();
    expect(result.predictor.recentMockScores).toEqual([]);
  });

  it('Analytics predictor returns hasEnoughData: true when user submits a real mock exam', async () => {
    await prisma.mockExam.create({
      data: {
        userId: testUserId,
        subject: 'Профильная математика',
        examDate: new Date(),
        totalScore: 82,
        timeSpentSeconds: 7200,
      },
    });

    const result = await calculateTelemetryPredictor(testUserId);

    expect(result.predictor.hasEnoughData).toBe(true);
    expect(result.predictor.predictedScore).not.toBeNull();
    expect(result.predictor.recentMockScores).toEqual([82]);

    const digest = await telegramBotService.compileWeeklyDigest(testUserId);
    expect(digest).toContain('82 / 100');
    expect(digest).toContain('Чистых часов подготовки: 2 ч');
  });
});
