/** Seconds allowed per question. */
export const QUESTION_SECONDS = 20;
/** The countdown turns urgent at this many seconds left. */
export const LOW_SECONDS = 5;

/** Seconds remaining (never negative) for a question started at `startMs`. */
export function secondsLeft(startMs: number, nowMs: number, limit: number = QUESTION_SECONDS): number {
  return Math.max(0, limit - (nowMs - startMs) / 1000);
}

export const isLow = (seconds: number): boolean => seconds <= LOW_SECONDS;
