/**
 * XP Service
 *
 * Handles XP awards and level calculations for user progression.
 * Supports multiple activity types and detects level-ups.
 */

import { eq, sql, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { UserXP, XPAwardResponse, XPAwardType } from '@ace-prep/shared';
import { XP_AWARDS, calculateLevel } from '@ace-prep/shared';

/**
 * Get current XP data for a user.
 * Returns default level 1 values if no record exists.
 */
export async function getXP(userId: number): Promise<UserXP> {
  const existing = await db
    .select()
    .from(schema.userXp)
    .where(eq(schema.userXp.userId, userId))
    .get();

  if (!existing) {
    return calculateLevel(0);
  }

  return calculateLevel(existing.totalXp);
}

/**
 * Award XP to a user for completing an activity.
 *
 * Logic:
 * - Creates XP record if not exists (initializes with awarded amount)
 * - Adds XP to existing total
 * - Calculates new level and detects level-ups
 * - Uses transaction for atomicity
 *
 * @param userId - The user ID to award XP to
 * @param xpType - The type of activity that triggered the award
 * @returns XP award details including any level-up info
 */
export async function awardXP(userId: number, xpType: XPAwardType): Promise<XPAwardResponse> {
  const awardAmount = XP_AWARDS[xpType];

  // CRITICAL: better-sqlite3 transactions must be synchronous - no async/await
  return db.transaction((tx) => {
    // Get existing XP record to check for level-up detection
    const [existing] = tx
      .select()
      .from(schema.userXp)
      .where(eq(schema.userXp.userId, userId))
      .all();

    const previousLevel = existing?.currentLevel ?? 1;

    if (!existing) {
      // First XP ever - create new record
      const levelInfo = calculateLevel(awardAmount);
      tx.insert(schema.userXp)
        .values({
          userId,
          totalXp: awardAmount,
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .run();

      // Record XP in history
      tx.insert(schema.xpHistory)
        .values({
          userId,
          amount: awardAmount,
          source: xpType,
          createdAt: new Date(),
        })
        .run();

      // Detect level-up
      const leveledUp = levelInfo.currentLevel > previousLevel;

      const response: XPAwardResponse = {
        awarded: awardAmount,
        totalXp: awardAmount,
        currentLevel: levelInfo.currentLevel,
        levelTitle: levelInfo.levelTitle,
      };

      if (leveledUp) {
        response.newLevel = levelInfo.currentLevel;
        response.newTitle = levelInfo.levelTitle;
      }

      return response;
    }

    // Atomic increment for race-free update
    tx.update(schema.userXp)
      .set({
        totalXp: sql`${schema.userXp.totalXp} + ${awardAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.userXp.userId, userId))
      .run();

    // Read back updated values for level calculation
    const [updated] = tx.select().from(schema.userXp).where(eq(schema.userXp.userId, userId)).all();

    if (!updated) {
      throw new Error('Failed to read updated XP record');
    }

    // Calculate new level and update if changed
    const levelInfo = calculateLevel(updated.totalXp);
    if (levelInfo.currentLevel !== updated.currentLevel) {
      tx.update(schema.userXp)
        .set({
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .where(eq(schema.userXp.userId, userId))
        .run();
    }

    // Record XP in history
    tx.insert(schema.xpHistory)
      .values({
        userId,
        amount: awardAmount,
        source: xpType,
        createdAt: new Date(),
      })
      .run();

    // Detect level-up
    const leveledUp = levelInfo.currentLevel > previousLevel;

    const response: XPAwardResponse = {
      awarded: awardAmount,
      totalXp: updated.totalXp,
      currentLevel: levelInfo.currentLevel,
      levelTitle: levelInfo.levelTitle,
    };

    if (leveledUp) {
      response.newLevel = levelInfo.currentLevel;
      response.newTitle = levelInfo.levelTitle;
    }

    return response;
  });
}

/**
 * Award XP with a custom amount (for batch operations or bonuses).
 * Uses transaction for atomicity.
 *
 * @param userId - The user ID to award XP to
 * @param amount - The custom XP amount to award
 * @param source - The source type for history tracking (defaults to 'CUSTOM')
 * @returns XP award details including any level-up info
 */
export async function awardCustomXP(
  userId: number,
  amount: number,
  source: string = 'CUSTOM'
): Promise<XPAwardResponse | null> {
  // CRITICAL: better-sqlite3 transactions must be synchronous - no async/await
  return db.transaction((tx) => {
    // Idempotency check inside transaction to prevent TOCTOU race conditions
    const [alreadyAwarded] = tx
      .select({ id: schema.xpHistory.id })
      .from(schema.xpHistory)
      .where(and(eq(schema.xpHistory.userId, userId), eq(schema.xpHistory.source, source)))
      .all();

    if (alreadyAwarded) {
      return null;
    }

    // Get existing XP record to check for level-up detection
    const [existing] = tx
      .select()
      .from(schema.userXp)
      .where(eq(schema.userXp.userId, userId))
      .all();

    const previousLevel = existing?.currentLevel ?? 1;

    if (!existing) {
      // First XP ever - create new record
      const levelInfo = calculateLevel(amount);
      tx.insert(schema.userXp)
        .values({
          userId,
          totalXp: amount,
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .run();

      // Record XP in history
      tx.insert(schema.xpHistory)
        .values({
          userId,
          amount,
          source,
          createdAt: new Date(),
        })
        .run();

      // Detect level-up
      const leveledUp = levelInfo.currentLevel > previousLevel;

      const response: XPAwardResponse = {
        awarded: amount,
        totalXp: amount,
        currentLevel: levelInfo.currentLevel,
        levelTitle: levelInfo.levelTitle,
      };

      if (leveledUp) {
        response.newLevel = levelInfo.currentLevel;
        response.newTitle = levelInfo.levelTitle;
      }

      return response;
    }

    // Atomic increment for race-free update
    tx.update(schema.userXp)
      .set({
        totalXp: sql`${schema.userXp.totalXp} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.userXp.userId, userId))
      .run();

    // Read back updated values for level calculation
    const [updated] = tx.select().from(schema.userXp).where(eq(schema.userXp.userId, userId)).all();

    if (!updated) {
      throw new Error('Failed to read updated XP record');
    }

    // Calculate new level and update if changed
    const levelInfo = calculateLevel(updated.totalXp);
    if (levelInfo.currentLevel !== updated.currentLevel) {
      tx.update(schema.userXp)
        .set({
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .where(eq(schema.userXp.userId, userId))
        .run();
    }

    // Record XP in history
    tx.insert(schema.xpHistory)
      .values({
        userId,
        amount,
        source,
        createdAt: new Date(),
      })
      .run();

    // Detect level-up
    const leveledUp = levelInfo.currentLevel > previousLevel;

    const response: XPAwardResponse = {
      awarded: amount,
      totalXp: updated.totalXp,
      currentLevel: levelInfo.currentLevel,
      levelTitle: levelInfo.levelTitle,
    };

    if (leveledUp) {
      response.newLevel = levelInfo.currentLevel;
      response.newTitle = levelInfo.levelTitle;
    }

    return response;
  });
}
