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
 * Get the current date as YYYY-MM-DD string in UTC.
 * Using UTC explicitly for consistent timezone handling.
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 * Parses dates explicitly in UTC to avoid timezone drift.
 */
function daysBetween(dateA: string, dateB: string | null): number {
  if (!dateA || !dateB) return Infinity;

  // Parse YYYY-MM-DD explicitly to avoid timezone issues
  const [yearA, monthA, dayA] = dateA.split('-').map(Number);
  const [yearB, monthB, dayB] = dateB.split('-').map(Number);

  const a = Date.UTC(yearA, monthA - 1, dayA);
  const b = Date.UTC(yearB, monthB - 1, dayB);

  const diffMs = a - b;
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
 * Uses transaction to prevent race conditions on concurrent activity completions.
 *
 * @param userId - The user ID to update streak for
 * @returns The updated streak data and whether a milestone was hit
 */
export async function updateStreak(userId: number): Promise<UpdateStreakResult> {
  // CRITICAL: better-sqlite3 transactions must be synchronous - no async/await
  return db.transaction((tx) => {
    const today = getTodayDateString();

    // Get existing streak record with transaction isolation
    const [existing] = tx
      .select()
      .from(schema.userStreaks)
      .where(eq(schema.userStreaks.userId, userId))
      .all();

    if (!existing) {
      // First activity ever - create new record with streak of 1
      const newStreak = {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        updatedAt: new Date(),
      };

      tx.insert(schema.userStreaks).values(newStreak).run();

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
    const daysSinceLastActivity = daysBetween(today, lastActivityDate);

    if (daysSinceLastActivity === 1) {
      // Activity was yesterday - increment streak
      newCurrentStreak = currentStreak + 1;
    } else {
      // Gap of 2+ days - reset streak to 1
      newCurrentStreak = 1;
    }

    // Update longest streak if we've exceeded it
    const newLongestStreak = Math.max(longestStreak, newCurrentStreak);

    // Persist the update within transaction
    tx.update(schema.userStreaks)
      .set({
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        lastActivityDate: today,
        updatedAt: new Date(),
      })
      .where(eq(schema.userStreaks.userId, userId))
      .run();

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
  });
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
