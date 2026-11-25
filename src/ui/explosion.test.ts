import { describe, expect, it } from 'vitest';
import { explosionFrames } from './explosion';

const filled = (rows: string[]) => rows.join('').replace(/\./g, '').length;

describe('explosion frames', () => {
  const frames = explosionFrames(12, 27, 7);
  it('are square, the requested count, and deterministic', () => {
    expect(frames).toHaveLength(12);
    for (const f of frames) { expect(f).toHaveLength(27); expect(f.every((r) => r.length === 27)).toBe(true); }
    expect(explosionFrames(12, 27, 7)).toEqual(frames);
    expect(explosionFrames(12, 27, 8)).not.toEqual(frames);
  });
  it('bloom from a small white-hot core outward', () => {
    expect(filled(frames[0])).toBeLessThan(filled(frames[4]));
    expect(frames.slice(1, 5).some((f) => f.join('').includes('w'))).toBe(true); // white-hot core early on
  });
  it('hollow out and darken into smoke at the end', () => {
    const last = frames[11].join('');
    expect(last).not.toContain('w');
    expect(last).toContain('s');
    expect(frames[11][13][13]).toBe('.'); // the middle has burned out into a ring
  });
});
