/**
 * Notification Routes
 *
 * Handles push subscription management and notification preferences.
 */

import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { formatZodError } from '../validation/schemas.js';
import { getVapidPublicKey, isPushConfigured } from '../services/pushNotificationService.js';

// Validation schemas
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const preferencesSchema = z.object({
  enabled: z.boolean().optional(),
  streakReminders: z.boolean().optional(),
  reviewReminders: z.boolean().optional(),
  qotdReminders: z.boolean().optional(),
  preferredTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().optional(),
});

export async function notificationRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/notifications/vapid-public-key
   * Get the VAPID public key for client-side subscription
   * NOTE: Public endpoint - VAPID public key is not secret
   */
  fastify.get('/vapid-public-key', async (_request, reply) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return reply.status(503).send({
        error: 'Push notifications not configured',
        message: 'VAPID keys are not set on the server',
      });
    }
    return { publicKey };
  });

  // All remaining routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/notifications/status
   * Check if user has an active subscription and push is supported
   */
  fastify.get('/status', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    const [subscription] = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId))
      .limit(1);

    return {
      isConfigured: isPushConfigured(),
      isSubscribed: Boolean(subscription),
    };
  });

  /**
   * POST /api/notifications/subscribe
   * Save a push subscription for the authenticated user
   */
  fastify.post<{ Body: z.infer<typeof subscribeSchema> }>('/subscribe', async (request, reply) => {
    const parseResult = subscribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { endpoint, keys } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);
    const now = new Date();

    // Upsert subscription - handles race condition with ON CONFLICT
    await db
      .insert(schema.pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.pushSubscriptions.userId, schema.pushSubscriptions.endpoint],
        set: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          createdAt: now,
        },
      });

    // Upsert notification preferences
    await db
      .insert(schema.notificationPreferences)
      .values({
        userId,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: schema.notificationPreferences.userId,
      });

    return { success: true };
  });

  /**
   * DELETE /api/notifications/subscribe
   * Remove push subscription for the authenticated user
   */
  fastify.delete<{ Body: { endpoint: string } }>('/subscribe', async (request, reply) => {
    const { endpoint } = request.body || {};
    if (!endpoint) {
      return reply.status(400).send({ error: 'endpoint is required' });
    }

    const userId = parseInt(request.user!.id, 10);

    await db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, userId),
          eq(schema.pushSubscriptions.endpoint, endpoint)
        )
      );

    return { success: true };
  });

  /**
   * GET /api/notifications/preferences
   * Get notification preferences for the authenticated user
   */
  fastify.get('/preferences', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    const [prefs] = await db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));

    if (!prefs) {
      // Return defaults
      return {
        enabled: true,
        streakReminders: true,
        reviewReminders: true,
        qotdReminders: true,
        preferredTime: '09:00',
        timezone: 'UTC',
      };
    }

    return {
      enabled: prefs.enabled,
      streakReminders: prefs.streakReminders,
      reviewReminders: prefs.reviewReminders,
      qotdReminders: prefs.qotdReminders,
      preferredTime: prefs.preferredTime,
      timezone: prefs.timezone,
    };
  });

  /**
   * PUT /api/notifications/preferences
   * Update notification preferences for the authenticated user
   */
  fastify.put<{ Body: z.infer<typeof preferencesSchema> }>(
    '/preferences',
    async (request, reply) => {
      const parseResult = preferencesSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const updates = parseResult.data;
      const userId = parseInt(request.user!.id, 10);
      const now = new Date();

      // Upsert preferences with ON CONFLICT to avoid race conditions
      await db
        .insert(schema.notificationPreferences)
        .values({
          userId,
          ...updates,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.notificationPreferences.userId,
          set: { ...updates, updatedAt: now },
        });

      return { success: true };
    }
  );
}
