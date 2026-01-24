import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import * as Sentry from '@sentry/node';
import { authenticate } from '../middleware/auth.js';
import { formatZodError } from '../validation/schemas.js';
import { db } from '../db/index.js';
import { userNotes, questions, domains, topics } from '../db/schema.js';

// ============ VALIDATION SCHEMAS ============

const saveNoteSchema = z.object({
  questionId: z.number().int().positive(),
  content: z.string().max(5000),
});

const questionIdParamSchema = z.object({
  questionId: z.string().regex(/^\d+$/, 'questionId must be a positive integer').transform(Number),
});

// ============ ROUTES ============

export async function noteRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /api/notes - Upsert note (empty content deletes)
  fastify.post('/', async (request, reply) => {
    const parseResult = saveNoteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { questionId, content } = parseResult.data;

    return Sentry.startSpan({ op: 'db.note', name: 'Save Note' }, async (span) => {
      span.setAttribute('note.questionId', questionId);

      // Empty content deletes the note
      if (content.trim() === '') {
        db.delete(userNotes)
          .where(and(eq(userNotes.userId, userId), eq(userNotes.questionId, questionId)))
          .run();
        span.setAttribute('note.action', 'deleted');
        return { deleted: true };
      }

      const now = new Date();
      const existing = db
        .select()
        .from(userNotes)
        .where(and(eq(userNotes.userId, userId), eq(userNotes.questionId, questionId)))
        .get();

      if (existing) {
        // Update existing note
        db.update(userNotes)
          .set({ content, updatedAt: now })
          .where(eq(userNotes.id, existing.id))
          .run();
        span.setAttribute('note.action', 'updated');
        return { ...existing, content, updatedAt: now };
      } else {
        // Create new note
        const result = db
          .insert(userNotes)
          .values({
            userId,
            questionId,
            content,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        span.setAttribute('note.action', 'created');
        return result;
      }
    });
  });

  // GET /api/notes/:questionId - Get note for a specific question
  fastify.get('/:questionId', async (request, reply) => {
    const parseResult = questionIdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { questionId } = parseResult.data;

    const note = db
      .select()
      .from(userNotes)
      .where(and(eq(userNotes.userId, userId), eq(userNotes.questionId, questionId)))
      .get();

    return note || null;
  });

  // GET /api/notes - List all user notes with question text and topic
  fastify.get('/', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    const notesWithQuestions = db
      .select({
        note: userNotes,
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(userNotes)
      .innerJoin(questions, eq(userNotes.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(userNotes.userId, userId))
      .all();

    return notesWithQuestions.map((row) => ({
      ...row.note,
      question: {
        id: row.question.id,
        text: row.question.questionText,
        options: JSON.parse(row.question.options as string),
        correctAnswers: JSON.parse(row.question.correctAnswers as string),
        gcpServices: row.question.gcpServices ? JSON.parse(row.question.gcpServices as string) : [],
        explanation: row.question.explanation,
      },
      domain: row.domain,
      topic: row.topic,
    }));
  });

  // DELETE /api/notes/:questionId - Delete note for a question
  fastify.delete('/:questionId', async (request, reply) => {
    const parseResult = questionIdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const userId = parseInt(request.user!.id, 10);
    const { questionId } = parseResult.data;

    const existing = db
      .select()
      .from(userNotes)
      .where(and(eq(userNotes.userId, userId), eq(userNotes.questionId, questionId)))
      .get();

    if (!existing) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    db.delete(userNotes).where(eq(userNotes.id, existing.id)).run();

    return { deleted: true };
  });
}
