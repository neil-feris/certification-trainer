/**
 * Encounter Service
 *
 * Records when users encounter questions and retrieves recent encounters
 * for adaptive selection cooldown enforcement.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * Record question encounters for a user.
 * Upserts into questionEncounters: increments encounterCount, updates lastSeenAt.
 * Uses a single synchronous transaction for atomicity.
 */
export function recordEncounters(userId: number, questionIds: number[]): void {
  if (questionIds.length === 0) return;

  const now = new Date();

  db.transaction((tx) => {
    for (const questionId of questionIds) {
      const [existing] = tx
        .select()
        .from(schema.questionEncounters)
        .where(
          and(
            eq(schema.questionEncounters.userId, userId),
            eq(schema.questionEncounters.questionId, questionId)
          )
        )
        .all();

      if (existing) {
        tx.update(schema.questionEncounters)
          .set({
            encounterCount: sql`${schema.questionEncounters.encounterCount} + 1`,
            lastSeenAt: now,
          })
          .where(
            and(
              eq(schema.questionEncounters.userId, userId),
              eq(schema.questionEncounters.questionId, questionId)
            )
          )
          .run();
      } else {
        tx.insert(schema.questionEncounters)
          .values({
            userId,
            questionId,
            encounterCount: 1,
            lastSeenAt: now,
          })
          .run();
      }
    }
  });
}

/**
 * Get the N most recently seen question IDs for a user.
 * Ordered by lastSeenAt descending (most recent first).
 */
export async function getRecentEncounters(userId: number, limit: number): Promise<number[]> {
  const rows = await db
    .select({ questionId: schema.questionEncounters.questionId })
    .from(schema.questionEncounters)
    .where(eq(schema.questionEncounters.userId, userId))
    .orderBy(desc(schema.questionEncounters.lastSeenAt))
    .limit(limit)
    .all();

  return rows.map((r) => r.questionId);
}
