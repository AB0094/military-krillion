import type { Mode, Prompt, PromptMode } from './types';

export const DAILY_SIZE = 7;

/** String -> 32-bit unsigned hash (xmur3-style). */
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffledForMode(date: string, mode: PromptMode, pool: readonly Prompt[]): Prompt[] {
  // Sort first so the result never depends on the order of the data file.
  const sorted = pool.filter((p) => p.mode === mode).sort((a, b) => a.id.localeCompare(b.id));
  return seededShuffle(sorted, mulberry32(hashString(`mk|${date}|${mode}`)));
}

/**
 * The daily prompt set. Same date + same pool => same prompts for everyone.
 * Ranked is a mix drawn from the same Ground and Air daily sets (4+3 or 3+4, decided by the seed).
 */
export function dailySet(date: string, mode: Mode, pool: readonly Prompt[], size = DAILY_SIZE): Prompt[] {
  if (mode !== 'Ranked') return shuffledForMode(date, mode, pool).slice(0, size);
  const ground = shuffledForMode(date, 'Ground', pool);
  const air = shuffledForMode(date, 'Air', pool);
  const rng = mulberry32(hashString(`mk|${date}|Ranked`));
  const big = Math.ceil(size / 2);
  const groundCount = rng() < 0.5 ? big : size - big;
  const picked = [...ground.slice(0, groundCount), ...air.slice(0, size - groundCount)];
  return seededShuffle(picked, rng);
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD date by whole days (UTC math, so DST can't skew it). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The `count` dates before `today` (most recent first). */
export function previousDates(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDate(today, -(i + 1)));
}

/** Milliseconds until the next local midnight, when a new daily set starts. */
export function msUntilNextDay(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}
