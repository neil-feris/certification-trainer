import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { certifications, exams, examResponses, questions, domains, topics } from '../db/schema.js';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { EXAM_SIZE_OPTIONS, EXAM_SIZE_DEFAULT, type ExamSize } from '@ace-prep/shared';

// Helper to get the default (first active) certification
async function getDefaultCertificationId(): Promise<number> {
  const [cert] = await db.select().from(certifications).where(eq(certifications.isActive, true)).limit(1);
  if (!cert) {
    throw new Error('No active certification found. Please seed the database first.');
  }
  return cert.id;
}

export async function examRoutes(fastify: FastifyInstance) {
  // Get all exams
  fastify.get('/', async (request, reply) => {
    const allExams = await db.select().from(exams).orderBy(sql`${exams.startedAt} DESC`);
    return allExams;
  });

  // Get single exam with responses
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const examId = parseInt(request.params.id);

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    const responses = await db
      .select({
        response: examResponses,
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(examResponses.examId, examId))
      .orderBy(examResponses.orderIndex);

    return {
      ...exam,
      responses: responses.map((r) => ({
        ...r.response,
        selectedAnswers: JSON.parse(r.response.selectedAnswers as string),
        question: {
          ...r.question,
          options: JSON.parse(r.question.options as string),
          correctAnswers: JSON.parse(r.question.correctAnswers as string),
          gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
          domain: r.domain,
          topic: r.topic,
        },
      })),
    };
  });

  // Create new exam
  fastify.post<{ Body: { certificationId?: number; focusDomains?: number[]; questionCount?: number } }>('/', async (request, reply) => {
    const { certificationId, focusDomains, questionCount = EXAM_SIZE_DEFAULT } = request.body || {};

    // Get certification ID (use provided or default)
    const certId = certificationId ?? await getDefaultCertificationId();

    // Validate question count against allowed sizes
    const validSizes = EXAM_SIZE_OPTIONS as readonly number[];
    if (!validSizes.includes(questionCount)) {
      return reply.status(400).send({
        error: `Invalid question count. Must be one of: ${EXAM_SIZE_OPTIONS.join(', ')}`,
        received: questionCount,
        validOptions: [...EXAM_SIZE_OPTIONS],
      });
    }
    const targetCount = questionCount as ExamSize;

    // Build base query - filter by certification's domains and optionally focus domains
    const whereCondition = focusDomains && focusDomains.length > 0
      ? and(eq(domains.certificationId, certId), inArray(questions.domainId, focusDomains))
      : eq(domains.certificationId, certId);

    const baseQuery = db
      .select({ question: questions })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .where(whereCondition);

    // Check available question count first (lightweight count query)
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(baseQuery.as('filtered'));

    const availableCount = countResult.count;
    if (availableCount < targetCount) {
      return reply.status(400).send({
        error: `Not enough questions in database. Have ${availableCount}, need ${targetCount}.`,
        questionCount: availableCount,
        requested: targetCount,
      });
    }

    // Use SQLite RANDOM() for efficient random selection - avoids loading all questions into memory
    const selectedQuestions = await baseQuery
      .orderBy(sql`RANDOM()`)
      .limit(targetCount);

    // Create exam
    const [newExam] = await db
      .insert(exams)
      .values({
        certificationId: certId,
        startedAt: new Date(),
        totalQuestions: selectedQuestions.length,
        status: 'in_progress',
      })
      .returning();

    // Create exam responses (initially empty answers)
    for (let i = 0; i < selectedQuestions.length; i++) {
      await db.insert(examResponses).values({
        examId: newExam.id,
        questionId: selectedQuestions[i].question.id,
        selectedAnswers: JSON.stringify([]),
        orderIndex: i,
        flagged: false,
      });
    }

    return { examId: newExam.id, totalQuestions: selectedQuestions.length };
  });

  // Submit answer for a question
  fastify.patch<{
    Params: { id: string };
    Body: { questionId: number; selectedAnswers: number[]; timeSpentSeconds?: number; flagged?: boolean };
  }>('/:id/answer', async (request, reply) => {
    const examId = parseInt(request.params.id);
    const { questionId, selectedAnswers, timeSpentSeconds, flagged } = request.body;

    // Get the question to check correct answers
    const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
    if (!question) {
      return reply.status(404).send({ error: 'Question not found' });
    }

    const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
    const isCorrect =
      selectedAnswers.length === correctAnswers.length &&
      selectedAnswers.every((a) => correctAnswers.includes(a)) &&
      correctAnswers.every((a) => selectedAnswers.includes(a));

    // Update the response
    await db
      .update(examResponses)
      .set({
        selectedAnswers: JSON.stringify(selectedAnswers),
        isCorrect,
        timeSpentSeconds,
        flagged: flagged ?? false,
      })
      .where(and(eq(examResponses.examId, examId), eq(examResponses.questionId, questionId)));

    return { success: true, isCorrect };
  });

  // Complete exam
  fastify.patch<{
    Params: { id: string };
    Body: { totalTimeSeconds: number };
  }>('/:id/complete', async (request, reply) => {
    const examId = parseInt(request.params.id);
    const { totalTimeSeconds } = request.body;

    // Calculate score
    const responses = await db
      .select()
      .from(examResponses)
      .where(eq(examResponses.examId, examId));

    const correctCount = responses.filter((r) => r.isCorrect === true).length;
    const score = (correctCount / responses.length) * 100;

    // Update exam
    const [updatedExam] = await db
      .update(exams)
      .set({
        completedAt: new Date(),
        timeSpentSeconds: totalTimeSeconds,
        correctAnswers: correctCount,
        score,
        status: 'completed',
      })
      .where(eq(exams.id, examId))
      .returning();

    return updatedExam;
  });

  // Abandon exam
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const examId = parseInt(request.params.id);

    await db.update(exams).set({ status: 'abandoned' }).where(eq(exams.id, examId));

    return { success: true };
  });

  // Get exam review (with explanations)
  fastify.get<{ Params: { id: string } }>('/:id/review', async (request, reply) => {
    const examId = parseInt(request.params.id);

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    if (exam.status !== 'completed') {
      return reply.status(400).send({ error: 'Exam is not completed yet' });
    }

    const responses = await db
      .select({
        response: examResponses,
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(examResponses.examId, examId))
      .orderBy(examResponses.orderIndex);

    // Calculate domain-wise performance
    const domainStats: Record<number, { correct: number; total: number; domain: typeof domains.$inferSelect }> = {};

    responses.forEach((r) => {
      if (!domainStats[r.domain.id]) {
        domainStats[r.domain.id] = { correct: 0, total: 0, domain: r.domain };
      }
      domainStats[r.domain.id].total++;
      if (r.response.isCorrect) {
        domainStats[r.domain.id].correct++;
      }
    });

    return {
      exam,
      responses: responses.map((r) => ({
        ...r.response,
        selectedAnswers: JSON.parse(r.response.selectedAnswers as string),
        question: {
          ...r.question,
          options: JSON.parse(r.question.options as string),
          correctAnswers: JSON.parse(r.question.correctAnswers as string),
          gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
          domain: r.domain,
          topic: r.topic,
        },
      })),
      domainPerformance: Object.values(domainStats).map((s) => ({
        domain: s.domain,
        correct: s.correct,
        total: s.total,
        percentage: (s.correct / s.total) * 100,
      })),
    };
  });
}
