import { TIERS } from '../logic/scoring';
import { hashString, mulberry32 } from '../logic/seed';
import { esc } from './dom';
import { carrierSprite, cloudSprite, fishSprite, jetSprite, missileSprite } from './sprites';

export type Theme = 'sea' | 'sky';

/** World geometry (CSS px). The world is tall; the camera slides down it as the missile dives. */
export const SURFACE_Y = 250;
export const START_Y = SURFACE_Y + 110;
export const SPAN = 2800;
export const WORLD_H = START_Y + SPAN + 700;

/** Missile y for a shaft position 0..1. */
export const missileY = (pos: number): number => START_Y + Math.min(1, Math.max(0, pos)) * SPAN;

/** Camera offset that keeps the missile `ratio` of the way down the viewport (default 40%), clamped to the world. */
export function camFor(y: number, viewportH: number, ratio = 0.4): number {
  return Math.max(0, Math.min(WORLD_H - viewportH, y - viewportH * ratio));
}

/** Everything inside the scrolling world: sky, clouds, carrier, sea life, depth gauge, jet and missile. */
export function worldHtml(seedKey: string, theme: Theme = 'sea'): string {
  const rng = mulberry32(hashString(`scene|${seedKey}`));
  if (theme === 'sky') return skyHtml(rng);
  const clouds = Array.from({ length: 5 }, (_, i) => `<span class="w-cloud" style="left:${Math.round(rng() * 90)}%;top:${30 + Math.round(rng() * 130)}px;--d:${60 + Math.round(rng() * 60)}s;--s:${i % 2 ? 1 : 0.7}">${cloudSprite()}</span>`).join('');

  const fish = Array.from({ length: 34 }, () => {
    const y = SURFACE_Y + 140 + rng() * (SPAN + 300);
    const depthFade = Math.max(0.25, 1 - (y - SURFACE_Y) / (SPAN + 600));
    const left = rng() < 0.5;
    const dur = 40 + Math.round(rng() * 60);
    const color = `rgba(4, 18, 38, ${(0.55 + depthFade * 0.4).toFixed(2)})`;
    return `<span class="w-fish${left ? ' flip' : ''}" style="top:${Math.round(y)}px;left:0;--dur:${dur}s;--delay:-${Math.round(rng() * dur)}s">${fishSprite(Math.floor(rng() * 3), color)}</span>`;
  }).join('');

  const gauge = TIERS.map((t, i) => `<li data-i="${i}" style="top:${Math.round(START_Y + t.min * SPAN)}px">
      <span class="gl"><b>${esc(t.name)}</b><small>${esc(t.airfield)}</small></span><span class="gf">${t.flag}</span><i class="gt"></i></li>`).join('');

  const sea = `linear-gradient(180deg, #dce9f0 0, #b8d2e0 ${SURFACE_Y}px, #2b7db8 ${SURFACE_Y}px, #1d62a0 ${SURFACE_Y + 500}px, #123f72 ${SURFACE_Y + 1300}px, #0a2750 ${SURFACE_Y + 2200}px, #051530 ${SURFACE_Y + 3000}px, #020b1c 100%)`;

  return `<div class="w-bg" style="background:${sea}"></div>
    <div class="w-rays" style="top:${SURFACE_Y}px"></div>
    ${clouds}
    <div class="w-ship" style="top:calc(${SURFACE_Y}px - 14 * var(--px))">${carrierSprite()}</div>
    <div class="w-surface" style="top:${SURFACE_Y - 4}px"></div>
    ${fish}
    <ul class="gauge">${gauge}</ul>
    <div class="dv-jet">${jetSprite()}</div>
    <div class="dv-mk"><span class="mk-body">${missileSprite()}</span><i class="blast"></i></div>`;
}

/** Endless scene: a descent through open sky that darkens toward the stratosphere, with drifting cloud banks and far-off aircraft. */
function skyHtml(rng: () => number): string {
  const clouds = Array.from({ length: 18 }, () => {
    const y = 40 + rng() * (WORLD_H * 0.82);
    const fade = Math.max(0.3, 1 - y / WORLD_H);
    return `<span class="w-cloud" style="left:${Math.round(rng() * 95)}%;top:${Math.round(y)}px;--d:${50 + Math.round(rng() * 70)}s;--s:${(0.7 + rng() * 1.1).toFixed(2)};opacity:${fade.toFixed(2)}">${cloudSprite()}</span>`;
  }).join('');
  const planes = Array.from({ length: 9 }, () => {
    const y = 160 + rng() * (SPAN + 300);
    const dur = 50 + Math.round(rng() * 60);
    return `<span class="w-fish w-plane${rng() < 0.5 ? ' flip' : ''}" style="top:${Math.round(y)}px;--dur:${dur}s;--delay:-${Math.round(rng() * dur)}s">${jetSprite()}</span>`;
  }).join('');
  const gauge = TIERS.map((t, i) => `<li data-i="${i}" style="top:${Math.round(START_Y + t.min * SPAN)}px">
      <span class="gl"><b>${esc(t.name)}</b><small>${esc(t.airfield)}</small></span><span class="gf">${t.flag}</span><i class="gt"></i></li>`).join('');
  const sky = `linear-gradient(180deg, #7cc3f2 0, #5aa6e4 ${SURFACE_Y}px, #3f82cc ${SURFACE_Y + 700}px, #2d5aac ${SURFACE_Y + 1500}px, #26206f ${SURFACE_Y + 2300}px, #130f40 ${SURFACE_Y + 3000}px, #06051c 100%)`;
  return `<div class="w-bg" style="background:${sky}"></div>${clouds}${planes}
    <ul class="gauge sky-gauge">${gauge}</ul>
    <div class="dv-jet">${jetSprite()}</div>
    <div class="dv-mk"><span class="mk-body">${missileSprite()}</span><i class="blast"></i></div>`;
}
