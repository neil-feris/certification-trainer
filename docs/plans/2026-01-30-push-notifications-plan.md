# Push Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add browser push notifications for streak warnings, review reminders, and Question of the Day.

**Architecture:** Web Push API with VAPID authentication. Server-side cron job runs every 15 minutes to check notification conditions and send pushes via `web-push` package. Subscriptions stored per-device in SQLite.

**Tech Stack:** `web-push`, `node-cron`, native Push API, existing Service Worker

---

## Task 1: Generate VAPID Keys and Configure Environment

**Files:**
- Modify: `packages/server/.env.example`
- Modify: `packages/server/.env` (local only, not committed)

**Step 1: Generate VAPID keys**

Run:
```bash
cd packages/server && npx web-push generate-vapid-keys
```

Expected output:
```
Public Key: BNxRLaq...
Private Key: T8Ff3rU...
```

**Step 2: Add environment variables to .env.example**

Add to `packages/server/.env.example`:
```
# Push Notifications (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@certification-trainer.neilferis.com
```

**Step 3: Add actual keys to local .env**

Add to `packages/server/.env`:
```
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:admin@certification-trainer.neilferis.com
```

**Step 4: Commit .env.example only**

```bash
git add packages/server/.env.example
git commit -m "chore: add VAPID environment variables for push notifications"
```

---

## Task 2: Add Database Schema

**Files:**
- Modify: `packages/server/src/db/schema.ts`

**Step 1: Add push_subscriptions table**

Add after the `userSettings` table definition (around line 625):

```typescript
// ============ PUSH NOTIFICATIONS ============
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('push_subscriptions_user_idx').on(table.userId),
    uniqueIndex('push_subscriptions_user_endpoint_idx').on(table.userId, table.endpoint),
  ]
);

export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    streakReminders: integer('streak_reminders', { mode: 'boolean' }).notNull().default(true),
    reviewReminders: integer('review_reminders', { mode: 'boolean' }).notNull().default(true),
    qotdReminders: integer('qotd_reminders', { mode: 'boolean' }).notNull().default(true),
    preferredTime: text('preferred_time').notNull().default('09:00'),
    timezone: text('timezone').notNull().default('UTC'),
    lastNotifiedAt: integer('last_notified_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('notification_preferences_user_idx').on(table.userId)]
);
```

**Step 2: Add type exports**

Add at the end of the type exports section:

```typescript
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationPreferencesRecord = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;
```

**Step 3: Generate migration**

Run:
```bash
cd packages/server && npm run db:generate
```

**Step 4: Run migration**

Run:
```bash
cd packages/server && npm run db:migrate
```

**Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/drizzle/
git commit -m "feat(db): add push_subscriptions and notification_preferences tables"
```

---

## Task 3: Install Server Dependencies

**Files:**
- Modify: `packages/server/package.json`

**Step 1: Install web-push and node-cron**

Run:
```bash
cd packages/server && npm install web-push node-cron && npm install -D @types/node-cron @types/web-push
```

**Step 2: Verify installation**

Run:
```bash
cd packages/server && npm ls web-push node-cron
```

Expected: Shows both packages installed.

**Step 3: Commit**

```bash
git add packages/server/package.json packages/server/package-lock.json
git commit -m "chore(deps): add web-push and node-cron for push notifications"
```

---

## Task 4: Create Push Notification Service

**Files:**
- Create: `packages/server/src/services/pushNotificationService.ts`

**Step 1: Create the service file**

```typescript
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
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, sub.id));
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
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd packages/server && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/server/src/services/pushNotificationService.ts
git commit -m "feat: add push notification service with VAPID support"
```

---

## Task 5: Create Notifications API Routes

**Files:**
- Create: `packages/server/src/routes/notifications.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create the routes file**

