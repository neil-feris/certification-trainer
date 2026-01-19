/**
 * Authentication Routes
 *
 * Handles Google OAuth flow and token management:
 * - GET /google-url - Returns Google OAuth consent URL
 * - POST /google-callback - Exchanges code for tokens, creates/updates user
 * - POST /refresh - Validates refresh token, returns new access token
 * - POST /logout - Clears refresh token cookie
 * - GET /me - Returns current user (protected)
 */

import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/jwt.js';
import { migrateOrphanedDataToUser } from '../services/dataMigration.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthResponse, User, GoogleCallbackRequest } from '@ace-prep/shared';

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Cookie settings for refresh token
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * GET /google-url
   * Returns the Google OAuth consent URL for client-side redirect
   */
  fastify.get('/google-url', async () => {
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    return {
      url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    };
  });

  /**
   * POST /google-callback
   * Exchanges authorization code for tokens, creates/updates user
   */
  fastify.post<{ Body: GoogleCallbackRequest }>('/google-callback', async (request, reply) => {
    const { code } = request.body || {};

    if (!code) {
      return reply.status(400).send({ error: 'Authorization code is required' });
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: config.google.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        fastify.log.error({ error }, 'Failed to exchange code for tokens');
        return reply.status(400).send({ error: 'Failed to authenticate with Google' });
      }

      const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

      // Get user info from Google
      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        fastify.log.error('Failed to get user info from Google');
        return reply.status(400).send({ error: 'Failed to get user information' });
      }

      const googleUser = (await userInfoResponse.json()) as GoogleUserInfo;

      // Find or create user
      const now = new Date();
      const [existingUser] = await db.select().from(users).where(eq(users.googleId, googleUser.id));

      let user: typeof existingUser;

      if (existingUser) {
        // Update existing user
        [user] = await db
          .update(users)
          .set({
            name: googleUser.name,
            picture: googleUser.picture || null,
            updatedAt: now,
            lastLoginAt: now,
          })
          .where(eq(users.id, existingUser.id))
          .returning();
      } else {
        // Create new user
        [user] = await db
          .insert(users)
          .values({
            googleId: googleUser.id,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture || null,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
          })
          .returning();

        fastify.log.info({ userId: user.id, email: user.email }, 'New user created');

        // Migrate orphaned data from anonymous session to new user
        try {
          const migrationResult = await migrateOrphanedDataToUser(user.id);
          const totalMigrated = Object.values(migrationResult).reduce((a, b) => a + b, 0);
          if (totalMigrated > 0) {
            fastify.log.info(
              { userId: user.id, migration: migrationResult },
              'Migrated orphaned data to new user'
            );
          }
        } catch (migrationError) {
          // Log but don't fail the login if migration fails
          fastify.log.error({ error: migrationError, userId: user.id }, 'Data migration failed');
        }
      }

      // Generate JWT tokens
      const accessToken = signAccessToken(user.id.toString());
      const refreshToken = signRefreshToken(user.id.toString());
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Set refresh token as httpOnly cookie
      reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.isProduction ? 'strict' : 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_MS / 1000, // in seconds
      });

      // Return user and tokens
      const response: AuthResponse = {
        user: {
          id: user.id,
          googleId: user.googleId,
          email: user.email,
          name: user.name,
          picture: user.picture,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresAt,
        },
      };

      return response;
    } catch (error) {
      fastify.log.error({ error }, 'OAuth callback error');
      return reply.status(500).send({ error: 'Authentication failed' });
    }
  });

  /**
   * POST /refresh
   * Validates refresh token from cookie, returns new access token
   */
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      // Get user from database to ensure they still exist
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(payload.userId, 10)));

      if (!user) {
        // Clear invalid cookie
        reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Generate new access token
      const accessToken = signAccessToken(user.id.toString());
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      return {
        accessToken,
        expiresAt,
      };
    } catch {
      // Clear invalid cookie
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  /**
   * POST /logout
   * Clears refresh token cookie
   */
  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return { success: true };
  });

  /**
   * GET /me
   * Returns current authenticated user (protected route)
   */
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(userId, 10)));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const response: User = {
      id: user.id,
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return response;
  });
}
