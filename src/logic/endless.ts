import type { AnswerRecord, EndlessRun, Mode, Prompt, SaveState } from './types';
import { findMatch, hintFor, timeoutHint } from './normalize';
import { MIN_CROWD, rarity, totalDepth } from './scoring';
import { hashString, mulberry32, seededShuffle } from './seed';

export const START_LIVES = 3;
/** Endless depth is mapped onto the airfield tiers as if a run were this many prompts long. */
export const ENDLESS_SCALE = 14;

/**
 * The prompt at `index` of an Endless run. Questions never repeat until the whole pool has been used,
 * then it is reshuffled. Same seed + index = same prompt.
 */
export function endlessPromptAt(seed: string, mode: Mode, index: number, pool: readonly Prompt[]): Prompt {
  const eligible = pool.filter((p) => mode === 'Ranked' || p.mode === mode).sort((a, b) => a.id.localeCompare(b.id));
  const cycle = Math.floor(index / eligible.length);
  const order = seededShuffle(eligible, mulberry32(hashString(`mk|endless|${seed}|${mode}|${cycle}`)));
  return order[index % eligible.length];
}

export function startEndless(state: SaveState, seed: string, mode: Mode): SaveState {
  const run: EndlessRun = { seed, mode, answers: [], depth: 0, lives: START_LIVES, streak: 0, bestStreak: 0, over: false };
  return { ...state, endless: { ...state.endless, run } };
}

export interface EndlessOutcome {
  state: SaveState;
  run: EndlessRun;
  record: AnswerRecord;
  hint: string | null;
  lostLife: boolean;
  over: boolean;
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
  if (!correct) { lives -= 1; lostLife = true; } // lives are never won back
  const over = lives <= 0;

  let next: EndlessRun = { ...run, answers, depth: totalDepth(answers.map((a) => a.score)), lives, streak, bestStreak, over };
  let endless = { ...state.endless, run: next };
  if (over) {
    const correctCount = answers.filter((a) => a.matched !== null).length;
    const best = endless.best;
    const newBest = { depth: next.depth > best.depth, correct: correctCount > best.correct, streak: bestStreak > best.streak };
    next = { ...next, newBest };
    endless = {
      run: next, runs: endless.runs + 1,
      best: { depth: Math.max(best.depth, next.depth), correct: Math.max(best.correct, correctCount), streak: Math.max(best.streak, bestStreak) },
    };
  }
  const hint = match ? null : opts.timedOut ? timeoutHint(prompt.answers) : hintFor(prompt.answers);
  return { state: { ...state, endless }, run: next, record, hint, lostLife, over };
}

export function endlessStats(run: EndlessRun): { answered: number; correct: number; accuracy: number } {
  const answered = run.answers.length;
  const correct = run.answers.filter((a) => a.matched !== null).length;
  return { answered, correct, accuracy: answered ? correct / answered : 0 };
}
