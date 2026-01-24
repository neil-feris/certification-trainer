import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  exams,
  examResponses,
  questions,
  domains,
  topics,
  performanceStats,
  certifications,
  xpHistory,
  readinessSnapshots,
} from '../db/schema.js';
import { eq, sql, desc, and } from 'drizzle-orm';
import { importProgressSchema, formatZodError } from '../validation/schemas.js';
import { parseCertificationIdFromQuery } from '../db/certificationUtils.js';
import type { Granularity, TrendDataPoint, TrendsResponse, ReadinessResponse, ReadinessSnapshot } from '@ace-prep/shared';
import { authenticate } from '../middleware/auth.js';
import { getStreak } from '../services/streakService.js';
import { getXP } from '../services/xpService.js';
import { calculateReadinessScore } from '../services/readinessService.js';

/**
 * Calculate ISO 8601 week number.
 * ISO weeks start on Monday, and week 1 is the week containing the first Thursday.
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (make Sunday=7)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

export async function progressRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);
  // Get performance trends data for charting
  fastify.get<{
    Querystring: { certificationId?: string; granularity?: string };
  }>('/trends', async (request, reply) => {
    const { certificationId: certIdStr, granularity: granularityStr } = request.query;
    const userId = parseInt(request.user!.id, 10);

    // Validate granularity
    const validGranularities: Granularity[] = ['attempt', 'day', 'week'];
    const granularity: Granularity = validGranularities.includes(granularityStr as Granularity)
      ? (granularityStr as Granularity)
      : 'attempt';

    // Parse optional certificationId (null means return all)
    let certId: number | null = null;
    if (certIdStr) {
      const parsed = parseInt(certIdStr, 10);
      if (isNaN(parsed)) {
        return reply.status(400).send({ error: 'certificationId must be a valid integer' });
      }
      certId = parsed;
    }

    // Build query conditions - always filter by userId
    const conditions = [eq(exams.status, 'completed'), eq(exams.userId, userId)];
    if (certId !== null) {
      conditions.push(eq(exams.certificationId, certId));
    }

    // Fetch completed exams with certification info
    const completedExams = await db
      .select({
        id: exams.id,
        score: exams.score,
        completedAt: exams.completedAt,
        certificationId: exams.certificationId,
        certificationCode: certifications.code,
      })
      .from(exams)
      .innerJoin(certifications, eq(certifications.id, exams.certificationId))
      .where(and(...conditions))
      .orderBy(exams.completedAt);

    // Total count of completed exams matching the filter
    const totalExamCount = completedExams.length;

    if (granularity === 'attempt') {
      // Return individual attempts
      const dataPoints: TrendDataPoint[] = completedExams
        .filter((exam) => exam.completedAt && exam.score !== null)
        .map((exam) => ({
          date: exam.completedAt!.toISOString(),
          score: Math.round(exam.score! * 10) / 10,
          certificationId: exam.certificationId,
          certificationCode: exam.certificationCode,
        }));

      return { data: dataPoints, totalExamCount } satisfies TrendsResponse;
    }

    // For day/week granularity, aggregate scores
    const groupedData = new Map<
      string,
      { scores: number[]; certificationId: number; certificationCode: string }
    >();

    for (const exam of completedExams) {
      if (!exam.completedAt || exam.score === null) continue;

      const date = exam.completedAt;
      let key: string;

      if (granularity === 'day') {
        key = `${exam.certificationId}-${date.toISOString().split('T')[0]}`;
      } else {
        // Week: use ISO 8601 week number
        const { year: isoYear, week: isoWeek } = getISOWeek(date);
        key = `${exam.certificationId}-${isoYear}-W${isoWeek.toString().padStart(2, '0')}`;
      }

      if (!groupedData.has(key)) {
        groupedData.set(key, {
          scores: [],
          certificationId: exam.certificationId,
          certificationCode: exam.certificationCode,
        });
      }
      groupedData.get(key)!.scores.push(exam.score);
    }

    // Calculate averages
    const dataPoints: TrendDataPoint[] = [];
    for (const [key, data] of groupedData) {
      const dateStr = key.substring(key.indexOf('-') + 1); // Remove certificationId prefix
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      dataPoints.push({
        date: dateStr,
        score: Math.round(avgScore * 10) / 10,
        certificationId: data.certificationId,
        certificationCode: data.certificationCode,
      });
    }

    // Sort by date
    dataPoints.sort((a, b) => a.date.localeCompare(b.date));

    return { data: dataPoints, totalExamCount } satisfies TrendsResponse;
  });

  // Get user's current streak data
  fastify.get('/streak', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getStreak(userId);
  });

  // Get user's XP and level data
  fastify.get('/xp', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getXP(userId);
  });

  // Get user's XP history
  fastify.get<{
    Querystring: { limit?: string };
  }>('/xp/history', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    const limitStr = request.query.limit;

    // Default 20, max 50
    let limit = 20;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    const history = await db
      .select({
        id: xpHistory.id,
        userId: xpHistory.userId,
        amount: xpHistory.amount,
        source: xpHistory.source,
        createdAt: xpHistory.createdAt,
      })
      .from(xpHistory)
      .where(eq(xpHistory.userId, userId))
      .orderBy(desc(xpHistory.createdAt))
      .limit(limit);

    return history;
  });

  // Get readiness score with recommendations and recent history
  fastify.get<{
    Querystring: { certificationId?: string };
  }>('/readiness', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return;
    const userId = parseInt(request.user!.id, 10);

    // Calculate current readiness score
    const { score, recommendations } = await calculateReadinessScore(userId, certId, db);

    // Debounce snapshot: only save if last snapshot for this user+cert is older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [lastSnapshot] = await db
      .select({ calculatedAt: readinessSnapshots.calculatedAt })
      .from(readinessSnapshots)
      .where(
        and(
          eq(readinessSnapshots.userId, userId),
          eq(readinessSnapshots.certificationId, certId)
        )
      )
      .orderBy(desc(readinessSnapshots.calculatedAt))
      .limit(1);

    const shouldSave = !lastSnapshot || lastSnapshot.calculatedAt < oneHourAgo;
    if (shouldSave) {
      await db.insert(readinessSnapshots).values({
        userId,
        certificationId: certId,
        overallScore: score.overall,
        domainScoresJson: JSON.stringify(score.domains),
        calculatedAt: new Date(),
      });
    }

    // Fetch recent history (last 10 snapshots for context)
    const historyRows = await db
      .select()
      .from(readinessSnapshots)
      .where(
        and(
          eq(readinessSnapshots.userId, userId),
          eq(readinessSnapshots.certificationId, certId)
        )
      )
      .orderBy(desc(readinessSnapshots.calculatedAt))
      .limit(10);

    const history: ReadinessSnapshot[] = historyRows.map((row) => ({
      id: row.id,
      userId: String(row.userId),
      certificationId: row.certificationId,
      overallScore: row.overallScore,
      domainScoresJson: row.domainScoresJson,
      calculatedAt: row.calculatedAt.toISOString(),
    }));

    return {
      score,
      recommendations,
      history,
    } satisfies ReadinessResponse;
  });

  // Get readiness score history for trend visualization
  fastify.get<{
    Querystring: { certificationId?: string; limit?: string };
  }>('/readiness/history', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return;
    const userId = parseInt(request.user!.id, 10);

    // Default 30, max 90
    let limit = 30;
    const limitStr = request.query.limit;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 90);
      }
    }

    const historyRows = await db
      .select()
      .from(readinessSnapshots)
      .where(
        and(
          eq(readinessSnapshots.userId, userId),
          eq(readinessSnapshots.certificationId, certId)
        )
      )
      .orderBy(desc(readinessSnapshots.calculatedAt))
      .limit(limit);

    const history: ReadinessSnapshot[] = historyRows.map((row) => ({
      id: row.id,
      userId: String(row.userId),
      certificationId: row.certificationId,
      overallScore: row.overallScore,
      domainScoresJson: row.domainScoresJson,
      calculatedAt: row.calculatedAt.toISOString(),
    }));

    return history;
  });

  // Get dashboard stats - optimized with aggregated queries (filtered by certification and user)
  fastify.get<{ Querystring: { certificationId?: string } }>(
    '/dashboard',
    async (request, reply) => {
      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Single aggregated query for exam stats (filtered by certification and user)
      const [examStats] = await db
        .select({
          totalExams: sql<number>`count(*)`.as('total_exams'),
          averageScore: sql<number>`coalesce(avg(${exams.score}), 0)`.as('avg_score'),
          bestScore: sql<number>`coalesce(max(${exams.score}), 0)`.as('best_score'),
          totalQuestionsAnswered: sql<number>`coalesce(sum(${exams.totalQuestions}), 0)`.as(
            'total_questions'
          ),
          correctAnswers: sql<number>`coalesce(sum(${exams.correctAnswers}), 0)`.as(
            'correct_answers'
          ),
        })
        .from(exams)
        .where(
          and(
            eq(exams.status, 'completed'),
            eq(exams.certificationId, certId),
            eq(exams.userId, userId)
          )
        );

      const totalExams = examStats.totalExams;
      const totalQuestionsAnswered = examStats.totalQuestionsAnswered;
      const correctAnswers = examStats.correctAnswers;
      const overallAccuracy =
        totalQuestionsAnswered > 0 ? (correctAnswers / totalQuestionsAnswered) * 100 : 0;

      // Batch query: domains with aggregated response stats (single query with GROUP BY)
      // Only include domains for the selected certification, filtered by user's responses
      const domainStatsRaw = await db
        .select({
          domainId: domains.id,
          domainCode: domains.code,
          domainName: domains.name,
          domainWeight: domains.weight,
          domainDescription: domains.description,
          domainOrderIndex: domains.orderIndex,
          totalAttempts: sql<number>`count(${examResponses.id})`.as('total_attempts'),
          correctAttempts:
            sql<number>`sum(case when ${examResponses.isCorrect} = 1 then 1 else 0 end)`.as(
              'correct_attempts'
            ),
        })
        .from(domains)
        .leftJoin(questions, eq(questions.domainId, domains.id))
        .leftJoin(
          examResponses,
          and(eq(examResponses.questionId, questions.id), eq(examResponses.userId, userId))
        )
        .where(eq(domains.certificationId, certId))
        .groupBy(domains.id)
        .orderBy(domains.orderIndex);

      const domainStats = domainStatsRaw.map((row) => ({
        domain: {
          id: row.domainId,
          code: row.domainCode,
          name: row.domainName,
          weight: row.domainWeight,
          description: row.domainDescription,
          orderIndex: row.domainOrderIndex,
        },
        totalAttempts: row.totalAttempts || 0,
        correctAttempts: row.correctAttempts || 0,
        accuracy:
          row.totalAttempts > 0 ? ((row.correctAttempts || 0) / row.totalAttempts) * 100 : 0,
      }));

      // Batch query: topics with domain info and aggregated stats (single query with JOINs + GROUP BY)
      // Only include topics for domains in the selected certification, filtered by user's responses
      const topicStatsRaw = await db
        .select({
          topicId: topics.id,
          topicCode: topics.code,
          topicName: topics.name,
          topicDescription: topics.description,
          topicDomainId: topics.domainId,
          domainId: domains.id,
          domainCode: domains.code,
          domainName: domains.name,
          domainWeight: domains.weight,
          domainDescription: domains.description,
          domainOrderIndex: domains.orderIndex,
          totalAttempts: sql<number>`count(${examResponses.id})`.as('total_attempts'),
          correctAttempts:
            sql<number>`sum(case when ${examResponses.isCorrect} = 1 then 1 else 0 end)`.as(
              'correct_attempts'
            ),
        })
        .from(topics)
        .innerJoin(domains, eq(domains.id, topics.domainId))
        .leftJoin(questions, eq(questions.topicId, topics.id))
        .leftJoin(
          examResponses,
          and(eq(examResponses.questionId, questions.id), eq(examResponses.userId, userId))
        )
        .where(eq(domains.certificationId, certId))
        .groupBy(topics.id, domains.id);

      // Filter to weak areas: >= 3 attempts and < 70% accuracy
      const weakAreas = topicStatsRaw
        .map((row) => {
          const total = row.totalAttempts || 0;
          const correct = row.correctAttempts || 0;
          const accuracy = total > 0 ? (correct / total) * 100 : 100;
          return {
            topic: {
              id: row.topicId,
              domainId: row.topicDomainId,
              code: row.topicCode,
              name: row.topicName,
              description: row.topicDescription,
            },
            domain: {
              id: row.domainId,
              code: row.domainCode,
              name: row.domainName,
              weight: row.domainWeight,
              description: row.domainDescription,
              orderIndex: row.domainOrderIndex,
            },
            accuracy,
            totalAttempts: total,
          };
        })
        .filter((w) => w.totalAttempts >= 3 && w.accuracy < 70)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5);

      // Recent exams (limit 5, filtered by certification and user)
      const recentExams = await db
        .select()
        .from(exams)
        .where(
          and(
            eq(exams.status, 'completed'),
            eq(exams.certificationId, certId),
            eq(exams.userId, userId)
          )
        )
        .orderBy(desc(exams.completedAt))
        .limit(5);

      return {
        totalExams,
        averageScore: Math.round(examStats.averageScore * 10) / 10,
        bestScore: Math.round(examStats.bestScore * 10) / 10,
        totalQuestionsAnswered,
        correctAnswers,
        overallAccuracy: Math.round(overallAccuracy * 10) / 10,
        domainStats,
        weakAreas,
        recentExams,
      };
    }
  );

  // Get detailed domain performance - optimized with aggregated query
  fastify.get<{ Querystring: { certificationId?: string } }>('/domains', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return; // Error already sent
    const userId = parseInt(request.user!.id, 10);

    // Single query: topics with domain info and aggregated response stats (filtered by certification and user)
    const topicStatsRaw = await db
      .select({
        topicId: topics.id,
        topicCode: topics.code,
        topicName: topics.name,
        topicDescription: topics.description,
        topicDomainId: topics.domainId,
        domainId: domains.id,
        domainCode: domains.code,
        domainName: domains.name,
        domainWeight: domains.weight,
        domainDescription: domains.description,
        domainOrderIndex: domains.orderIndex,
        domainCertificationId: domains.certificationId,
        totalAttempts: sql<number>`count(${examResponses.id})`.as('total_attempts'),
        correctAttempts:
          sql<number>`sum(case when ${examResponses.isCorrect} = 1 then 1 else 0 end)`.as(
            'correct_attempts'
          ),
        avgTimeSeconds: sql<number>`avg(${examResponses.timeSpentSeconds})`.as('avg_time'),
      })
      .from(topics)
      .innerJoin(domains, eq(domains.id, topics.domainId))
      .leftJoin(questions, eq(questions.topicId, topics.id))
      .leftJoin(
        examResponses,
        and(eq(examResponses.questionId, questions.id), eq(examResponses.userId, userId))
      )
      .where(eq(domains.certificationId, certId))
      .groupBy(topics.id, domains.id)
      .orderBy(domains.orderIndex, topics.id);

    // Group by domain in memory (single pass)
    const domainMap = new Map<
      number,
      {
        domain: typeof domains.$inferSelect;
        topics: Array<{
          topic: typeof topics.$inferSelect;
          totalAttempts: number;
          correctAttempts: number;
          accuracy: number;
          avgTimeSeconds: number | null;
        }>;
      }
    >();

    for (const row of topicStatsRaw) {
      const total = row.totalAttempts || 0;
      const correct = row.correctAttempts || 0;

      if (!domainMap.has(row.domainId)) {
        domainMap.set(row.domainId, {
          domain: {
            id: row.domainId,
            code: row.domainCode,
            name: row.domainName,
            weight: row.domainWeight,
            description: row.domainDescription,
            orderIndex: row.domainOrderIndex,
            certificationId: row.domainCertificationId,
          },
          topics: [],
        });
      }

      domainMap.get(row.domainId)!.topics.push({
        topic: {
          id: row.topicId,
          domainId: row.topicDomainId,
          code: row.topicCode,
          name: row.topicName,
          description: row.topicDescription,
        },
        totalAttempts: total,
        correctAttempts: correct,
        accuracy: total > 0 ? (correct / total) * 100 : 0,
        avgTimeSeconds: row.avgTimeSeconds,
      });
    }

    // Build final response sorted by domain orderIndex
    return Array.from(domainMap.values())
      .sort((a, b) => a.domain.orderIndex - b.domain.orderIndex)
      .map(({ domain, topics: topicStats }) => {
        const domainTotal = topicStats.reduce((sum, t) => sum + t.totalAttempts, 0);
        const domainCorrect = topicStats.reduce((sum, t) => sum + t.correctAttempts, 0);

        return {
          domain,
          totalAttempts: domainTotal,
          correctAttempts: domainCorrect,
          accuracy: domainTotal > 0 ? (domainCorrect / domainTotal) * 100 : 0,
          topics: topicStats,
        };
      });
  });

  // Get weak areas with study recommendations - optimized with aggregated query
  fastify.get<{ Querystring: { certificationId?: string } }>(
    '/weak-areas',
    async (request, reply) => {
      const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
      if (certId === null) return; // Error already sent
      const userId = parseInt(request.user!.id, 10);

      // Single query: topics with domain info and aggregated stats (filtered by certification and user)
      const topicStatsRaw = await db
        .select({
          topicId: topics.id,
          topicCode: topics.code,
          topicName: topics.name,
          topicDescription: topics.description,
          topicDomainId: topics.domainId,
          domainId: domains.id,
          domainCode: domains.code,
          domainName: domains.name,
          domainWeight: domains.weight,
          domainDescription: domains.description,
          domainOrderIndex: domains.orderIndex,
          totalAttempts: sql<number>`count(${examResponses.id})`.as('total_attempts'),
          correctAttempts:
            sql<number>`sum(case when ${examResponses.isCorrect} = 1 then 1 else 0 end)`.as(
              'correct_attempts'
            ),
          incorrectCount:
            sql<number>`sum(case when ${examResponses.isCorrect} = 0 then 1 else 0 end)`.as(
              'incorrect_count'
            ),
        })
        .from(topics)
        .innerJoin(domains, eq(domains.id, topics.domainId))
        .leftJoin(questions, eq(questions.topicId, topics.id))
        .leftJoin(
          examResponses,
          and(eq(examResponses.questionId, questions.id), eq(examResponses.userId, userId))
        )
        .where(eq(domains.certificationId, certId))
        .groupBy(topics.id, domains.id);

      // Filter, sort, and map in memory
      return topicStatsRaw
        .map((row) => {
          const total = row.totalAttempts || 0;
          const correct = row.correctAttempts || 0;
          const accuracy = total > 0 ? (correct / total) * 100 : 100;
          return {
            topic: {
              id: row.topicId,
              domainId: row.topicDomainId,
              code: row.topicCode,
              name: row.topicName,
              description: row.topicDescription,
            },
            domain: {
              id: row.domainId,
              code: row.domainCode,
              name: row.domainName,
              weight: row.domainWeight,
              description: row.domainDescription,
              orderIndex: row.domainOrderIndex,
            },
            accuracy: Math.round(accuracy * 10) / 10,
            totalAttempts: total,
            incorrectCount: row.incorrectCount || 0,
            priority: accuracy < 50 ? 'high' : accuracy < 70 ? 'medium' : ('low' as const),
          };
        })
        .filter((t) => t.totalAttempts >= 2 && t.accuracy < 80)
        .sort((a, b) => a.accuracy - b.accuracy);
    }
  );

  // Get exam history
  fastify.get('/history', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    const allExams = await db
      .select()
      .from(exams)
      .where(eq(exams.userId, userId))
      .orderBy(desc(exams.startedAt))
      .limit(50);

    return allExams;
  });

  // Export all progress data for authenticated user
  fastify.post('/export', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    const allExams = await db.select().from(exams).where(eq(exams.userId, userId));
    const allResponses = await db
      .select()
      .from(examResponses)
      .where(eq(examResponses.userId, userId));
    const allSR = await db
      .select()
      .from(performanceStats)
      .where(eq(performanceStats.userId, userId));

    return {
      exportedAt: new Date().toISOString(),
      exams: allExams,
      responses: allResponses,
      performanceStats: allSR,
    };
  });

  // Import progress data
  fastify.post<{
    Body: {
      exams: any[];
      responses: any[];
      performanceStats: any[];
    };
  }>('/import', async (request, reply) => {
    const parseResult = importProgressSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    // TODO: Implement import logic with validation
    return reply.status(501).send({ error: 'Import not yet implemented' });
  });
}
