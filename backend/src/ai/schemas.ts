import { z } from 'zod';

const time = z.string().regex(/^\d{1,2}:\d{2}$/);

export const analysisAiSchema = z.object({
  burnoutExplanation: z.string(),
  pacingExplanation: z.string(),
  gapReasons: z.array(
    z.object({
      topic: z.string(),
      reason: z.string(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'high', 'medium', 'low']).optional(),
    })
  ),
  mockExamAnalysis: z.string(),
  recommendations: z.array(z.object({ day: z.string(), text: z.string() })).min(1).max(6),
});
export const scheduleAiSchema = z.object({
  items: z.array(z.object({ dayOfWeek: z.number().int().min(1).max(6), originalMeshName: z.string(), startTime: time, endTime: time })),
});
export const homeworkAiSchema = z.object({
  items: z.array(z.object({ subject: z.string(), title: z.string(), description: z.string(), deadline: z.string() })),
});
export const attachmentAiSchema = z.object({
  text: z.string(), topics: z.array(z.string()), difficulty: z.enum(['low', 'medium', 'high']), steps: z.array(z.string()),
});
export const explainAiSchema = z.object({
  topic: z.string(),
  egePrototype: z.string().nullable(),
  steps: z.array(z.string()),
  formulas: z.string(),
});
export const materialAiSchema = z.object({
  summaryTheory: z.string(), formulas: z.string(), pitfalls: z.string(), algorithm: z.string(), videoQuery: z.string(),
});
export const verdictAiSchema = z.object({
  verdict: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const trainerQuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).nullable().optional(),
  correctAnswer: z.string(),
  explanation: z.string(),
  fipiCriteria: z.string().optional(),
});

export const trainerGenerateSchema = z.object({
  questions: z.array(trainerQuizQuestionSchema).min(1).max(5),
});

export const trainerVerifySchema = z.object({
  isCorrect: z.boolean(),
  socraticFeedback: z.string(),
  hint: z.string().optional(),
});

export const fipiErrorItemSchema = z.object({
  type: z.enum(['logic', 'computation', 'notation', 'criteria']),
  description: z.string(),
  quote: z.string().optional(),
  recommendation: z.string(),
});

export const detailedCriterionSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
  maxScore: z.number(),
  comment: z.string().optional(),
});

export const fipiCheckSchema = z.object({
  primaryScore: z.number(),
  maxScore: z.number(),
  k1Score: z.number(),
  k1Max: z.number(),
  k1Comment: z.string(),
  k2Score: z.number(),
  k2Max: z.number(),
  k2Comment: z.string(),
  detailedCriteria: z.array(detailedCriterionSchema).optional(),
  errors: z.array(fipiErrorItemSchema),
  expertVerdict: z.string(),
});

export const sosFormulaSchema = z.object({
  title: z.string(),
  latex: z.string(),
  note: z.string(),
});

export const sosPitfallSchema = z.object({
  title: z.string(),
  explanation: z.string(),
});

export const sosAlgorithmStepSchema = z.object({
  step: z.number(),
  instruction: z.string(),
});

export const sosSchema = z.object({
  formulas: z.array(sosFormulaSchema).min(2).max(4),
  pitfalls: z.array(sosPitfallSchema).min(1).max(3),
  algorithm: z.array(sosAlgorithmStepSchema).min(1).max(8),
});

export const appealRiskSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  verdictTitle: z.string(),
  riskPercentage: z.number().min(0).max(100),
  summary: z.string(),
  upside: z.object({
    potentialDelta: z.number(),
    arguments: z.array(z.string()),
    criteriaAnalysis: z.string(),
  }),
  downside: z.object({
    riskDelta: z.number(),
    vulnerabilities: z.array(z.string()),
    hiddenRisks: z.string(),
  }),
  commissionStrategy: z.string(),
});

export type AnalysisAiResult = z.infer<typeof analysisAiSchema>;
export type ScheduleAiResult = z.infer<typeof scheduleAiSchema>;
export type HomeworkAiResult = z.infer<typeof homeworkAiSchema>;
export type AttachmentAiResult = z.infer<typeof attachmentAiSchema>;
export type ExplainAiResult = z.infer<typeof explainAiSchema>;
export type MaterialAiResult = z.infer<typeof materialAiSchema>;
export type VerdictAiResult = z.infer<typeof verdictAiSchema>;
export type TrainerQuizQuestion = z.infer<typeof trainerQuizQuestionSchema>;
export type TrainerGenerateResult = z.infer<typeof trainerGenerateSchema>;
export type TrainerVerifyAiResult = z.infer<typeof trainerVerifySchema>;
export type FipiCheckResult = z.infer<typeof fipiCheckSchema>;
export type SosSummaryResult = z.infer<typeof sosSchema>;
export type AppealRiskResult = z.infer<typeof appealRiskSchema>;
