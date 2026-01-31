# Workbook Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated "Workbook" learning experience for 41 official Google ACE questions with guided study, assessments, mastery tracking, and readiness integration.

**Architecture:** New `workbookProgress` table tracks per-question mastery. Server routes handle progress/answers/assessments. Client gets new Workbook tab in StudyHub with Zustand store for state. Integrates with existing readinessService for benchmark comparison.

**Tech Stack:** Drizzle ORM (SQLite), Fastify routes, React + Zustand, TanStack Query, CSS Modules

---

## Phase 1: Foundation (Schema, API, Basic UI)

### Task 1.1: Add workbookProgress schema

**Files:**
- Modify: `packages/server/src/db/schema.ts`

**Step 1: Write the schema definition**

Add after `flashcardSessionRatings` table (around line 771):

```typescript
// ============ WORKBOOK PROGRESS ============
export const workbookProgress = sqliteTable(
  'workbook_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    firstAttemptCorrect: integer('first_attempt_correct', { mode: 'boolean' }),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptCorrect: integer('last_attempt_correct', { mode: 'boolean' }),
    masteryLevel: text('mastery_level')
      .$type<'unattempted' | 'needs_work' | 'learned' | 'mastered'>()
      .notNull()
      .default('unattempted'),
    firstAttemptAt: integer('first_attempt_at', { mode: 'timestamp' }),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('workbook_progress_user_question_idx').on(table.userId, table.questionId),
    index('workbook_progress_user_idx').on(table.userId),
    index('workbook_progress_mastery_idx').on(table.userId, table.masteryLevel),
  ]
);

// Workbook assessment attempts (for full exam mode)
export const workbookAssessments = sqliteTable(
  'workbook_assessments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assessmentType: text('assessment_type').$type<'quick' | 'full'>().notNull(),
    questionCount: integer('question_count').notNull(),
    correctCount: integer('correct_count').notNull(),
    score: real('score').notNull(),
    timeSpentSeconds: integer('time_spent_seconds'),
    completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('workbook_assessments_user_idx').on(table.userId),
    index('workbook_assessments_type_idx').on(table.userId, table.assessmentType),
  ]
);
```

**Step 2: Add type exports**

Add at end of file with other exports:

```typescript
export type WorkbookProgressRecord = typeof workbookProgress.$inferSelect;
export type NewWorkbookProgress = typeof workbookProgress.$inferInsert;
export type WorkbookAssessmentRecord = typeof workbookAssessments.$inferSelect;
export type NewWorkbookAssessment = typeof workbookAssessments.$inferInsert;
```

**Step 3: Run typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/server/src/db/schema.ts
git commit -m "feat(db): add workbook progress and assessment tables"
```

---

### Task 1.2: Create workbook migration

**Files:**
- Create: `packages/server/src/db/migrations/0022_add_workbook_progress.ts`

**Step 1: Create the migration file**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../ace-prep.db');
const db = new Database(dbPath);

console.log('Running migration: 0022_add_workbook_progress');

// Check if tables already exist
const tableExists = (name: string) => {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name);
  return !!result;
};

if (!tableExists('workbook_progress')) {
  db.exec(`
    CREATE TABLE workbook_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      first_attempt_correct INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_correct INTEGER,
      mastery_level TEXT NOT NULL DEFAULT 'unattempted',
      first_attempt_at INTEGER,
      last_attempt_at INTEGER
    );

    CREATE UNIQUE INDEX workbook_progress_user_question_idx ON workbook_progress(user_id, question_id);
    CREATE INDEX workbook_progress_user_idx ON workbook_progress(user_id);
    CREATE INDEX workbook_progress_mastery_idx ON workbook_progress(user_id, mastery_level);
  `);
  console.log('Created workbook_progress table');
} else {
  console.log('workbook_progress table already exists, skipping');
}

if (!tableExists('workbook_assessments')) {
  db.exec(`
    CREATE TABLE workbook_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assessment_type TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      score REAL NOT NULL,
      time_spent_seconds INTEGER,
      completed_at INTEGER NOT NULL
    );

    CREATE INDEX workbook_assessments_user_idx ON workbook_assessments(user_id);
    CREATE INDEX workbook_assessments_type_idx ON workbook_assessments(user_id, assessment_type);
  `);
  console.log('Created workbook_assessments table');
} else {
  console.log('workbook_assessments table already exists, skipping');
}

db.close();
console.log('Migration 0022_add_workbook_progress complete');
```

**Step 2: Add npm script**

In `packages/server/package.json`, add to scripts:

```json
"db:add-workbook-progress": "tsx src/db/migrations/0022_add_workbook_progress.ts"
```

**Step 3: Run migration**

Run: `cd packages/server && npm run db:add-workbook-progress`
Expected: "Migration 0022_add_workbook_progress complete"

**Step 4: Commit**

```bash
git add packages/server/src/db/migrations/0022_add_workbook_progress.ts packages/server/package.json
git commit -m "feat(db): add workbook progress migration"
```

---

### Task 1.3: Create workbook validation schemas

**Files:**
- Modify: `packages/server/src/validation/schemas.ts`

**Step 1: Add workbook schemas**

Add at end of file:

```typescript
// ============ WORKBOOK ============

export const submitWorkbookAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  selectedAnswers: z.array(z.number().int().min(0)).min(1),
});

export const workbookAssessmentQuerySchema = z.object({
  count: z.string().transform(Number).pipe(z.number().int().min(5).max(41)).optional().default('15'),
  type: z.enum(['quick', 'full']).optional().default('quick'),
});

export const completeWorkbookAssessmentSchema = z.object({
  responses: z.array(z.object({
    questionId: z.number().int().positive(),
    selectedAnswers: z.array(z.number().int().min(0)).min(1),
    timeSpentSeconds: z.number().int().min(0).optional(),
  })),
  totalTimeSeconds: z.number().int().min(0),
  assessmentType: z.enum(['quick', 'full']),
});
```

