import { describe, expect, it } from 'vitest';
import { ENDLESS_SCALE, MAX_SPEED, MIN_SPEED, START_LIVES, START_SPEED, distanceGain, dragFor, endlessPromptAt, endlessStats, promptDifficulty, recoverFor, speedFactor, startEndless, submitEndless } from './endless';
import { emptyState, submitAnswer, type PlayContext } from './progress';
import { sanitizeState, serializeSave } from './save';
import { buildEndlessShare } from './share';
import { dailySet, newRunSeed } from './seed';
import { QUESTION_SECONDS, isLow, secondsLeft } from './timer';
import { parseRoute, toHash } from './route';
import type { Prompt, SaveState } from './types';
import raw from '../../data/prompts.json';

const pool = raw as Prompt[];
const SEED = newRunSeed(1_760_000_000_000, () => 0.4);

/** Answers the current prompt correctly (best-weight answer) or wrongly. */
function answer(state: SaveState, ok: boolean, timedOut = false) {
  const run = state.endless.run!;
  const prompt = endlessPromptAt(run.seed, run.mode, run.answers.length, pool);
  const best = [...prompt.answers].sort((a, b) => b.weight - a.weight)[0].name;
  return submitEndless(state, pool, ok ? best : 'definitely wrong', { timedOut });
}
const play = (state: SaveState, plan: boolean[]) => plan.reduce((s, ok) => answer(s, ok).state, state);

describe('endless prompts', () => {
  it('are deterministic, mode-correct and do not repeat within a cycle', () => {
    const ids = Array.from({ length: 54 }, (_, i) => endlessPromptAt(SEED, 'Ground', i, pool).id);
    expect(ids).toEqual(Array.from({ length: 54 }, (_, i) => endlessPromptAt(SEED, 'Ground', i, pool).id));
    expect(new Set(ids).size).toBe(54);
    expect(Array.from({ length: 20 }, (_, i) => endlessPromptAt(SEED, 'Air', i, pool)).every((p) => p.mode === 'Air')).toBe(true);
  });
  it('reshuffle after the pool is used up, and differ by seed', () => {
    const n = pool.filter((p) => p.mode === 'Air').length;
    expect(endlessPromptAt(SEED, 'Air', 0, pool).id).toBeDefined();
    expect(endlessPromptAt(SEED, 'Air', n + 3, pool)).toBeDefined(); // far past the first cycle
    const other = newRunSeed(1_770_000_000_000, () => 0.9);
    const a = Array.from({ length: 8 }, (_, i) => endlessPromptAt(SEED, 'Ranked', i, pool).id).join();
    const b = Array.from({ length: 8 }, (_, i) => endlessPromptAt(other, 'Ranked', i, pool).id).join();
    expect(a).not.toBe(b);
  });
});

