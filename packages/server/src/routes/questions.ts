import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { questions, domains, topics, spacedRepetition } from '../db/schema.js';
import { eq, sql, lte, and, count } from 'drizzle-orm';
import { generateQuestions } from '../services/questionGenerator.js';
import { calculateNextReview } from '../services/spacedRepetition.js';
import { deduplicateQuestions } from '../utils/similarity.js';
import {
  idParamSchema,
  questionQuerySchema,
  generateQuestionsSchema,
  reviewRatingSchema,
  formatZodError,
  PAGINATION_DEFAULTS,
} from '../validation/schemas.js';
import type { PaginatedResponse, QuestionWithDomain } from '@ace-prep/shared';

const SIMILARITY_THRESHOLD = 0.7;

export async function questionRoutes(fastify: FastifyInstance) {
  // Get questions with pagination and optional filters
  // Optimized: filters and pagination pushed to SQL instead of in-memory
  fastify.get<{
    Querystring: {
      domainId?: string;
      topicId?: string;
      difficulty?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', async (request, reply) => {
    const parseResult = questionQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const {
      domainId,
      topicId,
      difficulty,
      limit = PAGINATION_DEFAULTS.limit,
      offset = PAGINATION_DEFAULTS.offset,
    } = parseResult.data;

    // Build WHERE conditions dynamically
    const conditions = [];
    if (domainId) {
      conditions.push(eq(questions.domainId, domainId));
    }
    if (topicId) {
      conditions.push(eq(questions.topicId, topicId));
    }
    if (difficulty) {
      conditions.push(eq(questions.difficulty, difficulty));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count with filters applied (single query)
    const [countResult] = await db
      .select({ total: count() })
      .from(questions)
      .where(whereClause);
    const total = countResult?.total ?? 0;

    // Get paginated results with filters applied in SQL
    const results = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    const items: QuestionWithDomain[] = results.map((r) => ({
      ...r.question,
      questionType: r.question.questionType as 'single' | 'multiple',
      difficulty: r.question.difficulty as 'easy' | 'medium' | 'hard',
      options: JSON.parse(r.question.options as string),
      correctAnswers: JSON.parse(r.question.correctAnswers as string),
      gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
      isGenerated: r.question.isGenerated ?? false,
      domain: r.domain,
      topic: r.topic,
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
      gcpServices: result.question.gcpServices ? JSON.parse(result.question.gcpServices as string) : [],
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
      difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
      count: number;
      model?: string;
    };
  }>('/generate', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const parseResult = generateQuestionsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { domainId, topicId, difficulty, count, model } = parseResult.data;

    // Get domain and topic info
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

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

    try {
      const generatedQuestions = await generateQuestions({
        domain: domain.name,
        topic: topic.name,
        difficulty,
        count,
        model: model as any,
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

      // Insert only non-duplicate questions
      const inserted = [];
      const skipped: Array<{ questionText: string; similarTo: number; similarity: number }> = [];

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
          continue;
        }

        const [newQ] = await db
          .insert(questions)
          .values({
            domainId: domain.id,
            topicId: topic.id,
            questionText: q.questionText,
            questionType: q.questionType,
            options: JSON.stringify(q.options),
            correctAnswers: JSON.stringify(q.correctAnswers),
            explanation: q.explanation,
            difficulty: q.difficulty,
            gcpServices: JSON.stringify(q.gcpServices),
            isGenerated: true,
            createdAt: new Date(),
          })
          .returning();
        inserted.push(newQ);
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
  });

  // Get questions due for spaced repetition review
  fastify.get('/review', async () => {
    const now = new Date();

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
      .where(lte(spacedRepetition.nextReviewAt, now))
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

    // Get or create spaced repetition record
    let [sr] = await db.select().from(spacedRepetition).where(eq(spacedRepetition.questionId, questionId));

    if (!sr) {
      // Create new record
      [sr] = await db
        .insert(spacedRepetition)
        .values({
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

    return {
      success: true,
      nextReviewAt: result.nextReviewAt,
      interval: result.interval,
    };
  });
}
