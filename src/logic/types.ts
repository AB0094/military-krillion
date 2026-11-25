export type PromptMode = 'Ground' | 'Air';
export type Mode = PromptMode | 'Ranked';
export const MODES: Mode[] = ['Ground', 'Air', 'Ranked'];

export interface Answer {
  name: string;
  aliases: string[];
  /** Fallback rarity (0..1) used until enough player data exists. */
  weight: number;
}

export interface Prompt {
  id: string;
  mode: PromptMode;
  text: string;
  /** Optional scope note shown under the prompt (what counts, which variants). */
  detail?: string;
  /** Optional one-line briefing shown after the prompt is answered. */
  fact?: string;
  answers: Answer[];
}

/** Aggregate player answers for one prompt. `total` counts every submission; `counts` is keyed by canonical answer name. */
export interface AnswerStats {
  total: number;
  counts: Record<string, number>;
}

export interface AnswerRecord {
  promptId: string;
  input: string;
  matched: string | null;
  score: number;
  /** True if the typed text was only matched after spelling correction. */
  corrected?: boolean;
}

export interface SessionRecord {
  date: string;
  mode: Mode;
  archive: boolean;
  promptIds: string[];
  answers: AnswerRecord[];
  complete: boolean;
  depth: number;
}

export interface RatingEntry {
  date: string;
  depth: number;
  before: number;
  after: number;
}

export interface SaveState {
  version: 1;
  sessions: Record<string, SessionRecord>;
  crowd: Record<string, AnswerStats>;
  /** Ranked rating lives in its own field; Ground and Air never touch it. */
  ratings: { ranked: number };
  rankedHistory: RatingEntry[];
}
