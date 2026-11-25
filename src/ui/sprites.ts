/**
 * Tiny pixel-art engine. Sprites are arrays of strings (one letter per pixel, '.' = empty) and are drawn
 * procedurally with shapes, shaded by region, then outlined, so they stay crisp at any `--px` scale.
 */
export type Palette = Record<string, string>;

const pad = (rows: readonly string[]): string[] => {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, '.'));
};

/** Renders a sprite as crisp SVG rects (runs of the same colour are merged). Size = `--px` CSS var per pixel. */
export function sprite(rows: readonly string[], pal: Palette, cls = ''): string {
  const grid = pad(rows);
  const w = grid[0].length;
  const h = grid.length;
  let rects = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      if (!pal[ch]) { x++; continue; }
      let e = x;
      while (e < w && row[e] === ch) e++;
      rects += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${pal[ch]}"/>`;
      x = e;
    }
  });
  return `<svg class="spr ${cls}" viewBox="0 0 ${w} ${h}" style="width:calc(var(--px) * ${w});height:calc(var(--px) * ${h})" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// ---------------------------------------------------------------- drawing helpers
type Grid = string[][];
const make = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string>(w).fill('.'));
const put = (g: Grid, x: number, y: number, c: string) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; };
const rect = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c); };

/** Scanline polygon fill (even-odd). */
function poly(g: Grid, pts: readonly [number, number][], c: string): void {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) xs.push(x1 + ((y + 0.5 - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) put(g, x, y, c);
  }
}

/** Adds a 1px dark outline around every filled pixel, growing the grid by a margin. */
function outline(g: Grid, c = 'k'): Grid {
  const h = g.length;
  const w = g[0].length;
  const out = make(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + 1][x + 1] = g[y][x];
  for (let y = 0; y < h + 2; y++) {
    for (let x = 0; x < w + 2; x++) {
      if (out[y][x] !== '.') continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if ((dx || dy) && yy >= 0 && yy < h + 2 && xx >= 0 && xx < w + 2 && out[yy][xx] !== '.' && out[yy][xx] !== c) { out[y][x] = c; dy = 2; break; }
        }
      }
    }
  }
  return out;
}

const toRows = (g: Grid): string[] => g.map((r) => r.join(''));

// ---------------------------------------------------------------- the HARM (anti-radiation missile), nose down
function missileGrid(): Grid {
  const g = make(13, 38);
  // tail fins (swept), then body, then wings, so the body overlaps them
  for (let i = 0; i < 8; i++) { rect(g, 0, i, Math.min(3, i), i, i < 3 ? 'm' : 'd'); rect(g, 12 - Math.min(3, i), i, 12, i, i < 3 ? 'd' : 'd'); }
  for (let y = 15; y <= 21; y++) {
    const reach = y <= 18 ? y - 14 : 22 - y;
    rect(g, 4 - reach, y, 3, y, 'm');
    rect(g, 9, y, 8 + reach, y, 'd');
  }
  // body, shaded left to right
  for (let y = 8; y <= 29; y++) ['w', 'w', 'm', 'm', 'd'].forEach((c, i) => put(g, 4 + i, y, c));
  rect(g, 4, 8, 8, 9, 'd'); // exhaust collar
  rect(g, 4, 12, 8, 12, 'c'); rect(g, 4, 25, 8, 25, 'c'); // cyan bands
  put(g, 6, 18, 'c');
  // seeker nose (ogive)
  [[4, 8], [4, 8], [5, 7], [5, 7], [5, 7], [6, 6], [6, 6]].forEach(([a, b], i) => rect(g, a, 30 + i, b, 30 + i, i >= 5 ? 'r' : 'n'));
  return outline(g);
}
const MISSILE_PAL: Palette = { w: '#f1f6fb', m: '#b9c8d8', d: '#7f93a8', n: '#2f3d52', r: '#ff5c7a', c: '#4fe3ff', k: '#101c2b' };
export const missileSprite = (cls = ''): string => sprite(toRows(missileGrid()), MISSILE_PAL, cls);

/** Enemy surface-to-air missile: the same airframe in hostile colours. */
export const samSprite = (cls = ''): string =>
  sprite(toRows(missileGrid()), { w: '#ffe3b0', m: '#e8924f', d: '#a8472f', n: '#3a1510', r: '#ffffff', c: '#ffd24a', k: '#2a0c08' }, cls);

// ---------------------------------------------------------------- fighter jet, side view facing right
function jetGrid(): Grid {
  const W = 50;
  const H = 21;
  const cy = 12;
  const g = make(W, H);
  poly(g, [[22, cy + 2], [40, cy + 2], [29, cy + 8], [21, cy + 8]], 'm'); // wing
  poly(g, [[10, cy + 1], [19, cy + 1], [13, cy + 5], [8, cy + 5]], 'd'); // tailplane
  poly(g, [[10, cy - 3], [24, cy - 3], [16, cy - 10], [12, cy - 10]], 'm'); // fin
  poly(g, [[13, cy - 9], [16, cy - 9], [17, cy - 6], [12, cy - 6]], 'r');
  // fuselage with a tapered nose
  for (let x = 7; x <= 46; x++) {
    const t = (x - 7) / 39;
    const top = t < 0.58 ? 3.7 : 3.7 * (1 - ((t - 0.58) / 0.42) ** 1.5);
    const bot = t < 0.58 ? 2.9 : 2.9 * (1 - ((t - 0.58) / 0.42) ** 1.5);
    const y0 = Math.round(cy - top);
    const y1 = Math.round(cy + bot);
    for (let y = y0; y <= y1; y++) {
      const r = (y - y0) / Math.max(1, y1 - y0);
      put(g, x, y, t > 0.9 ? 'n' : r < 0.34 ? 'g' : r < 0.72 ? 'm' : 'd');
    }
  }
  for (let x = 12; x < 44; x += 6) put(g, x, cy, 'd'); // panel lines
  rect(g, 25, cy + 1, 31, cy + 2, 'k'); // intake shadow
  for (let x = 30; x <= 37; x++) { const h = x < 32 || x > 35 ? 1 : 2; for (let k = 0; k < h; k++) put(g, x, cy - 4 - k, 'c'); }
  put(g, 31, cy - 5, 'h'); put(g, 32, cy - 5, 'h');
  rect(g, 5, cy - 2, 7, cy + 2, 'k'); // nozzle
  return outline(g);
}
const JET_PAL: Palette = { g: '#eef3f9', m: '#aebfd2', d: '#72879f', n: '#566a82', c: '#36cbea', h: '#cdf7ff', r: '#ff5c7a', k: '#101c2b' };
export const jetSprite = (cls = ''): string => sprite(toRows(jetGrid()), JET_PAL, cls);

// ---------------------------------------------------------------- aircraft carrier
function carrierGrid(): Grid {
  const W = 74;
  const H = 19;
  const g = make(W, H);
  for (let y = 10; y < H - 1; y++) {
    const x0 = 3 + Math.floor((y - 10) / 3);
    const x1 = W - 4 - Math.floor((y - 10) * 1.1);
    for (let x = x0; x <= x1; x++) put(g, x, y, y <= 11 ? 'h' : y <= 14 ? 'b' : 'n');
  }
  for (let x = 3; x < W - 3; x++) put(g, x, 9, x % 8 === 4 ? 'y' : 'd'); // flight deck with dashed centreline
  for (let x = 3; x < W - 3; x++) put(g, x, 10, 'k');
  rect(g, 46, 3, 55, 8, 'b'); // island
  rect(g, 46, 3, 55, 3, 'h');
  for (let x = 47; x <= 54; x += 2) put(g, x, 5, 'c');
  rect(g, 50, 0, 50, 2, 'k'); rect(g, 48, 1, 52, 1, 'k'); // mast and radar
  for (const x0 of [14, 22, 31]) poly(g, [[x0, 8], [x0 + 6, 8], [x0 + 4, 6], [x0 + 1, 6]], 'm'); // parked jets
  rect(g, 8, 8, 10, 8, 'r');
  return outline(g);
}
const CARRIER_PAL: Palette = { k: '#0d1826', d: '#3b4d63', y: '#e2d96f', b: '#667d96', h: '#8095ac', n: '#4a5f78', c: '#4fe3ff', m: '#b4c4d6', r: '#ff5c7a' };
export const carrierSprite = (cls = ''): string => sprite(toRows(carrierGrid()), CARRIER_PAL, cls);

// ---------------------------------------------------------------- fish
function fishGrid(kind: number): Grid {
  const g = make(14, 8);
  const ry = [2.3, 2.8, 2.0][kind % 3];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) {
    const dx = (x - 5.5) / 5.2;
    const dy = (y - 3.5) / ry;
    if (dx * dx + dy * dy <= 1) put(g, x, y, y > 3.5 + ry * 0.35 ? 'l' : 'd');
  }
  poly(g, [[9, 3.5], [14, 0.5], [14, 7], [9.5, 4.5]], 'd'); // tail
  if (kind % 3 !== 2) poly(g, [[3, 1], [7, 1], [5, -1.5]], 'd'); // dorsal fin
  put(g, 2, 3, 'e');
  return g;
}
const lighten = (rgba: string): string => rgba.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)/, (_m, r, gr, b) => `rgba(${Math.min(255, +r + 28)},${Math.min(255, +gr + 36)},${Math.min(255, +b + 44)}`);
export const fishSprite = (kind: number, color: string, cls = ''): string =>
  sprite(toRows(fishGrid(kind)), { d: color, l: lighten(color), e: 'rgba(210,235,255,.85)' }, cls);

// ---------------------------------------------------------------- cloud
function cloudGrid(): Grid {
  const g = make(32, 11);
  const blobs: [number, number, number][] = [[7, 7, 4], [13, 5, 5], [20, 6, 5], [26, 7, 4], [16, 8, 4]];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 32; x++) {
    if (blobs.some(([cx, cy, r]) => (x - cx) ** 2 + ((y - cy) * 1.15) ** 2 <= r * r)) put(g, x, y, y < 4 ? 'w' : y < 7 ? 'l' : 'b');
  }
  return g;
}
export const cloudSprite = (cls = ''): string => sprite(toRows(cloudGrid()), { w: '#ffffff', l: '#dbe9f4', b: '#b9d0e4' }, cls);
