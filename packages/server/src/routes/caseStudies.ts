import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { caseStudies, certifications } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { idParamSchema, formatZodError } from '../validation/schemas.js';
import type { GetCaseStudiesResponse, GetCaseStudyResponse } from '@ace-prep/shared';
import { authenticate } from '../middleware/auth.js';

export async function caseStudyRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this file
  fastify.addHook('preHandler', authenticate);

  // Get all case studies (optionally filtered by certification)
  fastify.get<{
    Querystring: { certificationId?: string };
  }>('/', async (request) => {
    const { certificationId } = request.query;
    const certId = certificationId ? Number(certificationId) : undefined;

    const results = await db
      .select({
        caseStudy: caseStudies,
        certification: {
          id: certifications.id,
          code: certifications.code,
          name: certifications.name,
        },
      })
      .from(caseStudies)
      .innerJoin(certifications, eq(caseStudies.certificationId, certifications.id))
      .where(certId ? eq(caseStudies.certificationId, certId) : undefined)
      .orderBy(asc(caseStudies.orderIndex));

    const response: GetCaseStudiesResponse = {
      caseStudies: results.map((r) => ({
        id: r.caseStudy.id,
        certificationId: r.caseStudy.certificationId,
        code: r.caseStudy.code,
        name: r.caseStudy.name,
        companyOverview: r.caseStudy.companyOverview,
        solutionConcept: r.caseStudy.solutionConcept,
        existingTechnicalEnvironment: r.caseStudy.existingTechnicalEnvironment,
        businessRequirements: JSON.parse(r.caseStudy.businessRequirements),
        technicalRequirements: JSON.parse(r.caseStudy.technicalRequirements),
        executiveStatement: r.caseStudy.executiveStatement,
        orderIndex: r.caseStudy.orderIndex,
        createdAt: r.caseStudy.createdAt,
        certification: r.certification,
      })),
    };

    return response;
  });

  // Get single case study by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = idParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const caseStudyId = parseResult.data.id;

    const [result] = await db
      .select({
        caseStudy: caseStudies,
        certification: {
          id: certifications.id,
          code: certifications.code,
          name: certifications.name,
        },
      })
      .from(caseStudies)
      .innerJoin(certifications, eq(caseStudies.certificationId, certifications.id))
      .where(eq(caseStudies.id, caseStudyId));

    if (!result) {
      return reply.status(404).send({ error: 'Case study not found' });
    }

    const response: GetCaseStudyResponse = {
      caseStudy: {
        id: result.caseStudy.id,
        certificationId: result.caseStudy.certificationId,
        code: result.caseStudy.code,
        name: result.caseStudy.name,
        companyOverview: result.caseStudy.companyOverview,
        solutionConcept: result.caseStudy.solutionConcept,
        existingTechnicalEnvironment: result.caseStudy.existingTechnicalEnvironment,
        businessRequirements: JSON.parse(result.caseStudy.businessRequirements),
        technicalRequirements: JSON.parse(result.caseStudy.technicalRequirements),
        executiveStatement: result.caseStudy.executiveStatement,
        orderIndex: result.caseStudy.orderIndex,
        createdAt: result.caseStudy.createdAt,
        certification: result.certification,
      },
    };

    return response;
  });
}
