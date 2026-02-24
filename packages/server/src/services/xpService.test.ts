import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { XP_AWARDS } from '@ace-prep/shared';

// Mock db module before importing service
vi.mock('../db/index.js', () => {
  return {
    db: null as unknown,
    schema,
  };
});

// Dynamically set the db for each test
import * as dbModule from '../db/index.js';
import { awardXP, getXP, awardCustomXP } from './xpService.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
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
    CREATE TABLE user_xp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      total_xp INTEGER NOT NULL DEFAULT 0,
      current_level INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE xp_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX xp_history_user_source_idx ON xp_history(user_id, source);
  `);
  return drizzle(sqlite, { schema });
}

function seedUser(db: ReturnType<typeof createTestDb>) {
  db.insert(schema.users)
    .values({
      id: 1,
      googleId: 'g1',
      email: 'test@test.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

describe('xpService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    // Point the mock at our in-memory db
    (dbModule as { db: typeof db }).db = db;
    seedUser(db);
  });

  describe('getXP', () => {
    it('should return default level 1 when no XP record exists', async () => {
      const xp = await getXP(1);
      expect(xp.totalXp).toBe(0);
      expect(xp.currentLevel).toBe(1);
      expect(xp.levelTitle).toBe('Novice');
    });

    it('should return correct level info from existing XP record', async () => {
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 350, currentLevel: 3, updatedAt: new Date() })
        .run();

      const xp = await getXP(1);
      expect(xp.totalXp).toBe(350);
      expect(xp.currentLevel).toBe(3);
      expect(xp.levelTitle).toBe('Student');
    });

    it('should return max level info at high XP', async () => {
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 15000, currentLevel: 12, updatedAt: new Date() })
        .run();

      const xp = await getXP(1);
      expect(xp.currentLevel).toBe(12);
      expect(xp.levelTitle).toBe('Transcendent');
      expect(xp.xpToNextLevel).toBe(0);
      expect(xp.levelProgress).toBe(100);
    });
  });

  describe('awardXP', () => {
    it('should create new XP record for first-time award', async () => {
      const result = await awardXP(1, 'EXAM_COMPLETE');

      expect(result.awarded).toBe(XP_AWARDS.EXAM_COMPLETE); // 50
      expect(result.totalXp).toBe(50);
      expect(result.currentLevel).toBe(1);
    });

    it('should add XP to existing record', async () => {
      // Give user some existing XP
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 80, currentLevel: 1, updatedAt: new Date() })
        .run();

      const result = await awardXP(1, 'EXAM_COMPLETE');
      // 80 + 50 = 130 → level 2 (minXp 100)
      expect(result.awarded).toBe(50);
      expect(result.totalXp).toBe(130);
      expect(result.currentLevel).toBe(2);
    });

    it('should detect level-up and include newLevel/newTitle', async () => {
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 90, currentLevel: 1, updatedAt: new Date() })
        .run();

      const result = await awardXP(1, 'QUESTION_CORRECT');
      // 90 + 10 = 100 → level 2
      expect(result.newLevel).toBe(2);
      expect(result.newTitle).toBe('Apprentice');
    });

    it('should not include newLevel when no level-up occurs', async () => {
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 50, currentLevel: 1, updatedAt: new Date() })
        .run();

      const result = await awardXP(1, 'QUESTION_CORRECT');
      // 50 + 10 = 60 → still level 1
      expect(result.newLevel).toBeUndefined();
      expect(result.newTitle).toBeUndefined();
    });

    it('should record XP history', async () => {
      await awardXP(1, 'EXAM_COMPLETE');

      const history = db.select().from(schema.xpHistory).all();
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe(1);
      expect(history[0].amount).toBe(50);
      expect(history[0].source).toBe('EXAM_COMPLETE');
    });

    it('should handle different XP award types', async () => {
      const r1 = await awardXP(1, 'QUESTION_CORRECT');
      expect(r1.awarded).toBe(XP_AWARDS.QUESTION_CORRECT); // 10

      const r2 = await awardXP(1, 'QUESTION_INCORRECT');
      expect(r2.awarded).toBe(XP_AWARDS.QUESTION_INCORRECT); // 2

      const r3 = await awardXP(1, 'DRILL_COMPLETE');
      expect(r3.awarded).toBe(XP_AWARDS.DRILL_COMPLETE); // 20
    });

    it('should create record on first award for new user', async () => {
      const result = await awardXP(1, 'QUESTION_CORRECT');

      expect(result.totalXp).toBe(10);

      const [record] = db.select().from(schema.userXp).all();
      expect(record.userId).toBe(1);
      expect(record.totalXp).toBe(10);
    });
  });

  describe('awardCustomXP', () => {
    it('should award custom amount on first call', async () => {
      const result = await awardCustomXP(1, 100, 'achievement:perfect-score');

      expect(result).not.toBeNull();
      expect(result!.awarded).toBe(100);
      expect(result!.totalXp).toBe(100);
      expect(result!.currentLevel).toBe(2); // 100 XP = level 2
    });

    it('should return null on duplicate source (idempotent)', async () => {
      await awardCustomXP(1, 100, 'achievement:perfect-score');
      const result = await awardCustomXP(1, 100, 'achievement:perfect-score');

      expect(result).toBeNull();

      // Should only have 100 total, not 200
      const [xp] = db.select().from(schema.userXp).all();
      expect(xp.totalXp).toBe(100);
    });

    it('should detect level-up on custom award', async () => {
      db.insert(schema.userXp)
        .values({ userId: 1, totalXp: 280, currentLevel: 2, updatedAt: new Date() })
        .run();

      const result = await awardCustomXP(1, 25, 'achievement:first-steps');
      // 280 + 25 = 305 → level 3 (minXp 300)
      expect(result).not.toBeNull();
      expect(result!.newLevel).toBe(3);
      expect(result!.newTitle).toBe('Student');
    });

    it('should allow different sources for same user', async () => {
      await awardCustomXP(1, 25, 'achievement:first-steps');
      const result = await awardCustomXP(1, 50, 'achievement:perfect-score');

      expect(result).not.toBeNull();
      expect(result!.totalXp).toBe(75);
    });
  });
});
