/**
 * Notification Scheduler
 *
 * Cron job that runs every 15 minutes to check notification conditions
 * and send push notifications to eligible users.
 */

import cron from 'node-cron';
import { eq, and, lte, sql, inArray } from 'drizzle-orm';
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

/** Minimum cards due to trigger review reminder */
const MIN_DUE_FOR_REMINDER = 5;

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/** Data needed to process a user's notifications (batch-fetched) */
interface UserNotificationData {
  prefs: typeof schema.notificationPreferences.$inferSelect;
  streak: { currentStreak: number; lastActivityDate: string | null } | null;
  dueReviewCount: number;
}

/**
 * Batch-fetch all data needed for notification processing
 * Eliminates N+1 queries by fetching streak and review data for all users at once
 */
async function batchFetchUserData(
  userIds: number[]
): Promise<Map<number, { streak: UserNotificationData['streak']; dueReviewCount: number }>> {
  if (userIds.length === 0) return new Map();

  const now = new Date();

  // Batch fetch streaks for all users
  const streaks = await db
    .select({
      userId: schema.userStreaks.userId,
      currentStreak: schema.userStreaks.currentStreak,
      lastActivityDate: schema.userStreaks.lastActivityDate,
    })
    .from(schema.userStreaks)
    .where(inArray(schema.userStreaks.userId, userIds));

  // Batch fetch due review counts for all users
  const reviewCounts = await db
    .select({
      userId: schema.spacedRepetition.userId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.spacedRepetition)
    .where(
      and(
        inArray(schema.spacedRepetition.userId, userIds),
        lte(schema.spacedRepetition.nextReviewAt, now)
      )
    )
    .groupBy(schema.spacedRepetition.userId);

  // Build lookup maps
  const streakMap = new Map(streaks.map((s) => [s.userId, s]));
  const reviewMap = new Map(reviewCounts.map((r) => [r.userId, r.count]));

  // Combine into result map
  const result = new Map<
    number,
    { streak: UserNotificationData['streak']; dueReviewCount: number }
  >();
  for (const userId of userIds) {
    const streak = streakMap.get(userId) || null;
    result.set(userId, {
      streak: streak
        ? { currentStreak: streak.currentStreak, lastActivityDate: streak.lastActivityDate }
        : null,
      dueReviewCount: reviewMap.get(userId) || 0,
    });
  }

  return result;
}

/**
 * Process notifications for a single user (using pre-fetched data)
 */
async function processUserNotifications(
  userId: number,
  prefs: typeof schema.notificationPreferences.$inferSelect,
  userData: { streak: UserNotificationData['streak']; dueReviewCount: number }
): Promise<void> {
  const today = getTodayDateString();
  const lastNotified = prefs.lastNotifiedAt?.toISOString().split('T')[0];

  // Skip if already notified today
  if (lastNotified === today) {
    return;
  }

  // Check streak warning (using pre-fetched data)
  if (prefs.streakReminders && userData.streak) {
    const { currentStreak, lastActivityDate } = userData.streak;
    const hasStudiedToday = lastActivityDate === today;

    if (currentStreak > 0 && !hasStudiedToday) {
      await sendStreakWarning(userId, currentStreak);
    }
  }

  // Check review reminders (using pre-fetched count)
  if (prefs.reviewReminders && userData.dueReviewCount >= MIN_DUE_FOR_REMINDER) {
    await sendReviewReminder(userId, userData.dueReviewCount);
  }

  // Send QOTD reminder
  if (prefs.qotdReminders) {
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

    if (eligibleUsers.length === 0) {
      return;
    }

    // Batch-fetch streak and review data for all eligible users (eliminates N+1)
    const userIds = eligibleUsers.map(({ userId }) => userId);
    const userData = await batchFetchUserData(userIds);

    for (const { userId, prefs } of eligibleUsers) {
      try {
        const data = userData.get(userId) || { streak: null, dueReviewCount: 0 };
        await processUserNotifications(userId, prefs, data);
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
