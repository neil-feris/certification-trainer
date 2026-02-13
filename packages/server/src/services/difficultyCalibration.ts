/**
 * Difficulty Calibration Service
 *
 * Recalculates question difficulty based on actual user performance
 * using Bayesian confidence scaling. As more users attempt a question,
 * the empirical difficulty gradually overrides the original label.
 */

import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Difficulty } from '@ace-prep/shared';

const MIN_ATTEMPTS_FOR_CALIBRATION = 5;

/**
 * Derive empirical difficulty label from correct-answer ratio.
 * >80% correct = easy, 50-80% = medium, <50% = hard
 */
function empiricalLabel(correctRatio: number): Difficulty {
  if (correctRatio > 0.8) return 'easy';
  if (correctRatio >= 0.5) return 'medium';
  return 'hard';
}

/**
 * Bayesian confidence score: 1 - 1/sqrt(sampleSize).
 * Grows from 0 toward 1 as sample size increases.
 */
function confidence(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return 1 - 1 / Math.sqrt(sampleSize);
}

/**
 * Numeric mapping for blending: easy=1, medium=2, hard=3
 */
const DIFFICULTY_NUMERIC: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

function difficultyToNumeric(d: string): number {
  return DIFFICULTY_NUMERIC[d] ?? 2;
}

function numericToDifficulty(n: number): Difficulty {
  if (n <= 1.5) return 'easy';
  if (n <= 2.5) return 'medium';
  return 'hard';
}

/**
 * Blend original and empirical difficulty using confidence weight.
 * blended = (1 - confidence) * original + confidence * empirical
 */
function blendDifficulty(original: string, empirical: Difficulty, conf: number): Difficulty {
  const origNum = difficultyToNumeric(original);
  const empNum = difficultyToNumeric(empirical);
  const blended = (1 - conf) * origNum + conf * empNum;
  return numericToDifficulty(blended);
}

/**
 * Record an attempt on a question. Increments attemptCount and
 * conditionally increments correctCount.
 */
export function updateQuestionStats(questionId: number, isCorrect: boolean): void {
  if (isCorrect) {
    db.update(schema.questions)
      .set({
        attemptCount: sql`${schema.questions.attemptCount} + 1`,
        correctCount: sql`${schema.questions.correctCount} + 1`,
      })
      .where(eq(schema.questions.id, questionId))
      .run();
  } else {
    db.update(schema.questions)
      .set({
        attemptCount: sql`${schema.questions.attemptCount} + 1`,
      })
      .where(eq(schema.questions.id, questionId))
      .run();
  }
}

/**
 * Check if a question has enough attempts for calibration,
 * and if so, compute and store the empirical difficulty.
 */
export function recalibrateIfReady(questionId: number): void {
  const [row] = db
    .select({
      difficulty: schema.questions.difficulty,
      attemptCount: schema.questions.attemptCount,
      correctCount: schema.questions.correctCount,
    })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId))
    .all();

  if (!row || row.attemptCount < MIN_ATTEMPTS_FOR_CALIBRATION) return;

  const correctRatio = row.correctCount / row.attemptCount;
  const emp = empiricalLabel(correctRatio);
  const conf = confidence(row.attemptCount);
  const blended = blendDifficulty(row.difficulty, emp, conf);

  db.update(schema.questions)
    .set({ empiricalDifficulty: blended })
    .where(eq(schema.questions.id, questionId))
    .run();
}

/**
 * Get the calibrated difficulty for a question.
 * Falls back to original difficulty if no calibration has been performed.
 */
export async function getCalibratedDifficulty(questionId: number): Promise<Difficulty> {
  const [row] = await db
    .select({
      difficulty: schema.questions.difficulty,
      empiricalDifficulty: schema.questions.empiricalDifficulty,
    })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId))
    .all();

  if (!row) return 'medium'; // fallback for missing question
  return (row.empiricalDifficulty as Difficulty) || (row.difficulty as Difficulty);
}

// Export internals for unit testing pure functions
export const _testing = {
  empiricalLabel,
  confidence,
  blendDifficulty,
  difficultyToNumeric,
  numericToDifficulty,
};
