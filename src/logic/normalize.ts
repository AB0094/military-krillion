import type { Answer } from './types';

/** Lowercase, strip accents, and drop everything except letters/digits: "Mi-28N" and "mi28n" both become "mi28n". */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Damerau-Levenshtein (optimal string alignment) distance: insert, delete, substitute, swap neighbours. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Typos allowed for a normalized form of this length. Short forms (t72, f16, a10) must be exact. */
export function maxTypos(length: number): number {
  if (length < 5) return 0;
  return length < 8 ? 1 : 2;
}

export interface Match {
  answer: Answer;
  /** True when the input only matched after spelling correction. */
  corrected: boolean;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * Finds the valid answer for the input: exact (name or alias, ignoring case and punctuation) first,
 * then a spelling-tolerant pass. The tolerant pass never changes digits (so f15 never becomes f16),
 * requires the same first letter, and refuses when two different answers are equally close.
 */
export function findMatch(input: string, answers: readonly Answer[]): Match | null {
  const key = normalize(input);
  if (!key) return null;
  const forms = answers.flatMap((a) => [a.name, ...a.aliases].map((f) => ({ answer: a, form: normalize(f) })));

  const exact = forms.find((f) => f.form === key);
  if (exact) return { answer: exact.answer, corrected: false };

  let best: { answer: Answer; dist: number } | null = null;
  let tie = false;
  for (const { answer, form } of forms) {
    if (!form || form[0] !== key[0] || digitsOf(form) !== digitsOf(key) || Math.abs(form.length - key.length) > 2) continue;
    const dist = editDistance(key, form);
    if (dist > maxTypos(Math.min(form.length, key.length))) continue;
    if (!best || dist < best.dist) { best = { answer, dist }; tie = false; }
    else if (dist === best.dist && best.answer !== answer) tie = true;
  }
  return best && !tie ? { answer: best.answer, corrected: true } : null;
}

/** Returns the valid answer matching the input (by name or alias, typos tolerated), or null. */
export function matchAnswer(input: string, answers: readonly Answer[]): Answer | null {
  return findMatch(input, answers)?.answer ?? null;
}

/** Short hint for a wrong answer; reveals only the count and the first letter of the most common answer. */
export function hintFor(answers: readonly Answer[]): string {
  const n = answers.length;
  if (n === 0) return 'No valid answers exist for this prompt.';
  const easiest = [...answers].sort((a, b) => a.weight - b.weight)[0];
  const letter = easiest.name.charAt(0).toUpperCase();
  return `No match. ${n} valid answer${n === 1 ? '' : 's'} exist; the most common starts with "${letter}". Try the exact designation.`;
}

/** Hint shown when the question timer ran out. */
export function timeoutHint(answers: readonly Answer[]): string {
  const n = answers.length;
  return `Out of time. ${n} valid answer${n === 1 ? '' : 's'} existed; answer faster next time.`;
}
