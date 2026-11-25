/** Tiny pixel-art engine: sprites are arrays of strings, one letter per pixel, '.' = empty. */
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

// ---- missile, nose down (tail fins at the top) ----
const MISSILE = [
  'g..k..g',
  'gg.k.gg',
  '.gwkwg.',
  '..wkw..',
  '..wcw..',
  '..wkw..',
  '.gwkwg.',
  'gg.k.gg',
  '..wkw..',
  '..wkw..',
  '..wcw..',
  '..wkw..',
  '..wkw..',
  '..wkw..',
  '..ddd..',
  '..drd..',
  '..ddd..',
  '...d...',
];
const MISSILE_PAL: Palette = { g: '#7f96ad', w: '#dce8f3', k: '#8aa0b6', c: '#4fe3ff', d: '#2a3b50', r: '#ff5c7a' };
export const missileSprite = (cls = ''): string => sprite(MISSILE, MISSILE_PAL, cls);

// ---- fighter jet, side view facing right ----
const JET = [
  '....kk..........................',
  '...kgrk.........................',
  '..kggrgk........................',
  '.kgggggkkkkkkkkkk...............',
  'kggggggggggggggggkkkkk..........',
  'kbbbbbbbgggggggggggcccckk.......',
  '.kkkkkkkkbbbbbbbbbbbbbbbkkkk....',
  '........kkgggggggggggkkk........',
  '..........kkbbbbbbbkk...........',
  '............kkkkkkk.............',
];
const JET_PAL: Palette = { k: '#1d2b3d', g: '#d3dfeb', b: '#8ea3ba', c: '#4fe3ff', r: '#ff5c7a' };
export const jetSprite = (cls = ''): string => sprite(JET, JET_PAL, cls);

// ---- aircraft carrier, built procedurally ----
function carrierRows(): string[] {
  const W = 66;
  const H = 15;
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  for (let x = 40; x < 49; x++) for (let y = 1; y < 6; y++) g[y][x] = y === 2 ? 'c' : 'b'; // island tower
  g[0][44] = 'k'; g[0][45] = 'k'; // radar mast
  for (let x = 2; x < W - 2; x++) g[6][x] = x % 7 === 3 ? 'y' : 'd'; // flight deck with markings
  for (let y = 7; y < H - 1; y++) {
    const inset = Math.floor((y - 7) / 2);
    for (let x = 2 + inset; x < W - 2 - Math.floor(inset / 2); x++) g[y][x] = y === 7 ? 'k' : y % 2 ? 'h' : 'b';
  }
  return g.map((r) => r.join(''));
}
const CARRIER_PAL: Palette = { k: '#101c2b', d: '#3a4b60', y: '#d9d36b', b: '#6a7f96', h: '#556a82', c: '#4fe3ff' };
export const carrierSprite = (cls = ''): string => sprite(carrierRows(), CARRIER_PAL, cls);

// ---- fish silhouettes ----
const FISH_A = ['...dd....', '..dddd..d', '.dddddddd', '..dddd..d', '...dd....'];
const FISH_B = ['....dd...', '..ddddd.d', '.dddddddd', '..ddddd.d', '....dd...'];
const FISH_C = ['..dd.....', '.ddddd..d', 'ddddddddd', '.ddddd..d', '..dd.....'];
export const fishSprite = (kind: number, color: string, cls = ''): string =>
  sprite([FISH_A, FISH_B, FISH_C][kind % 3], { d: color }, cls);

// ---- cloud ----
const CLOUD = [
  '.......wwwww............',
  '.....wwwwwwwww....ww....',
  '...wwwwwwwwwwwwwwwwww...',
  '..wwwwwwwwwwwwwwwwwwww..',
  '.llllllllllllllllllllll.',
];
export const cloudSprite = (cls = ''): string => sprite(CLOUD, { w: '#ffffff', l: '#c3d9e6' }, cls);

/** Enemy surface-to-air missile: the same airframe in hostile colours. */
export const samSprite = (cls = ''): string => sprite(MISSILE, { g: '#9c3d2d', w: '#ffe0a8', k: '#d9603f', c: '#ffb347', d: '#3a1510', r: '#ffffff' }, cls);
