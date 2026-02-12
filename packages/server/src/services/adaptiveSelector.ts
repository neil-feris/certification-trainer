/**
 * Adaptive Question Selector
 *
 * Replaces ORDER BY RANDOM() with intelligent selection based on:
 * - Weak area weighting (domain-level performance)
 * - Cooldown enforcement (recently-seen question exclusion)
 * - Difficulty progression (bias by user proficiency level)
 * - Fallback to RANDOM() when adaptive pool is insufficient
 */

import { eq, and, sql, inArray, notInArray, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ADAPTIVE_DEFAULTS } from '@ace-prep/shared';
import type { AdaptiveSelectionConfig } from '@ace-prep/shared';

export interface SelectQuestionsParams {
  userId: number;
  certificationId: number;
  count: number;
  /** Optional domain IDs to restrict selection to */
  domainIds?: number[];
  /** Override default adaptive config */
  config?: Partial<AdaptiveSelectionConfig>;
}

interface CandidateQuestion {
  id: number;
  domainId: number;
  difficulty: string;
  weight: number;
}

interface DomainStats {
  domainId: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
}

/**
 * Select questions using adaptive weighting algorithm.
 *
 * 1. Exclude recently-seen questions (cooldown)
 * 2. Fetch candidate pool with domain stats
 * 3. Apply weak-area weighting
 * 4. Apply difficulty progression bias
 * 5. Weighted random selection
 * 6. Fallback to RANDOM() if pool insufficient
 */
export async function selectQuestions(params: SelectQuestionsParams): Promise<number[]> {
  const { userId, certificationId, count, domainIds } = params;
  const config = { ...ADAPTIVE_DEFAULTS, ...params.config };

  // Step 1: Get recently-seen question IDs for cooldown
  const recentEncounters = await getRecentEncounterIds(userId, config.cooldownWindowSize);

  // Step 2: Get user's domain-level performance stats
  const domainStatsMap = await getDomainStats(userId);

  // Step 3: Calculate user's overall accuracy for difficulty progression
  const overallAccuracy = calculateOverallAccuracy(domainStatsMap);

  // Step 4: Build candidate pool excluding cooldown questions
  let candidates = await getCandidatePool(certificationId, domainIds, recentEncounters);

  // Step 5: If not enough candidates after cooldown, shrink cooldown window
  if (candidates.length < count && recentEncounters.length > 0) {
    // Auto-shrink: try with half the cooldown
    const shrunkCooldown = Math.floor(config.cooldownWindowSize / 2);
    const fewerExclusions = recentEncounters.slice(0, shrunkCooldown);
    candidates = await getCandidatePool(certificationId, domainIds, fewerExclusions);

    // If still not enough, drop cooldown entirely
    if (candidates.length < count) {
      candidates = await getCandidatePool(certificationId, domainIds, []);
    }
  }

  // Step 6: Fallback to RANDOM() if still insufficient
  if (candidates.length <= count) {
    // Not enough for weighted selection, just return what we have (or use RANDOM for ordering)
    return fallbackRandomSelection(certificationId, domainIds, count);
  }

  // Step 7: Apply weights
  const weighted = applyWeights(candidates, domainStatsMap, overallAccuracy, config);

  // Step 8: Weighted random selection
  return weightedRandomSample(weighted, count);
}

/**
 * Get IDs of recently-seen questions for cooldown enforcement.
 */
async function getRecentEncounterIds(userId: number, limit: number): Promise<number[]> {
  const rows = await db
    .select({ questionId: schema.questionEncounters.questionId })
    .from(schema.questionEncounters)
    .where(eq(schema.questionEncounters.userId, userId))
    .orderBy(desc(schema.questionEncounters.lastSeenAt))
    .limit(limit)
    .all();

  return rows.map((r) => r.questionId);
}

/**
 * Get domain-level performance stats for a user.
 * Returns map of domainId -> stats.
 */
async function getDomainStats(userId: number): Promise<Map<number, DomainStats>> {
  const rows = await db
    .select({
      domainId: schema.performanceStats.domainId,
      totalAttempts: schema.performanceStats.totalAttempts,
      correctAttempts: schema.performanceStats.correctAttempts,
    })
    .from(schema.performanceStats)
    .where(
      and(
        eq(schema.performanceStats.userId, userId),
        sql`${schema.performanceStats.totalAttempts} > 0`
      )
    )
    .all();

  const map = new Map<number, DomainStats>();
  for (const row of rows) {
    const accuracy = row.totalAttempts > 0 ? (row.correctAttempts / row.totalAttempts) * 100 : 0;
    map.set(row.domainId, {
      domainId: row.domainId,
      totalAttempts: row.totalAttempts,
      correctAttempts: row.correctAttempts,
      accuracy,
    });
  }
  return map;
}

/**
 * Calculate overall accuracy across all domains.
 */
