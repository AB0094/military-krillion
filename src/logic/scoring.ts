import type { Answer, AnswerStats } from './types';

/** Player data is ignored until this many players answered a prompt (avoids a lone early answer scoring 0). */
export const MIN_CROWD = 10;
export const DEFAULT_PROMPT_COUNT = 7;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * rarity = 1 - (players who gave this answer / total players who answered the prompt).
 * With no player data (or fewer than `minPlayers`), falls back to the answer's weight.
 */
export function rarity(answer: Answer, stats?: AnswerStats, minPlayers = 1): number {
  if (!stats || stats.total <= 0 || stats.total < minPlayers) return clamp01(answer.weight);
  const given = stats.counts[answer.name] ?? 0;
  return clamp01(1 - given / stats.total);
}

/** Depth = sum of rarity scores (wrong answers contribute 0). */
export function totalDepth(scores: readonly number[]): number {
  return Math.round(scores.reduce((sum, s) => sum + s, 0) * 1000) / 1000;
}

export interface Tier {
  name: string;
  /** Minimum average rarity per prompt (0..1). */
  min: number;
  airfield: string;
  country: string;
  flag: string;
  blurb: string;
}

/** Each depth is an airfield in a different country, from the busy ramp down to the black site. */
export const TIERS: readonly Tier[] = [
  { name: 'Chocks Away', min: 0, airfield: 'Ramstein Air Base', country: 'Germany', flag: '🇩🇪', blurb: 'Still on the ramp. Everybody knows these.' },
  { name: 'Hot Pit', min: 0.2, airfield: 'Incirlik Air Base', country: 'Türkiye', flag: '🇹🇷', blurb: 'Engines running, crews swapping, nobody shutting down.' },
  { name: 'Bingo Fuel', min: 0.35, airfield: 'Kadena Air Base', country: 'Japan', flag: '🇯🇵', blurb: 'Past the point of easy answers.' },
  { name: 'Winchester', min: 0.5, airfield: 'RAF Akrotiri', country: 'Cyprus', flag: '🇨🇾', blurb: 'The obvious answers are spent. Deep cuts only.' },
  { name: 'Emcon Alpha', min: 0.65, airfield: 'Pituffik Space Base', country: 'Greenland', flag: '🇬🇱', blurb: 'Emitters off. Nobody can find you down here.' },
  { name: 'Magnum', min: 0.8, airfield: 'Groom Lake', country: 'United States', flag: '🇺🇸', blurb: 'Missile away, straight down the beam. Almost nobody gets here.' },
];

export function tierIndex(depth: number, promptCount = DEFAULT_PROMPT_COUNT): number {
  const avg = promptCount > 0 ? depth / promptCount : 0;
  let idx = 0;
  TIERS.forEach((t, i) => { if (avg >= t.min - 1e-9) idx = i; });
  return idx;
}

export function tierFor(depth: number, promptCount = DEFAULT_PROMPT_COUNT): Tier {
  return TIERS[tierIndex(depth, promptCount)];
}

/** Label for a matched answer's rarity; the same cut-offs drive the share squares. */
export function rarityLabel(score: number): 'Common' | 'Uncommon' | 'Rare' | 'Ultra rare' {
  if (score >= 0.8) return 'Ultra rare';
  if (score >= 0.5) return 'Rare';
  if (score >= 0.25) return 'Uncommon';
  return 'Common';
}

/** Where the missile sits in the descent shaft (0 = top/start, 1 = bottom): the running average rarity. */
export function shaftPosition(depth: number, promptCount = DEFAULT_PROMPT_COUNT): number {
  return promptCount > 0 ? Math.min(1, Math.max(0, depth / promptCount)) : 0;
}

/** The new tier index if going from `before` to `after` depth crosses into a deeper tier, else null. */
export function crossedTier(before: number, after: number, promptCount = DEFAULT_PROMPT_COUNT): number | null {
  const a = tierIndex(before, promptCount);
  const b = tierIndex(after, promptCount);
  return b > a ? b : null;
}
