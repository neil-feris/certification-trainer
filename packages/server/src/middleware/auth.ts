/**
 * Authentication Middleware for Fastify
 *
 * Provides hooks to authenticate requests via JWT Bearer tokens.
 * - authenticate: Requires valid token, returns 401 if missing/invalid
 * - optionalAuth: Attaches user if token present, allows anonymous if not
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, JwtPayload } from '../services/jwt.js';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
    };
  }
}

/**
 * Extract Bearer token from Authorization header
 * @returns Token string or null if not present/invalid format
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Authentication hook - requires valid JWT token
 * Extracts Bearer token from Authorization header, verifies it,
 * and attaches the user to the request object.
 *
 * Returns 401 Unauthorized if:
 * - No Authorization header present
 * - Token format is invalid
 * - Token is expired or invalid
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload: JwtPayload = verifyAccessToken(token);
    request.user = { id: payload.userId };
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

/**
 * Optional authentication hook - attaches user if token present
 * Same as authenticate but doesn't fail if no token is present.
 * Useful for routes that work for both authenticated and anonymous users.
 *
 * - If valid token: attaches user to request
 * - If no token: continues without user
 * - If invalid token: returns 401 (token present but bad)
 */
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request);

  // No token is fine for optional auth
  if (!token) {
    return;
  }

  // Token present - must be valid
  try {
    const payload: JwtPayload = verifyAccessToken(token);
    request.user = { id: payload.userId };
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
