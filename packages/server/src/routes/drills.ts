import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  domains,
  topics,
  questions,
  studySessions,
  studySessionResponses,
  spacedRepetition,
  performanceStats,
} from '../db/schema.js';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import type {
  StartDrillRequest,
  SubmitDrillAnswerRequest,
  CompleteDrillRequest,
  DrillResult,
  XPAwardResponse,
} from '@ace-prep/shared';
import { XP_AWARDS } from '@ace-prep/shared';
import {
  idParamSchema,
  formatZodError,
  startDrillSchema,
  submitDrillAnswerSchema,
  completeDrillSchema,
} from '../validation/schemas.js';
import { checkAnswerCorrect } from '../utils/scoring.js';
import { resolveCertificationId } from '../db/certificationUtils.js';
import { authenticate } from '../middleware/auth.js';
import { awardCustomXP } from '../services/xpService.js';

export async function drillRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);
  // Create a new timed drill
  fastify.post<{ Body: StartDrillRequest }>('/', async (request, reply) => {
    const parseResult = startDrillSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { certificationId, mode, domainId, questionCount, timeLimitSeconds } = parseResult.data;

    // Get and validate certification ID
    const certId = await resolveCertificationId(certificationId, reply);
    if (certId === null) return; // Error already sent

    // Build where condition based on mode
    let whereCondition = eq(domains.certificationId, certId);

    if (mode === 'domain' && domainId) {
      // Filter by specific domain (within certification)
      whereCondition = and(eq(domains.certificationId, certId), eq(questions.domainId, domainId))!;
    } else if (mode === 'weak_areas') {
      // Get weak areas from performance stats (accuracy < 70%) for this user
      const userId = parseInt(request.user!.id, 10);
      const weakStats = await db
        .select({
          topicId: performanceStats.topicId,
          domainId: performanceStats.domainId,
        })
        .from(performanceStats)
        .where(
          and(
            sql`(${performanceStats.correctAttempts} * 1.0 / NULLIF(${performanceStats.totalAttempts}, 0)) < 0.7`,
            sql`${performanceStats.totalAttempts} > 0`,
            eq(performanceStats.userId, userId)
          )
        );

      if (weakStats.length > 0) {
        const weakTopicIds = weakStats
          .filter((s) => s.topicId !== null)
          .map((s) => s.topicId as number);
        const weakDomainIds = weakStats.filter((s) => s.topicId === null).map((s) => s.domainId);

        if (weakTopicIds.length > 0) {
          whereCondition = and(
            eq(domains.certificationId, certId),
            inArray(questions.topicId, weakTopicIds)
          )!;
        } else if (weakDomainIds.length > 0) {
          whereCondition = and(
            eq(domains.certificationId, certId),
            inArray(questions.domainId, weakDomainIds)
          )!;
        }
      }
      // If no weak areas found, use certification filter only (fallback)
    }

    // Build query with where condition
    const questionQuery = db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(whereCondition);

    // Use SQL RANDOM() to select random questions efficiently
    // This avoids loading all questions into memory and shuffling in JS
    const selectedQuestions = await questionQuery.orderBy(sql`RANDOM()`).limit(questionCount);

    if (selectedQuestions.length === 0) {
      return reply.status(404).send({ error: 'No questions found for the specified criteria' });
    }

    // Create a study session with sessionType='timed_drill'
    const userId = parseInt(request.user!.id, 10);
    const [session] = await db
      .insert(studySessions)
      .values({
        userId,
        certificationId: certId,
        sessionType: 'timed_drill',
        topicId: null,
        domainId: domainId || null,
        startedAt: new Date(),
        status: 'in_progress',
        totalQuestions: selectedQuestions.length,
      })
      .returning();

    // Format questions for response - SECURITY: No answers revealed
    const formattedQuestions = selectedQuestions.map((q) => ({
      id: q.question.id,
      questionText: q.question.questionText,
      questionType: q.question.questionType as 'single' | 'multiple',
      options: JSON.parse(q.question.options as string),
      difficulty: q.question.difficulty as 'easy' | 'medium' | 'hard',
      domain: {
        id: q.domain.id,
        name: q.domain.name,
        code: q.domain.code,
      },
      topic: {
        id: q.topic.id,
        name: q.topic.name,
      },
    }));

    return {
      drillId: session.id,
      questions: formattedQuestions,
      startedAt: session.startedAt.toISOString(),
      timeLimitSeconds,
    };
  });

  // Submit answer during drill
  fastify.patch<{
    Params: { id: string };
    Body: SubmitDrillAnswerRequest;
  }>('/:id/answer', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const drillId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const bodyResult = submitDrillAnswerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { questionId, selectedAnswers, timeSpentSeconds } = bodyResult.data;

    // Verify drill exists, belongs to user, and is active
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, drillId), eq(studySessions.userId, userId)));
    if (!session) {
      return reply.status(404).send({ error: 'Drill not found' });
    }
    if (session.status !== 'in_progress') {
      return reply.status(400).send({ error: 'Drill is not active' });
    }
    if (session.sessionType !== 'timed_drill') {
      return reply.status(400).send({ error: 'Session is not a timed drill' });
    }

    // Get the question
    const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
    if (!question) {
      return reply.status(404).send({ error: 'Question not found' });
    }

    let correctAnswers: number[];
    try {
      correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
    } catch {
      fastify.log.error({ questionId }, 'Malformed correctAnswers JSON in database');
      return reply.status(500).send({ error: 'Invalid question data' });
    }

    const isCorrect = checkAnswerCorrect(selectedAnswers, correctAnswers);

    // Use transaction to prevent race conditions (TOCTOU)
    // The unique constraint on (sessionId, questionId) also prevents duplicates
    let addedToSR = false;

    // Note: better-sqlite3 is synchronous, so no async/await inside transaction
    addedToSR = db.transaction((tx) => {
      // Check if response already exists
      const [existingResponse] = tx
        .select()
        .from(studySessionResponses)
        .where(
          and(
            eq(studySessionResponses.sessionId, drillId),
            eq(studySessionResponses.questionId, questionId)
          )
        )
        .all();

      let wasAddedToSR = false;

      if (existingResponse) {
        // Update existing response
        tx.update(studySessionResponses)
          .set({
            selectedAnswers: JSON.stringify(selectedAnswers),
            isCorrect,
            timeSpentSeconds,
          })
          .where(eq(studySessionResponses.id, existingResponse.id))
          .run();
        wasAddedToSR = existingResponse.addedToSR || false;
      } else {
        // Get next order index
        const existingCount = tx
          .select({ count: sql<number>`count(*)` })
          .from(studySessionResponses)
          .where(eq(studySessionResponses.sessionId, drillId))
          .all();

        // Create new response
        tx.insert(studySessionResponses)
          .values({
            userId,
            sessionId: drillId,
            questionId,
            selectedAnswers: JSON.stringify(selectedAnswers),
            isCorrect,
            timeSpentSeconds,
            orderIndex: (existingCount[0]?.count || 0) + 1,
            addedToSR: false,
          })
          .run();

        // If incorrect, add to spaced repetition queue for this user
        if (!isCorrect) {
          const [existingSR] = tx
            .select()
            .from(spacedRepetition)
            .where(
              and(eq(spacedRepetition.questionId, questionId), eq(spacedRepetition.userId, userId))
            )
            .all();

          if (!existingSR) {
            tx.insert(spacedRepetition)
              .values({
                userId,
                questionId,
                easeFactor: 2.5,
                interval: 1,
                repetitions: 0,
                nextReviewAt: new Date(),
              })
              .run();
            wasAddedToSR = true;

            // Update the response to mark it
            tx.update(studySessionResponses)
              .set({ addedToSR: true })
              .where(
                and(
                  eq(studySessionResponses.sessionId, drillId),
                  eq(studySessionResponses.questionId, questionId)
                )
              )
              .run();
          }
        }
      }

      // Update session sync time
      tx.update(studySessions)
        .set({ syncedAt: new Date() })
        .where(eq(studySessions.id, drillId))
        .run();

      return wasAddedToSR;
    });

    // Return correctAnswers and explanation ONLY after user has submitted
    return {
      isCorrect,
      correctAnswers,
      explanation: question.explanation,
      addedToSR,
    };
  });

  // Complete drill (either by finishing all questions or timeout)
  fastify.patch<{
    Params: { id: string };
    Body: CompleteDrillRequest;
  }>('/:id/complete', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const drillId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const bodyResult = completeDrillSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { totalTimeSeconds, timedOut } = bodyResult.data;

    // Use transaction to ensure consistent read and update of session state
    // Note: better-sqlite3 is synchronous, so no async/await inside transaction
    const txResult = db.transaction((tx) => {
      const [session] = tx
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.id, drillId), eq(studySessions.userId, userId)))
        .all();
      if (!session) {
        return { error: 'not_found' as const };
      }
      if (session.status === 'completed' || session.status === 'abandoned') {
        return { error: 'already_completed' as const };
      }

      // Get all responses for this drill
      const responses = tx
        .select()
        .from(studySessionResponses)
        .where(eq(studySessionResponses.sessionId, drillId))
        .orderBy(studySessionResponses.orderIndex)
        .all();

      // Calculate stats
      const correctCount = responses.filter((r) => r.isCorrect).length;
      const totalCount = responses.length;
      const addedToSRCount = responses.filter((r) => r.addedToSR).length;

      // Complete the session atomically
      tx.update(studySessions)
        .set({
          status: timedOut ? 'abandoned' : 'completed',
          completedAt: new Date(),
          timeSpentSeconds: totalTimeSeconds,
          correctAnswers: correctCount,
          totalQuestions: totalCount,
        })
        .where(eq(studySessions.id, drillId))
        .run();

      return { responses, correctCount, totalCount, addedToSRCount };
    });

    if ('error' in txResult) {
      if (txResult.error === 'not_found') {
        return reply.status(404).send({ error: 'Drill not found' });
      }
      return reply.status(400).send({ error: 'Drill already completed' });
    }

    const { responses, correctCount, totalCount, addedToSRCount } = txResult;

    // Award XP for drill completion (non-blocking, graceful degradation)
    let xpUpdate: XPAwardResponse | undefined;
    try {
      // Calculate XP: +5 per question answered, +20 completion bonus, +50 for perfect score
      const questionXP = totalCount * XP_AWARDS.DRILL_QUESTION;
      const completionBonusXP = XP_AWARDS.DRILL_COMPLETE;
      const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      const perfectBonusXP = score === 100 ? XP_AWARDS.DRILL_PERFECT_SCORE : 0;
      const totalXPAwarded = questionXP + completionBonusXP + perfectBonusXP;

      xpUpdate = await awardCustomXP(userId, totalXPAwarded);
    } catch (error) {
      fastify.log.error({ error, drillId, userId }, 'Failed to award XP for drill completion');
      // Continue without XP update - drill completion is more important
    }

    // Get all questions for the responses to build drill results (outside transaction - read-only)
    const questionIds = responses.map((r) => r.questionId);
    const drillQuestions =
      questionIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.id, questionIds))
        : [];
    const questionsMap = new Map(drillQuestions.map((q) => [q.id, q]));

    // Build drill results with safe JSON parsing
    const results: DrillResult[] = responses.map((r) => {
      const q = questionsMap.get(r.questionId);

      let selectedAnswers: number[] = [];
      try {
        selectedAnswers = JSON.parse(r.selectedAnswers as string) as number[];
      } catch {
        // Malformed data - use empty array
        selectedAnswers = [];
      }

      let correctAnswers: number[] = [];
      if (q) {
        try {
          correctAnswers = JSON.parse(q.correctAnswers as string) as number[];
        } catch {
          correctAnswers = [];
        }
      }

      return {
        questionId: r.questionId,
        selectedAnswers,
        isCorrect: r.isCorrect ?? false,
        correctAnswers,
        explanation: q?.explanation ?? '',
        timeSpentSeconds: r.timeSpentSeconds ?? 0,
      };
    });

    // Calculate remaining stats
    const totalTimeSpent = responses.reduce((sum, r) => sum + (r.timeSpentSeconds ?? 0), 0);
    const avgTimePerQuestion = totalCount > 0 ? Math.round(totalTimeSpent / totalCount) : 0;
    const finalScore = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    return {
      score: finalScore,
      correctCount,
      totalCount,
      avgTimePerQuestion,
      addedToSRCount,
      results,
      xpUpdate,
    };
  });

  // Get active drill session (for recovery)
  fastify.get('/active', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    const [session] = await db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.sessionType, 'timed_drill'),
          eq(studySessions.status, 'in_progress'),
          eq(studySessions.userId, userId)
        )
      )
      .orderBy(desc(studySessions.startedAt))
      .limit(1);

    if (!session) {
      return null;
    }

    // Get responses for this session
    const responses = await db
      .select()
      .from(studySessionResponses)
      .where(eq(studySessionResponses.sessionId, session.id));

    // Get questions for recovery - fetch all questions that have responses
    const questionIds = responses.map((r) => r.questionId);

    // Format questions for recovery (without answers - same as start endpoint)
    let formattedQuestions: Array<{
      id: number;
      questionText: string;
      questionType: 'single' | 'multiple';
      options: string[];
      difficulty: 'easy' | 'medium' | 'hard';
      domain: { id: number; name: string; code: string };
      topic: { id: number; name: string };
    }> = [];

    if (questionIds.length > 0) {
      const questionsWithDetails = await db
        .select({
          question: questions,
          domain: domains,
          topic: topics,
        })
        .from(questions)
        .innerJoin(domains, eq(questions.domainId, domains.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .where(inArray(questions.id, questionIds));

      formattedQuestions = questionsWithDetails.map((row) => {
        let options: string[] = [];
        try {
          options = JSON.parse(row.question.options as string);
        } catch {
          options = [];
        }

        return {
          id: row.question.id,
          questionText: row.question.questionText,
          questionType: row.question.questionType as 'single' | 'multiple',
          options,
          difficulty: row.question.difficulty as 'easy' | 'medium' | 'hard',
          domain: {
            id: row.domain.id,
            name: row.domain.name,
            code: row.domain.code,
          },
          topic: {
            id: row.topic.id,
            name: row.topic.name,
          },
        };
      });
    }

    return {
      session,
      questions: formattedQuestions.filter((q) => q !== null),
      responses: responses.map((r) => {
        let selectedAnswers: number[] = [];
        try {
          selectedAnswers = JSON.parse(r.selectedAnswers as string);
        } catch {
          selectedAnswers = [];
        }
        return {
          ...r,
          selectedAnswers,
        };
      }),
    };
  });

  // Abandon drill
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const drillId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify ownership
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, drillId), eq(studySessions.userId, userId)));
    if (!session) {
      return reply.status(404).send({ error: 'Drill not found' });
    }

    await db
      .update(studySessions)
      .set({ status: 'abandoned', completedAt: new Date() })
      .where(and(eq(studySessions.id, drillId), eq(studySessions.userId, userId)));

    return { success: true };
  });
}
