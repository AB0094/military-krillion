import type { AnswerRecord, EndlessRun, Mode, Prompt, SaveState } from './types';
import { findMatch, hintFor, timeoutHint } from './normalize';
import { MIN_CROWD, rarity, totalDepth } from './scoring';
import { hashString, mulberry32, seededShuffle } from './seed';

export const START_LIVES = 3;
/** Endless distance is mapped onto the airfield tiers as if a run were this many 1,000m rounds long. */
export const ENDLESS_SCALE = 14;

// ---- speed (km/h) ----
export const START_SPEED = 600;
export const MAX_SPEED = 800;
export const MIN_SPEED = 150;

/** Speed lost to DRAG on a miss. Each earlier miss makes the next one hurt more: 110, 150, 190... */
export const dragFor = (missesSoFar: number): number => 110 + 40 * missesSoFar;
/** Speed regained on a correct answer, growing with the streak: 40, 50, 60... up to +80. */
export const recoverFor = (streak: number): number => 40 + Math.min(40, 10 * Math.max(0, streak - 1));
/** Distance multiplier from speed: 1.0 at the starting speed, up to 1.33x at top speed, never below 0.25x. */
export const speedFactor = (speed: number): number => Math.min(1.33, Math.max(0.25, speed / START_SPEED));
/** Metres flown for an answer worth `points`: the usual 10 m a point, scaled by speed. */
export const distanceGain = (points: number, speed: number): number => Math.round(points * 10 * speedFactor(speed));

/** How hard a prompt is: no easy (common) answer available, and few valid answers, means harder. 0..~1.35. */
export function promptDifficulty(p: Prompt): number {
  const easiest = Math.min(...p.answers.map((a) => a.weight));
  const breadth = 1 - Math.min(p.answers.length, 25) / 25;
  return easiest + 0.35 * breadth;
}

/**
 * The prompt at `index` of an Endless run. The first questions are easy and they get steadily harder:
 * the pool is ordered easy to hard (with seeded noise so every run feels different), so questions never repeat
 * until the whole pool has been used. After that the pool comes round again, hardest first.
 */
export function endlessPromptAt(seed: string, mode: Mode, index: number, pool: readonly Prompt[]): Prompt {
  const eligible = pool.filter((p) => mode === 'Ranked' || p.mode === mode).sort((a, b) => a.id.localeCompare(b.id));
  const cycle = Math.floor(index / eligible.length);
  const rng = mulberry32(hashString(`mk|endless|${seed}|${mode}|${cycle}`));
  const keyed = seededShuffle(eligible, rng).map((p) => ({ p, k: promptDifficulty(p) + (rng() - 0.5) * 0.5 }));
  keyed.sort((a, b) => (cycle === 0 ? a.k - b.k : b.k - a.k));
  return keyed[index % eligible.length].p;
}

export function startEndless(state: SaveState, seed: string, mode: Mode): SaveState {
  const run: EndlessRun = { seed, mode, answers: [], depth: 0, lives: START_LIVES, streak: 0, bestStreak: 0, speed: START_SPEED, distance: 0, wrongs: 0, over: false };
  return { ...state, endless: { ...state.endless, run } };
}

export interface EndlessOutcome {
  state: SaveState;
  run: EndlessRun;
  record: AnswerRecord;
  hint: string | null;
  lostLife: boolean;
  over: boolean;
  /** Change in speed (km/h): negative on a miss (DRAG), positive when a correct answer recovers speed. */
  speedDelta: number;
  /** Metres added by this answer. */
  distanceGain: number;
}

/** Scores one answer in the current Endless run. Rarity reads the shared player data but never writes to it. */
export function submitEndless(state: SaveState, pool: readonly Prompt[], input: string, opts: { timedOut?: boolean } = {}): EndlessOutcome {
  const run = state.endless.run;
  if (!run || run.over) throw new Error('No Endless run in progress.');
  const prompt = endlessPromptAt(run.seed, run.mode, run.answers.length, pool);
  const found = opts.timedOut ? null : findMatch(input, prompt.answers);
  const match = found?.answer ?? null;
  const score = match ? rarity(match, state.crowd[prompt.id], MIN_CROWD) : 0;
  const record: AnswerRecord = {
    promptId: prompt.id, input: opts.timedOut ? '' : input.trim(), matched: match ? match.name : null, score,
    ...(found?.corrected ? { corrected: true } : {}), ...(opts.timedOut ? { timedOut: true } : {}),
  };

  const answers = [...run.answers, record];
  const correct = match !== null;
  const streak = correct ? run.streak + 1 : 0;
  const bestStreak = Math.max(run.bestStreak, streak);
  let lives = run.lives;
  let lostLife = false;
  let speed = run.speed;
  if (!correct) {
    lives -= 1; // lives are never won back
    lostLife = true;
    speed = Math.max(MIN_SPEED, speed - dragFor(run.wrongs));
  } else {
    speed = Math.min(MAX_SPEED, speed + recoverFor(streak));
  }
  const gain = correct ? distanceGain(Math.round(score * 100), speed) : 0;
  const over = lives <= 0;

  let next: EndlessRun = { ...run, answers, depth: totalDepth(answers.map((a) => a.score)), lives, streak, bestStreak, speed, distance: run.distance + gain, wrongs: run.wrongs + (correct ? 0 : 1), over };
  let endless = { ...state.endless, run: next };
  if (over) {
    const correctCount = answers.filter((a) => a.matched !== null).length;
    const best = endless.best;
    const newBest = { depth: next.depth > best.depth, distance: next.distance > best.distance, correct: correctCount > best.correct, streak: bestStreak > best.streak };
    next = { ...next, newBest };
    endless = {
      run: next, runs: endless.runs + 1,
      best: { depth: Math.max(best.depth, next.depth), distance: Math.max(best.distance, next.distance), correct: Math.max(best.correct, correctCount), streak: Math.max(best.streak, bestStreak) },
    };
  }
  const hint = match ? null : opts.timedOut ? timeoutHint(prompt.answers) : hintFor(prompt.answers);
  return { state: { ...state, endless }, run: next, record, hint, lostLife, over, speedDelta: speed - run.speed, distanceGain: gain };
}

export function endlessStats(run: EndlessRun): { answered: number; correct: number; accuracy: number } {
  const answered = run.answers.length;
  const correct = run.answers.filter((a) => a.matched !== null).length;
  return { answered, correct, accuracy: answered ? correct / answered : 0 };
}
