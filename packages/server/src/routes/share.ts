import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  exams,
  examResponses,
  examShares,
  certifications,
  domains,
  questions,
} from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { GetSharedResultResponse, ShareableDomainScore } from '@ace-prep/shared';

/**
 * Public share routes - no authentication required.
 * These endpoints allow viewing shared exam results.
 */
export async function shareRoutes(fastify: FastifyInstance) {
  // GET /api/share/exam/:hash - Public endpoint to view shared exam results
  fastify.get<{ Params: { hash: string } }>(
    '/exam/:hash',
    {
      config: {
        // Rate limit: 30 requests per minute per IP for public endpoint
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;

      if (!hash || typeof hash !== 'string' || hash.length !== 32) {
        return reply.status(404).send({ error: 'Share not found' });
      }

      // Find the share record
      const [shareRecord] = await db
        .select()
        .from(examShares)
        .where(eq(examShares.shareHash, hash));

      if (!shareRecord) {
        return reply.status(404).send({ error: 'Share not found' });
      }

      // Get the exam with certification info
      const [exam] = await db
        .select({
          exam: exams,
          certification: certifications,
        })
        .from(exams)
        .innerJoin(certifications, eq(exams.certificationId, certifications.id))
        .where(eq(exams.id, shareRecord.examId));

      if (!exam || exam.exam.status !== 'completed') {
        return reply.status(404).send({ error: 'Share not found' });
      }

      // Get exam responses with domain info for breakdown
      const responses = await db
        .select({
          isCorrect: examResponses.isCorrect,
          domainId: questions.domainId,
          domainName: domains.name,
          domainCode: domains.code,
        })
        .from(examResponses)
        .innerJoin(questions, eq(examResponses.questionId, questions.id))
        .innerJoin(domains, eq(questions.domainId, domains.id))
        .where(eq(examResponses.examId, shareRecord.examId));

      // Calculate domain breakdown
      const domainStats: Record<
        number,
        { domainId: number; domainName: string; domainCode: string; correct: number; total: number }
      > = {};

      for (const r of responses) {
        if (!domainStats[r.domainId]) {
          domainStats[r.domainId] = {
            domainId: r.domainId,
            domainName: r.domainName,
            domainCode: r.domainCode,
            correct: 0,
            total: 0,
          };
        }
        domainStats[r.domainId].total++;
        if (r.isCorrect) {
          domainStats[r.domainId].correct++;
        }
      }

      const domainBreakdown: ShareableDomainScore[] = Object.values(domainStats).map((s) => ({
        domainId: s.domainId,
        domainName: s.domainName,
        domainCode: s.domainCode,
        correctCount: s.correct,
        totalCount: s.total,
        percentage: s.total > 0 ? (s.correct / s.total) * 100 : 0,
      }));

      // Increment view count (fire and forget, don't block response)
      db.update(examShares)
        .set({ viewCount: sql`${examShares.viewCount} + 1` })
        .where(eq(examShares.id, shareRecord.id))
        .run();

      // Determine pass/fail based on certification passing score
      const passingScore = exam.certification.passingScorePercent ?? 70;
      const passed = (exam.exam.score ?? 0) >= passingScore;

      const response: GetSharedResultResponse = {
        result: {
          shareHash: shareRecord.shareHash,
          score: exam.exam.score ?? 0,
          passed,
          certificationCode: exam.certification.code,
          certificationName: exam.certification.name,
          completedAt: exam.exam.completedAt?.toISOString() ?? new Date().toISOString(),
          totalQuestions: exam.exam.totalQuestions,
          correctAnswers: exam.exam.correctAnswers ?? 0,
          domainBreakdown,
          viewCount: shareRecord.viewCount + 1, // Include the current view
        },
      };

      return response;
    }
  );
}
