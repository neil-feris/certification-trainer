import { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { ACHIEVEMENTS, ACHIEVEMENT_XP_REWARDS, type AchievementRarity } from '@ace-prep/shared';
import { authenticate } from '../middleware/auth.js';

export async function achievementRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  // GET /api/achievements - all definitions with user unlock status
  fastify.get('/', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    // Get user's unlocked achievements
    const userUnlocks = await db
      .select()
      .from(schema.userAchievements)
      .where(eq(schema.userAchievements.userId, userId))
      .all();

    const unlockMap = new Map(userUnlocks.map((u) => [u.achievementCode, u]));

    // Merge definitions with user status
    const badges = ACHIEVEMENTS.map((def) => {
      const unlock = unlockMap.get(def.code);
      return {
        code: def.code,
        name: def.name,
        description: def.description,
        rarity: def.rarity,
        icon: def.icon,
        criteria: def.criteria,
        earned: !!unlock,
        unlockedAt: unlock?.unlockedAt ?? null,
        xpAwarded: unlock?.xpAwarded ?? ACHIEVEMENT_XP_REWARDS[def.rarity as AchievementRarity],
      };
    });

    const earned = badges.filter((b) => b.earned);
    const locked = badges.filter((b) => !b.earned);

    return { badges, earned: earned.length, total: badges.length, locked: locked.length };
  });

  // GET /api/achievements/progress - progress toward locked achievements
  fastify.get('/progress', async (request) => {
    const userId = parseInt(request.user!.id, 10);

    // Get user's unlocked achievements
    const userUnlocks = await db
      .select({ achievementCode: schema.userAchievements.achievementCode })
      .from(schema.userAchievements)
      .where(eq(schema.userAchievements.userId, userId))
      .all();

    const unlockedCodes = new Set(userUnlocks.map((u) => u.achievementCode));

    // Get user stats for progress calculation
    const [examCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.exams)
      .where(and(eq(schema.exams.userId, userId), eq(schema.exams.status, 'completed')))
      .all();

    const [srReviewCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.spacedRepetition)
      .where(
        and(
          eq(schema.spacedRepetition.userId, userId),
          isNotNull(schema.spacedRepetition.lastReviewedAt)
        )
      )
      .all();

    // Get streak from user_streaks
    const [streakRow] = await db
      .select({ currentStreak: schema.userStreaks.currentStreak })
      .from(schema.userStreaks)
      .where(eq(schema.userStreaks.userId, userId))
      .all();

    const currentStreak = streakRow?.currentStreak ?? 0;

    // Build progress for locked achievements
    const progress = ACHIEVEMENTS.filter((def) => !unlockedCodes.has(def.code)).map((def) => {
      const { currentValue, targetValue } = getProgress(def, {
        examCount: examCount?.count ?? 0,
        srReviewCount: srReviewCount?.count ?? 0,
        currentStreak,
      });
      return {
        code: def.code,
        name: def.name,
        rarity: def.rarity,
        icon: def.icon,
        currentValue,
        targetValue,
        percentComplete:
          targetValue > 0 ? Math.min(100, Math.round((currentValue / targetValue) * 100)) : 0,
      };
    });

    return { progress };
  });
}

/** Calculate progress values for a locked achievement */
function getProgress(
  def: (typeof ACHIEVEMENTS)[number],
  stats: { examCount: number; srReviewCount: number; currentStreak: number }
): { currentValue: number; targetValue: number } {
  const criteria = def.criteria;

  switch (criteria.type) {
    case 'streak':
      return { currentValue: stats.currentStreak, targetValue: criteria.days as number };
    case 'cumulative_count': {
      const activity = criteria.activity as string;
      const count = criteria.count as number;
      if (activity === 'sr_review') {
        return { currentValue: stats.srReviewCount, targetValue: count };
      }
      if (activity === 'exam_complete') {
        return { currentValue: stats.examCount, targetValue: count };
      }
      return { currentValue: 0, targetValue: count };
    }
    default:
      // For achievements without quantifiable progress (first_activity, perfect_score, etc.)
      return { currentValue: 0, targetValue: 1 };
  }
}
