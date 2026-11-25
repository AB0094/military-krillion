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
  return clamp01(Math.round((1 - given / stats.total) * 100) / 100); // whole points: rarity is always a multiple of 0.01
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

/** Krillion-style scoring: a round is worth up to 100 points, and every point is 10 metres of depth. */
export const POINTS_PER_ROUND = 100;
export const METERS_PER_POINT = 10;

/** Points for a depth (sum of rarity). Rarity is a multiple of 0.01, so this is exact. */
export const depthPoints = (depth: number): number => Math.round(depth * POINTS_PER_ROUND);
export const depthMeters = (depth: number): number => depthPoints(depth) * METERS_PER_POINT;
/** Deepest possible: every round a perfect 100 points. 7 rounds = 7,000m. */
export const maxMeters = (rounds: number = DEFAULT_PROMPT_COUNT): number => rounds * POINTS_PER_ROUND * METERS_PER_POINT;
export const formatMeters = (m: number): string => `${Math.round(m).toLocaleString('en-US')}m`;

/** The depth, in metres, at which a tier's airfield starts for a run of `rounds` rounds. */
export function tierMeters(tierIdx: number, rounds: number = DEFAULT_PROMPT_COUNT): number {
  return Math.round(TIERS[tierIdx].min * maxMeters(rounds));
}

/** How rare an answer was, as an aviation/military-arcade rank. Rarer answers rank higher. */
export const RARITIES = [
  { name: 'Recruit', tier: 'Common' },
  { name: 'Recon', tier: 'Uncommon' },
  { name: 'Vanguard', tier: 'Rare' },
  { name: 'Apex', tier: 'Epic' },
  { name: 'Warbringer', tier: 'Legendary' },
  { name: 'Mythic', tier: 'Mythical' },
  { name: 'Transcendent', tier: 'Highest' },
] as const;
export type RarityName = (typeof RARITIES)[number]['name'];
export const RARITY_NAMES: readonly RarityName[] = RARITIES.map((r) => r.name);
/** Minimum rarity (0..1) for each rank: 0-19 Recruit, 20-39 Recon, 40-59 Vanguard, 60-79 Apex, 80-89 Warbringer, 90-99 Mythic, 100 Transcendent. */
const RARITY_CUTOFFS = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1];

/** 0..6: index into RARITIES. Also drives the share squares, badge colours and reveal effects. */
export function rarityRank(score: number): number {
  let rank = 0;
  RARITY_CUTOFFS.forEach((c, i) => { if (score >= c - 1e-9) rank = i; });
  return rank;
}

export function rarityLabel(score: number): RarityName {
  return RARITIES[rarityRank(score)].name;
}

/** The familiar tier word ("Common", "Rare", "Legendary"...) shown under the rank name. */
export function rarityTier(score: number): string {
  return RARITIES[rarityRank(score)].tier;
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
