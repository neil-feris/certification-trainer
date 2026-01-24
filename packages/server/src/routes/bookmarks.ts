import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import * as Sentry from '@sentry/node';
import { authenticate } from '../middleware/auth.js';
import { formatZodError } from '../validation/schemas.js';
import { db } from '../db/index.js';
import { bookmarks, questions, domains, topics } from '../db/schema.js';

// ============ VALIDATION SCHEMAS ============

const toggleBookmarkSchema = z.object({
  targetType: z.enum(['question', 'topic', 'domain']),
  targetId: z.number().int().positive(),
});

const checkBookmarkQuerySchema = z.object({
  targetType: z.enum(['question', 'topic', 'domain']),
  targetId: z.string().regex(/^\d+$/, 'targetId must be a positive integer').transform(Number),
});

const listBookmarksQuerySchema = z.object({
  type: z.enum(['question', 'topic', 'domain']).optional(),
});

// ============ ROUTES ============

export async function bookmarkRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /api/bookmarks - Toggle bookmark (create or delete)
  fastify.post('/', async (request, reply) => {
    const parseResult = toggleBookmarkSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { targetType, targetId } = parseResult.data;

    return Sentry.startSpan({ op: 'db.bookmark', name: 'Toggle Bookmark' }, async (span) => {
      span.setAttribute('bookmark.targetType', targetType);
      span.setAttribute('bookmark.targetId', targetId);

      // Check if bookmark exists
      const existing = db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.targetType, targetType),
            eq(bookmarks.targetId, targetId)
          )
        )
        .get();

      if (existing) {
        // Remove bookmark
        db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
        span.setAttribute('bookmark.action', 'removed');
        return { bookmarked: false };
      } else {
        // Create bookmark
        db.insert(bookmarks)
          .values({
            userId,
            targetType,
            targetId,
            createdAt: new Date(),
          })
          .run();
        span.setAttribute('bookmark.action', 'created');
        return { bookmarked: true };
      }
    });
  });

  // GET /api/bookmarks - List user bookmarks with optional type filter
  fastify.get('/', async (request, reply) => {
    const parseResult = listBookmarksQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { type } = parseResult.data;

    return Sentry.startSpan({ op: 'db.bookmark', name: 'List Bookmarks' }, async () => {
      if (type) {
        return db
          .select()
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, userId), eq(bookmarks.targetType, type)))
          .all();
      }

      return db.select().from(bookmarks).where(eq(bookmarks.userId, userId)).all();
    });
  });

  // GET /api/bookmarks/questions - List bookmarked questions with full data
  fastify.get('/questions', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    return Sentry.startSpan({ op: 'db.bookmark', name: 'List Bookmarked Questions' }, async () => {
      const bookmarkedQuestions = db
        .select({
          bookmark: bookmarks,
          question: questions,
          domain: domains,
          topic: topics,
        })
        .from(bookmarks)
        .innerJoin(questions, eq(bookmarks.targetId, questions.id))
        .innerJoin(domains, eq(questions.domainId, domains.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.targetType, 'question')))
        .all();

      return bookmarkedQuestions.map((row) => ({
        ...row.question,
        options: JSON.parse(row.question.options as string),
        correctAnswers: JSON.parse(row.question.correctAnswers as string),
        gcpServices: row.question.gcpServices ? JSON.parse(row.question.gcpServices as string) : [],
        isBookmarked: true,
        domain: row.domain,
        topic: row.topic,
        bookmarkedAt: row.bookmark.createdAt,
      }));
    });
  });

  // GET /api/bookmarks/check - Check if an item is bookmarked
  fastify.get('/check', async (request, reply) => {
    const parseResult = checkBookmarkQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { targetType, targetId } = parseResult.data;

    const existing = db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.targetType, targetType),
          eq(bookmarks.targetId, targetId)
        )
      )
      .get();

    return { bookmarked: !!existing };
  });
}
