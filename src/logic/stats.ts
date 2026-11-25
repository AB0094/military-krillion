import { shiftDate } from './seed';
import type { SaveState } from './types';

/** Daily streaks: consecutive days with at least one completed live (non-archive) session. */
export function streaks(state: SaveState, today: string): { current: number; best: number } {
  const days = new Set<string>();
  for (const s of Object.values(state.sessions)) if (!s.archive && s.complete) days.add(s.date);

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days].sort()) {
    run = prev !== null && shiftDate(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  // A streak stays alive until the end of the day after your last play.
  let cursor = days.has(today) ? today : shiftDate(today, -1);
  let current = 0;
  while (days.has(cursor)) { current++; cursor = shiftDate(cursor, -1); }
  return { current, best };
}
