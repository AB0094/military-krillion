import { describe, expect, it } from 'vitest';
import { SPAN, START_Y, WORLD_H, camFor, missileY, worldHtml } from './scene';
import { sprite } from './sprites';

describe('scene geometry', () => {
  it('maps shaft position to world y, clamped', () => {
    expect(missileY(0)).toBe(START_Y);
    expect(missileY(1)).toBe(START_Y + SPAN);
    expect(missileY(-5)).toBe(START_Y);
    expect(missileY(9)).toBe(START_Y + SPAN);
  });
  it('keeps the camera inside the world and the missile ~40% down the screen', () => {
    expect(camFor(0, 800)).toBe(0);
    expect(camFor(START_Y + 1000, 800)).toBe(START_Y + 1000 - 320);
    expect(camFor(START_Y + 1000, 800, 0.62)).toBe(START_Y + 1000 - 496);
    expect(camFor(1e9, 800)).toBe(WORLD_H - 800);
  });
  it('builds a deterministic world with a marker per airfield', () => {
    const a = worldHtml('2026-11-25');
    expect(a).toBe(worldHtml('2026-11-25'));
    expect(a).not.toBe(worldHtml('2026-11-26'));
    expect((a.match(/data-i="/g) ?? []).length).toBe(6);
  });
});

describe('sprite', () => {
  it('merges runs, skips empty pixels and pads short rows', () => {
    const svg = sprite(['aab', 'a'], { a: '#111', b: '#222' });
    expect(svg).toContain('viewBox="0 0 3 2"');
    expect((svg.match(/<rect/g) ?? []).length).toBe(3); // "aa", "b", "a"
    expect(svg).toContain('width="2"');
  });
});
