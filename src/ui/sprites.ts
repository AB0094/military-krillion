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

/** The AGM-88 HARM flying level, nose to the right: shaded body, long dark radome, cyan/yellow bands, wings and swept tail fins. */
function harmGrid(): Grid {
  const W = 60;
  const H = 19;
  const cy = 9;
  const g = make(W, H);
  // swept tail fins and mid-body wings first, so the body overlaps their roots
  poly(g, [[0, cy - 8], [6, cy - 8], [12, cy - 3], [4, cy - 3]], 'm');
  poly(g, [[0, cy + 8], [6, cy + 8], [12, cy + 3], [4, cy + 3]], 'd');
  poly(g, [[2, cy - 8], [4, cy - 8], [8, cy - 3], [6, cy - 3]], 'w'); // fin leading highlight
  poly(g, [[24, cy - 3], [39, cy - 3], [34, cy - 8], [29, cy - 8]], 'm');
  poly(g, [[24, cy + 3], [39, cy + 3], [34, cy + 8], [29, cy + 8]], 'd');
  rect(g, 29, cy - 8, 34, cy - 8, 'w'); // wing edge highlight
  // body: seven shaded rows
  const rows = ['w', 'w', 'l', 'm', 'm', 'd', 's'];
  for (let x = 4; x <= 46; x++) rows.forEach((c, i) => put(g, x, cy - 3 + i, c));
  // joints between motor, control and guidance sections
  for (const x of [14, 24, 40]) rect(g, x, cy - 3, x, cy + 3, 'k');
  // motor: exhaust collar and glowing nozzle
  rect(g, 4, cy - 3, 6, cy + 3, 'd'); rect(g, 2, cy - 2, 3, cy + 2, 'k'); rect(g, 3, cy - 1, 3, cy + 1, 'o');
  // bands: cyan guidance, yellow warning, red stripe
  rect(g, 16, cy - 3, 17, cy + 3, 'c'); rect(g, 42, cy - 3, 43, cy + 3, 'c');
  rect(g, 20, cy - 3, 20, cy + 3, 'y'); rect(g, 21, cy - 3, 21, cy + 3, 'y');
  rect(g, 9, cy - 3, 9, cy + 3, 'r');
  // rivets / panel detail
  for (let x = 28; x <= 38; x += 3) put(g, x, cy - 1, 'd');
  rect(g, 44, cy - 2, 46, cy - 1, 'n'); // antenna window
  // long ogive nose: dark radome with a lit top edge and a red tip
  for (let x = 47; x <= 59; x++) {
    const t = (x - 47) / 13;
    const hh = 3.2 * (1 - t ** 1.6);
    const y0 = Math.round(cy - hh);
    const y1 = Math.round(cy + hh);
    for (let y = y0; y <= y1; y++) put(g, x, y, x >= 57 ? 'r' : y === y0 ? 'h' : y === y1 ? 'k' : 'n');
  }
  return outline(g);
}
const HARM_PAL: Palette = { w: '#ffffff', l: '#e4edf6', m: '#bccbda', d: '#8398ae', s: '#5f7289', n: '#2d3b50', h: '#6d86a4', r: '#ff4a6a', c: '#4fe3ff', y: '#ffd84a', o: '#ffb347', k: '#0e1826' };
export const harmSprite = (cls = ''): string => sprite(toRows(harmGrid()), HARM_PAL, cls);

