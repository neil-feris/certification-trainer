/**
 * Readiness Projection Service
 *
 * Projects when a user will be exam-ready based on:
 * - Historical readiness snapshots (linear regression on scores over time)
 * - Study pace (completed sessions in last 30 days across exams, drills, flashcards)
 * - Certification passing threshold
 *
 * Returns ReadinessProjection with projected date, pace, improvement rate.
 * isProjectable = false when <3 data points or zero/negative improvement rate.
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { ReadinessProjection } from '@ace-prep/shared';

const MIN_DATA_POINTS = 3;
const SNAPSHOT_LOOKBACK_DAYS = 30;
const PACE_LOOKBACK_DAYS = 30;
const MAX_PROJECTION_DAYS = 365;

// ============================================================================
// Pure functions (exported for testing)
// ============================================================================

/**
 * Simple linear regression: y = mx + b
 * x = days since first snapshot, y = readiness score
 * Returns slope (points per day) and intercept.
 */
function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Project days remaining to reach target score from current score at given rate.
 * Returns null if rate is zero/negative or projection exceeds MAX_PROJECTION_DAYS.
 */
function projectDaysRemaining(
  currentScore: number,
  targetScore: number,
  improvementRate: number
): number | null {
  if (currentScore >= targetScore) return 0;
  if (improvementRate <= 0) return null;

  const days = Math.ceil((targetScore - currentScore) / improvementRate);
  if (days > MAX_PROJECTION_DAYS) return null;

  return days;
}

/**
 * Calculate required sessions per week to reach target by projected date.
 * Based on assumption: each study session contributes ~0.5 readiness points on average.
 */
function calculateRequiredPace(
  currentScore: number,
  targetScore: number,
  currentPace: number,
  improvementRate: number
): number {
  if (currentScore >= targetScore) return 0;
  if (improvementRate <= 0 || currentPace <= 0) return currentPace * 2 || 7; // suggest double pace or 7/week

  // If currently improving, required pace is proportional to the gap vs rate
  const pointsNeeded = targetScore - currentScore;
  const daysNeeded = pointsNeeded / improvementRate;
  const weeksNeeded = daysNeeded / 7;

  if (weeksNeeded <= 0) return currentPace;

  // Each session contributes: (weekly improvement) / (sessions per week)
  // Weekly improvement = improvementRate * 7
  const pointsPerSession = (improvementRate * 7) / currentPace;
  if (pointsPerSession <= 0) return currentPace * 2 || 7;

  // Required sessions = total points needed / points per session
  // Spread over available weeks, with 10% buffer
  const totalSessionsNeeded = pointsNeeded / pointsPerSession;
  return Math.ceil((totalSessionsNeeded / weeksNeeded) * 1.1);
}

// ============================================================================
// Database queries
// ============================================================================

/**
 * Fetch readiness snapshots for the last N days, ordered by date ascending.
 */
async function fetchSnapshots(
  userId: number,
  certificationId: number,
  lookbackDays: number
): Promise<{ overallScore: number; calculatedAt: Date }[]> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return db
    .select({
      overallScore: schema.readinessSnapshots.overallScore,
      calculatedAt: schema.readinessSnapshots.calculatedAt,
    })
    .from(schema.readinessSnapshots)
    .where(
      and(
        eq(schema.readinessSnapshots.userId, userId),
        eq(schema.readinessSnapshots.certificationId, certificationId),
        gte(schema.readinessSnapshots.calculatedAt, cutoff)
      )
    )
    .orderBy(schema.readinessSnapshots.calculatedAt)
    .all();
}

/**
 * Count completed study activities in last N days (exams + study sessions + flashcard sessions).
 */
async function fetchStudyActivityCount(
  userId: number,
  certificationId: number,
  lookbackDays: number
): Promise<number> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const examCount = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.exams)
    .where(
      and(
        eq(schema.exams.userId, userId),
        eq(schema.exams.certificationId, certificationId),
        eq(schema.exams.status, 'completed'),
        gte(schema.exams.completedAt, cutoff)
      )
    )
    .all();

  const studyCount = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        eq(schema.studySessions.certificationId, certificationId),
        eq(schema.studySessions.status, 'completed'),
        gte(schema.studySessions.completedAt, cutoff)
      )
    )
    .all();

  const flashcardCount = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.flashcardSessions)
    .where(
      and(
        eq(schema.flashcardSessions.userId, userId),
        eq(schema.flashcardSessions.certificationId, certificationId),
        eq(schema.flashcardSessions.status, 'completed'),
        gte(schema.flashcardSessions.completedAt, cutoff)
      )
    )
    .all();

  return (examCount[0]?.count ?? 0) + (studyCount[0]?.count ?? 0) + (flashcardCount[0]?.count ?? 0);
}

