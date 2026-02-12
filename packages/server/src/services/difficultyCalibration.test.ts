import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAll, mockRun, mockSelect, mockUpdate } = vi.hoisted(() => {
  const mockAll = vi.fn();
  const mockRun = vi.fn();
  const mockWhere = vi.fn(() => ({ all: mockAll, run: mockRun }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));

  return {
    mockAll,
    mockRun,
    mockWhere,
    mockFrom,
    mockSelect,
    mockSet,
    mockUpdate,
  };
});

vi.mock('../db/index.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  schema: {
    questions: {
      id: 'id',
      difficulty: 'difficulty',
      empiricalDifficulty: 'empirical_difficulty',
      attemptCount: 'attempt_count',
      correctCount: 'correct_count',
    },
  },
}));

import {
  updateQuestionStats,
  recalibrateIfReady,
  getCalibratedDifficulty,
  _testing,
} from './difficultyCalibration.js';

const { empiricalLabel, confidence, blendDifficulty, difficultyToNumeric, numericToDifficulty } =
  _testing;

describe('difficultyCalibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== Pure function tests =====

  describe('empiricalLabel', () => {
    it('returns easy for >80% correct ratio', () => {
      expect(empiricalLabel(0.81)).toBe('easy');
      expect(empiricalLabel(0.95)).toBe('easy');
      expect(empiricalLabel(1.0)).toBe('easy');
    });

    it('returns medium for 50-80% correct ratio', () => {
      expect(empiricalLabel(0.5)).toBe('medium');
      expect(empiricalLabel(0.65)).toBe('medium');
      expect(empiricalLabel(0.8)).toBe('medium');
    });

    it('returns hard for <50% correct ratio', () => {
      expect(empiricalLabel(0.49)).toBe('hard');
      expect(empiricalLabel(0.2)).toBe('hard');
      expect(empiricalLabel(0)).toBe('hard');
    });
  });

  describe('confidence', () => {
    it('returns 0 for zero or negative sample size', () => {
      expect(confidence(0)).toBe(0);
      expect(confidence(-1)).toBe(0);
    });

    it('returns ~0.553 for 5 attempts (min threshold)', () => {
      const result = confidence(5);
      expect(result).toBeCloseTo(1 - 1 / Math.sqrt(5), 5);
    });

    it('grows toward 1 as sample size increases', () => {
      const c10 = confidence(10);
      const c50 = confidence(50);
      const c100 = confidence(100);
      expect(c10).toBeLessThan(c50);
      expect(c50).toBeLessThan(c100);
      expect(c100).toBeLessThan(1);
    });

    it('returns 0 for sample size 1', () => {
      expect(confidence(1)).toBe(0);
    });
  });

  describe('difficultyToNumeric / numericToDifficulty', () => {
    it('maps difficulty labels to numbers', () => {
      expect(difficultyToNumeric('easy')).toBe(1);
      expect(difficultyToNumeric('medium')).toBe(2);
      expect(difficultyToNumeric('hard')).toBe(3);
    });

    it('defaults to 2 for unknown difficulty', () => {
      expect(difficultyToNumeric('unknown')).toBe(2);
    });

    it('maps numbers back to difficulty labels', () => {
      expect(numericToDifficulty(1)).toBe('easy');
      expect(numericToDifficulty(1.5)).toBe('easy');
      expect(numericToDifficulty(2)).toBe('medium');
      expect(numericToDifficulty(2.5)).toBe('medium');
      expect(numericToDifficulty(3)).toBe('hard');
    });
  });

  describe('blendDifficulty', () => {
    it('returns original when confidence is 0', () => {
      expect(blendDifficulty('hard', 'easy', 0)).toBe('hard');
      expect(blendDifficulty('easy', 'hard', 0)).toBe('easy');
    });

    it('returns empirical when confidence is 1', () => {
      expect(blendDifficulty('hard', 'easy', 1)).toBe('easy');
      expect(blendDifficulty('easy', 'hard', 1)).toBe('hard');
    });

    it('blends at intermediate confidence', () => {
      // original=hard(3), empirical=easy(1), conf=0.5 → blended = 0.5*3 + 0.5*1 = 2 → medium
      expect(blendDifficulty('hard', 'easy', 0.5)).toBe('medium');
    });

    it('handles same original and empirical', () => {
      expect(blendDifficulty('medium', 'medium', 0.7)).toBe('medium');
    });
  });

  // ===== Integration tests with mocked DB =====

  describe('updateQuestionStats', () => {
    it('increments both attemptCount and correctCount when correct', () => {
      updateQuestionStats(42, true);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('increments only attemptCount when incorrect', () => {
      updateQuestionStats(42, false);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledTimes(1);
    });
  });

  describe('recalibrateIfReady', () => {
    it('does nothing when question not found', () => {
      mockAll.mockReturnValueOnce([]);

      recalibrateIfReady(99);

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when attempts below threshold (< 5)', () => {
      mockAll.mockReturnValueOnce([{ difficulty: 'medium', attemptCount: 4, correctCount: 3 }]);

      recalibrateIfReady(42);

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('calibrates when attempts meet threshold', () => {
      mockAll.mockReturnValueOnce([{ difficulty: 'hard', attemptCount: 10, correctCount: 9 }]);

      recalibrateIfReady(42);

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalled();
    });

    it('calibrates correctly at threshold boundary (5 attempts)', () => {
      // 5 attempts, 4 correct → 80% → empirical=medium, conf≈0.553
      // original=hard(3), empirical=medium(2), blended = (1-0.553)*3 + 0.553*2 = 1.341 + 1.106 = 2.447 → medium
      mockAll.mockReturnValueOnce([{ difficulty: 'hard', attemptCount: 5, correctCount: 4 }]);

      recalibrateIfReady(42);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('moves hard question toward easy with high correct ratio', () => {
      // 100 attempts, 95 correct → 95% → empirical=easy, conf≈0.9
      // original=hard(3), empirical=easy(1), blended = 0.1*3 + 0.9*1 = 1.2 → easy
      mockAll.mockReturnValueOnce([{ difficulty: 'hard', attemptCount: 100, correctCount: 95 }]);

      recalibrateIfReady(42);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCalibratedDifficulty', () => {
    it('returns empirical difficulty when available', async () => {
      mockAll.mockResolvedValueOnce([{ difficulty: 'hard', empiricalDifficulty: 'easy' }]);

      const result = await getCalibratedDifficulty(42);

      expect(result).toBe('easy');
    });

    it('falls back to original difficulty when no calibration', async () => {
      mockAll.mockResolvedValueOnce([{ difficulty: 'hard', empiricalDifficulty: null }]);

      const result = await getCalibratedDifficulty(42);

      expect(result).toBe('hard');
    });

    it('returns medium as fallback for missing question', async () => {
      mockAll.mockResolvedValueOnce([]);

      const result = await getCalibratedDifficulty(99);

      expect(result).toBe('medium');
    });
  });
});
