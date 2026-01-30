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
 * Get current UTC time slot in HH:mm format (rounded to 15-min)
 */
function getCurrentUTCTimeSlot(): string {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convert user's preferred time (in their timezone) to UTC time slot
 * Returns the HH:mm in UTC that corresponds to their local preferred time
 */
function convertPreferredTimeToUTC(preferredTime: string, timezone: string): string {
  try {
    // Parse the preferred time
    const [hours, minutes] = preferredTime.split(':').map(Number);

    // Use today's date as reference for timezone offset calculation
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // Use Intl to find the UTC offset for this timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    // Get the timezone offset by comparing formatted local time with UTC
    const testDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));
    const parts = formatter.formatToParts(testDate);
    const localHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const localMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    // Calculate the offset in minutes
    const localTotalMinutes = localHour * 60 + localMinute;
    const utcTotalMinutes = hours * 60 + minutes;
    let offsetMinutes = localTotalMinutes - utcTotalMinutes;

    // Normalize offset to handle day boundaries
    if (offsetMinutes > 720) offsetMinutes -= 1440;
    if (offsetMinutes < -720) offsetMinutes += 1440;

    // Convert user's preferred local time to UTC
    let utcMinutes = hours * 60 + minutes - offsetMinutes;

    // Handle day wrap-around
    if (utcMinutes < 0) utcMinutes += 1440;
    if (utcMinutes >= 1440) utcMinutes -= 1440;

    // Round to nearest 15-minute slot
    const roundedMinutes = Math.floor(utcMinutes / 15) * 15;
    const utcHours = Math.floor(roundedMinutes / 60) % 24;
    const utcMins = roundedMinutes % 60;

    return `${String(utcHours).padStart(2, '0')}:${String(utcMins).padStart(2, '0')}`;
  } catch {
    // Fallback: treat as UTC if timezone is invalid
    return preferredTime;
  }
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

  const currentUTCSlot = getCurrentUTCTimeSlot();
  console.log(`[Scheduler] Running notification job for UTC slot ${currentUTCSlot}`);

  try {
    // Find users with:
    // 1. At least one push subscription
    // 2. Notifications enabled
    // We fetch all enabled users and filter by timezone-converted preferred time
    const allEnabledUsers = await db
      .select({
        userId: schema.notificationPreferences.userId,
        prefs: schema.notificationPreferences,
      })
      .from(schema.notificationPreferences)
      .innerJoin(
        schema.pushSubscriptions,
        eq(schema.notificationPreferences.userId, schema.pushSubscriptions.userId)
      )
      .where(eq(schema.notificationPreferences.enabled, true))
      .groupBy(schema.notificationPreferences.userId);

    // Filter users whose preferred time (converted to UTC) matches current slot
    const eligibleUsers = allEnabledUsers.filter(({ prefs }) => {
      const userUTCSlot = convertPreferredTimeToUTC(prefs.preferredTime, prefs.timezone);
      return userUTCSlot === currentUTCSlot;
    });

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
