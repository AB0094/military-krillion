/** Distance milestones: a fictional arcade set piece every 1,000 m. Decorative scenery only. */
export type MilestoneKind = 'vehicle' | 'sam' | 'radar' | 'dust' | 'coast' | 'storm' | 'horizon';

export interface Milestone {
  /** 1-based: milestone 1 is at 1,000 m. */
  index: number;
  meters: number;
  name: string;
  kind: MilestoneKind;
  /** 0 on the first lap of seven; grows each lap so later set pieces are bigger. */
  variant: number;
  blurb: string;
}

export const MILESTONE_STEP = 1000;

const LAP_ONE: readonly { name: string; kind: MilestoneKind; blurb: string }[] = [
  { name: 'Iron Sentinel', kind: 'vehicle', blurb: 'Fly past an abandoned military vehicle' },
  { name: 'Ghost Watch', kind: 'sam', blurb: 'Pass an unoccupied air-defence installation' },
  { name: 'Silent Signal', kind: 'radar', blurb: 'A radar installation lights up, then blows' },
  { name: 'Dust Frontier', kind: 'dust', blurb: 'Fly through a dusty battlefield' },
  { name: 'Ocean Phantom', kind: 'coast', blurb: 'Cross a dramatic coastline' },
  { name: 'Stormbreaker', kind: 'storm', blurb: 'Pass through a stormy battlefield' },
  { name: 'Beyond the Horizon', kind: 'horizon', blurb: 'A spectacular cinematic finale' },
];
/** Names for the second lap (8,000 m onward). Same seven kinds of set piece, bigger. */
const LAP_TWO: readonly string[] = ['Iron Gauntlet', 'Ghost Battery', 'Silent Chorus', 'Dust Maelstrom', 'Crimson Tide', 'Thunder Apex', 'Beyond Again'];

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function milestone(k: number): Milestone {
  const idx = (k - 1) % 7;
  const lap = Math.floor((k - 1) / 7);
  const base = LAP_ONE[idx];
  const name = lap === 0 ? base.name : lap === 1 ? LAP_TWO[idx] : `${lap % 2 ? LAP_TWO[idx] : base.name} ${ROMAN[Math.floor(lap / 2)] || String(Math.floor(lap / 2) + 1)}`.trim();
  return { index: k, meters: k * MILESTONE_STEP, name, kind: base.kind, variant: lap, blurb: base.blurb };
}

/** Milestone indices passed when distance goes from `before` to `after` (metres), in order. */
export function milestonesCrossed(before: number, after: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(before / MILESTONE_STEP) + 1; k * MILESTONE_STEP <= after; k++) out.push(k);
  return out;
}

/** The next milestone ahead of `meters`. */
export function nextMilestone(meters: number): Milestone {
  return milestone(Math.floor(meters / MILESTONE_STEP) + 1);
}