```typescript
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
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
});

export async function notificationRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/notifications/vapid-public-key
   * Get the VAPID public key for client-side subscription
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

    // Check if this endpoint already exists for this user
    const [existing] = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, userId),
          eq(schema.pushSubscriptions.endpoint, endpoint)
        )
      );

    if (existing) {
      // Update existing subscription (keys may have changed)
      await db
        .update(schema.pushSubscriptions)
        .set({
          p256dh: keys.p256dh,
          auth: keys.auth,
          createdAt: now,
        })
        .where(eq(schema.pushSubscriptions.id, existing.id));
    } else {
      // Create new subscription
      await db.insert(schema.pushSubscriptions).values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        createdAt: now,
      });
    }

    // Ensure notification preferences exist
    const [prefs] = await db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));

    if (!prefs) {
      await db.insert(schema.notificationPreferences).values({
        userId,
        updatedAt: now,
      });
    }

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
  fastify.put<{ Body: z.infer<typeof preferencesSchema> }>('/preferences', async (request, reply) => {
    const parseResult = preferencesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const updates = parseResult.data;
    const userId = parseInt(request.user!.id, 10);
    const now = new Date();

    // Upsert preferences
    const [existing] = await db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));

    if (existing) {
      await db
        .update(schema.notificationPreferences)
        .set({ ...updates, updatedAt: now })
        .where(eq(schema.notificationPreferences.userId, userId));
    } else {
      await db.insert(schema.notificationPreferences).values({
        userId,
        ...updates,
        updatedAt: now,
      });
    }

    return { success: true };
  });
}
```

**Step 2: Register routes in index.ts**

Add import at the top (around line 47):
```typescript
import { notificationRoutes } from './routes/notifications.js';
```

Add route registration (around line 110, after other routes):
```typescript
fastify.register(notificationRoutes, { prefix: '/api/notifications' });
```

**Step 3: Verify server compiles and starts**

Run:
```bash
cd packages/server && npm run build
```

Expected: No errors.

**Step 4: Commit**

```bash
git add packages/server/src/routes/notifications.ts packages/server/src/index.ts
git commit -m "feat: add notification API routes for subscription and preferences"
```

---

## Task 6: Create Notification Scheduler

**Files:**
- Create: `packages/server/src/jobs/notificationScheduler.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create the scheduler file**

```typescript
/**
 * Notification Scheduler
 *
 * Cron job that runs every 15 minutes to check notification conditions
 * and send push notifications to eligible users.
 */

import cron from 'node-cron';
import { eq, and, lte, sql, isNull, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  sendStreakWarning,
  sendReviewReminder,
  sendQotdNotification,
  isPushConfigured,
} from '../services/pushNotificationService.js';

/**
 * Get current time in HH:mm format
 */
function getCurrentTimeSlot(): string {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  // Round to nearest 15-minute slot
  const minutes = String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Check if user has studied today
 */
async function hasStudiedToday(userId: number): Promise<boolean> {
  const [streak] = await db
    .select()
    .from(schema.userStreaks)
    .where(eq(schema.userStreaks.userId, userId));

  if (!streak) return false;
  return streak.lastActivityDate === getTodayDateString();
}

/**
 * Get count of cards due for review
 */
async function getDueReviewCount(userId: number): Promise<number> {
  const now = new Date();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.spacedRepetition)
    .where(
      and(
        eq(schema.spacedRepetition.userId, userId),
        lte(schema.spacedRepetition.nextReviewAt, now)
      )
    );
  return result[0]?.count || 0;
}

/**
 * Process notifications for a single user
 */
async function processUserNotifications(
  userId: number,
  prefs: typeof schema.notificationPreferences.$inferSelect
): Promise<void> {
  const today = getTodayDateString();
  const lastNotified = prefs.lastNotifiedAt?.toISOString().split('T')[0];

  // Skip if already notified today
  if (lastNotified === today) {
    return;
  }

  // Check streak warning
  if (prefs.streakReminders) {
    const [streak] = await db
      .select()
      .from(schema.userStreaks)
      .where(eq(schema.userStreaks.userId, userId));

    if (streak && streak.currentStreak > 0) {
      const hasStudied = await hasStudiedToday(userId);
      if (!hasStudied) {
        console.log(`[Scheduler] Sending streak warning to user ${userId}`);
        await sendStreakWarning(userId, streak.currentStreak);
      }
    }
  }

  // Check review reminders
  if (prefs.reviewReminders) {
    const dueCount = await getDueReviewCount(userId);
    if (dueCount >= 5) {
      console.log(`[Scheduler] Sending review reminder to user ${userId} (${dueCount} due)`);
      await sendReviewReminder(userId, dueCount);
    }
  }

  // Check QOTD reminder
  if (prefs.qotdReminders) {
    console.log(`[Scheduler] Sending QOTD notification to user ${userId}`);
    await sendQotdNotification(userId);
  }

  // Update last notified timestamp
  await db
    .update(schema.notificationPreferences)
    .set({ lastNotifiedAt: new Date() })
    .where(eq(schema.notificationPreferences.userId, userId));
}