/**
 * Get passing score for a certification.
 */
async function fetchPassingScore(certificationId: number): Promise<number> {
  const cert = db
    .select({ passingScorePercent: schema.certifications.passingScorePercent })
    .from(schema.certifications)
    .where(eq(schema.certifications.id, certificationId))
    .all();

  return cert[0]?.passingScorePercent ?? 70;
}

// ============================================================================
// Main projection function
// ============================================================================

/**
 * Project when a user will be exam-ready based on historical readiness trends.
 *
 * Algorithm:
 * 1. Fetch readiness snapshots for last 30 days
 * 2. If <3 data points, return isProjectable: false
 * 3. Run linear regression on (days_since_first, score) pairs
 * 4. slope = improvement rate (points per day)
 * 5. If slope <= 0, return isProjectable: false (not improving)
 * 6. Project days to reach passing score, compute projected date
 * 7. Calculate study pace from completed sessions in last 30 days
 */
export async function projectReadiness(
  userId: number,
  certificationId: number
): Promise<ReadinessProjection> {
  const [snapshots, totalActivities, passingScore] = await Promise.all([
    fetchSnapshots(userId, certificationId, SNAPSHOT_LOOKBACK_DAYS),
    fetchStudyActivityCount(userId, certificationId, PACE_LOOKBACK_DAYS),
    fetchPassingScore(certificationId),
  ]);

  // Calculate current pace (sessions per week)
  const weeksInWindow = PACE_LOOKBACK_DAYS / 7;
  const currentPace = Math.round((totalActivities / weeksInWindow) * 10) / 10;

  // Insufficient data check
  if (snapshots.length < MIN_DATA_POINTS) {
    return {
      projectedReadyDate: null,
      currentPace,
      requiredPace: 0,
      improvementRate: 0,
      daysRemaining: null,
      isOnTrack: false,
      isProjectable: false,
    };
  }

  // Convert snapshots to regression points: x = days since first snapshot, y = score
  const firstTimestamp = snapshots[0].calculatedAt.getTime();
  const regressionPoints = snapshots.map((s) => ({
    x: (s.calculatedAt.getTime() - firstTimestamp) / (1000 * 60 * 60 * 24),
    y: s.overallScore,
  }));

  const { slope: improvementRate } = linearRegression(regressionPoints);

  // Current score = most recent snapshot
  const currentScore = snapshots[snapshots.length - 1].overallScore;

  // Already passing
  if (currentScore >= passingScore) {
    return {
      projectedReadyDate: null,
      currentPace,
      requiredPace: 0,
      improvementRate: Math.round(improvementRate * 100) / 100,
      daysRemaining: 0,
      isOnTrack: true,
      isProjectable: true,
    };
  }

  // Not improving — cannot project
  if (improvementRate <= 0) {
    return {
      projectedReadyDate: null,
      currentPace,
      requiredPace: calculateRequiredPace(currentScore, passingScore, currentPace, improvementRate),
      improvementRate: Math.round(improvementRate * 100) / 100,
      daysRemaining: null,
      isOnTrack: false,
      isProjectable: false,
    };
  }

  // Project forward
  const daysRemaining = projectDaysRemaining(currentScore, passingScore, improvementRate);
  const requiredPace = calculateRequiredPace(
    currentScore,
    passingScore,
    currentPace,
    improvementRate
  );

  let projectedReadyDate: string | null = null;
  if (daysRemaining !== null) {
    const projDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
    projectedReadyDate = projDate.toISOString().split('T')[0];
  }

  // On track if pace is sufficient and days remaining is reasonable
  const isOnTrack = daysRemaining !== null && currentPace >= requiredPace * 0.8;

  return {
    projectedReadyDate,
    currentPace,
    requiredPace,
    improvementRate: Math.round(improvementRate * 100) / 100,
    daysRemaining,
    isOnTrack,
    isProjectable: true,
  };
}

// Exported for unit testing of pure functions
export const _testing = {
  linearRegression,
  projectDaysRemaining,
  calculateRequiredPace,
  MIN_DATA_POINTS,
  MAX_PROJECTION_DAYS,
};
