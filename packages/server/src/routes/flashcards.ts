import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  domains,
  topics,
  questions,
  bookmarks,
  userNotes,
  flashcardSessions,
  flashcardSessionRatings,
  spacedRepetition,
} from '../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resolveCertificationId } from '../db/certificationUtils.js';
import {
  startFlashcardSessionSchema,
  sessionIdParamSchema,
  rateFlashcardSchema,
  completeFlashcardSessionSchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import { calculateNextReview } from '../services/spacedRepetition.js';
import { awardCustomXP } from '../services/xpService.js';
import type {
  StartFlashcardSessionRequest,
  FlashcardCard,
  RateFlashcardRequest,
  CompleteFlashcardSessionRequest,
  XPAwardResponse,
  StreakUpdateResponse,
  ReviewQuality,
} from '@ace-prep/shared';
import { XP_AWARDS } from '@ace-prep/shared';
import { updateStreak } from '../services/streakService.js';

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

  // POST /api/study/flashcards/:sessionId/rate - Submit SR rating for a flashcard
  fastify.post<{ Params: { sessionId: string }; Body: RateFlashcardRequest }>(
    '/:sessionId/rate',
    async (request, reply) => {
      const paramResult = sessionIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send(formatZodError(paramResult.error));
      }

      const bodyResult = rateFlashcardSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(formatZodError(bodyResult.error));
      }

      const { sessionId } = paramResult.data;
      const { questionId, rating } = bodyResult.data;
      const userId = parseInt(request.user!.id, 10);

      // Verify session exists, belongs to user, and is in_progress
      const [session] = await db
        .select()
        .from(flashcardSessions)
        .where(and(eq(flashcardSessions.id, sessionId), eq(flashcardSessions.userId, userId)));

      if (!session) {
        return reply.status(404).send({ error: 'Flashcard session not found' });
      }

      if (session.status !== 'in_progress') {
        return reply.status(400).send({ error: 'Session is not in progress' });
      }

      // Verify the question is part of this session
      const sessionQuestionIds: number[] = JSON.parse(session.questionIds);
      if (!sessionQuestionIds.includes(questionId)) {
        return reply.status(400).send({ error: 'Question is not part of this session' });
      }

      // Insert or update rating in flashcard_session_ratings (unique on session+question)
      const [existingRating] = await db
        .select()
        .from(flashcardSessionRatings)
        .where(
          and(
            eq(flashcardSessionRatings.sessionId, sessionId),
            eq(flashcardSessionRatings.questionId, questionId)
          )
        );

      if (existingRating) {
        await db
          .update(flashcardSessionRatings)
          .set({ rating, ratedAt: new Date() })
          .where(eq(flashcardSessionRatings.id, existingRating.id));
      } else {
        await db.insert(flashcardSessionRatings).values({
          sessionId,
          questionId,
          rating,
          ratedAt: new Date(),
        });

        // Increment cardsReviewed only on first rating per question
        await db
          .update(flashcardSessions)
          .set({ cardsReviewed: session.cardsReviewed + 1 })
          .where(eq(flashcardSessions.id, sessionId));
      }

      // Update spaced repetition schedule
      let [sr] = await db
        .select()
        .from(spacedRepetition)
        .where(
          and(eq(spacedRepetition.questionId, questionId), eq(spacedRepetition.userId, userId))
        );

      if (!sr) {
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

      const srResult = calculateNextReview(rating, sr.easeFactor, sr.interval, sr.repetitions);

      await db
        .update(spacedRepetition)
        .set({
          easeFactor: srResult.easeFactor,
          interval: srResult.interval,
          repetitions: srResult.repetitions,
          nextReviewAt: srResult.nextReviewAt,
          lastReviewedAt: new Date(),
        })
        .where(eq(spacedRepetition.id, sr.id));

      // Award XP (non-critical, graceful degradation)
      let xpUpdate: XPAwardResponse | undefined;
      try {
        const xpSource = `FLASHCARD_RATED_${sessionId}_${questionId}`;
        xpUpdate = (await awardCustomXP(userId, XP_AWARDS.SR_CARD_REVIEWED, xpSource)) ?? undefined;
      } catch (error) {
        fastify.log.error(
          {
            userId,
            questionId,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to award XP after flashcard rating'
        );
      }

      return {
        updated: true,
        nextReviewAt: srResult.nextReviewAt.toISOString(),
        xpUpdate,
      };
    }
  );

  // GET /api/study/flashcards/last-session - Get last completed flashcard session stats
  fastify.get('/last-session', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    const [session] = await db
      .select()
      .from(flashcardSessions)
      .where(and(eq(flashcardSessions.userId, userId), eq(flashcardSessions.status, 'completed')))
      .orderBy(sql`${flashcardSessions.completedAt} DESC`)
      .limit(1);

    if (!session) {
      return { session: null };
    }

    const ratings = await db
      .select()
      .from(flashcardSessionRatings)
      .where(eq(flashcardSessionRatings.sessionId, session.id));

    const ratingDistribution: Record<string, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const r of ratings) {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
    }

    return {
      session: {
        sessionId: session.id,
        totalCards: session.totalCards,
        cardsReviewed: session.cardsReviewed,
        completedAt: session.completedAt?.toISOString() ?? new Date().toISOString(),
        ratingDistribution,
      },
    };
  });

  // PATCH /api/study/flashcards/:sessionId/complete - Complete a flashcard session
  fastify.patch<{ Params: { sessionId: string }; Body: CompleteFlashcardSessionRequest }>(
    '/:sessionId/complete',
    async (request, reply) => {
      const paramResult = sessionIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send(formatZodError(paramResult.error));
      }

      const bodyResult = completeFlashcardSessionSchema.safeParse(request.body || {});
      if (!bodyResult.success) {
        return reply.status(400).send(formatZodError(bodyResult.error));
      }

      const { sessionId } = paramResult.data;
      const userId = parseInt(request.user!.id, 10);

      // Verify session exists, belongs to user, and is in_progress
      const [session] = await db
        .select()
        .from(flashcardSessions)
        .where(and(eq(flashcardSessions.id, sessionId), eq(flashcardSessions.userId, userId)));

      if (!session) {
        return reply.status(404).send({ error: 'Flashcard session not found' });
      }

      if (session.status !== 'in_progress') {
        return reply.status(400).send({ error: 'Session is not in progress' });
      }

      // Mark session as completed
      await db
        .update(flashcardSessions)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(flashcardSessions.id, sessionId));

      // Calculate rating distribution from session ratings
      const ratings = await db
        .select({ rating: flashcardSessionRatings.rating })
        .from(flashcardSessionRatings)
        .where(eq(flashcardSessionRatings.sessionId, sessionId));

      const ratingDistribution: Record<ReviewQuality, number> = {
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
      };
      for (const r of ratings) {
        const quality = r.rating as ReviewQuality;
        if (quality in ratingDistribution) {
          ratingDistribution[quality]++;
        }
      }

      // Award XP for session completion (non-critical)
      let xpUpdate: XPAwardResponse | undefined;
      try {
        const xpSource = `FLASHCARD_SESSION_COMPLETE_${sessionId}`;
        xpUpdate =
          (await awardCustomXP(userId, XP_AWARDS.STUDY_SESSION_COMPLETE, xpSource)) ?? undefined;
      } catch (error) {
        fastify.log.error(
          {
            userId,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to award XP after flashcard session completion'
        );
      }

      // Update streak (non-critical)
      let streakUpdate: StreakUpdateResponse | undefined;
      try {
        const streakResult = await updateStreak(userId);
        streakUpdate = streakResult.streakUpdate;
      } catch (error) {
        fastify.log.error(
          {
            userId,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to update streak after flashcard session completion'
        );
      }

      return {
        cardsReviewed: session.cardsReviewed,
        ratingDistribution,
        xpUpdate,
        streakUpdate,
      };
    }
  );
}
