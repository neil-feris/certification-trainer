/**
 * Push Notification Service
 *
 * Sends Web Push notifications to subscribed users.
 * Uses VAPID for authentication with push services.
 */

import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

// Configure VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    url: string;
    type: 'streak' | 'review' | 'qotd';
  };
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

/**
 * Get the VAPID public key for client subscription
 */
export function getVapidPublicKey(): string | null {
  return vapidPublicKey || null;
}

/**
 * Send a push notification to all of a user's subscribed devices
 */
export async function sendPushNotification(
  userId: number,
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  if (!isPushConfigured()) {
    console.warn('[Push] VAPID keys not configured, skipping notification');
    return { success: 0, failed: 0 };
  }

  const subscriptions = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));

  if (subscriptions.length === 0) {
    return { success: 0, failed: 0 };
  }

  const fullPayload: PushPayload = {
    ...payload,
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/badge-72x72.png',
  };

  let success = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(fullPayload)
      );
      success++;
    } catch (error: any) {
      failed++;
      // Handle expired subscriptions (410 Gone or 404 Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[Push] Removing expired subscription for user ${userId}`);
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      } else {
        console.error(`[Push] Failed to send to user ${userId}:`, error.message);
      }
    }
  }

  return { success, failed };
}

/**
 * Send streak warning notification
 */
export async function sendStreakWarning(userId: number, currentStreak: number): Promise<void> {
  await sendPushNotification(userId, {
    title: "Don't lose your streak!",
    body: `You have a ${currentStreak}-day streak. Study today to keep it going!`,
    tag: 'streak-warning',
    data: {
      url: '/dashboard',
      type: 'streak',
    },
  });
}

/**
 * Send review reminder notification
 */
export async function sendReviewReminder(userId: number, dueCount: number): Promise<void> {
  await sendPushNotification(userId, {
    title: 'Cards ready for review',
    body: `You have ${dueCount} cards due for review.`,
    tag: 'review-reminder',
    data: {
      url: '/review',
      type: 'review',
    },
  });
}

/**
 * Send Question of the Day notification
 */
export async function sendQotdNotification(userId: number): Promise<void> {
  await sendPushNotification(userId, {
    title: 'Question of the Day',
    body: "Today's challenge is ready. Test your knowledge!",
    tag: 'qotd',
    data: {
      url: '/dashboard',
      type: 'qotd',
    },
  });
}
