import { describe, expect, it } from 'vitest';
import { ENV_IDS, envFromSeed, isEnvId } from './environments';
import { milestone, milestonesCrossed, nextMilestone } from './milestones';

describe('milestones', () => {
  it('the first seven are the named set pieces at 1,000 to 7,000 m', () => {
    const first = Array.from({ length: 7 }, (_, i) => milestone(i + 1));
    expect(first.map((m) => [m.meters, m.name, m.kind])).toEqual([
      [1000, 'Iron Sentinel', 'vehicle'], [2000, 'Ghost Watch', 'sam'], [3000, 'Silent Signal', 'radar'], [4000, 'Dust Frontier', 'dust'],
      [5000, 'Ocean Phantom', 'coast'], [6000, 'Stormbreaker', 'storm'], [7000, 'Beyond the Horizon', 'horizon'],
    ]);
    expect(first.every((m) => m.variant === 0)).toBe(true);
  });
  it('keep going past 7,000 m with new names and bigger variants', () => {
    expect(milestone(8)).toMatchObject({ meters: 8000, name: 'Iron Gauntlet', kind: 'vehicle', variant: 1 });
    expect(milestone(14).name).toBe('Beyond Again');
    expect(milestone(15)).toMatchObject({ meters: 15000, kind: 'vehicle', variant: 2 });
    const names = Array.from({ length: 40 }, (_, i) => milestone(i + 1).name);
    expect(new Set(names).size).toBe(40); // every milestone is distinct, however far you fly
  });
  it('reports every milestone passed, including several at once, and none twice', () => {
    expect(milestonesCrossed(0, 999)).toEqual([]);
    expect(milestonesCrossed(900, 1000)).toEqual([1]);
    expect(milestonesCrossed(400, 2300)).toEqual([1, 2]);
    expect(milestonesCrossed(2300, 2900)).toEqual([]);
    expect(milestonesCrossed(6500, 8100)).toEqual([7, 8]);
    expect(milestonesCrossed(5000, 4000)).toEqual([]);
  });
  it('knows the next one ahead', () => {
    expect(nextMilestone(0).name).toBe('Iron Sentinel');
    expect(nextMilestone(1000).name).toBe('Ghost Watch');
    expect(nextMilestone(7400).meters).toBe(8000);
  });
});

describe('environments', () => {
  it('are the six biomes', () => {
    expect([...ENV_IDS]).toEqual(['forest', 'ocean', 'plains', 'beach', 'normandy', 'training']);
    expect(isEnvId('beach')).toBe(true);
    expect(isEnvId('moon')).toBe(false);
  });
  it('are chosen deterministically from a seed and cover all six over many runs', () => {
    expect(envFromSeed('u123')).toBe(envFromSeed('u123'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => envFromSeed(`u${i}abc`)));
    expect(seen.size).toBe(6);
  });
  it('never repeat the previous run when asked to avoid it', () => {
    for (let i = 0; i < 100; i++) {
      const first = envFromSeed(`u${i}`);
      expect(envFromSeed(`u${i}`, first)).not.toBe(first);
    }
  });
});