// ---------------------------------------------------------------- the APFSDS dart, nose to the right
function dartGrid(): Grid {
  const W = 66;
  const H = 13;
  const cy = 6;
  const g = make(W, H);
  // stabiliser fins
  poly(g, [[0, cy - 5], [5, cy - 5], [14, cy - 1], [6, cy - 1]], 'm');
  poly(g, [[0, cy + 5], [5, cy + 5], [14, cy + 1], [6, cy + 1]], 'd');
  poly(g, [[1, cy - 5], [3, cy - 5], [8, cy - 1], [6, cy - 1]], 'w');
  // long tungsten rod, three shaded rows, then a ballistic-cap point
  for (let x = 6; x <= 50; x++) { put(g, x, cy - 1, 'w'); put(g, x, cy, 'm'); put(g, x, cy + 1, 'd'); }
  for (let x = 12; x <= 46; x += 11) { put(g, x, cy - 1, 'k'); put(g, x, cy, 'k'); put(g, x, cy + 1, 'k'); } // sabot-groove bands
  rect(g, 15, cy - 1, 15, cy + 1, 'y');
  for (let x = 51; x <= 63; x++) {
    const t = (x - 51) / 13;
    const hh = 1.6 * (1 - t ** 1.3);
    const y0 = Math.round(cy - hh);
    const y1 = Math.round(cy + hh);
    for (let y = y0; y <= y1; y++) put(g, x, y, x >= 61 ? 'a' : y === y0 ? 'l' : 'n');
  }
  rect(g, 4, cy - 1, 6, cy + 1, 'k'); // tail base
  put(g, 3, cy, 'o'); put(g, 2, cy, 'o');
  return outline(g);
}
const DART_PAL: Palette = { w: '#f1f6fb', l: '#d6e0ea', m: '#aab7c6', d: '#6f7f92', n: '#3a4656', a: '#ff6a3a', y: '#ffd84a', o: '#ffb347', k: '#0e1826' };
export const dartSprite = (cls = ''): string => sprite(toRows(dartGrid()), DART_PAL, cls);

// ---------------------------------------------------------------- tanks (side view, facing right; enemies are mirrored)
export interface TankSpec {
  name: string;
  country: string;
  len: number;
  turret: 'round' | 'angular' | 'flat' | 'rear';
  gun: number;
  skirt: boolean;
  era: boolean;
  scheme: 'sand' | 'olive' | 'green' | 'grey';
}
/** A different model per distance. The first seven are the first lap; the rest appear past 7,000 m. */
export const TANK_MODELS: readonly TankSpec[] = [
  { name: 'T-55', country: 'USSR', len: 40, turret: 'round', gun: 22, skirt: false, era: false, scheme: 'olive' },
  { name: 'M60 Patton', country: 'USA', len: 44, turret: 'round', gun: 24, skirt: false, era: false, scheme: 'green' },
  { name: 'T-72B3', country: 'Russia', len: 42, turret: 'round', gun: 24, skirt: false, era: true, scheme: 'green' },
  { name: 'Leopard 2A6', country: 'Germany', len: 48, turret: 'angular', gun: 28, skirt: true, era: false, scheme: 'olive' },
  { name: 'M1A2 Abrams', country: 'USA', len: 50, turret: 'flat', gun: 28, skirt: true, era: false, scheme: 'sand' },
  { name: 'Challenger 2', country: 'UK', len: 50, turret: 'flat', gun: 28, skirt: true, era: true, scheme: 'olive' },
  { name: 'K2 Black Panther', country: 'South Korea', len: 50, turret: 'angular', gun: 30, skirt: true, era: true, scheme: 'grey' },
  { name: 'Merkava Mk.4', country: 'Israel', len: 48, turret: 'rear', gun: 26, skirt: true, era: false, scheme: 'sand' },
  { name: 'T-90M', country: 'Russia', len: 44, turret: 'round', gun: 26, skirt: true, era: true, scheme: 'green' },
  { name: 'Type 99A', country: 'China', len: 50, turret: 'angular', gun: 28, skirt: true, era: true, scheme: 'olive' },
  { name: 'Leclerc', country: 'France', len: 48, turret: 'flat', gun: 28, skirt: false, era: false, scheme: 'sand' },
];
export const tankModel = (k: number): TankSpec => TANK_MODELS[(Math.max(1, k) - 1) % TANK_MODELS.length];
/** The player's own tank: no gun in the sprite, because the barrel is a separate element that elevates and recoils. */
export const PLAYER_TANK: TankSpec = { name: 'MBT', country: '', len: 54, turret: 'flat', gun: 0, skirt: true, era: false, scheme: 'olive' };
const SCHEMES: Record<TankSpec['scheme'], Palette> = {
  sand: { m: '#b9a46e', l: '#d8c791', d: '#8b7a4e', s: '#a18f5a' },
  olive: { m: '#6e7d4c', l: '#8da066', d: '#4a5833', s: '#5d6c3f' },
  green: { m: '#5a734b', l: '#78946a', d: '#3d5034', s: '#4b6140' },
  grey: { m: '#7d8993', l: '#9fabb6', d: '#56616b', s: '#69747e' },
};
const TANK_BASE: Palette = { k: '#10171e', g: '#c8d0d8', e: '#a5584a', h: '#e8f0f5', o: '#ffb347' };