**Step 2: Run typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/server/src/validation/schemas.ts
git commit -m "feat(validation): add workbook validation schemas"
```

---

### Task 1.4: Create workbook service

**Files:**
- Create: `packages/server/src/services/workbookService.ts`

**Step 1: Create the service file**

```typescript
import { db } from '../db/index.js';
import { questions, workbookProgress, workbookAssessments, domains, topics } from '../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';

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
  const questionIds = workbookQuestions.map(q => q.id);

  // Get user progress for all workbook questions
  const progressRecords = questionIds.length > 0
    ? await db
        .select()
        .from(workbookProgress)
        .where(and(
          eq(workbookProgress.userId, userId),
          inArray(workbookProgress.questionId, questionIds)
        ))
    : [];

  const progressMap = new Map(progressRecords.map(p => [p.questionId, p]));

  // Build questions with progress
  const questionsWithProgress: WorkbookQuestionWithProgress[] = workbookQuestions.map(q => {
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
    mastered: questionsWithProgress.filter(q => q.progress.masteryLevel === 'mastered').length,
    learned: questionsWithProgress.filter(q => q.progress.masteryLevel === 'learned').length,
    needsWork: questionsWithProgress.filter(q => q.progress.masteryLevel === 'needs_work').length,
    unattempted: questionsWithProgress.filter(q => q.progress.masteryLevel === 'unattempted').length,
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
    selectedAnswers.every(a => correctAnswers.includes(a)) &&
    correctAnswers.every(a => selectedAnswers.includes(a));

  // Get or create progress record
  const [existing] = await db
    .select()
    .from(workbookProgress)
    .where(and(
      eq(workbookProgress.userId, userId),
      eq(workbookProgress.questionId, questionId)
    ));

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
  await db
    .delete(workbookProgress)
    .where(eq(workbookProgress.userId, userId));
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
  const nonMastered = questionsWithProgress.filter(
    q => q.progress.masteryLevel !== 'mastered'
  );
  const mastered = questionsWithProgress.filter(
    q => q.progress.masteryLevel === 'mastered'
  );

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
  const nextIndex = questions.findIndex(q => q.progress.masteryLevel === 'unattempted');

  return {
    question: nextIndex >= 0 ? questions[nextIndex] : null,
    currentIndex: nextIndex >= 0 ? nextIndex + 1 : questions.length,
    totalQuestions: questions.length,
  };
}
```

**Step 2: Run typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/server/src/services/workbookService.ts
git commit -m "feat(service): add workbook service with progress tracking"
```

---

### Task 1.5: Create workbook routes

**Files:**
- Create: `packages/server/src/routes/workbook.ts`

**Step 1: Create the routes file**

```typescript
import { FastifyInstance } from 'fastify';
import {
  getWorkbookProgressForUser,
  submitWorkbookAnswer,
  resetWorkbookProgress,
  getAssessmentQuestions,
  getNextGuidedQuestion,
} from '../services/workbookService.js';
import {
  submitWorkbookAnswerSchema,
  workbookAssessmentQuerySchema,
  completeWorkbookAssessmentSchema,
  formatZodError,
} from '../validation/schemas.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { workbookAssessments } from '../db/schema.js';
import { updateStreak } from '../services/streakService.js';
import { checkAndUnlock, AchievementContext } from '../services/achievementService.js';
import type { AchievementUnlockResponse, StreakUpdateResponse } from '@ace-prep/shared';

export async function workbookRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Get all workbook questions with progress
  fastify.get('/progress', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getWorkbookProgressForUser(userId);
  });

  // Get next question for guided study
  fastify.get('/guided/next', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    return getNextGuidedQuestion(userId);
  });

  // Submit answer for guided study
  fastify.post<{
    Body: { questionId: number; selectedAnswers: number[] };
  }>('/answer', async (request, reply) => {
    const parseResult = submitWorkbookAnswerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { questionId, selectedAnswers } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    try {
      const result = await submitWorkbookAnswer(userId, questionId, selectedAnswers);

      // Update streak on correct answer
      let streakUpdate: StreakUpdateResponse | undefined;
      let achievementsUnlocked: AchievementUnlockResponse[] = [];

      if (result.isCorrect) {
        try {
          const streakResult = await updateStreak(userId);
          streakUpdate = streakResult.streakUpdate;

          // Check achievements
          const context: AchievementContext = {
            activity: 'study',
            streak: streakResult.streak.currentStreak,
          };
          achievementsUnlocked = await checkAndUnlock(userId, context);
        } catch (error) {
          fastify.log.error({ error }, 'Failed to update streak/achievements');
        }
      }

      return {
        ...result,
        streakUpdate,
        achievementsUnlocked,
      };
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  // Reset progress (for full exam mode)
  fastify.post('/reset', async (request) => {
    const userId = parseInt(request.user!.id, 10);
    await resetWorkbookProgress(userId);
    return { success: true };
  });

  // Get assessment questions
  fastify.get<{
    Querystring: { count?: string; type?: string };
  }>('/assessment', async (request, reply) => {
    const parseResult = workbookAssessmentQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { count, type } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // For full exam, get all 41 questions
    const questionCount = type === 'full' ? 41 : count;

    // Quick assessment weights toward non-mastered; full exam is random
    const weightNonMastered = type === 'quick';

    const questions = await getAssessmentQuestions(userId, questionCount, weightNonMastered);

    // Strip correctAnswers for assessment mode (reveal after submission)
    return {
      assessmentType: type,
      questions: questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        difficulty: q.difficulty,
        gcpServices: q.gcpServices,
        domain: q.domain,
        topic: q.topic,
        orderIndex: q.orderIndex,
      })),
      timeLimit: type === 'full' ? 60 * 60 : questionCount * 90, // 60 min or 90s/question
    };
  });

  // Complete assessment
  fastify.post<{
    Body: {
      responses: Array<{
        questionId: number;
        selectedAnswers: number[];
        timeSpentSeconds?: number;
      }>;
      totalTimeSeconds: number;
      assessmentType: 'quick' | 'full';
    };
  }>('/assessment/complete', async (request, reply) => {
    const parseResult = completeWorkbookAssessmentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }

    const { responses, totalTimeSeconds, assessmentType } = parseResult.data;
    const userId = parseInt(request.user!.id, 10);

    // Grade each response
    let correctCount = 0;
    const results: Array<{
      questionId: number;
      isCorrect: boolean;
      correctAnswers: number[];
      explanation: string;
    }> = [];

    for (const response of responses) {
      const result = await submitWorkbookAnswer(
        userId,
        response.questionId,
        response.selectedAnswers
      );
      results.push({
        questionId: response.questionId,
        isCorrect: result.isCorrect,
        correctAnswers: result.correctAnswers,
        explanation: result.explanation,
      });
      if (result.isCorrect) correctCount++;
    }

    const score = Math.round((correctCount / responses.length) * 100);

    // Record assessment
    const [assessment] = await db
      .insert(workbookAssessments)
      .values({
        userId,
        assessmentType,
        questionCount: responses.length,
        correctCount,
        score,
        timeSpentSeconds: totalTimeSeconds,
        completedAt: new Date(),
      })
      .returning();

    // Update streak
    let streakUpdate: StreakUpdateResponse | undefined;
    let achievementsUnlocked: AchievementUnlockResponse[] = [];

    try {
      const streakResult = await updateStreak(userId);
      streakUpdate = streakResult.streakUpdate;

      const context: AchievementContext = {
        activity: 'study',
        streak: streakResult.streak.currentStreak,
        score: correctCount,
        totalQuestions: responses.length,
      };
      achievementsUnlocked = await checkAndUnlock(userId, context);
    } catch (error) {
      fastify.log.error({ error }, 'Failed to update streak/achievements');
    }

    return {
      assessmentId: assessment.id,
      score,
      correctCount,
      totalCount: responses.length,
      timeSpentSeconds: totalTimeSeconds,
      results,
      streakUpdate,
      achievementsUnlocked,
    };
  });
}
```

**Step 2: Register routes in index.ts**

In `packages/server/src/index.ts`, add import and registration:

```typescript
import { workbookRoutes } from './routes/workbook.js';

// After other route registrations
fastify.register(workbookRoutes, { prefix: '/api/workbook' });
```

**Step 3: Run typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/server/src/routes/workbook.ts packages/server/src/index.ts
git commit -m "feat(api): add workbook routes for progress and assessments"
```

---

### Task 1.6: Add shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add workbook types**

Add at end of file:

```typescript
// ============ WORKBOOK ============

export type WorkbookMasteryLevel = 'unattempted' | 'needs_work' | 'learned' | 'mastered';

export interface WorkbookQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers?: number[]; // Only included after answer submission in guided mode
  explanation?: string; // Only included after answer submission
  difficulty: string;
  gcpServices: string[];
  domain: { id: number; code: string; name: string };
  topic: { id: number; code: string; name: string };
  orderIndex: number;
}

