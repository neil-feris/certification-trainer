import { db } from '../db/index.js';
import { questions, workbookProgress, domains, topics, workbookResources } from '../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { WorkbookBenchmark, WorkbookBenchmarkTier, WorkbookResource } from '@ace-prep/shared';

export interface WorkbookQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: string;
  cloudServices: string[];
  domain: { id: number; code: string; name: string };
  topic: { id: number; code: string; name: string };
  orderIndex: number;
}

export interface WorkbookProgressSummary {
  total: number;
  mastered: number;
  learned: number;
  needsWork: number;
  unattempted: number;
  percentComplete: number;
}

export interface WorkbookQuestionWithProgress extends WorkbookQuestion {
  progress: {
    masteryLevel: 'unattempted' | 'needs_work' | 'learned' | 'mastered';
    attempts: number;
    firstAttemptCorrect: boolean | null;
    lastAttemptCorrect: boolean | null;
    lastAttemptAt: Date | null;
  };
}

/**
 * Get all workbook questions ordered by their original sequence
 */
export async function getWorkbookQuestions(): Promise<WorkbookQuestion[]> {
  const result = await db
    .select({
      question: questions,
      domain: domains,
      topic: topics,
    })
    .from(questions)
    .innerJoin(domains, eq(questions.domainId, domains.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .where(eq(questions.source, 'workbook'))
    .orderBy(questions.id); // Original insertion order

  return result.map((r, index) => ({
    id: r.question.id,
    questionText: r.question.questionText,
    questionType: r.question.questionType as 'single' | 'multiple',
    options: JSON.parse(r.question.options as string),
    correctAnswers: JSON.parse(r.question.correctAnswers as string),
    explanation: r.question.explanation,
    difficulty: r.question.difficulty,
    cloudServices: r.question.cloudServices ? JSON.parse(r.question.cloudServices as string) : [],
    domain: { id: r.domain.id, code: r.domain.code, name: r.domain.name },
    topic: { id: r.topic.id, code: r.topic.code, name: r.topic.name },
    orderIndex: index + 1,
  }));
}

/**
 * Get workbook questions with user progress
 */
export async function getWorkbookProgressForUser(userId: number): Promise<{
  questions: WorkbookQuestionWithProgress[];
  summary: WorkbookProgressSummary;
}> {
  const workbookQuestions = await getWorkbookQuestions();
  const questionIds = workbookQuestions.map((q) => q.id);

  // Get user progress for all workbook questions
  const progressRecords =
    questionIds.length > 0
      ? await db
          .select()
          .from(workbookProgress)
          .where(
            and(
              eq(workbookProgress.userId, userId),
              inArray(workbookProgress.questionId, questionIds)
            )
          )
      : [];

  const progressMap = new Map(progressRecords.map((p) => [p.questionId, p]));

  // Build questions with progress
  const questionsWithProgress: WorkbookQuestionWithProgress[] = workbookQuestions.map((q) => {
    const progress = progressMap.get(q.id);
    return {
      ...q,
      progress: {
        masteryLevel: progress?.masteryLevel ?? 'unattempted',
        attempts: progress?.attempts ?? 0,
        firstAttemptCorrect: progress?.firstAttemptCorrect ?? null,
        lastAttemptCorrect: progress?.lastAttemptCorrect ?? null,
        lastAttemptAt: progress?.lastAttemptAt ?? null,
      },
    };
  });

  // Calculate summary
  const summary: WorkbookProgressSummary = {
    total: workbookQuestions.length,
    mastered: questionsWithProgress.filter((q) => q.progress.masteryLevel === 'mastered').length,
    learned: questionsWithProgress.filter((q) => q.progress.masteryLevel === 'learned').length,
    needsWork: questionsWithProgress.filter((q) => q.progress.masteryLevel === 'needs_work').length,
    unattempted: questionsWithProgress.filter((q) => q.progress.masteryLevel === 'unattempted')
      .length,
    percentComplete: 0,
  };
  summary.percentComplete =
    summary.total > 0
      ? Math.round(((summary.mastered + summary.learned) / summary.total) * 100)
      : 0;

  return { questions: questionsWithProgress, summary };
}

/**
 * Submit an answer and update progress
 */
export async function submitWorkbookAnswer(
  userId: number,
  questionId: number,
  selectedAnswers: number[]
): Promise<{
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  masteryLevel: 'needs_work' | 'learned' | 'mastered';
  isFirstAttempt: boolean;
}> {
  // Wrap entire read-modify-write in synchronous transaction to prevent race conditions
  return db.transaction((tx) => {
    // Get the question
    const [question] = tx
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.source, 'workbook')))
      .all();

    if (!question) {
      throw new Error('Workbook question not found');
    }

    const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
    const isCorrect =
      selectedAnswers.length === correctAnswers.length &&
      selectedAnswers.every((a) => correctAnswers.includes(a)) &&
      correctAnswers.every((a) => selectedAnswers.includes(a));

    // Get or create progress record
    const [existing] = tx
      .select()
      .from(workbookProgress)
      .where(and(eq(workbookProgress.userId, userId), eq(workbookProgress.questionId, questionId)))
      .all();

    const isFirstAttempt = !existing || existing.attempts === 0;
    const now = new Date();

    // Calculate mastery level
    let masteryLevel: 'needs_work' | 'learned' | 'mastered';
    if (isFirstAttempt && isCorrect) {
      masteryLevel = 'mastered';
    } else if (!isFirstAttempt && isCorrect) {
      masteryLevel = 'learned';
    } else {
      masteryLevel = 'needs_work';
    }

    // Upsert progress
    if (existing) {
      tx.update(workbookProgress)
        .set({
          attempts: existing.attempts + 1,
          lastAttemptCorrect: isCorrect,
          masteryLevel,
          lastAttemptAt: now,
        })
        .where(eq(workbookProgress.id, existing.id))
        .run();
    } else {
      tx.insert(workbookProgress)
        .values({
          userId,
          questionId,
          firstAttemptCorrect: isCorrect,
          attempts: 1,
          lastAttemptCorrect: isCorrect,
          masteryLevel,
          firstAttemptAt: now,
          lastAttemptAt: now,
        })
        .run();
    }

    return {
      isCorrect,
      correctAnswers,
      explanation: question.explanation,
      masteryLevel,
      isFirstAttempt,
    };
  });
}

