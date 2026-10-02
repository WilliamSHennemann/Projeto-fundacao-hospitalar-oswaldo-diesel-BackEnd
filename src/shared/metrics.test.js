import { describe, expect, it } from 'vitest';
import { calculateAverage, calculateNps } from './metrics.js';

describe('metrics', () => {
  it('calculates an average with one decimal precision', () => {
    expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
    expect(calculateAverage([1, 5])).toBe(3);
  });

  it('calculates nps as promoters minus detractors', () => {
    expect(calculateNps([10, 9, 8, 7, 6, 5, 1, 0])).toBe(-25);
  });
});