export interface WorkbookProgress {
  masteryLevel: WorkbookMasteryLevel;
  attempts: number;
  firstAttemptCorrect: boolean | null;
  lastAttemptCorrect: boolean | null;
  lastAttemptAt: Date | null;
}

export interface WorkbookQuestionWithProgress extends WorkbookQuestion {
  progress: WorkbookProgress;
}

export interface WorkbookProgressSummary {
  total: number;
  mastered: number;
  learned: number;
  needsWork: number;
  unattempted: number;
  percentComplete: number;
}

export interface WorkbookProgressResponse {
  questions: WorkbookQuestionWithProgress[];
  summary: WorkbookProgressSummary;
}

export interface WorkbookAnswerResponse {
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  masteryLevel: WorkbookMasteryLevel;
  isFirstAttempt: boolean;
  streakUpdate?: StreakUpdateResponse;
  achievementsUnlocked?: AchievementUnlockResponse[];
}

export interface WorkbookAssessmentResponse {
  assessmentType: 'quick' | 'full';
  questions: Omit<WorkbookQuestion, 'correctAnswers' | 'explanation'>[];
  timeLimit: number; // seconds
}

export interface WorkbookAssessmentCompleteRequest {
  responses: Array<{
    questionId: number;
    selectedAnswers: number[];
    timeSpentSeconds?: number;
  }>;
  totalTimeSeconds: number;
  assessmentType: 'quick' | 'full';
}

export interface WorkbookAssessmentCompleteResponse {
  assessmentId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  timeSpentSeconds: number;
  results: Array<{
    questionId: number;
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
  }>;
  streakUpdate?: StreakUpdateResponse;
  achievementsUnlocked?: AchievementUnlockResponse[];
}

export interface WorkbookGuidedNextResponse {
  question: WorkbookQuestionWithProgress | null;
  currentIndex: number;
  totalQuestions: number;
}
```

**Step 2: Export from index**

In `packages/shared/src/index.ts`, add exports:

```typescript
export type {
  WorkbookMasteryLevel,
  WorkbookQuestion,
  WorkbookProgress,
  WorkbookQuestionWithProgress,
  WorkbookProgressSummary,
  WorkbookProgressResponse,
  WorkbookAnswerResponse,
  WorkbookAssessmentResponse,
  WorkbookAssessmentCompleteRequest,
  WorkbookAssessmentCompleteResponse,
  WorkbookGuidedNextResponse,
} from './types.js';
```

**Step 3: Build shared package**

Run: `cd packages/shared && npm run build`
Expected: Successful build

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add workbook types"
```

---

### Task 1.7: Add workbook API client

**Files:**
- Modify: `packages/client/src/api/client.ts`

**Step 1: Import types**

Add to imports:

```typescript
import type {
  WorkbookProgressResponse,
  WorkbookAnswerResponse,
  WorkbookAssessmentResponse,
  WorkbookAssessmentCompleteRequest,
  WorkbookAssessmentCompleteResponse,
  WorkbookGuidedNextResponse,
} from '@ace-prep/shared';
```

**Step 2: Add workbook API**

Add after `feedbackApi`:

```typescript
// Workbook
export const workbookApi = {
  getProgress: () => request<WorkbookProgressResponse>('/workbook/progress'),

  getGuidedNext: () => request<WorkbookGuidedNextResponse>('/workbook/guided/next'),

  submitAnswer: (questionId: number, selectedAnswers: number[]) =>
    request<WorkbookAnswerResponse>('/workbook/answer', {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedAnswers }),
    }),

  resetProgress: () =>
    request<{ success: boolean }>('/workbook/reset', {
      method: 'POST',
    }),

  getAssessment: (count: number = 15, type: 'quick' | 'full' = 'quick') =>
    request<WorkbookAssessmentResponse>(
      `/workbook/assessment?count=${count}&type=${type}`
    ),

  completeAssessment: (data: WorkbookAssessmentCompleteRequest) =>
    request<WorkbookAssessmentCompleteResponse>('/workbook/assessment/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
```

**Step 3: Run typecheck**

Run: `cd packages/client && npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/client/src/api/client.ts
git commit -m "feat(client): add workbook API client"
```

---

### Task 1.8: Create workbook store

**Files:**
- Create: `packages/client/src/stores/workbookStore.ts`

