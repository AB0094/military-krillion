import { describe, expect, it } from 'vitest';
import { PROMPTS } from './data';
import { validatePrompts } from './logic/validate';
import { findMatch } from './logic/normalize';

describe('data/prompts.json', () => {
  it('passes the validator', () => {
    expect(validatePrompts(PROMPTS)).toEqual([]);
  });

  it('has plenty of prompts in both sets', () => {
    expect(PROMPTS.filter((p) => p.mode === 'Ground').length).toBeGreaterThanOrEqual(80);
    expect(PROMPTS.filter((p) => p.mode === 'Air').length).toBeGreaterThanOrEqual(80);
  });

  it('every prompt has several answers, and every weight is one of the seven rank values', () => {
    const allowed = new Set([0.1, 0.3, 0.55, 0.7, 0.85, 0.9, 1]);
    for (const p of PROMPTS) {
      expect(p.answers.length, p.id).toBeGreaterThanOrEqual(4);
      for (const a of p.answers) expect(allowed.has(a.weight), `${p.id}/${a.name}`).toBe(true);
    }
  });

  it('each prompt offers a common answer and a rare one, so ranks have room to spread', () => {
    for (const p of PROMPTS) {
      const ws = p.answers.map((a) => a.weight);
      expect(Math.min(...ws), p.id).toBeLessThanOrEqual(0.3);
      expect(Math.max(...ws), p.id).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('every answer name matches itself', () => {
    for (const p of PROMPTS.slice(-65)) {
      for (const a of p.answers) expect(findMatch(a.name, p.answers)?.answer.name, `${p.id}/${a.name}`).toBe(a.name);
    }
  });
});
