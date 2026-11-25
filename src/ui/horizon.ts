import type { EnvId } from '../logic/environments';
import { hashString, mulberry32 } from '../logic/seed';
import type { Milestone } from '../logic/milestones';
import { EXPLOSION_PAL, explosionFrames } from './explosion';

/**
 * Side-scrolling pixel scenery. Everything is drawn at a low internal resolution (so it stays chunky pixel-art)
 * and scaled up with nearest-neighbour. Layers scroll at different speeds for parallax; the ground, props, set pieces
 * and ground-anchored particles all move at ground speed, which is what sells the forward motion.
 */
type Ctx = CanvasRenderingContext2D;

const TW = 480; // tile width in low-res pixels
const GROUND = 0.76; // ground line as a fraction of the height
export const ZONE_END = 1750; // the military airfield occupies the first part of the world
const RUNWAY0 = -500;
const RUNWAY1 = 1500;
export const CRUISE = 92; // ground speed (low-res px/s) in normal flight

// ---------------------------------------------------------------- tiny helpers
const hex = (h: string): number[] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, t: number): string => {
  const A = hex(a); const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, t)))).join(',')})`;
};
const rect = (c: Ctx, x: number, y: number, w: number, h: number, col: string): void => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
const mk = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return [c, x];
};
/** Smooth 0..1..0 bump: how far into a zone the jet is, with a lead-in and lead-out margin. Exported for tests. */
export function zoneIntensity(jetWx: number, wx0: number, wx1: number, margin = 260): number {
  const t = (jetWx - (wx0 - margin)) / (wx1 - wx0 + margin * 2);
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t) ** 0.7;
}
/** Periodic height function so tiles wrap seamlessly. */
const pnoise = (x: number, ph: number[], amp: number[]): number => amp.reduce((s, a, i) => s + a * Math.sin(((x / TW) * (i + 1) * 2 + ph[i]) * Math.PI), 0);

// ---------------------------------------------------------------- props (ground-level scenery), drawn bottom-anchored at (x, gy)
function pine(c: Ctx, x: number, gy: number, h: number, dark: string, light: string): void {
  const tiers = Math.max(3, Math.round(h / 7));
  const th = (h * 0.86) / tiers;
  rect(c, x - 1, gy - h * 0.16, 2, h * 0.16, '#3a2a1c');
  for (let i = 0; i < tiers; i++) {
    const tw = Math.round(h * 0.26 * (1 - i / (tiers + 0.5)) + 1);
    rect(c, x - tw, gy - h * 0.14 - th * (i + 1), tw * 2 + 1, th + 1, i % 2 ? dark : light);
  }
}
function oak(c: Ctx, x: number, gy: number, h: number, a: string, b: string): void {
  rect(c, x - 1, gy - h * 0.45, 3, h * 0.45, '#4a3220');
  const r = h * 0.3;
  for (let dy = -r; dy <= r; dy += 2) { const w = Math.sqrt(r * r - dy * dy); rect(c, x - w, gy - h * 0.62 + dy, w * 2, 2, dy < 0 ? a : b); }
}
function palm(c: Ctx, x: number, gy: number, h: number): void {
  for (let i = 0; i < h; i += 2) rect(c, x + Math.round(Math.sin(i / 9) * 3) - 1, gy - i, 3, 2, i % 6 < 3 ? '#8a6a3c' : '#6e5230');
  const tx = x + Math.round(Math.sin(h / 9) * 3);
  const ty = gy - h;
  for (const [dx, dy] of [[-9, 3], [-6, -2], [-2, -5], [3, -4], [7, 0], [10, 4], [-11, 7], [12, 8]]) {
    const n = 5;
    for (let k = 1; k <= n; k++) rect(c, tx + (dx * k) / n, ty + (dy * k) / n + (k * k) / 9, 2, 2, k % 2 ? '#2f8f46' : '#3fae5a');
  }
}
function bush(c: Ctx, x: number, gy: number, w: number, a: string, b: string): void { rect(c, x - w / 2, gy - w * 0.35, w, w * 0.35, a); rect(c, x - w * 0.3, gy - w * 0.55, w * 0.6, w * 0.25, b); }
function rock(c: Ctx, x: number, gy: number, w: number, a: string, b: string): void { rect(c, x - w / 2, gy - w * 0.4, w, w * 0.4, a); rect(c, x - w * 0.3, gy - w * 0.6, w * 0.6, w * 0.25, b); }
function tuft(c: Ctx, x: number, gy: number, col: string): void { for (let i = -2; i <= 2; i++) rect(c, x + i * 2, gy - 4 + Math.abs(i), 1, 4 - Math.abs(i), col); }
function log(c: Ctx, x: number, gy: number): void { rect(c, x - 9, gy - 4, 18, 4, '#5a3d24'); rect(c, x - 9, gy - 4, 3, 4, '#c9a06a'); rect(c, x + 6, gy - 4, 3, 4, '#c9a06a'); }
function hedgehog(c: Ctx, x: number, gy: number): void { for (let i = 0; i < 9; i++) { rect(c, x - 5 + i, gy - 3 - i, 2, 2, '#3a3d40'); rect(c, x + 5 - i, gy - 3 - i, 2, 2, '#4a4e52'); } rect(c, x - 6, gy - 5, 13, 2, '#34383b'); }
function crater(c: Ctx, x: number, gy: number, w: number): void { rect(c, x - w / 2, gy - 2, w, 3, '#3a2f24'); rect(c, x - w / 2 + 2, gy - 3, w - 4, 1, '#6a5a44'); rect(c, x - w / 2 - 1, gy - 3, 3, 3, '#7a6a52'); rect(c, x + w / 2 - 2, gy - 3, 3, 3, '#7a6a52'); }
function barbed(c: Ctx, x: number, gy: number): void { for (const dx of [-12, 0, 12]) rect(c, x + dx, gy - 9, 1, 9, '#3a2a1c'); for (let i = -12; i < 13; i += 2) { rect(c, x + i, gy - 8 + (i % 4 ? 1 : 0), 2, 1, '#6a6a6a'); rect(c, x + i, gy - 4 + (i % 4 ? 0 : 1), 2, 1, '#6a6a6a'); } }
function sandbags(c: Ctx, x: number, gy: number, n: number): void { for (let r = 0; r < 2; r++) for (let i = 0; i < n - r; i++) rect(c, x + i * 6 + r * 3, gy - 4 - r * 4, 6, 4, (i + r) % 2 ? '#b09a66' : '#9c8856'); }
function tires(c: Ctx, x: number, gy: number): void { for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) { rect(c, x + i * 7 + r * 3, gy - 5 - r * 5, 7, 5, '#1d1d20'); rect(c, x + i * 7 + r * 3 + 2, gy - 4 - r * 5, 3, 2, '#3a3a40'); } }
function target(c: Ctx, x: number, gy: number): void { rect(c, x - 1, gy - 8, 2, 8, '#5a4028'); rect(c, x - 7, gy - 22, 15, 15, '#e8e2cf'); rect(c, x - 5, gy - 20, 11, 11, '#c6382f'); rect(c, x - 2, gy - 17, 5, 5, '#e8e2cf'); }
function tower(c: Ctx, x: number, gy: number, h: number, flag: boolean): void { rect(c, x - 3, gy - h, 7, h, '#6d6a5a'); rect(c, x - 6, gy - h - 7, 13, 7, '#8a8672'); rect(c, x - 5, gy - h - 5, 11, 3, '#5fb4cc'); rect(c, x - 7, gy - h - 9, 15, 2, '#4a4838'); if (flag) { rect(c, x, gy - h - 16, 1, 7, '#333'); rect(c, x + 1, gy - h - 16, 5, 3, '#c6382f'); } }
function windsock(c: Ctx, x: number, gy: number, t: number): void { rect(c, x, gy - 20, 1, 20, '#ddd'); for (let i = 0; i < 4; i++) rect(c, x + 1 + i * 3, gy - 20 + Math.round(Math.sin(t * 3 + i) * 1) + i, 3, 4 - Math.floor(i / 2), i % 2 ? '#fff' : '#ff6a2a'); }
function hangar(c: Ctx, x: number, gy: number, w: number): void { const h = 26; rect(c, x, gy - h + 6, w, h - 6, '#7d8794'); for (let i = 0; i < 6; i++) rect(c, x + i * 2, gy - h + i, w - i * 4, 2, i % 2 ? '#8e99a6' : '#9aa5b1'); rect(c, x + w * 0.25, gy - 14, w * 0.5, 14, '#3a4350'); rect(c, x + w * 0.25, gy - 14, w * 0.5, 2, '#222a33'); for (let i = 0; i < w; i += 6) rect(c, x + i, gy - h + 7, 1, h - 7, '#6b7480'); }
function fuel(c: Ctx, x: number, gy: number): void { rect(c, x - 9, gy - 12, 18, 12, '#9aa3ab'); rect(c, x - 7, gy - 15, 14, 3, '#b2bac1'); rect(c, x - 9, gy - 8, 18, 1, '#6a737a'); rect(c, x - 2, gy - 18, 4, 3, '#555'); }
function parkedJet(c: Ctx, x: number, gy: number): void { rect(c, x, gy - 7, 26, 4, '#9aa5b1'); rect(c, x + 20, gy - 8, 8, 3, '#7d8794'); rect(c, x + 4, gy - 13, 3, 6, '#7d8794'); rect(c, x + 14, gy - 9, 5, 2, '#5fb4cc'); rect(c, x + 3, gy - 4, 20, 1, '#555'); }
function radarDome(c: Ctx, x: number, gy: number): void { rect(c, x - 2, gy - 12, 4, 12, '#777'); for (let dy = 0; dy < 10; dy += 2) { const w = Math.sqrt(100 - dy * dy * 1.5); rect(c, x - w, gy - 22 + dy, w * 2, 2, dy < 4 ? '#e8ecef' : '#c8ced3'); } }
function drum(c: Ctx, x: number, gy: number): void { rect(c, x - 3, gy - 6, 6, 6, '#3f5a3a'); rect(c, x - 3, gy - 4, 6, 1, '#2a3e27'); }
function buoy(c: Ctx, x: number, gy: number, t: number): void { rect(c, x - 2, gy - 6 + Math.round(Math.sin(t * 2 + x) * 1), 5, 6, '#d6382f'); rect(c, x - 2, gy - 4 + Math.round(Math.sin(t * 2 + x) * 1), 5, 2, '#f2f2f2'); rect(c, x, gy - 10, 1, 4, '#333'); }
function landingCraft(c: Ctx, x: number, gy: number, wreck: boolean): void { rect(c, x - 18, gy - 8, 36, 8, wreck ? '#4a4540' : '#5a6068'); rect(c, x - 18, gy - 10, 36, 2, wreck ? '#3a3632' : '#464b52'); rect(c, x + 16, gy - 12, 3, 12, '#3a3d42'); rect(c, x - 12, gy - 13, 8, 3, wreck ? '#2a2724' : '#6a7078'); if (wreck) { rect(c, x - 4, gy - 16, 2, 8, '#2a2724'); rect(c, x + 5, gy - 14, 2, 6, '#2a2724'); } }
function ship(c: Ctx, x: number, gy: number, s: number): void { rect(c, x - 22 * s, gy - 5 * s, 44 * s, 5 * s, '#3c4650'); rect(c, x - 12 * s, gy - 10 * s, 14 * s, 5 * s, '#4a5560'); rect(c, x - 6 * s, gy - 14 * s, 4 * s, 4 * s, '#566270'); rect(c, x + 8 * s, gy - 8 * s, 8 * s, 3 * s, '#4a5560'); rect(c, x - 6 * s, gy - 18 * s, 1, 4 * s, '#333'); }
function tankWreck(c: Ctx, x: number, gy: number, s: number, rust: boolean): void {
  const r = rust ? '#6e4a2e' : '#59623f';
  rect(c, x - 16 * s, gy - 4 * s, 32 * s, 4 * s, '#2a2a2c');
  for (let i = -14; i <= 12; i += 5) rect(c, x + i * s, gy - 4 * s, 4 * s, 3 * s, '#1c1c1e');
  rect(c, x - 14 * s, gy - 10 * s, 28 * s, 6 * s, r);
  rect(c, x - 14 * s, gy - 10 * s, 28 * s, 1, rust ? '#8a6040' : '#6f7a50');
  rect(c, x - 6 * s, gy - 16 * s, 14 * s, 6 * s, mix(r, '#000000', 0.12));
  rect(c, x + 8 * s, gy - 14 * s, 18 * s, 2 * s, '#3a3a3c');
  rect(c, x - 3 * s, gy - 17 * s, 4 * s, 2 * s, '#2a2a2c');
}
function truckWreck(c: Ctx, x: number, gy: number): void { rect(c, x - 14, gy - 8, 20, 8, '#6a4c30'); rect(c, x + 6, gy - 12, 10, 12, '#5d4128'); rect(c, x + 9, gy - 11, 5, 4, '#5f6f77'); for (const dx of [-9, 0, 11]) { rect(c, x + dx - 2, gy - 4, 5, 5, '#1c1c1e'); } }
function samSite(c: Ctx, x: number, gy: number, t: number): void {
  rect(c, x - 22, gy - 4, 44, 4, '#6b6a55');
  sandbags(c, x - 26, gy, 4); sandbags(c, x + 16, gy, 4);
  rect(c, x - 14, gy - 9, 26, 5, '#4f5a44');
  for (let i = 0; i < 4; i++) for (let k = 0; k < 14; k++) rect(c, x - 12 + i * 6 + k * 0.6, gy - 10 - k * 0.9, 3, 2, k > 11 ? '#c9cdd1' : '#707b6a');
  rect(c, x + 14, gy - 16, 2, 12, '#555'); rect(c, x + 8, gy - 20, 14, 2, '#8a8f94'); rect(c, x + 10 + Math.round(Math.sin(t) * 2), gy - 22, 10, 2, '#a5aaaf');
}
function radarTower(c: Ctx, x: number, gy: number, lit: number, t: number, dead: boolean): void {
  rect(c, x - 6, gy - 5, 12, 5, '#555a5c');
  for (let i = 0; i < 26; i += 2) { rect(c, x - 3 + Math.round(i / 13), gy - 5 - i, 1, 2, '#777'); rect(c, x + 2 - Math.round(i / 13), gy - 5 - i, 1, 2, '#777'); }
  if (dead) { rect(c, x - 4, gy - 8, 8, 3, '#222'); rect(c, x - 1, gy - 14, 2, 6, '#2a2a2a'); return; }
  const sw = Math.sin(t * 2.2);
  rect(c, x - 11 + Math.round(sw * 3), gy - 34, 22, 3, '#c5cacd'); rect(c, x - 9, gy - 36, 18, 2, '#9ea4a8'); rect(c, x - 2, gy - 38, 4, 4, '#777');
  if (lit > 0) { const on = Math.floor(t * 5) % 2 === 0; for (const [dx, dy] of [[-11, 34], [10, 34], [0, 40], [0, 20]]) rect(c, x + dx, gy - dy, 3, 3, on ? '#ff3a3a' : '#7a1d1d'); rect(c, x - 14, gy - 37, 28, 1, `rgba(255,80,80,${0.25 * lit})`); }
}

// ---------------------------------------------------------------- environments
interface EnvDef {
  sky: [string, string, string];
  haze: string;
  cloud: { n: number; col: string; shade: string; alpha: number };
  waterFrac: number; // share of the ground band that is animated water (1 = open ocean)
  water: [string, string];
  props: [string, number][];
  atmos: { leaves?: boolean; spray?: boolean; dust?: boolean; blasts?: boolean; smoke?: boolean; birds?: boolean; colored?: boolean; rays?: boolean; sun?: boolean };
  build(c: { far: Ctx; mid: Ctx; near: Ctx; ground: Ctx; H: number; gy: number; rng: () => number }): void;
}

function ridge(c: Ctx, _H: number, gy: number, col: string, base: number, amp: number, ph: number[], am: number[]): void {
  for (let x = 0; x < TW; x++) { const h = Math.round(base + pnoise(x, ph, am) * amp); rect(c, x, gy - h, 1, h + 2, col); }
}
function treeLine(c: Ctx, gy: number, rng: () => number, dark: string, light: string, hmin: number, hmax: number, gap: number): void {
  for (let x = 0; x < TW; x += gap + Math.floor(rng() * gap)) { const h = hmin + rng() * (hmax - hmin); for (const o of [-TW, 0, TW]) pine(c, x + o, gy, h, dark, light); }
}
function groundTexture(c: Ctx, H: number, gy: number, a: string, b: string, speck: string, rng: () => number, density = 0.05): void {
  rect(c, 0, gy, TW, H - gy, a);
  for (let y = gy; y < H; y++) { const t = (y - gy) / (H - gy); rect(c, 0, y, TW, 1, mix(a, b, t)); }
  for (let i = 0; i < TW * (H - gy) * density; i++) rect(c, Math.floor(rng() * TW), gy + 2 + Math.floor(rng() * (H - gy - 2)), 1 + Math.floor(rng() * 2), 1, speck);
}

const ENVS: Record<EnvId, EnvDef> = {
  forest: {
    sky: ['#79c4e0', '#a9dcea', '#e5f3e2'], haze: '#d7efe0', cloud: { n: 6, col: '#ffffff', shade: '#d4e8ee', alpha: 0.95 },
    waterFrac: 0, water: ['#2a8fd0', '#0f4f8f'],
    props: [['pine', 5], ['oak', 2], ['bush', 3], ['log', 1], ['tuft', 3], ['rock', 1]],
    atmos: { leaves: true, rays: true, smoke: true, blasts: true },
    build({ far, mid, near, ground, H, gy, rng }) {
      ridge(far, H, gy, '#82aaa8', H * 0.09, H * 0.05, [0.3, 1.1, 0.7], [1, 0.5, 0.25]);
      ridge(far, H, gy, '#6b9a94', H * 0.05, H * 0.03, [1.2, 0.2, 0.9], [1, 0.6, 0.3]);
      treeLine(mid, gy, rng, '#2f6a52', '#3f7f63', 10, 20, 7);
      treeLine(near, gy, rng, '#1f4b3a', '#2b5f48', 20, 38, 16);
      groundTexture(ground, H, gy, '#3a7a40', '#27582f', '#4f9650', rng, 0.06);
      rect(ground, 0, gy, TW, 2, '#2a5a30');
    },
  },
  ocean: {
    sky: ['#55b5ef', '#8dd2f6', '#dcf1fb'], haze: '#e4f4fb', cloud: { n: 7, col: '#ffffff', shade: '#cfe6f3', alpha: 0.95 },
    waterFrac: 1, water: ['#2d93d6', '#0e4a8c'],
    props: [['buoy', 3], ['gull', 0]],
    atmos: { spray: true, birds: true, blasts: true, smoke: true, sun: true },
    build({ far, mid, H, gy, rng }) {
      ridge(far, H, gy, '#6f98b3', H * 0.025, H * 0.02, [0.5, 1.4, 0.2], [1, 0.6, 0.3]);
      for (let i = 0; i < 3; i++) { const x = 40 + Math.floor(rng() * (TW - 120)); for (const o of [-TW, 0, TW]) ship(far, x + o, gy, 0.5 + rng() * 0.3); }
      rect(mid, 0, gy - 2, TW, 2, '#9ed0ea');
    },
  },
  plains: {
    sky: ['#68bff4', '#a5dcfa', '#f3f0d6'], haze: '#f3efd0', cloud: { n: 8, col: '#ffffff', shade: '#cfe3ef', alpha: 0.97 },
    waterFrac: 0, water: ['#2a8fd0', '#0f4f8f'],
    props: [['oak', 3], ['tuft', 6], ['bush', 2], ['rock', 2]],
    atmos: { dust: true, smoke: true, blasts: true, birds: true },
    build({ far, mid, near, ground, H, gy, rng }) {
      ridge(far, H, gy, '#8aa5c8', H * 0.13, H * 0.07, [0.1, 0.9, 1.7], [1, 0.45, 0.2]);
      ridge(mid, H, gy, '#a7b25c', H * 0.07, H * 0.04, [0.6, 1.3, 0.4], [1, 0.5, 0.3]);
      ridge(near, H, gy, '#8aa44a', H * 0.035, H * 0.025, [1.5, 0.3, 1.1], [1, 0.6, 0.2]);
      for (let i = 0; i < 6; i++) { const x = Math.floor(rng() * TW); for (const o of [-TW, 0, TW]) oak(mid, x + o, gy - H * 0.05, 9 + rng() * 5, '#4f7a38', '#3f6a2d'); }
      groundTexture(ground, H, gy, '#a3b248', '#7f9a3a', '#c6cf6a', rng, 0.07);
      for (let i = 0; i < 90; i++) { const x = Math.floor(rng() * TW); const y = gy + 4 + Math.floor(rng() * (H - gy - 6)); rect(ground, x, y - 2, 1, 3, '#6e8a30'); }
    },
  },
  beach: {
    sky: ['#5bc0f3', '#a4dcf6', '#fbe6c2'], haze: '#fdecc9', cloud: { n: 5, col: '#ffffff', shade: '#e9ebe8', alpha: 0.95 },
    waterFrac: 0.3, water: ['#33aadd', '#1b7fc0'],
    props: [['palm', 3], ['driftwood', 2], ['shell', 3], ['rock', 1], ['tuft', 2]],
    atmos: { spray: true, birds: true, dust: true, sun: true },
    build({ far, mid, near, ground, H, gy, rng }) {
      rect(far, 0, gy - H * 0.04, TW, H * 0.04, '#4ba6d8');
      rect(far, 0, gy - H * 0.04, TW, 2, '#bfe6f5');
      ridge(mid, H, gy - H * 0.04, '#d8c58a', H * 0.02, H * 0.015, [0.4, 1.2, 0.2], [1, 0.5, 0.3]);
      for (let i = 0; i < 6; i++) { const x = Math.floor(rng() * TW); for (const o of [-TW, 0, TW]) palm(near, x + o, gy - H * 0.01, 22 + rng() * 14); }
      groundTexture(ground, H, gy, '#e9d49a', '#d7be7e', '#f6e6b8', rng, 0.05);
    },
  },
  normandy: {
    sky: ['#68737e', '#8793a0', '#b7bfc6'], haze: '#a9b1b8', cloud: { n: 10, col: '#9aa3ab', shade: '#6d767e', alpha: 0.9 },
    waterFrac: 0.3, water: ['#4d6d7e', '#34505f'],
    props: [['hedgehog', 5], ['crater', 3], ['barbed', 2], ['wreckcraft', 1], ['rock', 2], ['sandbags', 1]],
    atmos: { blasts: true, smoke: true, spray: true },
    build({ far, mid, near, ground, H, gy, rng }) {
      ridge(far, H, gy, '#5d6a5a', H * 0.12, H * 0.05, [0.2, 1.0, 0.6], [1, 0.5, 0.25]);
      rect(far, 0, gy - H * 0.05, TW, H * 0.05, '#7d7a68');
      for (let x = 0; x < TW; x++) rect(far, x, gy - Math.round(H * 0.12 + pnoise(x, [0.2, 1.0, 0.6], [1, 0.5, 0.25]) * H * 0.05), 1, 2, '#718a5e'); // grassy bluff top
      for (const x of [60, 210, 360]) { rect(far, x, gy - H * 0.09, 14, 5, '#8c8c86'); rect(far, x + 2, gy - H * 0.09 - 2, 10, 2, '#9a9a94'); rect(far, x + 4, gy - H * 0.09 + 1, 6, 2, '#33332f'); }
      for (let i = 0; i < 3; i++) { const x = 60 + Math.floor(rng() * (TW - 160)); for (const o of [-TW, 0, TW]) { landingCraft(mid, x + o, gy - H * 0.04, false); } }
      for (let i = 0; i < 3; i++) { const x = 30 + Math.floor(rng() * (TW - 100)); for (const o of [-TW, 0, TW]) ship(mid, x + o, gy - H * 0.05, 0.8); }
      rect(near, 0, gy - 3, TW, 3, '#767164');
      groundTexture(ground, H, gy, '#9a8f78', '#7d725d', '#b3a78e', rng, 0.08);
      for (let i = 0; i < 60; i++) rect(ground, Math.floor(rng() * TW), gy + Math.floor(rng() * (H - gy)), 3, 1, '#6a604e');
    },
  },
  training: {
    sky: ['#76c3ee', '#b2dff5', '#f1eed6'], haze: '#f3ecd0', cloud: { n: 6, col: '#ffffff', shade: '#d6e6ee', alpha: 0.96 },
    waterFrac: 0, water: ['#2a8fd0', '#0f4f8f'],
    props: [['target', 3], ['sandbags', 2], ['tires', 2], ['barrier', 3], ['tower', 1], ['flagpost', 2], ['drum', 2], ['tuft', 2], ['crater', 1]],
    atmos: { dust: true, colored: true, blasts: true, smoke: true },
    build({ far, mid, near, ground, H, gy, rng }) {
      ridge(far, H, gy, '#a69f8a', H * 0.1, H * 0.05, [0.7, 0.2, 1.4], [1, 0.5, 0.25]);
      ridge(mid, H, gy, '#8e8a66', H * 0.05, H * 0.03, [0.3, 1.6, 0.8], [1, 0.5, 0.3]);
      treeLine(near, gy, rng, '#4e6a3a', '#5c7a44', 8, 15, 22);
      groundTexture(ground, H, gy, '#b79c64', '#9a8250', '#d0b97c', rng, 0.06);
      for (let k = 0; k < 2; k++) { const y = gy + 6 + k * 9; for (let x = 0; x < TW; x += 3) rect(ground, x, y + (x % 6 === 0 ? 0 : 1), 2, 1, '#8c7442'); }
    },
  },
};

// ---------------------------------------------------------------- the engine
export interface HorizonOpts {
  canvas: HTMLCanvasElement;
  env: EnvId;
  seed: string;
  /** Called for sound/UI hooks: 'radar-lit', 'radar-blast', 'zone', 'sun'. */
  onEvent?: (e: string) => void;
}

export interface Horizon {
  resize(): void;
  start(): void;
  stop(): void;
  /** Target ground speed (low-res px/s). `snap` skips the smoothing. */
  setSpeed(v: number, snap?: boolean): void;
  /** Extra forward rush (low-res px) that eases out over ~1.5s. */
  boost(px: number): void;
  /** Slow-motion factor for the whole scene (1 = normal). */
  setTimeScale(s: number): void;
  /** Camera pan down, in low-res px (the ground rises into view). */
  setCam(y: number, snap?: boolean): void;
  /** Skips the scenery forward (low-res px), e.g. past the airfield when resuming a run. */
  jump(px: number): void;
  /** Where the jet is (CSS px), for its ground shadow. */
  setJet(xCss: number, yCss: number, visible: boolean): void;
  milestone(m: Milestone): void;
  /** Puff particles at a CSS-pixel position. `world` particles scroll with the ground. */
  emit(xCss: number, yCss: number, o: { n: number; color: string[]; size?: number; vx?: number; vy?: number; spread?: number; life?: number; grav?: number; world?: boolean }): void;
  /** Big explosion at a CSS-pixel position (scrolls with the ground). */
  boomAt(xCss: number, yCss: number, scale: number): void;
  /** Ground y in CSS px (accounts for camera pan) and the runway surface y. */
  groundYCss(): number;
  runwayYCss(): number;
  jetXCss(): number;
  readonly scale: number;
}

interface Prop { kind: string; wx: number; t0: number; st: { lit?: number; dead?: boolean; variant?: number; blast?: number; boom?: number }; far?: boolean }
interface Zone { kind: 'dust' | 'coast' | 'storm' | 'horizon'; wx0: number; wx1: number; variant: number }
interface Part { x: number; y: number; vx: number; vy: number; l: number; m: number; s: number; c: string; g: number; w: boolean; far: number }
interface Boom { wx: number; y: number; t: number; scale: number }

export function createHorizon(o: HorizonOpts): Horizon {
  const cv = o.canvas;
  const ctx = cv.getContext('2d')!;
  const env = ENVS[o.env];
  const rnd = mulberry32(hashString(`rt|${o.seed}`) ^ 0x9e3779b9); // runtime randomness, deterministic per run

  let S = 0; // world scroll (low-res px)
  let W = 320; let H = 200; let scale = 3.6;
  let gy = 150;
  let speed = 0; let speedT = 0; let pend = 0; let timeScale = 1; let cam = 0; let camT = 0;
  let time = 0; let raf = 0; let last = 0; let running = false;
  let jetX = 0; let jetY = 0; let jetVis = false;
  let layers: { img: HTMLCanvasElement; f: number }[] = [];
  let groundTile: HTMLCanvasElement | null = null;
  let boomFrames: HTMLCanvasElement[] = [];
  let nextSpawn = 300;
  let nextBlast = 2;
  const props: Prop[] = [];
  const zones: Zone[] = [];
  const parts: Part[] = [];
  const booms: Boom[] = [];
  const clouds: { x: number; y: number; s: number; v: number }[] = [];
  const blasts: { x: number; t: number }[] = [];
  let flash = 0; let bolt: { x: number; t: number; pts: number[] } | null = null;
  let sonic: { t: number } | null = null;
  const fireworks: { x: number; y: number; t: number; c: string }[] = [];
  const state = { dust: 0, storm: 0, sun: 0 };

  const jetXl = () => W * 0.24;

  function buildTiles(): void {
    const mkl = () => mk(TW, H);
    const [farC, far] = mkl(); const [midC, mid] = mkl(); const [nearC, near] = mkl(); const [grC, gr] = mkl();
    const r = mulberry32(hashString(`tiles|${o.seed}|${o.env}`));
    env.build({ far, mid, near, ground: gr, H, gy, rng: r });
    layers = [{ img: farC, f: 0.1 }, { img: midC, f: 0.3 }, { img: nearC, f: 0.6 }];
    groundTile = env.waterFrac >= 1 ? null : grC;
    const frames = explosionFrames(12, 27, 5);
    boomFrames = frames.map((rows) => { const [c, x] = mk(27, 27); rows.forEach((row, y) => [...row].forEach((ch, xx) => { const col = EXPLOSION_PAL[ch]; if (col) { x.fillStyle = col; x.fillRect(xx, y, 1, 1); } })); return c; });
  }

  function resize(): void {
    const w = cv.clientWidth || 640; const h = cv.clientHeight || 400;
    scale = w <= 700 ? 3 : 3.6;
    W = Math.ceil(w / scale); H = Math.ceil(h / scale);
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = false;
    gy = Math.round(H * GROUND);
    buildTiles();
    if (!clouds.length) for (let i = 0; i < env.cloud.n * 2; i++) clouds.push({ x: rnd() * 900, y: 8 + rnd() * H * 0.34, s: 0.7 + rnd() * 1.2, v: 2 + rnd() * 5 });
  }

  // ------------------------------------------------------------- spawning
  function pickProp(): string {
    const tot = env.props.reduce((s, p) => s + p[1], 0);
    let r = rnd() * tot;
    for (const [k, w] of env.props) { r -= w; if (r <= 0) return k; }
    return env.props[0][0];
  }
  function spawnAmbient(): void {
    while (nextSpawn < S + W + 220) {
      if (nextSpawn > ZONE_END + 120) {
        const kind = pickProp();
        if (kind !== 'gull') props.push({ kind, wx: nextSpawn, t0: time, st: { variant: Math.floor(rnd() * 3) } });
      }
      nextSpawn += 60 + rnd() * 150;
    }
  }
  function seedAirfield(): void {
    const add = (kind: string, wx: number) => props.push({ kind, wx, t0: 0, st: {} });
    add('hangar', 200); add('hangar2', 360); add('tower', 560); add('fuelTank', 760); add('radarDome', 900); add('windsock', 1050);
    add('parked', 1180); add('parked', 1260); add('drum', 1400); add('hangar', 1500); add('tower', 1640);
    nextSpawn = ZONE_END + 100;
  }
  function emit(x: number, y: number, p: { n: number; color: string[]; size?: number; vx?: number; vy?: number; spread?: number; life?: number; grav?: number; world?: boolean; far?: number }): void {
    for (let i = 0; i < p.n; i++) {
      parts.push({ x, y, vx: (p.vx ?? 0) + (rnd() - 0.5) * (p.spread ?? 30), vy: (p.vy ?? 0) + (rnd() - 0.5) * (p.spread ?? 30), l: 0, m: (p.life ?? 1) * (0.7 + rnd() * 0.6), s: (p.size ?? 2) * (0.7 + rnd() * 0.8), c: p.color[Math.floor(rnd() * p.color.length)], g: p.grav ?? 0, w: p.world ?? false, far: p.far ?? 1 });
    }
  }

  function milestone(m: Milestone): void {
    const wx = S + W + 90;
    const v = m.variant;
    if (m.kind === 'dust' || m.kind === 'storm' || m.kind === 'horizon') {
      const here = S + jetXl();
      for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; if (z.kind === 'coast') continue; if (z.wx0 > here) zones.splice(i, 1); else z.wx1 = Math.min(z.wx1, here + 40); }
    }
    const add = (kind: string, dx: number, st: Prop['st'] = {}) => props.push({ kind, wx: wx + dx, t0: time, st: { variant: v, ...st } });
    if (m.kind === 'vehicle') { const n = 1 + Math.min(3, v * 2); for (let i = 0; i < n; i++) add(i % 2 ? 'truckWreck' : 'tankWreck', i * 90); }
    else if (m.kind === 'sam') { const n = 1 + Math.min(2, v); for (let i = 0; i < n; i++) add('samSite', i * 120); }
    else if (m.kind === 'radar') { const n = 1 + Math.min(2, v); for (let i = 0; i < n; i++) add('radarTower', i * 110, { lit: 0 }); }
    else if (m.kind === 'dust') { zones.push({ kind: 'dust', wx0: wx, wx1: wx + 800 + v * 200, variant: v }); for (let i = 0; i < 10; i++) add(i % 3 ? 'crater' : 'burntTank', 30 + i * 80, { variant: i }); }
    else if (m.kind === 'coast') { zones.push({ kind: 'coast', wx0: wx, wx1: wx + 900 + v * 200, variant: v }); o.onEvent?.('zone'); }
    else if (m.kind === 'storm') { zones.push({ kind: 'storm', wx0: wx, wx1: wx + 850 + v * 200, variant: v }); }
    else { zones.push({ kind: 'horizon', wx0: wx, wx1: wx + 1000, variant: v }); sonic = { t: 0 }; o.onEvent?.('sun'); }
  }

  // ------------------------------------------------------------- update
  function update(dt: number): void {
    dt *= timeScale;
    time += dt;
    speed += (speedT - speed) * (1 - Math.exp(-dt * 2.4));
    const rush = pend * 2.4;
    pend = Math.max(0, pend - rush * dt);
    const v = speed + rush;
    S += v * dt;
    cam += (camT - cam) * (1 - Math.exp(-dt * 1.8));
    spawnAmbient();
    while (props.length && props[0].wx < S - 160) props.shift();
    while (zones.length && zones[0].wx1 < S - 400) zones.shift();

    const jwx = S + jetXl();
    const lvl = (k: Zone['kind']) => zones.filter((z) => z.kind === k).reduce((m, z) => Math.max(m, zoneIntensity(jwx, z.wx0, z.wx1)), 0);
    state.dust += (lvl('dust') - state.dust) * Math.min(1, dt * 3);
    state.storm += (lvl('storm') - state.storm) * Math.min(1, dt * 3);
    state.sun += (lvl('horizon') - state.sun) * Math.min(1, dt * 3);

    // radar set piece: lights up, then explodes as the jet passes (the blast is confined to the prop)
    for (const p of props) {
      if (p.kind !== 'radarTower' || p.st.dead) continue;
      const sx = p.wx - S;
      if (sx < W * 0.85 && (p.st.lit ?? 0) < 1) { p.st.lit = Math.min(1, (p.st.lit ?? 0) + dt * 1.2); if ((p.st.lit ?? 0) > 0.05 && !p.st.blast) { p.st.blast = -1; o.onEvent?.('radar-lit'); } }
      if (sx < jetXl() + 40 && !p.st.dead) {
        p.st.dead = true;
        booms.push({ wx: p.wx, y: gy - 22, t: 0, scale: 2.4 + (p.st.variant ?? 0) * 0.4 });
        o.onEvent?.('radar-blast');
        emit(p.wx - S, gy - 20, { n: 30, color: ['#ffd84a', '#ff8a2a', '#e0322f', '#c5cacd'], size: 2, vx: 0, vy: -40, spread: 150, life: 1.2, grav: 160, world: true });
      }
    }
    for (const p of props) if (p.st.dead && p.kind === 'radarTower' && rnd() < dt * 14) emit(p.wx - S, gy - 12, { n: 1, color: ['#2b2b2e', '#3c3c40', '#55555a'], size: 3, vy: -26, spread: 10, life: 2.4, world: true });
    for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > 1.4) booms.splice(i, 1); }

    // atmosphere
    if (env.atmos.blasts || state.storm > 0.2) {
      nextBlast -= dt;
      if (nextBlast <= 0) { blasts.push({ x: rnd() * W * 1.2, t: 0 }); nextBlast = (state.storm > 0.2 ? 1.2 : 2.5) + rnd() * (state.storm > 0.2 ? 2 : 5); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; b.t += dt;
      if (b.t < 0.06 && b.t + dt >= 0.06) emit(b.x, gy - H * 0.06, { n: 14, color: ['#4a4a50', '#5c5c62', '#34343a', '#6b6b72'], size: 1.6, vy: -9, vx: 0, spread: 14, life: 3.2, far: 0.15 });
      if (b.t > 0.6) blasts.splice(i, 1);
    }
    if (state.storm > 0.3 && !bolt && rnd() < dt * 0.9 * state.storm) { const x = rnd() * W; const pts = [x]; let y = 0; const ys = [0]; while (y < gy - 10) { y += 10 + rnd() * 14; pts.push(x + (rnd() - 0.5) * 28); ys.push(y); } bolt = { x, t: 0, pts: pts.flatMap((px, i) => [px, ys[i]]) }; flash = 0.8; }
    if (bolt) { bolt.t += dt; if (bolt.t > 0.28) bolt = null; }
    flash = Math.max(0, flash - dt * 2.6);
    if (env.atmos.leaves && rnd() < dt * 5) emit(W + 4, rnd() * gy, { n: 1, color: ['#8fbf4a', '#c0a43a', '#5f9a3a'], size: 1, vx: -v * 1.2 - 30, vy: 8, spread: 8, life: 8 });
    if (env.atmos.dust && rnd() < dt * 7) emit(W + 4, gy - rnd() * 40, { n: 1, color: ['#e8d9a8', '#d6c58f'], size: 1, vx: -v * 1.3 - 20, vy: -2, spread: 6, life: 8 });
    if (env.atmos.spray && rnd() < dt * 6) emit(W + 4, gy - 4 - rnd() * 10, { n: 1, color: ['#ffffff', '#cfe9f7'], size: 1, vx: -v * 1.2 - 24, vy: -12, spread: 8, life: 6, grav: 12 });
    if (env.atmos.birds && rnd() < dt * 0.18) emit(W + 6, 20 + rnd() * gy * 0.5, { n: 1, color: ['#f2f2f2'], size: 2, vx: -v * 0.5 - 14, vy: 0, spread: 2, life: 14 });
    if (env.atmos.colored && rnd() < dt * 0.35) { const col = [['#e8453c', '#ff7a6a'], ['#43c06a', '#8ee6a8'], ['#ffd24a', '#fff0a0'], ['#a86ae8', '#d4aaff']][Math.floor(rnd() * 4)]; for (let k = 0; k < 14; k++) setTimeout(() => emit(W + 30 + rnd() * 20, gy - 4, { n: 1, color: col, size: 3, vy: -22, spread: 8, life: 5, world: true }), k * 60); }
    if (state.storm > 0.25) for (let i = 0; i < state.storm * 5; i++) emit(rnd() * (W + 40), -4, { n: 1, color: ['#a9bccf'], size: 1, vx: -50 - v * 0.2, vy: 190, spread: 0, life: 1.1 });
    if (state.dust > 0.2 && rnd() < dt * 30 * state.dust) emit(W + 6, gy - rnd() * 60, { n: 1, color: ['#c9a66a', '#d8b87a', '#b8955a'], size: 4, vx: -v * 1.3 - 40, vy: -3, spread: 10, life: 4 });
    if (state.sun > 0.3 && rnd() < dt * 2.2) fireworks.push({ x: rnd() * W, y: 18 + rnd() * gy * 0.45, t: 0, c: ['#ffd84a', '#ff5c7a', '#4fe3ff', '#ffffff'][Math.floor(rnd() * 4)] });
    for (let i = fireworks.length - 1; i >= 0; i--) { const f = fireworks[i]; if (f.t === 0) emit(f.x, f.y, { n: 28, color: [f.c, '#ffffff'], size: 1.4, spread: 90, life: 1.3, grav: 40 }); f.t += dt; if (f.t > 0.05) fireworks.splice(i, 1); }
    if (sonic) { sonic.t += dt; if (sonic.t > 1.1) sonic = null; }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.l += dt;
      if (p.l > p.m) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += (p.vx - (p.w ? v : 0) - (p.far < 1 ? v * p.far : 0)) * dt;
      p.y += p.vy * dt;
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
  }

  // ------------------------------------------------------------- drawing
  function drawSky(): void {
    const [a, b, c] = env.sky;
    const sunrise = state.sun;
    for (let y = 0; y < gy; y++) {
      const t = y / gy;
      let col = t < 0.55 ? mix(a, b, t / 0.55) : mix(b, c, (t - 0.55) / 0.45);
      if (sunrise > 0) col = mix(col, t < 0.5 ? '#5a3a8a' : t < 0.8 ? '#ff7a4a' : '#ffd36a', sunrise * 0.85);
      if (state.storm > 0) col = mix(col, '#4b5668', state.storm * 0.8);
      if (state.dust > 0) col = mix(col, '#c9a66a', state.dust * 0.55);
      ctx.fillStyle = col; ctx.fillRect(0, y - Math.round(cam * 0.1), W, 1);
    }
    if (cam > 0) { ctx.fillStyle = mix(c, '#c9a66a', state.dust * 0.5); ctx.fillRect(0, gy - Math.round(cam * 0.1) - 1, W, Math.round(cam * 0.1) + 3); }
    if (env.atmos.sun || sunrise > 0) {
      const r = 9 + sunrise * 34;
      const sx = W * 0.72; const sy = gy - 20 - sunrise * (gy * 0.12) + 24 * (1 - sunrise);
      ctx.fillStyle = sunrise > 0 ? `rgba(255,236,160,${0.3 + sunrise * 0.5})` : 'rgba(255,248,210,.55)';
      ctx.beginPath(); ctx.arc(sx, sy, r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sunrise > 0 ? '#fff6c0' : '#fffbe0'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      if (sunrise > 0.1) for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2 + time * 0.15; ctx.fillStyle = `rgba(255,240,170,${0.12 * sunrise})`; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ang) * 260, sy + Math.sin(ang) * 260); ctx.lineTo(sx + Math.cos(ang + 0.1) * 260, sy + Math.sin(ang + 0.1) * 260); ctx.fill(); }
    }
  }

  function drawClouds(): void {
    const dim = env.cloud;
    ctx.globalAlpha = dim.alpha * (1 - state.sun * 0.2);
    for (const c of clouds) {
      const x = ((c.x - S * 0.06 * c.s - time * c.v) % (W + 240) + (W + 240)) % (W + 240) - 120;
      const y = c.y - cam * 0.1;
      const s = c.s * (o.env === 'normandy' ? 1.4 : 1);
      rect(ctx, x, y + 6 * s, 34 * s, 5 * s, dim.shade); rect(ctx, x + 4 * s, y + 2 * s, 24 * s, 7 * s, dim.col); rect(ctx, x + 10 * s, y - 2 * s, 12 * s, 6 * s, dim.col); rect(ctx, x + 2 * s, y + 4 * s, 30 * s, 3 * s, dim.col);
    }
    ctx.globalAlpha = 1;
  }

  function tileLayer(img: HTMLCanvasElement, f: number, yoff: number): void {
    const off = Math.floor((S * f) % TW);
    for (let x = -off; x < W; x += TW) ctx.drawImage(img, x, yoff);
  }

  function drawWater(y0: number, y1: number, x0: number, x1: number): void {
    const [c1, c2] = env.water;
    const h = Math.max(1, y1 - y0);
    for (let y = y0; y < y1; y += 1) { ctx.fillStyle = mix(c1, c2, (y - y0) / h); ctx.fillRect(x0, y, x1 - x0, 1); }
    const rows = Math.max(6, Math.round(h / 3));
    for (let i = 0; i < rows; i++) {
      const dep = (i + 0.5) / rows;
      const y = y0 + dep * h;
      const spd = 0.35 + dep * 0.9;
      const len = 4 + dep * 14;
      const period = 22 + (i % 5) * 7;
      const ph = (i * 37) % period;
      const off = ((S * spd + time * 7 * spd + ph) % period + period) % period;
      for (let x = x0 - period + (period - off); x < x1; x += period) {
        const wy = y + Math.sin((x + time * 2) / 9) * (0.6 + dep);
        rect(ctx, x, wy, len, 1, i % 3 === 0 ? 'rgba(255,255,255,.75)' : 'rgba(205,232,247,.5)');
      }
    }
    if (y1 < H - 2) {
      for (let x = x0; x < x1; x += 1) { const fy = y1 + Math.sin((x + S * 0.9) / 7 + time * 2.4) * 1.6; rect(ctx, x, fy, 1, 2, 'rgba(255,255,255,.9)'); }
      for (let x = x0; x < x1; x += 2) { const fy = y1 - 3 + Math.sin((x + S * 0.9) / 9 + time * 1.7) * 1.4; rect(ctx, x, fy, 2, 1, 'rgba(255,255,255,.35)'); }
    }
  }

  function drawGround(camY: number): void {
    const y0 = gy - camY;
    // base ground (environment), or the airfield's grass inside the start zone
    const zoneEndX = ZONE_END - S;
    if (groundTile) {
      const off = Math.floor(S % TW);
      // stretch the ground rows so the camera pan never exposes a gap at the bottom
      for (let x = -off; x < W; x += TW) ctx.drawImage(groundTile, 0, gy, TW, H - gy, x, y0, TW, H - gy + camY + 2);
    } else {
      drawWater(y0, H + camY + 2, 0, W);
    }
    if (env.waterFrac > 0 && env.waterFrac < 1) drawWater(y0, y0 + Math.round((H - gy) * env.waterFrac), 0, W);
    if (zoneEndX > 0) {
      const w = Math.min(W, zoneEndX);
      ctx.fillStyle = '#6f9a4a'; ctx.fillRect(0, y0, w, H - gy + camY + 2);
      for (let y = y0; y < H + camY; y += 1) { ctx.fillStyle = mix('#6f9a4a', '#4a7a36', (y - y0) / (H - gy)); ctx.fillRect(0, y, w, 1); }
      for (let i = 0; i < 40; i++) { const gx = ((i * 97 + 13) % 400) - (S % 400); rect(ctx, (gx + 400) % 400 - 40, y0 + 12 + (i * 13) % (H - gy - 14), 2, 1, '#86b25a'); }
      // runway
      const rx0 = RUNWAY0 - S; const rx1 = RUNWAY1 - S;
      const ry0 = y0 + 3; const rh = Math.round((H - gy) * 0.42);
      if (rx1 > 0 && rx0 < W) {
        const a = Math.max(0, rx0); const b = Math.min(W, rx1);
        ctx.fillStyle = '#3d4247'; ctx.fillRect(a, ry0, b - a, rh);
        ctx.fillStyle = '#4a5056'; ctx.fillRect(a, ry0, b - a, 2);
        ctx.fillStyle = '#2b2f33'; ctx.fillRect(a, ry0 + rh - 2, b - a, 2);
        for (let wx = Math.floor((S + a) / 40) * 40; wx < S + b; wx += 40) { rect(ctx, wx - S, ry0 + Math.round(rh / 2) - 1, 20, 2, '#e8e8e2'); }
        for (let wx = Math.floor((S + a) / 44) * 44; wx < S + b; wx += 44) { const on = Math.floor(time * 4 + wx / 44) % 2; rect(ctx, wx - S, ry0 - 1, 2, 2, on ? '#ffd24a' : '#c79a1a'); rect(ctx, wx - S, ry0 + rh - 1, 2, 2, on ? '#ffd24a' : '#c79a1a'); }
        for (const sx of [RUNWAY0 + 20, RUNWAY1 - 60]) for (let k = 0; k < 6; k++) rect(ctx, sx - S + k * 5, ry0 + 3, 3, rh - 6, '#e0e0da');
      }
      // overrun edge into the environment
      if (zoneEndX < W) { rect(ctx, zoneEndX - 6, y0, 6, H - gy + camY + 2, '#c9b27a'); }
    }
    // coast zones override the ground with open water
    for (const z of zones) {
      if (z.kind !== 'coast') continue;
      const x0 = z.wx0 - S; const x1 = z.wx1 - S;
      if (x1 < 0 || x0 > W) continue;
      const a = Math.max(0, x0); const b = Math.min(W, x1);
      rect(ctx, a - 10, y0, 12, H - gy + camY + 4, '#e9d49a');
      rect(ctx, b - 2, y0, 12, H - gy + camY + 4, '#e9d49a');
      drawWater(y0, H + camY + 2, Math.max(0, a + 2), Math.min(W, b - 2));
    }
  }

  function drawProp(p: Prop, sx: number, gyy: number): void {
    const c = ctx; const v = p.st.variant ?? 0;
    switch (p.kind) {
      case 'pine': pine(c, sx, gyy, 22 + v * 7, '#1f4b3a', '#2b5f48'); break;
      case 'oak': oak(c, sx, gyy, 22 + v * 5, o.env === 'plains' ? '#5a8a3a' : '#3f7a3a', '#2f6a2f'); break;
      case 'bush': bush(c, sx, gyy, 10 + v * 3, '#2f6a35', '#3f8a45'); break;
      case 'log': log(c, sx, gyy); break;
      case 'tuft': tuft(c, sx, gyy, o.env === 'plains' ? '#6e8a30' : o.env === 'beach' ? '#7a9a40' : '#4a8a4a'); break;
      case 'rock': rock(c, sx, gyy, 8 + v * 3, '#6b6a66', '#8a8984'); break;
      case 'palm': palm(c, sx, gyy, 26 + v * 8); break;
      case 'driftwood': rect(c, sx - 8, gyy - 3, 16, 3, '#9a7a52'); rect(c, sx + 4, gyy - 6, 2, 4, '#8a6a42'); break;
      case 'shell': rect(c, sx, gyy - 2, 3, 2, '#f4e6d8'); rect(c, sx + 1, gyy - 3, 1, 1, '#f4b9a8'); break;
      case 'hedgehog': hedgehog(c, sx, gyy); break;
      case 'crater': crater(c, sx, gyy + 2, 16 + v * 6); break;
      case 'barbed': barbed(c, sx, gyy); break;
      case 'wreckcraft': landingCraft(c, sx, gyy + 2, true); break;
      case 'sandbags': sandbags(c, sx - 10, gyy, 4 + v); break;
      case 'target': target(c, sx, gyy); break;
      case 'tires': tires(c, sx, gyy); break;
      case 'barrier': rect(c, sx - 8, gyy - 7, 16, 7, '#8a8d90'); rect(c, sx - 8, gyy - 7, 16, 2, '#a5a9ac'); break;
      case 'tower': tower(c, sx, gyy, 28, true); break;
      case 'flagpost': rect(c, sx, gyy - 18, 1, 18, '#ddd'); rect(c, sx + 1, gyy - 18, 7, 4, v % 2 ? '#2d6ad6' : '#e8453c'); break;
      case 'drum': drum(c, sx, gyy); drum(c, sx + 6, gyy); break;
      case 'buoy': buoy(c, sx, gyy + 8, time); break;
      case 'hangar': hangar(c, sx - 36, gyy, 72); break;
      case 'hangar2': hangar(c, sx - 28, gyy, 56); break;
      case 'fuelTank': fuel(c, sx, gyy); fuel(c, sx + 22, gyy); break;
      case 'radarDome': radarDome(c, sx, gyy); break;
      case 'windsock': windsock(c, sx, gyy, time); break;
      case 'parked': parkedJet(c, sx, gyy + 2); break;
      case 'tankWreck': tankWreck(c, sx, gyy, 1, true); if (rnd() < 0.05) emit(sx - 4, gyy - 16, { n: 1, color: ['#3a3a3e', '#505056'], size: 2, vy: -16, spread: 6, life: 2.6, world: true }); break;
      case 'burntTank': tankWreck(c, sx, gyy, 0.9, false); rect(c, sx - 12, gyy - 11, 24, 3, '#1d1a18'); if (rnd() < 0.2) emit(sx, gyy - 12, { n: 1, color: ['#ff8a2a', '#ffd84a', '#e0322f'], size: 2, vy: -26, spread: 10, life: 0.8, world: true }); break;
      case 'truckWreck': truckWreck(c, sx, gyy); break;
      case 'samSite': samSite(c, sx, gyy, time); break;
      case 'radarTower': radarTower(c, sx, gyy, p.st.lit ?? 0, time, !!p.st.dead); break;
      default: break;
    }
  }

  function draw(): void {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawClouds();
    // distant blasts (far parallax)
    for (const b of blasts) {
      const r = b.t < 0.15 ? 3 + b.t * 70 : Math.max(0, 14 - (b.t - 0.15) * 30);
      if (r > 0) { ctx.fillStyle = b.t < 0.15 ? '#fff6d0' : '#ff9a3a'; ctx.beginPath(); ctx.arc(((b.x - S * 0.15) % (W * 1.3) + W * 1.3) % (W * 1.3), gy - H * 0.06 - cam * 0.25, r, 0, Math.PI * 2); ctx.fill(); }
    }
    const lay = layers;
    tileLayer(lay[0].img, lay[0].f, Math.round(cam * 0.25));
    tileLayer(lay[1].img, lay[1].f, Math.round(cam * 0.5));
    // haze between mid and near layers
    const hz = ctx.createLinearGradient(0, gy - H * 0.2 - cam * 0.5, 0, gy - cam * 0.5);
    hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, `${env.haze}`);
    ctx.globalAlpha = o.env === 'normandy' ? 0.5 : 0.32; ctx.fillStyle = hz; ctx.fillRect(0, gy - H * 0.2 - cam * 0.5, W, H * 0.2 + 2); ctx.globalAlpha = 1;
    tileLayer(lay[2].img, lay[2].f, Math.round(cam * 0.8));
    drawGround(Math.round(cam));

    const gyy = gy - Math.round(cam);
    // far particles (smoke on the horizon), then ground-level props
    for (const p of parts) if (p.far < 1) { ctx.globalAlpha = Math.max(0, 1 - p.l / p.m) * 0.85; rect(ctx, p.x, p.y - cam * 0.25, p.s * (1 + p.l * 0.5), p.s * (1 + p.l * 0.5), p.c); }
    ctx.globalAlpha = 1;
    for (const p of props) { const sx = p.wx - S; if (sx > -90 && sx < W + 90) drawProp(p, sx, gyy + 2 + ((p.wx * 13) % 5 > 2 ? 0 : 3)); }
    // jet ground shadow
    if (jetVis) {
      const alt = Math.max(0, gyy * scale - jetY) / scale;
      const w = Math.max(6, 28 - alt * 0.12);
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, 0.3 - alt * 0.002)})`; ctx.fillRect(Math.round(jetX / scale - w / 2), gyy + 8, Math.round(w), 2);
    }
    // explosions confined to props
    for (const b of booms) {
      const f = Math.min(boomFrames.length - 1, Math.floor((b.t / 1.1) * boomFrames.length));
      const size = 27 * b.scale; const sx = b.wx - S;
      ctx.drawImage(boomFrames[f], Math.round(sx - size / 2), Math.round(b.y - size / 2 - cam), Math.round(size), Math.round(size));
      if (b.t < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.5 - b.t * 4})`; ctx.fillRect(0, 0, W, H); }
    }
    // near particles
    for (const p of parts) if (p.far >= 1 && p.c === '#a9bccf') { ctx.globalAlpha = 0.7; rect(ctx, p.x, p.y, 1, 6, p.c); ctx.globalAlpha = 1; }
    for (const p of parts) if (p.far >= 1 && p.c !== '#a9bccf') { const a = Math.max(0, 1 - p.l / p.m); ctx.globalAlpha = a; rect(ctx, p.x, p.y - cam * (p.w ? 1 : 0.3), p.s * (p.c.startsWith('#2') || p.c.startsWith('#3') || p.c.startsWith('#5') ? 1 + p.l * 1.4 : 1), p.s * (p.c.startsWith('#2') || p.c.startsWith('#3') || p.c.startsWith('#5') ? 1 + p.l * 1.4 : 1), p.c); }
    ctx.globalAlpha = 1;
    // storm: darkness, lightning, dust haze, sonic ring
    if (state.storm > 0.05) { ctx.fillStyle = `rgba(24,32,48,${state.storm * 0.22})`; ctx.fillRect(0, 0, W, H); }
    if (bolt) { ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < bolt.pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, bolt.pts[i], bolt.pts[i + 1]); ctx.stroke(); }
    if (flash > 0) { ctx.fillStyle = `rgba(235,242,255,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
    if (state.dust > 0.05) { ctx.fillStyle = `rgba(201,166,106,${state.dust * 0.34})`; ctx.fillRect(0, 0, W, H); }
    if (sonic) { const r = sonic.t * 330; ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.8 - sonic.t)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(jetXl(), gy * 0.62, r, 0, Math.PI * 2); ctx.stroke(); }
    if (env.atmos.rays) { ctx.fillStyle = 'rgba(255,250,200,.06)'; for (let i = 0; i < 4; i++) { const x0 = ((i * 120 - S * 0.05) % (W + 160)) - 40; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 26, 0); ctx.lineTo(x0 - 50, gy); ctx.lineTo(x0 - 90, gy); ctx.fill(); } }
    // speed streaks when rushing
    const total = speed + pend * 2.4;
    if (total > CRUISE * 1.5) { ctx.fillStyle = 'rgba(255,255,255,.5)'; const n = Math.min(24, Math.floor((total - CRUISE) / 14)); for (let i = 0; i < n; i++) { const y = (i * 53 + Math.floor(time * 900)) % gy; const x = (W - ((time * total * 1.6 + i * 77) % (W + 80))); rect(ctx, x, y, 14 + total / 18, 1, 'rgba(255,255,255,.45)'); } }
  }

  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  seedAirfield();
  resize();

  return {
    resize,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setSpeed(v, snap = false) { speedT = v; if (snap) speed = v; },
    boost(px) { pend += px; },
    setTimeScale(s) { timeScale = s; },
    setCam(y, snap = false) { camT = y; if (snap) cam = y; },
    jump(px) { S += px; },
    setJet(x, y, vis) { jetX = x; jetY = y; jetVis = vis; },
    milestone,
    emit(x, y, p) { emit(x / scale, y / scale, { ...p, vx: (p.vx ?? 0) / scale, vy: (p.vy ?? 0) / scale, spread: (p.spread ?? 30) / scale }); },
    boomAt(x, y, s) { booms.push({ wx: S + x / scale, y: y / scale + cam, t: 0, scale: s }); },
    groundYCss: () => (gy - cam) * scale,
    runwayYCss: () => (gy - cam + 3 + Math.round((H - gy) * 0.21)) * scale,
    jetXCss: () => jetXl() * scale,
    get scale() { return scale; },
  };
}
