import type { Prompt } from './types';

export const START_RATING = 1000;
export const K_FACTOR = 32;
/** A depth this far above/below the median counts as a full win/loss. */
export const FULL_SWING_DEPTH = 2;
/** Day medians need at least this many observed depths; otherwise the reference median is used. */
export const MIN_MEDIAN_SAMPLE = 10;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Standard Elo expected score against an opponent (the "median player", assumed to hold START_RATING). */
export function expectedScore(rating: number, opponent = START_RATING): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Maps depth vs. the day's median to a 0..1 result: median = 0.5, +/-FULL_SWING_DEPTH = 1 / 0. */
export function actualScore(depth: number, medianDepth: number): number {
  return Math.min(1, Math.max(0, 0.5 + (depth - medianDepth) / (2 * FULL_SWING_DEPTH)));
}

/** THE Elo function: new Ranked rating after one day. */
export function updateRating(rating: number, depth: number, medianDepth: number, k = K_FACTOR): number {
  return Math.round(rating + k * (actualScore(depth, medianDepth) - expectedScore(rating)));
}

/** Offline stand-in for the day's median depth: the median-weight answer of each prompt, summed. */
export function referenceMedianDepth(prompts: readonly Prompt[]): number {
  return prompts.reduce((sum, p) => sum + median(p.answers.map((a) => a.weight)), 0);
}

/** The day's median depth: observed player depths when there are enough, else the reference value. */
export function dayMedianDepth(prompts: readonly Prompt[], observed: readonly number[] = []): number {
  return observed.length >= MIN_MEDIAN_SAMPLE ? median(observed) : referenceMedianDepth(prompts);
}
