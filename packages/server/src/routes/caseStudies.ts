import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { caseStudies, certifications } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { idParamSchema, formatZodError } from '../validation/schemas.js';
import type { GetCaseStudiesResponse, GetCaseStudyResponse } from '@ace-prep/shared';
import { authenticate } from '../middleware/auth.js';
import { mapCaseStudyRecord } from '../utils/mappers.js';

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
        ...mapCaseStudyRecord(r.caseStudy)!,
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
        ...mapCaseStudyRecord(result.caseStudy)!,
        certification: result.certification,
      },
    };

    return response;
  });
}