**Step 1: Create the store**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/react';
import { workbookApi } from '../api/client';
import { showStreakMilestoneToast } from '../utils/streakNotifications';
import { showAchievementUnlockToasts } from '../utils/achievementNotifications';
import { queryClient } from '../lib/queryClient';
import type {
  WorkbookQuestionWithProgress,
  WorkbookProgressSummary,
  WorkbookMasteryLevel,
} from '@ace-prep/shared';

type WorkbookMode = 'guided' | 'quick' | 'full';

interface WorkbookResponse {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  timeSpentSeconds: number;
}

interface WorkbookState {
  // Mode
  mode: WorkbookMode;

  // Guided study state
  currentQuestionIndex: number;
  isRevealed: boolean;

  // Assessment state
  assessmentQuestions: WorkbookQuestionWithProgress[];
  assessmentResponses: Map<number, WorkbookResponse>;
  assessmentStartTime: number | null;
  questionStartTime: number | null;
  timeLimit: number | null;

  // UI state
  isLoading: boolean;
  showSummary: boolean;

  // Actions
  setMode: (mode: WorkbookMode) => void;
  startGuidedStudy: () => void;
  startAssessment: (type: 'quick' | 'full', count?: number) => Promise<void>;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  revealAnswer: (questionId: number) => Promise<{
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
    masteryLevel: WorkbookMasteryLevel;
  }>;
  nextQuestion: () => void;
  previousQuestion: () => void;
  completeAssessment: () => Promise<{
    score: number;
    correctCount: number;
    totalCount: number;
  }>;
  resetStore: () => void;

  // Getters
  getCurrentQuestion: () => WorkbookQuestionWithProgress | null;
  getResponse: (questionId: number) => WorkbookResponse | undefined;
  getTimeRemaining: () => number | null;
}

const initialState = {
  mode: 'guided' as WorkbookMode,
  currentQuestionIndex: 0,
  isRevealed: false,
  assessmentQuestions: [],
  assessmentResponses: new Map(),
  assessmentStartTime: null,
  questionStartTime: null,
  timeLimit: null,
  isLoading: false,
  showSummary: false,
};

