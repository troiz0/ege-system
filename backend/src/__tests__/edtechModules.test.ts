import { describe, it, expect } from 'vitest';
import {
  trainerGenerateSchema,
  trainerVerifySchema,
  fipiCheckSchema,
  sosSchema,
} from '../ai/schemas.js';
import {
  MOCK_TRAINER_GENERATE,
  MOCK_TRAINER_VERIFY,
  MOCK_FIPI_CHECK,
  MOCK_SOS,
} from '../services/ai/mocks.js';

describe('EdTech Modules: Schemas and AI Mocks', () => {
  it('валидирует структуру блиц-тренажера ФИПИ', () => {
    const parsed = trainerGenerateSchema.parse(MOCK_TRAINER_GENERATE);
    expect(parsed.questions.length).toBe(3);
    expect(parsed.questions[0].correctAnswer).toBe('4');
    expect(parsed.questions[0].question).toContain('\\log_2');
  });

  it('валидирует сократовскую проверку ответа', () => {
    const parsed = trainerVerifySchema.parse(MOCK_TRAINER_VERIFY);
    expect(parsed.isCorrect).toBe(true);
    expect(parsed.socraticFeedback).toContain('рассуждение');
  });

  it('валидирует проверку решений по критериям ФИПИ (К1, К2)', () => {
    const parsed = fipiCheckSchema.parse(MOCK_FIPI_CHECK);
    expect(parsed.primaryScore).toBe(2);
    expect(parsed.maxScore).toBe(3);
    expect(parsed.k1Score).toBe(2);
    expect(parsed.k2Score).toBe(0);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0].type).toBe('computation');
  });

  it('валидирует SOS-шпаргалку (3 формулы, 2 ловушки, алгоритм)', () => {
    const parsed = sosSchema.parse(MOCK_SOS);
    expect(parsed.formulas.length).toBe(3);
    expect(parsed.pitfalls.length).toBe(2);
    expect(parsed.algorithm.length).toBe(4);
    expect(parsed.formulas[0].latex).toContain('\\sin^2');
  });

  it('рассчитывает алгоритм SM-2 для флешкарт корректно', () => {
    // Начальное состояние
    let interval = 1;
    let easeFactor = 2.5;
    let repetitions = 0;

    // Первое повторение на "хорошо" (q = 4)
    let q = 4;
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (q >= 3) {
      interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * easeFactor);
      repetitions += 1;
    }
    expect(repetitions).toBe(1);
    expect(interval).toBe(1);

    // Второе повторение на "идеально" (q = 5)
    q = 5;
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (q >= 3) {
      interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * easeFactor);
      repetitions += 1;
    }
    expect(repetitions).toBe(2);
    expect(interval).toBe(6);

    // Третье повторение с оценкой 5
    q = 5;
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (q >= 3) {
      interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * easeFactor);
      repetitions += 1;
    }
    expect(repetitions).toBe(3);
    expect(interval).toBeGreaterThan(6);

    // Неудача (q = 2) -> сброс повторений и интервал 1
    q = 2;
    if (q < 3) {
      repetitions = 0;
      interval = 1;
    }
    expect(repetitions).toBe(0);
    expect(interval).toBe(1);
  });
});
