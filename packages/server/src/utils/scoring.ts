/**
 * Exam scoring utilities.
 * Centralized logic for answer checking and score calculation.
 */

/**
 * Checks if selected answers match the correct answers exactly.
 * Handles both single and multiple choice questions.
 * Order-independent comparison (set equality).
 */
export function checkAnswerCorrect(
  selectedAnswers: number[],
  correctAnswers: number[]
): boolean {
  if (selectedAnswers.length !== correctAnswers.length) {
    return false;
  }

  // Check if all selected answers are in correct answers and vice versa
  return (
    selectedAnswers.every((a) => correctAnswers.includes(a)) &&
    correctAnswers.every((a) => selectedAnswers.includes(a))
  );
}

/**
 * Calculates exam score as a percentage.
 * @param correctCount Number of correct answers
 * @param totalCount Total number of questions
 * @returns Percentage score (0-100)
 */
export function calculateExamScore(
  correctCount: number,
  totalCount: number
): number {
  if (totalCount === 0) {
    return 0;
  }
  return (correctCount / totalCount) * 100;
}

/**
 * Determines pass/fail status based on score.
 * ACE exam passing threshold is 70%.
 */
export const PASSING_THRESHOLD = 70;

export function isPassing(score: number): boolean {
  return score >= PASSING_THRESHOLD;
}

/**
 * Calculates accuracy from response data.
 * @param responses Array of responses with isCorrect boolean
 * @returns Accuracy percentage (0-100)
 */
export function calculateAccuracy(
  responses: { isCorrect: boolean | null }[]
): number {
  const answered = responses.filter((r) => r.isCorrect !== null);
  if (answered.length === 0) {
    return 0;
  }
  const correct = answered.filter((r) => r.isCorrect === true).length;
  return (correct / answered.length) * 100;
}

/**
 * Calculates domain-wise performance from responses.
 */
export interface DomainPerformance {
  domainId: number;
  correct: number;
  total: number;
  percentage: number;
}

export function calculateDomainPerformance(
  responses: { domainId: number; isCorrect: boolean | null }[]
): DomainPerformance[] {
  const stats: Record<number, { correct: number; total: number }> = {};

  for (const response of responses) {
    if (!stats[response.domainId]) {
      stats[response.domainId] = { correct: 0, total: 0 };
    }
    stats[response.domainId].total++;
    if (response.isCorrect === true) {
      stats[response.domainId].correct++;
    }
  }

  return Object.entries(stats).map(([domainId, { correct, total }]) => ({
    domainId: Number(domainId),
    correct,
    total,
    percentage: total > 0 ? (correct / total) * 100 : 0,
  }));
}
