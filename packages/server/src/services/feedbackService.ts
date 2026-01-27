import { db } from '../db/index.js';
import { questions, questionFeedback, questionReports } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import type { FeedbackRating, IssueType, QuestionFeedbackAggregates } from '@ace-prep/shared';

/**
 * Determine if a question should be flagged for review.
 * Flags when: >30% thumbs down (min 5 votes) OR 3+ reports
 */
export function shouldFlag(thumbsUp: number, thumbsDown: number, reportCount: number): boolean {
  const totalVotes = thumbsUp + thumbsDown;
  const thumbsDownRate = totalVotes >= 5 ? thumbsDown / totalVotes : 0;

  return thumbsDownRate > 0.3 || reportCount >= 3;
}

/**
 * Recalculate and update aggregate counts for a question.
 */
export async function recalculateAggregates(
  questionId: number
): Promise<QuestionFeedbackAggregates> {
  // Count thumbs up
  const [upResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questionFeedback)
    .where(and(eq(questionFeedback.questionId, questionId), eq(questionFeedback.rating, 'up')));

  // Count thumbs down
  const [downResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questionFeedback)
    .where(and(eq(questionFeedback.questionId, questionId), eq(questionFeedback.rating, 'down')));

  // Count reports
  const [reportResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questionReports)
    .where(eq(questionReports.questionId, questionId));

  const thumbsUp = upResult?.count ?? 0;
  const thumbsDown = downResult?.count ?? 0;
  const reportCount = reportResult?.count ?? 0;
  const isFlagged = shouldFlag(thumbsUp, thumbsDown, reportCount);

  // Update question with new aggregates
  await db
    .update(questions)
    .set({
      thumbsUpCount: thumbsUp,
      thumbsDownCount: thumbsDown,
      reportCount,
      isFlagged,
    })
    .where(eq(questions.id, questionId));

  return { thumbsUp, thumbsDown, reportCount, isFlagged };
}

/**
 * Submit or update a user's rating for a question.
 */
export async function submitRating(
  userId: number,
  questionId: number,
  rating: FeedbackRating
): Promise<QuestionFeedbackAggregates> {
  const now = new Date();

  // Upsert feedback
  await db
    .insert(questionFeedback)
    .values({
      userId,
      questionId,
      rating,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [questionFeedback.userId, questionFeedback.questionId],
      set: {
        rating,
        updatedAt: now,
      },
    });

  return recalculateAggregates(questionId);
}

/**
 * Remove a user's rating for a question.
 */
export async function removeRating(
  userId: number,
  questionId: number
): Promise<QuestionFeedbackAggregates> {
  await db
    .delete(questionFeedback)
    .where(and(eq(questionFeedback.userId, userId), eq(questionFeedback.questionId, questionId)));

  return recalculateAggregates(questionId);
}

/**
 * Submit or update a user's report for a question.
 */
export async function submitReport(
  userId: number,
  questionId: number,
  issueType: IssueType,
  comment?: string
): Promise<Pick<QuestionFeedbackAggregates, 'reportCount' | 'isFlagged'>> {
  const now = new Date();

  // Upsert report
  await db
    .insert(questionReports)
    .values({
      userId,
      questionId,
      issueType,
      comment: comment ?? null,
      status: 'pending',
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [questionReports.userId, questionReports.questionId],
      set: {
        issueType,
        comment: comment ?? null,
        status: 'pending',
      },
    });

  const aggregates = await recalculateAggregates(questionId);
  return { reportCount: aggregates.reportCount, isFlagged: aggregates.isFlagged };
}

/**
 * Get a user's current feedback for a question.
 */
export async function getUserFeedback(
  userId: number,
  questionId: number
): Promise<{
  rating: FeedbackRating | null;
  report: { issueType: IssueType; comment: string | null } | null;
}> {
  const [feedback] = await db
    .select()
    .from(questionFeedback)
    .where(and(eq(questionFeedback.userId, userId), eq(questionFeedback.questionId, questionId)));

  const [report] = await db
    .select()
    .from(questionReports)
    .where(and(eq(questionReports.userId, userId), eq(questionReports.questionId, questionId)));

  return {
    rating: (feedback?.rating as FeedbackRating) ?? null,
    report: report ? { issueType: report.issueType as IssueType, comment: report.comment } : null,
  };
}
