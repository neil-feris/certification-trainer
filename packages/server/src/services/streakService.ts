/**
 * Streak Service
 *
 * Handles daily streak tracking for user activity.
 * Streaks increment when users complete activities on consecutive days.
 */

import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { StreakUpdateResponse, StreakMilestone, UserStreak } from '@ace-prep/shared';
import { STREAK_MILESTONES } from '@ace-prep/shared';

interface UpdateStreakResult {
  streak: UserStreak;
  streakUpdate: StreakUpdateResponse;
}

/**
 * Get the current date as YYYY-MM-DD string in local timezone.
 * Using date-only comparison for timezone safety.
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Check if a milestone was hit
 */
function checkMilestone(currentStreak: number): StreakMilestone | undefined {
  return STREAK_MILESTONES.find((m) => m === currentStreak) as StreakMilestone | undefined;
}

/**
 * Calculate the difference in days between two YYYY-MM-DD date strings.
 * Returns positive if dateA is after dateB.
 */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  const diffMs = a.getTime() - b.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Update user streak when an activity occurs.
 *
 * Logic:
 * - Creates streak record if not exists (initializes to 1)
 * - Increments streak if last activity was yesterday
 * - Resets streak to 1 if last activity was 2+ days ago
 * - Maintains streak if activity already recorded today
 * - Updates longestStreak when currentStreak exceeds it
 *
 * @param userId - The user ID to update streak for
 * @returns The updated streak data and whether a milestone was hit
 */
export async function updateStreak(userId: number): Promise<UpdateStreakResult> {
  const today = getTodayDateString();

  // Get existing streak record
  const existing = await db
    .select()
    .from(schema.userStreaks)
    .where(eq(schema.userStreaks.userId, userId))
    .get();

  if (!existing) {
    // First activity ever - create new record with streak of 1
    const newStreak = {
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: today,
      updatedAt: new Date(),
    };

    await db.insert(schema.userStreaks).values(newStreak);

    const milestone = checkMilestone(1);
    return {
      streak: {
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
      },
      streakUpdate: {
        current: 1,
        milestone,
      },
    };
  }

  const { lastActivityDate, currentStreak, longestStreak } = existing;

  // Activity already recorded today - maintain current streak
  if (lastActivityDate === today) {
    return {
      streak: {
        currentStreak,
        longestStreak,
        lastActivityDate,
      },
      streakUpdate: {
        current: currentStreak,
        // No milestone on same-day activity
      },
    };
  }

  let newCurrentStreak: number;
  const daysSinceLastActivity = lastActivityDate ? daysBetween(today, lastActivityDate) : Infinity;

  if (daysSinceLastActivity === 1) {
    // Activity was yesterday - increment streak
    newCurrentStreak = currentStreak + 1;
  } else {
    // Gap of 2+ days - reset streak to 1
    newCurrentStreak = 1;
  }

  // Update longest streak if we've exceeded it
  const newLongestStreak = Math.max(longestStreak, newCurrentStreak);

  // Persist the update
  await db
    .update(schema.userStreaks)
    .set({
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastActivityDate: today,
      updatedAt: new Date(),
    })
    .where(eq(schema.userStreaks.userId, userId));

  const milestone = checkMilestone(newCurrentStreak);

  return {
    streak: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastActivityDate: today,
    },
    streakUpdate: {
      current: newCurrentStreak,
      milestone,
    },
  };
}

/**
 * Get current streak data for a user.
 * Returns default values if no record exists.
 */
export async function getStreak(userId: number): Promise<UserStreak> {
  const existing = await db
    .select()
    .from(schema.userStreaks)
    .where(eq(schema.userStreaks.userId, userId))
    .get();

  if (!existing) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    };
  }

  return {
    currentStreak: existing.currentStreak,
    longestStreak: existing.longestStreak,
    lastActivityDate: existing.lastActivityDate,
  };
}