/**
 * Main scheduler job
 */
async function runNotificationJob(): Promise<void> {
  if (!isPushConfigured()) {
    console.log('[Scheduler] Push notifications not configured, skipping');
    return;
  }

  const currentTimeSlot = getCurrentTimeSlot();
  console.log(`[Scheduler] Running notification job for time slot ${currentTimeSlot}`);

  try {
    // Find users with:
    // 1. At least one push subscription
    // 2. Notifications enabled
    // 3. Preferred time matches current slot (with timezone consideration simplified to UTC for now)
    const eligibleUsers = await db
      .select({
        userId: schema.notificationPreferences.userId,
        prefs: schema.notificationPreferences,
      })
      .from(schema.notificationPreferences)
      .innerJoin(
        schema.pushSubscriptions,
        eq(schema.notificationPreferences.userId, schema.pushSubscriptions.userId)
      )
      .where(
        and(
          eq(schema.notificationPreferences.enabled, true),
          eq(schema.notificationPreferences.preferredTime, currentTimeSlot)
        )
      )
      .groupBy(schema.notificationPreferences.userId);

    console.log(`[Scheduler] Found ${eligibleUsers.length} eligible users`);

    for (const { userId, prefs } of eligibleUsers) {
      try {
        await processUserNotifications(userId, prefs);
      } catch (error) {
        console.error(`[Scheduler] Error processing user ${userId}:`, error);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error running notification job:', error);
  }
}

/**
 * Start the notification scheduler
 * Runs every 15 minutes
 */
export function startNotificationScheduler(): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Scheduler] Not starting in development mode');
    return;
  }

  // Run every 15 minutes: 0, 15, 30, 45
  cron.schedule('*/15 * * * *', () => {
    runNotificationJob().catch(console.error);
  });

  console.log('[Scheduler] Notification scheduler started (every 15 minutes)');
}

// Export for manual testing
export { runNotificationJob };
```

**Step 2: Start scheduler in index.ts**

Add import at the top:
```typescript
import { startNotificationScheduler } from './jobs/notificationScheduler.js';
```

Add scheduler start before `fastify.listen()` (at the end of the file, before the listen call):
```typescript
// Start notification scheduler (production only)
startNotificationScheduler();
```

**Step 3: Verify build**

Run:
```bash
cd packages/server && npm run build
```

Expected: No errors.

**Step 4: Commit**

```bash
git add packages/server/src/jobs/notificationScheduler.ts packages/server/src/index.ts
git commit -m "feat: add notification scheduler cron job"
```

---

## Task 7: Add Service Worker Push Handlers

**Files:**
- Modify: `packages/client/src/sw.ts`

**Step 1: Add push event listener**

Add after the `periodicsync` event listener (around line 135):

```typescript
// =============================================================================
// PUSH NOTIFICATIONS
// =============================================================================

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    console.log('[SW] Push event with no data');
    return;
  }

  try {
    const payload = event.data.json();
    const { title, body, icon, badge, tag, data } = payload;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/icons/icon-192x192.png',
        badge: badge || '/icons/badge-72x72.png',
        tag,
        data,
        requireInteraction: false,
      })
    );
  } catch (error) {
    console.error('[SW] Error handling push event:', error);
  }
});

/**
 * Handle notification click - navigate to the specified URL
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    (async () => {
      // Try to focus an existing window
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          // Navigate within the app
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }

      // No existing window, open a new one
      await self.clients.openWindow(url);
    })()
  );
});
```

**Step 2: Add type declarations**

Add to the type declarations section at the bottom:

```typescript
interface PushEvent extends ExtendableEvent {
  readonly data: PushMessageData | null;
}

interface PushMessageData {
  json(): any;
  text(): string;
}

interface NotificationEvent extends ExtendableEvent {
  readonly notification: Notification;
  readonly action: string;
}
```

**Step 3: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 4: Commit**

```bash
git add packages/client/src/sw.ts
git commit -m "feat: add push notification handlers to service worker"
```

---

## Task 8: Create Client Push Service

**Files:**
- Create: `packages/client/src/services/pushService.ts`

**Step 1: Create the service file**

```typescript
/**
 * Push Notification Service
 *
 * Client-side service for managing Web Push subscriptions.
 */

const API_BASE = '/api/notifications';