export const useWorkbookStore = create<WorkbookState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMode: (mode) => set({ mode }),

      startGuidedStudy: () => {
        set({
          mode: 'guided',
          currentQuestionIndex: 0,
          isRevealed: false,
          showSummary: false,
          questionStartTime: Date.now(),
        });
      },

      startAssessment: async (type, count = 15) => {
        set({ isLoading: true });

        try {
          const result = await workbookApi.getAssessment(count, type);

          const responses = new Map<number, WorkbookResponse>();
          result.questions.forEach(q => {
            responses.set(q.id, {
              questionId: q.id,
              selectedAnswers: [],
              isCorrect: null,
              timeSpentSeconds: 0,
            });
          });

          set({
            mode: type,
            assessmentQuestions: result.questions as WorkbookQuestionWithProgress[],
            assessmentResponses: responses,
            assessmentStartTime: Date.now(),
            questionStartTime: Date.now(),
            timeLimit: result.timeLimit,
            currentQuestionIndex: 0,
            isRevealed: false,
            showSummary: false,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          Sentry.captureException(error);
          throw error;
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        const { assessmentResponses, questionStartTime } = get();
        const timeSpent = questionStartTime
          ? Math.floor((Date.now() - questionStartTime) / 1000)
          : 0;

        const newResponses = new Map(assessmentResponses);
        newResponses.set(questionId, {
          questionId,
          selectedAnswers,
          isCorrect: null,
          timeSpentSeconds: timeSpent,
        });

        set({ assessmentResponses: newResponses });
      },

      revealAnswer: async (questionId) => {
        const { assessmentResponses, questionStartTime } = get();
        const response = assessmentResponses.get(questionId);

        if (!response) {
          throw new Error('No response found');
        }

        const timeSpent = questionStartTime
          ? Math.floor((Date.now() - questionStartTime) / 1000)
          : 0;

        const result = await workbookApi.submitAnswer(questionId, response.selectedAnswers);

        // Update response with result
        const newResponses = new Map(assessmentResponses);
        newResponses.set(questionId, {
          ...response,
          isCorrect: result.isCorrect,
          timeSpentSeconds: timeSpent,
        });

        set({
          assessmentResponses: newResponses,
          isRevealed: true,
        });

        // Handle streak/achievements
        if (result.streakUpdate) {
          showStreakMilestoneToast(result.streakUpdate);
          queryClient.invalidateQueries({ queryKey: ['streak'] });
        }
        if (result.achievementsUnlocked?.length) {
          showAchievementUnlockToasts(result.achievementsUnlocked);
        }

        // Invalidate workbook progress
        queryClient.invalidateQueries({ queryKey: ['workbookProgress'] });

        return result;
      },

      nextQuestion: () => {
        const { currentQuestionIndex, assessmentQuestions, mode } = get();
        const maxIndex = assessmentQuestions.length - 1;

        if (currentQuestionIndex < maxIndex) {
          set({
            currentQuestionIndex: currentQuestionIndex + 1,
            isRevealed: mode !== 'guided', // In guided mode, always start unrevealed
            questionStartTime: Date.now(),
          });
        } else {
          set({ showSummary: true });
        }
      },

      previousQuestion: () => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex > 0) {
          set({
            currentQuestionIndex: currentQuestionIndex - 1,
            isRevealed: true,
            questionStartTime: Date.now(),
          });
        }
      },

      completeAssessment: async () => {
        const { assessmentResponses, assessmentStartTime, mode } = get();

        const totalTimeSeconds = assessmentStartTime
          ? Math.floor((Date.now() - assessmentStartTime) / 1000)
          : 0;

        const responses = Array.from(assessmentResponses.values()).map(r => ({
          questionId: r.questionId,
          selectedAnswers: r.selectedAnswers,
          timeSpentSeconds: r.timeSpentSeconds,
        }));

        const result = await workbookApi.completeAssessment({
          responses,
          totalTimeSeconds,
          assessmentType: mode === 'full' ? 'full' : 'quick',
        });

        // Handle streak/achievements
        if (result.streakUpdate) {
          showStreakMilestoneToast(result.streakUpdate);
          queryClient.invalidateQueries({ queryKey: ['streak'] });
        }
        if (result.achievementsUnlocked?.length) {
          showAchievementUnlockToasts(result.achievementsUnlocked);
        }

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['workbookProgress'] });

        set({ showSummary: true });

        return {
          score: result.score,
          correctCount: result.correctCount,
          totalCount: result.totalCount,
        };
      },

      resetStore: () => set(initialState),

      getCurrentQuestion: () => {
        const { assessmentQuestions, currentQuestionIndex } = get();
        return assessmentQuestions[currentQuestionIndex] || null;
      },

      getResponse: (questionId) => {
        return get().assessmentResponses.get(questionId);
      },

      getTimeRemaining: () => {
        const { assessmentStartTime, timeLimit } = get();
        if (!assessmentStartTime || !timeLimit) return null;

        const elapsed = Math.floor((Date.now() - assessmentStartTime) / 1000);
        return Math.max(0, timeLimit - elapsed);
      },
    }),
    {
      name: 'ace-workbook-store',
      partialize: (state) => ({
        mode: state.mode,
        currentQuestionIndex: state.currentQuestionIndex,
        assessmentStartTime: state.assessmentStartTime,
        timeLimit: state.timeLimit,
        // Don't persist questions or responses - fetch fresh
      }),
    }
  )
);
```

**Step 2: Run typecheck**

Run: `cd packages/client && npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/client/src/stores/workbookStore.ts
git commit -m "feat(client): add workbook store with guided and assessment modes"
```

---

## Phase 2: Guided Study UI

### Task 2.1: Create WorkbookHub component

**Files:**
- Create: `packages/client/src/components/study/workbook/WorkbookHub.tsx`
- Create: `packages/client/src/components/study/workbook/WorkbookHub.module.css`

**Step 1: Create the component**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workbookApi } from '../../../api/client';
import { useWorkbookStore } from '../../../stores/workbookStore';
import { WorkbookProgress } from './WorkbookProgress';
import { GuidedStudy } from './GuidedStudy';
import { QuickAssessment } from './QuickAssessment';
import { FullExam } from './FullExam';
import styles from './WorkbookHub.module.css';

type WorkbookTab = 'guided' | 'quick' | 'full';

export function WorkbookHub() {
  const [activeTab, setActiveTab] = useState<WorkbookTab>('guided');
  const mode = useWorkbookStore(s => s.mode);
  const showSummary = useWorkbookStore(s => s.showSummary);
  const resetStore = useWorkbookStore(s => s.resetStore);

  const { data: progressData, isLoading } = useQuery({
    queryKey: ['workbookProgress'],
    queryFn: workbookApi.getProgress,
  });

  // If in active session, show that view
  if (mode === 'guided' && !showSummary) {
    return <GuidedStudy onExit={resetStore} />;
  }
  if ((mode === 'quick' || mode === 'full') && !showSummary) {
    return mode === 'quick'
      ? <QuickAssessment onExit={resetStore} />
      : <FullExam onExit={resetStore} />;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Official Google Questions</h1>
        <p className={styles.subtitle}>
          41 diagnostic questions from the ACE Exam Prep Workbook
        </p>
      </header>

      {/* Progress Overview */}
      {progressData && (
        <WorkbookProgress summary={progressData.summary} />
      )}

      {/* Mode Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'guided' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('guided')}
        >
          Guided Study
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'quick' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('quick')}
        >
          Quick Assessment
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'full' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('full')}
        >
          Full Exam
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {activeTab === 'guided' && (
          <GuidedStudyLanding
            summary={progressData?.summary}
            isLoading={isLoading}
          />
        )}
        {activeTab === 'quick' && (
          <QuickAssessmentLanding />
        )}
        {activeTab === 'full' && (
          <FullExamLanding
            hasProgress={(progressData?.summary.unattempted ?? 41) < 41}
          />
        )}
      </div>
    </div>
  );
}

function GuidedStudyLanding({ summary, isLoading }: {
  summary?: { unattempted: number; total: number };
  isLoading: boolean;
}) {
  const startGuidedStudy = useWorkbookStore(s => s.startGuidedStudy);

  const nextQuestion = summary
    ? summary.total - summary.unattempted + 1
    : 1;

  return (
    <div className={styles.landing}>
      <h2>Sequential Walkthrough</h2>
      <p>
        Work through all 41 questions in order, just like the official workbook.
        Get detailed explanations and learning resources after each question.
      </p>

      {!isLoading && summary && (
        <p className={styles.progress}>
          {summary.unattempted === 0
            ? 'All questions completed! Review your progress or retake.'
            : `Continue from Question ${nextQuestion} of ${summary.total}`
          }
        </p>
      )}

      <button
        className={styles.startButton}
        onClick={startGuidedStudy}
        disabled={isLoading}
      >
        {summary?.unattempted === 0 ? 'Review Questions' : 'Continue Study'}
      </button>
    </div>
  );
}

function QuickAssessmentLanding() {
  const startAssessment = useWorkbookStore(s => s.startAssessment);
  const [count, setCount] = useState(15);

  return (
    <div className={styles.landing}>
      <h2>Quick Assessment</h2>
      <p>
        Test yourself with a random selection of workbook questions.
        Weighted toward questions you haven't mastered yet.
      </p>

      <div className={styles.countSelector}>
        <label>Number of questions:</label>
        <select value={count} onChange={e => setCount(Number(e.target.value))}>
          <option value={10}>10 questions (~15 min)</option>
          <option value={15}>15 questions (~22 min)</option>
          <option value={20}>20 questions (~30 min)</option>
        </select>
      </div>

      <button
        className={styles.startButton}
        onClick={() => startAssessment('quick', count)}
      >
        Start Assessment
      </button>
    </div>
  );
}

function FullExamLanding({ hasProgress }: { hasProgress: boolean }) {
  const startAssessment = useWorkbookStore(s => s.startAssessment);
  const resetProgress = async () => {
    await workbookApi.resetProgress();
    startAssessment('full', 41);
  };

  return (
    <div className={styles.landing}>
      <h2>Full Exam Mode</h2>
      <p>
        All 41 questions, randomized, with a 60-minute time limit.
        Simulates real exam pressure.
      </p>

      {hasProgress && (
        <div className={styles.warning}>
          <strong>Warning:</strong> Starting a full exam will reset your mastery
          progress to record a fresh first-attempt score.
        </div>
      )}

      <button
        className={styles.startButton}
        onClick={resetProgress}
      >
        {hasProgress ? 'Reset & Start Exam' : 'Start Full Exam'}
      </button>
    </div>
  );
}
```

**Step 2: Create styles**

