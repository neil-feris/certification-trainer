/**
 * Notification Scheduler
 *
 * Cron job that runs every 15 minutes to check notification conditions
 * and send push notifications to eligible users.
 */

import cron from 'node-cron';
import { eq, and, lte, sql } from 'drizzle-orm';
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
