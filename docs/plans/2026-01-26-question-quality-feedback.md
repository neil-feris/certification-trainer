# Question Quality Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to rate questions with thumbs up/down and report issues, with auto-flagging of problematic questions.

**Architecture:** Two new database tables (`question_feedback`, `question_reports`) plus denormalized aggregate columns on `questions` table. Four new API endpoints. Two new React components integrated into existing question views.

**Tech Stack:** Drizzle ORM, Fastify, React, TanStack Query, Zod validation

---

## Task 1: Database Schema - Add Tables and Columns

**Files:**
- Modify: `packages/server/src/db/schema.ts`

**Step 1: Add question_feedback table**

Add after the `userNotes` table definition (around line 527):

```typescript
// ============ QUESTION FEEDBACK ============
export const questionFeedback = sqliteTable(
  'question_feedback',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    rating: text('rating'), // 'up' | 'down' | null
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('question_feedback_user_question_idx').on(table.userId, table.questionId),
    index('question_feedback_question_idx').on(table.questionId),
  ]
);

export const questionReports = sqliteTable(
  'question_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    issueType: text('issue_type').notNull(), // 'wrong_answer' | 'unclear' | 'outdated' | 'other'
    comment: text('comment'),
    status: text('status').notNull().default('pending'), // 'pending' | 'reviewed' | 'resolved'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('question_reports_user_question_idx').on(table.userId, table.questionId),
    index('question_reports_question_idx').on(table.questionId),
    index('question_reports_status_idx').on(table.status),
  ]
);
```

**Step 2: Add aggregate columns to questions table**

Modify the `questions` table (around line 99) to add these columns after `isGenerated`:

```typescript
    thumbsUpCount: integer('thumbs_up_count').notNull().default(0),
    thumbsDownCount: integer('thumbs_down_count').notNull().default(0),
    reportCount: integer('report_count').notNull().default(0),
    isFlagged: integer('is_flagged', { mode: 'boolean' }).notNull().default(false),
```

**Step 3: Add type exports**

Add at the end of the file with other type exports:

```typescript
export type QuestionFeedbackRecord = typeof questionFeedback.$inferSelect;
export type NewQuestionFeedback = typeof questionFeedback.$inferInsert;
export type QuestionReportRecord = typeof questionReports.$inferSelect;
export type NewQuestionReport = typeof questionReports.$inferInsert;
```

**Step 4: Run build to verify schema compiles**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/server`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts
git commit -m "feat(db): add question feedback and reports tables

- Add question_feedback table for thumbs up/down ratings
- Add question_reports table for issue reporting
- Add aggregate columns to questions table (thumbsUpCount, thumbsDownCount, reportCount, isFlagged)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Database Migration

**Files:**
- Create: `packages/server/src/db/migrations/add-question-feedback.sql`

**Step 1: Create migration file**

```sql
-- Add question feedback tables and columns
-- Migration: add-question-feedback

-- Add aggregate columns to questions table
ALTER TABLE questions ADD COLUMN thumbs_up_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN thumbs_down_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN is_flagged INTEGER NOT NULL DEFAULT 0;

-- Create question_feedback table
CREATE TABLE IF NOT EXISTS question_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  rating TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS question_feedback_user_question_idx ON question_feedback(user_id, question_id);
CREATE INDEX IF NOT EXISTS question_feedback_question_idx ON question_feedback(question_id);

-- Create question_reports table
CREATE TABLE IF NOT EXISTS question_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS question_reports_user_question_idx ON question_reports(user_id, question_id);
CREATE INDEX IF NOT EXISTS question_reports_question_idx ON question_reports(question_id);
CREATE INDEX IF NOT EXISTS question_reports_status_idx ON question_reports(status);
```

**Step 2: Run migration**

Run: `cd /workspace/.worktrees/question-feedback && sqlite3 data/ace-prep.db < packages/server/src/db/migrations/add-question-feedback.sql`
Expected: No errors

**Step 3: Verify tables exist**

Run: `sqlite3 data/ace-prep.db ".schema question_feedback"`
Expected: Shows table schema

**Step 4: Commit**

```bash
git add packages/server/src/db/migrations/add-question-feedback.sql
git commit -m "chore(db): add migration for question feedback tables

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add feedback types**

