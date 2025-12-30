import { describe, it, expect } from 'vitest';
import {
  checkAnswerCorrect,
  calculateExamScore,
  isPassing,
  calculateAccuracy,
  calculateDomainPerformance,
  PASSING_THRESHOLD,
} from './scoring.js';

describe('checkAnswerCorrect', () => {
  describe('single choice questions', () => {
    it('should return true for correct single answer', () => {
      expect(checkAnswerCorrect([2], [2])).toBe(true);
    });

    it('should return false for incorrect single answer', () => {
      expect(checkAnswerCorrect([1], [2])).toBe(false);
    });

    it('should return false when selecting multiple for single choice', () => {
      expect(checkAnswerCorrect([1, 2], [2])).toBe(false);
    });
  });

  describe('multiple choice questions', () => {
    it('should return true for all correct answers selected', () => {
      expect(checkAnswerCorrect([0, 2], [0, 2])).toBe(true);
    });

    it('should return true regardless of order', () => {
      expect(checkAnswerCorrect([2, 0], [0, 2])).toBe(true);
    });

    it('should return false for partial selection', () => {
      expect(checkAnswerCorrect([0], [0, 2])).toBe(false);
    });

    it('should return false for over-selection', () => {
      expect(checkAnswerCorrect([0, 1, 2], [0, 2])).toBe(false);
    });

    it('should return false for wrong selection', () => {
      expect(checkAnswerCorrect([1, 3], [0, 2])).toBe(false);
    });

    it('should handle three correct answers', () => {
      expect(checkAnswerCorrect([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(checkAnswerCorrect([3, 1, 2], [1, 2, 3])).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays (no answer selected)', () => {
      expect(checkAnswerCorrect([], [])).toBe(true);
    });

    it('should return false when no answer selected but answer expected', () => {
      expect(checkAnswerCorrect([], [1])).toBe(false);
    });

    it('should return false when answer selected but none expected', () => {
      expect(checkAnswerCorrect([1], [])).toBe(false);
    });

    it('should handle answer index 0', () => {
      expect(checkAnswerCorrect([0], [0])).toBe(true);
    });

    it('should handle large indices', () => {
      expect(checkAnswerCorrect([99], [99])).toBe(true);
    });

    it('should handle duplicate correct answers in input', () => {
      // Weird edge case but should still work
      expect(checkAnswerCorrect([1, 1], [1])).toBe(false);
    });
  });
});

describe('calculateExamScore', () => {
  it('should return 100 for all correct', () => {
    expect(calculateExamScore(50, 50)).toBe(100);
  });

  it('should return 0 for all incorrect', () => {
    expect(calculateExamScore(0, 50)).toBe(0);
  });

  it('should calculate percentage correctly', () => {
    expect(calculateExamScore(35, 50)).toBe(70);
    expect(calculateExamScore(25, 50)).toBe(50);
    expect(calculateExamScore(10, 50)).toBe(20);
  });

  it('should handle partial correct counts', () => {
    // 7/10 = 70%
    expect(calculateExamScore(7, 10)).toBe(70);
    // 3/4 = 75%
    expect(calculateExamScore(3, 4)).toBe(75);
  });

  it('should return 0 for empty exam', () => {
    expect(calculateExamScore(0, 0)).toBe(0);
  });

  it('should handle non-standard exam sizes', () => {
    expect(calculateExamScore(12, 15)).toBe(80);
    expect(calculateExamScore(8, 25)).toBe(32);
  });

  it('should produce floating point percentages', () => {
    // 1/3 = 33.333...
    const score = calculateExamScore(1, 3);
    expect(score).toBeCloseTo(33.333, 2);
  });
});

describe('isPassing', () => {
  it('should have passing threshold of 70', () => {
    expect(PASSING_THRESHOLD).toBe(70);
  });

  it('should return true for score >= 70', () => {
    expect(isPassing(70)).toBe(true);
    expect(isPassing(71)).toBe(true);
    expect(isPassing(100)).toBe(true);
  });

  it('should return false for score < 70', () => {
    expect(isPassing(69)).toBe(false);
    expect(isPassing(69.9)).toBe(false);
    expect(isPassing(0)).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isPassing(70.0)).toBe(true);
    expect(isPassing(69.999)).toBe(false);
  });
});

describe('calculateAccuracy', () => {
  it('should return 100 for all correct', () => {
    const responses = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: true },
    ];
    expect(calculateAccuracy(responses)).toBe(100);
  });

  it('should return 0 for all incorrect', () => {
    const responses = [
      { isCorrect: false },
      { isCorrect: false },
      { isCorrect: false },
    ];
    expect(calculateAccuracy(responses)).toBe(0);
  });

  it('should calculate mixed accuracy', () => {
    const responses = [
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
      { isCorrect: false },
    ];
    expect(calculateAccuracy(responses)).toBe(50);
  });

  it('should ignore null (unanswered) responses', () => {
    const responses = [
      { isCorrect: true },
      { isCorrect: null },
      { isCorrect: true },
      { isCorrect: null },
    ];
    expect(calculateAccuracy(responses)).toBe(100);
  });

  it('should return 0 for all null responses', () => {
    const responses = [
      { isCorrect: null },
      { isCorrect: null },
    ];
    expect(calculateAccuracy(responses)).toBe(0);
  });

  it('should return 0 for empty array', () => {
    expect(calculateAccuracy([])).toBe(0);
  });
});

describe('calculateDomainPerformance', () => {
  it('should group responses by domain', () => {
    const responses = [
      { domainId: 1, isCorrect: true },
      { domainId: 1, isCorrect: false },
      { domainId: 2, isCorrect: true },
      { domainId: 2, isCorrect: true },
    ];

    const result = calculateDomainPerformance(responses);

    expect(result).toHaveLength(2);

    const domain1 = result.find((d) => d.domainId === 1);
    expect(domain1).toEqual({
      domainId: 1,
      correct: 1,
      total: 2,
      percentage: 50,
    });

    const domain2 = result.find((d) => d.domainId === 2);
    expect(domain2).toEqual({
      domainId: 2,
      correct: 2,
      total: 2,
      percentage: 100,
    });
  });

  it('should handle null isCorrect values', () => {
    const responses = [
      { domainId: 1, isCorrect: true },
      { domainId: 1, isCorrect: null },
    ];

    const result = calculateDomainPerformance(responses);
    expect(result[0]).toEqual({
      domainId: 1,
      correct: 1,
      total: 2,
      percentage: 50,
    });
  });

  it('should handle single domain', () => {
    const responses = [
      { domainId: 3, isCorrect: true },
      { domainId: 3, isCorrect: true },
      { domainId: 3, isCorrect: false },
    ];

    const result = calculateDomainPerformance(responses);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      domainId: 3,
      correct: 2,
      total: 3,
      percentage: 66.66666666666666,
    });
  });

  it('should handle empty responses', () => {
    const result = calculateDomainPerformance([]);
    expect(result).toEqual([]);
  });

  it('should handle all 5 ACE exam domains', () => {
    const responses = [
      { domainId: 1, isCorrect: true },
      { domainId: 2, isCorrect: true },
      { domainId: 3, isCorrect: false },
      { domainId: 4, isCorrect: true },
      { domainId: 5, isCorrect: false },
    ];

    const result = calculateDomainPerformance(responses);
    expect(result).toHaveLength(5);
  });
});
