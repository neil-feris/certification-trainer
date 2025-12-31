/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Quality ratings:
 * - again (0): Complete failure, reset progress
 * - hard (3): Correct but difficult
 * - good (4): Correct with some effort
 * - easy (5): Effortless recall
 */

export type ReviewQuality = 'again' | 'hard' | 'good' | 'easy';

interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

const QUALITY_MAP: Record<ReviewQuality, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export function calculateNextReview(
  quality: ReviewQuality,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number
): SM2Result {
  const q = QUALITY_MAP[quality];
  let easeFactor = currentEaseFactor;
  let interval: number;
  let repetitions: number;

  if (q < 3) {
    // Failed - reset to beginning
    repetitions = 0;
    interval = 1;
  } else {
    // Success - advance
    repetitions = currentRepetitions + 1;

    if (repetitions === 1) {
      interval = 1; // Review again tomorrow
    } else if (repetitions === 2) {
      interval = 6; // Review in 6 days
    } else {
      // Multiply previous interval by ease factor
      interval = Math.round(currentInterval * easeFactor);
    }
  }

  // Update ease factor based on performance
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  // Enforce minimum ease factor
  easeFactor = Math.max(1.3, easeFactor);

  // Calculate next review date
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    interval,
    repetitions,
    nextReviewAt,
  };
}

/**
 * Get suggested daily review count based on workload
 */
export function getDailyReviewCount(
  totalDueCards: number,
  targetDailyMinutes: number = 30,
  avgSecondsPerCard: number = 30
): number {
  const maxCardsInTime = Math.floor((targetDailyMinutes * 60) / avgSecondsPerCard);
  return Math.min(totalDueCards, maxCardsInTime, 50); // Cap at 50 cards
}

/**
 * Calculate study streak from exam history
 */
export function calculateStreak(examDates: Date[]): number {
  if (examDates.length === 0) return 0;

  const sortedDates = examDates.map((d) => new Date(d)).sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let currentDate = today;

  for (const examDate of sortedDates) {
    const examDay = new Date(examDate);
    examDay.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (currentDate.getTime() - examDay.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      currentDate = examDay;
    } else if (diffDays > 1) {
      break;
    }
  }

  return streak;
}
