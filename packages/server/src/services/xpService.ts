/**
 * XP Service
 *
 * Handles XP awards and level calculations for user progression.
 * Supports multiple activity types and detects level-ups.
 */

import { eq } from 'drizzle-orm';
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

  return db.transaction(async (tx) => {
    // Get existing XP record with transaction isolation
    const existing = await tx
      .select()
      .from(schema.userXp)
      .where(eq(schema.userXp.userId, userId))
      .get();

    const previousXp = existing?.totalXp ?? 0;
    const previousLevel = existing?.currentLevel ?? 1;
    const newTotalXp = previousXp + awardAmount;

    // Calculate new level info
    const levelInfo = calculateLevel(newTotalXp);

    if (!existing) {
      // First XP ever - create new record
      await tx.insert(schema.userXp).values({
        userId,
        totalXp: newTotalXp,
        currentLevel: levelInfo.currentLevel,
        updatedAt: new Date(),
      });
    } else {
      // Update existing record
      await tx
        .update(schema.userXp)
        .set({
          totalXp: newTotalXp,
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .where(eq(schema.userXp.userId, userId));
    }

    // Record XP in history
    await tx.insert(schema.xpHistory).values({
      userId,
      amount: awardAmount,
      source: xpType,
      createdAt: new Date(),
    });

    // Detect level-up
    const leveledUp = levelInfo.currentLevel > previousLevel;

    const response: XPAwardResponse = {
      awarded: awardAmount,
      totalXp: newTotalXp,
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
): Promise<XPAwardResponse> {
  return db.transaction(async (tx) => {
    // Get existing XP record with transaction isolation
    const existing = await tx
      .select()
      .from(schema.userXp)
      .where(eq(schema.userXp.userId, userId))
      .get();

    const previousXp = existing?.totalXp ?? 0;
    const previousLevel = existing?.currentLevel ?? 1;
    const newTotalXp = previousXp + amount;

    // Calculate new level info
    const levelInfo = calculateLevel(newTotalXp);

    if (!existing) {
      // First XP ever - create new record
      await tx.insert(schema.userXp).values({
        userId,
        totalXp: newTotalXp,
        currentLevel: levelInfo.currentLevel,
        updatedAt: new Date(),
      });
    } else {
      // Update existing record
      await tx
        .update(schema.userXp)
        .set({
          totalXp: newTotalXp,
          currentLevel: levelInfo.currentLevel,
          updatedAt: new Date(),
        })
        .where(eq(schema.userXp.userId, userId));
    }

    // Record XP in history
    await tx.insert(schema.xpHistory).values({
      userId,
      amount,
      source,
      createdAt: new Date(),
    });

    // Detect level-up
    const leveledUp = levelInfo.currentLevel > previousLevel;

    const response: XPAwardResponse = {
      awarded: amount,
      totalXp: newTotalXp,
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
