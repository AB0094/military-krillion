import { TIERS, formatMeters, tierMeters } from '../logic/scoring';
import { esc } from './dom';
import { missileSvg } from './logo';

/**
 * The depth ladder: one airfield per tier.
 * `unlocked` = highest tier index reached (-1 for none); tiers above it are masked.
 * `marker` = tier index to draw the missile beside (or -1).
 */
export function ladderHtml(unlocked: number, marker: number, rounds = 7): string {
  const rows = TIERS.map((t, i) => {
    const open = i <= unlocked;
    return `<li style="--i:${i}" class="${open ? 'open' : 'locked'}${i === marker ? ' here' : ''}">
      <span class="pin">${i === marker ? missileSvg('missile pin-missile') : ''}</span>
      <span class="flag">${open ? t.flag : '❔'}</span>
      <div><div class="tname">${open ? esc(t.name) : 'Classified'}</div>
      <div class="tfield">${open ? `${esc(t.airfield)}, ${esc(t.country)}` : 'Dive deeper to unlock'}</div></div>
      <span class="tmin">${formatMeters(tierMeters(i, rounds))}</span>
    </li>`;
  });
  return `<ol class="ladder">${rows.join('')}</ol>`;
}
