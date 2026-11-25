import { RARITIES } from '../logic/scoring';
import { reducedMotion } from './fx';
import { playRank } from './sound';

/** Colour scheme for each rarity rank (Recruit .. Transcendent). Mirrored by the .rar-N classes in the stylesheet. */
export const RARITY_COLORS = ['#9fb3cc', '#4fe39a', '#4f9bff', '#b06bff', '#ff8a2a', '#ff3d8b', '#ffe066'] as const;

export interface RarityHooks {
  shake(ms: number, big: boolean): void;
  flash(): void;
  burstAt(x: number, y: number, n: number, color: string): void;
  slowmo(ms: number): void;
  /** Where the jet is on screen (CSS px, relative to the scene). */
  target(): { x: number; y: number };
}

/**
 * The rarity reveal. Every rank gets its own colours and its own effect, and the presentation escalates:
 * a quiet stamp (Recruit), a radar ping (Recon), a chevron wipe (Vanguard), lightning (Apex),
 * flames and a shockwave (Warbringer), holographic rings and fireworks (Mythic), and a full gold-flash
 * slow-motion finale (Transcendent).
 */
export function showRarity(dv: HTMLElement, rank: number, hooks: RarityHooks): void {
  const info = RARITIES[Math.min(rank, 6)];
  playRank(rank);
  const el = document.createElement('div');
  el.className = `rar rar-${rank}`;
  el.innerHTML = `<span class="rar-tier">${info.tier}</span><b class="rar-name">${info.name}</b><span class="rar-sub">rank ${rank + 1} of 7</span>`;
  dv.appendChild(el);
  setTimeout(() => el.remove(), 2600 + rank * 220);
  if (reducedMotion()) return;

  const add = (cls: string, n = 1, ms = 1800) => {
    for (let i = 0; i < n; i++) {
      const f = document.createElement('i');
      f.className = `rfx ${cls}`;
      f.style.setProperty('--i', String(i));
      f.style.setProperty('--r', String(Math.random()));
      f.style.setProperty('--rc', RARITY_COLORS[Math.min(rank, 6)]);
      dv.appendChild(f);
      setTimeout(() => f.remove(), ms + i * 140);
    }
  };
  const { x, y } = hooks.target();
  const c = RARITY_COLORS[rank];
  const wide = dv.clientWidth >= 1100; // on wide screens the reveal sits to the right of the question so the answer stays readable
  const mid = { x: dv.clientWidth * (wide ? 0.8 : 0.5), y: dv.clientHeight * (wide ? 0.34 : 0.27) };
  dv.style.setProperty('--rx', wide ? '80%' : '50%');
  dv.style.setProperty('--ry', wide ? '34%' : '27%');

  if (rank === 1) add('ring', 2);
  if (rank === 2) { add('chev', 6, 1300); add('shine'); }
  if (rank === 3) { add('bolt', 4, 900); add('glow'); hooks.burstAt(mid.x, mid.y, 18, c); hooks.shake(260, false); }
  if (rank === 4) { add('ring', 3); hooks.burstAt(mid.x, mid.y, 36, '#ff8a2a'); hooks.burstAt(mid.x, mid.y, 24, '#ffd84a'); hooks.flash(); hooks.shake(520, false); }
  if (rank === 5) { add('holo', 3, 2200); add('ring', 3); hooks.burstAt(mid.x, mid.y, 44, c); hooks.burstAt(x, y, 30, '#4fe3ff'); hooks.shake(700, false); hooks.flash(); }
  if (rank >= 6) {
    add('goldflash', 1, 1500); add('rays', 1, 2800); add('stars', 26, 2600); add('ring', 4, 2200);
    hooks.burstAt(mid.x, mid.y, 70, '#ffe066'); hooks.burstAt(mid.x, mid.y, 50, '#ffffff'); hooks.burstAt(x, y, 40, '#ff3d8b');
    hooks.shake(1100, true); hooks.slowmo(1300);
  }
}
