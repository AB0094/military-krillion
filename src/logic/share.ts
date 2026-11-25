import type { AnswerRecord, EndlessRun, Mode } from './types';
import { depthMeters, depthPoints, formatMeters, rarityRank, tierFor } from './scoring';

const SQUARES = ['⬜', '🟩', '🟦', '🟪', '🟨'];

export function scoreSquare(a: AnswerRecord): string {
  return a.matched === null ? '⬛' : SQUARES[rarityRank(a.score)];
}

export function buildShareText(opts: { date: string; mode: Mode; archive: boolean; depth: number; answers: readonly AnswerRecord[]; label?: string }): string {
  const { date, mode, archive, depth, answers, label } = opts;
  const tier = tierFor(depth, answers.length);
  return [
    `Military Krillion ${label ?? `${date} · ${mode}${archive ? ' (archive)' : ''}`}`,
    `Depth ${formatMeters(depthMeters(depth))} · ${depthPoints(depth)} pts — ${tier.name} · ${tier.airfield} ${tier.flag}`,
    answers.map(scoreSquare).join(''),
  ].join('\n');
}

export function buildEndlessShare(run: EndlessRun): string {
  const answers = run.answers;
  const correct = answers.filter((a) => a.matched !== null).length;
  const tier = tierFor(run.depth, 14);
  const label = run.mode === 'Ranked' ? 'Mixed' : run.mode;
  return [
    `Military Krillion · Endless · ${label}`,
    `Depth ${formatMeters(depthMeters(run.depth))} · ${depthPoints(run.depth)} pts · ${correct}/${answers.length} answered · best streak ${run.bestStreak}`,
    `${tier.name} · ${tier.airfield} ${tier.flag}${run.over ? ' · intercepted' : ''}`,
    answers.slice(-24).map(scoreSquare).join(''),
  ].join('\n');
}
