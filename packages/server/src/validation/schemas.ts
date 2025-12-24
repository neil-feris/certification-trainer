import { z } from 'zod';
import { EXAM_SIZE_OPTIONS, DRILL_QUESTION_COUNTS, DRILL_TIME_LIMITS } from '@ace-prep/shared';

// ============ Common Schemas ============

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a positive integer').transform(Number),
});

export const orderParamSchema = z.object({
  order: z.string().regex(/^\d+$/, 'Order must be a positive integer').transform(Number),
});

export const topicIdParamSchema = z.object({
  topicId: z.string().regex(/^\d+$/, 'Topic ID must be a positive integer').transform(Number),
});

export const providerParamSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
});

// ============ Exam Schemas ============

export const createExamSchema = z.object({
  focusDomains: z.array(z.number().int().positive()).optional(),
  questionCount: z.number().int().refine(
    (val) => (EXAM_SIZE_OPTIONS as readonly number[]).includes(val),
    { message: `Question count must be one of: ${EXAM_SIZE_OPTIONS.join(', ')}` }
  ).optional(),
});

export const submitAnswerSchema = z.object({
  questionId: z.number().int().positive('Question ID must be a positive integer'),
  selectedAnswers: z.array(z.number().int().min(0)).min(0),
  timeSpentSeconds: z.number().int().min(0).optional(),
  flagged: z.boolean().optional(),
});

export const completeExamSchema = z.object({
  totalTimeSeconds: z.number().int().min(0, 'Total time must be non-negative'),
});

// ============ Question Schemas ============

// Pagination defaults and limits
export const PAGINATION_DEFAULTS = {
  limit: 50,
  maxLimit: 200,
  offset: 0,
} as const;

export const questionQuerySchema = z.object({
  domainId: z.string().regex(/^\d+$/).transform(Number).optional(),
  topicId: z.string().regex(/^\d+$/).transform(Number).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((val) => val >= 1 && val <= PAGINATION_DEFAULTS.maxLimit, {
      message: `Limit must be between 1 and ${PAGINATION_DEFAULTS.maxLimit}`,
    })
    .optional()
    .default(String(PAGINATION_DEFAULTS.limit)),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((val) => val >= 0, { message: 'Offset must be non-negative' })
    .optional()
    .default(String(PAGINATION_DEFAULTS.offset)),
});

export const generateQuestionsSchema = z.object({
  domainId: z.number().int().positive('Domain ID must be a positive integer'),
  topicId: z.number().int().positive('Topic ID must be a positive integer').optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  count: z.number().int().positive().max(20, 'Cannot generate more than 20 questions at once'),
  model: z.string().optional(),
});

export const reviewRatingSchema = z.object({
  questionId: z.number().int().positive('Question ID must be a positive integer'),
  quality: z.enum(['again', 'hard', 'good', 'easy']),
});

// ============ Study Schemas ============

export const startStudySessionSchema = z.object({
  sessionType: z.enum(['practice', 'review', 'weak_areas']),
  topicId: z.number().int().positive().optional(),
  domainId: z.number().int().positive().optional(),
  questionCount: z.number().int().positive().max(50).optional().default(10),
});

export const submitStudyAnswerSchema = z.object({
  questionId: z.number().int().positive('Question ID must be a positive integer'),
  selectedAnswers: z.array(z.number().int().min(0)),
  timeSpentSeconds: z.number().int().min(0).optional(),
});

export const completeStudySessionSchema = z.object({
  responses: z.array(z.object({
    questionId: z.number().int().positive(),
    selectedAnswers: z.array(z.number().int().min(0)),
    timeSpentSeconds: z.number().int().min(0),
  })),
  totalTimeSeconds: z.number().int().min(0),
});

export const studySummarySchema = z.object({
  domainId: z.number().int().positive('Domain ID must be a positive integer'),
  topicId: z.number().int().positive('Topic ID must be a positive integer').optional(),
});

export const explainSchema = z.object({
  questionId: z.number().int().positive('Question ID must be a positive integer'),
  userAnswers: z.array(z.number().int().min(0)),
});

export const topicQuestionsQuerySchema = z.object({
  count: z.string().regex(/^\d+$/).transform(Number).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

// ============ Settings Schemas ============

export const updateSettingsSchema = z.object({
  llmProvider: z.enum(['openai', 'anthropic']).optional(),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  anthropicModel: z.string().optional(),
  openaiModel: z.string().optional(),
  examDurationMinutes: z.number().int().positive().max(300).optional(),
  questionsPerExam: z.number().int().positive().max(200).optional(),
}).strict();

export const testApiSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  apiKey: z.string().min(10, 'API key is too short'),
});

// ============ Progress Schemas ============

export const importProgressSchema = z.object({
  exams: z.array(z.any()),
  responses: z.array(z.any()),
  performanceStats: z.array(z.any()),
});

// ============ Drill Schemas ============

export const startDrillSchema = z.object({
  mode: z.enum(['domain', 'weak_areas']),
  domainId: z.number().int().positive().optional(),
  questionCount: z.number().int().refine(
    (val) => (DRILL_QUESTION_COUNTS as readonly number[]).includes(val),
    { message: `Question count must be one of: ${DRILL_QUESTION_COUNTS.join(', ')}` }
  ),
  timeLimitSeconds: z.number().int().refine(
    (val) => (DRILL_TIME_LIMITS as readonly number[]).includes(val),
    { message: `Time limit must be one of: ${DRILL_TIME_LIMITS.join(', ')}` }
  ),
});

export const submitDrillAnswerSchema = z.object({
  questionId: z.number().int().positive('Question ID must be a positive integer'),
  selectedAnswers: z.array(z.number().int().min(0)),
  timeSpentSeconds: z.number().int().min(0),
});

export const completeDrillSchema = z.object({
  totalTimeSeconds: z.number().int().min(0),
  timedOut: z.boolean().optional(),
});

// ============ Helper for validation errors ============

export function formatZodError(error: z.ZodError): { error: string; details: z.ZodIssue[] } {
  return {
    error: 'Validation failed',
    details: error.issues,
  };
}