```css
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-6);
}

.header {
  text-align: center;
  margin-bottom: var(--space-6);
}

.header h1 {
  font-size: var(--text-3xl);
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.subtitle {
  color: var(--color-text-secondary);
  font-size: var(--text-lg);
}

.tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

.tab {
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.tab:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tabActive {
  background: var(--color-primary);
  color: white;
}

.tabActive:hover {
  background: var(--color-primary-hover);
  color: white;
}

.content {
  min-height: 300px;
}

.landing {
  text-align: center;
  padding: var(--space-8);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.landing h2 {
  font-size: var(--text-xl);
  margin-bottom: var(--space-3);
}

.landing p {
  color: var(--color-text-secondary);
  max-width: 500px;
  margin: 0 auto var(--space-4);
}

.progress {
  font-weight: 500;
  color: var(--color-primary);
}

.countSelector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.countSelector select {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
}

.startButton {
  padding: var(--space-3) var(--space-6);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: var(--text-lg);
  cursor: pointer;
  transition: background 0.2s;
}

.startButton:hover {
  background: var(--color-primary-hover);
}

.startButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.warning {
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}
```

**Step 3: Run typecheck**

Run: `cd packages/client && npm run typecheck`
Expected: Errors expected - we need to create child components

**Step 4: Commit (partial)**

```bash
git add packages/client/src/components/study/workbook/
git commit -m "feat(ui): add WorkbookHub component structure"
```

---

### Task 2.2: Create WorkbookProgress component

**Files:**
- Create: `packages/client/src/components/study/workbook/WorkbookProgress.tsx`

**Step 1: Create the component**

```tsx
import type { WorkbookProgressSummary } from '@ace-prep/shared';
import styles from './WorkbookHub.module.css';

interface Props {
  summary: WorkbookProgressSummary;
}

export function WorkbookProgress({ summary }: Props) {
  const { total, mastered, learned, needsWork, unattempted, percentComplete } = summary;

  return (
    <div className={styles.progressCard}>
      <div className={styles.progressHeader}>
        <span className={styles.progressTitle}>Your Progress</span>
        <span className={styles.progressPercent}>{percentComplete}% Complete</span>
      </div>

      <div className={styles.progressBar}>
        <div
          className={styles.progressMastered}
          style={{ width: `${(mastered / total) * 100}%` }}
          title={`${mastered} Mastered`}
        />
        <div
          className={styles.progressLearned}
          style={{ width: `${(learned / total) * 100}%` }}
          title={`${learned} Learned`}
        />
        <div
          className={styles.progressNeedsWork}
          style={{ width: `${(needsWork / total) * 100}%` }}
          title={`${needsWork} Needs Work`}
        />
      </div>

      <div className={styles.progressLegend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotMastered}`} />
          <span>{mastered} Mastered</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotLearned}`} />
          <span>{learned} Learned</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotNeedsWork}`} />
          <span>{needsWork} Needs Work</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotUnattempted}`} />
          <span>{unattempted} Remaining</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add styles to WorkbookHub.module.css**

```css
/* Add to WorkbookHub.module.css */

.progressCard {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-bottom: var(--space-6);
}

.progressHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.progressTitle {
  font-weight: 600;
  font-size: var(--text-lg);
}

.progressPercent {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-primary);
}

.progressBar {
  height: 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  display: flex;
  margin-bottom: var(--space-4);
}

.progressMastered {
  background: var(--color-success);
  transition: width 0.3s ease;
}

.progressLearned {
  background: var(--color-info);
  transition: width 0.3s ease;
}

.progressNeedsWork {
  background: var(--color-warning);
  transition: width 0.3s ease;
}

.progressLegend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.legendItem {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.legendDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dotMastered {
  background: var(--color-success);
}

.dotLearned {
  background: var(--color-info);
}

.dotNeedsWork {
  background: var(--color-warning);
}

.dotUnattempted {
  background: var(--color-bg-tertiary);
}
```

**Step 3: Commit**

```bash
git add packages/client/src/components/study/workbook/
git commit -m "feat(ui): add WorkbookProgress component"
```

---

### Task 2.3: Create GuidedStudy component

**Files:**
- Create: `packages/client/src/components/study/workbook/GuidedStudy.tsx`

**Step 1: Create the component**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workbookApi } from '../../../api/client';
import { useWorkbookStore } from '../../../stores/workbookStore';
import { WorkbookQuestion } from './WorkbookQuestion';
import { FeedbackPanel } from './FeedbackPanel';
import styles from './GuidedStudy.module.css';

interface Props {
  onExit: () => void;
}

export function GuidedStudy({ onExit }: Props) {
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
    masteryLevel: string;
  } | null>(null);

  const { data: progressData, refetch } = useQuery({
    queryKey: ['workbookProgress'],
    queryFn: workbookApi.getProgress,
  });

  const { data: guidedData, refetch: refetchGuided } = useQuery({
    queryKey: ['workbookGuidedNext'],
    queryFn: workbookApi.getGuidedNext,
  });

  const question = guidedData?.question;
  const currentIndex = guidedData?.currentIndex ?? 0;
  const totalQuestions = guidedData?.totalQuestions ?? 41;

  const handleSelect = (answers: number[]) => {
    if (!isRevealed) {
      setSelectedAnswers(answers);
    }
  };

  const handleCheckAnswer = async () => {
    if (!question || selectedAnswers.length === 0) return;

    const result = await workbookApi.submitAnswer(question.id, selectedAnswers);
    setFeedback(result);
    setIsRevealed(true);
    refetch(); // Refresh progress
  };

  const handleNext = async () => {
    setSelectedAnswers([]);
    setIsRevealed(false);
    setFeedback(null);
    await refetchGuided();
  };

  const progressPercent = Math.round((currentIndex / totalQuestions) * 100);

  if (!question) {
    return (
      <div className={styles.complete}>
        <h2>All Questions Completed!</h2>
        <p>You've worked through all 41 official questions.</p>
        <div className={styles.actions}>
          <button onClick={onExit} className={styles.primaryButton}>
            View Progress
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Progress Header */}
      <div className={styles.header}>
        <button onClick={onExit} className={styles.exitButton}>
          Exit
        </button>
        <div className={styles.progress}>
          <span>Question {currentIndex} of {totalQuestions}</span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Domain Label */}
      <div className={styles.domainLabel}>
        {question.domain.code}: {question.domain.name}
      </div>

      {/* Question */}
      <WorkbookQuestion
        question={question}
        selectedAnswers={selectedAnswers}
        onSelect={handleSelect}
        disabled={isRevealed}
      />

      {/* Check Answer / Feedback */}
      {!isRevealed ? (
        <div className={styles.actions}>
          <button
            onClick={handleCheckAnswer}
            disabled={selectedAnswers.length === 0}
            className={styles.primaryButton}
          >
            Check Answer
          </button>
        </div>
      ) : (
        <>
          <FeedbackPanel
            isCorrect={feedback?.isCorrect ?? false}
            correctAnswers={feedback?.correctAnswers ?? []}
            explanation={feedback?.explanation ?? ''}
            selectedAnswers={selectedAnswers}
            options={question.options}
            masteryLevel={feedback?.masteryLevel ?? 'needs_work'}
            gcpServices={question.gcpServices}
          />
          <div className={styles.actions}>
            <button onClick={handleNext} className={styles.primaryButton}>
              Next Question
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Create styles**

Create `packages/client/src/components/study/workbook/GuidedStudy.module.css`:

```css
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-4);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.exitButton {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
}

