import type { AnswerRecord, Mode, Prompt, SaveState, SessionRecord } from './types';
import { findMatch, hintFor } from './normalize';
import { MIN_CROWD, rarity, totalDepth } from './scoring';
import { dayMedianDepth, START_RATING, updateRating } from './elo';

export function emptyState(): SaveState {
  return { version: 1, sessions: {}, crowd: {}, ratings: { ranked: START_RATING }, rankedHistory: [] };
}

export function sessionKey(date: string, mode: Mode, archive: boolean): string {
  return `${archive ? 'archive|' : ''}${date}|${mode}`;
}

export interface PlayContext {
  date: string;
  mode: Mode;
  archive: boolean;
  /** The day's prompts, in order (from dailySet). */
  prompts: readonly Prompt[];
}

export interface SubmitResult {
  state: SaveState;
  record: AnswerRecord;
  hint: string | null;
  session: SessionRecord;
}

/** Discards any existing session for this key (used to restart an archive replay). */
export function resetSession(state: SaveState, ctx: Pick<PlayContext, 'date' | 'mode' | 'archive'>): SaveState {
  const sessions = { ...state.sessions };
  delete sessions[sessionKey(ctx.date, ctx.mode, ctx.archive)];
  return { ...state, sessions };
}

/** The stored session for this day/mode, or undefined if none or if the prompt set changed since (e.g. data file edited). */
export function getSession(state: SaveState, ctx: PlayContext): SessionRecord | undefined {
  const s = state.sessions[sessionKey(ctx.date, ctx.mode, ctx.archive)];
  if (!s) return undefined;
  const same = s.promptIds.length === ctx.prompts.length && s.promptIds.every((id, i) => id === ctx.prompts[i].id);
  return same ? s : undefined;
}

/** Scores one typed answer for the next unanswered prompt and returns the updated state. Never mutates its input. */
export function submitAnswer(state: SaveState, ctx: PlayContext, input: string): SubmitResult {
  const key = sessionKey(ctx.date, ctx.mode, ctx.archive);
  const existing: SessionRecord = getSession(state, ctx) ?? {
    date: ctx.date, mode: ctx.mode, archive: ctx.archive,
    promptIds: ctx.prompts.map((p) => p.id), answers: [], complete: false, depth: 0,
  };
  if (existing.complete) throw new Error('Session already complete.');

  const prompt = ctx.prompts[existing.answers.length];
  const found = findMatch(input, prompt.answers);
  const match = found?.answer ?? null;
  const stats = state.crowd[prompt.id];
  const score = match ? rarity(match, stats, MIN_CROWD) : 0;
  const record: AnswerRecord = { promptId: prompt.id, input: input.trim(), matched: match ? match.name : null, score, ...(found?.corrected ? { corrected: true } : {}) };

  const answers = [...existing.answers, record];
  const complete = answers.length >= ctx.prompts.length;
  const session: SessionRecord = { ...existing, answers, complete, depth: totalDepth(answers.map((a) => a.score)) };

  let next: SaveState = { ...state, sessions: { ...state.sessions, [key]: session } };

  if (!ctx.archive) {
    // Local player data: counted only for live plays, after scoring so you never rank against yourself.
    const prev = state.crowd[prompt.id] ?? { total: 0, counts: {} };
    const counts = match ? { ...prev.counts, [match.name]: (prev.counts[match.name] ?? 0) + 1 } : prev.counts;
    next = { ...next, crowd: { ...state.crowd, [prompt.id]: { total: prev.total + 1, counts } } };
  }

  if (complete && !ctx.archive && ctx.mode === 'Ranked') {
    const before = state.ratings.ranked;
    const after = updateRating(before, session.depth, dayMedianDepth(ctx.prompts));
    next = {
      ...next,
      ratings: { ...next.ratings, ranked: after },
      rankedHistory: [...next.rankedHistory, { date: ctx.date, depth: session.depth, before, after }],
    };
  }

  return { state: next, record, hint: match ? null : hintFor(prompt.answers), session };
}

export interface ModeSummary { played: number; best: number; average: number }

/** Depth stats for completed live (non-archive) sessions, per mode. */
export function summarize(state: SaveState): Record<Mode, ModeSummary> & { ranking: number } {
  const out = {
    Ground: { played: 0, best: 0, average: 0 },
    Air: { played: 0, best: 0, average: 0 },
    Ranked: { played: 0, best: 0, average: 0 },
  };
  for (const s of Object.values(state.sessions)) {
    if (s.archive || !s.complete) continue;
    const m = out[s.mode];
    m.average = (m.average * m.played + s.depth) / (m.played + 1);
    m.played++;
    m.best = Math.max(m.best, s.depth);
  }
  return { ...out, ranking: state.ratings.ranked };
}
