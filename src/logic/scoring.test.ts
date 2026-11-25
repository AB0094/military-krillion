import { describe, expect, it } from 'vitest';
import { MIN_CROWD, RARITY_NAMES, crossedTier, depthMeters, depthPoints, formatMeters, maxMeters, rarity, rarityLabel, rarityRank, rarityTier, shaftPosition, tierMeters, TIERS, tierFor, tierIndex, totalDepth } from './scoring';
import type { Answer } from './types';

const a: Answer = { name: 'Su-25', aliases: [], weight: 0.1 };

describe('rarity', () => {
  it('falls back to the weight with no player data', () => {
    expect(rarity(a)).toBe(0.1);
    expect(rarity(a, { total: 0, counts: {} })).toBe(0.1);
  });
  it('is 1 - given/total with player data', () => {
    expect(rarity(a, { total: 10, counts: { 'Su-25': 7 } })).toBeCloseTo(0.3);
    expect(rarity(a, { total: 10, counts: {} })).toBe(1);
    expect(rarity(a, { total: 4, counts: { 'Su-25': 4 } })).toBe(0);
  });
  it('uses the weight while below the minimum crowd size', () => {
    expect(rarity(a, { total: 3, counts: { 'Su-25': 3 } }, MIN_CROWD)).toBe(0.1);
    expect(rarity(a, { total: 10, counts: { 'Su-25': 5 } }, MIN_CROWD)).toBeCloseTo(0.5);
  });
});

describe('totalDepth', () => {
  it('sums scores and treats wrong answers (0) as nothing', () => {
    expect(totalDepth([0.1, 0.3, 0, 0.9])).toBeCloseTo(1.3);
    expect(totalDepth([])).toBe(0);
  });
});

describe('tierFor', () => {
  it('maps average rarity to airfield tiers', () => {
    const name = (avg: number) => tierFor(7 * avg).name;
    expect(name(0)).toBe('Chocks Away');
    expect(name(0.1)).toBe('Chocks Away');
    expect(name(0.25)).toBe('Hot Pit');
    expect(name(0.4)).toBe('Bingo Fuel');
    expect(name(0.55)).toBe('Winchester');
    expect(name(0.7)).toBe('Emcon Alpha');
    expect(name(0.8)).toBe('Magnum');
    expect(tierFor(7).name).toBe('Magnum');
  });
  it('every tier has an airfield and a different country, in ascending order', () => {
    expect(new Set(TIERS.map((t) => t.country)).size).toBe(TIERS.length);
    expect(TIERS.every((t) => t.airfield && t.flag && t.blurb)).toBe(true);
    expect(TIERS.map((t) => t.min)).toEqual([...TIERS.map((t) => t.min)].sort((a, b) => a - b));
    expect(tierIndex(7)).toBe(TIERS.length - 1);
  });
});

describe('rarity ranks', () => {
  it('run Recruit to Transcendent, rarer = higher', () => {
    expect(RARITY_NAMES).toEqual(['Recruit', 'Recon', 'Vanguard', 'Apex', 'Warbringer', 'Mythic', 'Transcendent']);
    expect([0.1, 0.3, 0.55, 0.7, 0.85, 0.9, 1].map(rarityLabel)).toEqual(['Recruit', 'Recon', 'Vanguard', 'Apex', 'Warbringer', 'Mythic', 'Transcendent']);
  });
  it('pair each rank with its familiar tier word', () => {
    expect([0.1, 0.3, 0.55, 0.7, 0.85, 0.9, 1].map(rarityTier)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical', 'Highest']);
  });
  it('switch exactly at 20/40/60/80/90 points, with Transcendent reserved for a perfect 100', () => {
    expect([0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 0.89, 0.9, 0.99, 1].map(rarityRank)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  });
});

describe('Krillion scoring: 100 points a round, 10 metres a point', () => {
  it('a perfect 7-round dive is 700 points and 7,000m', () => {
    expect(maxMeters(7)).toBe(7000);
    expect(depthPoints(7)).toBe(700);
    expect(depthMeters(7)).toBe(7000);
  });
  it('converts a depth of summed rarity to points and metres exactly', () => {
    expect(depthPoints(5.4)).toBe(540);
    expect(depthMeters(5.4)).toBe(5400);
    expect(depthMeters(0.9)).toBe(900);
    expect(depthMeters(0)).toBe(0);
  });
  it('formats metres with thousands separators', () => {
    expect([0, 900, 1400, 5400, 7000, 14000].map(formatMeters)).toEqual(['0m', '900m', '1,400m', '5,400m', '7,000m', '14,000m']);
  });
  it('puts each airfield at its tier threshold in metres', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => tierMeters(i, 7))).toEqual([0, 1400, 2450, 3500, 4550, 5600]);
    expect(tierMeters(5, 14)).toBe(11200);
  });
  it('rarity from player data is always whole points', () => {
    for (const given of [0, 1, 2, 3, 7, 10]) {
      const r = rarity({ name: 'x', aliases: [], weight: 0.5 }, { total: 11, counts: { x: given } });
      expect(Math.round(r * 100)).toBeCloseTo(r * 100, 9);
    }
    expect(rarity({ name: 'x', aliases: [], weight: 0.5 }, { total: 3, counts: { x: 1 } })).toBe(0.67);
  });
});

describe('descent shaft', () => {
  it('positions the missile by running average rarity, clamped', () => {
    expect(shaftPosition(0)).toBe(0);
    expect(shaftPosition(3.5)).toBeCloseTo(0.5);
    expect(shaftPosition(99)).toBe(1);
    expect(shaftPosition(-1)).toBe(0);
  });
  it('reports a tier only when a deeper airfield is reached', () => {
    expect(crossedTier(0, 0.9)).toBeNull(); // still Chocks Away
    expect(crossedTier(1.0, 1.5)).toBe(1); // crosses 20% of 7 = 1.4 into Hot Pit
    expect(crossedTier(1.5, 2.0)).toBeNull();
    expect(crossedTier(1.0, 5.7)).toBe(5); // can skip several tiers at once
    expect(crossedTier(3, 2)).toBeNull(); // never "goes back"
  });
});