/**
 * Batch submit answers for assessment mode - single transaction for all answers
 * CRITICAL: Uses synchronous transaction per better-sqlite3 requirements
 */
export function submitWorkbookAnswersBatch(
  userId: number,
  responses: Array<{ questionId: number; selectedAnswers: number[] }>
): Array<{
  questionId: number;
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  masteryLevel: 'needs_work' | 'learned' | 'mastered';
  isFirstAttempt: boolean;
}> {
  return db.transaction((tx) => {
    const results: Array<{
      questionId: number;
      isCorrect: boolean;
      correctAnswers: number[];
      explanation: string;
      masteryLevel: 'needs_work' | 'learned' | 'mastered';
      isFirstAttempt: boolean;
    }> = [];

    // Batch fetch all questions upfront
    const questionIds = responses.map((r) => r.questionId);
    const questionRows = tx
      .select()
      .from(questions)
      .where(and(eq(questions.source, 'workbook'), inArray(questions.id, questionIds)))
      .all();

    const questionMap = new Map(questionRows.map((q) => [q.id, q]));

    // Batch fetch all existing progress records upfront
    const existingProgress = tx
      .select()
      .from(workbookProgress)
      .where(
        and(eq(workbookProgress.userId, userId), inArray(workbookProgress.questionId, questionIds))
      )
      .all();

    const progressMap = new Map(existingProgress.map((p) => [p.questionId, p]));

    const now = new Date();

    for (const response of responses) {
      const question = questionMap.get(response.questionId);
      if (!question) {
        throw new Error(`Workbook question not found: ${response.questionId}`);
      }

      const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
      const isCorrect =
        response.selectedAnswers.length === correctAnswers.length &&
        response.selectedAnswers.every((a) => correctAnswers.includes(a)) &&
        correctAnswers.every((a) => response.selectedAnswers.includes(a));

      const existing = progressMap.get(response.questionId);
      const isFirstAttempt = !existing || existing.attempts === 0;

      // Calculate mastery level
      let masteryLevel: 'needs_work' | 'learned' | 'mastered';
      if (isFirstAttempt && isCorrect) {
        masteryLevel = 'mastered';
      } else if (!isFirstAttempt && isCorrect) {
        masteryLevel = 'learned';
      } else {
        masteryLevel = 'needs_work';
      }

      // Upsert progress
      if (existing) {
        tx.update(workbookProgress)
          .set({
            attempts: existing.attempts + 1,
            lastAttemptCorrect: isCorrect,
            masteryLevel,
            lastAttemptAt: now,
          })
          .where(eq(workbookProgress.id, existing.id))
          .run();

        // Update map for potential duplicate questionIds in same batch
        progressMap.set(response.questionId, {
          ...existing,
          attempts: existing.attempts + 1,
          lastAttemptCorrect: isCorrect,
          masteryLevel,
          lastAttemptAt: now,
        });
      } else {
        tx.insert(workbookProgress)
          .values({
            userId,
            questionId: response.questionId,
            firstAttemptCorrect: isCorrect,
            attempts: 1,
            lastAttemptCorrect: isCorrect,
            masteryLevel,
            firstAttemptAt: now,
            lastAttemptAt: now,
          })
          .run();

        // Add to map for potential duplicate questionIds in same batch
        progressMap.set(response.questionId, {
          id: -1, // Placeholder, not used
          userId,
          questionId: response.questionId,
          firstAttemptCorrect: isCorrect,
          attempts: 1,
          lastAttemptCorrect: isCorrect,
          masteryLevel,
          firstAttemptAt: now,
          lastAttemptAt: now,
        });
      }

      results.push({
        questionId: response.questionId,
        isCorrect,
        correctAnswers,
        explanation: question.explanation,
        masteryLevel,
        isFirstAttempt,
      });
    }

    return results;
  });
}

