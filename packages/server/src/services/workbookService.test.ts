import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

// Mock db module before importing service
vi.mock('../db/index.js', () => {
  return {
    db: null as unknown,
    schema,
  };
});

import * as dbModule from '../db/index.js';
import {
  getWorkbookQuestions,
  getWorkbookProgressForUser,
  submitWorkbookAnswer,
  submitWorkbookAnswersBatch,
  resetWorkbookProgress,
  getNextGuidedQuestion,
} from './workbookService.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      description TEXT,
      provider TEXT NOT NULL DEFAULT 'gcp',
      exam_duration_minutes INTEGER NOT NULL DEFAULT 120,
      total_questions INTEGER NOT NULL DEFAULT 50,
      passing_score_percent INTEGER DEFAULT 70,
      is_active INTEGER DEFAULT 1,
      capabilities TEXT NOT NULL DEFAULT '{"hasCaseStudies":false}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certification_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL
    );
    CREATE TABLE topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      domain_id INTEGER NOT NULL,
      case_study_id INTEGER,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answers TEXT NOT NULL,
      explanation TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      cloud_services TEXT,
      is_generated INTEGER DEFAULT 1,
      source TEXT DEFAULT 'generated',
      thumbs_up_count INTEGER NOT NULL DEFAULT 0,
      thumbs_down_count INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      empirical_difficulty TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      picture TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE workbook_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      first_attempt_correct INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_correct INTEGER,
      mastery_level TEXT NOT NULL DEFAULT 'unattempted',
      first_attempt_at INTEGER,
      last_attempt_at INTEGER
    );
    CREATE UNIQUE INDEX workbook_progress_user_question_idx ON workbook_progress(user_id, question_id);
    CREATE TABLE workbook_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certification_id INTEGER NOT NULL,
      cloud_service TEXT NOT NULL,
      courses TEXT,
      skill_badges TEXT,
      documentation_links TEXT
    );
  `);
  return drizzle(sqlite, { schema });
}

function seedBaseData(db: ReturnType<typeof createTestDb>) {
  const now = new Date();

  db.insert(schema.certifications)
    .values({
      id: 1,
      code: 'ACE',
      name: 'Associate Cloud Engineer',
      shortName: 'ACE',
      provider: 'gcp',
      createdAt: now,
    })
    .run();

  db.insert(schema.domains)
    .values({
      id: 1,
      certificationId: 1,
      code: 'D1',
      name: 'Setting up a cloud solution',
      weight: 0.22,
      orderIndex: 1,
    })
    .run();

  db.insert(schema.topics)
    .values({ id: 1, domainId: 1, code: 'T1', name: 'Creating projects' })
    .run();

  db.insert(schema.users)
    .values({
      id: 1,
      googleId: 'g1',
      email: 'test@test.com',
      name: 'Test User',
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function seedWorkbookQuestions(db: ReturnType<typeof createTestDb>, count: number = 5) {
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    db.insert(schema.questions)
      .values({
        id: i,
        topicId: 1,
        domainId: 1,
        questionText: `Workbook Q${i}`,
        questionType: i % 2 === 0 ? 'multiple' : 'single',
        options: JSON.stringify(['Option A', 'Option B', 'Option C', 'Option D']),
        correctAnswers: i % 2 === 0 ? JSON.stringify([0, 2]) : JSON.stringify([1]),
        explanation: `Explanation for Q${i}`,
        difficulty: 'medium',
        cloudServices: JSON.stringify(['Compute Engine']),
        source: 'workbook',
        createdAt: now,
      })
      .run();
  }
}

describe('workbookService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    (dbModule as { db: typeof db }).db = db;
    seedBaseData(db);
  });

  describe('getWorkbookQuestions', () => {
    it('should return empty array when no workbook questions exist', async () => {
      const result = await getWorkbookQuestions(1);
      expect(result).toEqual([]);
    });

    it('should return workbook questions with parsed JSON fields', async () => {
      seedWorkbookQuestions(db, 3);

      const result = await getWorkbookQuestions(1);
      expect(result).toHaveLength(3);

      expect(result[0].questionText).toBe('Workbook Q1');
      expect(result[0].options).toEqual(['Option A', 'Option B', 'Option C', 'Option D']);
      expect(result[0].correctAnswers).toEqual([1]);
      expect(result[0].cloudServices).toEqual(['Compute Engine']);
      expect(result[0].domain.id).toBe(1);
      expect(result[0].domain.code).toBe('D1');
      expect(result[0].topic.id).toBe(1);
    });

    it('should only return workbook-sourced questions', async () => {
      seedWorkbookQuestions(db, 2);

      // Add a non-workbook question
      db.insert(schema.questions)
        .values({
          id: 100,
          topicId: 1,
          domainId: 1,
          questionText: 'Generated Q',
          questionType: 'single',
          options: '["A","B"]',
          correctAnswers: '[0]',
          explanation: 'E',
          difficulty: 'easy',
          source: 'generated',
          createdAt: new Date(),
        })
        .run();

      const result = await getWorkbookQuestions(1);
      expect(result).toHaveLength(2);
      expect(result.every((q) => q.questionText.startsWith('Workbook'))).toBe(true);
    });

    it('should assign sequential orderIndex', async () => {
      seedWorkbookQuestions(db, 5);

      const result = await getWorkbookQuestions(1);
      expect(result.map((q) => q.orderIndex)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('getWorkbookProgressForUser', () => {
    it('should return all questions as unattempted when no progress exists', async () => {
      seedWorkbookQuestions(db, 3);

      const { questions, summary } = await getWorkbookProgressForUser(1, 1);

      expect(questions).toHaveLength(3);
      for (const q of questions) {
        expect(q.progress.masteryLevel).toBe('unattempted');
        expect(q.progress.attempts).toBe(0);
      }

      expect(summary.total).toBe(3);
      expect(summary.unattempted).toBe(3);
      expect(summary.mastered).toBe(0);
      expect(summary.percentComplete).toBe(0);
    });

    it('should include progress data for attempted questions', async () => {
      seedWorkbookQuestions(db, 3);

      db.insert(schema.workbookProgress)
        .values({
          userId: 1,
          questionId: 1,
          masteryLevel: 'mastered',
          attempts: 1,
          firstAttemptCorrect: true,
          lastAttemptCorrect: true,
          firstAttemptAt: new Date(),
          lastAttemptAt: new Date(),
        })
        .run();

      const { questions, summary } = await getWorkbookProgressForUser(1, 1);

      const q1 = questions.find((q) => q.id === 1)!;
      expect(q1.progress.masteryLevel).toBe('mastered');
      expect(q1.progress.attempts).toBe(1);
      expect(q1.progress.firstAttemptCorrect).toBe(true);

      expect(summary.mastered).toBe(1);
      expect(summary.unattempted).toBe(2);
      expect(summary.percentComplete).toBe(33); // 1/3 = 33%
    });

    it('should calculate percentComplete correctly', async () => {
      seedWorkbookQuestions(db, 4);

      // 2 mastered + 1 learned = 3/4 = 75%
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 1, masteryLevel: 'mastered', attempts: 1 })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 2, masteryLevel: 'mastered', attempts: 1 })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 3, masteryLevel: 'learned', attempts: 2 })
        .run();

      const { summary } = await getWorkbookProgressForUser(1, 1);

      expect(summary.mastered).toBe(2);
      expect(summary.learned).toBe(1);
      expect(summary.unattempted).toBe(1);
      expect(summary.percentComplete).toBe(75);
    });
  });

  describe('submitWorkbookAnswer', () => {
    it('should mark correct single-choice answer and set mastered on first attempt', async () => {
      seedWorkbookQuestions(db, 1);

      const result = await submitWorkbookAnswer(1, 1, [1]); // Q1 correct answer is [1]

      expect(result.isCorrect).toBe(true);
      expect(result.masteryLevel).toBe('mastered');
      expect(result.isFirstAttempt).toBe(true);
      expect(result.correctAnswers).toEqual([1]);
      expect(result.explanation).toBe('Explanation for Q1');
    });

    it('should mark incorrect answer and set needs_work', async () => {
      seedWorkbookQuestions(db, 1);

      const result = await submitWorkbookAnswer(1, 1, [0]); // Wrong answer

      expect(result.isCorrect).toBe(false);
      expect(result.masteryLevel).toBe('needs_work');
      expect(result.isFirstAttempt).toBe(true);
    });

    it('should set learned when correct on second attempt', async () => {
      seedWorkbookQuestions(db, 1);

      // First attempt (wrong)
      await submitWorkbookAnswer(1, 1, [0]);
      // Second attempt (correct)
      const result = await submitWorkbookAnswer(1, 1, [1]);

      expect(result.isCorrect).toBe(true);
      expect(result.masteryLevel).toBe('learned');
      expect(result.isFirstAttempt).toBe(false);
    });

    it('should correctly verify multi-choice answers', async () => {
      seedWorkbookQuestions(db, 2);
      // Q2 is multiple choice with correct answers [0, 2]

      const correct = await submitWorkbookAnswer(1, 2, [0, 2]);
      expect(correct.isCorrect).toBe(true);

      // Order shouldn't matter
      const correctReversed = await submitWorkbookAnswer(1, 2, [2, 0]);
      expect(correctReversed.isCorrect).toBe(true);
    });

    it('should reject partial multi-choice answers', async () => {
      seedWorkbookQuestions(db, 2);

      const result = await submitWorkbookAnswer(1, 2, [0]); // Missing [2]
      expect(result.isCorrect).toBe(false);
    });

    it('should throw for non-workbook question', async () => {
      db.insert(schema.questions)
        .values({
          id: 99,
          topicId: 1,
          domainId: 1,
          questionText: 'Generated Q',
          questionType: 'single',
          options: '["A","B"]',
          correctAnswers: '[0]',
          explanation: 'E',
          difficulty: 'easy',
          source: 'generated',
          createdAt: new Date(),
        })
        .run();

      await expect(submitWorkbookAnswer(1, 99, [0])).rejects.toThrow('Workbook question not found');
    });

    it('should increment attempts counter', async () => {
      seedWorkbookQuestions(db, 1);

      await submitWorkbookAnswer(1, 1, [0]);
      await submitWorkbookAnswer(1, 1, [0]);
      await submitWorkbookAnswer(1, 1, [1]);

      const [progress] = db.select().from(schema.workbookProgress).all();
      expect(progress.attempts).toBe(3);
    });
  });

  describe('submitWorkbookAnswersBatch', () => {
    it('should process multiple answers in single transaction', () => {
      seedWorkbookQuestions(db, 3);

      const results = submitWorkbookAnswersBatch(1, [
        { questionId: 1, selectedAnswers: [1] }, // correct
        { questionId: 2, selectedAnswers: [0, 2] }, // correct
        { questionId: 3, selectedAnswers: [0] }, // correct (Q3 is single, correct is [1]) → wrong
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].isCorrect).toBe(true);
      expect(results[0].masteryLevel).toBe('mastered');
      expect(results[1].isCorrect).toBe(true);
      expect(results[1].masteryLevel).toBe('mastered');
      expect(results[2].isCorrect).toBe(false);
      expect(results[2].masteryLevel).toBe('needs_work');
    });

    it('should throw if any question is not found', () => {
      seedWorkbookQuestions(db, 1);

      expect(() =>
        submitWorkbookAnswersBatch(1, [
          { questionId: 1, selectedAnswers: [1] },
          { questionId: 999, selectedAnswers: [0] },
        ])
      ).toThrow('Workbook question not found: 999');
    });

    it('should handle duplicate questionIds in same batch', () => {
      seedWorkbookQuestions(db, 1);

      const results = submitWorkbookAnswersBatch(1, [
        { questionId: 1, selectedAnswers: [0] }, // wrong, first attempt
        { questionId: 1, selectedAnswers: [1] }, // correct, second attempt
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].isFirstAttempt).toBe(true);
      expect(results[0].masteryLevel).toBe('needs_work');
      expect(results[1].isFirstAttempt).toBe(false);
      expect(results[1].masteryLevel).toBe('learned');
    });

    it('should create progress records for all questions', () => {
      seedWorkbookQuestions(db, 3);

      submitWorkbookAnswersBatch(1, [
        { questionId: 1, selectedAnswers: [1] },
        { questionId: 2, selectedAnswers: [0, 2] },
        { questionId: 3, selectedAnswers: [1] },
      ]);

      const progress = db.select().from(schema.workbookProgress).all();
      expect(progress).toHaveLength(3);
    });
  });

  describe('resetWorkbookProgress', () => {
    it('should delete all progress for a user', async () => {
      seedWorkbookQuestions(db, 3);

      // Create progress
      for (let i = 1; i <= 3; i++) {
        db.insert(schema.workbookProgress)
          .values({ userId: 1, questionId: i, masteryLevel: 'mastered', attempts: 1 })
          .run();
      }

      await resetWorkbookProgress(1);

      const progress = db.select().from(schema.workbookProgress).all();
      expect(progress).toHaveLength(0);
    });

    it('should not affect other users progress', async () => {
      seedWorkbookQuestions(db, 1);

      // Add user 2
      db.insert(schema.users)
        .values({
          id: 2,
          googleId: 'g2',
          email: 'test2@test.com',
          name: 'User 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 1, masteryLevel: 'mastered', attempts: 1 })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 2, questionId: 1, masteryLevel: 'learned', attempts: 2 })
        .run();

      await resetWorkbookProgress(1);

      const progress = db.select().from(schema.workbookProgress).all();
      expect(progress).toHaveLength(1);
      expect(progress[0].userId).toBe(2);
    });
  });

  describe('getNextGuidedQuestion', () => {
    it('should return first unattempted question', async () => {
      seedWorkbookQuestions(db, 5);

      // Mark Q1 and Q2 as attempted
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 1, masteryLevel: 'mastered', attempts: 1 })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 2, masteryLevel: 'needs_work', attempts: 1 })
        .run();

      const result = await getNextGuidedQuestion(1, 1);

      expect(result.question).not.toBeNull();
      expect(result.question!.id).toBe(3);
      expect(result.currentIndex).toBe(3);
      expect(result.totalQuestions).toBe(5);
    });

    it('should return null question when all attempted', async () => {
      seedWorkbookQuestions(db, 2);

      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 1, masteryLevel: 'mastered', attempts: 1 })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 2, masteryLevel: 'learned', attempts: 2 })
        .run();

      const result = await getNextGuidedQuestion(1, 1);

      expect(result.question).toBeNull();
      expect(result.currentIndex).toBe(2); // total length
      expect(result.totalQuestions).toBe(2);
    });

    it('should return first question when none attempted', async () => {
      seedWorkbookQuestions(db, 3);

      const result = await getNextGuidedQuestion(1, 1);

      expect(result.question).not.toBeNull();
      expect(result.question!.id).toBe(1);
      expect(result.currentIndex).toBe(1);
    });
  });
});