const GY = 25; // ground row
function tankGrid(t: TankSpec): Grid {
  const { len, gun } = t;
  const W = len + gun + 6;
  const g = make(W, 27);
  rect(g, 2, GY - 5, len - 1, GY - 1, 'k'); // track band
  for (let x = 4; x < len - 3; x += 4) { rect(g, x, GY - 4, x + 2, GY - 2, 'd'); put(g, x + 1, GY - 3, 'g'); }
  poly(g, [[1, GY - 6], [len, GY - 6], [len, GY - 9], [len - 8, GY - 13], [4, GY - 13], [1, GY - 10]], 'm'); // hull
  rect(g, 4, GY - 13, len - 9, GY - 12, 'l');
  rect(g, 1, GY - 7, len - 1, GY - 6, 's');
  if (t.skirt) { rect(g, 5, GY - 10, len - 3, GY - 6, 's'); for (let x = 9; x < len - 3; x += 6) rect(g, x, GY - 10, x, GY - 6, 'd'); rect(g, 5, GY - 10, len - 3, GY - 10, 'l'); }
  if (t.era) for (let x = len - 7; x < len - 1; x += 2) { put(g, x, GY - 10 - Math.floor((len - 1 - x) / 3), 'e'); put(g, x, GY - 9, 'e'); }
  const rear = t.turret === 'rear';
  const x0 = Math.round(len * (rear ? 0.12 : 0.3));
  const x1 = Math.round(len * (rear ? 0.62 : 0.8));
  if (rear) poly(g, [[len - 16, GY - 13], [len, GY - 9], [len, GY - 11], [len - 9, GY - 15]], 'm'); // sloped front engine deck
  if (t.turret === 'round') poly(g, [[x0, GY - 13], [x1, GY - 13], [x1 - 2, GY - 18], [x1 - 6, GY - 20], [x0 + 6, GY - 20], [x0 + 2, GY - 17]], 'm');
  else if (t.turret === 'angular') { poly(g, [[x0, GY - 13], [x1 + 3, GY - 13], [x1, GY - 18], [x1 - 3, GY - 20], [x0 + 1, GY - 20]], 'm'); rect(g, x0 - 3, GY - 19, x0 + 1, GY - 14, 's'); }
  else if (t.turret === 'flat') { poly(g, [[x0, GY - 13], [x1, GY - 13], [x1 - 1, GY - 20], [x0 + 2, GY - 20], [x0 - 2, GY - 17]], 'm'); rect(g, x0 - 4, GY - 19, x0, GY - 14, 's'); }
  else poly(g, [[x0, GY - 13], [x1, GY - 13], [x1 - 2, GY - 17], [x1 - 8, GY - 20], [x0, GY - 20]], 'm');
  rect(g, x0 + 3, GY - 20, x1 - 5, GY - 19, 'l'); // lit roof
  rect(g, x0, GY - 14, x1 - 1, GY - 13, 'd');
  rect(g, x0 + 5, GY - 22, x0 + 8, GY - 21, 'k'); put(g, x0 + 6, GY - 22, 'h'); // commander hatch
  rect(g, x0 + 2, GY - 25, x0 + 2, GY - 21, 'k'); // antenna
  if (t.era && t.turret !== 'round') rect(g, x1 - 2, GY - 19, x1 + 2, GY - 15, 'e');
  if (gun) {
    const gy0 = GY - 16;
    rect(g, x1 - 1, gy0 - 2, x1 + 1, gy0 + 3, 's'); // mantlet
    rect(g, x1 + 2, gy0, x1 + gun, gy0 + 1, 'd'); rect(g, x1 + 2, gy0, x1 + gun, gy0, 'm');
    rect(g, x1 + Math.round(gun * 0.55), gy0 - 1, x1 + Math.round(gun * 0.55) + 3, gy0 + 2, 'd'); // fume extractor
    rect(g, x1 + gun - 2, gy0 - 1, x1 + gun, gy0 + 2, 'k'); // muzzle
  }
  return outline(g);
}
const mirror = (g: Grid): Grid => g.map((r) => [...r].reverse());
const tankPal = (t: TankSpec): Palette => ({ ...TANK_BASE, ...SCHEMES[t.scheme] });
/** An enemy range target: unoccupied, facing left towards the incoming round. */
export const tankSprite = (t: TankSpec, cls = ''): string => sprite(toRows(mirror(tankGrid(t))), tankPal(t), cls);
/** The firing tank's hull and turret (facing right) plus where the gun pivots, in sprite cells. */
export function playerTank(): { svg: string; pivot: { x: number; y: number }; cells: { w: number; h: number } } {
  const t = PLAYER_TANK;
  const g = tankGrid(t);
  const x1 = Math.round(t.len * 0.8);
  return { svg: sprite(toRows(g), tankPal(t), ''), pivot: { x: x1 + 3, y: GY - 16 + 1 + 1 }, cells: { w: g[0].length, h: g.length } };
}

