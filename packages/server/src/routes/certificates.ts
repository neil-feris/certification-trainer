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

// Simple LRU cache for generated PDFs to prevent DoS via repeated generation
// Max 100 certificates, 1 hour TTL
const PDF_CACHE_MAX_SIZE = 100;
const PDF_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedPdf {
  buffer: Buffer;
  createdAt: number;
}

const pdfCache = new Map<string, CachedPdf>();

function getCachedPdf(hash: string): Buffer | null {
  const cached = pdfCache.get(hash);
  if (!cached) return null;

  // Check TTL
  if (Date.now() - cached.createdAt > PDF_CACHE_TTL_MS) {
    pdfCache.delete(hash);
    return null;
  }

  return cached.buffer;
}

function setCachedPdf(hash: string, buffer: Buffer): void {
  // Evict oldest entries if at capacity
  if (pdfCache.size >= PDF_CACHE_MAX_SIZE) {
    const oldestKey = pdfCache.keys().next().value;
    if (oldestKey) pdfCache.delete(oldestKey);
  }

  pdfCache.set(hash, { buffer, createdAt: Date.now() });
}

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
      config: {
        // Rate limit: 10 downloads per minute per IP (CPU-intensive PDF generation)
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;

      // Check cache first to avoid expensive PDF regeneration
      const cachedPdf = getCachedPdf(hash);
      if (cachedPdf) {
        const filename = `ace-prep-certificate-${hash}.pdf`;
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .header('Content-Length', cachedPdf.length)
          .header('X-Cache', 'HIT')
          .send(cachedPdf);
      }

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

      // Cache the generated PDF
      setCachedPdf(hash, pdfBuffer);

      // Set headers for PDF download
      const filename = `ace-prep-certificate-${certificate.certificateHash}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', pdfBuffer.length)
        .header('X-Cache', 'MISS')
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
      config: {
        // Rate limit: 30 verifications per minute per IP
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
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
