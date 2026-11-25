import { TIERS } from '../logic/scoring';
import { esc } from './dom';
import { missileSvg } from './logo';

/**
 * The vertical descent shaft: one airfield marker per tier, with the missile at `atPct` (0..1).
 * Tiers up to `reachedIdx` are lit.
 */
export function shaftHtml(atPct: number, reachedIdx: number): string {
  const marks = TIERS.map((t, i) => `<li data-i="${i}" class="${i <= reachedIdx ? 'reached' : ''}" style="top:${t.min * 100}%">
      <span class="sflag">${t.flag}</span><span class="sname">${esc(t.name)}</span></li>`).join('');
  return `<div class="shaft" aria-hidden="true"><div class="shaft-inner">
    <div class="shaft-line"></div><ul>${marks}</ul>
    <span class="shaft-mk" style="top:${atPct * 100}%">${missileSvg('missile')}<i class="blast"></i></span>
  </div></div>`;
}