/**
 * Check if the browser supports push notifications
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Get the VAPID public key from the server
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/vapid-public-key`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.publicKey;
  } catch {
    return null;
  }
}

/**
 * Convert a base64 string to Uint8Array for applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}

/**
 * Get the current push subscription
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('[Push] Push notifications not supported');
    return false;
  }

  // Request permission
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('[Push] Notification permission denied');
    return false;
  }

  // Get VAPID key
  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    console.error('[Push] Could not get VAPID public key');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Send subscription to server
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
        },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const subscription = await getCurrentSubscription();
    if (!subscription) return true;

    // Unsubscribe locally
    await subscription.unsubscribe();

    // Remove from server
    await fetch(`${API_BASE}/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return true;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return false;
  }
}

/**
 * Check subscription status from server
 */
export async function getSubscriptionStatus(): Promise<{
  isConfigured: boolean;
  isSubscribed: boolean;
}> {
  try {
    const response = await fetch(`${API_BASE}/status`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { isConfigured: false, isSubscribed: false };
    }
    return await response.json();
  } catch {
    return { isConfigured: false, isSubscribed: false };
  }
}
```

**Step 2: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/client/src/services/pushService.ts
git commit -m "feat: add client-side push notification service"
```

---

## Task 9: Create Push Notifications Hook

**Files:**
- Create: `packages/client/src/hooks/usePushNotifications.ts`

**Step 1: Create the hook file**

```typescript
/**
 * usePushNotifications Hook
 *
 * React hook for managing push notification subscriptions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
  getSubscriptionStatus,
} from '../services/pushService';

interface UsePushNotificationsResult {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [isSupported] = useState(() => isPushSupported());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Check local subscription
      const subscription = await getCurrentSubscription();

      // Also check server status
      const status = await getSubscriptionStatus();

      setIsSubscribed(Boolean(subscription) && status.isSubscribed);
      setPermission(Notification.permission);
    } catch (error) {
      console.error('[usePushNotifications] Error checking status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        setIsSubscribed(true);
        setPermission('granted');
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await unsubscribeFromPush();
      if (success) {
        setIsSubscribed(false);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    refresh,
  };
}
```

**Step 2: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/client/src/hooks/usePushNotifications.ts
git commit -m "feat: add usePushNotifications hook"
```

---

## Task 10: Create Notification Settings UI

**Files:**
- Create: `packages/client/src/components/settings/NotificationSettings.tsx`
- Create: `packages/client/src/components/settings/NotificationSettings.module.css`
- Modify: `packages/client/src/components/settings/Settings.tsx`

**Step 1: Create the component**

Create `packages/client/src/components/settings/NotificationSettings.tsx`:

```typescript
/**
 * NotificationSettings Component
 *
 * UI for managing push notification preferences.
 */

