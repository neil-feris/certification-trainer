import { FastifyInstance } from 'fastify';
import {
  getWorkbookProgressForUser,
  submitWorkbookAnswer,
  submitWorkbookAnswersBatch,
  resetWorkbookProgress,
  getAssessmentQuestions,
  getNextGuidedQuestion,
  getWorkbookBenchmark,
  getResourcesByServices,
} from '../services/workbookService.js';
import {
  submitWorkbookAnswerSchema,
  workbookAssessmentQuerySchema,
  completeWorkbookAssessmentSchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { workbookAssessments } from '../db/schema.js';
import { updateStreak } from '../services/streakService.js';
import { checkAndUnlock, AchievementContext } from '../services/achievementService.js';
import { invalidateAllReadinessCacheForUser } from '../services/readinessService.js';
import type { StreakUpdateResponse, AchievementUnlockResponse } from '@ace-prep/shared';

// Track active assessments for time validation (single-process, in-memory)
// Key: `${userId}-${assessmentType}`, Value: start time and limit
const activeAssessments = new Map<string, { startedAt: number; timeLimit: number }>();

// Grace period: allow 10% over time limit before flagging as timed out
const TIME_GRACE_FACTOR = 1.1;

export async function workbookRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Get all workbook questions with progress
  fastify.get('/progress', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getWorkbookProgressForUser(userId);
  });

  // Get benchmark comparison data
  fastify.get('/benchmark', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getWorkbookBenchmark(userId);
  });

  // Get learning resources for GCP services
  fastify.get<{
    Querystring: { services: string };
  }>('/resources', async (request, reply) => {
    const servicesParam = request.query.services;
    if (!servicesParam) {
      return reply.status(400).send({ error: 'services query parameter required' });
    }

    const services = servicesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (services.length === 0) {
      return reply.status(400).send({ error: 'At least one service required' });
    }

    return getResourcesByServices(services);
  });

  // Get next question for guided study
  fastify.get('/guided/next', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getNextGuidedQuestion(userId);
  });

  // Submit answer for guided study
  fastify.post<{
    Body: { questionId: number; selectedAnswers: number[] };
  }>('/answer', async (request, reply) => {
    const parseResult = submitWorkbookAnswerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { questionId, selectedAnswers } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    try {
      const result = await submitWorkbookAnswer(userId, questionId, selectedAnswers);

      // Invalidate readiness cache since workbook progress affects readiness score
      try {
        invalidateAllReadinessCacheForUser(userId);
      } catch (cacheError) {
        fastify.log.error({ error: cacheError }, 'Failed to invalidate readiness cache');
      }

      // Update streak on correct answer
      let streakUpdate: StreakUpdateResponse | undefined;
      let achievementsUnlocked: AchievementUnlockResponse[] = [];

      if (result.isCorrect) {
        try {
          const streakResult = await updateStreak(userId);
          streakUpdate = streakResult.streakUpdate;

          // Check achievements
          const context: AchievementContext = {
            activity: 'study',
            streak: streakResult.streak.currentStreak,
          };
          achievementsUnlocked = await checkAndUnlock(userId, context);
        } catch (error) {
          fastify.log.error({ error }, 'Failed to update streak/achievements');
        }
      }

      return {
        ...result,
        streakUpdate,
        achievementsUnlocked,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(404).send({ error: message });
    }
  });

  // Reset progress (for full exam mode)
  fastify.post('/reset', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    await resetWorkbookProgress(userId);

    // Invalidate readiness cache since workbook progress affects readiness score
    try {
      invalidateAllReadinessCacheForUser(userId);
    } catch (cacheError) {
      fastify.log.error({ error: cacheError }, 'Failed to invalidate readiness cache');
    }

    return { success: true };
  });

  // Get assessment questions
  fastify.get<{
    Querystring: { count?: string; type?: string };
  }>('/assessment', async (request, reply) => {
    const parseResult = workbookAssessmentQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { count, type } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // For full exam, get all 41 questions
    const questionCount = type === 'full' ? 41 : count;

    // Quick assessment weights toward non-mastered; full exam is random
    const weightNonMastered = type === 'quick';

    const questions = await getAssessmentQuestions(userId, questionCount, weightNonMastered);
    const timeLimit = type === 'full' ? 60 * 60 : questionCount * 90; // 60 min or 90s/question

    // Track assessment start for time validation
    const assessmentKey = `${userId}-${type}`;
    activeAssessments.set(assessmentKey, {
      startedAt: Date.now(),
      timeLimit,
    });

    // Strip correctAnswers for assessment mode (reveal after submission)
    return {
      assessmentType: type,
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        difficulty: q.difficulty,
        gcpServices: q.gcpServices,
        domain: q.domain,
        topic: q.topic,
        orderIndex: q.orderIndex,
      })),
      timeLimit,
    };
  });

  // Complete assessment
  fastify.post<{
    Body: {
      responses: Array<{
        questionId: number;
        selectedAnswers: number[];
        timeSpentSeconds?: number;
      }>;
      totalTimeSeconds: number;
      assessmentType: 'quick' | 'full';
    };
  }>('/assessment/complete', async (request, reply) => {
    const parseResult = completeWorkbookAssessmentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { responses, totalTimeSeconds, assessmentType } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // Validate time against server-tracked start time
    const assessmentKey = `${userId}-${assessmentType}`;
    const activeAssessment = activeAssessments.get(assessmentKey);
    let timedOut = false;

    if (activeAssessment) {
      const actualElapsedSeconds = (Date.now() - activeAssessment.startedAt) / 1000;
      const maxAllowedSeconds = activeAssessment.timeLimit * TIME_GRACE_FACTOR;
      timedOut = actualElapsedSeconds > maxAllowedSeconds;

      // Clean up tracked assessment
      activeAssessments.delete(assessmentKey);
    }

    // Grade all responses in a single transaction (avoids N sequential DB operations)
    const batchResults = submitWorkbookAnswersBatch(
      userId,
      responses.map((r) => ({ questionId: r.questionId, selectedAnswers: r.selectedAnswers }))
    );

    const results = batchResults.map((r) => ({
      questionId: r.questionId,
      isCorrect: r.isCorrect,
      correctAnswers: r.correctAnswers,
      explanation: r.explanation,
    }));

    const correctCount = batchResults.filter((r) => r.isCorrect).length;
    const score = Math.round((correctCount / responses.length) * 100);

    // Invalidate readiness cache since workbook progress affects readiness score
    try {
      invalidateAllReadinessCacheForUser(userId);
    } catch (cacheError) {
      fastify.log.error({ error: cacheError }, 'Failed to invalidate readiness cache');
    }

    // Record assessment
    const [assessment] = await db
      .insert(workbookAssessments)
      .values({
        userId,
        assessmentType,
        questionCount: responses.length,
        correctCount,
        score,
        timeSpentSeconds: totalTimeSeconds,
        completedAt: new Date(),
      })
      .returning();

    // Update streak
    let streakUpdate: StreakUpdateResponse | undefined;
    let achievementsUnlocked: AchievementUnlockResponse[] = [];

    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;

      const context: AchievementContext = {
        activity: 'study',
        streak: streakResult.streak.currentStreak,
        score: correctCount,
        totalQuestions: responses.length,
      };
      achievementsUnlocked = await checkAndUnlock(userId, context);
    } catch (error) {
      fastify.log.error({ error }, 'Failed to update streak/achievements');
    }

    return {
      assessmentId: assessment.id,
      score,
      correctCount,
      totalCount: responses.length,
      timeSpentSeconds: totalTimeSeconds,
      timedOut,
      results,
      streakUpdate,
      achievementsUnlocked,
    };
  });
}
