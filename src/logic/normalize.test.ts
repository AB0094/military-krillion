import { describe, expect, it } from 'vitest';
import { hintFor, matchAnswer, normalize } from './normalize';
import type { Answer } from './types';

const answers: Answer[] = [
  { name: 'Mi-28N', aliases: ['Mi28N', 'Havoc'], weight: 0.9 },
  { name: 'Su-25', aliases: ['Frogfoot'], weight: 0.1 },
  { name: 'T-14 Armata', aliases: ['T14'], weight: 0.9 },
];

describe('normalize', () => {
  it('ignores case, punctuation and spaces', () => {
    expect(normalize('Mi-28N')).toBe('mi28n');
    expect(normalize('  mi 28 n! ')).toBe('mi28n');
    expect(normalize('Café')).toBe('cafe');
  });
});

describe('matchAnswer', () => {
  it('matches names case-insensitively, ignoring punctuation', () => {
    expect(matchAnswer('su25', answers)?.name).toBe('Su-25');
    expect(matchAnswer('SU-25', answers)?.name).toBe('Su-25');
  });
  it('matches the Mi-28N / Mi28N alias pair', () => {
    expect(matchAnswer('Mi28N', answers)?.name).toBe('Mi-28N');
    expect(matchAnswer('mi-28n', answers)?.name).toBe('Mi-28N');
  });
  it('matches common aliases', () => {
    expect(matchAnswer('Havoc', answers)?.name).toBe('Mi-28N');
    expect(matchAnswer('t-14', answers)?.name).toBe('T-14 Armata');
  });
  it('returns null for wrong or empty input', () => {
    expect(matchAnswer('F-35', answers)).toBeNull();
    expect(matchAnswer('   ', answers)).toBeNull();
    expect(matchAnswer('---', answers)).toBeNull();
  });
});

describe('hintFor', () => {
  it('is short and mentions the answer count', () => {
    expect(hintFor(answers)).toContain('3 valid answers');
    expect(hintFor(answers)).toContain('"S"'); // Su-25 is the most common
  });
});

import { editDistance, findMatch, maxTypos } from './normalize';

describe('spelling tolerance', () => {
  const tanks: Answer[] = [
    { name: 'Abrams', aliases: ['M1A2'], weight: 0.1 },
    { name: 'Leopard 2', aliases: [], weight: 0.3 },
    { name: 'Leclerc', aliases: [], weight: 0.55 },
    { name: 'Su-25', aliases: ['Frogfoot'], weight: 0.1 },
    { name: 'Su-27', aliases: [], weight: 0.1 },
    { name: 'T-72', aliases: [], weight: 0.3 },
    { name: 'Bradley', aliases: [], weight: 0.3 },
  ];
  it('computes edit distance with swaps', () => {
    expect(editDistance('abrams', 'abrmas')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
  it('scales allowed typos with length', () => {
    expect([3, 4, 5, 7, 8, 12].map(maxTypos)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('accepts misspellings and flags them as corrected', () => {
    for (const typo of ['Abramz', 'Abrmas', 'Bradly', 'Brdley', 'Frogfot', 'leopad 2']) {
      expect(findMatch(typo, tanks)?.corrected, typo).toBe(true);
    }
    expect(findMatch('Bradly', tanks)?.answer.name).toBe('Bradley');
    expect(findMatch('Abrams', tanks)?.corrected).toBe(false);
  });
  it('never changes digits', () => {
    expect(findMatch('su-26', tanks)).toBeNull();
    expect(findMatch('t-73', tanks)).toBeNull();
    expect(findMatch('leopard 3', tanks)).toBeNull();
  });
  it('keeps short designations exact and refuses wild guesses', () => {
    expect(findMatch('t-7', tanks)).toBeNull();
    expect(findMatch('banana', tanks)).toBeNull();
    expect(findMatch('Abraham Lincoln', tanks)).toBeNull();
  });
  it('refuses when two different answers are equally close', () => {
    const pair: Answer[] = [{ name: 'Marder', aliases: [], weight: 0.3 }, { name: 'Marker', aliases: [], weight: 0.3 }];
    expect(findMatch('Marcer', pair)).toBeNull();
  });
});