import { useState, useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import styles from './NotificationSettings.module.css';

interface NotificationPreferences {
  enabled: boolean;
  streakReminders: boolean;
  reviewReminders: boolean;
  qotdReminders: boolean;
  preferredTime: string;
  timezone: string;
}

export function NotificationSettings() {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: true,
    streakReminders: true,
    reviewReminders: true,
    qotdReminders: true,
    preferredTime: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences from server
  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch('/api/notifications/preferences', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setPreferences((prev) => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }
    if (isSubscribed) {
      loadPreferences();
    }
  }, [isSubscribed]);

  // Save preferences to server
  const savePreferences = async (updates: Partial<NotificationPreferences>) => {
    setIsSaving(true);
    try {
      const newPrefs = { ...preferences, ...updates };
      setPreferences(newPrefs);

      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      // Save initial preferences with detected timezone
      await savePreferences({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  };

  if (!isSupported) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Push Notifications</h3>
        <p className={styles.unsupported}>
          Push notifications are not supported in your browser.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Push Notifications</h3>
      <p className={styles.description}>
        Get reminders about your streak, cards due for review, and the daily question.
      </p>

      {!isSubscribed ? (
        <button
          className="btn btn-primary"
          onClick={handleSubscribe}
          disabled={isLoading}
        >
          {isLoading ? 'Enabling...' : 'Enable Notifications'}
        </button>
      ) : (
        <>
          <div className={styles.toggleGroup}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={preferences.enabled}
                onChange={(e) => savePreferences({ enabled: e.target.checked })}
                disabled={isSaving}
              />
              <span>All notifications</span>
            </label>
          </div>

          {preferences.enabled && (
            <>
              <div className={styles.toggleGroup}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={preferences.streakReminders}
                    onChange={(e) => savePreferences({ streakReminders: e.target.checked })}
                    disabled={isSaving}
                  />
                  <span>Streak reminders</span>
                </label>
                <span className={styles.hint}>Get warned before your streak resets</span>
              </div>

              <div className={styles.toggleGroup}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={preferences.reviewReminders}
                    onChange={(e) => savePreferences({ reviewReminders: e.target.checked })}
                    disabled={isSaving}
                  />
                  <span>Review reminders</span>
                </label>
                <span className={styles.hint}>Get notified when cards are due</span>
              </div>

              <div className={styles.toggleGroup}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={preferences.qotdReminders}
                    onChange={(e) => savePreferences({ qotdReminders: e.target.checked })}
                    disabled={isSaving}
                  />
                  <span>Question of the Day</span>
                </label>
                <span className={styles.hint}>Daily question notification</span>
              </div>

              <div className={styles.timeGroup}>
                <label className={styles.label}>Notification time</label>
                <input
                  type="time"
                  value={preferences.preferredTime}
                  onChange={(e) => savePreferences({ preferredTime: e.target.value })}
                  className={styles.timeInput}
                  disabled={isSaving}
                />
                <span className={styles.hint}>
                  Timezone: {preferences.timezone}
                </span>
              </div>
            </>
          )}

          <button
            className="btn btn-secondary"
            onClick={unsubscribe}
            disabled={isLoading}
          >
            Disable Notifications
          </button>
        </>
      )}
    </div>
  );
}
```

**Step 2: Create the CSS module**

Create `packages/client/src/components/settings/NotificationSettings.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.description {
  color: var(--text-secondary);
  margin: 0;
}

.unsupported {
  color: var(--text-muted);
  font-style: italic;
}

.toggleGroup {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.toggle input {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.toggle span {
  font-weight: 500;
}

.hint {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-left: 2rem;
}

.timeGroup {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.label {
  font-weight: 500;
}

.timeInput {
  width: fit-content;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

**Step 3: Add to Settings page**

In `packages/client/src/components/settings/Settings.tsx`, add import:

```typescript
import { NotificationSettings } from './NotificationSettings';
```

Add a new section after the Offline Mode section (around line 439):

```typescript
      {/* Push Notifications */}
      <section className={`card ${styles.section}`}>
        <NotificationSettings />
      </section>
```

**Step 4: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 5: Commit**

```bash
git add packages/client/src/components/settings/NotificationSettings.tsx packages/client/src/components/settings/NotificationSettings.module.css packages/client/src/components/settings/Settings.tsx
git commit -m "feat: add notification settings UI"
```

---

## Task 11: Create Streak Notification Prompt

**Files:**
- Create: `packages/client/src/components/dashboard/StreakNotificationPrompt.tsx`
- Create: `packages/client/src/components/dashboard/StreakNotificationPrompt.module.css`
- Modify: `packages/client/src/components/dashboard/Dashboard.tsx`

**Step 1: Create the prompt component**

Create `packages/client/src/components/dashboard/StreakNotificationPrompt.tsx`:

```typescript
/**
 * StreakNotificationPrompt Component
 *
 * Contextual prompt shown on dashboard to encourage enabling notifications.
 * Only shows when:
 * - Push is supported
 * - User is not subscribed
 * - User has 3+ day streak
 * - User hasn't dismissed the prompt
 */

import { useState, useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import styles from './StreakNotificationPrompt.module.css';

const DISMISS_KEY = 'ace-notification-prompt-dismissed';

interface StreakNotificationPromptProps {
  currentStreak: number;
}

export function StreakNotificationPrompt({ currentStreak }: StreakNotificationPromptProps) {
  const { isSupported, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  });
  const [isEnabling, setIsEnabling] = useState(false);

  // Reset dismissed state if user unsubscribes (allow showing again)
  useEffect(() => {
    if (!isSubscribed && isDismissed) {
      // Keep dismissed for this session, but allow showing on next visit
    }
  }, [isSubscribed, isDismissed]);

  // Don't show if:
  // - Push not supported
  // - Already subscribed
  // - Streak less than 3
  // - Dismissed
  // - Loading
  if (!isSupported || isSubscribed || currentStreak < 3 || isDismissed || isLoading) {
    return null;
  }

  const handleEnable = async () => {
    setIsEnabling(true);
    const success = await subscribe();
    if (!success) {
      // Permission denied or error - dismiss to avoid nagging
      localStorage.setItem(DISMISS_KEY, 'true');
      setIsDismissed(true);
    }
    setIsEnabling(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setIsDismissed(true);
  };

  return (
    <div className={styles.prompt}>
      <div className={styles.content}>
        <div className={styles.icon}>🔔</div>
        <div className={styles.text}>
          <strong>Protect your {currentStreak}-day streak</strong>
          <span>Get reminded before your streak resets</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.enableBtn}
          onClick={handleEnable}
          disabled={isEnabling}
        >
          {isEnabling ? 'Enabling...' : 'Enable'}
        </button>
        <button className={styles.dismissBtn} onClick={handleDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Create the CSS module**

Create `packages/client/src/components/dashboard/StreakNotificationPrompt.module.css`:

```css
.prompt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  margin-top: 0.75rem;
}

.content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.icon {
  font-size: 1.5rem;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.text strong {
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.text span {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.enableBtn {
  padding: 0.5rem 1rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.enableBtn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.enableBtn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.dismissBtn {
  padding: 0.5rem 1rem;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.2s;
}

.dismissBtn:hover {
  background: var(--bg-secondary);
}

@media (max-width: 480px) {
  .prompt {
    flex-direction: column;
    align-items: stretch;
  }

  .actions {
    justify-content: flex-end;
  }
}
```

**Step 3: Add to Dashboard**

Find the streak display in `packages/client/src/components/dashboard/Dashboard.tsx` and add the prompt component below it. First, add the import at the top:

```typescript
import { StreakNotificationPrompt } from './StreakNotificationPrompt';
```

Then find where the streak is displayed and add the prompt below it. Look for the streak card/widget and add:

```typescript
<StreakNotificationPrompt currentStreak={streak?.currentStreak || 0} />
```

**Step 4: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 5: Commit**

```bash
git add packages/client/src/components/dashboard/StreakNotificationPrompt.tsx packages/client/src/components/dashboard/StreakNotificationPrompt.module.css packages/client/src/components/dashboard/Dashboard.tsx
git commit -m "feat: add contextual notification prompt on dashboard"
```

---

## Task 12: Handle Navigation from Notification Click

**Files:**
- Modify: `packages/client/src/App.tsx`

**Step 1: Add listener for navigation messages from service worker**

Add a useEffect in the `App` component to handle navigation messages:

```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Inside the App function, add:
function App() {
  const navigate = useNavigate();

  // Handle navigation from push notification clicks
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.url) {
        navigate(event.data.url);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [navigate]);

  // ... rest of component
}
```

Note: Need to move Routes inside a component that can use `useNavigate`, or use a different approach.

**Step 2: Verify build**

Run:
```bash
cd packages/client && npm run build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: handle navigation from push notification clicks"
```

---

## Task 13: End-to-End Testing

**Files:** None (manual testing)

**Step 1: Start development servers**

Run:
```bash
npm run dev
```

**Step 2: Test subscription flow**

1. Go to Settings → Push Notifications
2. Click "Enable Notifications"
3. Accept browser permission prompt
4. Verify subscription saved (check Network tab or database)

**Step 3: Test notification preferences**

1. Toggle individual notification types
2. Change preferred time
3. Verify changes saved to server

**Step 4: Test contextual prompt**

1. Create account with 3+ day streak (or mock in database)
2. Verify prompt shows on dashboard
3. Click "Not now" → verify dismissed
4. Clear localStorage → verify prompt shows again

**Step 5: Test notification sending (manual)**

In development, manually trigger the scheduler:

```typescript
// Add temporary endpoint in notifications.ts for testing
fastify.post('/test-send', async (request) => {
  const userId = parseInt(request.user!.id, 10);
  await sendStreakWarning(userId, 5);
  return { sent: true };
});
```

Call this endpoint and verify notification appears.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(FEAT-013): complete push notifications implementation"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | VAPID keys setup | 4 |
| 2 | Database schema | 5 |
| 3 | Server dependencies | 3 |
| 4 | Push notification service | 3 |
| 5 | Notification API routes | 4 |
| 6 | Notification scheduler | 4 |
| 7 | Service worker handlers | 4 |
| 8 | Client push service | 3 |
| 9 | Push notifications hook | 3 |
| 10 | Settings UI | 5 |
| 11 | Contextual prompt | 5 |
| 12 | Navigation handling | 3 |
| 13 | End-to-end testing | 6 |

**Total commits:** 13
