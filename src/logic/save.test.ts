import { describe, expect, it } from 'vitest';
import { emptyState, getSession, submitAnswer, type PlayContext } from './progress';
import { parseSave, sanitizeState, serializeSave } from './save';
import { streaks } from './stats';
import { dailySet } from './seed';
import type { Prompt, SaveState, SessionRecord } from './types';
import raw from '../../data/prompts.json';

const pool = raw as Prompt[];

function play(state: SaveState, date: string, mode: 'Ground' | 'Air' | 'Ranked' = 'Ground', archive = false): SaveState {
  const ctx: PlayContext = { date, mode, archive, prompts: dailySet(date, mode, pool) };
  return ctx.prompts.reduce((s, p) => submitAnswer(s, ctx, p.answers[0].name).state, state);
}

describe('sanitizeState', () => {
  it('round-trips a real save unchanged', () => {
    const s = play(play(emptyState(), '2026-11-25', 'Ranked'), '2026-11-25', 'Air');
    expect(sanitizeState(JSON.parse(serializeSave(s)))).toEqual(s);
  });
  it('returns a fresh state for junk, wrong versions and null', () => {
    for (const junk of [null, 5, 'x', [], {}, { version: 2 }]) expect(sanitizeState(junk)).toEqual(emptyState());
  });
  it('drops corrupt sessions but keeps good ones', () => {
    const good = play(emptyState(), '2026-11-25');
    const bad = JSON.parse(serializeSave(good));
    bad.sessions.broken = { date: 'nope', mode: 'Ground' };
    bad.sessions.alsoBroken = { date: '2026-01-01', mode: 'Sea', promptIds: ['a'], answers: [] };
    const s = sanitizeState(bad);
    expect(Object.keys(s.sessions)).toEqual(['2026-11-25|Ground']);
  });
  it('recomputes depth/complete instead of trusting them, and clamps values', () => {
    const s = play(emptyState(), '2026-11-25');
    const j = JSON.parse(serializeSave(s));
    const k = Object.keys(j.sessions)[0];
    j.sessions[k].depth = 999; j.sessions[k].complete = false; j.sessions[k].answers[0].score = 50;
    j.ratings.ranked = 1e9;
    const out = sanitizeState(j);
    const sess = out.sessions[k] as SessionRecord;
    expect(sess.complete).toBe(true);
    expect(sess.answers[0].score).toBe(1);
    expect(sess.depth).toBeLessThan(8);
    expect(out.ratings.ranked).toBe(5000);
  });
  it('drops negative or non-numeric player data', () => {
    const out = sanitizeState({ version: 1, sessions: {}, crowd: { a: { total: -1, counts: {} }, b: { total: 3, counts: { x: 2, y: 'z', w: -4 } } } });
    expect(out.crowd).toEqual({ b: { total: 3, counts: { x: 2 } } });
  });
});

describe('parseSave', () => {
  it('rejects non-JSON and non-saves, accepts real ones', () => {
    expect(parseSave('{{').ok).toBe(false);
    expect(parseSave('{"hello":1}').ok).toBe(false);
    expect(parseSave(serializeSave(emptyState())).ok).toBe(true);
  });
});

describe('stale sessions', () => {
  it('ignores a stored session when the prompt set has changed', () => {
    const date = '2026-11-25';
    const s = play(emptyState(), date);
    const ctx: PlayContext = { date, mode: 'Ground', archive: false, prompts: dailySet(date, 'Ground', pool) };
    expect(getSession(s, ctx)).toBeDefined();
    const edited = { ...ctx, prompts: [...ctx.prompts].reverse() };
    expect(getSession(s, edited)).toBeUndefined();
    // and starting over from a stale session begins at prompt 1 rather than crashing
    expect(submitAnswer(s, edited, 'zzz').session.answers).toHaveLength(1);
  });
});

describe('streaks', () => {
  it('counts consecutive live days and ignores archive plays', () => {
    let s = emptyState();
    for (const d of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', '2026-11-25']) s = play(s, d);
    s = play(s, '2026-11-23', 'Air', true);
    expect(streaks(s, '2026-11-25')).toEqual({ current: 2, best: 3 });
  });
  it('keeps the streak alive until the day after, then resets', () => {
    const s = play(play(emptyState(), '2026-11-23'), '2026-11-24');
    expect(streaks(s, '2026-11-25').current).toBe(2);
    expect(streaks(s, '2026-11-26').current).toBe(0);
    expect(streaks(emptyState(), '2026-11-25')).toEqual({ current: 0, best: 0 });
  });
});

import { MAX_KEPT_RUNS, pruneRuns, summarize, summarizeUnlimited } from './progress';
import { newRunSeed } from './seed';

describe('unlimited runs', () => {
  const runs = (n: number): { state: SaveState; seeds: string[] } => {
    let state = emptyState();
    const seeds: string[] = [];
    for (let i = 0; i < n; i++) {
      const seed = newRunSeed(1_760_000_000_000 + i * 1000, () => 0.3);
      seeds.push(seed);
      state = play(state, seed, 'Ground', true);
    }
    return { state, seeds };
  };
  it('never touch live stats, player data, rating or streaks', () => {
    const { state } = runs(3);
    const mixed = play(state, newRunSeed(1_770_000_000_000, () => 0.5), 'Ranked', true);
    expect(mixed.crowd).toEqual({});
    expect(mixed.ratings.ranked).toBe(1000);
    expect(summarize(mixed).Ground.played).toBe(0);
    expect(streaks(mixed, '2026-11-25')).toEqual({ current: 0, best: 0 });
  });
  it('are summarised on their own and survive a save round-trip', () => {
    const { state } = runs(4);
    const back = sanitizeState(JSON.parse(serializeSave(state)));
    expect(Object.keys(back.sessions)).toHaveLength(4);
    const sum = summarizeUnlimited(back);
    expect(sum.played).toBe(4);
    expect(sum.best).toBeGreaterThan(0);
  });
  it('are pruned oldest-first so the save cannot grow forever', () => {
    const { state, seeds } = runs(MAX_KEPT_RUNS + 5);
    const pruned = pruneRuns(state);
    const kept = Object.values(pruned.sessions).map((s) => s.date).sort();
    expect(kept).toHaveLength(MAX_KEPT_RUNS);
    expect(kept[0]).toBe(seeds[5]);
    expect(pruneRuns(pruned)).toBe(pruned); // nothing more to drop
    // daily sessions are never pruned
    const daily = play(pruned, '2026-11-25');
    expect(Object.keys(pruneRuns(daily).sessions)).toContain('2026-11-25|Ground');
  });
});
