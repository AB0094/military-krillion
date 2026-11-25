import { describe, expect, it } from 'vitest';
import { PLAYER_TANK, TANK_MODELS, dartSprite, harmSprite, jetSprite, playerTank, tankModel, tankSprite } from './sprites';

const dims = (svg: string) => {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
  return { w: +m[1], h: +m[2] };
};

describe('craft sprites', () => {
  it('draws the HARM, the APFSDS round and the carrier as non-empty pixel art', () => {
    for (const svg of [harmSprite(), dartSprite(), jetSprite()]) {
      expect(svg).toContain('<svg');
      expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(40);
    }
  });

  it('the HARM is a short, fat missile and the dart is a long thin rod', () => {
    const harm = dims(harmSprite());
    const dart = dims(dartSprite());
    expect(harm.w).toBeGreaterThan(harm.h * 2.5);
    expect(dart.w / dart.h).toBeGreaterThan(harm.w / harm.h);
  });

  it('the dart has no flame colours in its palette (it has no motor)', () => {
    expect(dartSprite()).not.toMatch(/#ff7a2a|#ff8a2a/i);
  });
});

describe('tank models', () => {
  it('has a different model for each of the seven first-lap distances', () => {
    const lap = [1, 2, 3, 4, 5, 6, 7].map((k) => tankModel(k).name);
    expect(new Set(lap).size).toBe(7);
  });

  it('keeps going past the end of the list and wraps around', () => {
    expect(tankModel(TANK_MODELS.length + 1).name).toBe(tankModel(1).name);
    expect(tankModel(0).name).toBe(tankModel(1).name);
  });

  it('every model draws a distinct silhouette', () => {
    const shapes = TANK_MODELS.map((m) => tankSprite(m));
    expect(new Set(shapes).size).toBe(TANK_MODELS.length);
  });

  it('has unique names and plausible gun lengths', () => {
    expect(new Set(TANK_MODELS.map((m) => m.name)).size).toBe(TANK_MODELS.length);
    for (const m of TANK_MODELS) expect(m.gun).toBeGreaterThan(15);
  });

  it("the player's tank is gunless and exposes a pivot inside its sprite", () => {
    const t = playerTank();
    expect(PLAYER_TANK.gun).toBe(0);
    expect(t.pivot.x).toBeGreaterThan(0);
    expect(t.pivot.x).toBeLessThan(t.cells.w);
    expect(t.pivot.y).toBeGreaterThan(0);
    expect(t.pivot.y).toBeLessThan(t.cells.h);
  });
});
