import { describe, expect, it } from 'vitest';
import { emptyState, resetSession, sessionKey, submitAnswer, summarize, type PlayContext } from './progress';
import { dailySet } from './seed';
import { buildShareText } from './share';
import { validatePrompts } from './validate';
import type { Prompt, SaveState } from './types';
import raw from '../../data/prompts.json';

const pool = raw as Prompt[];
const date = '2026-11-25';

function ctx(mode: PlayContext['mode'], archive = false): PlayContext {
  return { date, mode, archive, prompts: dailySet(date, mode, pool) };
}
/** Plays every prompt by typing the first valid answer, or a wrong answer where `wrongAt` says so. */
function playAll(state: SaveState, c: PlayContext, wrongAt: number[] = []): SaveState {
  c.prompts.forEach((p, i) => {
    state = submitAnswer(state, c, wrongAt.includes(i) ? 'zzz' : p.answers[0].name).state;
  });
  return state;
}

describe('submitAnswer', () => {
  it('scores a valid answer with its weight when there is no player data', () => {
    const c = ctx('Ground');
    const r = submitAnswer(emptyState(), c, c.prompts[0].answers[0].aliases[0] ?? c.prompts[0].answers[0].name);
    expect(r.record.matched).toBe(c.prompts[0].answers[0].name);
    expect(r.record.score).toBe(c.prompts[0].answers[0].weight);
    expect(r.hint).toBeNull();
  });
  it('wrong answers score 0 and return a hint', () => {
    const r = submitAnswer(emptyState(), ctx('Air'), 'banana');
    expect(r.record.score).toBe(0);
    expect(r.record.matched).toBeNull();
    expect(r.hint).toMatch(/No match/);
  });
  it('does not mutate the input state', () => {
    const s = emptyState();
    submitAnswer(s, ctx('Air'), 'banana');
    expect(s.sessions).toEqual({});
    expect(s.crowd).toEqual({});
  });
  it('completes after 7 answers and sums depth', () => {
    const c = ctx('Ground');
    const s = playAll(emptyState(), c, [2]);
    const session = s.sessions[sessionKey(date, 'Ground', false)];
    const expected = c.prompts.reduce((sum, p, i) => sum + (i === 2 ? 0 : p.answers[0].weight), 0);
    expect(session.complete).toBe(true);
    expect(session.depth).toBeCloseTo(expected);
    expect(() => submitAnswer(s, c, 'x')).toThrow();
  });
  it('records player data for live play and uses it once the crowd is big enough', () => {
    const c = ctx('Ground');
    const p = c.prompts[0];
    const state = emptyState();
    state.crowd[p.id] = { total: 20, counts: { [p.answers[0].name]: 5 } };
    const r = submitAnswer(state, c, p.answers[0].name);
    expect(r.record.score).toBeCloseTo(0.75); // 1 - 5/20
    expect(r.state.crowd[p.id].total).toBe(21);
    expect(r.state.crowd[p.id].counts[p.answers[0].name]).toBe(6);
  });
  it('archive plays never touch crowd data or rating', () => {
    const c = ctx('Ranked', true);
    const s = playAll(emptyState(), c);
    expect(s.crowd).toEqual({});
    expect(s.ratings.ranked).toBe(1000);
    expect(s.rankedHistory).toHaveLength(0);
    expect(summarize(s).Ranked.played).toBe(0);
  });
});

describe('Ranked rating', () => {
  it('updates only the ranked field, once, on completion', () => {
    const c = ctx('Ranked');
    const s = playAll(emptyState(), c);
    expect(s.rankedHistory).toHaveLength(1);
    expect(s.ratings.ranked).toBe(s.rankedHistory[0].after);
    expect(Object.keys(s.ratings)).toEqual(['ranked']);
  });
  it('Ground and Air do not change the rating', () => {
    const s = playAll(playAll(emptyState(), ctx('Ground')), ctx('Air'));
    expect(s.ratings.ranked).toBe(1000);
    expect(s.rankedHistory).toHaveLength(0);
  });
  it('a perfect-rarity day gains rating; an all-wrong day loses it', () => {
    const c = ctx('Ranked');
    const rare = c.prompts.reduce((st, p) => submitAnswer(st, c, [...p.answers].sort((a, b) => b.weight - a.weight)[0].name).state, emptyState());
    expect(rare.ratings.ranked).toBeGreaterThan(1000);
    const none = playAll(emptyState(), c, [0, 1, 2, 3, 4, 5, 6]);
    expect(none.ratings.ranked).toBeLessThan(1000);
  });
});

describe('summarize / resetSession / share', () => {
  it('summarizes live completed sessions', () => {
    const s = playAll(emptyState(), ctx('Air'));
    const sum = summarize(s);
    expect(sum.Air.played).toBe(1);
    expect(sum.Air.best).toBeCloseTo(sum.Air.average);
    expect(sum.Ground.played).toBe(0);
  });
  it('resetSession removes the session', () => {
    const c = ctx('Air', true);
    const s = resetSession(playAll(emptyState(), c), c);
    expect(s.sessions[sessionKey(date, 'Air', true)]).toBeUndefined();
  });
  it('buildShareText includes date, mode, depth, tier and squares', () => {
    const c = ctx('Ground');
    const s = playAll(emptyState(), c, [0]);
    const sess = s.sessions[sessionKey(date, 'Ground', false)];
    const text = buildShareText({ date, mode: 'Ground', archive: false, depth: sess.depth, answers: sess.answers });
    expect(text).toContain('Military Krillion 2026-11-25 · Ground');
    expect(text).toMatch(/Distance [\d,]+m · \d+ pts — /);
    expect(text.split('\n')[2].startsWith('⬛')).toBe(true);
  });
});

describe('validatePrompts', () => {
  it('accepts the real data file, which has a detail line and briefing for every prompt', () => {
    expect(validatePrompts(pool)).toEqual([]);
    expect(pool.every((p) => p.fact && p.detail)).toBe(true);
    expect(pool.every((p) => p.answers.length >= 4)).toBe(true);
    expect(pool.length).toBeGreaterThanOrEqual(100);
  });
  it('flags missing fields and duplicates', () => {
    const bad = [
      { id: 'x', mode: 'Air', text: 'T', answers: [{ name: 'A', aliases: ['B'], weight: 0.5 }, { name: 'a', aliases: [], weight: 0.2 }, { name: 'C', aliases: ['b'], weight: 2 }] },
      { id: 'x', mode: 'Sea', text: '', answers: [] },
      { id: 'y', mode: 'Ground', text: 'T!', answers: [{ name: 'Q', weight: 0.5 }] },
    ];
    const errs = validatePrompts(bad).join('\n');
    expect(errs).toMatch(/duplicate id/);
    expect(errs).toMatch(/mode must be/);
    expect(errs).toMatch(/missing text/);
    expect(errs).toMatch(/at least one answer/);
    expect(errs).toMatch(/duplicates an answer/);
    expect(errs).toMatch(/weight must be/);
    expect(errs).toMatch(/aliases must be/);
    expect(errs).toMatch(/duplicate prompt text/);
    expect(errs).toMatch(/Need at least 7/);
    expect(validatePrompts([{ ...pool[0], fact: '  ' }]).join()).toMatch(/fact must be/);
  });
});
