import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { domains, topics, studySummaries, examResponses, questions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { generateStudySummary, generateExplanation } from '../services/studyGenerator.js';

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

  // Get learning path structure
  fastify.get('/learning-path', async () => {
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

    return learningPath;
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
}