Add these types to the shared types file:

```typescript
// ============ QUESTION FEEDBACK ============

export type FeedbackRating = 'up' | 'down';

export type IssueType = 'wrong_answer' | 'unclear' | 'outdated' | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export interface QuestionFeedbackAggregates {
  thumbsUp: number;
  thumbsDown: number;
  reportCount: number;
  isFlagged: boolean;
}

export interface SubmitFeedbackRequest {
  rating: FeedbackRating;
}

export interface SubmitFeedbackResponse {
  success: boolean;
  userRating: FeedbackRating;
  aggregates: QuestionFeedbackAggregates;
}

export interface DeleteFeedbackResponse {
  success: boolean;
  aggregates: QuestionFeedbackAggregates;
}

export interface SubmitReportRequest {
  issueType: IssueType;
  comment?: string;
}

export interface SubmitReportResponse {
  success: boolean;
  aggregates: Pick<QuestionFeedbackAggregates, 'reportCount' | 'isFlagged'>;
}

export interface UserFeedbackResponse {
  rating: FeedbackRating | null;
  report: {
    issueType: IssueType;
    comment: string | null;
  } | null;
}
```

**Step 2: Build shared package**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/shared`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add question feedback types

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Validation Schemas

**Files:**
- Modify: `packages/server/src/validation/schemas.ts`

**Step 1: Add feedback validation schemas**

Add these schemas:

```typescript
export const feedbackRatingSchema = z.object({
  rating: z.enum(['up', 'down']),
});

export const reportIssueSchema = z.object({
  issueType: z.enum(['wrong_answer', 'unclear', 'outdated', 'other']),
  comment: z.string().max(1000).optional(),
});
```

**Step 2: Build server to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/server`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/server/src/validation/schemas.ts
git commit -m "feat(validation): add feedback and report schemas

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Feedback Service - Core Logic

**Files:**
- Create: `packages/server/src/services/feedbackService.ts`
- Create: `packages/server/src/services/feedbackService.test.ts`

**Step 1: Write test for shouldFlag function**

Create test file:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldFlag } from './feedbackService.js';

