import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateNextReview,
  getDailyReviewCount,
  calculateStreak,
  type ReviewQuality,
} from './spacedRepetition.js';

describe('calculateNextReview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('quality = again (0) - failure case', () => {
    it('should reset repetitions to 0', () => {
      const result = calculateNextReview('again', 2.5, 10, 5);
      expect(result.repetitions).toBe(0);
    });

    it('should reset interval to 1 day', () => {
      const result = calculateNextReview('again', 2.5, 30, 5);
      expect(result.interval).toBe(1);
    });

    it('should decrease ease factor but enforce minimum of 1.3', () => {
      // EF' = 2.5 + (0.1 - (5-0) * (0.08 + (5-0) * 0.02))
      // EF' = 2.5 + (0.1 - 5 * (0.08 + 0.1))
      // EF' = 2.5 + (0.1 - 5 * 0.18)
      // EF' = 2.5 + (0.1 - 0.9)
      // EF' = 2.5 - 0.8 = 1.7
      const result = calculateNextReview('again', 2.5, 10, 3);
      expect(result.easeFactor).toBe(1.7);
    });

    it('should enforce minimum ease factor of 1.3', () => {
      // Start with low ease factor, should not go below 1.3
      const result = calculateNextReview('again', 1.3, 10, 3);
      expect(result.easeFactor).toBe(1.3);
    });

    it('should set next review date to tomorrow', () => {
      const result = calculateNextReview('again', 2.5, 10, 3);
      const expected = new Date('2025-01-16T12:00:00Z');
      expect(result.nextReviewAt.toISOString()).toBe(expected.toISOString());
    });
  });

  describe('quality = hard (3) - success with difficulty', () => {
    it('should increment repetitions', () => {
      const result = calculateNextReview('hard', 2.5, 10, 2);
      expect(result.repetitions).toBe(3);
    });

    it('should set interval to 1 for first repetition', () => {
      const result = calculateNextReview('hard', 2.5, 0, 0);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('should set interval to 6 for second repetition', () => {
      const result = calculateNextReview('hard', 2.5, 1, 1);
      expect(result.interval).toBe(6);
      expect(result.repetitions).toBe(2);
    });

    it('should multiply interval by ease factor for third+ repetition', () => {
      // interval = round(10 * 2.5) = 25
      const result = calculateNextReview('hard', 2.5, 10, 2);
      expect(result.interval).toBe(25);
    });

    it('should decrease ease factor slightly', () => {
      // EF' = 2.5 + (0.1 - (5-3) * (0.08 + (5-3) * 0.02))
      // EF' = 2.5 + (0.1 - 2 * (0.08 + 0.04))
      // EF' = 2.5 + (0.1 - 2 * 0.12)
      // EF' = 2.5 + (0.1 - 0.24)
      // EF' = 2.5 - 0.14 = 2.36
      const result = calculateNextReview('hard', 2.5, 10, 2);
      expect(result.easeFactor).toBe(2.36);
    });
  });

  describe('quality = good (4) - successful recall', () => {
    it('should increment repetitions', () => {
      const result = calculateNextReview('good', 2.5, 10, 3);
      expect(result.repetitions).toBe(4);
    });

    it('should maintain ease factor with minimal change', () => {
      // EF' = 2.5 + (0.1 - (5-4) * (0.08 + (5-4) * 0.02))
      // EF' = 2.5 + (0.1 - 1 * (0.08 + 0.02))
      // EF' = 2.5 + (0.1 - 0.1)
      // EF' = 2.5
      const result = calculateNextReview('good', 2.5, 10, 3);
      expect(result.easeFactor).toBe(2.5);
    });

    it('should calculate correct interval for third+ repetition', () => {
      // interval = round(6 * 2.5) = 15
      const result = calculateNextReview('good', 2.5, 6, 2);
      expect(result.interval).toBe(15);
    });
  });

  describe('quality = easy (5) - effortless recall', () => {
    it('should increment repetitions', () => {
      const result = calculateNextReview('easy', 2.5, 10, 4);
      expect(result.repetitions).toBe(5);
    });

    it('should increase ease factor', () => {
      // EF' = 2.5 + (0.1 - (5-5) * (0.08 + (5-5) * 0.02))
      // EF' = 2.5 + (0.1 - 0)
      // EF' = 2.6
      const result = calculateNextReview('easy', 2.5, 10, 4);
      expect(result.easeFactor).toBe(2.6);
    });

    it('should produce larger intervals over time', () => {
      // First easy: interval = 1
      const r1 = calculateNextReview('easy', 2.5, 0, 0);
      expect(r1.interval).toBe(1);

      // Second easy: interval = 6
      const r2 = calculateNextReview('easy', r1.easeFactor, r1.interval, r1.repetitions);
      expect(r2.interval).toBe(6);

      // Third easy: interval = round(6 * 2.6) = 16
      const r3 = calculateNextReview('easy', r2.easeFactor, r2.interval, r2.repetitions);
      expect(r3.interval).toBe(16);
    });
  });

  describe('edge cases', () => {
    it('should handle minimum ease factor boundary', () => {
      // Even with repeated failures, ease factor should not go below 1.3
      let ef = 2.5;
      for (let i = 0; i < 10; i++) {
        const result = calculateNextReview('again', ef, 1, 0);
        ef = result.easeFactor;
      }
      expect(ef).toBe(1.3);
    });

    it('should handle very high ease factor', () => {
      const result = calculateNextReview('easy', 5.0, 10, 5);
      // Should still work and increase EF
      expect(result.easeFactor).toBe(5.1);
      expect(result.interval).toBe(50); // round(10 * 5.0)
    });

    it('should handle interval of 0', () => {
      const result = calculateNextReview('good', 2.5, 0, 0);
      expect(result.interval).toBe(1); // First repetition always 1
    });

    it('should round ease factor to 2 decimal places', () => {
      const result = calculateNextReview('hard', 2.123456, 10, 3);
      const decimals = result.easeFactor.toString().split('.')[1] || '';
      expect(decimals.length).toBeLessThanOrEqual(2);
    });

    it('should round interval to nearest integer', () => {
      // With EF = 2.33 and interval = 7
      // New interval = round(7 * 2.33) = round(16.31) = 16
      const result = calculateNextReview('good', 2.33, 7, 3);
      expect(Number.isInteger(result.interval)).toBe(true);
    });
  });
});

