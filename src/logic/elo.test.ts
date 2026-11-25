import { describe, expect, it } from 'vitest';
import { actualScore, dayMedianDepth, expectedScore, median, referenceMedianDepth, START_RATING, updateRating } from './elo';
import type { Prompt } from './types';

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('Elo', () => {
  it('expected score is 0.5 at equal rating', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
  });
  it('actual score: median -> 0.5, clamped to [0,1]', () => {
    expect(actualScore(3, 3)).toBe(0.5);
    expect(actualScore(10, 3)).toBe(1);
    expect(actualScore(0, 6)).toBe(0);
  });
  it('rating is unchanged at the median, rises above, falls below', () => {
    expect(updateRating(START_RATING, 3, 3)).toBe(1000);
    expect(updateRating(START_RATING, 5, 3)).toBe(1016);
    expect(updateRating(START_RATING, 1, 3)).toBe(984);
  });
  it('a high rating gains less for the same result', () => {
    expect(updateRating(1400, 4, 3) - 1400).toBeLessThan(updateRating(1000, 4, 3) - 1000);
  });
});

const prompts: Prompt[] = [
  { id: 'a', mode: 'Air', text: 'a', answers: [{ name: 'x', aliases: [], weight: 0.1 }, { name: 'y', aliases: [], weight: 0.3 }, { name: 'z', aliases: [], weight: 0.9 }] },
  { id: 'b', mode: 'Air', text: 'b', answers: [{ name: 'x', aliases: [], weight: 0.5 }] },
];

describe('median depth', () => {
  it('reference median sums each prompt\'s median weight', () => {
    expect(referenceMedianDepth(prompts)).toBeCloseTo(0.8);
  });
  it('uses observed depths only with enough players', () => {
    expect(dayMedianDepth(prompts, [9, 9, 9])).toBeCloseTo(0.8);
    expect(dayMedianDepth(prompts, Array(10).fill(2))).toBe(2);
  });
});
