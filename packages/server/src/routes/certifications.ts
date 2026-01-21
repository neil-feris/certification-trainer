import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { certifications, domains, questions } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { CertificationCapabilities, DEFAULT_CERTIFICATION_CAPABILITIES } from '@ace-prep/shared';

// Helper to parse capabilities JSON with fallback to defaults
function parseCapabilities(capabilitiesJson: string | null): CertificationCapabilities {
  if (!capabilitiesJson) {
    return DEFAULT_CERTIFICATION_CAPABILITIES;
  }
  try {
    const parsed = JSON.parse(capabilitiesJson);
    return {
      ...DEFAULT_CERTIFICATION_CAPABILITIES,
      ...parsed,
    };
  } catch {
    return DEFAULT_CERTIFICATION_CAPABILITIES;
  }
}

export async function certificationRoutes(fastify: FastifyInstance) {
  // Get all active certifications with question counts
  fastify.get('/', async () => {
    const certs = await db
      .select({
        id: certifications.id,
        code: certifications.code,
        name: certifications.name,
        shortName: certifications.shortName,
        description: certifications.description,
        provider: certifications.provider,
        examDurationMinutes: certifications.examDurationMinutes,
        totalQuestions: certifications.totalQuestions,
        passingScorePercent: certifications.passingScorePercent,
        isActive: certifications.isActive,
        capabilities: certifications.capabilities,
        createdAt: certifications.createdAt,
      })
      .from(certifications)
      .where(eq(certifications.isActive, true))
      .orderBy(certifications.id);

    // Get question counts per certification
    const questionCounts = await db
      .select({
        certificationId: domains.certificationId,
        count: sql<number>`count(${questions.id})`.as('count'),
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .groupBy(domains.certificationId);

    const countMap = new Map(questionCounts.map((qc) => [qc.certificationId, qc.count]));

    return certs.map((cert) => ({
      ...cert,
      capabilities: parseCapabilities(cert.capabilities),
      questionCount: countMap.get(cert.id) || 0,
    }));
  });

  // Get single certification by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid certification ID' });
    }

    const [cert] = await db.select().from(certifications).where(eq(certifications.id, id));

    if (!cert) {
      return reply.status(404).send({ error: 'Certification not found' });
    }

    // Get question count
    const [countResult] = await db
      .select({
        count: sql<number>`count(${questions.id})`.as('count'),
      })
      .from(questions)
      .innerJoin(domains, eq(questions.domainId, domains.id))
      .where(eq(domains.certificationId, id));

    return {
      ...cert,
      capabilities: parseCapabilities(cert.capabilities),
      questionCount: countResult?.count || 0,
    };
  });
}
