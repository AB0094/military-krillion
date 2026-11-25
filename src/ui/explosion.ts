import { mulberry32 } from '../logic/seed';
import { reducedMotion } from './fx';
import { sprite, type Palette } from './sprites';

export const EXPLOSION_PAL: Palette = { w: '#fff6d0', y: '#ffd84a', o: '#ff8a2a', r: '#e0322f', d: '#8a1d3a', s: '#43304d', k: '#1c1226' };

const easeOut = (p: number) => 1 - (1 - p) ** 2.2;

/**
 * Pre-renders an explosion as pixel-art frames: a white-hot core, yellow/orange/red bands and a ragged,
 * lobed edge that blooms outward, then hollows into a ring and darkens into smoke.
 */
export function explosionFrames(frames = 12, size = 27, seed = 7): string[][] {
  const rng = mulberry32(seed);
  const noise = Array.from({ length: size }, () => Array.from({ length: size }, () => rng()));
  const c = (size - 1) / 2;
  const lobes = [rng() * 6, rng() * 6, rng() * 6];
  const out: string[][] = [];
  for (let f = 0; f < frames; f++) {
    const p = f / (frames - 1);
    const R = (0.22 + 0.78 * easeOut(p)) * (size / 2 - 1.2);
    const hole = p > 0.42 ? (((p - 0.42) / 0.58) ** 1.15) * R * 0.78 : 0;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) {
        const dx = x - c;
        const dy = y - c;
        const a = Math.atan2(dy, dx);
        const lobe = 1 + 0.16 * Math.sin(3 * a + lobes[0]) + 0.1 * Math.sin(5 * a + lobes[1]) + 0.06 * Math.sin(8 * a + lobes[2]);
        const d = Math.hypot(dx, dy) + (noise[y][x] - 0.5) * 2.4 * (0.5 + p);
        const edge = R * lobe;
        let ch = '.';
        if (d <= edge && d >= hole) {
          const t = (d - hole) / Math.max(0.001, edge - hole);
          if (p < 0.3) ch = t < 0.3 ? 'w' : t < 0.6 ? 'y' : t < 0.85 ? 'o' : 'r';
          else if (p < 0.65) ch = t < 0.18 ? 'y' : t < 0.5 ? 'o' : t < 0.8 ? 'r' : 'd';
          else ch = t < 0.3 ? 'o' : t < 0.55 ? 'r' : t < 0.8 ? 'd' : 's';
        } else if (p > 0.5 && d > edge && d <= edge + 1.6 && noise[y][x] > 0.55) {
          ch = 's'; // smoke ring
        }
        row += ch;
      }
      rows.push(row);
    }
    out.push(rows);
  }
  return out;
}

const cache = new Map<string, string[]>();
function renderedFrames(frames: number, size: number, seed: number): string[] {
  const key = `${frames}|${size}|${seed}`;
  let r = cache.get(key);
  if (!r) { r = explosionFrames(frames, size, seed).map((rows) => sprite(rows, EXPLOSION_PAL, 'boom-spr')); cache.set(key, r); }
  return r;
}

export interface BoomOptions {
  /** Pixel size in CSS px. 3 = small flak puff, 8 = the big interception. */
  px?: number;
  frames?: number;
  size?: number;
  seed?: number;
  onDone?: () => void;
}

/** Plays the frame-by-frame explosion centred on (x, y) inside `host`, then removes itself. */
export function playExplosion(host: HTMLElement, x: number, y: number, opts: BoomOptions = {}): void {
  const { px = 6, frames = 12, size = 27, seed = 7, onDone } = opts;
  if (reducedMotion()) { onDone?.(); return; }
  const imgs = renderedFrames(frames, size, seed);
  const el = document.createElement('div');
  el.className = 'boom';
  el.style.cssText = `left:${x}px;top:${y}px;--px:${px}px`;
  host.appendChild(el);
  let i = 0;
  const tick = () => {
    if (!el.isConnected) return;
    el.innerHTML = imgs[i];
    i++;
    if (i < imgs.length) setTimeout(tick, 62);
    else { setTimeout(() => el.remove(), 90); onDone?.(); }
  };
  tick();
}

/** A square pixel shockwave ring that expands and fades. */
export function shockwave(host: HTMLElement, x: number, y: number, size = 40): void {
  if (reducedMotion()) return;
  const el = document.createElement('i');
  el.className = 'shock';
  el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

/** Dark smoke columns that rise and drift after the blast. */
export function smokeColumns(host: HTMLElement, x: number, y: number, count = 9): void {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    el.className = 'smoke';
    const s = 12 + Math.random() * 18;
    el.style.cssText = `left:${x + (Math.random() - 0.5) * 70}px;top:${y + (Math.random() - 0.5) * 40}px;width:${s}px;height:${s}px;--dx:${(Math.random() - 0.5) * 60}px;--d:${1.6 + Math.random() * 1.2}s;animation-delay:${Math.random() * 0.35}s`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}

/** Flaming wreckage: chunks in the missile's colours that tumble and fall, trailing fire. */
export function wreckage(host: HTMLElement, x: number, y: number, fallTo: number): void {
  if (reducedMotion()) return;
  const colors = ['#f1f6fb', '#b9c8d8', '#7f93a8', '#4fe3ff', '#ff5c7a', '#2f3d52'];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('i');
    d.className = 'deb';
    const s = 6 + Math.round(Math.random() * 3) * 2;
    d.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;margin:${-s / 2}px;background:${colors[i % colors.length]}`;
    host.appendChild(d);
    const vx = (Math.random() - 0.5) * 420;
    const vy = 80 + Math.random() * 240;
    const spin = (Math.random() - 0.5) * 900;
    d.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${vx * 0.5}px,${-vy}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.34 },
      { transform: `translate(${vx}px,${fallTo - y + 60}px) rotate(${spin}deg)`, opacity: 0.1 },
    ], { duration: 1500 + Math.random() * 500, easing: 'cubic-bezier(.3,.1,.7,1)' }).onfinish = () => d.remove();
  }
}
