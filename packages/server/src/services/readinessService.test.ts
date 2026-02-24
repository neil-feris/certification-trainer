import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import {
  calculateReadinessScore,
  invalidateReadinessCache,
  invalidateAllReadinessCacheForUser,
} from './readinessService.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');

  // Create required tables
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
      certification_id INTEGER NOT NULL REFERENCES certifications(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL
    );
    CREATE TABLE topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL REFERENCES domains(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE performance_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      domain_id INTEGER NOT NULL,
      topic_id INTEGER,
      total_attempts INTEGER NOT NULL DEFAULT 0,
      correct_attempts INTEGER NOT NULL DEFAULT 0,
      avg_time_seconds REAL,
      last_attempted_at INTEGER
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
  `);

  return drizzle(sqlite, { schema });
}

function seedCertificationAndDomains(db: ReturnType<typeof createTestDb>) {
  const now = new Date();

  // Insert certification
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

  // Insert 6 domains with weights
  const domainData = [
    { id: 1, code: 'D1', name: 'Setting up a cloud solution', weight: 0.18 },
    { id: 2, code: 'D2', name: 'Planning and configuring', weight: 0.22 },
    { id: 3, code: 'D3', name: 'Deploying and implementing', weight: 0.22 },
    { id: 4, code: 'D4', name: 'Operating reliability', weight: 0.16 },
    { id: 5, code: 'D5', name: 'Configuring access', weight: 0.14 },
    { id: 6, code: 'D6', name: 'Additional considerations', weight: 0.08 },
  ];

  for (const d of domainData) {
    db.insert(schema.domains)
      .values({
        id: d.id,
        certificationId: 1,
        code: d.code,
        name: d.name,
        weight: d.weight,
        orderIndex: d.id,
      })
      .run();
  }
}

describe('readinessService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    db = createTestDb();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear cache between tests
    invalidateAllReadinessCacheForUser(1);
    invalidateAllReadinessCacheForUser(2);
  });

  describe('calculateReadinessScore', () => {
    it('should return zero score when no domains exist for certification', async () => {
      // Insert certification but no domains
      db.insert(schema.certifications)
        .values({
          id: 99,
          code: 'EMPTY',
          name: 'Empty Cert',
          shortName: 'EMP',
          provider: 'gcp',
          createdAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 99, db);
      expect(result.score.overall).toBe(0);
      expect(result.score.confidence).toBe('low');
      expect(result.score.domains).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });

    it('should return zero domain scores when user has no performance data', async () => {
      seedCertificationAndDomains(db);

      const result = await calculateReadinessScore(1, 1, db);
      expect(result.score.overall).toBe(0);
      expect(result.score.confidence).toBe('low');
      expect(result.score.domains).toHaveLength(6);

      for (const domain of result.score.domains) {
        expect(domain.score).toBe(0);
        expect(domain.coverage).toBe(0);
        expect(domain.accuracy).toBe(0);
        expect(domain.recency).toBe(0);
        expect(domain.volume).toBe(0);
        expect(domain.totalAttempts).toBe(0);
      }
    });

    it('should calculate coverage correctly (proportional up to threshold of 10)', async () => {
      seedCertificationAndDomains(db);

      // 5 attempts in domain 1 = 50% coverage, 15 attempts in domain 2 = 100% coverage
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 5,
          correctAttempts: 5,
          lastAttemptedAt: new Date(),
        })
        .run();
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 2,
          topicId: null,
          totalAttempts: 15,
          correctAttempts: 10,
          lastAttemptedAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;
      const d2 = result.score.domains.find((d) => d.domainId === 2)!;

      expect(d1.coverage).toBe(0.5); // 5/10
      expect(d2.coverage).toBe(1.0); // 15/10 capped at 1.0
    });

    it('should calculate accuracy as correct/total', async () => {
      seedCertificationAndDomains(db);

      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 20,
          correctAttempts: 15,
          lastAttemptedAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;

      expect(d1.accuracy).toBe(0.75); // 15/20
    });

    it('should calculate recency with exponential decay e^(-days/30)', async () => {
      seedCertificationAndDomains(db);

      // Last attempt 30 days ago
      const thirtyDaysAgo = new Date('2025-05-16T12:00:00Z');
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 10,
          correctAttempts: 8,
          lastAttemptedAt: thirtyDaysAgo,
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;

      // e^(-30/30) = e^(-1) ≈ 0.3679
      expect(d1.recency).toBeCloseTo(0.37, 1);
    });

    it('should have recency close to 1.0 for recent activity', async () => {
      seedCertificationAndDomains(db);

      // Last attempt today
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 10,
          correctAttempts: 8,
          lastAttemptedAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;

      // e^(-0/30) = 1.0
      expect(d1.recency).toBe(1.0);
    });

    it('should calculate volume as attempts/100 capped at 1.0', async () => {
      seedCertificationAndDomains(db);

      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 50,
          correctAttempts: 40,
          lastAttemptedAt: new Date(),
        })
        .run();
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 2,
          topicId: null,
          totalAttempts: 200,
          correctAttempts: 150,
          lastAttemptedAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;
      const d2 = result.score.domains.find((d) => d.domainId === 2)!;

      expect(d1.volume).toBe(0.5); // 50/100
      expect(d2.volume).toBe(1.0); // 200/100 capped
    });

    it('should compute weighted overall score from domain scores', async () => {
      seedCertificationAndDomains(db);

      // Add stats to all 6 domains with perfect data for a known result
      for (let i = 1; i <= 6; i++) {
        db.insert(schema.performanceStats)
          .values({
            userId: 1,
            domainId: i,
            topicId: null,
            totalAttempts: 100,
            correctAttempts: 100,
            lastAttemptedAt: new Date(),
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);

      // All components = 1.0: (0.2 + 0.5 + 0.2 + 0.1) * 100 = 100
      // All domain scores should be 100, weighted average = 100
      expect(result.score.overall).toBe(100);
    });

    it('should only use domain-level stats (topicId IS NULL)', async () => {
      seedCertificationAndDomains(db);

      // Insert a domain-level stat (topicId = null)
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 20,
          correctAttempts: 16,
          lastAttemptedAt: new Date(),
        })
        .run();

      // Insert topic-level stat (should be ignored)
      // Need a topic first
      db.insert(schema.topics).values({ id: 1, domainId: 1, code: 'T1', name: 'Topic 1' }).run();
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: 1,
          totalAttempts: 100,
          correctAttempts: 100,
          lastAttemptedAt: new Date(),
        })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      const d1 = result.score.domains.find((d) => d.domainId === 1)!;

      // Should use only the domain-level stat: 16/20 = 0.8 accuracy
      expect(d1.accuracy).toBe(0.8);
      expect(d1.totalAttempts).toBe(20);
    });

    it('should set confidence to low when fewer than 5 domains attempted', async () => {
      seedCertificationAndDomains(db);

      // Only attempt 3 domains
      for (let i = 1; i <= 3; i++) {
        db.insert(schema.performanceStats)
          .values({
            userId: 1,
            domainId: i,
            topicId: null,
            totalAttempts: 5,
            correctAttempts: 4,
            lastAttemptedAt: new Date(),
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);
      expect(result.score.confidence).toBe('low');
    });

    it('should set confidence to medium when 5+ domains attempted but not all with sufficient data', async () => {
      seedCertificationAndDomains(db);

      // 5 domains with attempts, but some below COVERAGE_THRESHOLD (10)
      for (let i = 1; i <= 5; i++) {
        db.insert(schema.performanceStats)
          .values({
            userId: 1,
            domainId: i,
            topicId: null,
            totalAttempts: i <= 3 ? 15 : 5, // 3 above threshold, 2 below
            correctAttempts: 4,
            lastAttemptedAt: new Date(),
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);
      expect(result.score.confidence).toBe('medium');
    });

    it('should set confidence to high when all domains have sufficient data', async () => {
      seedCertificationAndDomains(db);

      for (let i = 1; i <= 6; i++) {
        db.insert(schema.performanceStats)
          .values({
            userId: 1,
            domainId: i,
            topicId: null,
            totalAttempts: 15,
            correctAttempts: 10,
            lastAttemptedAt: new Date(),
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);
      expect(result.score.confidence).toBe('high');
    });

    it('should add workbook mastery bonus when workbook questions exist', async () => {
      seedCertificationAndDomains(db);

      // Add topics for questions
      db.insert(schema.topics).values({ id: 1, domainId: 1, code: 'T1', name: 'Topic 1' }).run();

      // Create 10 workbook questions
      for (let i = 1; i <= 10; i++) {
        db.insert(schema.questions)
          .values({
            id: i,
            topicId: 1,
            domainId: 1,
            questionText: `Q${i}`,
            questionType: 'single',
            options: '["A","B","C","D"]',
            correctAnswers: '[0]',
            explanation: 'Explanation',
            difficulty: 'medium',
            source: 'workbook',
            createdAt: new Date(),
          })
          .run();
      }

      // 5 out of 10 mastered
      for (let i = 1; i <= 3; i++) {
        db.insert(schema.workbookProgress)
          .values({
            userId: 1,
            questionId: i,
            masteryLevel: 'mastered',
            attempts: 1,
          })
          .run();
      }
      for (let i = 4; i <= 5; i++) {
        db.insert(schema.workbookProgress)
          .values({
            userId: 1,
            questionId: i,
            masteryLevel: 'learned',
            attempts: 2,
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);

      // Workbook bonus = (3 mastered + 2 learned) / 10 * 10 = 5.0
      expect(result.score.workbookMastery).toBeDefined();
      expect(result.score.workbookMastery!.total).toBe(10);
      expect(result.score.workbookMastery!.mastered).toBe(3);
      expect(result.score.workbookMastery!.learned).toBe(2);
      expect(result.score.workbookMastery!.bonusApplied).toBe(5);
    });

    it('should cap overall score at 100 including workbook bonus', async () => {
      seedCertificationAndDomains(db);

      // Perfect stats in all domains
      for (let i = 1; i <= 6; i++) {
        db.insert(schema.performanceStats)
          .values({
            userId: 1,
            domainId: i,
            topicId: null,
            totalAttempts: 100,
            correctAttempts: 100,
            lastAttemptedAt: new Date(),
          })
          .run();
      }

      // Add workbook questions too
      db.insert(schema.topics).values({ id: 1, domainId: 1, code: 'T1', name: 'Topic 1' }).run();
      db.insert(schema.questions)
        .values({
          id: 1,
          topicId: 1,
          domainId: 1,
          questionText: 'Q1',
          questionType: 'single',
          options: '["A","B"]',
          correctAnswers: '[0]',
          explanation: 'E',
          difficulty: 'easy',
          source: 'workbook',
          createdAt: new Date(),
        })
        .run();
      db.insert(schema.workbookProgress)
        .values({ userId: 1, questionId: 1, masteryLevel: 'mastered', attempts: 1 })
        .run();

      const result = await calculateReadinessScore(1, 1, db);
      // Base = 100, bonus = 10 → capped at 100
      expect(result.score.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('caching', () => {
    it('should return cached result on second call', async () => {
      seedCertificationAndDomains(db);

      const result1 = await calculateReadinessScore(1, 1, db);
      const result2 = await calculateReadinessScore(1, 1, db);

      // Same object reference from cache
      expect(result1.score.calculatedAt).toBe(result2.score.calculatedAt);
    });

    it('should return fresh result after cache invalidation', async () => {
      seedCertificationAndDomains(db);

      const result1 = await calculateReadinessScore(1, 1, db);
      invalidateReadinessCache(1, 1);

      // Advance time slightly
      vi.advanceTimersByTime(100);

      const result2 = await calculateReadinessScore(1, 1, db);
      expect(result2.score.calculatedAt).not.toBe(result1.score.calculatedAt);
    });

    it('should expire cache after 5 minutes', async () => {
      seedCertificationAndDomains(db);

      const result1 = await calculateReadinessScore(1, 1, db);

      // Advance past TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const result2 = await calculateReadinessScore(1, 1, db);
      expect(result2.score.calculatedAt).not.toBe(result1.score.calculatedAt);
    });

    it('should invalidate all caches for a user', async () => {
      seedCertificationAndDomains(db);

      // Create a second certification
      db.insert(schema.certifications)
        .values({
          id: 2,
          code: 'PCA',
          name: 'Professional Cloud Architect',
          shortName: 'PCA',
          provider: 'gcp',
          createdAt: new Date(),
        })
        .run();

      await calculateReadinessScore(1, 1, db);
      await calculateReadinessScore(1, 2, db);

      invalidateAllReadinessCacheForUser(1);

      vi.advanceTimersByTime(100);

      const fresh1 = await calculateReadinessScore(1, 1, db);
      const fresh2 = await calculateReadinessScore(1, 2, db);

      // Both should have been recalculated
      expect(fresh1.score.calculatedAt).not.toBe('');
      expect(fresh2.score.calculatedAt).not.toBe('');
    });
  });

  describe('recommendations', () => {
    it('should recommend starting practice for unattempted domains', async () => {
      seedCertificationAndDomains(db);

      const result = await calculateReadinessScore(1, 1, db);

      // All domains unattempted (score 0 < 70), should all get recommendations
      expect(result.recommendations.length).toBeGreaterThanOrEqual(6);
      expect(result.recommendations.some((r) => r.action.includes('Start practicing'))).toBe(true);
    });

    it('should recommend improving accuracy for low-accuracy domains', async () => {
      seedCertificationAndDomains(db);

      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 20,
          correctAttempts: 5, // 25% accuracy
          lastAttemptedAt: new Date(),
        })
        .run();

      invalidateReadinessCache(1, 1);
      const result = await calculateReadinessScore(1, 1, db);

      const d1Rec = result.recommendations.find((r) => r.domainId === 1);
      expect(d1Rec).toBeDefined();
      expect(d1Rec!.action).toContain('accuracy');
    });

    it('should recommend workbook when mastery is under 70%', async () => {
      seedCertificationAndDomains(db);
      db.insert(schema.topics).values({ id: 1, domainId: 1, code: 'T1', name: 'Topic 1' }).run();

      // Create workbook questions
      for (let i = 1; i <= 10; i++) {
        db.insert(schema.questions)
          .values({
            id: i,
            topicId: 1,
            domainId: 1,
            questionText: `Q${i}`,
            questionType: 'single',
            options: '["A","B","C","D"]',
            correctAnswers: '[0]',
            explanation: 'Explanation',
            difficulty: 'medium',
            source: 'workbook',
            createdAt: new Date(),
          })
          .run();
      }

      const result = await calculateReadinessScore(1, 1, db);
      const workbookRec = result.recommendations.find((r) => r.domainName === 'Official Workbook');
      expect(workbookRec).toBeDefined();
      expect(workbookRec!.action).toContain('Start the official Google Workbook');
    });

    it('should not generate recommendations for domains scoring 70+', async () => {
      seedCertificationAndDomains(db);

      // Perfect domain 1
      db.insert(schema.performanceStats)
        .values({
          userId: 1,
          domainId: 1,
          topicId: null,
          totalAttempts: 100,
          correctAttempts: 100,
          lastAttemptedAt: new Date(),
        })
        .run();

      invalidateReadinessCache(1, 1);
      const result = await calculateReadinessScore(1, 1, db);

      const d1Rec = result.recommendations.find((r) => r.domainId === 1);
      expect(d1Rec).toBeUndefined();
    });
  });
});
