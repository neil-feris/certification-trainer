/**
 * Certificate Routes
 *
 * Public endpoints for certificate download and verification:
 * - GET /:hash/download - Downloads the PDF certificate
 * - GET /:hash/verify - Verifies a certificate's authenticity (US-006)
 */

import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { certificates, certifications, exams, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateCertificatePdf } from '../services/certificateGenerator.js';

// Hash param schema for validation
const hashParamSchema = {
  type: 'object',
  properties: {
    hash: { type: 'string', minLength: 16, maxLength: 16 },
  },
  required: ['hash'],
} as const;

export async function certificateRoutes(fastify: FastifyInstance) {
  /**
   * GET /:hash/download
   * Downloads the PDF certificate for the given hash.
   * Public endpoint - no authentication required.
   */
  fastify.get<{
    Params: { hash: string };
  }>(
    '/:hash/download',
    {
      schema: {
        params: hashParamSchema,
      },
    },
    async (request, reply) => {
      const { hash } = request.params;

      // Look up certificate with related data
      const result = await db
        .select({
          certificate: certificates,
          certification: certifications,
          exam: exams,
        })
        .from(certificates)
        .innerJoin(certifications, eq(certificates.certificationId, certifications.id))
        .innerJoin(exams, eq(certificates.examId, exams.id))
        .where(eq(certificates.certificateHash, hash))
        .limit(1);

      if (result.length === 0) {
        return reply.status(404).send({ error: 'Certificate not found' });
      }

      const { certificate, certification } = result[0];

      // Get user name if available
      let userName = 'Certificate Holder';
      if (certificate.userId) {
        const [user] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, certificate.userId));
        if (user) {
          userName = user.name;
        }
      }

      // Generate the PDF
      const pdfBuffer = await generateCertificatePdf({
        userName,
        certificationName: certification.name,
        score: certificate.score,
        date: certificate.issuedAt,
        certificateId: certificate.certificateHash,
      });

      // Set headers for PDF download
      const filename = `ace-prep-certificate-${certificate.certificateHash}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer);
    }
  );

  /**
   * GET /:hash/verify
   * Verifies a certificate's authenticity.
   * Public endpoint - no authentication required.
   * Returns certification name, score, and date (no user info for privacy).
   */
  fastify.get<{
    Params: { hash: string };
  }>(
    '/:hash/verify',
    {
      schema: {
        params: hashParamSchema,
      },
    },
    async (request, reply) => {
      const { hash } = request.params;

      // Look up certificate with certification info
      const result = await db
        .select({
          certificate: certificates,
          certification: certifications,
        })
        .from(certificates)
        .innerJoin(certifications, eq(certificates.certificationId, certifications.id))
        .where(eq(certificates.certificateHash, hash))
        .limit(1);

      if (result.length === 0) {
        // Return 404 with valid: false for invalid hash
        return reply.status(404).send({
          valid: false,
          certificationName: null,
          score: null,
          issuedAt: null,
        });
      }

      const { certificate, certification } = result[0];

      // Return verification data (no user info for privacy)
      return reply.send({
        valid: true,
        certificationName: certification.name,
        score: certificate.score,
        issuedAt: certificate.issuedAt,
      });
    }
  );
}
