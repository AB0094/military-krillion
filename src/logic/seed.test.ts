import { describe, expect, it } from 'vitest';
import { dailySet, dateKey, hashString, msUntilNextDay, mulberry32, previousDates, seededShuffle, shiftDate } from './seed';
import type { Prompt } from './types';
import raw from '../../data/prompts.json';

const pool = raw as Prompt[];
const ids = (ps: Prompt[]) => ps.map((p) => p.id);

describe('seeded randomness', () => {
  it('hashString and mulberry32 are deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('seededShuffle is a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = seededShuffle(input, mulberry32(1));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('dailySet', () => {
  it('returns exactly 7 prompts for every mode', () => {
    for (const mode of ['Ground', 'Air', 'Ranked'] as const) {
      expect(dailySet('2026-11-25', mode, pool)).toHaveLength(7);
    }
  });
  it('is the same for the same date, regardless of pool order', () => {
    const a = ids(dailySet('2026-11-25', 'Ground', pool));
    const b = ids(dailySet('2026-11-25', 'Ground', [...pool].reverse()));
    expect(a).toEqual(b);
  });
  it('varies across dates', () => {
    const days = Array.from({ length: 10 }, (_, i) => ids(dailySet(`2026-12-${String(i + 1).padStart(2, '0')}`, 'Air', pool)).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });
  it('has no duplicate prompts and respects mode', () => {
    const g = dailySet('2026-01-01', 'Ground', pool);
    expect(new Set(ids(g)).size).toBe(7);
    expect(g.every((p) => p.mode === 'Ground')).toBe(true);
    expect(dailySet('2026-01-01', 'Air', pool).every((p) => p.mode === 'Air')).toBe(true);
  });
  it('Ranked mixes modes and draws from the Ground and Air daily sets', () => {
    for (const d of ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04']) {
      const r = dailySet(d, 'Ranked', pool);
      const modes = new Set(r.map((p) => p.mode));
      expect(modes.size).toBe(2);
      const allowed = new Set([...ids(dailySet(d, 'Ground', pool)), ...ids(dailySet(d, 'Air', pool))]);
      expect(r.every((p) => allowed.has(p.id))).toBe(true);
    }
  });
});

describe('dates', () => {
  it('dateKey formats local date', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('previousDates counts back across month boundaries', () => {
    expect(previousDates('2026-03-02', 3)).toEqual(['2026-03-01', '2026-02-28', '2026-02-27']);
  });
  it('shiftDate crosses year and leap-day boundaries', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('msUntilNextDay counts to local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 5, 1, 23, 0, 0))).toBe(3600_000);
    expect(msUntilNextDay(new Date(2026, 5, 1, 0, 0, 0))).toBe(24 * 3600_000);
  });
});

import { isRunSeed, newRunSeed } from './seed';

describe('unlimited run seeds', () => {
  it('are recognisable, time-ordered and distinct', () => {
    const a = newRunSeed(1_760_000_000_000, () => 0.1);
    const b = newRunSeed(1_760_000_005_000, () => 0.1);
    const c = newRunSeed(1_760_000_000_000, () => 0.9);
    expect(isRunSeed(a)).toBe(true);
    expect(a < b).toBe(true);
    expect(a).not.toBe(c);
    expect(isRunSeed('2026-11-25')).toBe(false);
    expect(isRunSeed('nonsense')).toBe(false);
  });
  it('give a stable, full prompt set for any seed', () => {
    const seed = newRunSeed(1_760_000_000_000, () => 0.5);
    for (const mode of ['Ground', 'Air', 'Ranked'] as const) {
      const set = dailySet(seed, mode, pool);
      expect(set).toHaveLength(7);
      expect(ids(set)).toEqual(ids(dailySet(seed, mode, pool)));
    }
    expect(ids(dailySet(newRunSeed(1, () => 0.2), 'Air', pool))).not.toEqual(ids(dailySet(newRunSeed(2, () => 0.7), 'Air', pool)));
  });
});
