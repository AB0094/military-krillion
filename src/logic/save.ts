import { emptyState, sessionKey } from './progress';
import { isValidDate } from './route';
import { isRunSeed } from './seed';
import { totalDepth } from './scoring';
import { START_LIVES } from './endless';
import { MODES, type AnswerRecord, type AnswerStats, type EndlessRun, type EndlessState, type RatingEntry, type SaveState, type SessionRecord } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

function cleanAnswer(x: unknown): AnswerRecord | null {
  if (!isObj(x) || !isStr(x.promptId) || !isStr(x.input) || !(x.matched === null || isStr(x.matched)) || !isNum(x.score)) return null;
  return { promptId: x.promptId, input: x.input.slice(0, 200), matched: x.matched, score: Math.min(1, Math.max(0, x.score)), ...(x.corrected === true ? { corrected: true } : {}), ...(x.timedOut === true ? { timedOut: true } : {}) };
}

function cleanSession(x: unknown): SessionRecord | null {
  if (!isObj(x) || !isStr(x.date) || !(isValidDate(x.date) || isRunSeed(x.date))) return null;
  const mode = MODES.find((m) => m === x.mode);
  if (!mode || !Array.isArray(x.promptIds) || !x.promptIds.every(isStr) || x.promptIds.length === 0 || !Array.isArray(x.answers)) return null;
  const answers = x.answers.map(cleanAnswer);
  if (answers.some((a) => a === null) || answers.length > x.promptIds.length) return null;
  const clean = answers as AnswerRecord[];
  // Derived fields are recomputed rather than trusted.
  return {
    date: x.date, mode, archive: x.archive === true, promptIds: x.promptIds as string[], answers: clean,
    complete: clean.length === x.promptIds.length, depth: totalDepth(clean.map((a) => a.score)),
  };
}

function cleanCrowd(x: unknown): Record<string, AnswerStats> {
  const out: Record<string, AnswerStats> = {};
  if (!isObj(x)) return out;
  for (const [id, v] of Object.entries(x)) {
    if (!isObj(v) || !isNum(v.total) || v.total < 0 || !isObj(v.counts)) continue;
    const counts: Record<string, number> = {};
    for (const [name, n] of Object.entries(v.counts)) if (isNum(n) && n >= 0) counts[name] = Math.floor(n);
    out[id] = { total: Math.floor(v.total), counts };
  }
  return out;
}

function cleanRun(x: unknown): EndlessRun | null {
  if (!isObj(x) || !isStr(x.seed) || !isRunSeed(x.seed) || !Array.isArray(x.answers)) return null;
  const mode = MODES.find((m) => m === x.mode);
  const answers = x.answers.map(cleanAnswer);
  if (!mode || answers.some((a) => a === null)) return null;
  const clean = answers as AnswerRecord[];
  // streaks are derived from the answers rather than trusted
  let streak = 0;
  let bestStreak = 0;
  for (const a of clean) { streak = a.matched ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); }
  const lives = isNum(x.lives) ? Math.min(START_LIVES, Math.max(0, Math.floor(x.lives))) : START_LIVES;
  const nb = isObj(x.newBest) ? { depth: x.newBest.depth === true, correct: x.newBest.correct === true, streak: x.newBest.streak === true } : undefined;
  return { seed: x.seed, mode, answers: clean, depth: totalDepth(clean.map((a) => a.score)), lives, streak, bestStreak, over: lives === 0 || x.over === true, ...(nb ? { newBest: nb } : {}) };
}

function cleanEndless(x: unknown, base: EndlessState): EndlessState {
  if (!isObj(x)) return base;
  const n = (v: unknown) => (isNum(v) && v >= 0 ? v : 0);
  const best = isObj(x.best) ? { depth: n(x.best.depth), correct: Math.floor(n(x.best.correct)), streak: Math.floor(n(x.best.streak)) } : base.best;
  return { run: cleanRun(x.run), best, runs: Math.floor(n(x.runs)) };
}

/** Turns anything (old versions, hand-edited JSON, corrupt data) into a safe SaveState; bad parts are dropped. */
export function sanitizeState(raw: unknown): SaveState {
  const base = emptyState();
  if (!isObj(raw) || raw.version !== 1) return base;

  const sessions: SaveState['sessions'] = {};
  if (isObj(raw.sessions)) {
    for (const v of Object.values(raw.sessions)) {
      const s = cleanSession(v);
      if (s) sessions[sessionKey(s.date, s.mode, s.archive)] = s;
    }
  }

  const history: RatingEntry[] = [];
  if (Array.isArray(raw.rankedHistory)) {
    for (const h of raw.rankedHistory) {
      if (isObj(h) && isStr(h.date) && isNum(h.depth) && isNum(h.before) && isNum(h.after)) history.push({ date: h.date, depth: h.depth, before: h.before, after: h.after });
    }
  }

  const rating = isObj(raw.ratings) && isNum(raw.ratings.ranked) ? Math.min(5000, Math.max(0, Math.round(raw.ratings.ranked))) : base.ratings.ranked;
  return { version: 1, sessions, crowd: cleanCrowd(raw.crowd), ratings: { ranked: rating }, rankedHistory: history, endless: cleanEndless(raw.endless, base.endless) };
}

export function serializeSave(state: SaveState): string {
  return JSON.stringify(state);
}

export type ParseResult = { ok: true; state: SaveState } | { ok: false; error: string };

/** For importing a pasted save. Unlike sanitizeState, this refuses input that isn't a save at all. */
export function parseSave(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'That is not valid JSON.' }; }
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.sessions)) return { ok: false, error: 'That does not look like a Military Krillion save.' };
  return { ok: true, state: sanitizeState(raw) };
}
