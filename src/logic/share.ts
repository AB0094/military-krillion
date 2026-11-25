import type { AnswerRecord, Mode } from './types';
import { tierFor } from './scoring';

export function scoreSquare(a: AnswerRecord): string {
  if (a.matched === null) return '⬛';
  if (a.score >= 0.8) return '🟪';
  if (a.score >= 0.5) return '🟦';
  if (a.score >= 0.25) return '🟩';
  return '🟨';
}

export function buildShareText(opts: { date: string; mode: Mode; archive: boolean; depth: number; answers: readonly AnswerRecord[]; label?: string }): string {
  const { date, mode, archive, depth, answers, label } = opts;
  const tier = tierFor(depth, answers.length);
  return [
    `Military Krillion ${label ?? `${date} · ${mode}${archive ? ' (archive)' : ''}`}`,
    `Depth ${depth.toFixed(2)} — ${tier.name} · ${tier.airfield} ${tier.flag}`,
    answers.map(scoreSquare).join(''),
  ].join('\n');
}
