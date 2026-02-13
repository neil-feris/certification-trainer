import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- DB mock setup (hoisted) ----
const { mockAll, mockSelect } = vi.hoisted(() => {
  const mockAll = vi.fn();
  const mockLimit = vi.fn(() => ({ all: mockAll }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit, all: mockAll }));
  const mockWhere = vi.fn(() => ({ all: mockAll, orderBy: mockOrderBy }));
  const mockInnerJoin = vi.fn(() => ({ where: mockWhere, innerJoin: vi.fn() }));
  const mockFrom = vi.fn(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    innerJoin: mockInnerJoin,
  }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    mockAll,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockFrom,
    mockInnerJoin,
    mockSelect,
  };
});

vi.mock('../db/index.js', () => ({
  db: {
    select: mockSelect,
  },
  schema: {
    questions: {
      id: 'id',
      domainId: 'domain_id',
      difficulty: 'difficulty',
    },
    domains: {
      id: 'id',
      certificationId: 'certification_id',
    },
    performanceStats: {
      userId: 'user_id',
      domainId: 'domain_id',
      totalAttempts: 'total_attempts',
      correctAttempts: 'correct_attempts',
    },
    questionEncounters: {
      userId: 'user_id',
      questionId: 'question_id',
      lastSeenAt: 'last_seen_at',
    },
  },
}));

import { selectQuestions, _testing } from './adaptiveSelector.js';

const { applyWeights, getDifficultyMultiplier, weightedRandomSample, calculateOverallAccuracy } =
  _testing;