.exitButton:hover {
  background: var(--color-bg-hover);
}

.progress {
  flex: 1;
}

.progress span {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  display: block;
  margin-bottom: var(--space-1);
}

.progressBar {
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.domainLabel {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  margin-bottom: var(--space-4);
}

.actions {
  display: flex;
  justify-content: center;
  margin-top: var(--space-6);
}

.primaryButton {
  padding: var(--space-3) var(--space-6);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: var(--text-lg);
  cursor: pointer;
  transition: background 0.2s;
}

.primaryButton:hover {
  background: var(--color-primary-hover);
}

.primaryButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.complete {
  text-align: center;
  padding: var(--space-12);
}

.complete h2 {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-3);
}

.complete p {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-6);
}
```

**Step 3: Commit**

```bash
git add packages/client/src/components/study/workbook/GuidedStudy.*
git commit -m "feat(ui): add GuidedStudy component"
```

---

### Task 2.4: Create WorkbookQuestion component

**Files:**
- Create: `packages/client/src/components/study/workbook/WorkbookQuestion.tsx`

**Step 1: Create the component**

```tsx
import type { WorkbookQuestionWithProgress } from '@ace-prep/shared';
import styles from './WorkbookQuestion.module.css';

interface Props {
  question: WorkbookQuestionWithProgress;
  selectedAnswers: number[];
  onSelect: (answers: number[]) => void;
  disabled?: boolean;
  showCorrectAnswers?: number[];
}