describe('getDailyReviewCount', () => {
  it('should cap at 50 cards maximum', () => {
    const result = getDailyReviewCount(100, 60, 30);
    expect(result).toBeLessThanOrEqual(50);
  });

  it('should return total due if under time limit', () => {
    // 10 cards * 30 sec = 5 min, target is 30 min
    const result = getDailyReviewCount(10, 30, 30);
    expect(result).toBe(10);
  });

  it('should limit by time when cards would exceed target', () => {
    // Target: 30 min = 1800 sec
    // At 30 sec/card: 1800/30 = 60 cards max
    // But capped at 50
    const result = getDailyReviewCount(100, 30, 30);
    expect(result).toBe(50);
  });

  it('should handle short study sessions', () => {
    // 5 min = 300 sec, 30 sec/card = 10 cards
    const result = getDailyReviewCount(50, 5, 30);
    expect(result).toBe(10);
  });

  it('should handle 0 due cards', () => {
    const result = getDailyReviewCount(0, 30, 30);
    expect(result).toBe(0);
  });

  it('should use default parameters', () => {
    // Default: 30 min target, 30 sec/card = 60 cards, capped at 50
    const result = getDailyReviewCount(100);
    expect(result).toBe(50);
  });
});

describe('calculateStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 0 for empty array', () => {
    const result = calculateStreak([]);
    expect(result).toBe(0);
  });

  it('should return 1 for exam today', () => {
    const result = calculateStreak([new Date('2025-01-15T10:00:00Z')]);
    expect(result).toBe(1);
  });

  it('should count consecutive days', () => {
    const result = calculateStreak([
      new Date('2025-01-15T10:00:00Z'), // today
      new Date('2025-01-14T10:00:00Z'), // yesterday
      new Date('2025-01-13T10:00:00Z'), // 2 days ago
    ]);
    expect(result).toBe(3);
  });

  it('should break streak on gap', () => {
    const result = calculateStreak([
      new Date('2025-01-15T10:00:00Z'), // today
      new Date('2025-01-14T10:00:00Z'), // yesterday
      new Date('2025-01-12T10:00:00Z'), // gap (skipped Jan 13)
    ]);
    expect(result).toBe(2);
  });

  it('should handle multiple exams on same day', () => {
    const result = calculateStreak([
      new Date('2025-01-15T10:00:00Z'),
      new Date('2025-01-15T14:00:00Z'),
      new Date('2025-01-14T10:00:00Z'),
    ]);
    // Multiple exams on same day should still count as 1 day
    expect(result).toBe(3);
  });

  it('should handle unsorted dates', () => {
    const result = calculateStreak([
      new Date('2025-01-13T10:00:00Z'),
      new Date('2025-01-15T10:00:00Z'),
      new Date('2025-01-14T10:00:00Z'),
    ]);
    expect(result).toBe(3);
  });

  it('should return 0 if no recent activity', () => {
    const result = calculateStreak([
      new Date('2025-01-10T10:00:00Z'), // 5 days ago
    ]);
    expect(result).toBe(0);
  });

  it('should count yesterday as start of streak if no exam today', () => {
    // If user studied yesterday but not today, the streak should still count
    const result = calculateStreak([
      new Date('2025-01-14T10:00:00Z'), // yesterday
      new Date('2025-01-13T10:00:00Z'), // 2 days ago
    ]);
    expect(result).toBe(2);
  });
});