/** Enemy surface-to-air missile: the same airframe in hostile colours. */
export const samSprite = (cls = ''): string =>
  sprite(toRows(missileGrid()), { w: '#ffe3b0', m: '#e8924f', d: '#a8472f', n: '#3a1510', r: '#ffffff', c: '#ffd24a', k: '#2a0c08' }, cls);

// ---------------------------------------------------------------- carrier aircraft: twin-tail heavy fighter, side view facing right
function jetGrid(): Grid {
  const W = 62;
  const H = 25;
  const cy = 13;
  const g = make(W, H);
  poly(g, [[14, cy - 3], [28, cy - 3], [24, cy - 11], [19, cy - 11]], 'd'); // far fin
  poly(g, [[7, cy - 3], [22, cy - 3], [16, cy - 13], [10, cy - 13]], 'm'); // near fin
  rect(g, 11, cy - 13, 14, cy - 11, 'r');
  poly(g, [[5, cy + 1], [17, cy + 1], [11, cy + 6], [2, cy + 6]], 'd'); // stabilator
  poly(g, [[25, cy + 2], [48, cy + 2], [37, cy + 10], [29, cy + 10]], 'm'); // swept wing
  rect(g, 33, cy + 9, 37, cy + 10, 'r');
  // fuselage with a long tapered nose
  for (let x = 4; x <= 58; x++) {
    const t = (x - 4) / 54;
    const k = t < 0.62 ? 0 : ((t - 0.62) / 0.38) ** 1.4;
    const top = 4 * (1 - k);
    const bot = 3 * (1 - k);
    const y0 = Math.round(cy - top);
    const y1 = Math.round(cy + bot);
    for (let y = y0; y <= y1; y++) {
      const r = (y - y0) / Math.max(1, y1 - y0);
      put(g, x, y, t > 0.93 ? 'n' : r < 0.3 ? 'g' : r < 0.7 ? 'm' : 'd');
    }
  }
  for (let x = 10; x < 50; x += 7) put(g, x, cy, 'd'); // panel lines
  rect(g, 28, cy, 36, cy + 3, 'k'); rect(g, 28, cy - 1, 36, cy - 1, 'd'); // intake
  for (let x = 40; x <= 49; x++) { const hh = x < 42 || x > 47 ? 1 : 2; for (let k = 0; k < hh; k++) put(g, x, cy - 5 - k + (x > 47 ? 1 : 0), 'c'); } // canopy
  put(g, 43, cy - 6, 'h'); put(g, 44, cy - 6, 'h');
  rect(g, 3, cy - 3, 5, cy + 3, 'k'); rect(g, 3, cy, 4, cy, 'h'); // twin nozzles
  rect(g, 27, cy + 4, 31, cy + 5, 'd'); // weapons pylon
  return outline(g);
}
const JET_PAL: Palette = { g: '#e6ecd9', m: '#9fae98', d: '#66775f', n: '#3d4d45', c: '#36cbea', h: '#cdf7ff', r: '#ff5c7a', k: '#101c2b' };
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