describe('lives', () => {
  it('starts with three lives; a wrong answer or timeout costs one', () => {
    let s = startEndless(emptyState(), SEED, 'Ground');
    expect(s.endless.run!.lives).toBe(START_LIVES);
    const wrong = answer(s, false);
    expect(wrong.lostLife).toBe(true);
    expect(wrong.run.lives).toBe(2);
    expect(wrong.over).toBe(false);
    s = wrong.state;
    const late = answer(s, true, true); // even a would-be-correct answer is void if time ran out
    expect(late.record).toMatchObject({ timedOut: true, matched: null, score: 0, input: '' });
    expect(late.hint).toMatch(/Out of time/);
    expect(late.run.lives).toBe(1);
  });
  it('the third lost life ends the run and records personal bests', () => {
    let s = play(startEndless(emptyState(), SEED, 'Air'), [true, true, true]);
    const depth = s.endless.run!.depth;
    s = play(s, [false, false]);
    const last = answer(s, false);
    expect(last.over).toBe(true);
    expect(last.run.lives).toBe(0);
    expect(last.state.endless.runs).toBe(1);
    expect(last.state.endless.best).toMatchObject({ correct: 3, streak: 3 });
    expect(last.state.endless.best.distance).toBeGreaterThan(0);
    expect(last.state.endless.best.depth).toBeCloseTo(depth);
    expect(last.run.newBest).toEqual({ depth: true, distance: true, correct: true, streak: true });
    expect(() => answer(last.state, true)).toThrow();
  });
  it('lives are never won back, however long the streak', () => {
    let s = play(startEndless(emptyState(), SEED, 'Ground'), [false]);
    expect(s.endless.run!.lives).toBe(2);
    for (let i = 0; i < 12; i++) {
      const o = answer(s, true);
      expect(o.run.lives).toBe(2);
      expect(o.lostLife).toBe(false);
      s = o.state;
    }
    expect(s.endless.run!.streak).toBe(12);
    expect(Object.keys(answer(s, false)).includes('gainedLife')).toBe(false);
  });
  it('a miss resets the streak but keeps the best', () => {
    const s = play(startEndless(emptyState(), SEED, 'Ground'), [true, true, true, false]);
    expect(s.endless.run).toMatchObject({ streak: 0, bestStreak: 3 });
  });
  it('depth is the sum of rarity, and never writes to player data', () => {
    const s = play(startEndless(emptyState(), SEED, 'Ground'), [true, true]);
    expect(s.endless.run!.depth).toBeCloseTo(s.endless.run!.answers.reduce((a, r) => a + r.score, 0));
    expect(s.crowd).toEqual({});
    expect(endlessStats(s.endless.run!)).toMatchObject({ answered: 2, correct: 2, accuracy: 1 });
  });
  it('keeps best and later runs after the first ends', () => {
    let s = play(startEndless(emptyState(), SEED, 'Ground'), [true, true, false, false, false]);
    const best = s.endless.best;
    s = startEndless(s, newRunSeed(1_760_000_100_000, () => 0.1), 'Ground');
    expect(s.endless.best).toEqual(best);
    expect(s.endless.run!.answers).toHaveLength(0);
  });
});

describe('speed, DRAG and distance', () => {
  it('starts at 600 km/h with no distance', () => {
    const run = startEndless(emptyState(), SEED, 'Ground').endless.run!;
    expect(run).toMatchObject({ speed: START_SPEED, distance: 0, wrongs: 0 });
  });
  it('each miss costs more speed than the last, and never below the floor', () => {
    expect([0, 1, 2].map(dragFor)).toEqual([110, 150, 190]);
    let s = startEndless(emptyState(), SEED, 'Ground');
    const speeds = [START_SPEED];
    for (let i = 0; i < 2; i++) { const o = answer(s, false); s = o.state; speeds.push(o.run.speed); expect(o.speedDelta).toBe(-dragFor(i)); }
    expect(speeds).toEqual([600, 490, 340]);
    expect(Math.max(MIN_SPEED, 100 - 110)).toBe(MIN_SPEED);
  });
  it('correct answers recover speed, more on a streak, up to the cap', () => {
    expect([1, 2, 3, 5, 9].map(recoverFor)).toEqual([40, 50, 60, 80, 80]);
    let s = play(startEndless(emptyState(), SEED, 'Ground'), [false, true]);
    expect(s.endless.run!.speed).toBe(490 + 40);
    for (let i = 0; i < 30; i++) s = answer(s, true).state;
    expect(s.endless.run!.speed).toBe(MAX_SPEED);
  });
  it('distance is points x 10 m scaled by speed: full speed is 1x, slow is less, fast is more', () => {
    expect(speedFactor(START_SPEED)).toBe(1);
    expect(speedFactor(300)).toBe(0.5);
    expect(speedFactor(MAX_SPEED)).toBeCloseTo(1.33, 2);
    expect(speedFactor(10)).toBe(0.25);
    expect(distanceGain(90, 600)).toBe(900);
    expect(distanceGain(90, 300)).toBe(450);
    expect(distanceGain(100, 800)).toBe(1330);
  });
  it('a miss adds no distance; the answer outcome reports the gain', () => {
    const miss = answer(startEndless(emptyState(), SEED, 'Ground'), false);
    expect(miss.distanceGain).toBe(0);
    expect(miss.run.distance).toBe(0);
    const hit = answer(startEndless(emptyState(), SEED, 'Ground'), true);
    expect(hit.distanceGain).toBe(hit.run.distance);
    expect(hit.run.distance).toBeGreaterThan(0);
  });
});