export function WorkbookQuestion({
  question,
  selectedAnswers,
  onSelect,
  disabled = false,
  showCorrectAnswers,
}: Props) {
  const isMultiple = question.questionType === 'multiple';

  const handleOptionClick = (index: number) => {
    if (disabled) return;

    if (isMultiple) {
      // Toggle selection for multiple choice
      const newAnswers = selectedAnswers.includes(index)
        ? selectedAnswers.filter(a => a !== index)
        : [...selectedAnswers, index];
      onSelect(newAnswers);
    } else {
      // Single selection
      onSelect([index]);
    }
  };

  const getOptionClass = (index: number) => {
    const classes = [styles.option];

    if (selectedAnswers.includes(index)) {
      classes.push(styles.selected);
    }

    if (showCorrectAnswers) {
      if (showCorrectAnswers.includes(index)) {
        classes.push(styles.correct);
      } else if (selectedAnswers.includes(index)) {
        classes.push(styles.incorrect);
      }
    }

    if (disabled) {
      classes.push(styles.disabled);
    }

    return classes.join(' ');
  };

  return (
    <div className={styles.container}>
      <div className={styles.questionText}>
        {question.questionText}
      </div>

      {isMultiple && (
        <div className={styles.hint}>
          Select all that apply
        </div>
      )}

      <div className={styles.options}>
        {question.options.map((option, index) => (
          <button
            key={index}
            className={getOptionClass(index)}
            onClick={() => handleOptionClick(index)}
            disabled={disabled}
            type="button"
          >
            <span className={styles.optionLetter}>
              {String.fromCharCode(65 + index)}
            </span>
            <span className={styles.optionText}>{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create styles**

Create `packages/client/src/components/study/workbook/WorkbookQuestion.module.css`:

```css
.container {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.questionText {
  font-size: var(--text-lg);
  line-height: 1.6;
  margin-bottom: var(--space-4);
  white-space: pre-wrap;
}

.hint {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-style: italic;
  margin-bottom: var(--space-3);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  width: 100%;
}

.option:hover:not(.disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.correct {
  border-color: var(--color-success);
  background: var(--color-success-bg);
}

.incorrect {
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.disabled {
  cursor: default;
}

.optionLetter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  font-weight: 600;
  flex-shrink: 0;
}

.selected .optionLetter {
  background: var(--color-primary);
  color: white;
}

.correct .optionLetter {
  background: var(--color-success);
  color: white;
}

.incorrect .optionLetter {
  background: var(--color-error);
  color: white;
}

.optionText {
  flex: 1;
  line-height: 1.5;
}
```

**Step 3: Commit**

```bash
git add packages/client/src/components/study/workbook/WorkbookQuestion.*
git commit -m "feat(ui): add WorkbookQuestion component"
```

---

### Task 2.5: Create FeedbackPanel component

**Files:**
- Create: `packages/client/src/components/study/workbook/FeedbackPanel.tsx`

**Step 1: Create the component**

```tsx
import styles from './FeedbackPanel.module.css';

interface Props {
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  selectedAnswers: number[];
  options: string[];
  masteryLevel: string;
  gcpServices: string[];
}

export function FeedbackPanel({
  isCorrect,
  correctAnswers,
  explanation,
  selectedAnswers,
  options,
  masteryLevel,
  gcpServices,
}: Props) {
  const getMasteryLabel = () => {
    switch (masteryLevel) {
      case 'mastered': return 'Mastered (correct on first attempt)';
      case 'learned': return 'Learned (correct after retry)';
      case 'needs_work': return 'Needs work';
      default: return '';
    }
  };

  return (
    <div className={`${styles.container} ${isCorrect ? styles.correct : styles.incorrect}`}>
      {/* Result Header */}
      <div className={styles.header}>
        <span className={styles.icon}>
          {isCorrect ? '✓' : '✗'}
        </span>
        <span className={styles.result}>
          {isCorrect ? 'Correct!' : 'Incorrect'}
        </span>
        <span className={styles.mastery}>
          {getMasteryLabel()}
        </span>
      </div>

      {/* Your Answer vs Correct Answer */}
      <div className={styles.answers}>
        <div className={styles.answerBlock}>
          <span className={styles.answerLabel}>Your answer:</span>
          <span>
            {selectedAnswers.map(i => String.fromCharCode(65 + i)).join(', ')}
          </span>
        </div>
        {!isCorrect && (
          <div className={styles.answerBlock}>
            <span className={styles.answerLabel}>Correct answer:</span>
            <span className={styles.correctText}>
              {correctAnswers.map(i => `${String.fromCharCode(65 + i)} - ${options[i]}`).join('; ')}
            </span>
          </div>
        )}
      </div>

      {/* Explanation */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Explanation</h4>
        <p className={styles.explanation}>{explanation}</p>
      </div>

      {/* GCP Services */}
      {gcpServices.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>GCP Services</h4>
          <div className={styles.tags}>
            {gcpServices.map(service => (
              <span key={service} className={styles.tag}>
                {service}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Learn More - Placeholder for Phase 5 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Learn More</h4>
        <p className={styles.placeholder}>
          Related courses and documentation links coming soon...
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Create styles**

Create `packages/client/src/components/study/workbook/FeedbackPanel.module.css`:

```css
.container {
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-top: var(--space-4);
}

.correct {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success);
}

.incorrect {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: var(--text-xl);
  font-weight: bold;
}

.correct .icon {
  background: var(--color-success);
  color: white;
}

.incorrect .icon {
  background: var(--color-error);
  color: white;
}

.result {
  font-size: var(--text-xl);
  font-weight: 600;
}

.mastery {
  margin-left: auto;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-primary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
}

.answers {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.answerBlock {
  display: flex;
  gap: var(--space-2);
}

.answerLabel {
  font-weight: 500;
  color: var(--color-text-secondary);
  min-width: 120px;
}

.correctText {
  color: var(--color-success-dark);
  font-weight: 500;
}

.section {
  margin-bottom: var(--space-4);
}

.section:last-child {
  margin-bottom: 0;
}

.sectionTitle {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}

.explanation {
  line-height: 1.6;
  white-space: pre-wrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag {
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-primary);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
}

.placeholder {
  font-style: italic;
  color: var(--color-text-tertiary);
}
```

**Step 3: Commit**

```bash
git add packages/client/src/components/study/workbook/FeedbackPanel.*
git commit -m "feat(ui): add FeedbackPanel component with mastery display"
```

---

### Task 2.6: Create stub assessment components

**Files:**
- Create: `packages/client/src/components/study/workbook/QuickAssessment.tsx`
- Create: `packages/client/src/components/study/workbook/FullExam.tsx`

**Step 1: Create QuickAssessment stub**

```tsx
interface Props {
  onExit: () => void;
}

export function QuickAssessment({ onExit }: Props) {
  // Phase 3 implementation
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Quick Assessment</h2>
      <p>Coming in Phase 3...</p>
      <button onClick={onExit}>Exit</button>
    </div>
  );
}
```

**Step 2: Create FullExam stub**

```tsx
interface Props {
  onExit: () => void;
}

export function FullExam({ onExit }: Props) {
  // Phase 3 implementation
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Full Exam Mode</h2>
      <p>Coming in Phase 3...</p>
      <button onClick={onExit}>Exit</button>
    </div>
  );
}
```

**Step 3: Create index export**

Create `packages/client/src/components/study/workbook/index.ts`:

```typescript
export { WorkbookHub } from './WorkbookHub';
export { WorkbookProgress } from './WorkbookProgress';
export { GuidedStudy } from './GuidedStudy';
export { WorkbookQuestion } from './WorkbookQuestion';
export { FeedbackPanel } from './FeedbackPanel';
export { QuickAssessment } from './QuickAssessment';
export { FullExam } from './FullExam';
```

**Step 4: Commit**

```bash
git add packages/client/src/components/study/workbook/
git commit -m "feat(ui): add assessment stub components and exports"
```

---

### Task 2.7: Add Workbook tab to StudyHub

**Files:**
- Modify: `packages/client/src/components/study/StudyHub.tsx`

**Step 1: Import WorkbookHub**

Add import:

```typescript
import { WorkbookHub } from './workbook';
```

**Step 2: Add 'workbook' to Tab type**

Update type definition:

```typescript
type Tab = 'path' | 'domains' | 'practice' | 'drills' | 'workbook' | 'flashcards' | 'summaries';
```

**Step 3: Add Workbook tab button**

Add after Drills button:

```tsx
<button
  className={`${styles.tab} ${activeTab === 'workbook' ? styles.tabActive : ''}`}
  onClick={() => setActiveTab('workbook')}
>
  Workbook
</button>
```

**Step 4: Add Workbook tab content**

Add in content section:

```tsx
{activeTab === 'workbook' && <WorkbookHub />}
```

**Step 5: Run typecheck and build**

Run: `cd packages/client && npm run typecheck && npm run build`
Expected: Successful build

**Step 6: Commit**

```bash
git add packages/client/src/components/study/StudyHub.tsx
git commit -m "feat(ui): add Workbook tab to StudyHub"
```

---

## Phase 3-5: Remaining Implementation

The remaining phases follow the same task structure pattern. Due to length constraints, I'll summarize:

### Phase 3: Assessments
- Task 3.1: Implement QuickAssessment with timer and question navigation
- Task 3.2: Implement FullExam with 60-min timer and randomization
- Task 3.3: Create AssessmentResults summary component
- Task 3.4: Add timer hook with countdown display

### Phase 4: Integration
- Task 4.1: Integrate workbook mastery into readinessService.ts
- Task 4.2: Create WorkbookWidget for dashboard
- Task 4.3: Add benchmark comparison API endpoint
- Task 4.4: Display benchmark on dashboard and workbook progress

### Phase 5: Resources
- Task 5.1: Extract course/doc links from workbook PDF
- Task 5.2: Add workbookResources table and migration
- Task 5.3: Enhance FeedbackPanel with course links
- Task 5.4: Add "Official Questions" card to Practice tab

---

## Testing Strategy

Run after each phase:

```bash
# Server tests
cd packages/server && npm run test

# Client typecheck
cd packages/client && npm run typecheck

# Full build
npm run build

# Manual testing
npm run dev
# Navigate to /study -> Workbook tab
```

## Deployment

After all phases complete:

```bash
# Run workbook questions migration (already done)
npm run db:add-workbook

# Run progress tables migration
cd packages/server && npm run db:add-workbook-progress

# Deploy
npm run build
```
