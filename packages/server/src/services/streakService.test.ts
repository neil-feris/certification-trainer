import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { updateStreak, getStreak } from './streakService.js';

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
    CREATE TABLE user_streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_activity_date TEXT,
      updated_at INTEGER NOT NULL
    );
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

describe('streakService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    db = createTestDb();
    (dbModule as { db: typeof db }).db = db;
    seedUser(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStreak', () => {
    it('should return default zero values when no streak exists', async () => {
      const streak = await getStreak(1);
      expect(streak.currentStreak).toBe(0);
      expect(streak.longestStreak).toBe(0);
      expect(streak.lastActivityDate).toBeNull();
    });

    it('should return existing streak data', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 5,
          longestStreak: 12,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const streak = await getStreak(1);
      expect(streak.currentStreak).toBe(5);
      expect(streak.longestStreak).toBe(12);
      expect(streak.lastActivityDate).toBe('2025-06-14');
    });
  });

  describe('updateStreak', () => {
    it('should create streak of 1 for first-ever activity', async () => {
      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(1);
      expect(result.streak.longestStreak).toBe(1);
      expect(result.streak.lastActivityDate).toBe('2025-06-15');
      expect(result.streakUpdate.current).toBe(1);
    });

    it('should maintain streak on same-day activity', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 5,
          longestStreak: 10,
          lastActivityDate: '2025-06-15', // today
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(5);
      expect(result.streak.longestStreak).toBe(10);
      expect(result.streakUpdate.current).toBe(5);
      expect(result.streakUpdate.milestone).toBeUndefined();
    });

    it('should increment streak when last activity was yesterday', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 6,
          longestStreak: 6,
          lastActivityDate: '2025-06-14', // yesterday
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(7);
      expect(result.streak.longestStreak).toBe(7);
      expect(result.streak.lastActivityDate).toBe('2025-06-15');
    });

    it('should reset streak to 1 when gap of 2+ days', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 20,
          longestStreak: 20,
          lastActivityDate: '2025-06-12', // 3 days ago
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(1);
      // Longest should be preserved
      expect(result.streak.longestStreak).toBe(20);
    });

    it('should update longest streak when current exceeds it', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 10,
          longestStreak: 10,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(11);
      expect(result.streak.longestStreak).toBe(11);
    });

    it('should not reduce longest streak when current is reset', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 5,
          longestStreak: 50,
          lastActivityDate: '2025-06-10', // 5 days gap
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(1);
      expect(result.streak.longestStreak).toBe(50);
    });

    it('should detect 7-day milestone', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 6,
          longestStreak: 6,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(7);
      expect(result.streakUpdate.milestone).toBe(7);
    });

    it('should detect 30-day milestone', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 29,
          longestStreak: 29,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(30);
      expect(result.streakUpdate.milestone).toBe(30);
    });

    it('should detect 100-day milestone', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 99,
          longestStreak: 99,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(100);
      expect(result.streakUpdate.milestone).toBe(100);
    });

    it('should not report milestone for non-milestone values', async () => {
      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 4,
          longestStreak: 4,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);

      expect(result.streak.currentStreak).toBe(5);
      expect(result.streakUpdate.milestone).toBeUndefined();
    });

    it('should persist streak to database', async () => {
      await updateStreak(1);

      const [record] = db.select().from(schema.userStreaks).all();
      expect(record.currentStreak).toBe(1);
      expect(record.longestStreak).toBe(1);
      expect(record.lastActivityDate).toBe('2025-06-15');
    });

    it('should handle timezone-consistent date comparison', async () => {
      // Set time close to midnight UTC
      vi.setSystemTime(new Date('2025-06-15T23:59:59Z'));

      db.insert(schema.userStreaks)
        .values({
          userId: 1,
          currentStreak: 3,
          longestStreak: 3,
          lastActivityDate: '2025-06-14',
          updatedAt: new Date(),
        })
        .run();

      const result = await updateStreak(1);
      // Still June 15 in UTC, yesterday was June 14 → streak increments
      expect(result.streak.currentStreak).toBe(4);
    });
  });
});
