import { emptyState, sessionKey } from './progress';
import { isValidDate } from './route';
import { totalDepth } from './scoring';
import { MODES, type AnswerRecord, type AnswerStats, type RatingEntry, type SaveState, type SessionRecord } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

function cleanAnswer(x: unknown): AnswerRecord | null {
  if (!isObj(x) || !isStr(x.promptId) || !isStr(x.input) || !(x.matched === null || isStr(x.matched)) || !isNum(x.score)) return null;
  return { promptId: x.promptId, input: x.input.slice(0, 200), matched: x.matched, score: Math.min(1, Math.max(0, x.score)), ...(x.corrected === true ? { corrected: true } : {}) };
}

function cleanSession(x: unknown): SessionRecord | null {
  if (!isObj(x) || !isStr(x.date) || !isValidDate(x.date)) return null;
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
  return { version: 1, sessions, crowd: cleanCrowd(raw.crowd), ratings: { ranked: rating }, rankedHistory: history };
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
