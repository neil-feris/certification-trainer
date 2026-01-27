import { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { db } from '../db/index.js';
import {
  exams,
  examResponses,
  questions,
  domains,
  topics,
  caseStudies,
  examShares,
  certificates,
} from '../db/schema.js';
import { randomBytes } from 'crypto';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { EXAM_SIZE_OPTIONS, EXAM_SIZE_DEFAULT, type ExamSize } from '@ace-prep/shared';
import { resolveCertificationId, parseCertificationIdFromQuery } from '../db/certificationUtils.js';
import {
  idParamSchema,
  createExamSchema,
  submitAnswerSchema,
  batchSubmitSchema,
  completeExamSchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import { mapCaseStudyRecord } from '../utils/mappers.js';
import { updateStreak } from '../services/streakService.js';
import { awardCustomXP } from '../services/xpService.js';
import {
  checkAndUnlock,
  checkDomainExpert,
  type AchievementContext,
} from '../services/achievementService.js';
import {
  XP_AWARDS,
  type XPAwardResponse,
  type AchievementUnlockResponse,
  type CreateShareLinkResponse,
  type GenerateCertificateResponse,
} from '@ace-prep/shared';
import { invalidateReadinessCache } from '../services/readinessService.js';

export async function examRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);
  // Get all exams (filtered by certification and user)
  fastify.get<{ Querystring: { certificationId?: string } }>('/', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return; // Error already sent

    const userId = parseInt(request.user!.id, 10);
    const allExams = await db
      .select()
      .from(exams)
      .where(and(eq(exams.certificationId, certId), eq(exams.userId, userId)))
      .orderBy(sql`${exams.startedAt} DESC`);
    return allExams;
  });

  // Get single exam with responses
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = idParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const examId = parseResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));
    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    const responses = await db
      .select({
        response: examResponses,
        question: questions,
        domain: domains,
        topic: topics,
        caseStudy: caseStudies,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .leftJoin(caseStudies, eq(questions.caseStudyId, caseStudies.id))
      .where(eq(examResponses.examId, examId))
      .orderBy(examResponses.orderIndex);

    return {
      ...exam,
      responses: responses.map((r) => ({
        ...r.response,
        selectedAnswers: JSON.parse(r.response.selectedAnswers as string),
        question: {
          ...r.question,
          caseStudyId: r.question.caseStudyId ?? undefined,
          options: JSON.parse(r.question.options as string),
          correctAnswers: JSON.parse(r.question.correctAnswers as string),
          gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
          domain: r.domain,
          topic: r.topic,
          caseStudy: mapCaseStudyRecord(r.caseStudy),
        },
      })),
    };
  });

  // Create new exam
  fastify.post<{
    Body: { certificationId?: number; focusDomains?: number[]; questionCount?: number };
  }>('/', async (request, reply) => {
    const parseResult = createExamSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { certificationId, focusDomains, questionCount = EXAM_SIZE_DEFAULT } = parseResult.data;

    // Get and validate certification ID
    const certId = await resolveCertificationId(certificationId, reply);
    if (certId === null) return; // Error already sent

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
    const whereCondition =
      focusDomains && focusDomains.length > 0
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
    const selectedQuestions = await baseQuery.orderBy(sql`RANDOM()`).limit(targetCount);

    // Create exam
    const userId = parseInt(request.user!.id, 10);
    const [newExam] = await db
      .insert(exams)
      .values({
        userId,
        certificationId: certId,
        startedAt: new Date(),
        totalQuestions: selectedQuestions.length,
        status: 'in_progress',
      })
      .returning();

    // Create exam responses (batch insert for performance)
    await db.insert(examResponses).values(
      selectedQuestions.map((q, i) => ({
        userId,
        examId: newExam.id,
        questionId: q.question.id,
        selectedAnswers: JSON.stringify([]),
        orderIndex: i,
        flagged: false,
      }))
    );

    return { examId: newExam.id, totalQuestions: selectedQuestions.length };
  });

  // Batch submit answers for all questions (performance optimization)
  fastify.post<{
    Params: { id: string };
    Body: {
      responses: Array<{
        questionId: number;
        selectedAnswers: number[];
        timeSpentSeconds?: number;
        flagged?: boolean;
      }>;
    };
  }>('/:id/submit-batch', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Validate request body
    const bodyResult = batchSubmitSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }

    // Verify exam ownership
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));
    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    const { responses: submittedResponses } = bodyResult.data;

    // Get all questions for this exam in one query
    const questionIds = submittedResponses.map((r) => r.questionId);
    const examQuestions = await db
      .select()
      .from(questions)
      .where(inArray(questions.id, questionIds))
      .all();

    const questionMap = new Map(examQuestions.map((q) => [q.id, q]));

    // Process all responses and prepare batch update
    const updatePromises = submittedResponses.map(async (response) => {
      const question = questionMap.get(response.questionId);
      if (!question) {
        throw new Error(`Question ${response.questionId} not found`);
      }

      const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
      const isCorrect =
        response.selectedAnswers.length === correctAnswers.length &&
        response.selectedAnswers.every((a) => correctAnswers.includes(a)) &&
        correctAnswers.every((a) => response.selectedAnswers.includes(a));

      return db
        .update(examResponses)
        .set({
          selectedAnswers: JSON.stringify(response.selectedAnswers),
          isCorrect,
          timeSpentSeconds: response.timeSpentSeconds,
          flagged: response.flagged ?? false,
        })
        .where(
          and(eq(examResponses.examId, examId), eq(examResponses.questionId, response.questionId))
        );
    });

    await Promise.all(updatePromises);

    return { success: true, processedCount: submittedResponses.length };
  });

  // Submit answer for a question
  fastify.patch<{
    Params: { id: string };
    Body: {
      questionId: number;
      selectedAnswers: number[];
      timeSpentSeconds?: number;
      flagged?: boolean;
    };
  }>('/:id/answer', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify exam ownership
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));
    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    const bodyResult = submitAnswerSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { questionId, selectedAnswers, timeSpentSeconds, flagged } = bodyResult.data;

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
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const bodyResult = completeExamSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { totalTimeSeconds } = bodyResult.data;

    // Use transaction to ensure consistent read and update of exam state
    // Note: better-sqlite3 is synchronous, so no async/await inside transaction
    const txResult = db.transaction((tx) => {
      // Check exam exists, belongs to user, and is in_progress
      const [exam] = tx
        .select()
        .from(exams)
        .where(and(eq(exams.id, examId), eq(exams.userId, userId)))
        .all();
      if (!exam) {
        return { error: 'not_found' as const };
      }
      if (exam.status === 'completed' || exam.status === 'abandoned') {
        return { error: 'already_completed' as const };
      }

      // Calculate score
      const responses = tx
        .select()
        .from(examResponses)
        .where(eq(examResponses.examId, examId))
        .all();

      const correctCount = responses.filter((r) => r.isCorrect === true).length;
      const incorrectCount = responses.length - correctCount;
      const score = responses.length > 0 ? (correctCount / responses.length) * 100 : 0;

      // Update exam atomically
      const [updatedExam] = tx
        .update(exams)
        .set({
          completedAt: new Date(),
          timeSpentSeconds: totalTimeSeconds,
          correctAnswers: correctCount,
          score,
          status: 'completed',
        })
        .where(eq(exams.id, examId))
        .returning()
        .all();

      return { exam: updatedExam, correctCount, incorrectCount, score };
    });

    if ('error' in txResult) {
      if (txResult.error === 'not_found') {
        return reply.status(404).send({ error: 'Exam not found' });
      }
      return reply.status(400).send({ error: 'Exam already completed or abandoned' });
    }

    // Update streak after exam completion with error handling
    let streakUpdate;
    let currentStreak: number | undefined;
    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;
      currentStreak = streakResult.streak.currentStreak;
    } catch (error) {
      // Log error but don't fail the exam completion
      fastify.log.error(
        {
          userId,
          examId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to update streak after exam completion'
      );
      // Graceful degradation - streak update is non-critical
      streakUpdate = undefined;
    }

    // Award XP after exam completion (idempotency handled inside awardCustomXP)
    let xpUpdate: XPAwardResponse | undefined;
    try {
      const xpSource = `EXAM_COMPLETE_${examId}`;

      // Calculate total XP to award:
      // - Per question: +10 for correct, +2 for incorrect
      // - Exam completion bonus: +50
      // - Perfect score bonus: +100 (if score is 100%)
      const questionXP =
        txResult.correctCount * XP_AWARDS.QUESTION_CORRECT +
        txResult.incorrectCount * XP_AWARDS.QUESTION_INCORRECT;
      const completionBonus = XP_AWARDS.EXAM_COMPLETE;
      const perfectScoreBonus = txResult.score === 100 ? XP_AWARDS.EXAM_PERFECT_SCORE : 0;
      const totalXpToAward = questionXP + completionBonus + perfectScoreBonus;

      const result = await awardCustomXP(userId, totalXpToAward, xpSource);
      xpUpdate = result ?? undefined;
      if (!result) {
        fastify.log.info(
          { userId, examId },
          'XP already awarded for this exam, skipping duplicate award'
        );
      }
    } catch (error) {
      // Log error but don't fail the exam completion
      fastify.log.error(
        {
          userId,
          examId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to award XP after exam completion'
      );
      // Graceful degradation - XP update is non-critical
      xpUpdate = undefined;
    }

    // Check achievements after exam completion
    let achievementsUnlocked: AchievementUnlockResponse[] = [];
    try {
      // Count total completed exams for exam-veteran badge
      const [examCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(exams)
        .where(and(eq(exams.userId, userId), eq(exams.status, 'completed')));

      const achievementContext: AchievementContext = {
        activity: 'exam',
        score: txResult.correctCount,
        totalQuestions: txResult.exam.totalQuestions,
        cumulativeExams: examCount.count,
        streak: currentStreak,
      };

      achievementsUnlocked = await checkAndUnlock(userId, achievementContext);

      // Check domain-expert across all response sources
      const domainUnlocks = await checkDomainExpert(userId);
      achievementsUnlocked.push(...domainUnlocks);
    } catch (error) {
      fastify.log.error(
        {
          userId,
          examId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to check achievements after exam completion'
      );
    }

    // Invalidate readiness cache so next fetch reflects updated stats
    invalidateReadinessCache(userId, txResult.exam.certificationId);

    return {
      ...txResult.exam,
      streakUpdate,
      xpUpdate,
      achievementsUnlocked,
    };
  });

  // Abandon exam
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify ownership and update
    await db
      .update(exams)
      .set({ status: 'abandoned' })
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));

    return { success: true };
  });

  // Get exam review (with explanations)
  fastify.get<{ Params: { id: string } }>('/:id/review', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));
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
        caseStudy: caseStudies,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .leftJoin(caseStudies, eq(questions.caseStudyId, caseStudies.id))
      .where(eq(examResponses.examId, examId))
      .orderBy(examResponses.orderIndex);

    // Calculate domain-wise performance
    const domainStats: Record<
      number,
      { correct: number; total: number; domain: typeof domains.$inferSelect }
    > = {};

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
          caseStudyId: r.question.caseStudyId ?? undefined,
          options: JSON.parse(r.question.options as string),
          correctAnswers: JSON.parse(r.question.correctAnswers as string),
          gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
          domain: r.domain,
          topic: r.topic,
          caseStudy: mapCaseStudyRecord(r.caseStudy),
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

  // Create share link for exam
  fastify.post<{ Params: { id: string } }>('/:id/share', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify exam ownership and completion
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));

    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    if (exam.status !== 'completed') {
      return reply.status(400).send({ error: 'Only completed exams can be shared' });
    }

    // Generate unique share hash
    const shareHash = randomBytes(16).toString('hex');

    // Use INSERT ... ON CONFLICT to prevent TOCTOU race condition (fixes issue #5)
    // If share already exists for this exam, the insert is a no-op
    await db
      .insert(examShares)
      .values({
        examId,
        shareHash,
        viewCount: 0,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    // Fetch the share (either newly inserted or existing)
    const [share] = await db.select().from(examShares).where(eq(examShares.examId, examId));

    if (!share) {
      // This should never happen, but handle gracefully
      return reply.status(500).send({ error: 'Failed to create share link' });
    }

    const response: CreateShareLinkResponse = {
      shareHash: share.shareHash,
      shareUrl: `/share/exam/${share.shareHash}`,
      createdAt: share.createdAt.toISOString(),
    };

    return response;
  });

  // Generate certificate for a passing exam
  fastify.post<{
    Params: { id: string };
    Body: { userName?: string };
  }>('/:id/certificate', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const examId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Get exam with ownership check
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.userId, userId)));

    if (!exam) {
      return reply.status(404).send({ error: 'Exam not found' });
    }

    // Check if exam belongs to user (ownership check)
    if (exam.userId !== userId) {
      return reply
        .status(403)
        .send({ error: 'You do not have permission to generate a certificate for this exam' });
    }

    // Check if exam is completed
    if (exam.status !== 'completed') {
      return reply.status(400).send({ error: 'Exam must be completed to generate a certificate' });
    }

    // Check if score is passing (>= 70%)
    const PASSING_SCORE = 70;
    if (exam.score === null || exam.score < PASSING_SCORE) {
      return reply.status(403).send({
        error: `Score must be at least ${PASSING_SCORE}% to earn a certificate`,
        score: exam.score,
        passingScore: PASSING_SCORE,
      });
    }

    // Generate certificate hash using random bytes for unpredictability (fixes security issue #9)
    // Use randomBytes instead of deterministic SHA256 to prevent hash enumeration
    const certificateHash = randomBytes(16).toString('hex'); // 32 chars = 128 bits

    // Use INSERT ... ON CONFLICT to prevent TOCTOU race condition (fixes issue #5)
    // If certificate already exists for this exam, the insert is a no-op
    await db
      .insert(certificates)
      .values({
        examId,
        userId,
        certificationId: exam.certificationId,
        certificateHash,
        score: exam.score,
        issuedAt: new Date(),
      })
      .onConflictDoNothing();

    // Fetch the certificate (either newly inserted or existing)
    const [cert] = await db.select().from(certificates).where(eq(certificates.examId, examId));

    if (!cert) {
      // This should never happen, but handle gracefully
      return reply.status(500).send({ error: 'Failed to create certificate' });
    }

    const response: GenerateCertificateResponse = {
      certificateHash: cert.certificateHash,
      downloadUrl: `/api/certificates/${cert.certificateHash}/download`,
    };
    return response;
  });

  // Submit offline exam (for background sync)
  fastify.post<{
    Body: {
      offlineExamId: string;
      certificationId: number;
      questions: Array<{
        questionId: number;
        selectedAnswers: number[];
        isCorrect: boolean;
        flagged: boolean;
        timeSpentSeconds: number;
      }>;
      totalTimeSeconds: number;
      startedAt: string;
      completedAt: string;
      isOffline: true;
      clientTimestamp: string;
      syncQueueItemId?: string;
    };
  }>('/offline-submit', async (request, reply) => {
    const userId = parseInt(request.user!.id, 10);
    const {
      offlineExamId,
      certificationId,
      questions: submittedQuestions,
      totalTimeSeconds,
      startedAt,
      completedAt,
    } = request.body;

    // Generate content hash for secondary deduplication
    // This catches duplicates even if offlineExamId is lost (e.g., app restart)
    const contentForHash = {
      certificationId,
      questionIds: submittedQuestions.map((q) => q.questionId).sort(),
      startedAt,
    };
    const contentHash = createHash('sha256')
      .update(JSON.stringify(contentForHash))
      .digest('hex')
      .substring(0, 32);

    // Check for duplicate submission by offlineExamId OR content hash
    // offlineExamId can be lost on app restart, so content hash is backup
    const [existingExam] = await db
      .select()
      .from(exams)
      .where(
        and(
          eq(exams.userId, userId),
          sql`(${exams.offlineExamId} = ${offlineExamId} OR ${exams.contentHash} = ${contentHash})`
        )
      )
      .limit(1);

    if (existingExam) {
      // Already synced - return existing result (idempotent)
      fastify.log.info(
        { userId, offlineExamId, contentHash, existingExamId: existingExam.id },
        'Duplicate offline exam submission detected - returning existing result'
      );

      return {
        success: true,
        examId: existingExam.id,
        alreadySynced: true,
        score: existingExam.score,
        correctAnswers: existingExam.correctAnswers,
        totalQuestions: existingExam.totalQuestions,
      };
    }

    // Validate certification exists
    const [certification] = await db
      .select()
      .from(exams)
      .innerJoin(domains, eq(domains.certificationId, certificationId))
      .limit(1);

    if (!certification && certificationId !== undefined) {
      // Check certifications table directly
      const [cert] = await db
        .select()
        .from(domains)
        .where(eq(domains.certificationId, certificationId))
        .limit(1);
      if (!cert) {
        return reply.status(400).send({ error: 'Invalid certification ID' });
      }
    }

    // SECURITY: Re-verify all answers server-side - never trust client-provided isCorrect
    const questionIds = submittedQuestions.map((q) => q.questionId);
    const dbQuestions = await db
      .select({ id: questions.id, correctAnswers: questions.correctAnswers })
      .from(questions)
      .where(inArray(questions.id, questionIds));

    const correctAnswersMap = new Map(
      dbQuestions.map((q) => [q.id, JSON.parse(q.correctAnswers as string) as number[]])
    );

    // Verify each answer and compute server-verified correctness
    const verifiedResponses = submittedQuestions.map((q) => {
      const correctAnswers = correctAnswersMap.get(q.questionId);
      if (!correctAnswers) {
        // Question not found in DB - mark as incorrect
        return { ...q, isCorrect: false, serverVerified: true };
      }

      // Server-side answer verification
      const isCorrect =
        q.selectedAnswers.length === correctAnswers.length &&
        q.selectedAnswers.every((a) => correctAnswers.includes(a)) &&
        correctAnswers.every((a) => q.selectedAnswers.includes(a));

      return { ...q, isCorrect, serverVerified: true };
    });

    // Calculate score from server-verified responses
    const correctCount = verifiedResponses.filter((q) => q.isCorrect).length;
    const totalQuestions = verifiedResponses.length;
    const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // Create the exam record with offline metadata and responses atomically
    const [newExam] = await db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(exams)
        .values({
          userId,
          certificationId,
          startedAt: new Date(startedAt),
          completedAt: new Date(completedAt),
          timeSpentSeconds: totalTimeSeconds,
          totalQuestions,
          correctAnswers: correctCount,
          score,
          status: 'completed',
          offlineExamId, // Store for duplicate detection
          contentHash, // Secondary deduplication via content hash
        })
        .returning();

      // Insert exam responses with server-verified correctness
      if (verifiedResponses.length > 0) {
        await tx.insert(examResponses).values(
          verifiedResponses.map((q, index) => ({
            userId,
            examId: exam.id,
            questionId: q.questionId,
            selectedAnswers: JSON.stringify(q.selectedAnswers),
            isCorrect: q.isCorrect, // Now server-verified, not client-provided
            timeSpentSeconds: q.timeSpentSeconds,
            flagged: q.flagged,
            orderIndex: index,
          }))
        );
      }

      return [exam];
    });

    // Update streak (with error handling)
    let streakUpdate;
    let currentStreak: number | undefined;
    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;
      currentStreak = streakResult.streak.currentStreak;
    } catch (error) {
      fastify.log.error(
        {
          userId,
          examId: newExam.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to update streak for offline exam'
      );
    }

    // Award XP
    let xpUpdate: XPAwardResponse | undefined;
    try {
      const xpSource = `EXAM_COMPLETE_${newExam.id}`;
      const questionXP =
        correctCount * XP_AWARDS.QUESTION_CORRECT +
        (totalQuestions - correctCount) * XP_AWARDS.QUESTION_INCORRECT;
      const completionBonus = XP_AWARDS.EXAM_COMPLETE;
      const perfectScoreBonus = score === 100 ? XP_AWARDS.EXAM_PERFECT_SCORE : 0;
      const totalXpToAward = questionXP + completionBonus + perfectScoreBonus;

      const result = await awardCustomXP(userId, totalXpToAward, xpSource);
      xpUpdate = result ?? undefined;
    } catch (error) {
      fastify.log.error(
        {
          userId,
          examId: newExam.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to award XP for offline exam'
      );
    }

    // Check achievements
    let achievementsUnlocked: AchievementUnlockResponse[] = [];
    try {
      const [examCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(exams)
        .where(and(eq(exams.userId, userId), eq(exams.status, 'completed')));

      const achievementContext: AchievementContext = {
        activity: 'exam',
        score: correctCount,
        totalQuestions,
        cumulativeExams: examCount.count,
        streak: currentStreak,
      };

      achievementsUnlocked = await checkAndUnlock(userId, achievementContext);
      const domainUnlocks = await checkDomainExpert(userId);
      achievementsUnlocked.push(...domainUnlocks);
    } catch (error) {
      fastify.log.error(
        {
          userId,
          examId: newExam.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to check achievements for offline exam'
      );
    }

    // Invalidate readiness cache
    invalidateReadinessCache(userId, certificationId);

    fastify.log.info(
      {
        userId,
        offlineExamId,
        examId: newExam.id,
        score,
        correctCount,
        totalQuestions,
      },
      'Offline exam synced successfully'
    );

    return {
      success: true,
      examId: newExam.id,
      alreadySynced: false,
      score,
      correctAnswers: correctCount,
      totalQuestions,
      streakUpdate,
      xpUpdate,
      achievementsUnlocked,
    };
  });
}
