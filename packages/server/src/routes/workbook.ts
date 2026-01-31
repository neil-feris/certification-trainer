import { FastifyInstance } from 'fastify';
import {
  getWorkbookProgressForUser,
  submitWorkbookAnswer,
  resetWorkbookProgress,
  getAssessmentQuestions,
  getNextGuidedQuestion,
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
import type { StreakUpdateResponse, AchievementUnlockResponse } from '@ace-prep/shared';

export async function workbookRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Get all workbook questions with progress
  fastify.get('/progress', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getWorkbookProgressForUser(userId);
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
      timeLimit: type === 'full' ? 60 * 60 : questionCount * 90, // 60 min or 90s/question
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

    // Grade each response
    let correctCount = 0;
    const results: Array<{
      questionId: number;
      isCorrect: boolean;
      correctAnswers: number[];
      explanation: string;
    }> = [];

    for (const response of responses) {
      const result = await submitWorkbookAnswer(
        userId,
        response.questionId,
        response.selectedAnswers
      );
      results.push({
        questionId: response.questionId,
        isCorrect: result.isCorrect,
        correctAnswers: result.correctAnswers,
        explanation: result.explanation,
      });
      if (result.isCorrect) correctCount++;
    }

    const score = Math.round((correctCount / responses.length) * 100);

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
      results,
      streakUpdate,
      achievementsUnlocked,
    };
  });
}
