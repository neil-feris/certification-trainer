import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  exams,
  examResponses,
  questions,
  domains,
  topics,
  performanceStats,
} from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { importProgressSchema, formatZodError } from '../validation/schemas.js';

export async function progressRoutes(fastify: FastifyInstance) {
  // Get dashboard stats - optimized with aggregated queries
  fastify.get('/dashboard', async () => {
    // Single aggregated query for exam stats
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
      .where(eq(exams.status, 'completed'));

    const totalExams = examStats.totalExams;
    const totalQuestionsAnswered = examStats.totalQuestionsAnswered;
    const correctAnswers = examStats.correctAnswers;
    const overallAccuracy =
      totalQuestionsAnswered > 0 ? (correctAnswers / totalQuestionsAnswered) * 100 : 0;

    // Batch query: domains with aggregated response stats (single query with GROUP BY)
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
      .leftJoin(examResponses, eq(examResponses.questionId, questions.id))
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
      accuracy: row.totalAttempts > 0 ? ((row.correctAttempts || 0) / row.totalAttempts) * 100 : 0,
    }));

    // Batch query: topics with domain info and aggregated stats (single query with JOINs + GROUP BY)
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
      .leftJoin(examResponses, eq(examResponses.questionId, questions.id))
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

    // Recent exams (limit 5, already efficient)
    const recentExams = await db
      .select()
      .from(exams)
      .where(eq(exams.status, 'completed'))
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
  });

  // Get detailed domain performance - optimized with aggregated query
  fastify.get('/domains', async () => {
    // Single query: topics with domain info and aggregated response stats
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
      .leftJoin(examResponses, eq(examResponses.questionId, questions.id))
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
  fastify.get('/weak-areas', async () => {
    // Single query: topics with domain info and aggregated stats
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
      .leftJoin(examResponses, eq(examResponses.questionId, questions.id))
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
  });

  // Get exam history
  fastify.get('/history', async () => {
    const allExams = await db.select().from(exams).orderBy(desc(exams.startedAt)).limit(50);

    return allExams;
  });

  // Export all progress data
  fastify.post('/export', async () => {
    const allExams = await db.select().from(exams);
    const allResponses = await db.select().from(examResponses);
    const allSR = await db.select().from(performanceStats);

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