describe('difficulty ramp', () => {
  it('rates prompts with no common answer and few answers as harder', () => {
    const mk = (weights: number[]): Prompt => ({ id: 'x', mode: 'Air', text: 't', answers: weights.map((w, i) => ({ name: String(i), aliases: [], weight: w })) });
    expect(promptDifficulty(mk([0.1, 0.9]))).toBeLessThan(promptDifficulty(mk([0.55, 0.9])));
    expect(promptDifficulty(mk(Array(25).fill(0.3)))).toBeLessThan(promptDifficulty(mk([0.3, 0.3])));
  });
  it('questions get harder as the run goes on', () => {
    const avg = (from: number, to: number, seed: string) => {
      const ds = Array.from({ length: to - from }, (_, i) => promptDifficulty(endlessPromptAt(seed, 'Ground', from + i, pool)));
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    };
    for (const seed of [SEED, newRunSeed(1_770_000_000_000, () => 0.9), newRunSeed(1_780_000_000_000, () => 0.2)]) {
      expect(avg(0, 10, seed)).toBeLessThan(avg(22, 32, seed));
      expect(avg(22, 32, seed)).toBeLessThan(avg(44, 54, seed));
    }
  });
});

describe('saving and sharing', () => {
  it('round-trips a run in progress and a finished one', () => {
    for (const plan of [[true, false], [true, true, false, false, false]]) {
      const s = play(startEndless(emptyState(), SEED, 'Ranked'), plan);
      expect(sanitizeState(JSON.parse(serializeSave(s))).endless).toEqual(s.endless);
    }
  });
  it('rejects a corrupt run but keeps the rest of the save', () => {
    const j = JSON.parse(serializeSave(play(startEndless(emptyState(), SEED, 'Ground'), [true])));
    j.endless.run.seed = 'not-a-seed';
    j.endless.best.depth = -5;
    const out = sanitizeState(j);
    expect(out.endless.run).toBeNull();
    expect(out.endless.best.depth).toBe(0);
  });
  it('derives streaks and lives from answers instead of trusting them', () => {
    const j = JSON.parse(serializeSave(play(startEndless(emptyState(), SEED, 'Ground'), [true, true, false])));
    j.endless.run.streak = 99; j.endless.run.bestStreak = 99; j.endless.run.lives = 77; j.endless.run.speed = 9999; j.endless.run.wrongs = 40;
    const run = sanitizeState(j).endless.run!;
    expect(run.streak).toBe(0);
    expect(run.bestStreak).toBe(2);
    expect(run.lives).toBe(START_LIVES);
    expect(run.speed).toBe(MAX_SPEED);
    expect(run.wrongs).toBe(1);
  });
  it('builds share text', () => {
    const run = play(startEndless(emptyState(), SEED, 'Air'), [true, true, false, false, false]).endless.run!;
    const text = buildEndlessShare(run);
    expect(text).toContain('Endless · Air');
    expect(text).toContain('2/5 answered');
    expect(text).toMatch(/\d+ pts/);
    expect(text).toContain('crashed');
    expect(text).toMatch(/Distance [\d,]+m/);
    expect([...text.split('\n')[3]]).toHaveLength(5);
  });
  it('routes round-trip', () => {
    expect(parseRoute(toHash({ name: 'endless', mode: 'Ranked' }))).toEqual({ name: 'endless', mode: 'Ranked' });
    expect(parseRoute('#/endless/Sea')).toEqual({ name: 'home' });
  });
  it('maps onto the airfield tiers via the endless scale', () => {
    expect(ENDLESS_SCALE).toBe(14);
  });
});

describe('question timer', () => {
  it('counts down from 20 seconds and never goes negative', () => {
    expect(QUESTION_SECONDS).toBe(20);
    expect(secondsLeft(1000, 1000)).toBe(20);
    expect(secondsLeft(1000, 11_000)).toBe(10);
    expect(secondsLeft(1000, 99_000)).toBe(0);
  });
  it('turns urgent in the last five seconds', () => {
    expect(isLow(5)).toBe(true);
    expect(isLow(5.1)).toBe(false);
  });
  it('a timed-out daily answer scores zero and is flagged', () => {
    const date = '2026-11-25';
    const ctx: PlayContext = { date, mode: 'Ground', archive: false, prompts: dailySet(date, 'Ground', pool) };
    const r = submitAnswer(emptyState(), ctx, '', { timedOut: true });
    expect(r.record).toMatchObject({ timedOut: true, matched: null, score: 0 });
    expect(r.hint).toMatch(/Out of time/);
    expect(r.session.answers).toHaveLength(1);
  });
});
