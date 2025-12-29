import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { certifications, domains, topics, studySummaries, examResponses, questions, studySessions, studySessionResponses, learningPathProgress, spacedRepetition } from '../db/schema.js';
import { eq, desc, and, sql, inArray, notInArray, lte } from 'drizzle-orm';
import { generateStudySummary, generateExplanation } from '../services/studyGenerator.js';
import type { StartStudySessionRequest, SubmitStudyAnswerRequest, CompleteStudySessionRequest } from '@ace-prep/shared';

// Helper to get the default (first active) certification
async function getDefaultCertificationId(): Promise<number> {
  const [cert] = await db.select().from(certifications).where(eq(certifications.isActive, true)).limit(1);
  if (!cert) {
    throw new Error('No active certification found. Please seed the database first.');
  }
  return cert.id;
}

export async function studyRoutes(fastify: FastifyInstance) {
  // Get all domains with topics
  fastify.get('/domains', async () => {
    const allDomains = await db.select().from(domains).orderBy(domains.orderIndex);

    return Promise.all(
      allDomains.map(async (domain) => {
        const domainTopics = await db.select().from(topics).where(eq(topics.domainId, domain.id));
        return {
          ...domain,
          topics: domainTopics,
        };
      })
    );
  });

  // Get learning path structure with completion status
  fastify.get('/learning-path', async () => {
    // Get completion status for all items
    const progress = await db.select().from(learningPathProgress);
    const completedMap = new Map(progress.map(p => [p.pathItemOrder, p.completedAt]));

    // Google Cloud Skills path structure
    const learningPath = [
      {
        order: 1,
        title: 'A Tour of Google Cloud Hands-on Labs',
        type: 'course',
        description: 'Get familiar with the Google Cloud Console, Cloud Shell, and basic navigation',
        topics: ['Console basics', 'IAM fundamentals', 'API management'],
        whyItMatters: 'Foundation for all hands-on work with GCP. Understanding the console and Cloud Shell is essential for the exam.',
      },
      {
        order: 2,
        title: 'Google Cloud Fundamentals: Core Infrastructure',
        type: 'course',
        description: 'Learn about GCP resources, identity and access, and core services',
        topics: ['Resource hierarchy', 'IAM', 'Compute options', 'Storage options'],
        whyItMatters: 'Covers ~40% of exam content. Core concepts tested heavily.',
      },
      {
        order: 3,
        title: 'Essential Google Cloud Infrastructure: Foundation',
        type: 'course',
        description: 'Deep dive into VPCs, VMs, and networking fundamentals',
        topics: ['VPC networking', 'Compute Engine', 'Cloud IAM'],
        whyItMatters: 'Networking questions are common. Understanding VPCs, subnets, and firewall rules is critical.',
      },
      {
        order: 4,
        title: 'Essential Google Cloud Infrastructure: Core Services',
        type: 'course',
        description: 'Storage, databases, and resource management',
        topics: ['Cloud Storage', 'Cloud SQL', 'Resource Manager'],
        whyItMatters: 'Storage selection questions appear frequently. Know when to use each storage type.',
      },
      {
        order: 5,
        title: 'Elastic Google Cloud Infrastructure: Scaling and Automation',
        type: 'course',
        description: 'Load balancing, autoscaling, and infrastructure automation',
        topics: ['Load balancing', 'Autoscaling', 'Managed instance groups', 'Terraform'],
        whyItMatters: 'Exam tests your ability to design scalable solutions. Load balancer selection is a key topic.',
      },
      {
        order: 6,
        title: 'Getting Started with Google Kubernetes Engine',
        type: 'course',
        description: 'Kubernetes fundamentals on GKE',
        topics: ['Kubernetes concepts', 'GKE clusters', 'Workloads', 'Services'],
        whyItMatters: 'GKE questions increased in 2025 exam update. Know cluster types and workload deployment.',
      },
      {
        order: 7,
        title: 'Developing Applications with Cloud Run',
        type: 'course',
        description: 'Serverless containers with Cloud Run',
        topics: ['Cloud Run deployment', 'Container configuration', 'Traffic management'],
        whyItMatters: 'Cloud Run is the go-to serverless option. Exam tests when to use it vs other compute options.',
      },
      {
        order: 8,
        title: 'Logging and Monitoring in Google Cloud',
        type: 'course',
        description: 'Cloud Operations suite for observability',
        topics: ['Cloud Logging', 'Cloud Monitoring', 'Error Reporting', 'Trace'],
        whyItMatters: 'Operations questions are ~20% of exam. Know how to create metrics, alerts, and dashboards.',
      },
      {
        order: 9,
        title: 'Cloud Load Balancing Skill Badge',
        type: 'skill_badge',
        description: 'Hands-on lab for load balancing configurations',
        topics: ['HTTP(S) LB', 'Network LB', 'Internal LB', 'SSL certificates'],
        whyItMatters: 'Practical experience with load balancer setup. Exam has scenario-based LB questions.',
      },
      {
        order: 10,
        title: 'Set Up an App Dev Environment Skill Badge',
        type: 'skill_badge',
        description: 'Configure development environments on GCP',
        topics: ['Cloud Shell', 'Cloud Code', 'Artifact Registry'],
        whyItMatters: 'Development workflow questions test your practical GCP experience.',
      },
      {
        order: 11,
        title: 'Develop your Google Cloud Network Skill Badge',
        type: 'skill_badge',
        description: 'Advanced networking configurations',
        topics: ['VPC peering', 'Shared VPC', 'Private Google Access', 'Cloud NAT'],
        whyItMatters: 'Complex networking scenarios are common. Know hybrid connectivity options.',
      },
      {
        order: 12,
        title: 'Build Infrastructure with Terraform Skill Badge',
        type: 'skill_badge',
        description: 'Infrastructure as Code with Terraform on GCP',
        topics: ['Terraform basics', 'State management', 'Modules'],
        whyItMatters: 'IaC is increasingly important. Know Terraform basics for automated deployments.',
      },
      {
        order: 13,
        title: 'Preparing for Your Associate Cloud Engineer Exam',
        type: 'course',
        description: 'Exam preparation and practice',
        topics: ['Exam format', 'Question types', 'Time management'],
        whyItMatters: 'Final preparation. Understand the exam structure and practice strategies.',
      },
      {
        order: 14,
        title: 'Associate Cloud Engineer Certification',
        type: 'exam',
        description: 'The certification exam itself',
        topics: ['All domains covered'],
        whyItMatters: 'The goal! 50 questions, 2 hours, passing score ~70%.',
      },
    ];

    return learningPath.map(item => ({
      ...item,
      isCompleted: completedMap.has(item.order),
      completedAt: completedMap.get(item.order) || null,
    }));
  });

  // Toggle learning path item completion
  fastify.patch<{ Params: { order: string }; Querystring: { certificationId?: string } }>('/learning-path/:order/toggle', async (request) => {
    const order = parseInt(request.params.order, 10);
    const certId = request.query.certificationId
      ? parseInt(request.query.certificationId, 10)
      : await getDefaultCertificationId();

    // Check if already completed (for this certification)
    const [existing] = await db.select().from(learningPathProgress)
      .where(and(
        eq(learningPathProgress.certificationId, certId),
        eq(learningPathProgress.pathItemOrder, order)
      ));

    if (existing) {
      // Remove completion
      await db.delete(learningPathProgress).where(and(
        eq(learningPathProgress.certificationId, certId),
        eq(learningPathProgress.pathItemOrder, order)
      ));
      return { isCompleted: false, completedAt: null };
    } else {
      // Mark as completed
      const now = new Date();
      await db.insert(learningPathProgress).values({
        certificationId: certId,
        pathItemOrder: order,
        completedAt: now,
      });
      return { isCompleted: true, completedAt: now };
    }
  });

  // Get learning path stats
  fastify.get('/learning-path/stats', async () => {
    const progress = await db.select().from(learningPathProgress);
    const total = 14; // Total learning path items
    const completed = progress.length;

    // Find the first incomplete item
    const completedOrders = new Set(progress.map(p => p.pathItemOrder));
    let nextRecommended: number | null = null;
    for (let i = 1; i <= total; i++) {
      if (!completedOrders.has(i)) {
        nextRecommended = i;
        break;
      }
    }

    return {
      completed,
      total,
      percentComplete: Math.round((completed / total) * 100),
      nextRecommended,
    };
  });

  // Generate study summary for a domain/topic
  fastify.post<{
    Body: {
      domainId: number;
      topicId?: number;
    };
  }>('/summary', async (request, reply) => {
    const { domainId, topicId } = request.body;

    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

    let topic = null;
    if (topicId) {
      const [t] = await db.select().from(topics).where(eq(topics.id, topicId));
      topic = t;
    }

    // Get weak points from exam responses
    const responses = await db
      .select({
        isCorrect: examResponses.isCorrect,
        question: questions,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .where(topicId ? eq(questions.topicId, topicId) : eq(questions.domainId, domainId));

    const incorrectResponses = responses.filter((r) => r.isCorrect === false);
    const weakPoints = incorrectResponses.map((r) => r.question.explanation.slice(0, 100));

    try {
      const content = await generateStudySummary({
        domain: domain.name,
        topic: topic?.name,
        weakPoints: weakPoints.slice(0, 5),
      });

      // Save the summary
      const [saved] = await db
        .insert(studySummaries)
        .values({
          domainId,
          topicId,
          content,
          generatedAt: new Date(),
        })
        .returning();

      return { success: true, summary: saved };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to generate study summary',
        message: error.message,
      });
    }
  });

  // Generate explanation for a wrong answer
  fastify.post<{
    Body: {
      questionId: number;
      userAnswers: number[];
    };
  }>('/explain', async (request, reply) => {
    const { questionId, userAnswers } = request.body;

    const [result] = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(questions.id, questionId));

    if (!result) {
      return reply.status(404).send({ error: 'Question not found' });
    }

    const options = JSON.parse(result.question.options as string);
    const correctAnswers = JSON.parse(result.question.correctAnswers as string);

    try {
      const explanation = await generateExplanation({
        question: result.question.questionText,
        options,
        userAnswers,
        correctAnswers,
        domain: result.domain.name,
        topic: result.topic.name,
      });

      return { success: true, explanation };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to generate explanation',
        message: error.message,
      });
    }
  });

  // Get existing study summaries
  fastify.get('/summaries', async () => {
    const summaries = await db
      .select({
        summary: studySummaries,
        domain: domains,
        topic: topics,
      })
      .from(studySummaries)
      .leftJoin(domains, eq(studySummaries.domainId, domains.id))
      .leftJoin(topics, eq(studySummaries.topicId, topics.id))
      .orderBy(desc(studySummaries.generatedAt));

    return summaries.map((s) => ({
      ...s.summary,
      domain: s.domain,
      topic: s.topic,
    }));
  });

  // ============ STUDY SESSIONS ============

  // Create a new study session
  fastify.post<{ Body: StartStudySessionRequest }>('/sessions', async (request, reply) => {
    const { certificationId, sessionType, topicId, domainId, questionCount = 10 } = request.body;

    // Get certification ID (use provided or default)
    const certId = certificationId ?? await getDefaultCertificationId();

    // Build where condition based on filters
    let whereCondition = eq(domains.certificationId, certId);
    if (topicId) {
      whereCondition = and(eq(domains.certificationId, certId), eq(questions.topicId, topicId))!;
    } else if (domainId) {
      whereCondition = and(eq(domains.certificationId, certId), eq(questions.domainId, domainId))!;
    }

    // Get questions for the session (filtered by certification)
    const questionQuery = db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(whereCondition);

    const allQuestions = await questionQuery;

    if (allQuestions.length === 0) {
      return reply.status(404).send({ error: 'No questions found for the specified criteria' });
    }

    // Shuffle and limit questions
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, questionCount);

    // Create the session
    const [session] = await db.insert(studySessions).values({
      certificationId: certId,
      sessionType,
      topicId: topicId || null,
      domainId: domainId || selectedQuestions[0]?.question.domainId || null,
      startedAt: new Date(),
      status: 'in_progress',
      totalQuestions: selectedQuestions.length,
    }).returning();

    // Format questions for response - SECURITY: Do NOT include correctAnswers or explanation
    // These are only revealed after user submits via /sessions/:id/answer
    const formattedQuestions = selectedQuestions.map((q, index) => ({
      id: q.question.id,
      questionText: q.question.questionText,
      questionType: q.question.questionType,
      options: JSON.parse(q.question.options as string),
      difficulty: q.question.difficulty,
      gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
      domain: {
        id: q.domain.id,
        name: q.domain.name,
        code: q.domain.code,
      },
      topic: {
        id: q.topic.id,
        name: q.topic.name,
      },
    }));

    return {
      sessionId: session.id,
      questions: formattedQuestions,
    };
  });

  // Get active study session for recovery
  fastify.get('/sessions/active', async () => {
    const [session] = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.status, 'in_progress'))
      .orderBy(desc(studySessions.startedAt))
      .limit(1);

    if (!session) {
      return null;
    }

    // Get responses for this session
    const responses = await db
      .select()
      .from(studySessionResponses)
      .where(eq(studySessionResponses.sessionId, session.id));

    // Get questions that were part of this session (by looking at responses or re-fetching)
    const questionIds = responses.map(r => r.questionId);
    let sessionQuestions: any[] = [];

    if (questionIds.length > 0) {
      const questionsData = await db
        .select({
          question: questions,
          domain: domains,
          topic: topics,
        })
        .from(questions)
        .innerJoin(domains, eq(questions.domainId, domains.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .where(inArray(questions.id, questionIds));

      // SECURITY: Only include correctAnswers/explanation for questions that have been answered
      const answeredQuestionIds = new Set(responses.map(r => r.questionId));
      sessionQuestions = questionsData.map(q => {
        const base = {
          id: q.question.id,
          questionText: q.question.questionText,
          questionType: q.question.questionType,
          options: JSON.parse(q.question.options as string),
          difficulty: q.question.difficulty,
          gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
          domain: { id: q.domain.id, name: q.domain.name, code: q.domain.code },
          topic: { id: q.topic.id, name: q.topic.name },
        };
        // Only reveal answers for already-answered questions
        if (answeredQuestionIds.has(q.question.id)) {
          return {
            ...base,
            correctAnswers: JSON.parse(q.question.correctAnswers as string),
            explanation: q.question.explanation,
          };
        }
        return base;
      });
    }

    return {
      session,
      responses: responses.map(r => ({
        ...r,
        selectedAnswers: JSON.parse(r.selectedAnswers as string),
      })),
      questions: sessionQuestions,
    };
  });

  // Submit answer during study session
  fastify.patch<{
    Params: { id: string };
    Body: SubmitStudyAnswerRequest;
  }>('/sessions/:id/answer', async (request, reply) => {
    const sessionId = parseInt(request.params.id, 10);
    const { questionId, selectedAnswers, timeSpentSeconds } = request.body;

    // Verify session exists and is active
    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    if (session.status !== 'in_progress') {
      return reply.status(400).send({ error: 'Session is not active' });
    }

    // Get the question
    const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
    if (!question) {
      return reply.status(404).send({ error: 'Question not found' });
    }

    const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
    const isCorrect = selectedAnswers.length === correctAnswers.length &&
      selectedAnswers.every(a => correctAnswers.includes(a)) &&
      correctAnswers.every(a => selectedAnswers.includes(a));

    // Check if response already exists
    const [existingResponse] = await db
      .select()
      .from(studySessionResponses)
      .where(and(
        eq(studySessionResponses.sessionId, sessionId),
        eq(studySessionResponses.questionId, questionId)
      ));

    let addedToSR = false;

    if (existingResponse) {
      // Update existing response
      await db.update(studySessionResponses)
        .set({
          selectedAnswers: JSON.stringify(selectedAnswers),
          isCorrect,
          timeSpentSeconds,
        })
        .where(eq(studySessionResponses.id, existingResponse.id));
      addedToSR = existingResponse.addedToSR || false;
    } else {
      // Get next order index
      const existingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(studySessionResponses)
        .where(eq(studySessionResponses.sessionId, sessionId));

      // Create new response
      await db.insert(studySessionResponses).values({
        sessionId,
        questionId,
        selectedAnswers: JSON.stringify(selectedAnswers),
        isCorrect,
        timeSpentSeconds,
        orderIndex: (existingCount[0]?.count || 0) + 1,
        addedToSR: false,
      });

      // If incorrect, add to spaced repetition queue
      if (!isCorrect) {
        const [existingSR] = await db
          .select()
          .from(spacedRepetition)
          .where(eq(spacedRepetition.questionId, questionId));

        if (!existingSR) {
          await db.insert(spacedRepetition).values({
            questionId,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewAt: new Date(),
          });
          addedToSR = true;

          // Update the response to mark it
          await db.update(studySessionResponses)
            .set({ addedToSR: true })
            .where(and(
              eq(studySessionResponses.sessionId, sessionId),
              eq(studySessionResponses.questionId, questionId)
            ));
        }
      }
    }

    // Update session sync time
    await db.update(studySessions)
      .set({ syncedAt: new Date() })
      .where(eq(studySessions.id, sessionId));

    // Return correctAnswers and explanation ONLY after user has submitted
    return {
      isCorrect,
      correctAnswers,
      explanation: question.explanation,
      addedToSR,
    };
  });

  // Complete study session
  fastify.patch<{
    Params: { id: string };
    Body: CompleteStudySessionRequest;
  }>('/sessions/:id/complete', async (request, reply) => {
    const sessionId = parseInt(request.params.id, 10);
    const { responses, totalTimeSeconds } = request.body;

    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Batch fetch all data upfront to avoid N+1
    const questionIds = responses.map(r => r.questionId);

    // Fetch all questions in one query
    const allQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];
    const questionsMap = new Map(allQuestions.map(q => [q.id, q]));

    // Fetch all existing responses in one query
    const existingResponses = await db
      .select()
      .from(studySessionResponses)
      .where(eq(studySessionResponses.sessionId, sessionId));
    const existingResponsesMap = new Map(existingResponses.map(r => [r.questionId, r]));

    // Fetch all existing SR entries in one query
    const existingSREntries = questionIds.length > 0
      ? await db.select().from(spacedRepetition).where(inArray(spacedRepetition.questionId, questionIds))
      : [];
    const existingSRMap = new Set(existingSREntries.map(sr => sr.questionId));

    // Use transaction for atomic operations
    const result = await db.transaction(async (tx) => {
      let currentOrderIndex = existingResponses.length;
      const responsesToInsert: Array<{
        sessionId: number;
        questionId: number;
        selectedAnswers: string;
        isCorrect: boolean;
        timeSpentSeconds: number;
        orderIndex: number;
        addedToSR: boolean;
      }> = [];
      const srToInsert: Array<{
        questionId: number;
        easeFactor: number;
        interval: number;
        repetitions: number;
        nextReviewAt: Date;
      }> = [];

      for (const response of responses) {
        const question = questionsMap.get(response.questionId);
        if (!question) continue;

        const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
        const isCorrect = response.selectedAnswers.length === correctAnswers.length &&
          response.selectedAnswers.every(a => correctAnswers.includes(a)) &&
          correctAnswers.every(a => response.selectedAnswers.includes(a));

        // Only insert if not already exists
        if (!existingResponsesMap.has(response.questionId)) {
          currentOrderIndex++;
          let addedToSR = false;

          if (!isCorrect && !existingSRMap.has(response.questionId)) {
            srToInsert.push({
              questionId: response.questionId,
              easeFactor: 2.5,
              interval: 1,
              repetitions: 0,
              nextReviewAt: new Date(),
            });
            existingSRMap.add(response.questionId); // Prevent duplicates within batch
            addedToSR = true;
          }

          responsesToInsert.push({
            sessionId,
            questionId: response.questionId,
            selectedAnswers: JSON.stringify(response.selectedAnswers),
            isCorrect,
            timeSpentSeconds: response.timeSpentSeconds,
            orderIndex: currentOrderIndex,
            addedToSR,
          });
        }
      }

      // Bulk insert responses
      if (responsesToInsert.length > 0) {
        await tx.insert(studySessionResponses).values(responsesToInsert);
      }

      // Bulk insert SR entries
      if (srToInsert.length > 0) {
        await tx.insert(spacedRepetition).values(srToInsert);
      }

      // Count actual correct answers from combined data
      const allResponsesData = [...existingResponses, ...responsesToInsert];
      const actualCorrect = allResponsesData.filter(r => r.isCorrect).length;
      const actualTotal = allResponsesData.length;
      const actualAddedToSR = allResponsesData.filter(r => r.addedToSR).length;

      // Complete the session
      await tx.update(studySessions)
        .set({
          status: 'completed',
          completedAt: new Date(),
          timeSpentSeconds: totalTimeSeconds,
          correctAnswers: actualCorrect,
          totalQuestions: actualTotal,
        })
        .where(eq(studySessions.id, sessionId));

      return {
        score: actualTotal > 0 ? Math.round((actualCorrect / actualTotal) * 100) : 0,
        correctCount: actualCorrect,
        totalCount: actualTotal,
        addedToSRCount: actualAddedToSR,
      };
    });

    return result;
  });

  // Abandon study session
  fastify.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const sessionId = parseInt(request.params.id, 10);

    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    await db.update(studySessions)
      .set({ status: 'abandoned', completedAt: new Date() })
      .where(eq(studySessions.id, sessionId));

    return { success: true };
  });

  // Get questions for topic practice
  fastify.get<{
    Params: { topicId: string };
    Querystring: { count?: string; difficulty?: string };
  }>('/topics/:topicId/questions', async (request) => {
    const topicId = parseInt(request.params.topicId, 10);
    const count = parseInt(request.query.count || '10', 10);
    const difficulty = request.query.difficulty;

    // Build where condition
    const whereCondition = difficulty
      ? and(eq(questions.topicId, topicId), eq(questions.difficulty, difficulty))
      : eq(questions.topicId, topicId);

    const allQuestions = await db
      .select({
        question: questions,
        domain: domains,
        topic: topics,
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(whereCondition);
    const shuffled = allQuestions.sort(() => Math.random() - 0.5).slice(0, count);

    return shuffled.map(q => ({
      id: q.question.id,
      questionText: q.question.questionText,
      questionType: q.question.questionType,
      options: JSON.parse(q.question.options as string),
      correctAnswers: JSON.parse(q.question.correctAnswers as string),
      explanation: q.question.explanation,
      difficulty: q.question.difficulty,
      gcpServices: q.question.gcpServices ? JSON.parse(q.question.gcpServices as string) : [],
      domain: { id: q.domain.id, name: q.domain.name, code: q.domain.code },
      topic: { id: q.topic.id, name: q.topic.name },
    }));
  });

  // Get topic practice stats
  fastify.get<{ Params: { topicId: string } }>('/topics/:topicId/stats', async (request) => {
    const topicId = parseInt(request.params.topicId, 10);

    // Get all exam responses for this topic
    const responses = await db
      .select({
        isCorrect: examResponses.isCorrect,
        questionId: examResponses.questionId,
      })
      .from(examResponses)
      .innerJoin(questions, eq(examResponses.questionId, questions.id))
      .where(eq(questions.topicId, topicId));

    const totalAttempted = responses.length;
    const correctCount = responses.filter(r => r.isCorrect).length;
    const accuracy = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;

    // Get questions in SR queue for this topic
    const srQuestions = await db
      .select({ count: sql<number>`count(*)` })
      .from(spacedRepetition)
      .innerJoin(questions, eq(spacedRepetition.questionId, questions.id))
      .where(eq(questions.topicId, topicId));

    // Get last practice date from study sessions
    const [lastSession] = await db
      .select()
      .from(studySessions)
      .where(and(
        eq(studySessions.topicId, topicId),
        eq(studySessions.status, 'completed')
      ))
      .orderBy(desc(studySessions.completedAt))
      .limit(1);

    // Determine recommended action
    let recommendedAction: 'practice' | 'review' | 'mastered' = 'practice';
    if (accuracy >= 90 && totalAttempted >= 10) {
      recommendedAction = 'mastered';
    } else if (srQuestions[0]?.count > 0) {
      recommendedAction = 'review';
    }

    return {
      topicId,
      accuracy,
      totalAttempted,
      lastPracticed: lastSession?.completedAt || null,
      questionsInSR: srQuestions[0]?.count || 0,
      recommendedAction,
    };
  });
}