function calculateOverallAccuracy(domainStats: Map<number, DomainStats>): number {
  let totalAttempts = 0;
  let totalCorrect = 0;
  for (const stats of domainStats.values()) {
    totalAttempts += stats.totalAttempts;
    totalCorrect += stats.correctAttempts;
  }
  return totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;
}

/**
 * Fetch candidate questions from the database, excluding cooldown list.
 */
async function getCandidatePool(
  certificationId: number,
  domainIds: number[] | undefined,
  excludeIds: number[]
): Promise<CandidateQuestion[]> {
  const conditions = [eq(schema.domains.certificationId, certificationId)];

  if (domainIds && domainIds.length > 0) {
    conditions.push(inArray(schema.questions.domainId, domainIds));
  }

  if (excludeIds.length > 0) {
    conditions.push(notInArray(schema.questions.id, excludeIds));
  }

  const rows = await db
    .select({
      id: schema.questions.id,
      domainId: schema.questions.domainId,
      difficulty: schema.questions.difficulty,
    })
    .from(schema.questions)
    .innerJoin(schema.domains, eq(schema.questions.domainId, schema.domains.id))
    .where(and(...conditions))
    .all();

  return rows.map((r) => ({
    id: r.id,
    domainId: r.domainId,
    difficulty: r.difficulty,
    weight: 1.0,
  }));
}

/**
 * Apply adaptive weights to candidate questions.
 *
 * Weight multipliers stack:
 * - Weak area: <70% accuracy → 3x, <50% → 5x
 * - Unseen domain (0 attempts) → 2x
 * - Mastered (>90% with 10+ attempts) → 0.5x
 * - Difficulty progression based on overall accuracy
 */
function applyWeights(
  candidates: CandidateQuestion[],
  domainStats: Map<number, DomainStats>,
  overallAccuracy: number,
  config: AdaptiveSelectionConfig
): CandidateQuestion[] {
  return candidates.map((q) => {
    let weight = 1.0;
    const stats = domainStats.get(q.domainId);

    // Weak area weighting
    if (!stats || stats.totalAttempts === 0) {
      // Never attempted this domain — boost unseen
      weight *= config.unseenWeight;
    } else if (stats.accuracy < 50) {
      weight *= config.veryWeakAreaWeight;
    } else if (stats.accuracy < 70) {
      weight *= config.weakAreaWeight;
    } else if (stats.accuracy > 90 && stats.totalAttempts >= 10) {
      weight *= config.masteredWeight;
    }

    // Difficulty progression bias
    weight *= getDifficultyMultiplier(q.difficulty, overallAccuracy, config);

    return { ...q, weight };
  });
}

/**
 * Calculate difficulty multiplier based on user's overall proficiency.
 *
 * Beginners (<50% accuracy): favor easy (1.5x easy, 1.0x medium, 0.5x hard)
 * Intermediate (50-75%): balanced (1.0x all)
 * Advanced (>75%): favor hard (0.5x easy, 1.0x medium, 1.5x hard)
 */
function getDifficultyMultiplier(
  difficulty: string,
  overallAccuracy: number,
  config: AdaptiveSelectionConfig
): number {
  if (overallAccuracy < config.beginnerThreshold) {
    // Beginner: favor easy
    if (difficulty === 'easy') return 1.5;
    if (difficulty === 'hard') return 0.5;
    return 1.0;
  }

  if (overallAccuracy > config.advancedThreshold) {
    // Advanced: favor hard
    if (difficulty === 'hard') return 1.5;
    if (difficulty === 'easy') return 0.5;
    return 1.0;
  }

  // Intermediate: balanced
  return 1.0;
}

/**
 * Weighted random sampling without replacement.
 * Uses reservoir-style selection with cumulative weights.
 */
function weightedRandomSample(candidates: CandidateQuestion[], count: number): number[] {
  const selected: number[] = [];
  const remaining = [...candidates];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    let selectedIdx = 0;
    for (let j = 0; j < remaining.length; j++) {
      random -= remaining[j].weight;
      if (random <= 0) {
        selectedIdx = j;
        break;
      }
    }

    selected.push(remaining[selectedIdx].id);
    remaining.splice(selectedIdx, 1);
  }

  return selected;
}

/**
 * Fallback: use SQL RANDOM() when adaptive pool is too small.
 */
async function fallbackRandomSelection(
  certificationId: number,
  domainIds: number[] | undefined,
  count: number
): Promise<number[]> {
  const conditions = [eq(schema.domains.certificationId, certificationId)];

  if (domainIds && domainIds.length > 0) {
    conditions.push(inArray(schema.questions.domainId, domainIds));
  }

  const rows = await db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .innerJoin(schema.domains, eq(schema.questions.domainId, schema.domains.id))
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(count)
    .all();

  return rows.map((r) => r.id);
}

// Export internals for testing
export const _testing = {
  applyWeights,
  getDifficultyMultiplier,
  weightedRandomSample,
  calculateOverallAccuracy,
  getCandidatePool,
  getRecentEncounterIds,
  getDomainStats,
  fallbackRandomSelection,
};