describe('adaptiveSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyWeights - weak area weighting', () => {
    const defaultConfig = {
      weakAreaWeight: 3,
      veryWeakAreaWeight: 5,
      unseenWeight: 2,
      masteredWeight: 0.5,
      cooldownWindowSize: 30,
      beginnerThreshold: 50,
      advancedThreshold: 75,
    };

    it('applies veryWeakAreaWeight (5x) for domains with <50% accuracy', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map([
        [10, { domainId: 10, totalAttempts: 20, correctAttempts: 8, accuracy: 40 }],
      ]);

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      // 5x (very weak) * 1.0 (balanced difficulty for intermediate)
      expect(result[0].weight).toBe(5.0);
    });

    it('applies weakAreaWeight (3x) for domains with 50-69% accuracy', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map([
        [10, { domainId: 10, totalAttempts: 20, correctAttempts: 12, accuracy: 60 }],
      ]);

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      expect(result[0].weight).toBe(3.0);
    });

    it('applies unseenWeight (2x) for domains with 0 attempts', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map<
        number,
        { domainId: number; totalAttempts: number; correctAttempts: number; accuracy: number }
      >();

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      expect(result[0].weight).toBe(2.0);
    });

    it('applies masteredWeight (0.5x) for domains with >90% accuracy and 10+ attempts', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map([
        [10, { domainId: 10, totalAttempts: 15, correctAttempts: 14, accuracy: 93.3 }],
      ]);

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      expect(result[0].weight).toBe(0.5);
    });

    it('does not apply masteredWeight when attempts < 10', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map([
        [10, { domainId: 10, totalAttempts: 5, correctAttempts: 5, accuracy: 100 }],
      ]);

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      // No weight modifier applied (base 1.0)
      expect(result[0].weight).toBe(1.0);
    });

    it('applies base weight (1.0) for domains with 70-90% accuracy', () => {
      const candidates = [{ id: 1, domainId: 10, difficulty: 'medium', weight: 1.0 }];
      const domainStats = new Map([
        [10, { domainId: 10, totalAttempts: 20, correctAttempts: 16, accuracy: 80 }],
      ]);

      const result = applyWeights(candidates, domainStats, 60, defaultConfig);

      expect(result[0].weight).toBe(1.0);
    });
  });

  describe('getDifficultyMultiplier - difficulty progression', () => {
    const config = {
      weakAreaWeight: 3,
      veryWeakAreaWeight: 5,
      unseenWeight: 2,
      masteredWeight: 0.5,
      cooldownWindowSize: 30,
      beginnerThreshold: 50,
      advancedThreshold: 75,
    };

    it('favors easy for beginners (<50% accuracy)', () => {
      expect(getDifficultyMultiplier('easy', 30, config)).toBe(1.5);
      expect(getDifficultyMultiplier('medium', 30, config)).toBe(1.0);
      expect(getDifficultyMultiplier('hard', 30, config)).toBe(0.5);
    });

    it('balanced for intermediate (50-75% accuracy)', () => {
      expect(getDifficultyMultiplier('easy', 60, config)).toBe(1.0);
      expect(getDifficultyMultiplier('medium', 60, config)).toBe(1.0);
      expect(getDifficultyMultiplier('hard', 60, config)).toBe(1.0);
    });

    it('favors hard for advanced (>75% accuracy)', () => {
      expect(getDifficultyMultiplier('easy', 85, config)).toBe(0.5);
      expect(getDifficultyMultiplier('medium', 85, config)).toBe(1.0);
      expect(getDifficultyMultiplier('hard', 85, config)).toBe(1.5);
    });

    it('treats exactly 50% as intermediate (not beginner)', () => {
      expect(getDifficultyMultiplier('easy', 50, config)).toBe(1.0);
    });

    it('treats exactly 75% as intermediate (not advanced)', () => {
      expect(getDifficultyMultiplier('hard', 75, config)).toBe(1.0);
    });
  });

  describe('weightedRandomSample', () => {
    it('selects the requested count of items', () => {
      const candidates = [
        { id: 1, domainId: 1, difficulty: 'easy', weight: 1.0 },
        { id: 2, domainId: 1, difficulty: 'medium', weight: 1.0 },
        { id: 3, domainId: 1, difficulty: 'hard', weight: 1.0 },
        { id: 4, domainId: 1, difficulty: 'easy', weight: 1.0 },
        { id: 5, domainId: 1, difficulty: 'medium', weight: 1.0 },
      ];

      const result = weightedRandomSample(candidates, 3);

      expect(result).toHaveLength(3);
      // All IDs should be unique
      expect(new Set(result).size).toBe(3);
      // All IDs should be from candidates
      result.forEach((id) => {
        expect([1, 2, 3, 4, 5]).toContain(id);
      });
    });

    it('returns all items when count >= candidates', () => {
      const candidates = [
        { id: 1, domainId: 1, difficulty: 'easy', weight: 1.0 },
        { id: 2, domainId: 1, difficulty: 'medium', weight: 1.0 },
      ];

      const result = weightedRandomSample(candidates, 5);

      expect(result).toHaveLength(2);
    });

    it('heavily favors high-weight items', () => {
      // Give one item extreme weight, run many times
      const candidates = [
        { id: 1, domainId: 1, difficulty: 'easy', weight: 100 },
        { id: 2, domainId: 1, difficulty: 'medium', weight: 0.01 },
        { id: 3, domainId: 1, difficulty: 'hard', weight: 0.01 },
      ];

      // Over many trials, item 1 should almost always be first
      let item1SelectedFirst = 0;
      for (let i = 0; i < 100; i++) {
        const result = weightedRandomSample(candidates, 1);
        if (result[0] === 1) item1SelectedFirst++;
      }

      // Should be selected first at least 90% of the time
      expect(item1SelectedFirst).toBeGreaterThan(90);
    });

    it('returns empty array for empty candidates', () => {
      const result = weightedRandomSample([], 5);
      expect(result).toEqual([]);
    });
  });

  describe('calculateOverallAccuracy', () => {
    it('returns 0 when no domain stats exist', () => {
      const result = calculateOverallAccuracy(new Map());
      expect(result).toBe(0);
    });

    it('calculates weighted average across all domains', () => {
      const stats = new Map([
        [1, { domainId: 1, totalAttempts: 10, correctAttempts: 8, accuracy: 80 }],
        [2, { domainId: 2, totalAttempts: 10, correctAttempts: 6, accuracy: 60 }],
      ]);

      const result = calculateOverallAccuracy(stats);

      // (8 + 6) / (10 + 10) = 70%
      expect(result).toBe(70);
    });

    it('weights domains by attempt count', () => {
      const stats = new Map([
        [1, { domainId: 1, totalAttempts: 100, correctAttempts: 90, accuracy: 90 }],
        [2, { domainId: 2, totalAttempts: 10, correctAttempts: 2, accuracy: 20 }],
      ]);

      const result = calculateOverallAccuracy(stats);

      // (90 + 2) / (100 + 10) = 83.6%
      expect(result).toBeCloseTo(83.6, 1);
    });
  });

  describe('selectQuestions (integration with mocked DB)', () => {
    it('returns question IDs from fallback when pool is empty', async () => {
      // Mock getRecentEncounterIds: no encounters
      mockAll.mockResolvedValueOnce([]);
      // Mock getDomainStats: no stats
      mockAll.mockResolvedValueOnce([]);
      // Mock getCandidatePool: no candidates
      mockAll.mockResolvedValueOnce([]);
      // Mock fallbackRandomSelection
      mockAll.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await selectQuestions({
        userId: 1,
        certificationId: 1,
        count: 3,
      });

      expect(result).toEqual([1, 2, 3]);
    });

    it('falls back to RANDOM() when not enough candidates after cooldown removal', async () => {
      // Mock getRecentEncounterIds: has encounters
      mockAll.mockResolvedValueOnce([{ questionId: 10 }, { questionId: 20 }]);
      // Mock getDomainStats: no stats
      mockAll.mockResolvedValueOnce([]);
      // Mock getCandidatePool (with cooldown): only 2 candidates, need 5
      mockAll.mockResolvedValueOnce([
        { id: 1, domainId: 1, difficulty: 'easy' },
        { id: 2, domainId: 1, difficulty: 'medium' },
      ]);
      // Mock getCandidatePool (with shrunk cooldown): still only 3
      mockAll.mockResolvedValueOnce([
        { id: 1, domainId: 1, difficulty: 'easy' },
        { id: 2, domainId: 1, difficulty: 'medium' },
        { id: 3, domainId: 1, difficulty: 'hard' },
      ]);
      // Mock getCandidatePool (no cooldown): still only 4
      mockAll.mockResolvedValueOnce([
        { id: 1, domainId: 1, difficulty: 'easy' },
        { id: 2, domainId: 1, difficulty: 'medium' },
        { id: 3, domainId: 1, difficulty: 'hard' },
        { id: 4, domainId: 1, difficulty: 'easy' },
      ]);
      // Mock fallbackRandomSelection
      mockAll.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);

      const result = await selectQuestions({
        userId: 1,
        certificationId: 1,
        count: 5,
      });

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
