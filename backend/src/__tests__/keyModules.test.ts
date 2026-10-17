import { describe, it, expect } from 'vitest';
import { appealRiskSchema } from '../ai/schemas.js';
import { MOCK_APPEAL_RISK } from '../services/ai/mocks.js';
import { EXPERT_SCENARIOS } from '../services/expertModeScenarios.js';
import { calculateLevel } from '../services/xpService.js';
import { getMockChatReply } from '../services/ai/openrouterClient.js';

describe('Key Modules 2026: Verification & Telemetry', () => {
  it('валидирует схему рисков апелляции (Upside vs Downside)', () => {
    const parsed = appealRiskSchema.parse(MOCK_APPEAL_RISK);
    expect(parsed.riskLevel).toBe('LOW');
    expect(parsed.verdictTitle).toBe('[ НИЗКИЙ РИСК: ПОДАВАТЬ ]');
    expect(parsed.upside.potentialDelta).toBeGreaterThanOrEqual(1);
    expect(parsed.downside.riskDelta).toBe(0);
    expect(parsed.upside.arguments.length).toBeGreaterThan(0);
    expect(parsed.commissionStrategy).toContain('ФИПИ');
  });

  it('проверяет сценарии режима «ЕГЭ-Эксперт» по всем 3 уровням сложности', () => {
    expect(EXPERT_SCENARIOS.length).toBeGreaterThanOrEqual(6);

    const level1 = EXPERT_SCENARIOS.filter((s) => s.level === 1);
    const level2 = EXPERT_SCENARIOS.filter((s) => s.level === 2);
    const level3 = EXPERT_SCENARIOS.filter((s) => s.level === 3);

    expect(level1.length).toBeGreaterThan(0);
    expect(level2.length).toBeGreaterThan(0);
    expect(level3.length).toBeGreaterThan(0);

    // Проверяем структуру шагов и официального вердикта
    for (const sc of EXPERT_SCENARIOS) {
      expect(sc.steps.length).toBeGreaterThanOrEqual(3);
      expect(sc.criterionOptions.length).toBeGreaterThanOrEqual(2);
      expect(sc.fipiOfficialVerdict.verdictText.length).toBeGreaterThan(20);
      expect(sc.fipiOfficialVerdict.recommendation.length).toBeGreaterThan(10);
      expect(sc.xpReward).toBeGreaterThanOrEqual(25);
    }
  });

  it('генератор демо-ответа AI-чата создает блок plotter при запросе параметра', () => {
    const reply = getMockChatReply('Покажи параметрический график для задачи с параметром №18');
    expect(reply).toContain('```plotter');
    expect(reply).toContain('"fn": "x^2 - 4*x + a"');
    expect(reply).toContain('"param": "a"');
    expect(reply).toContain('"target": "x - 2"');
  });

  it('рассчитывает уровень пользователя по шкале XP', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(10)).toBe(1);
    expect(calculateLevel(11)).toBe(2);
    expect(calculateLevel(25)).toBe(2);
    expect(calculateLevel(26)).toBe(3);
    expect(calculateLevel(50)).toBe(3);
    expect(calculateLevel(51)).toBe(4);
  });
});
