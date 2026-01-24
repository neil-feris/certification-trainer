/**
 * Achievement Service
 *
 * Checks achievement criteria and unlocks badges when conditions are met.
 * Awards rarity-based XP via awardCustomXP on unlock.
 */

import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { examResponses, studySessionResponses, questions, domains } from '../db/schema.js';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_XP_REWARDS,
  type AchievementUnlockResponse,
  type AchievementRarity,
} from '@ace-prep/shared';
import { awardCustomXP } from './xpService.js';

/** Context passed to achievement checkers */
export interface AchievementContext {
  activity?: 'exam' | 'study' | 'drill' | 'review';
  score?: number;
  totalQuestions?: number;
  streak?: number;
  timeOfDay?: number; // hour 0-23
  durationSeconds?: number;
  domainAccuracy?: number;
  domainAttempts?: number;
  pathComplete?: boolean;
  cumulativeSrReviews?: number;
  cumulativeExams?: number;
}

/**
 * Check all achievements for a user and unlock any newly earned ones.
 * Returns an array of newly unlocked achievements (empty if none).
 * Idempotent: already-unlocked badges are skipped.
 */
export async function checkAndUnlock(
  userId: number,
  context: AchievementContext
): Promise<AchievementUnlockResponse[]> {
  const unlocked: AchievementUnlockResponse[] = [];

  // Get user's existing achievements
  const existing = await db
    .select({ achievementCode: schema.userAchievements.achievementCode })
    .from(schema.userAchievements)
    .where(eq(schema.userAchievements.userId, userId))
    .all();

  const alreadyUnlocked = new Set(existing.map((e) => e.achievementCode));

  for (const achievement of ACHIEVEMENTS) {
    // Skip already-unlocked badges
    if (alreadyUnlocked.has(achievement.code)) continue;

    // Check if criteria is met
    const earned = checkCriteria(achievement.code, achievement.criteria, context);
    if (!earned) continue;

    // Unlock the achievement
    const rarity = achievement.rarity as AchievementRarity;
    const xpAmount = ACHIEVEMENT_XP_REWARDS[rarity];

    // Insert user_achievement record (ON CONFLICT DO NOTHING handles race conditions)
    const insertResult = db
      .insert(schema.userAchievements)
      .values({
        userId,
        achievementCode: achievement.code,
        xpAwarded: xpAmount,
        unlockedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();

    // Skip XP award if insert was a no-op (already unlocked by concurrent request)
    if (insertResult.changes === 0) continue;

    // Award XP via existing service (source uniqueness prevents double-award)
    await awardCustomXP(userId, xpAmount, `achievement:${achievement.code}`);

    unlocked.push({
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      rarity,
      icon: achievement.icon,
      xpAwarded: xpAmount,
    });
  }

  return unlocked;
}

/**
 * Check if a specific achievement's criteria is met given the context.
 */
function checkCriteria(
  code: string,
  criteria: { type: string; [key: string]: unknown },
  context: AchievementContext
): boolean {
  switch (criteria.type) {
    case 'first_activity':
      return checkFirstActivity(context);
    case 'perfect_score':
      return checkPerfectScore(criteria, context);
    case 'streak':
      return checkStreak(criteria, context);
    case 'domain_mastery':
      return checkDomainMastery(criteria, context);
    case 'speed':
      return checkSpeed(criteria, context);
    case 'time_of_day':
      return checkTimeOfDay(criteria, context);
    case 'cumulative_count':
      return checkCumulativeCount(code, criteria, context);
    case 'path_completion':
      return checkPathCompletion(criteria, context);
    default:
      return false;
  }
}

/** first-steps: first exam or study session completion */
function checkFirstActivity(context: AchievementContext): boolean {
  return context.activity === 'exam' || context.activity === 'study';
}

/** perfect-score: 100% on an exam */
function checkPerfectScore(
  criteria: { [key: string]: unknown },
  context: AchievementContext
): boolean {
  if (context.activity !== 'exam') return false;
  if (context.score === undefined || context.totalQuestions === undefined) return false;
  const requiredPercent = (criteria.scorePercent as number) ?? 100;
  const scorePercent = (context.score / context.totalQuestions) * 100;
  return scorePercent >= requiredPercent;
}

/** consistent-7, dedicated-30, century-streak: streak >= N days */
function checkStreak(criteria: { [key: string]: unknown }, context: AchievementContext): boolean {
  if (context.streak === undefined) return false;
  const requiredDays = criteria.days as number;
  return context.streak >= requiredDays;
}

/** domain-expert: 90%+ accuracy with 5+ attempts in a domain */
function checkDomainMastery(
  criteria: { [key: string]: unknown },
  context: AchievementContext
): boolean {
  if (context.domainAccuracy === undefined || context.domainAttempts === undefined) return false;
  const requiredAccuracy = (criteria.accuracyPercent as number) ?? 90;
  const minAttempts = (criteria.minAttempts as number) ?? 5;
  return context.domainAccuracy >= requiredAccuracy && context.domainAttempts >= minAttempts;
}

/** speed-demon: 100% accuracy drill in under 60 seconds */
function checkSpeed(criteria: { [key: string]: unknown }, context: AchievementContext): boolean {
  if (context.activity !== 'drill') return false;
  if (context.durationSeconds === undefined) return false;
  if (context.score === undefined || context.totalQuestions === undefined) return false;
  const maxSeconds = (criteria.maxSeconds as number) ?? 60;
  const minAccuracy = (criteria.minAccuracy as number) ?? 100;
  const scorePercent = (context.score / context.totalQuestions) * 100;
  return context.durationSeconds <= maxSeconds && scorePercent >= minAccuracy;
}

/** night-owl, early-bird: activity at specific time of day */
function checkTimeOfDay(
  criteria: { [key: string]: unknown },
  context: AchievementContext
): boolean {
  if (context.timeOfDay === undefined) return false;
  const startHour = criteria.startHour as number;
  const endHour = criteria.endHour as number;
  return context.timeOfDay >= startHour && context.timeOfDay < endHour;
}

/** reviewer-100, exam-veteran: cumulative count thresholds */
function checkCumulativeCount(
  code: string,
  criteria: { [key: string]: unknown },
  context: AchievementContext
): boolean {
  const activity = criteria.activity as string;
  const requiredCount = criteria.count as number;

  if (activity === 'sr_review') {
    return (context.cumulativeSrReviews ?? 0) >= requiredCount;
  }
  if (activity === 'exam_complete') {
    return (context.cumulativeExams ?? 0) >= requiredCount;
  }
  return false;
}

/** completionist: 100% learning path completion */
function checkPathCompletion(
  criteria: { [key: string]: unknown },
  context: AchievementContext
): boolean {
  return context.pathComplete === true;
}

/**
 * Check domain-expert achievement across ALL response sources (exams + study/drills).
 * Returns any newly unlocked achievements.
 */
export async function checkDomainExpert(userId: number): Promise<AchievementUnlockResponse[]> {
  // Query exam responses by domain
  const examStats = await db
    .select({
      domainId: domains.id,
      totalAttempts: sql<number>`count(*)`.as('total_attempts'),
      correctAttempts:
        sql<number>`sum(case when ${examResponses.isCorrect} = 1 then 1 else 0 end)`.as(
          'correct_attempts'
        ),
    })
    .from(examResponses)
    .innerJoin(questions, eq(questions.id, examResponses.questionId))
    .innerJoin(domains, eq(domains.id, questions.domainId))
    .where(eq(examResponses.userId, userId))
    .groupBy(domains.id);

  // Query study/drill responses by domain
  const studyStats = await db
    .select({
      domainId: domains.id,
      totalAttempts: sql<number>`count(*)`.as('total_attempts'),
      correctAttempts:
        sql<number>`sum(case when ${studySessionResponses.isCorrect} = 1 then 1 else 0 end)`.as(
          'correct_attempts'
        ),
    })
    .from(studySessionResponses)
    .innerJoin(questions, eq(questions.id, studySessionResponses.questionId))
    .innerJoin(domains, eq(domains.id, questions.domainId))
    .where(eq(studySessionResponses.userId, userId))
    .groupBy(domains.id);

  // Merge stats across both response sources
  const merged = new Map<number, { total: number; correct: number }>();
  for (const stat of examStats) {
    merged.set(stat.domainId, {
      total: stat.totalAttempts,
      correct: stat.correctAttempts,
    });
  }
  for (const stat of studyStats) {
    const existing = merged.get(stat.domainId);
    if (existing) {
      existing.total += stat.totalAttempts;
      existing.correct += stat.correctAttempts;
    } else {
      merged.set(stat.domainId, {
        total: stat.totalAttempts,
        correct: stat.correctAttempts,
      });
    }
  }

  // Find the best qualifying domain and check once
  for (const [, stats] of merged) {
    const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    if (accuracy >= 90 && stats.total >= 5) {
      return checkAndUnlock(userId, {
        domainAccuracy: accuracy,
        domainAttempts: stats.total,
      });
    }
  }

  return [];
}