describe('shouldFlag', () => {
  it('returns false when total votes < 5', () => {
    expect(shouldFlag(3, 1, 0)).toBe(false);
  });

  it('returns false when thumbs down rate <= 30%', () => {
    expect(shouldFlag(7, 3, 0)).toBe(false); // 30% exactly
  });

  it('returns true when thumbs down rate > 30% with 5+ votes', () => {
    expect(shouldFlag(3, 3, 0)).toBe(true); // 50%
  });

  it('returns true when report count >= 3', () => {
    expect(shouldFlag(10, 0, 3)).toBe(true);
  });

  it('returns true when both conditions met', () => {
    expect(shouldFlag(2, 3, 5)).toBe(true);
  });

  it('returns false with zero votes and zero reports', () => {
    expect(shouldFlag(0, 0, 0)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /workspace/.worktrees/question-feedback && npm test -w @ace-prep/server -- --run src/services/feedbackService.test.ts`
Expected: FAIL - module not found

**Step 3: Implement feedbackService**

Create the service file:

```typescript
import { db } from '../db/index.js';
import { questions, questionFeedback, questionReports } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import type {
  FeedbackRating,
  IssueType,
  QuestionFeedbackAggregates,
} from '@ace-prep/shared';

/**
 * Determine if a question should be flagged for review.
 * Flags when: >30% thumbs down (min 5 votes) OR 3+ reports
 */
export function shouldFlag(
  thumbsUp: number,
  thumbsDown: number,
  reportCount: number
): boolean {
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
    .where(
      and(eq(questionFeedback.userId, userId), eq(questionFeedback.questionId, questionId))
    );

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
    .where(
      and(eq(questionFeedback.userId, userId), eq(questionFeedback.questionId, questionId))
    );

  const [report] = await db
    .select()
    .from(questionReports)
    .where(
      and(eq(questionReports.userId, userId), eq(questionReports.questionId, questionId))
    );

  return {
    rating: (feedback?.rating as FeedbackRating) ?? null,
    report: report
      ? { issueType: report.issueType as IssueType, comment: report.comment }
      : null,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /workspace/.worktrees/question-feedback && npm test -w @ace-prep/server -- --run src/services/feedbackService.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/server/src/services/feedbackService.ts packages/server/src/services/feedbackService.test.ts
git commit -m "feat(server): add feedback service with flagging logic

- shouldFlag() determines if question needs review
- submitRating() handles thumbs up/down
- submitReport() handles issue reports
- recalculateAggregates() updates denormalized counts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: API Endpoints

**Files:**
- Modify: `packages/server/src/routes/questions.ts`

**Step 1: Add imports**

Add to existing imports:

```typescript
import { questionFeedback, questionReports } from '../db/schema.js';
import { feedbackRatingSchema, reportIssueSchema } from '../validation/schemas.js';
import {
  submitRating,
  removeRating,
  submitReport,
  getUserFeedback,
} from '../services/feedbackService.js';
import type {
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
  DeleteFeedbackResponse,
  SubmitReportRequest,
  SubmitReportResponse,
  UserFeedbackResponse,
} from '@ace-prep/shared';
```

**Step 2: Add feedback endpoints**

Add these routes at the end of the `questionRoutes` function (before the closing brace):

```typescript
  // ============ QUESTION FEEDBACK ENDPOINTS ============

  // Get user's feedback for a question
  fastify.get<{ Params: { id: string } }>('/:id/feedback', async (request, reply) => {
    const parseResult = idParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const questionId = parseResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const feedback = await getUserFeedback(userId, questionId);
    const response: UserFeedbackResponse = feedback;
    return response;
  });

  // Submit or update rating
  fastify.post<{ Params: { id: string }; Body: SubmitFeedbackRequest }>(
    '/:id/feedback',
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send(formatZodError(paramResult.error));
      }
      const bodyResult = feedbackRatingSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(formatZodError(bodyResult.error));
      }

      const questionId = paramResult.data.id;
      const userId = parseInt(request.user!.id, 10);
      const { rating } = bodyResult.data;

      const aggregates = await submitRating(userId, questionId, rating);

      const response: SubmitFeedbackResponse = {
        success: true,
        userRating: rating,
        aggregates,
      };
      return response;
    }
  );

  // Remove rating
  fastify.delete<{ Params: { id: string } }>('/:id/feedback', async (request, reply) => {
    const parseResult = idParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const questionId = parseResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const aggregates = await removeRating(userId, questionId);

    const response: DeleteFeedbackResponse = {
      success: true,
      aggregates,
    };
    return response;
  });

  // Submit issue report
  fastify.post<{ Params: { id: string }; Body: SubmitReportRequest }>(
    '/:id/report',
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send(formatZodError(paramResult.error));
      }
      const bodyResult = reportIssueSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send(formatZodError(bodyResult.error));
      }

      const questionId = paramResult.data.id;
      const userId = parseInt(request.user!.id, 10);
      const { issueType, comment } = bodyResult.data;

      const aggregates = await submitReport(userId, questionId, issueType, comment);

      const response: SubmitReportResponse = {
        success: true,
        aggregates,
      };
      return response;
    }
  );
```

**Step 3: Build server to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/server`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `cd /workspace/.worktrees/question-feedback && npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/server/src/routes/questions.ts
git commit -m "feat(api): add question feedback endpoints

- GET /:id/feedback - get user's current feedback
- POST /:id/feedback - submit/update rating
- DELETE /:id/feedback - remove rating
- POST /:id/report - submit issue report

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Client API Methods

**Files:**
- Modify: `packages/client/src/api/client.ts`

**Step 1: Add feedback API methods**

Add these methods to the appropriate section of the API client:

```typescript
// Question Feedback
export const feedbackApi = {
  getUserFeedback: async (questionId: number): Promise<UserFeedbackResponse> => {
    const response = await api.get(`/questions/${questionId}/feedback`);
    return response.data;
  },

  submitRating: async (
    questionId: number,
    rating: 'up' | 'down'
  ): Promise<SubmitFeedbackResponse> => {
    const response = await api.post(`/questions/${questionId}/feedback`, { rating });
    return response.data;
  },

  removeRating: async (questionId: number): Promise<DeleteFeedbackResponse> => {
    const response = await api.delete(`/questions/${questionId}/feedback`);
    return response.data;
  },

  submitReport: async (
    questionId: number,
    issueType: 'wrong_answer' | 'unclear' | 'outdated' | 'other',
    comment?: string
  ): Promise<SubmitReportResponse> => {
    const response = await api.post(`/questions/${questionId}/report`, {
      issueType,
      comment,
    });
    return response.data;
  },
};
```

**Step 2: Add imports**

Add to the imports at the top:

```typescript
import type {
  UserFeedbackResponse,
  SubmitFeedbackResponse,
  DeleteFeedbackResponse,
  SubmitReportResponse,
} from '@ace-prep/shared';
```

**Step 3: Build client to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/api/client.ts
git commit -m "feat(client): add feedback API methods

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: QuestionFeedback Component

**Files:**
- Create: `packages/client/src/components/common/QuestionFeedback.tsx`
- Create: `packages/client/src/components/common/QuestionFeedback.module.css`

**Step 1: Create CSS module**

```css
.container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
}

.ratingButtons {
  display: flex;
  gap: 0.5rem;
}

.ratingButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 1rem;
}

.ratingButton:hover {
  background: var(--surface-hover);
}

.ratingButton.up.active {
  background: var(--success-light);
  border-color: var(--success);
  color: var(--success);
}

.ratingButton.down.active {
  background: var(--error-light);
  border-color: var(--error);
  color: var(--error);
}

.reportLink {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-decoration: underline;
  cursor: pointer;
  margin-left: 0.5rem;
}

.reportLink:hover {
  color: var(--text-primary);
}

.reported {
  font-size: 0.75rem;
  color: var(--warning);
}

.loading {
  opacity: 0.5;
  pointer-events: none;
}
```

**Step 2: Create component**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '../../api/client';
import { ReportIssueModal } from './ReportIssueModal';
import styles from './QuestionFeedback.module.css';

interface QuestionFeedbackProps {
  questionId: number;
  className?: string;
}

export function QuestionFeedback({ questionId, className }: QuestionFeedbackProps) {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['questionFeedback', questionId],
    queryFn: () => feedbackApi.getUserFeedback(questionId),
  });

  const submitRatingMutation = useMutation({
    mutationFn: (rating: 'up' | 'down') => feedbackApi.submitRating(questionId, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
    },
  });

  const removeRatingMutation = useMutation({
    mutationFn: () => feedbackApi.removeRating(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
    },
  });

  const handleRatingClick = (rating: 'up' | 'down') => {
    if (feedback?.rating === rating) {
      // Toggle off
      removeRatingMutation.mutate();
    } else {
      submitRatingMutation.mutate(rating);
    }
  };

  const isPending = submitRatingMutation.isPending || removeRatingMutation.isPending;

  return (
    <div className={`${styles.container} ${className ?? ''} ${isPending ? styles.loading : ''}`}>
      <div className={styles.ratingButtons}>
        <button
          className={`${styles.ratingButton} ${styles.up} ${feedback?.rating === 'up' ? styles.active : ''}`}
          onClick={() => handleRatingClick('up')}
          disabled={isPending || isLoading}
          title="Helpful question"
          aria-label="Thumbs up"
        >
          👍
        </button>
        <button
          className={`${styles.ratingButton} ${styles.down} ${feedback?.rating === 'down' ? styles.active : ''}`}
          onClick={() => handleRatingClick('down')}
          disabled={isPending || isLoading}
          title="Not helpful"
          aria-label="Thumbs down"
        >
          👎
        </button>
      </div>

      {feedback?.report ? (
        <span className={styles.reported}>Issue reported</span>
      ) : (
        <button
          className={styles.reportLink}
          onClick={() => setIsReportModalOpen(true)}
        >
          Report issue
        </button>
      )}

      <ReportIssueModal
        questionId={questionId}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        existingReport={feedback?.report ?? undefined}
      />
    </div>
  );
}
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build fails (ReportIssueModal doesn't exist yet - expected)

**Step 4: Commit partial progress**

```bash
git add packages/client/src/components/common/QuestionFeedback.tsx packages/client/src/components/common/QuestionFeedback.module.css
git commit -m "feat(client): add QuestionFeedback component (WIP)

Thumbs up/down component for rating questions.
ReportIssueModal integration pending.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: ReportIssueModal Component

**Files:**
- Create: `packages/client/src/components/common/ReportIssueModal.tsx`
- Create: `packages/client/src/components/common/ReportIssueModal.module.css`

**Step 1: Create CSS module**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface);
  border-radius: 0.5rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.option input {
  cursor: pointer;
}

.option label {
  cursor: pointer;
}

.commentSection {
  margin-bottom: 1rem;
}

.commentLabel {
  display: block;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.commentInput {
  width: 100%;
  min-height: 80px;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
}

.commentInput:focus {
  outline: none;
  border-color: var(--primary);
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.error {
  color: var(--error);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
```

**Step 2: Create component**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '../../api/client';
import type { IssueType } from '@ace-prep/shared';
import styles from './ReportIssueModal.module.css';

interface ReportIssueModalProps {
  questionId: number;
  isOpen: boolean;
  onClose: () => void;
  existingReport?: { issueType: IssueType; comment: string | null };
}

const ISSUE_TYPES: { value: IssueType; label: string }[] = [
  { value: 'wrong_answer', label: 'Wrong answer marked correct' },
  { value: 'unclear', label: 'Question is unclear' },
  { value: 'outdated', label: 'Content is outdated' },
  { value: 'other', label: 'Other issue' },
];

export function ReportIssueModal({
  questionId,
  isOpen,
  onClose,
  existingReport,
}: ReportIssueModalProps) {
  const [issueType, setIssueType] = useState<IssueType>(
    existingReport?.issueType ?? 'wrong_answer'
  );
  const [comment, setComment] = useState(existingReport?.comment ?? '');
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackApi.submitReport(questionId, issueType, comment || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
      onClose();
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Report an Issue</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.options}>
            {ISSUE_TYPES.map((type) => (
              <label key={type.value} className={styles.option}>
                <input
                  type="radio"
                  name="issueType"
                  value={type.value}
                  checked={issueType === type.value}
                  onChange={() => setIssueType(type.value)}
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>

          <div className={styles.commentSection}>
            <label className={styles.commentLabel}>
              Add details (optional)
            </label>
            <textarea
              className={styles.commentInput}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe the issue..."
              maxLength={1000}
            />
          </div>

          {submitMutation.isError && (
            <div className={styles.error}>
              Failed to submit report. Please try again.
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/common/ReportIssueModal.tsx packages/client/src/components/common/ReportIssueModal.module.css
git commit -m "feat(client): add ReportIssueModal component

Modal for reporting question issues with category selection
and optional comment field.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Integrate into ExamReview

**Files:**
- Modify: `packages/client/src/components/exam/ExamReview.tsx`

**Step 1: Add import**

```typescript
import { QuestionFeedback } from '../common/QuestionFeedback';
```

**Step 2: Add component to question items**

Find the section where each question is rendered (around line 195, after the NotesPanel):

```tsx
<NotesPanel questionId={question.id} className={styles.notesSection} />
<QuestionFeedback questionId={question.id} />
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/exam/ExamReview.tsx
git commit -m "feat(client): integrate feedback into ExamReview

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Integrate into TopicPractice

**Files:**
- Modify: `packages/client/src/components/study/practice/TopicPractice.tsx`

**Step 1: Add import**

```typescript
import { QuestionFeedback } from '../../common/QuestionFeedback';
```

**Step 2: Add component after explanation is revealed**

Find where the explanation is shown after answering and add:

```tsx
<QuestionFeedback questionId={currentQuestion.id} />
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/study/practice/TopicPractice.tsx
git commit -m "feat(client): integrate feedback into TopicPractice

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Integrate into FlashcardStudy

**Files:**
- Modify: `packages/client/src/components/study/flashcards/FlashcardStudy.tsx`

**Step 1: Add import**

```typescript
import { QuestionFeedback } from '../../common/QuestionFeedback';
```

**Step 2: Add component on card back**

Find where the card back content is rendered and add feedback after the explanation:

```tsx
<QuestionFeedback questionId={currentCard.id} />
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/study/flashcards/FlashcardStudy.tsx
git commit -m "feat(client): integrate feedback into FlashcardStudy

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Integrate into Review (Spaced Repetition)

**Files:**
- Modify: `packages/client/src/components/review/Review.tsx`

**Step 1: Add import**

```typescript
import { QuestionFeedback } from '../common/QuestionFeedback';
```

**Step 2: Add component after answer reveal**

Find where answers are revealed and add:

```tsx
<QuestionFeedback questionId={currentQuestion.id} />
```

**Step 3: Build to verify**

Run: `cd /workspace/.worktrees/question-feedback && npm run build -w @ace-prep/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/review/Review.tsx
git commit -m "feat(client): integrate feedback into Review (SR)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Final Build and Test

**Step 1: Full build**

Run: `cd /workspace/.worktrees/question-feedback && npm run build`
Expected: All packages build successfully

**Step 2: Run all tests**

Run: `cd /workspace/.worktrees/question-feedback && npm test`
Expected: All tests pass

**Step 3: Manual verification checklist**

- [ ] Start dev server: `npm run dev`
- [ ] Take an exam and complete it
- [ ] In exam review, verify thumbs up/down buttons appear
- [ ] Click thumbs up - verify it highlights
- [ ] Click thumbs up again - verify it toggles off
- [ ] Click thumbs down - verify it switches
- [ ] Click "Report issue" - verify modal opens
- [ ] Select issue type and submit
- [ ] Verify "Issue reported" text appears
- [ ] Check database has records in question_feedback and question_reports

**Step 4: Update feature backlog**

Update `tasks/feature-backlog.md` to mark FEAT-011 as done:

```markdown
### FEAT-011: Question Quality Feedback
- **Status**: `[x]`
```

**Step 5: Final commit**

```bash
git add tasks/feature-backlog.md
git commit -m "docs: mark FEAT-011 Question Quality Feedback as complete

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Database schema | schema.ts |
| 2 | Migration | add-question-feedback.sql |
| 3 | Shared types | types.ts |
| 4 | Validation schemas | schemas.ts |
| 5 | Feedback service | feedbackService.ts + test |
| 6 | API endpoints | questions.ts |
| 7 | Client API | client.ts |
| 8 | QuestionFeedback component | QuestionFeedback.tsx + CSS |
| 9 | ReportIssueModal component | ReportIssueModal.tsx + CSS |
| 10-13 | Integration | 4 existing components |
| 14 | Final verification | feature-backlog.md |
