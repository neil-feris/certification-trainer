import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAll,
  mockLimit,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockTxAll,
  mockTxRun,
  mockTxSelect,
  mockTxValues,
  mockTxInsert,
  mockTxUpdate,
  mockTransaction,
} = vi.hoisted(() => {
  const mockAll = vi.fn();
  const mockRun = vi.fn();
  const mockLimit = vi.fn(() => ({ all: mockAll }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ all: mockAll, run: mockRun, orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, orderBy: mockOrderBy }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockValues = vi.fn(() => ({ run: mockRun }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));

  const mockTxAll = vi.fn();
  const mockTxRun = vi.fn();
  const mockTxWhere = vi.fn(() => ({ all: mockTxAll, run: mockTxRun }));
  const mockTxFrom = vi.fn(() => ({ where: mockTxWhere }));
  const mockTxSelect = vi.fn(() => ({ from: mockTxFrom }));
  const mockTxValues = vi.fn(() => ({ run: mockTxRun }));
  const mockTxInsert = vi.fn(() => ({ values: mockTxValues }));
  const mockTxSet = vi.fn(() => ({ where: mockTxWhere }));
  const mockTxUpdate = vi.fn(() => ({ set: mockTxSet }));

  const mockTx = { select: mockTxSelect, insert: mockTxInsert, update: mockTxUpdate };
  const mockTransaction = vi.fn((fn: (tx: typeof mockTx) => void) => fn(mockTx));

  return {
    mockAll,
    mockRun,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockFrom,
    mockSelect,
    mockValues,
    mockInsert,
    mockSet,
    mockUpdate,
    mockTxAll,
    mockTxRun,
    mockTxWhere,
    mockTxFrom,
    mockTxSelect,
    mockTxValues,
    mockTxInsert,
    mockTxSet,
    mockTxUpdate,
    mockTransaction,
  };
});

vi.mock('../db/index.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
  schema: {
    questionEncounters: {
      userId: 'user_id',
      questionId: 'question_id',
      encounterCount: 'encounter_count',
      lastSeenAt: 'last_seen_at',
    },
  },
}));

import { recordEncounters, getRecentEncounters } from './encounterService.js';

describe('encounterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordEncounters', () => {
    it('does nothing for empty questionIds array', () => {
      recordEncounters(1, []);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('inserts new encounter when question not previously seen', () => {
      mockTxAll.mockReturnValueOnce([]);

      recordEncounters(1, [42]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxSelect).toHaveBeenCalledTimes(1);
      expect(mockTxInsert).toHaveBeenCalledTimes(1);
      expect(mockTxValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          questionId: 42,
          encounterCount: 1,
        })
      );
      expect(mockTxRun).toHaveBeenCalled();
    });

    it('updates existing encounter with incremented count', () => {
      mockTxAll.mockReturnValueOnce([{ id: 1, userId: 1, questionId: 42, encounterCount: 3 }]);

      recordEncounters(1, [42]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxSelect).toHaveBeenCalledTimes(1);
      expect(mockTxUpdate).toHaveBeenCalledTimes(1);
      expect(mockTxInsert).not.toHaveBeenCalled();
      expect(mockTxRun).toHaveBeenCalled();
    });

    it('handles multiple questions in a single transaction', () => {
      mockTxAll.mockReturnValueOnce([]);
      mockTxAll.mockReturnValueOnce([{ id: 2, userId: 1, questionId: 99, encounterCount: 1 }]);
      mockTxAll.mockReturnValueOnce([]);

      recordEncounters(1, [42, 99, 101]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxSelect).toHaveBeenCalledTimes(3);
      expect(mockTxInsert).toHaveBeenCalledTimes(2);
      expect(mockTxUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRecentEncounters', () => {
    it('returns question IDs ordered by most recent first', async () => {
      mockAll.mockResolvedValueOnce([{ questionId: 10 }, { questionId: 20 }, { questionId: 30 }]);

      const result = await getRecentEncounters(1, 3);

      expect(result).toEqual([10, 20, 30]);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockLimit).toHaveBeenCalledWith(3);
    });

    it('returns empty array when no encounters exist', async () => {
      mockAll.mockResolvedValueOnce([]);

      const result = await getRecentEncounters(1, 30);

      expect(result).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      mockAll.mockResolvedValueOnce([{ questionId: 5 }]);

      await getRecentEncounters(1, 1);

      expect(mockLimit).toHaveBeenCalledWith(1);
    });
  });
});
