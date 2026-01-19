/**
 * Data Migration Service
 *
 * Handles migration of orphaned data to newly authenticated users.
 * On first login, associates anonymous data (userId IS NULL) with the new user account.
 */

import { db } from '../db/index.js';
import {
  exams,
  examResponses,
  studySessions,
  studySessionResponses,
  spacedRepetition,
  performanceStats,
  learningPathProgress,
  settings,
  userSettings,
} from '../db/schema.js';
import { eq, isNull } from 'drizzle-orm';

interface MigrationResult {
  exams: number;
  examResponses: number;
  studySessions: number;
  studySessionResponses: number;
  spacedRepetition: number;
  performanceStats: number;
  learningPathProgress: number;
  settings: number;
}

/**
 * Migrate orphaned data to a newly created user.
 * Only runs on first login when the user has no existing data.
 *
 * @param userId - The ID of the newly created user
 * @returns Migration counts for debugging/logging
 */
export async function migrateOrphanedDataToUser(userId: number): Promise<MigrationResult> {
  const result: MigrationResult = {
    exams: 0,
    examResponses: 0,
    studySessions: 0,
    studySessionResponses: 0,
    spacedRepetition: 0,
    performanceStats: 0,
    learningPathProgress: 0,
    settings: 0,
  };

  // Check if user already has any data (meaning this isn't their first device)
  const existingExams = await db
    .select({ id: exams.id })
    .from(exams)
    .where(eq(exams.userId, userId))
    .limit(1);

  if (existingExams.length > 0) {
    // User already has data - don't migrate orphaned data
    // This prevents data from another anonymous session being merged incorrectly
    return result;
  }

  // Migrate exams with null userId
  const migratedExams = await db
    .update(exams)
    .set({ userId })
    .where(isNull(exams.userId))
    .returning({ id: exams.id });
  result.exams = migratedExams.length;

  // Migrate exam responses with null userId
  const migratedExamResponses = await db
    .update(examResponses)
    .set({ userId })
    .where(isNull(examResponses.userId))
    .returning({ id: examResponses.id });
  result.examResponses = migratedExamResponses.length;

  // Migrate study sessions with null userId
  const migratedStudySessions = await db
    .update(studySessions)
    .set({ userId })
    .where(isNull(studySessions.userId))
    .returning({ id: studySessions.id });
  result.studySessions = migratedStudySessions.length;

  // Migrate study session responses with null userId
  const migratedStudySessionResponses = await db
    .update(studySessionResponses)
    .set({ userId })
    .where(isNull(studySessionResponses.userId))
    .returning({ id: studySessionResponses.id });
  result.studySessionResponses = migratedStudySessionResponses.length;

  // Migrate spaced repetition entries with null userId
  const migratedSpacedRepetition = await db
    .update(spacedRepetition)
    .set({ userId })
    .where(isNull(spacedRepetition.userId))
    .returning({ id: spacedRepetition.id });
  result.spacedRepetition = migratedSpacedRepetition.length;

  // Migrate performance stats with null userId
  const migratedPerformanceStats = await db
    .update(performanceStats)
    .set({ userId })
    .where(isNull(performanceStats.userId))
    .returning({ id: performanceStats.id });
  result.performanceStats = migratedPerformanceStats.length;

  // Migrate learning path progress with null userId
  const migratedLearningPathProgress = await db
    .update(learningPathProgress)
    .set({ userId })
    .where(isNull(learningPathProgress.userId))
    .returning({ id: learningPathProgress.id });
  result.learningPathProgress = migratedLearningPathProgress.length;

  // Migrate global settings to userSettings
  const globalSettings = await db.select().from(settings);
  if (globalSettings.length > 0) {
    const now = new Date();
    for (const setting of globalSettings) {
      await db
        .insert(userSettings)
        .values({
          userId,
          key: setting.key,
          value: setting.value,
          updatedAt: now,
        })
        .onConflictDoNothing(); // In case setting already exists for user
    }
    result.settings = globalSettings.length;
  }

  return result;
}
