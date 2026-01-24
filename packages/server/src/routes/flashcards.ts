import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  domains,
  topics,
  questions,
  bookmarks,
  userNotes,
  flashcardSessions,
} from '../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resolveCertificationId } from '../db/certificationUtils.js';
import {
  startFlashcardSessionSchema,
  sessionIdParamSchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import type { StartFlashcardSessionRequest, FlashcardCard } from '@ace-prep/shared';

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

  // GET /api/study/flashcards/:sessionId - Fetch full question data for a session
  fastify.get<{ Params: { sessionId: string } }>('/:sessionId', async (request, reply) => {
    const parseResult = sessionIdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { sessionId } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // Fetch session and verify ownership
    const [session] = await db
      .select()
      .from(flashcardSessions)
      .where(and(eq(flashcardSessions.id, sessionId), eq(flashcardSessions.userId, userId)));

    if (!session) {
      return reply.status(404).send({ error: 'Flashcard session not found' });
    }

    const questionIds: number[] = JSON.parse(session.questionIds);

    if (questionIds.length === 0) {
      return {
        session: {
          id: session.id,
          certificationId: session.certificationId,
          domainId: session.domainId,
          topicId: session.topicId,
          bookmarkedOnly: session.bookmarkedOnly,
          status: session.status,
          totalCards: session.totalCards,
          cardsReviewed: session.cardsReviewed,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        },
        cards: [],
      };
    }

    // Fetch full question data with domain/topic info
    const questionData = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(inArray(questions.id, questionIds));

    // Fetch user bookmarks for these questions
    const userBookmarks = await db
      .select({ targetId: bookmarks.targetId })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.targetType, 'question'),
          inArray(bookmarks.targetId, questionIds)
        )
      );
    const bookmarkedIds = new Set(userBookmarks.map((b) => b.targetId));

    // Fetch user notes for these questions
    const notes = await db
      .select({ questionId: userNotes.questionId, content: userNotes.content })
      .from(userNotes)
      .where(and(eq(userNotes.userId, userId), inArray(userNotes.questionId, questionIds)));
    const notesMap = new Map(notes.map((n) => [n.questionId, n.content]));

    // Build cards in the order of questionIds (preserve session order)
    const questionMap = new Map(questionData.map((q) => [q.question.id, q]));
    const cards: FlashcardCard[] = questionIds
      .map((qId, index) => {
        const data = questionMap.get(qId);
        if (!data) return null;
        return {
          id: index + 1,
          questionId: data.question.id,
          questionText: data.question.questionText,
          questionType: data.question.questionType as FlashcardCard['questionType'],
          options: JSON.parse(data.question.options),
          correctAnswers: JSON.parse(data.question.correctAnswers),
          explanation: data.question.explanation,
          difficulty: data.question.difficulty as FlashcardCard['difficulty'],
          domain: { id: data.domain.id, name: data.domain.name, code: data.domain.code },
          topic: { id: data.topic.id, name: data.topic.name },
          isBookmarked: bookmarkedIds.has(data.question.id),
          note: notesMap.get(data.question.id) ?? null,
        };
      })
      .filter((card): card is FlashcardCard => card !== null);

    return {
      session: {
        id: session.id,
        certificationId: session.certificationId,
        domainId: session.domainId,
        topicId: session.topicId,
        bookmarkedOnly: session.bookmarkedOnly,
        status: session.status,
        totalCards: session.totalCards,
        cardsReviewed: session.cardsReviewed,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      },
      cards,
    };
  });
}
