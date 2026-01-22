import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  questions,
  domains,
  topics,
  spacedRepetition,
  certifications,
  caseStudies,
} from '../db/schema.js';
import { eq, lte, and, count, like, desc, asc, inArray, sql, isNull } from 'drizzle-orm';
import { generateQuestions, fetchCaseStudyById } from '../services/questionGenerator.js';
import { calculateNextReview } from '../services/spacedRepetition.js';
import { deduplicateQuestions } from '../utils/similarity.js';
import {
  idParamSchema,
  questionBrowseQuerySchema,
  generateQuestionsSchema,
  reviewRatingSchema,
  formatZodError,
  PAGINATION_DEFAULTS,
} from '../validation/schemas.js';
import type {
  PaginatedResponse,
  QuestionWithDomain,
  QuestionFilterOptions,
} from '@ace-prep/shared';
import { authenticate } from '../middleware/auth.js';
import { mapCaseStudyRecord } from '../utils/mappers.js';
import { updateStreak } from '../services/streakService.js';
import { awardCustomXP } from '../services/xpService.js';
import { XP_AWARDS, XPAwardResponse } from '@ace-prep/shared';

const SIMILARITY_THRESHOLD = 0.7;

/** Escape SQL LIKE wildcard characters to prevent pattern injection */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export async function questionRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);
  // Get questions with pagination, filters, search, and sorting
  // Optimized: filters and pagination pushed to SQL instead of in-memory
  fastify.get<{
    Querystring: {
      certificationId?: string;
      domainId?: string;
      topicId?: string;
      difficulty?: string;
      caseStudyId?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', async (request, reply) => {
    const parseResult = questionBrowseQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const {
      certificationId,
      domainId,
      topicId,
      difficulty,
      caseStudyId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = PAGINATION_DEFAULTS.limit,
      offset = PAGINATION_DEFAULTS.offset,
    } = parseResult.data;

    // Build WHERE conditions dynamically
    const conditions = [];
    if (certificationId) {
      // Filter by domains belonging to this certification
      conditions.push(eq(domains.certificationId, certificationId));
    }
    if (domainId) {
      conditions.push(eq(questions.domainId, domainId));
    }
    if (topicId) {
      conditions.push(eq(questions.topicId, topicId));
    }
    if (difficulty) {
      conditions.push(eq(questions.difficulty, difficulty));
    }
    if (caseStudyId !== undefined) {
      // caseStudyId is transformed to number by Zod schema before reaching here
      // caseStudyId=0 means "no case study" (filter for NULL), positive number filters by ID
      if (caseStudyId === 0) {
        conditions.push(isNull(questions.caseStudyId));
      } else {
        conditions.push(eq(questions.caseStudyId, caseStudyId));
      }
    }
    if (search) {
      const escaped = escapeLikePattern(search);
      conditions.push(like(questions.questionText, `%${escaped}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build ORDER BY clause
    const orderByClause =
      sortBy === 'difficulty'
        ? sortOrder === 'asc'
          ? asc(questions.difficulty)
          : desc(questions.difficulty)
        : sortBy === 'domain'
          ? sortOrder === 'asc'
            ? asc(domains.name)
            : desc(domains.name)
          : sortOrder === 'asc'
            ? asc(questions.createdAt)
            : desc(questions.createdAt);

    // Get total count with filters applied (single query)
    // Need to join domains when filtering by certificationId
    const countQuery = db
      .select({ total: count() })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id));
    const [countResult] = await countQuery.where(whereClause);
    const total = countResult?.total ?? 0;

    // Get paginated results with filters applied in SQL
    // Left join case studies to include case study data when present
    const results = await db
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
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const items: QuestionWithDomain[] = results.map((r) => ({
      ...r.question,
      caseStudyId: r.question.caseStudyId ?? undefined,
      questionType: r.question.questionType as 'single' | 'multiple',
      difficulty: r.question.difficulty as 'easy' | 'medium' | 'hard',
      options: JSON.parse(r.question.options as string),
      correctAnswers: JSON.parse(r.question.correctAnswers as string),
      gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
      isGenerated: r.question.isGenerated ?? false,
      domain: r.domain,
      topic: r.topic,
      caseStudy: mapCaseStudyRecord(r.caseStudy),
    }));

    const response: PaginatedResponse<QuestionWithDomain> = {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };

    return response;
  });

  // Get filter options for question browser
  fastify.get<{
    Querystring: { certificationId?: string };
  }>('/filters', async (request) => {
    const { certificationId } = request.query;
    const certId = certificationId ? Number(certificationId) : undefined;

    const certs = db
      .select({
        id: certifications.id,
        code: certifications.code,
        name: certifications.name,
      })
      .from(certifications)
      .where(eq(certifications.isActive, true))
      .all();

    let domainsQuery = db
      .select({
        id: domains.id,
        name: domains.name,
        certificationId: domains.certificationId,
      })
      .from(domains);

    if (certId) {
      domainsQuery = domainsQuery.where(eq(domains.certificationId, certId)) as typeof domainsQuery;
    }
    const doms = domainsQuery.all();

    let topicsQuery = db
      .select({
        id: topics.id,
        name: topics.name,
        domainId: topics.domainId,
      })
      .from(topics);

    if (certId) {
      const domainIds = doms.map((d) => d.id);
      if (domainIds.length > 0) {
        topicsQuery = topicsQuery.where(inArray(topics.domainId, domainIds)) as typeof topicsQuery;
      }
    }
    const tops = topicsQuery.all();

    // Fetch case studies for the selected certification (or all if none selected)
    let caseStudiesQuery = db
      .select({
        id: caseStudies.id,
        code: caseStudies.code,
        name: caseStudies.name,
        certificationId: caseStudies.certificationId,
      })
      .from(caseStudies);

    if (certId) {
      caseStudiesQuery = caseStudiesQuery.where(
        eq(caseStudies.certificationId, certId)
      ) as typeof caseStudiesQuery;
    }
    const cases = caseStudiesQuery.all();

    const [countResult] = db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .where(certId ? eq(domains.certificationId, certId) : undefined)
      .all();

    const response: QuestionFilterOptions = {
      certifications: certs,
      domains: doms,
      topics: tops,
      caseStudies: cases,
      difficulties: ['easy', 'medium', 'hard'],
      totalQuestions: Number(countResult?.count ?? 0),
    };

    return response;
  });

  // Get single question
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = idParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const questionId = parseResult.data.id;

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

    return {
      ...result.question,
      options: JSON.parse(result.question.options as string),
      correctAnswers: JSON.parse(result.question.correctAnswers as string),
      gcpServices: result.question.gcpServices
        ? JSON.parse(result.question.gcpServices as string)
        : [],
      domain: result.domain,
      topic: result.topic,
    };
  });

  // Generate new questions via LLM
  // Rate limit: 5 per minute
  fastify.post<{
    Body: {
      domainId: number;
      topicId?: number;
      caseStudyId?: number;
      difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
      count: number;
      model?: string;
    };
  }>(
    '/generate',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = generateQuestionsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }
      const { domainId, topicId, caseStudyId, difficulty, count, model } = parseResult.data;

      // Get domain and topic info
      const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
      if (!domain) {
        return reply.status(404).send({ error: 'Domain not found' });
      }

      // Get certification code for the domain
      const [certification] = await db
        .select({ code: certifications.code })
        .from(certifications)
        .where(eq(certifications.id, domain.certificationId));
      const certificationCode = certification?.code;

      let topic = null;
      if (topicId) {
        const [t] = await db.select().from(topics).where(eq(topics.id, topicId));
        topic = t;
      } else {
        // Pick a random topic from the domain
        const domainTopics = await db.select().from(topics).where(eq(topics.domainId, domainId));
        topic = domainTopics[Math.floor(Math.random() * domainTopics.length)];
      }

      if (!topic) {
        return reply.status(404).send({ error: 'Topic not found' });
      }

      // Fetch case study if provided
      let caseStudy = undefined;
      if (caseStudyId) {
        caseStudy = await fetchCaseStudyById(caseStudyId);
        if (!caseStudy) {
          return reply.status(404).send({ error: 'Case study not found' });
        }
      }

      try {
        const userId = parseInt(request.user!.id, 10);
        const generatedQuestions = await generateQuestions({
          domain: domain.name,
          topic: topic.name,
          difficulty,
          count,
          model: model as any,
          userId,
          caseStudy: caseStudy ?? undefined,
          certificationCode,
        });

        // Fetch existing questions for this topic to check for duplicates
        const existingTopicQuestions = await db
          .select({ id: questions.id, questionText: questions.questionText })
          .from(questions)
          .where(eq(questions.topicId, topic.id));

        // Check for duplicates among generated questions
        const dedupeResults = deduplicateQuestions(
          generatedQuestions.map((q) => q.questionText),
          existingTopicQuestions,
          SIMILARITY_THRESHOLD
        );

        // Separate valid questions from duplicates
        const skipped: Array<{ questionText: string; similarTo: number; similarity: number }> = [];
        const toInsert: Array<(typeof generatedQuestions)[number]> = [];

        for (let i = 0; i < generatedQuestions.length; i++) {
          const q = generatedQuestions[i];
          const result = dedupeResults[i];

          if (!result.accepted) {
            // Log skipped duplicate
            fastify.log.warn({
              msg: 'Skipping duplicate question',
              questionText: q.questionText.substring(0, 100) + '...',
              similarToId: result.duplicate?.id,
              similarity: result.duplicate?.similarity?.toFixed(2),
              topicId: topic.id,
            });
            skipped.push({
              questionText: q.questionText.substring(0, 100) + '...',
              similarTo: result.duplicate!.id,
              similarity: result.duplicate!.similarity,
            });
          } else {
            toInsert.push(q);
          }
        }

        // Batch insert all valid questions in a single query
        let inserted: any[] = [];
        if (toInsert.length > 0) {
          const now = new Date();
          inserted = await db
            .insert(questions)
            .values(
              toInsert.map((q) => ({
                domainId: domain.id,
                topicId: topic.id,
                caseStudyId: caseStudyId ?? null,
                questionText: q.questionText,
                questionType: q.questionType,
                options: JSON.stringify(q.options),
                correctAnswers: JSON.stringify(q.correctAnswers),
                explanation: q.explanation,
                difficulty: q.difficulty,
                gcpServices: JSON.stringify(q.gcpServices),
                isGenerated: true,
                createdAt: now,
              }))
            )
            .returning();
        }

        return {
          success: true,
          generated: inserted.length,
          skippedDuplicates: skipped.length,
          questions: inserted,
          ...(skipped.length > 0 && { duplicatesSkipped: skipped }),
        };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to generate questions',
          message: error.message,
        });
      }
    }
  );

  // Get questions due for spaced repetition review
  fastify.get('/review', async (request) => {
    const now = new Date();
    const userId = parseInt(request.user!.id, 10);

    const dueQuestions = await db
      .select({
        sr: spacedRepetition,
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(spacedRepetition)
      .innerJoin(questions, eq(spacedRepetition.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(and(lte(spacedRepetition.nextReviewAt, now), eq(spacedRepetition.userId, userId)))
      .limit(20);

    return dueQuestions.map((r) => ({
      ...r.question,
      options: JSON.parse(r.question.options as string),
      correctAnswers: JSON.parse(r.question.correctAnswers as string),
      gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
      domain: r.domain,
      topic: r.topic,
      spacedRepetition: r.sr,
    }));
  });

  // Submit review rating for spaced repetition
  fastify.post<{
    Body: {
      questionId: number;
      quality: 'again' | 'hard' | 'good' | 'easy';
    };
  }>('/review', async (request, reply) => {
    const parseResult = reviewRatingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { questionId, quality } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // Get or create spaced repetition record for this user
    let [sr] = await db
      .select()
      .from(spacedRepetition)
      .where(and(eq(spacedRepetition.questionId, questionId), eq(spacedRepetition.userId, userId)));

    if (!sr) {
      // Create new record
      [sr] = await db
        .insert(spacedRepetition)
        .values({
          userId,
          questionId,
          easeFactor: 2.5,
          interval: 1,
          repetitions: 0,
          nextReviewAt: new Date(),
        })
        .returning();
    }

    // Calculate next review
    const result = calculateNextReview(quality, sr.easeFactor, sr.interval, sr.repetitions);

    // Update record
    await db
      .update(spacedRepetition)
      .set({
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewAt: result.nextReviewAt,
        lastReviewedAt: new Date(),
      })
      .where(eq(spacedRepetition.id, sr.id));

    // Update streak after review completion with error handling
    let streakUpdate;
    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;
    } catch (error) {
      // Log error but don't fail the review submission
      fastify.log.error(
        {
          userId,
          questionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to update streak after review completion'
      );
      // Graceful degradation - streak update is non-critical
      streakUpdate = undefined;
    }

    // Award XP for review completion
    let xpUpdate: XPAwardResponse | undefined;
    try {
      xpUpdate = await awardCustomXP(userId, XP_AWARDS.SR_CARD_REVIEWED, 'SR_CARD_REVIEWED');
    } catch (error) {
      // Log error but don't fail the review submission
      fastify.log.error(
        {
          userId,
          questionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to award XP after review completion'
      );
      // Graceful degradation - XP award is non-critical
      xpUpdate = undefined;
    }

    return {
      success: true,
      nextReviewAt: result.nextReviewAt,
      interval: result.interval,
      streakUpdate,
      xpUpdate,
    };
  });
}
