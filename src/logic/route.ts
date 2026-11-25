import { isRunSeed } from './seed';
import { MODES, type Mode } from './types';

export type Route =
  | { name: 'home' }
  | { name: 'archive' }
  | { name: 'dive'; mode: Mode; date: string; archive: boolean }
  | { name: 'results'; mode: Mode; date: string; archive: boolean };

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toHash(r: Route): string {
  if (r.name === 'home') return '#/';
  if (r.name === 'archive') return '#/archive';
  return `#/${r.name}/${r.mode}/${r.date}${r.archive ? '/archive' : ''}`;
}

/** Parses a location hash; anything malformed becomes the home route. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'archive' && parts.length === 1) return { name: 'archive' };
  if ((parts[0] === 'dive' || parts[0] === 'results') && parts.length >= 3 && parts.length <= 4) {
    const mode = MODES.find((m) => m === parts[1]);
    const archive = parts[3] === 'archive';
    if (mode && (isValidDate(parts[2]) || isRunSeed(parts[2])) && (parts.length === 3 || archive)) {
      return { name: parts[0] as 'dive' | 'results', mode, date: parts[2], archive };
    }
  }
  return { name: 'home' };
}

/** Live plays are only allowed for today; archive plays only for past days. */
export function normalizeRoute(r: Route, today: string): Route {
  if (r.name === 'dive' || r.name === 'results') {
    // Unlimited runs are archive-style plays with a run seed instead of a date.
    if (isRunSeed(r.date)) return r.archive ? r : { name: 'home' };
    if (!r.archive && r.date !== today) return { name: 'home' };
    if (r.archive && r.date >= today) return { name: 'home' };
  }
  return r;
}
