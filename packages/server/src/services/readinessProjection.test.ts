import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock DB setup ---
const { mockAll } = vi.hoisted(() => {
  const mockAll = vi.fn();
  const mockOrderBy = vi.fn(() => ({ all: mockAll }));
  const mockWhere = vi.fn(() => ({ all: mockAll, orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return { mockAll, mockOrderBy, mockWhere, mockFrom, mockSelect };
});

vi.mock('../db/index.js', () => ({
  db: {
    select: () => {
      const mockOrderBy = vi.fn(() => ({ all: mockAll }));
      const mockWhere = vi.fn(() => ({ all: mockAll, orderBy: mockOrderBy }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      return { from: mockFrom };
    },
  },
  schema: {
    readinessSnapshots: {
      userId: 'user_id',
      certificationId: 'certification_id',
      overallScore: 'overall_score',
      calculatedAt: 'calculated_at',
    },
    exams: {
      userId: 'user_id',
      certificationId: 'certification_id',
      status: 'status',
      completedAt: 'completed_at',
    },
    studySessions: {
      userId: 'user_id',
      certificationId: 'certification_id',
      status: 'status',
      completedAt: 'completed_at',
    },
    flashcardSessions: {
      userId: 'user_id',
      certificationId: 'certification_id',
      status: 'status',
      completedAt: 'completed_at',
    },
    certifications: {
      id: 'id',
      passingScorePercent: 'passing_score_percent',
    },
  },
}));

import { _testing } from './readinessProjection.js';

const {
  linearRegression,
  projectDaysRemaining,
  calculateRequiredPace,
  MIN_DATA_POINTS,
  MAX_PROJECTION_DAYS,
} = _testing;

describe('readinessProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== Pure function tests =====

  describe('linearRegression', () => {
    it('returns zero slope for single point', () => {
      const result = linearRegression([{ x: 0, y: 50 }]);
      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(50);
    });

    it('returns zero slope for empty array', () => {
      const result = linearRegression([]);
      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(0);
    });

    it('calculates positive slope for improving scores', () => {
      const points = [
        { x: 0, y: 40 },
        { x: 7, y: 47 },
        { x: 14, y: 54 },
        { x: 21, y: 61 },
      ];
      const result = linearRegression(points);
      expect(result.slope).toBeCloseTo(1, 1); // ~1 point per day
      expect(result.intercept).toBeCloseTo(40, 0);
    });

    it('calculates negative slope for declining scores', () => {
      const points = [
        { x: 0, y: 70 },
        { x: 7, y: 63 },
        { x: 14, y: 56 },
      ];
      const result = linearRegression(points);
      expect(result.slope).toBeCloseTo(-1, 1);
    });

    it('returns zero slope for flat scores', () => {
      const points = [
        { x: 0, y: 50 },
        { x: 7, y: 50 },
        { x: 14, y: 50 },
      ];
      const result = linearRegression(points);
      expect(result.slope).toBeCloseTo(0, 5);
      expect(result.intercept).toBeCloseTo(50, 0);
    });

    it('handles noisy data with overall positive trend', () => {
      const points = [
        { x: 0, y: 40 },
        { x: 3, y: 38 }, // dip
        { x: 7, y: 48 },
        { x: 10, y: 45 }, // dip
        { x: 14, y: 55 },
      ];
      const result = linearRegression(points);
      expect(result.slope).toBeGreaterThan(0);
    });

    it('handles two identical x values gracefully', () => {
      const points = [
        { x: 0, y: 50 },
        { x: 0, y: 55 },
      ];
      const result = linearRegression(points);
      // With identical x values, denominator approaches 0 but is handled
      expect(typeof result.slope).toBe('number');
      expect(typeof result.intercept).toBe('number');
    });
  });

  describe('projectDaysRemaining', () => {
    it('returns 0 when current score >= target', () => {
      expect(projectDaysRemaining(75, 70, 1)).toBe(0);
      expect(projectDaysRemaining(70, 70, 1)).toBe(0);
    });

    it('returns null for zero improvement rate', () => {
      expect(projectDaysRemaining(50, 70, 0)).toBeNull();
    });

    it('returns null for negative improvement rate', () => {
      expect(projectDaysRemaining(50, 70, -0.5)).toBeNull();
    });

    it('calculates correct days for positive rate', () => {
      // 20 points to go at 1 point/day = 20 days
      expect(projectDaysRemaining(50, 70, 1)).toBe(20);
    });

    it('rounds up partial days', () => {
      // 20 points at 3 points/day = 6.67 → 7 days
      expect(projectDaysRemaining(50, 70, 3)).toBe(7);
    });

    it('returns null if projection exceeds MAX_PROJECTION_DAYS', () => {
      // 20 points at 0.01 points/day = 2000 days > 365
      expect(projectDaysRemaining(50, 70, 0.01)).toBeNull();
    });

    it('handles small gaps correctly', () => {
      // 1 point to go at 0.5 points/day = 2 days
      expect(projectDaysRemaining(69, 70, 0.5)).toBe(2);
    });
  });

  describe('calculateRequiredPace', () => {
    it('returns 0 when already at target', () => {
      expect(calculateRequiredPace(75, 70, 5, 1)).toBe(0);
    });

    it('returns fallback pace for zero improvement rate', () => {
      const result = calculateRequiredPace(50, 70, 3, 0);
      expect(result).toBeGreaterThan(0);
    });

    it('returns fallback pace for zero current pace', () => {
      const result = calculateRequiredPace(50, 70, 0, 0);
      expect(result).toBe(7); // defaults to 7/week
    });

    it('returns reasonable pace for normal improvement', () => {
      const result = calculateRequiredPace(50, 70, 5, 1);
      expect(result).toBeGreaterThanOrEqual(5);
    });
  });

  describe('constants', () => {
    it('requires minimum 3 data points', () => {
      expect(MIN_DATA_POINTS).toBe(3);
    });

    it('caps projection at 365 days', () => {
      expect(MAX_PROJECTION_DAYS).toBe(365);
    });
  });

  // ===== Integration tests with mocked DB =====

  describe('projectReadiness', () => {
    // These tests verify the integration flow through mocked DB calls.
    // The mock setup returns different values per call sequence.

    it('returns isProjectable false with insufficient snapshots', async () => {
      // Mock DB calls: snapshots (2 points), activities, passing score
      let callCount = 0;
      mockAll.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: // snapshots - only 2 data points
            return [
              { overallScore: 40, calculatedAt: new Date('2026-02-01') },
              { overallScore: 45, calculatedAt: new Date('2026-02-08') },
            ];
          case 2: // exam count
            return [{ count: 3 }];
          case 3: // study session count
            return [{ count: 2 }];
          case 4: // flashcard count
            return [{ count: 1 }];
          case 5: // passing score
            return [{ passingScorePercent: 70 }];
          default:
            return [];
        }
      });

      const { projectReadiness } = await import('./readinessProjection.js');
      const result = await projectReadiness(1, 1);

      expect(result.isProjectable).toBe(false);
      expect(result.projectedReadyDate).toBeNull();
      expect(result.daysRemaining).toBeNull();
      expect(result.currentPace).toBeGreaterThanOrEqual(0);
    });

    it('returns isProjectable false for negative improvement rate', async () => {
      let callCount = 0;
      mockAll.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: // snapshots - declining
            return [
              { overallScore: 60, calculatedAt: new Date('2026-01-20') },
              { overallScore: 55, calculatedAt: new Date('2026-01-27') },
              { overallScore: 50, calculatedAt: new Date('2026-02-03') },
              { overallScore: 45, calculatedAt: new Date('2026-02-10') },
            ];
          case 2:
            return [{ count: 2 }];
          case 3:
            return [{ count: 1 }];
          case 4:
            return [{ count: 0 }];
          case 5:
            return [{ passingScorePercent: 70 }];
          default:
            return [];
        }
      });

      const { projectReadiness } = await import('./readinessProjection.js');
      const result = await projectReadiness(1, 1);

      expect(result.isProjectable).toBe(false);
      expect(result.improvementRate).toBeLessThan(0);
      expect(result.projectedReadyDate).toBeNull();
    });

    it('returns valid projection for positive trend', async () => {
      let callCount = 0;
      mockAll.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: // snapshots - improving ~1 pt/day
            return [
              { overallScore: 40, calculatedAt: new Date('2026-01-20') },
              { overallScore: 47, calculatedAt: new Date('2026-01-27') },
              { overallScore: 54, calculatedAt: new Date('2026-02-03') },
              { overallScore: 61, calculatedAt: new Date('2026-02-10') },
            ];
          case 2:
            return [{ count: 8 }];
          case 3:
            return [{ count: 4 }];
          case 4:
            return [{ count: 2 }];
          case 5:
            return [{ passingScorePercent: 70 }];
          default:
            return [];
        }
      });

      const { projectReadiness } = await import('./readinessProjection.js');
      const result = await projectReadiness(1, 1);

      expect(result.isProjectable).toBe(true);
      expect(result.improvementRate).toBeGreaterThan(0);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.projectedReadyDate).toBeTruthy();
      expect(result.currentPace).toBeGreaterThan(0);
    });

    it('returns already ready when current score >= passing', async () => {
      let callCount = 0;
      mockAll.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: // snapshots - already passing
            return [
              { overallScore: 60, calculatedAt: new Date('2026-01-20') },
              { overallScore: 65, calculatedAt: new Date('2026-01-27') },
              { overallScore: 70, calculatedAt: new Date('2026-02-03') },
              { overallScore: 75, calculatedAt: new Date('2026-02-10') },
            ];
          case 2:
            return [{ count: 5 }];
          case 3:
            return [{ count: 3 }];
          case 4:
            return [{ count: 2 }];
          case 5:
            return [{ passingScorePercent: 70 }];
          default:
            return [];
        }
      });

      const { projectReadiness } = await import('./readinessProjection.js');
      const result = await projectReadiness(1, 1);

      expect(result.isProjectable).toBe(true);
      expect(result.isOnTrack).toBe(true);
      expect(result.daysRemaining).toBe(0);
      expect(result.projectedReadyDate).toBeNull(); // null when already ready
    });
  });
});
