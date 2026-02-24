import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { ACHIEVEMENT_XP_REWARDS } from '@ace-prep/shared';

// Mock db module
vi.mock('../db/index.js', () => {
  return {
    db: null as unknown,
    schema,
  };
});

// Mock xpService to avoid its own db dependency
vi.mock('./xpService.js', () => {
  return {
    awardCustomXP: vi.fn().mockResolvedValue({
      awarded: 25,
      totalXp: 25,
      currentLevel: 1,
      levelTitle: 'Novice',
    }),
  };
});

import * as dbModule from '../db/index.js';
import { checkAndUnlock, type AchievementContext } from './achievementService.js';
import { awardCustomXP } from './xpService.js';

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
    CREATE TABLE user_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_code TEXT NOT NULL,
      xp_awarded INTEGER NOT NULL,
      unlocked_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX user_achievements_user_code_idx ON user_achievements(user_id, achievement_code);
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

describe('achievementService', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    (dbModule as { db: typeof db }).db = db;
    seedUser(db);
    vi.mocked(awardCustomXP).mockClear();
  });

  describe('checkAndUnlock - first_activity', () => {
    it('should unlock first-steps on exam completion', async () => {
      const ctx: AchievementContext = { activity: 'exam' };
      const unlocked = await checkAndUnlock(1, ctx);

      const firstSteps = unlocked.find((u) => u.code === 'first-steps');
      expect(firstSteps).toBeDefined();
      expect(firstSteps!.name).toBe('First Steps');
      expect(firstSteps!.rarity).toBe('common');
      expect(firstSteps!.xpAwarded).toBe(ACHIEVEMENT_XP_REWARDS.common);
    });

    it('should unlock first-steps on study session', async () => {
      const ctx: AchievementContext = { activity: 'study' };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'first-steps')).toBe(true);
    });

    it('should NOT unlock first-steps on drill or review alone', async () => {
      const ctx: AchievementContext = { activity: 'drill' };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'first-steps')).toBe(false);
    });
  });

  describe('checkAndUnlock - perfect_score', () => {
    it('should unlock perfect-score for 100% exam', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        score: 50,
        totalQuestions: 50,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'perfect-score')).toBe(true);
    });

    it('should NOT unlock perfect-score for 99%', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        score: 49,
        totalQuestions: 50,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'perfect-score')).toBe(false);
    });

    it('should NOT unlock perfect-score for non-exam activity', async () => {
      const ctx: AchievementContext = {
        activity: 'study',
        score: 10,
        totalQuestions: 10,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'perfect-score')).toBe(false);
    });
  });

  describe('checkAndUnlock - streak', () => {
    it('should unlock consistent-7 at 7-day streak', async () => {
      const ctx: AchievementContext = { activity: 'exam', streak: 7 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'consistent-7')).toBe(true);
    });

    it('should unlock dedicated-30 at 30-day streak', async () => {
      const ctx: AchievementContext = { activity: 'exam', streak: 30 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'dedicated-30')).toBe(true);
    });

    it('should unlock century-streak at 100-day streak', async () => {
      const ctx: AchievementContext = { activity: 'exam', streak: 100 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'century-streak')).toBe(true);
    });

    it('should NOT unlock streak achievement below required days', async () => {
      const ctx: AchievementContext = { activity: 'exam', streak: 6 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'consistent-7')).toBe(false);
    });
  });

  describe('checkAndUnlock - domain_mastery', () => {
    it('should unlock domain-expert at 90% accuracy with 5+ attempts', async () => {
      const ctx: AchievementContext = {
        domainAccuracy: 92,
        domainAttempts: 10,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'domain-expert')).toBe(true);
    });

    it('should NOT unlock domain-expert below 90% accuracy', async () => {
      const ctx: AchievementContext = {
        domainAccuracy: 89,
        domainAttempts: 10,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'domain-expert')).toBe(false);
    });

    it('should NOT unlock domain-expert with fewer than 5 attempts', async () => {
      const ctx: AchievementContext = {
        domainAccuracy: 100,
        domainAttempts: 4,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'domain-expert')).toBe(false);
    });
  });

  describe('checkAndUnlock - speed', () => {
    it('should unlock speed-demon for perfect drill under 60s', async () => {
      const ctx: AchievementContext = {
        activity: 'drill',
        score: 10,
        totalQuestions: 10,
        durationSeconds: 55,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'speed-demon')).toBe(true);
    });

    it('should NOT unlock speed-demon if over 60 seconds', async () => {
      const ctx: AchievementContext = {
        activity: 'drill',
        score: 10,
        totalQuestions: 10,
        durationSeconds: 65,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'speed-demon')).toBe(false);
    });

    it('should NOT unlock speed-demon with imperfect accuracy', async () => {
      const ctx: AchievementContext = {
        activity: 'drill',
        score: 9,
        totalQuestions: 10,
        durationSeconds: 30,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'speed-demon')).toBe(false);
    });

    it('should NOT unlock speed-demon for non-drill activity', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        score: 10,
        totalQuestions: 10,
        durationSeconds: 30,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'speed-demon')).toBe(false);
    });
  });

  describe('checkAndUnlock - time_of_day', () => {
    it('should unlock night-owl between midnight and 5 AM', async () => {
      const ctx: AchievementContext = { activity: 'exam', timeOfDay: 2 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'night-owl')).toBe(true);
    });

    it('should unlock early-bird between 5 AM and 7 AM', async () => {
      const ctx: AchievementContext = { activity: 'exam', timeOfDay: 6 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'early-bird')).toBe(true);
    });

    it('should NOT unlock night-owl at 5 AM (exclusive upper bound)', async () => {
      const ctx: AchievementContext = { activity: 'exam', timeOfDay: 5 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'night-owl')).toBe(false);
    });

    it('should NOT unlock early-bird at 7 AM (exclusive upper bound)', async () => {
      const ctx: AchievementContext = { activity: 'exam', timeOfDay: 7 };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'early-bird')).toBe(false);
    });
  });

  describe('checkAndUnlock - cumulative_count', () => {
    it('should unlock reviewer-100 at 100 SR reviews', async () => {
      const ctx: AchievementContext = {
        activity: 'review',
        cumulativeSrReviews: 100,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'reviewer-100')).toBe(true);
    });

    it('should unlock exam-veteran at 10 exams', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        cumulativeExams: 10,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'exam-veteran')).toBe(true);
    });

    it('should NOT unlock exam-veteran below 10 exams', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        cumulativeExams: 9,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'exam-veteran')).toBe(false);
    });
  });

  describe('checkAndUnlock - path_completion', () => {
    it('should unlock completionist when pathComplete is true', async () => {
      const ctx: AchievementContext = { pathComplete: true };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'completionist')).toBe(true);
    });

    it('should NOT unlock completionist when pathComplete is false', async () => {
      const ctx: AchievementContext = { pathComplete: false };
      const unlocked = await checkAndUnlock(1, ctx);

      expect(unlocked.some((u) => u.code === 'completionist')).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should not re-unlock already unlocked achievements', async () => {
      // Unlock first-steps
      const first = await checkAndUnlock(1, { activity: 'exam' });
      const hasFirstSteps = first.some((u) => u.code === 'first-steps');
      expect(hasFirstSteps).toBe(true);

      // Call again with same context
      const second = await checkAndUnlock(1, { activity: 'exam' });
      const secondHas = second.some((u) => u.code === 'first-steps');
      expect(secondHas).toBe(false);
    });

    it('should award XP once per achievement unlock', async () => {
      await checkAndUnlock(1, { activity: 'exam' });
      await checkAndUnlock(1, { activity: 'exam' });

      // awardCustomXP should only be called for the first unlock of each achievement
      const firstStepsCalls = vi
        .mocked(awardCustomXP)
        .mock.calls.filter((c) => c[2] === 'achievement:first-steps');
      expect(firstStepsCalls).toHaveLength(1);
    });
  });

  describe('XP awards by rarity', () => {
    it('should award correct XP for common achievement', async () => {
      await checkAndUnlock(1, { activity: 'exam' });

      // first-steps is common
      const call = vi
        .mocked(awardCustomXP)
        .mock.calls.find((c) => c[2] === 'achievement:first-steps');
      expect(call).toBeDefined();
      expect(call![1]).toBe(ACHIEVEMENT_XP_REWARDS.common); // 25
    });

    it('should award correct XP for rare achievement', async () => {
      await checkAndUnlock(1, {
        activity: 'exam',
        score: 50,
        totalQuestions: 50,
      });

      // perfect-score is rare
      const call = vi
        .mocked(awardCustomXP)
        .mock.calls.find((c) => c[2] === 'achievement:perfect-score');
      expect(call).toBeDefined();
      expect(call![1]).toBe(ACHIEVEMENT_XP_REWARDS.rare); // 50
    });

    it('should award correct XP for epic achievement', async () => {
      await checkAndUnlock(1, {
        activity: 'drill',
        score: 10,
        totalQuestions: 10,
        durationSeconds: 30,
      });

      // speed-demon is epic
      const call = vi
        .mocked(awardCustomXP)
        .mock.calls.find((c) => c[2] === 'achievement:speed-demon');
      expect(call).toBeDefined();
      expect(call![1]).toBe(ACHIEVEMENT_XP_REWARDS.epic); // 100
    });
  });

  describe('multiple achievements in one call', () => {
    it('should unlock multiple achievements when multiple criteria match', async () => {
      const ctx: AchievementContext = {
        activity: 'exam',
        score: 50,
        totalQuestions: 50,
        streak: 7,
        timeOfDay: 3,
        cumulativeExams: 10,
      };
      const unlocked = await checkAndUnlock(1, ctx);

      const codes = unlocked.map((u) => u.code);
      expect(codes).toContain('first-steps');
      expect(codes).toContain('perfect-score');
      expect(codes).toContain('consistent-7');
      expect(codes).toContain('night-owl');
      expect(codes).toContain('exam-veteran');
    });
  });
});
