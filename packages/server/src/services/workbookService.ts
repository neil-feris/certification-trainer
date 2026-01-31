import { db } from '../db/index.js';
import { questions, workbookProgress, domains, topics } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

export interface WorkbookQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: string;
  gcpServices: string[];
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
    gcpServices: r.question.gcpServices ? JSON.parse(r.question.gcpServices as string) : [],
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
  summary.percentComplete = Math.round(
    ((summary.mastered + summary.learned) / summary.total) * 100
  );

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
  // Get the question
  const [question] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.source, 'workbook')));

  if (!question) {
    throw new Error('Workbook question not found');
  }

  const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];
  const isCorrect =
    selectedAnswers.length === correctAnswers.length &&
    selectedAnswers.every((a) => correctAnswers.includes(a)) &&
    correctAnswers.every((a) => selectedAnswers.includes(a));

  // Get or create progress record
  const [existing] = await db
    .select()
    .from(workbookProgress)
    .where(and(eq(workbookProgress.userId, userId), eq(workbookProgress.questionId, questionId)));

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
    await db
      .update(workbookProgress)
      .set({
        attempts: existing.attempts + 1,
        lastAttemptCorrect: isCorrect,
        masteryLevel,
        lastAttemptAt: now,
      })
      .where(eq(workbookProgress.id, existing.id));
  } else {
    await db.insert(workbookProgress).values({
      userId,
      questionId,
      firstAttemptCorrect: isCorrect,
      attempts: 1,
      lastAttemptCorrect: isCorrect,
      masteryLevel,
      firstAttemptAt: now,
      lastAttemptAt: now,
    });
  }

  return {
    isCorrect,
    correctAnswers,
    explanation: question.explanation,
    masteryLevel,
    isFirstAttempt,
  };
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
