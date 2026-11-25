import { describe, expect, it } from 'vitest';
import { MIN_CROWD, rarity, rarityLabel, TIERS, tierFor, tierIndex, totalDepth } from './scoring';
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

describe('rarityLabel', () => {
  it('uses the share-square cut-offs', () => {
    expect([0.1, 0.3, 0.55, 0.9].map(rarityLabel)).toEqual(['Common', 'Uncommon', 'Rare', 'Ultra rare']);
    expect(rarityLabel(0.8)).toBe('Ultra rare');
    expect(rarityLabel(0.25)).toBe('Uncommon');
  });
});
