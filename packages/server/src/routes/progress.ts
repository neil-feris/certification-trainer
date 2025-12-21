import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { exams, examResponses, questions, domains, topics, performanceStats } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

export async function progressRoutes(fastify: FastifyInstance) {
  // Get dashboard stats
  fastify.get('/dashboard', async () => {
    // Get all completed exams
    const completedExams = await db
      .select()
      .from(exams)
      .where(eq(exams.status, 'completed'))
      .orderBy(desc(exams.completedAt));

    const totalExams = completedExams.length;
    const averageScore = totalExams > 0
      ? completedExams.reduce((sum, e) => sum + (e.score || 0), 0) / totalExams
      : 0;
    const bestScore = totalExams > 0
      ? Math.max(...completedExams.map((e) => e.score || 0))
      : 0;
    const totalQuestionsAnswered = completedExams.reduce((sum, e) => sum + e.totalQuestions, 0);
    const correctAnswers = completedExams.reduce((sum, e) => sum + (e.correctAnswers || 0), 0);
    const overallAccuracy = totalQuestionsAnswered > 0
      ? (correctAnswers / totalQuestionsAnswered) * 100
      : 0;

    // Get domain performance
    const allDomains = await db.select().from(domains).orderBy(domains.orderIndex);

    const domainStats = await Promise.all(
      allDomains.map(async (domain) => {
        const responses = await db
          .select({
            isCorrect: examResponses.isCorrect,
          })
          .from(examResponses)
          .innerJoin(questions, eq(examResponses.questionId, questions.id))
          .innerJoin(exams, eq(examResponses.examId, exams.id))
          .where(eq(questions.domainId, domain.id));

        const total = responses.length;
        const correct = responses.filter((r) => r.isCorrect === true).length;

        return {
          domain,
          totalAttempts: total,
          correctAttempts: correct,
          accuracy: total > 0 ? (correct / total) * 100 : 0,
        };
      })
    );

    // Identify weak areas (topics with <70% accuracy)
    const allTopics = await db.select().from(topics);
    const weakAreas = await Promise.all(
      allTopics.map(async (topic) => {
        const [domain] = await db.select().from(domains).where(eq(domains.id, topic.domainId));

        const responses = await db
          .select({
            isCorrect: examResponses.isCorrect,
          })
          .from(examResponses)
          .innerJoin(questions, eq(examResponses.questionId, questions.id))
          .where(eq(questions.topicId, topic.id));

        const total = responses.length;
        const correct = responses.filter((r) => r.isCorrect === true).length;
        const accuracy = total > 0 ? (correct / total) * 100 : 100; // Default to 100 if no attempts

        return {
          topic,
          domain,
          accuracy,
          totalAttempts: total,
        };
      })
    );

    // Filter to topics with attempts and <70% accuracy, sorted by accuracy
    const filteredWeakAreas = weakAreas
      .filter((w) => w.totalAttempts >= 3 && w.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    return {
      totalExams,
      averageScore: Math.round(averageScore * 10) / 10,
      bestScore: Math.round(bestScore * 10) / 10,
      totalQuestionsAnswered,
      correctAnswers,
      overallAccuracy: Math.round(overallAccuracy * 10) / 10,
      domainStats,
      weakAreas: filteredWeakAreas,
      recentExams: completedExams.slice(0, 5),
    };
  });

  // Get detailed domain performance
  fastify.get('/domains', async () => {
    const allDomains = await db.select().from(domains).orderBy(domains.orderIndex);

    return Promise.all(
      allDomains.map(async (domain) => {
        const domainTopics = await db.select().from(topics).where(eq(topics.domainId, domain.id));

        const topicStats = await Promise.all(
          domainTopics.map(async (topic) => {
            const responses = await db
              .select({
                isCorrect: examResponses.isCorrect,
                timeSpentSeconds: examResponses.timeSpentSeconds,
              })
              .from(examResponses)
              .innerJoin(questions, eq(examResponses.questionId, questions.id))
              .where(eq(questions.topicId, topic.id));

            const total = responses.length;
            const correct = responses.filter((r) => r.isCorrect === true).length;
            const avgTime = responses.length > 0
              ? responses.reduce((sum, r) => sum + (r.timeSpentSeconds || 0), 0) / responses.length
              : null;

            return {
              topic,
              totalAttempts: total,
              correctAttempts: correct,
              accuracy: total > 0 ? (correct / total) * 100 : 0,
              avgTimeSeconds: avgTime,
            };
          })
        );

        const domainTotal = topicStats.reduce((sum, t) => sum + t.totalAttempts, 0);
        const domainCorrect = topicStats.reduce((sum, t) => sum + t.correctAttempts, 0);

        return {
          domain,
          totalAttempts: domainTotal,
          correctAttempts: domainCorrect,
          accuracy: domainTotal > 0 ? (domainCorrect / domainTotal) * 100 : 0,
          topics: topicStats,
        };
      })
    );
  });

  // Get weak areas with study recommendations
  fastify.get('/weak-areas', async () => {
    const allTopics = await db.select().from(topics);

    const topicStats = await Promise.all(
      allTopics.map(async (topic) => {
        const [domain] = await db.select().from(domains).where(eq(domains.id, topic.domainId));

        const responses = await db
          .select({
            isCorrect: examResponses.isCorrect,
            questionId: examResponses.questionId,
          })
          .from(examResponses)
          .innerJoin(questions, eq(examResponses.questionId, questions.id))
          .where(eq(questions.topicId, topic.id));

        const total = responses.length;
        const correct = responses.filter((r) => r.isCorrect === true).length;
        const incorrectQuestionIds = responses
          .filter((r) => r.isCorrect === false)
          .map((r) => r.questionId);

        return {
          topic,
          domain,
          totalAttempts: total,
          correctAttempts: correct,
          accuracy: total > 0 ? (correct / total) * 100 : 100,
          incorrectQuestionIds,
        };
      })
    );

    // Get weak areas with at least 2 attempts and <80% accuracy
    return topicStats
      .filter((t) => t.totalAttempts >= 2 && t.accuracy < 80)
      .sort((a, b) => a.accuracy - b.accuracy)
      .map((t) => ({
        topic: t.topic,
        domain: t.domain,
        accuracy: Math.round(t.accuracy * 10) / 10,
        totalAttempts: t.totalAttempts,
        incorrectCount: t.totalAttempts - t.correctAttempts,
        priority: t.accuracy < 50 ? 'high' : t.accuracy < 70 ? 'medium' : 'low',
      }));
  });

  // Get exam history
  fastify.get('/history', async () => {
    const allExams = await db
      .select()
      .from(exams)
      .orderBy(desc(exams.startedAt))
      .limit(50);

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
    // TODO: Implement import logic with validation
    return reply.status(501).send({ error: 'Import not yet implemented' });
  });
}
