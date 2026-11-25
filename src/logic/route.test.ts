import { describe, expect, it } from 'vitest';
import { isValidDate, normalizeRoute, parseRoute, toHash, type Route } from './route';

describe('routes', () => {
  it('round-trips every route shape', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'archive' },
      { name: 'dive', mode: 'Ground', date: '2026-11-25', archive: false },
      { name: 'results', mode: 'Ranked', date: '2026-11-24', archive: true },
    ];
    for (const r of routes) expect(parseRoute(toHash(r))).toEqual(r);
  });
  it('falls back to home for garbage', () => {
    for (const h of ['', '#', '#/nope', '#/dive/Sea/2026-11-25', '#/dive/Air/2026-13-45', '#/dive/Air/2026-11-25/x', '#/dive/Air', '#/archive/extra']) {
      expect(parseRoute(h)).toEqual({ name: 'home' });
    }
  });
  it('validates real calendar dates', () => {
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('26-1-1')).toBe(false);
  });
  it('only allows live play for today and archive play for past days', () => {
    const live = (date: string): Route => ({ name: 'dive', mode: 'Air', date, archive: false });
    const arch = (date: string): Route => ({ name: 'dive', mode: 'Air', date, archive: true });
    expect(normalizeRoute(live('2026-11-25'), '2026-11-25').name).toBe('dive');
    expect(normalizeRoute(live('2026-11-24'), '2026-11-25').name).toBe('home');
    expect(normalizeRoute(arch('2026-11-24'), '2026-11-25').name).toBe('dive');
    expect(normalizeRoute(arch('2026-11-25'), '2026-11-25').name).toBe('home');
    expect(normalizeRoute(arch('2026-11-26'), '2026-11-25').name).toBe('home');
  });
});

describe('unlimited routes', () => {
  const seed = 'u1abc2def00';
  it('round-trip, and only as archive-style plays', () => {
    const r: Route = { name: 'dive', mode: 'Ranked', date: seed, archive: true };
    expect(parseRoute(toHash(r))).toEqual(r);
    expect(normalizeRoute(r, '2026-11-25')).toEqual(r);
    expect(normalizeRoute({ ...r, archive: false }, '2026-11-25').name).toBe('home');
    expect(parseRoute(`#/dive/Air/${seed}`)).toEqual({ name: 'dive', mode: 'Air', date: seed, archive: false });
  });
});
