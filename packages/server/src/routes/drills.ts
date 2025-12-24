import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  domains,
  topics,
  questions,
  studySessions,
  studySessionResponses,
  spacedRepetition,
  performanceStats
} from '../db/schema.js';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import type {
  StartDrillRequest,
  SubmitDrillAnswerRequest,
  CompleteDrillRequest,
  DrillResult
} from '@ace-prep/shared';
import {
  idParamSchema,
  formatZodError,
  startDrillSchema,
  submitDrillAnswerSchema,
  completeDrillSchema
} from '../validation/schemas.js';

export async function drillRoutes(fastify: FastifyInstance) {
  // Create a new timed drill
  fastify.post<{ Body: StartDrillRequest }>('/', async (request, reply) => {
    const parseResult = startDrillSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { mode, domainId, questionCount, timeLimitSeconds } = parseResult.data;

    let questionQuery = db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id));

    if (mode === 'domain' && domainId) {
      // Filter by specific domain
      questionQuery = questionQuery.where(eq(questions.domainId, domainId)) as typeof questionQuery;
    } else if (mode === 'weak_areas') {
      // Get weak areas from performance stats (accuracy < 70%)
      const weakStats = await db
        .select({
          topicId: performanceStats.topicId,
          domainId: performanceStats.domainId,
        })
        .from(performanceStats)
        .where(
          and(
            sql`(${performanceStats.correctAttempts} * 1.0 / NULLIF(${performanceStats.totalAttempts}, 0)) < 0.7`,
            sql`${performanceStats.totalAttempts} > 0`
          )
        );

      if (weakStats.length > 0) {
        const weakTopicIds = weakStats
          .filter(s => s.topicId !== null)
          .map(s => s.topicId as number);
        const weakDomainIds = weakStats
          .filter(s => s.topicId === null)
          .map(s => s.domainId);

        if (weakTopicIds.length > 0) {
          questionQuery = questionQuery.where(inArray(questions.topicId, weakTopicIds)) as typeof questionQuery;
        } else if (weakDomainIds.length > 0) {
          questionQuery = questionQuery.where(inArray(questions.domainId, weakDomainIds)) as typeof questionQuery;
        }
      }
      // If no weak areas found, use all questions (fallback)
    }

    const allQuestions = await questionQuery;

    if (allQuestions.length === 0) {
      return reply.status(404).send({ error: 'No questions found for the specified criteria' });
    }

    // Shuffle and limit questions
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, questionCount);

    // Create a study session with sessionType='timed_drill'
    const [session] = await db.insert(studySessions).values({
      sessionType: 'timed_drill',
      topicId: null,
      domainId: domainId || null,
      startedAt: new Date(),
      status: 'in_progress',
      totalQuestions: selectedQuestions.length,
    }).returning();

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

    const bodyResult = submitDrillAnswerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { questionId, selectedAnswers, timeSpentSeconds } = bodyResult.data;

    // Verify drill exists and is active
    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, drillId));
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

    const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
    const isCorrect = selectedAnswers.length === correctAnswers.length &&
      selectedAnswers.every(a => correctAnswers.includes(a)) &&
      correctAnswers.every(a => selectedAnswers.includes(a));

    // Check if response already exists
    const [existingResponse] = await db
      .select()
      .from(studySessionResponses)
      .where(and(
        eq(studySessionResponses.sessionId, drillId),
        eq(studySessionResponses.questionId, questionId)
      ));

    let addedToSR = false;

    if (existingResponse) {
      // Update existing response
      await db.update(studySessionResponses)
        .set({
          selectedAnswers: JSON.stringify(selectedAnswers),
          isCorrect,
          timeSpentSeconds,
        })
        .where(eq(studySessionResponses.id, existingResponse.id));
      addedToSR = existingResponse.addedToSR || false;
    } else {
      // Get next order index
      const existingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(studySessionResponses)
        .where(eq(studySessionResponses.sessionId, drillId));

      // Create new response
      await db.insert(studySessionResponses).values({
        sessionId: drillId,
        questionId,
        selectedAnswers: JSON.stringify(selectedAnswers),
        isCorrect,
        timeSpentSeconds,
        orderIndex: (existingCount[0]?.count || 0) + 1,
        addedToSR: false,
      });

      // If incorrect, add to spaced repetition queue
      if (!isCorrect) {
        const [existingSR] = await db
          .select()
          .from(spacedRepetition)
          .where(eq(spacedRepetition.questionId, questionId));

        if (!existingSR) {
          await db.insert(spacedRepetition).values({
            questionId,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewAt: new Date(),
          });
          addedToSR = true;

          // Update the response to mark it
          await db.update(studySessionResponses)
            .set({ addedToSR: true })
            .where(and(
              eq(studySessionResponses.sessionId, drillId),
              eq(studySessionResponses.questionId, questionId)
            ));
        }
      }
    }

    // Update session sync time
    await db.update(studySessions)
      .set({ syncedAt: new Date() })
      .where(eq(studySessions.id, drillId));

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

    const bodyResult = completeDrillSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { totalTimeSeconds, timedOut } = bodyResult.data;

    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, drillId));
    if (!session) {
      return reply.status(404).send({ error: 'Drill not found' });
    }

    // Get all responses for this drill
    const responses = await db
      .select()
      .from(studySessionResponses)
      .where(eq(studySessionResponses.sessionId, drillId))
      .orderBy(studySessionResponses.orderIndex);

    // Get all questions for the responses to build drill results
    const questionIds = responses.map(r => r.questionId);
    const drillQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];
    const questionsMap = new Map(drillQuestions.map(q => [q.id, q]));

    // Build drill results
    const results: DrillResult[] = responses.map(r => {
      const q = questionsMap.get(r.questionId);
      return {
        questionId: r.questionId,
        selectedAnswers: JSON.parse(r.selectedAnswers as string) as number[],
        isCorrect: r.isCorrect ?? false,
        correctAnswers: q ? JSON.parse(q.correctAnswers as string) as number[] : [],
        explanation: q?.explanation ?? '',
        timeSpentSeconds: r.timeSpentSeconds ?? 0,
      };
    });

    // Calculate stats
    const correctCount = responses.filter(r => r.isCorrect).length;
    const totalCount = responses.length;
    const totalTimeSpent = responses.reduce((sum, r) => sum + (r.timeSpentSeconds ?? 0), 0);
    const avgTimePerQuestion = totalCount > 0 ? Math.round(totalTimeSpent / totalCount) : 0;
    const addedToSRCount = responses.filter(r => r.addedToSR).length;
    const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    // Complete the session
    await db.update(studySessions)
      .set({
        status: timedOut ? 'abandoned' : 'completed',
        completedAt: new Date(),
        timeSpentSeconds: totalTimeSeconds,
        correctAnswers: correctCount,
        totalQuestions: totalCount,
      })
      .where(eq(studySessions.id, drillId));

    return {
      score,
      correctCount,
      totalCount,
      avgTimePerQuestion,
      addedToSRCount,
      results,
    };
  });

  // Get active drill session (for recovery)
  fastify.get('/active', async () => {
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(
        eq(studySessions.sessionType, 'timed_drill'),
        eq(studySessions.status, 'in_progress')
      ))
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

    return {
      session,
      responses: responses.map(r => ({
        ...r,
        selectedAnswers: JSON.parse(r.selectedAnswers as string),
      })),
    };
  });

  // Abandon drill
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const drillId = paramResult.data.id;

    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, drillId));
    if (!session) {
      return reply.status(404).send({ error: 'Drill not found' });
    }

    await db.update(studySessions)
      .set({ status: 'abandoned', completedAt: new Date() })
      .where(eq(studySessions.id, drillId));

    return { success: true };
  });
}
