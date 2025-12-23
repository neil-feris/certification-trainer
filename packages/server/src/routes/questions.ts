import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { questions, domains, topics, spacedRepetition } from '../db/schema.js';
import { eq, sql, lte, and } from 'drizzle-orm';
import { generateQuestions } from '../services/questionGenerator.js';
import { calculateNextReview } from '../services/spacedRepetition.js';

export async function questionRoutes(fastify: FastifyInstance) {
  // Get all questions (optionally filtered)
  fastify.get<{
    Querystring: { domainId?: string; topicId?: string; difficulty?: string };
  }>('/', async (request) => {
    const { domainId, topicId, difficulty } = request.query;

    let query = db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id));

    const results = await query;

    // Apply filters in memory (simpler for SQLite)
    let filtered = results;
    if (domainId) {
      filtered = filtered.filter((r) => r.domain.id === parseInt(domainId));
    }
    if (topicId) {
      filtered = filtered.filter((r) => r.topic.id === parseInt(topicId));
    }
    if (difficulty) {
      filtered = filtered.filter((r) => r.question.difficulty === difficulty);
    }

    return filtered.map((r) => ({
      ...r.question,
      options: JSON.parse(r.question.options as string),
      correctAnswers: JSON.parse(r.question.correctAnswers as string),
      gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
      domain: r.domain,
      topic: r.topic,
    }));
  });

  // Get single question
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const questionId = parseInt(request.params.id);

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
  fastify.post<{
    Body: {
      domainId: number;
      topicId?: number;
      difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
      count: number;
      model?: string;
    };
  }>('/generate', async (request, reply) => {
    const { domainId, topicId, difficulty, count, model } = request.body;

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

      // Insert generated questions
      const inserted = [];
      for (const q of generatedQuestions) {
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
        questions: inserted,
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
  }>('/review', async (request) => {
    const { questionId, quality } = request.body;

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
