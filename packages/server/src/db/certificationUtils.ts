import { db } from './index.js';
import { certifications } from './schema.js';
import { eq, and } from 'drizzle-orm';
import { FastifyReply } from 'fastify';

/**
 * Validates that a certification exists and is active.
 * Returns the certification ID if valid, or sends error response and returns null.
 */
export async function validateCertificationId(
  certificationId: number,
  reply: FastifyReply
): Promise<number | null> {
  // Validate it's a positive integer
  if (!Number.isInteger(certificationId) || certificationId <= 0) {
    reply.status(400).send({ error: 'certificationId must be a positive integer' });
    return null;
  }

  const [cert] = await db
    .select()
    .from(certifications)
    .where(and(eq(certifications.id, certificationId), eq(certifications.isActive, true)));

  if (!cert) {
    reply.status(400).send({
      error: 'Invalid or inactive certification',
      certificationId,
    });
    return null;
  }

  return cert.id;
}

/**
 * Gets the default certification ID (first active certification by ID).
 * Returns the certification ID if found, or sends error response and returns null.
 */
export async function getDefaultCertificationId(reply: FastifyReply): Promise<number | null> {
  const [cert] = await db
    .select()
    .from(certifications)
    .where(eq(certifications.isActive, true))
    .orderBy(certifications.id) // Deterministic ordering
    .limit(1);

  if (!cert) {
    reply.status(503).send({
      error: 'No active certification found',
      message: 'Please seed the database or contact administrator.',
    });
    return null;
  }

  return cert.id;
}

/**
 * Resolves certification ID from optional input.
 * If certificationId provided, validates it. Otherwise returns default.
 * Returns null if validation fails (error already sent to reply).
 */
export async function resolveCertificationId(
  certificationId: number | undefined,
  reply: FastifyReply
): Promise<number | null> {
  if (certificationId !== undefined) {
    return validateCertificationId(certificationId, reply);
  }
  return getDefaultCertificationId(reply);
}

/**
 * Parses and validates certificationId from query string.
 * Returns certification ID or null if invalid (error already sent).
 */
export async function parseCertificationIdFromQuery(
  certificationIdStr: string | undefined,
  reply: FastifyReply
): Promise<number | null> {
  if (!certificationIdStr) {
    return getDefaultCertificationId(reply);
  }

  const parsed = parseInt(certificationIdStr, 10);
  if (isNaN(parsed)) {
    reply.status(400).send({ error: 'certificationId must be a valid integer' });
    return null;
  }

  return validateCertificationId(parsed, reply);
}