/**
 * Reset all workbook progress for a user
 */
export async function resetWorkbookProgress(userId: number): Promise<void> {
  await db.delete(workbookProgress).where(eq(workbookProgress.userId, userId));
}

/**
 * Get random workbook questions for assessment
 */
export async function getAssessmentQuestions(
  userId: number,
  count: number,
  weightNonMastered: boolean = true
): Promise<WorkbookQuestion[]> {
  const workbookQuestions = await getWorkbookQuestions();

  if (!weightNonMastered) {
    // Simple random selection
    const shuffled = [...workbookQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Get progress to weight non-mastered questions
  const { questions: questionsWithProgress } = await getWorkbookProgressForUser(userId);

  // Separate by mastery
  const nonMastered = questionsWithProgress.filter((q) => q.progress.masteryLevel !== 'mastered');
  const mastered = questionsWithProgress.filter((q) => q.progress.masteryLevel === 'mastered');

  // Shuffle both arrays
  const shuffledNonMastered = [...nonMastered].sort(() => Math.random() - 0.5);
  const shuffledMastered = [...mastered].sort(() => Math.random() - 0.5);

  // Take 70% from non-mastered if available
  const nonMasteredCount = Math.min(Math.ceil(count * 0.7), shuffledNonMastered.length);
  const masteredCount = count - nonMasteredCount;

  const selected = [
    ...shuffledNonMastered.slice(0, nonMasteredCount),
    ...shuffledMastered.slice(0, masteredCount),
  ];

  // Final shuffle
  return selected.sort(() => Math.random() - 0.5);
}

/**
 * Get the next unanswered question for guided study
 */
export async function getNextGuidedQuestion(userId: number): Promise<{
  question: WorkbookQuestionWithProgress | null;
  currentIndex: number;
  totalQuestions: number;
}> {
  const { questions } = await getWorkbookProgressForUser(userId);

  // Find first unattempted question
  const nextIndex = questions.findIndex((q) => q.progress.masteryLevel === 'unattempted');

  return {
    question: nextIndex >= 0 ? questions[nextIndex] : null,
    currentIndex: nextIndex >= 0 ? nextIndex + 1 : questions.length,
    totalQuestions: questions.length,
  };
}

/**
 * Calculate percentile tier based on user's percentile
 */
function calculateTier(percentile: number): WorkbookBenchmarkTier {
  if (percentile >= 90) return 'top_10';
  if (percentile >= 75) return 'top_25';
  if (percentile >= 50) return 'above_average';
  if (percentile >= 25) return 'average';
  return 'below_average';
}

/**
 * Calculate median from an array of numbers
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Get workbook benchmark comparison data for a user
 */
export async function getWorkbookBenchmark(userId: number): Promise<WorkbookBenchmark> {
  // Get all workbook question IDs
  const workbookQuestions = await getWorkbookQuestions();
  const totalQuestions = workbookQuestions.length;
  const questionIds = workbookQuestions.map((q) => q.id);

  // Get user's progress
  const userProgress =
    questionIds.length > 0
      ? await db
          .select()
          .from(workbookProgress)
          .where(
            and(
              eq(workbookProgress.userId, userId),
              inArray(workbookProgress.questionId, questionIds)
            )
          )
      : [];

  // Calculate user stats
  const mastered = userProgress.filter((p) => p.masteryLevel === 'mastered').length;
  const learned = userProgress.filter((p) => p.masteryLevel === 'learned').length;
  const firstAttemptCorrectCount = userProgress.filter(
    (p) => p.firstAttemptCorrect === true
  ).length;
  const attemptedCount = userProgress.filter((p) => p.attempts > 0).length;
  const userFirstAttemptAccuracy =
    attemptedCount > 0 ? (firstAttemptCorrectCount / attemptedCount) * 100 : 0;

  // Get aggregate stats from all users (excluding current user)
  // Query: for each user, calculate their first-attempt accuracy
  const allUserStats =
    questionIds.length > 0
      ? await db
          .select({
            usrId: workbookProgress.userId,
            firstCorrectCount: sql<number>`SUM(CASE WHEN ${workbookProgress.firstAttemptCorrect} = 1 THEN 1 ELSE 0 END)`,
            attemptedCount: sql<number>`SUM(CASE WHEN ${workbookProgress.attempts} > 0 THEN 1 ELSE 0 END)`,
          })
          .from(workbookProgress)
          .where(inArray(workbookProgress.questionId, questionIds))
          .groupBy(workbookProgress.userId)
      : [];

  // Calculate first-attempt accuracy for each user who has attempted at least one question
  const userAccuracies = allUserStats
    .filter((u) => u.attemptedCount > 0)
    .map((u) => (u.firstCorrectCount / u.attemptedCount) * 100);

  // Calculate benchmarks
  const averageFirstAttemptAccuracy =
    userAccuracies.length > 0
      ? userAccuracies.reduce((sum, val) => sum + val, 0) / userAccuracies.length
      : 0;

  const medianFirstAttemptAccuracy = calculateMedian(userAccuracies);

  // Top quartile threshold (75th percentile)
  const sortedAccuracies = [...userAccuracies].sort((a, b) => a - b);
  const topQuartileIndex = Math.floor(sortedAccuracies.length * 0.75);
  const topQuartileThreshold =
    sortedAccuracies.length > 0
      ? (sortedAccuracies[topQuartileIndex] ?? sortedAccuracies[sortedAccuracies.length - 1])
      : 0;

  // Calculate user's percentile
  // Percentile = percentage of users the current user scored higher than
  let percentile = 50; // Default to 50th percentile if no other users or user hasn't attempted
  if (attemptedCount > 0 && userAccuracies.length > 0) {
    const usersBelow = userAccuracies.filter((acc) => acc < userFirstAttemptAccuracy).length;
    percentile = Math.round((usersBelow / userAccuracies.length) * 100);
  } else if (attemptedCount === 0) {
    // User hasn't attempted any questions, below average
    percentile = 0;
  }

  const tier = calculateTier(percentile);

  return {
    userStats: {
      total: totalQuestions,
      mastered,
      learned,
      firstAttemptAccuracy: Math.round(userFirstAttemptAccuracy * 10) / 10, // 1 decimal place
    },
    benchmarks: {
      averageFirstAttemptAccuracy: Math.round(averageFirstAttemptAccuracy * 10) / 10,
      medianFirstAttemptAccuracy: Math.round(medianFirstAttemptAccuracy * 10) / 10,
      topQuartileThreshold: Math.round(topQuartileThreshold * 10) / 10,
    },
    tier,
    percentile,
  };
}

/**
 * Get learning resources for a list of GCP services
 */
export async function getResourcesByServices(cloudServices: string[]): Promise<WorkbookResource[]> {
  if (cloudServices.length === 0) return [];

  const resources = await db
    .select()
    .from(workbookResources)
    .where(inArray(workbookResources.gcpService, cloudServices));

  return resources.map((r) => ({
    gcpService: r.gcpService,
    courses: r.courses ? JSON.parse(r.courses) : [],
    skillBadges: r.skillBadges ? JSON.parse(r.skillBadges) : [],
    documentationLinks: r.documentationLinks ? JSON.parse(r.documentationLinks) : [],
  }));
}
