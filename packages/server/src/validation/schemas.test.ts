import { describe, it, expect } from 'vitest';
import {
  idParamSchema,
  providerParamSchema,
  createExamSchema,
  submitAnswerSchema,
  completeExamSchema,
  questionQuerySchema,
  generateQuestionsSchema,
  reviewRatingSchema,
  startStudySessionSchema,
  updateSettingsSchema,
  testApiSchema,
  startDrillSchema,
  submitDrillAnswerSchema,
  completeDrillSchema,
  formatZodError,
  PAGINATION_DEFAULTS,
} from './schemas.js';

describe('idParamSchema', () => {
  it('should accept valid numeric string', () => {
    const result = idParamSchema.safeParse({ id: '123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(123);
    }
  });

  it('should reject non-numeric string', () => {
    const result = idParamSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('should reject negative numbers', () => {
    const result = idParamSchema.safeParse({ id: '-1' });
    expect(result.success).toBe(false);
  });

  it('should accept zero', () => {
    const result = idParamSchema.safeParse({ id: '0' });
    // Note: transforms to 0 which is valid per regex but may be semantically invalid
    expect(result.success).toBe(true);
  });

  it('should reject floating point', () => {
    const result = idParamSchema.safeParse({ id: '1.5' });
    expect(result.success).toBe(false);
  });

  it('should reject empty string', () => {
    const result = idParamSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });
});

describe('providerParamSchema', () => {
  it('should accept openai', () => {
    const result = providerParamSchema.safeParse({ provider: 'openai' });
    expect(result.success).toBe(true);
  });

  it('should accept anthropic', () => {
    const result = providerParamSchema.safeParse({ provider: 'anthropic' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid provider', () => {
    const result = providerParamSchema.safeParse({ provider: 'google' });
    expect(result.success).toBe(false);
  });
});

describe('createExamSchema', () => {
  it('should accept empty object', () => {
    const result = createExamSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid question counts', () => {
    for (const count of [10, 15, 25, 50]) {
      const result = createExamSchema.safeParse({ questionCount: count });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid question count', () => {
    const result = createExamSchema.safeParse({ questionCount: 20 });
    expect(result.success).toBe(false);
  });

  it('should accept focus domains array', () => {
    const result = createExamSchema.safeParse({ focusDomains: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it('should reject non-positive domain ids', () => {
    const result = createExamSchema.safeParse({ focusDomains: [0] });
    expect(result.success).toBe(false);
  });

  it('should accept combined valid input', () => {
    const result = createExamSchema.safeParse({
      focusDomains: [1, 2],
      questionCount: 25,
    });
    expect(result.success).toBe(true);
  });
});

describe('submitAnswerSchema', () => {
  it('should accept valid answer submission', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [0, 2],
    });
    expect(result.success).toBe(true);
  });

  it('should require positive questionId', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 0,
      selectedAnswers: [0],
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty selectedAnswers', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [],
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional timeSpentSeconds', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [1],
      timeSpentSeconds: 30,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative timeSpentSeconds', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [1],
      timeSpentSeconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional flagged', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [1],
      flagged: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative answer indices', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [-1],
    });
    expect(result.success).toBe(false);
  });
});

describe('completeExamSchema', () => {
  it('should accept valid total time', () => {
    const result = completeExamSchema.safeParse({ totalTimeSeconds: 3600 });
    expect(result.success).toBe(true);
  });

  it('should accept zero time', () => {
    const result = completeExamSchema.safeParse({ totalTimeSeconds: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative time', () => {
    const result = completeExamSchema.safeParse({ totalTimeSeconds: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject missing time', () => {
    const result = completeExamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('questionQuerySchema', () => {
  it('should accept empty query', () => {
    const result = questionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should apply default limit', () => {
    const result = questionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(PAGINATION_DEFAULTS.limit);
    }
  });

  it('should apply default offset', () => {
    const result = questionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(PAGINATION_DEFAULTS.offset);
    }
  });

  it('should accept valid difficulty filter', () => {
    const result = questionQuerySchema.safeParse({ difficulty: 'hard' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid difficulty', () => {
    const result = questionQuerySchema.safeParse({ difficulty: 'expert' });
    expect(result.success).toBe(false);
  });

  it('should enforce max limit', () => {
    const result = questionQuerySchema.safeParse({ limit: '300' });
    expect(result.success).toBe(false);
  });

  it('should transform string numbers', () => {
    const result = questionQuerySchema.safeParse({
      domainId: '1',
      topicId: '2',
      limit: '10',
      offset: '5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainId).toBe(1);
      expect(result.data.topicId).toBe(2);
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(5);
    }
  });
});

describe('generateQuestionsSchema', () => {
  it('should accept valid generation request', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      difficulty: 'medium',
      count: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should require positive domainId', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 0,
      difficulty: 'medium',
      count: 5,
    });
    expect(result.success).toBe(false);
  });

  it('should accept mixed difficulty', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      difficulty: 'mixed',
      count: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should enforce max 20 questions', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      difficulty: 'easy',
      count: 21,
    });
    expect(result.success).toBe(false);
  });

  it('should require positive count', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      difficulty: 'easy',
      count: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional topicId', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      topicId: 3,
      difficulty: 'medium',
      count: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional model', () => {
    const result = generateQuestionsSchema.safeParse({
      domainId: 1,
      difficulty: 'medium',
      count: 5,
      model: 'gpt-4o',
    });
    expect(result.success).toBe(true);
  });
});

describe('reviewRatingSchema', () => {
  it('should accept valid quality ratings', () => {
    for (const quality of ['again', 'hard', 'good', 'easy'] as const) {
      const result = reviewRatingSchema.safeParse({
        questionId: 1,
        quality,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid quality', () => {
    const result = reviewRatingSchema.safeParse({
      questionId: 1,
      quality: 'perfect',
    });
    expect(result.success).toBe(false);
  });

  it('should require positive questionId', () => {
    const result = reviewRatingSchema.safeParse({
      questionId: 0,
      quality: 'good',
    });
    expect(result.success).toBe(false);
  });
});

describe('startStudySessionSchema', () => {
  it('should accept valid session types', () => {
    for (const sessionType of ['practice', 'review', 'weak_areas'] as const) {
      const result = startStudySessionSchema.safeParse({ sessionType });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid session type', () => {
    const result = startStudySessionSchema.safeParse({ sessionType: 'exam' });
    expect(result.success).toBe(false);
  });

  it('should apply default questionCount', () => {
    const result = startStudySessionSchema.safeParse({ sessionType: 'practice' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionCount).toBe(10);
    }
  });

  it('should enforce max 50 questions', () => {
    const result = startStudySessionSchema.safeParse({
      sessionType: 'practice',
      questionCount: 51,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional topicId and domainId', () => {
    const result = startStudySessionSchema.safeParse({
      sessionType: 'practice',
      topicId: 1,
      domainId: 2,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateSettingsSchema', () => {
  it('should accept empty object', () => {
    const result = updateSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid provider', () => {
    const result = updateSettingsSchema.safeParse({ llmProvider: 'anthropic' });
    expect(result.success).toBe(true);
  });

  it('should accept API keys', () => {
    const result = updateSettingsSchema.safeParse({
      openaiApiKey: 'sk-test-key',
      anthropicApiKey: 'sk-ant-test-key',
    });
    expect(result.success).toBe(true);
  });

  it('should enforce max exam duration', () => {
    const result = updateSettingsSchema.safeParse({ examDurationMinutes: 301 });
    expect(result.success).toBe(false);
  });

  it('should enforce max questions per exam', () => {
    const result = updateSettingsSchema.safeParse({ questionsPerExam: 201 });
    expect(result.success).toBe(false);
  });

  it('should reject unknown properties (strict mode)', () => {
    const result = updateSettingsSchema.safeParse({ unknownField: 'value' });
    expect(result.success).toBe(false);
  });
});

describe('testApiSchema', () => {
  it('should accept valid API test request', () => {
    const result = testApiSchema.safeParse({
      provider: 'openai',
      apiKey: 'sk-test-key-12345',
    });
    expect(result.success).toBe(true);
  });

  it('should require minimum API key length', () => {
    const result = testApiSchema.safeParse({
      provider: 'anthropic',
      apiKey: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('startDrillSchema', () => {
  it('should accept valid drill config', () => {
    const result = startDrillSchema.safeParse({
      mode: 'domain',
      domainId: 1,
      questionCount: 10,
      timeLimitSeconds: 120,
    });
    expect(result.success).toBe(true);
  });

  it('should accept weak_areas mode', () => {
    const result = startDrillSchema.safeParse({
      mode: 'weak_areas',
      questionCount: 5,
      timeLimitSeconds: 60,
    });
    expect(result.success).toBe(true);
  });

  it('should enforce valid question counts', () => {
    const result = startDrillSchema.safeParse({
      mode: 'domain',
      questionCount: 7, // Not in [5, 10, 15, 20]
      timeLimitSeconds: 120,
    });
    expect(result.success).toBe(false);
  });

  it('should enforce valid time limits', () => {
    const result = startDrillSchema.safeParse({
      mode: 'domain',
      domainId: 1,
      questionCount: 10,
      timeLimitSeconds: 90, // Not in [60, 120, 300, 600]
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid question counts', () => {
    for (const count of [5, 10, 15, 20]) {
      const result = startDrillSchema.safeParse({
        mode: 'domain',
        domainId: 1,
        questionCount: count,
        timeLimitSeconds: 60,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid time limits', () => {
    for (const time of [60, 120, 300, 600]) {
      const result = startDrillSchema.safeParse({
        mode: 'domain',
        domainId: 1,
        questionCount: 10,
        timeLimitSeconds: time,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should require domainId when mode is domain', () => {
    const result = startDrillSchema.safeParse({
      mode: 'domain',
      questionCount: 10,
      timeLimitSeconds: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('domainId');
    }
  });

  it('should not require domainId when mode is weak_areas', () => {
    const result = startDrillSchema.safeParse({
      mode: 'weak_areas',
      questionCount: 10,
      timeLimitSeconds: 60,
    });
    expect(result.success).toBe(true);
  });
});

describe('submitDrillAnswerSchema', () => {
  it('should accept valid drill answer', () => {
    const result = submitDrillAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [0, 1],
      timeSpentSeconds: 30,
    });
    expect(result.success).toBe(true);
  });

  it('should require non-negative timeSpentSeconds', () => {
    const result = submitDrillAnswerSchema.safeParse({
      questionId: 1,
      selectedAnswers: [0],
      timeSpentSeconds: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe('completeDrillSchema', () => {
  it('should accept valid completion', () => {
    const result = completeDrillSchema.safeParse({
      totalTimeSeconds: 120,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional timedOut', () => {
    const result = completeDrillSchema.safeParse({
      totalTimeSeconds: 300,
      timedOut: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('formatZodError', () => {
  it('should format error with message and details', () => {
    const result = idParamSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.error).toBe('Validation failed');
      expect(formatted.details).toBeInstanceOf(Array);
      expect(formatted.details.length).toBeGreaterThan(0);
    }
  });

  it('should include issue details', () => {
    const result = submitAnswerSchema.safeParse({
      questionId: 0,
      selectedAnswers: 'not-an-array',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.details.some((d) => d.path.includes('questionId'))).toBe(true);
      expect(formatted.details.some((d) => d.path.includes('selectedAnswers'))).toBe(true);
    }
  });
});
