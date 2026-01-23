import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  domains,
  topics,
  studySummaries,
  examResponses,
  questions,
  studySessions,
  studySessionResponses,
  learningPathProgress,
  spacedRepetition,
  learningPathSummaries,
  caseStudies,
} from '../db/schema.js';
import { eq, desc, and, sql, inArray, like, or } from 'drizzle-orm';
import { generateStudySummary, generateExplanation } from '../services/studyGenerator.js';
import { generateLearningPathSummary } from '../services/learningPathGenerator.js';
import { LEARNING_PATH_ITEMS, LEARNING_PATH_TOTAL } from '../data/learningPathContent.js';
import type {
  StartStudySessionRequest,
  SubmitStudyAnswerRequest,
  CompleteStudySessionRequest,
  LearningPathItem,
  LearningPathSummary,
} from '@ace-prep/shared';
import { resolveCertificationId, parseCertificationIdFromQuery } from '../db/certificationUtils.js';
import {
  idParamSchema,
  orderParamSchema,
  topicIdParamSchema,
  startStudySessionSchema,
  submitStudyAnswerSchema,
  completeStudySessionSchema,
  studySummarySchema,
  explainSchema,
  topicQuestionsQuerySchema,
  learningPathDetailQuerySchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import { mapCaseStudyRecord } from '../utils/mappers.js';
import { updateStreak } from '../services/streakService.js';
import { awardCustomXP } from '../services/xpService.js';
import { XP_AWARDS, XPAwardResponse } from '@ace-prep/shared';
import { checkAndUnlock, AchievementContext } from '../services/achievementService.js';
import type { AchievementUnlockResponse } from '@ace-prep/shared';

export async function studyRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);
  // Get all domains with topics (single query with JOIN, filtered by certification)
  fastify.get<{ Querystring: { certificationId?: string } }>('/domains', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return; // Error already sent

    const result = await db
      .select({
        domain: domains,
        topic: topics,
      })
      .from(domains)
      .leftJoin(topics, eq(topics.domainId, domains.id))
      .where(eq(domains.certificationId, certId))
      .orderBy(domains.orderIndex, topics.id);

    // Group topics by domain
    const domainMap = new Map<
      number,
      { domain: typeof domains.$inferSelect; topics: (typeof topics.$inferSelect)[] }
    >();

    for (const row of result) {
      if (!domainMap.has(row.domain.id)) {
        domainMap.set(row.domain.id, { domain: row.domain, topics: [] });
      }
      if (row.topic) {
        domainMap.get(row.domain.id)!.topics.push(row.topic);
      }
    }

    return Array.from(domainMap.values()).map(({ domain, topics }) => ({
      ...domain,
      topics,
    }));
  });

  // Get learning path structure with completion status (filtered by certification and user)
  fastify.get<{ Querystring: { certificationId?: string } }>(
    '/learning-path',
    async (request, reply) => {
      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Get completion status for this certification and user
      const progress = await db
        .select()
        .from(learningPathProgress)
        .where(
          and(
            eq(learningPathProgress.certificationId, certId),
            eq(learningPathProgress.userId, userId)
          )
        );
      const completedMap = new Map(progress.map((p) => [p.pathItemOrder, p.completedAt]));

      return LEARNING_PATH_ITEMS.map((item) => ({
        ...item,
        isCompleted: completedMap.has(item.order),
        completedAt: completedMap.get(item.order) || null,
      }));
    }
  );

  // Toggle learning path item completion
  fastify.patch<{ Params: { order: string }; Querystring: { certificationId?: string } }>(
    '/learning-path/:order/toggle',
    async (request, reply) => {
      const parseResult = orderParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }
      const order = parseResult.data.order;

      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Check if already completed (for this certification and user)
      const [existing] = await db
        .select()
        .from(learningPathProgress)
        .where(
          and(
            eq(learningPathProgress.certificationId, certId),
            eq(learningPathProgress.pathItemOrder, order),
            eq(learningPathProgress.userId, userId)
          )
        );

      if (existing) {
        // Remove completion
        await db
          .delete(learningPathProgress)
          .where(
            and(
              eq(learningPathProgress.certificationId, certId),
              eq(learningPathProgress.pathItemOrder, order),
              eq(learningPathProgress.userId, userId)
            )
          );
        return { isCompleted: false, completedAt: null };
      } else {
        // Mark as completed
        const now = new Date();
        await db.insert(learningPathProgress).values({
          userId,
          certificationId: certId,
          pathItemOrder: order,
          completedAt: now,
        });
        return { isCompleted: true, completedAt: now };
      }
    }
  );

  // Mark learning path item as complete (idempotent - does not toggle)
  fastify.patch<{ Params: { order: string }; Querystring: { certificationId?: string } }>(
    '/learning-path/:order/complete',
    async (request, reply) => {
      const parseResult = orderParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }
      const order = parseResult.data.order;

      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Check if already completed (for this certification and user)
      const [existing] = await db
        .select()
        .from(learningPathProgress)
        .where(
          and(
            eq(learningPathProgress.certificationId, certId),
            eq(learningPathProgress.pathItemOrder, order),
            eq(learningPathProgress.userId, userId)
          )
        );

      if (existing) {
        // Already completed - return existing status (idempotent)
        return { isCompleted: true, completedAt: existing.completedAt };
      }

      // Mark as completed
      const now = new Date();
      await db.insert(learningPathProgress).values({
        userId,
        certificationId: certId,
        pathItemOrder: order,
        completedAt: now,
      });

      // Update streak since this is a new completion with error handling
      let streakUpdate;
      let currentStreak: number | undefined;
      try {
        const streakResult = await updateStreak(userId);
        streakUpdate = streakResult.streakUpdate;
        currentStreak = streakResult.streak.currentStreak;
      } catch (error) {
        // Log error but don't fail the learning path completion
        fastify.log.error(
          {
            userId,
            order,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to update streak after learning path completion'
        );
        // Graceful degradation - streak update is non-critical
        streakUpdate = undefined;
      }

      // Check streak-based achievements
      let achievementsUnlocked: AchievementUnlockResponse[] = [];
      try {
        const achievementContext: AchievementContext = {
          streak: currentStreak,
        };
        achievementsUnlocked = await checkAndUnlock(userId, achievementContext);
      } catch (error) {
        fastify.log.error(
          {
            userId,
            order,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to check achievements after learning path completion'
        );
      }

      return {
        isCompleted: true,
        completedAt: now,
        streakUpdate,
        achievementsUnlocked,
      };
    }
  );

  // Get learning path stats (filtered by certification and user)
  fastify.get<{ Querystring: { certificationId?: string } }>(
    '/learning-path/stats',
    async (request, reply) => {
      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      const progress = await db
        .select()
        .from(learningPathProgress)
        .where(
          and(
            eq(learningPathProgress.certificationId, certId),
            eq(learningPathProgress.userId, userId)
          )
        );
      const total = LEARNING_PATH_TOTAL;
      const completed = progress.length;

      // Find the first incomplete item
      const completedOrders = new Set(progress.map((p) => p.pathItemOrder));
      let nextRecommended: number | null = null;
      for (let i = 1; i <= total; i++) {
        if (!completedOrders.has(i)) {
          nextRecommended = i;
          break;
        }
      }

      return {
        completed,
        total,
        percentComplete: Math.round((completed / total) * 100),
        nextRecommended,
      };
    }
  );

  // Get single learning path item with summary and related questions
  // Rate limit: 5 per minute (LLM generation can be expensive)
  fastify.get<{
    Params: { order: string };
    Querystring: { certificationId?: string; regenerate?: string };
  }>(
    '/learning-path/:order',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const paramResult = orderParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send(formatZodError(paramResult.error));
      }
      const order = paramResult.data.order;

      const queryResult = learningPathDetailQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send(formatZodError(queryResult.error));
      }
      const { regenerate } = queryResult.data;

      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Find the requested item
      const itemData = LEARNING_PATH_ITEMS.find((item) => item.order === order);
      if (!itemData) {
        return reply.status(404).send({ error: 'Learning path item not found' });
      }

      // Get completion status for this user
      const [progressRecord] = await db
        .select()
        .from(learningPathProgress)
        .where(
          and(
            eq(learningPathProgress.certificationId, certId),
            eq(learningPathProgress.pathItemOrder, order),
            eq(learningPathProgress.userId, userId)
          )
        );

      const item: LearningPathItem = {
        ...itemData,
        isCompleted: !!progressRecord,
        completedAt: progressRecord?.completedAt || null,
      };

      // Try to get cached summary
      let summary: LearningPathSummary | null = null;
      if (!regenerate) {
        const [cachedSummary] = await db
          .select()
          .from(learningPathSummaries)
          .where(
            and(
              eq(learningPathSummaries.certificationId, certId),
              eq(learningPathSummaries.pathItemOrder, order)
            )
          );

        if (cachedSummary) {
          // Wrap JSON.parse in try-catch to handle corrupted cache gracefully
          try {
            summary = {
              id: cachedSummary.id,
              pathItemOrder: cachedSummary.pathItemOrder,
              certificationId: cachedSummary.certificationId,
              overview: cachedSummary.overview,
              keyTakeaways: JSON.parse(cachedSummary.keyTakeaways),
              importantConcepts: JSON.parse(cachedSummary.importantConcepts),
              examTips: JSON.parse(cachedSummary.examTips),
              relatedTopicIds: JSON.parse(cachedSummary.relatedTopicIds),
              generatedAt: cachedSummary.generatedAt,
              isEnhanced: cachedSummary.isEnhanced || false,
            };
          } catch (parseError) {
            fastify.log.warn(
              { parseError, summaryId: cachedSummary.id },
              'Corrupted cached summary, will regenerate'
            );
            // Leave summary as null to trigger regeneration
          }
        }
      }

      // If no cached summary or regenerate requested, generate new one
      if (!summary) {
        try {
          const generated = await generateLearningPathSummary(itemData, order, certId);

          // Find related topic IDs based on topic name matching
          const topicNames = itemData.topics;
          const relatedTopicIds: number[] = [];

          if (topicNames.length > 0) {
            // Build OR conditions for topic name matching
            const topicConditions = topicNames.map((name) => like(topics.name, `%${name}%`));
            const relatedTopics = await db
              .select({ id: topics.id })
              .from(topics)
              .innerJoin(domains, eq(topics.domainId, domains.id))
              .where(and(eq(domains.certificationId, certId), or(...topicConditions)));

            relatedTopicIds.push(...relatedTopics.map((t) => t.id));
          }

          // Use transaction for atomic delete + insert to prevent race conditions
          // Note: better-sqlite3 is synchronous, so no async/await inside transaction
          const inserted = db.transaction((tx) => {
            // Delete existing summary if regenerating
            if (regenerate) {
              tx.delete(learningPathSummaries)
                .where(
                  and(
                    eq(learningPathSummaries.certificationId, certId),
                    eq(learningPathSummaries.pathItemOrder, order)
                  )
                )
                .run();
            }

            // Insert new summary - use onConflictDoUpdate to handle concurrent generation
            const [result] = tx
              .insert(learningPathSummaries)
              .values({
                certificationId: certId,
                pathItemOrder: order,
                overview: generated.overview,
                keyTakeaways: JSON.stringify(generated.keyTakeaways),
                importantConcepts: JSON.stringify(generated.importantConcepts),
                examTips: JSON.stringify(generated.examTips),
                relatedTopicIds: JSON.stringify(relatedTopicIds),
                generatedAt: new Date(),
                isEnhanced: generated.isEnhanced,
              })
              .onConflictDoUpdate({
                target: [
                  learningPathSummaries.certificationId,
                  learningPathSummaries.pathItemOrder,
                ],
                set: {
                  overview: generated.overview,
                  keyTakeaways: JSON.stringify(generated.keyTakeaways),
                  importantConcepts: JSON.stringify(generated.importantConcepts),
                  examTips: JSON.stringify(generated.examTips),
                  relatedTopicIds: JSON.stringify(relatedTopicIds),
                  generatedAt: new Date(),
                  isEnhanced: generated.isEnhanced,
                },
              })
              .returning()
              .all();

            return result;
          });

          summary = {
            id: inserted.id,
            pathItemOrder: inserted.pathItemOrder,
            certificationId: inserted.certificationId,
            overview: inserted.overview,
            keyTakeaways: JSON.parse(inserted.keyTakeaways),
            importantConcepts: JSON.parse(inserted.importantConcepts),
            examTips: JSON.parse(inserted.examTips),
            relatedTopicIds: JSON.parse(inserted.relatedTopicIds),
            generatedAt: inserted.generatedAt,
            isEnhanced: inserted.isEnhanced || false,
          };
        } catch (error: any) {
          fastify.log.error(error, 'Failed to generate learning path summary');
          // Return response without summary rather than failing entirely
          summary = null;
        }
      }

      // Get related questions by matching topics
      let relatedQuestions: any[] = [];
      const topicIds = summary?.relatedTopicIds || [];

      if (topicIds.length > 0) {
        const questionsData = await db
          .select({
            question: questions,
            domain: domains,
            topic: topics,
            caseStudy: caseStudies,
          })
          .from(questions)
          .innerJoin(domains, eq(questions.domainId, domains.id))
          .innerJoin(topics, eq(questions.topicId, topics.id))
          .leftJoin(caseStudies, eq(questions.caseStudyId, caseStudies.id))
          .where(inArray(questions.topicId, topicIds))
          .orderBy(sql`RANDOM()`)
          .limit(10);

        relatedQuestions = questionsData.map((q) => ({
          id: q.question.id,
          topicId: q.question.topicId,
          domainId: q.question.domainId,
          caseStudyId: q.question.caseStudyId ?? undefined,
          questionText: q.question.questionText,
          questionType: q.question.questionType,
          options: JSON.parse(q.question.options as string),
          correctAnswers: JSON.parse(q.question.correctAnswers as string),
          explanation: q.question.explanation,
          difficulty: q.question.difficulty,
          gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
          isGenerated: q.question.isGenerated || true,
          createdAt: q.question.createdAt,
          domain: {
            id: q.domain.id,
            certificationId: q.domain.certificationId,
            code: q.domain.code,
            name: q.domain.name,
            weight: q.domain.weight,
            description: q.domain.description,
            orderIndex: q.domain.orderIndex,
          },
          topic: {
            id: q.topic.id,
            domainId: q.topic.domainId,
            code: q.topic.code,
            name: q.topic.name,
            description: q.topic.description,
          },
          caseStudy: mapCaseStudyRecord(q.caseStudy),
        }));
      }

      return {
        item,
        summary,
        relatedQuestions,
        totalItems: LEARNING_PATH_TOTAL,
      };
    }
  );

  // Generate study summary for a domain/topic
  // Rate limit: 10 per minute
  fastify.post<{
    Body: {
      domainId: number;
      topicId?: number;
    };
  }>(
    '/summary',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = studySummarySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }
      const { domainId, topicId } = parseResult.data;

      const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
      if (!domain) {
        return reply.status(404).send({ error: 'Domain not found' });
      }

      let topic = null;
      if (topicId) {
        const [t] = await db.select().from(topics).where(eq(topics.id, topicId));
        topic = t;
      }

      // Get weak points from exam responses
      const responses = await db
        .select({
          isCorrect: examResponses.isCorrect,
          question: questions,
        })
        .from(examResponses)
        .innerJoin(questions, eq(examResponses.questionId, questions.id))
        .where(topicId ? eq(questions.topicId, topicId) : eq(questions.domainId, domainId));

      const incorrectResponses = responses.filter((r) => r.isCorrect === false);
      const weakPoints = incorrectResponses.map((r) => r.question.explanation.slice(0, 100));

      try {
        const content = await generateStudySummary({
          domain: domain.name,
          topic: topic?.name,
          weakPoints: weakPoints.slice(0, 5),
        });

        // Save the summary
        const [saved] = await db
          .insert(studySummaries)
          .values({
            domainId,
            topicId,
            content,
            generatedAt: new Date(),
          })
          .returning();

        return { success: true, summary: saved };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to generate study summary',
          message: error.message,
        });
      }
    }
  );

  // Generate explanation for a wrong answer
  // Rate limit: 20 per minute
  fastify.post<{
    Body: {
      questionId: number;
      userAnswers: number[];
    };
  }>(
    '/explain',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = explainSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }
      const { questionId, userAnswers } = parseResult.data;

      const [result] = await db
        .select({
          question: questions,
          domain: domains,
          topic: topics,
        })
        .from(questions)
        .innerJoin(domains, eq(questions.domainId, domains.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .where(eq(questions.id, questionId));

      if (!result) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      const options = JSON.parse(result.question.options as string);
      const correctAnswers = JSON.parse(result.question.correctAnswers as string);

      try {
        const explanation = await generateExplanation({
          question: result.question.questionText,
          options,
          userAnswers,
          correctAnswers,
          domain: result.domain.name,
          topic: result.topic.name,
        });

        return { success: true, explanation };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to generate explanation',
          message: error.message,
        });
      }
    }
  );

  // Get existing study summaries
  fastify.get('/summaries', async () => {
    const summaries = await db
      .select({
        summary: studySummaries,
        domain: domains,
        topic: topics,
      })
      .from(studySummaries)
      .leftJoin(domains, eq(studySummaries.domainId, domains.id))
      .leftJoin(topics, eq(studySummaries.topicId, topics.id))
      .orderBy(desc(studySummaries.generatedAt));

    return summaries.map((s) => ({
      ...s.summary,
      domain: s.domain,
      topic: s.topic,
    }));
  });

  // ============ STUDY SESSIONS ============

  // Create a new study session
  fastify.post<{ Body: StartStudySessionRequest }>('/sessions', async (request, reply) => {
    const parseResult = startStudySessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const {
      certificationId,
      sessionType,
      topicId,
      domainId,
      questionCount = 10,
    } = parseResult.data;

    // Get and validate certification ID
    const certId = await resolveCertificationId(certificationId, reply);
    if (certId === null) return; // Error already sent

    // Build where condition based on filters
    let whereCondition = eq(domains.certificationId, certId);
    if (topicId) {
      whereCondition = and(eq(domains.certificationId, certId), eq(questions.topicId, topicId))!;
    } else if (domainId) {
      whereCondition = and(eq(domains.certificationId, certId), eq(questions.domainId, domainId))!;
    }

    // Get questions for the session using SQL RANDOM() for efficient random selection
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

    // Use SQL RANDOM() and LIMIT for efficient random selection
    const selectedQuestions = await questionQuery.orderBy(sql`RANDOM()`).limit(questionCount);

    if (selectedQuestions.length === 0) {
      return reply.status(404).send({ error: 'No questions found for the specified criteria' });
    }

    // Create the session
    const userId = parseInt(request.user!.id, 10);
    const [session] = await db
      .insert(studySessions)
      .values({
        userId,
        certificationId: certId,
        sessionType,
        topicId: topicId || null,
        domainId: domainId || selectedQuestions[0]?.question.domainId || null,
        startedAt: new Date(),
        status: 'in_progress',
        totalQuestions: selectedQuestions.length,
      })
      .returning();

    // Format questions for response - SECURITY: Do NOT include correctAnswers or explanation
    // These are only revealed after user submits via /sessions/:id/answer
    const formattedQuestions = selectedQuestions.map((q) => ({
      id: q.question.id,
      questionText: q.question.questionText,
      questionType: q.question.questionType,
      options: JSON.parse(q.question.options as string),
      difficulty: q.question.difficulty,
      gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
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
      sessionId: session.id,
      questions: formattedQuestions,
    };
  });

  // Get active study session for recovery (filtered by certification and user)
  fastify.get<{ Querystring: { certificationId?: string } }>(
    '/sessions/active',
    async (request, reply) => {
      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      const [session] = await db
        .select()
        .from(studySessions)
        .where(
          and(
            eq(studySessions.status, 'in_progress'),
            eq(studySessions.certificationId, certId),
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

      // Get questions that were part of this session (by looking at responses or re-fetching)
      const questionIds = responses.map((r) => r.questionId);
      let sessionQuestions: any[] = [];

      if (questionIds.length > 0) {
        const questionsData = await db
          .select({
            question: questions,
            domain: domains,
            topic: topics,
            caseStudy: caseStudies,
          })
          .from(questions)
          .innerJoin(domains, eq(questions.domainId, domains.id))
          .innerJoin(topics, eq(questions.topicId, topics.id))
          .leftJoin(caseStudies, eq(questions.caseStudyId, caseStudies.id))
          .where(inArray(questions.id, questionIds));

        // SECURITY: Only include correctAnswers/explanation for questions that have been answered
        const answeredQuestionIds = new Set(responses.map((r) => r.questionId));
        sessionQuestions = questionsData.map((q) => {
          const base = {
            id: q.question.id,
            questionText: q.question.questionText,
            questionType: q.question.questionType,
            options: JSON.parse(q.question.options as string),
            difficulty: q.question.difficulty,
            gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
            caseStudyId: q.question.caseStudyId ?? undefined,
            domain: { id: q.domain.id, name: q.domain.name, code: q.domain.code },
            topic: { id: q.topic.id, name: q.topic.name },
            caseStudy: mapCaseStudyRecord(q.caseStudy),
          };
          // Only reveal answers for already-answered questions
          if (answeredQuestionIds.has(q.question.id)) {
            return {
              ...base,
              correctAnswers: JSON.parse(q.question.correctAnswers as string),
              explanation: q.question.explanation,
            };
          }
          return base;
        });
      }

      return {
        session,
        responses: responses.map((r) => ({
          ...r,
          selectedAnswers: JSON.parse(r.selectedAnswers as string),
        })),
        questions: sessionQuestions,
      };
    }
  );

  // Submit answer during study session
  fastify.patch<{
    Params: { id: string };
    Body: SubmitStudyAnswerRequest;
  }>('/sessions/:id/answer', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const sessionId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const bodyResult = submitStudyAnswerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { questionId, selectedAnswers, timeSpentSeconds } = bodyResult.data;

    // Verify session exists, belongs to user, and is active
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    if (session.status !== 'in_progress') {
      return reply.status(400).send({ error: 'Session is not active' });
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
      return reply.status(500).send({ error: 'Invalid question data' });
    }

    const isCorrect =
      selectedAnswers.length === correctAnswers.length &&
      selectedAnswers.every((a) => correctAnswers.includes(a)) &&
      correctAnswers.every((a) => selectedAnswers.includes(a));

    // Use transaction to prevent TOCTOU race condition
    // The unique constraint on (sessionId, questionId) also prevents duplicates
    // Note: better-sqlite3 is synchronous, so no async/await inside transaction
    const addedToSR = db.transaction((tx) => {
      // Check if response already exists
      const [existingResponse] = tx
        .select()
        .from(studySessionResponses)
        .where(
          and(
            eq(studySessionResponses.sessionId, sessionId),
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
          .where(eq(studySessionResponses.sessionId, sessionId))
          .all();

        // Create new response
        tx.insert(studySessionResponses)
          .values({
            userId,
            sessionId,
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
                  eq(studySessionResponses.sessionId, sessionId),
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
        .where(eq(studySessions.id, sessionId))
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

  // Complete study session
  fastify.patch<{
    Params: { id: string };
    Body: CompleteStudySessionRequest;
  }>('/sessions/:id/complete', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const sessionId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const bodyResult = completeStudySessionSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { responses, totalTimeSeconds } = bodyResult.data;

    // Verify session ownership
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Batch fetch all data upfront to avoid N+1
    const questionIds = responses.map((r) => r.questionId);

    // Fetch all questions in one query
    const allQuestions =
      questionIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.id, questionIds))
        : [];
    const questionsMap = new Map(allQuestions.map((q) => [q.id, q]));

    // Fetch all existing responses in one query
    const existingResponses = await db
      .select()
      .from(studySessionResponses)
      .where(eq(studySessionResponses.sessionId, sessionId));
    const existingResponsesMap = new Map(existingResponses.map((r) => [r.questionId, r]));

    // Fetch all existing SR entries for this user in one query
    const existingSREntries =
      questionIds.length > 0
        ? await db
            .select()
            .from(spacedRepetition)
            .where(
              and(
                inArray(spacedRepetition.questionId, questionIds),
                eq(spacedRepetition.userId, userId)
              )
            )
        : [];
    const existingSRMap = new Set(existingSREntries.map((sr) => sr.questionId));

    // Use transaction for atomic operations
    // Note: better-sqlite3 is synchronous, so no async/await inside transaction
    // Prepare data outside transaction, then execute inserts synchronously
    let currentOrderIndex = existingResponses.length;
    const responsesToInsert: Array<{
      userId: number;
      sessionId: number;
      questionId: number;
      selectedAnswers: string;
      isCorrect: boolean;
      timeSpentSeconds: number;
      orderIndex: number;
      addedToSR: boolean;
    }> = [];
    const srToInsert: Array<{
      userId: number;
      questionId: number;
      easeFactor: number;
      interval: number;
      repetitions: number;
      nextReviewAt: Date;
    }> = [];

    for (const response of responses) {
      const question = questionsMap.get(response.questionId);
      if (!question) continue;

      const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
      const isCorrect =
        response.selectedAnswers.length === correctAnswers.length &&
        response.selectedAnswers.every((a) => correctAnswers.includes(a)) &&
        correctAnswers.every((a) => response.selectedAnswers.includes(a));

      // Only insert if not already exists
      if (!existingResponsesMap.has(response.questionId)) {
        currentOrderIndex++;
        let addedToSR = false;

        if (!isCorrect && !existingSRMap.has(response.questionId)) {
          srToInsert.push({
            userId,
            questionId: response.questionId,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewAt: new Date(),
          });
          existingSRMap.add(response.questionId); // Prevent duplicates within batch
          addedToSR = true;
        }

        responsesToInsert.push({
          userId,
          sessionId,
          questionId: response.questionId,
          selectedAnswers: JSON.stringify(response.selectedAnswers),
          isCorrect,
          timeSpentSeconds: response.timeSpentSeconds,
          orderIndex: currentOrderIndex,
          addedToSR,
        });
      }
    }

    // Count actual correct answers from combined data (computed before transaction)
    const allResponsesData = [...existingResponses, ...responsesToInsert];
    const actualCorrect = allResponsesData.filter((r) => r.isCorrect).length;
    const actualTotal = allResponsesData.length;
    const actualAddedToSR = allResponsesData.filter((r) => r.addedToSR).length;

    // Execute all inserts and update in a synchronous transaction
    db.transaction((tx) => {
      // Bulk insert responses
      if (responsesToInsert.length > 0) {
        tx.insert(studySessionResponses).values(responsesToInsert).run();
      }

      // Bulk insert SR entries
      if (srToInsert.length > 0) {
        tx.insert(spacedRepetition).values(srToInsert).run();
      }

      // Complete the session
      tx.update(studySessions)
        .set({
          status: 'completed',
          completedAt: new Date(),
          timeSpentSeconds: totalTimeSeconds,
          correctAnswers: actualCorrect,
          totalQuestions: actualTotal,
        })
        .where(eq(studySessions.id, sessionId))
        .run();
    });

    // Update streak after session completion with error handling
    let streakUpdate;
    let currentStreak: number | undefined;
    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;
      currentStreak = streakResult.streak.currentStreak;
    } catch (error) {
      // Log error but don't fail the study session completion
      fastify.log.error(
        {
          userId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to update streak after study session completion'
      );
      // Graceful degradation - streak update is non-critical
      streakUpdate = undefined;
    }

    // Award XP for study session completion (idempotency handled inside awardCustomXP)
    let xpUpdate: XPAwardResponse | undefined;
    try {
      const xpSource = `STUDY_SESSION_COMPLETE_${sessionId}`;

      const questionXp =
        actualCorrect * XP_AWARDS.QUESTION_CORRECT +
        (actualTotal - actualCorrect) * XP_AWARDS.QUESTION_INCORRECT;
      const totalXpToAward = questionXp + XP_AWARDS.STUDY_SESSION_COMPLETE;

      const result = await awardCustomXP(userId, totalXpToAward, xpSource);
      xpUpdate = result ?? undefined;
    } catch (error) {
      // Log error but don't fail the study session completion
      fastify.log.error(
        {
          userId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to award XP after study session completion'
      );
      // Graceful degradation - XP award is non-critical
      xpUpdate = undefined;
    }

    // Check achievements: night-owl, early-bird (time of day), streak badges
    let achievementsUnlocked: AchievementUnlockResponse[] = [];
    try {
      const currentHour = new Date().getHours();
      const achievementContext: AchievementContext = {
        activity: 'study',
        timeOfDay: currentHour,
        score: actualCorrect,
        totalQuestions: actualTotal,
        streak: currentStreak,
      };
      achievementsUnlocked = await checkAndUnlock(userId, achievementContext);
    } catch (error) {
      fastify.log.error(
        {
          userId,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to check achievements after study session completion'
      );
    }

    const result = {
      score: actualTotal > 0 ? Math.round((actualCorrect / actualTotal) * 100) : 0,
      correctCount: actualCorrect,
      totalCount: actualTotal,
      addedToSRCount: actualAddedToSR,
      streakUpdate,
      xpUpdate,
      achievementsUnlocked,
    };

    return result;
  });

  // Abandon study session
  fastify.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const sessionId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify ownership
    const [session] = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    await db
      .update(studySessions)
      .set({ status: 'abandoned', completedAt: new Date() })
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));

    return { success: true };
  });

  // Get questions for topic practice
  fastify.get<{
    Params: { topicId: string };
    Querystring: { count?: string; difficulty?: string };
  }>('/topics/:topicId/questions', async (request, reply) => {
    const paramResult = topicIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const topicId = paramResult.data.topicId;

    const queryResult = topicQuestionsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send(formatZodError(queryResult.error));
    }
    const count = queryResult.data.count || 10;
    const difficulty = queryResult.data.difficulty;

    // Build where condition
    const whereCondition = difficulty
      ? and(eq(questions.topicId, topicId), eq(questions.difficulty, difficulty))
      : eq(questions.topicId, topicId);

    // Use SQL RANDOM() and LIMIT for efficient random selection
    const selectedQuestions = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
        caseStudy: caseStudies,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .leftJoin(caseStudies, eq(questions.caseStudyId, caseStudies.id))
      .where(whereCondition)
      .orderBy(sql`RANDOM()`)
      .limit(count);

    return selectedQuestions.map((q) => ({
      id: q.question.id,
      questionText: q.question.questionText,
      questionType: q.question.questionType,
      options: JSON.parse(q.question.options as string),
      correctAnswers: JSON.parse(q.question.correctAnswers as string),
      explanation: q.question.explanation,
      difficulty: q.question.difficulty,
      gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
      caseStudyId: q.question.caseStudyId ?? undefined,
      domain: { id: q.domain.id, name: q.domain.name, code: q.domain.code },
      topic: { id: q.topic.id, name: q.topic.name },
      caseStudy: mapCaseStudyRecord(q.caseStudy),
    }));
  });

  // Get topic practice stats for authenticated user
  fastify.get<{ Params: { topicId: string } }>('/topics/:topicId/stats', async (request, reply) => {
    const paramResult = topicIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const topicId = paramResult.data.topicId;
    const userId = parseInt(request.user!.id, 10);

    // Get all exam responses for this topic for this user
    const responses = await db
      .select({
        isCorrect: examResponses.isCorrect,
        questionId: examResponses.questionId,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .where(and(eq(questions.topicId, topicId), eq(examResponses.userId, userId)));

    const totalAttempted = responses.length;
    const correctCount = responses.filter((r) => r.isCorrect).length;
    const accuracy = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;

    // Get questions in SR queue for this topic for this user
    const srQuestions = await db
      .select({ count: sql<number>`count(*)` })
      .from(spacedRepetition)
      .innerJoin(questions, eq(spacedRepetition.questionId, questions.id))
      .where(and(eq(questions.topicId, topicId), eq(spacedRepetition.userId, userId)));

    // Get last practice date from study sessions for this user
    const [lastSession] = await db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.topicId, topicId),
          eq(studySessions.status, 'completed'),
          eq(studySessions.userId, userId)
        )
      )
      .orderBy(desc(studySessions.completedAt))
      .limit(1);

    // Determine recommended action
    let recommendedAction: 'practice' | 'review' | 'mastered' = 'practice';
    if (accuracy >= 90 && totalAttempted >= 10) {
      recommendedAction = 'mastered';
    } else if (srQuestions[0]?.count > 0) {
      recommendedAction = 'review';
    }

    return {
      topicId,
      accuracy,
      totalAttempted,
      lastPracticed: lastSession?.completedAt || null,
      questionsInSR: srQuestions[0]?.count || 0,
      recommendedAction,
    };
  });
}
