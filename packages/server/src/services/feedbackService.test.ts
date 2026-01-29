import { describe, it, expect } from 'vitest';
import { shouldFlag } from './feedbackService.js';

describe('shouldFlag', () => {
  it('returns false when total votes < 5', () => {
    expect(shouldFlag(3, 1, 0)).toBe(false);
  });

  it('returns false when thumbs down rate <= 30%', () => {
    expect(shouldFlag(7, 3, 0)).toBe(false); // 30% exactly
  });

  it('returns true when thumbs down rate > 30% with 5+ votes', () => {
    expect(shouldFlag(3, 3, 0)).toBe(true); // 50%
  });

  it('returns true when report count >= 3', () => {
    expect(shouldFlag(10, 0, 3)).toBe(true);
  });

  it('returns true when both conditions met', () => {
    expect(shouldFlag(2, 3, 5)).toBe(true);
  });

  it('returns false with zero votes and zero reports', () => {
    expect(shouldFlag(0, 0, 0)).toBe(false);
  });
});
