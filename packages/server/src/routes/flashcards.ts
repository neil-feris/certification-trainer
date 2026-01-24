import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { domains, topics, questions, bookmarks, flashcardSessions } from '../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resolveCertificationId } from '../db/certificationUtils.js';
import { startFlashcardSessionSchema, formatZodError } from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import type { StartFlashcardSessionRequest } from '@ace-prep/shared';

export async function flashcardRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);

  // POST /api/study/flashcards - Create a new flashcard session
  fastify.post<{ Body: StartFlashcardSessionRequest }>('/', async (request, reply) => {
    const parseResult = startFlashcardSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { certificationId, domainId, topicId, bookmarkedOnly, count } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // Resolve certification
    const certId = await resolveCertificationId(certificationId, reply);
    if (certId === null) return;

    // Build where conditions for question selection
    const conditions = [eq(domains.certificationId, certId)];

    if (topicId) {
      conditions.push(eq(questions.topicId, topicId));
    } else if (domainId) {
      conditions.push(eq(questions.domainId, domainId));
    }

    // If bookmarkedOnly, get bookmarked question IDs first
    let bookmarkedQuestionIds: number[] | null = null;
    if (bookmarkedOnly) {
      const userBookmarks = await db
        .select({ targetId: bookmarks.targetId })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.targetType, 'question')));
      bookmarkedQuestionIds = userBookmarks.map((b) => b.targetId);

      if (bookmarkedQuestionIds.length === 0) {
        return reply.status(404).send({ error: 'No bookmarked questions found' });
      }

      conditions.push(inArray(questions.id, bookmarkedQuestionIds));
    }

    // Select questions randomly
    const selectedQuestions = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(and(...conditions))
      .orderBy(sql`RANDOM()`)
      .limit(count);

    if (selectedQuestions.length === 0) {
      return reply.status(404).send({ error: 'No questions found for the specified criteria' });
    }

    const questionIds = selectedQuestions.map((q) => q.question.id);

    // Create the flashcard session
    const [session] = await db
      .insert(flashcardSessions)
      .values({
        userId,
        certificationId: certId,
        domainId: domainId || null,
        topicId: topicId || null,
        bookmarkedOnly: bookmarkedOnly || false,
        status: 'in_progress',
        totalCards: questionIds.length,
        cardsReviewed: 0,
        questionIds: JSON.stringify(questionIds),
        startedAt: new Date(),
      })
      .returning();

    return {
      sessionId: session.id,
      totalCards: questionIds.length,
      questionIds,
    };
  });
}
