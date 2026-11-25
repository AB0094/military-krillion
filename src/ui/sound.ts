const PREF = 'military-krillion:sound';
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(PREF) === 'off'; } catch { return false; } })();

export const isMuted = (): boolean => muted;

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(PREF, m ? 'off' : 'on'); } catch { /* preference just won't persist */ }
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.05): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function sweep(f0: number, f1: number, at: number, dur: number, type: OscillatorType = 'sawtooth', vol = 0.04): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.12, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(at: number, dur: number, vol = 0.08): void {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.value = vol;
  src.connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + at);
}

export type Cue = 'launch' | 'hit' | 'rare' | 'miss' | 'tier' | 'splash' | 'tick' | 'whoosh' | 'boom' | 'alarm' | 'engine' | 'roar' | 'drag' | 'milestone' | 'ping' | 'crash' | 'release' | 'ignite';

/** Short synthesized cues. Safe to call anywhere: silently does nothing if muted or audio is unavailable. */
export function play(cue: Cue): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    switch (cue) {
      case 'launch': tone(300, 0, 0.18, 'sawtooth', 0.03); tone(620, 0.05, 0.2, 'sawtooth', 0.025); break;
      case 'hit': tone(523, 0, 0.12); tone(659, 0.1, 0.2); break;
      case 'rare': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.06)); break;
      case 'miss': tone(150, 0, 0.3, 'square', 0.03); tone(110, 0.12, 0.3, 'square', 0.03); break;
      case 'splash': tone(220, 0, 0.25, 'sawtooth', 0.03); tone(130, 0.05, 0.3, 'square', 0.025); tone(90, 0.12, 0.35, 'sine', 0.05); break;
      case 'tick': tone(920, 0, 0.05, 'square', 0.025); break;
      case 'whoosh': noise(0, 0.55, 0.05); tone(320, 0, 0.5, 'sawtooth', 0.012); break;
      case 'boom': noise(0, 1.2, 0.2); tone(75, 0, 0.7, 'sawtooth', 0.09); tone(45, 0.05, 0.9, 'sine', 0.12); break;
      case 'engine': sweep(60, 340, 0, 1.5, 'sawtooth', 0.05); sweep(120, 700, 0.1, 1.4, 'triangle', 0.025); noise(0.2, 1.2, 0.03); break;
      case 'roar': noise(0, 2.6, 0.09); sweep(220, 900, 0, 2.6, 'sawtooth', 0.04); break;
      case 'drag': sweep(300, 70, 0, 0.7, 'sawtooth', 0.07); noise(0, 0.4, 0.08); break;
      case 'release': tone(180, 0, 0.12, 'square', 0.06); noise(0.02, 0.2, 0.06); tone(90, 0.05, 0.25, 'sine', 0.08); break;
      case 'ignite': noise(0, 1.1, 0.14); sweep(160, 1100, 0, 0.9, 'sawtooth', 0.06); tone(60, 0, 0.5, 'sine', 0.1); break;
      case 'ping': tone(1320, 0, 0.12, 'sine', 0.04); tone(1760, 0.14, 0.2, 'sine', 0.035); break;
      case 'milestone': [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.055)); tone(1047, 0.5, 0.6, 'sine', 0.05); break;
      case 'crash': noise(0, 1.8, 0.24); sweep(240, 40, 0, 1.4, 'sawtooth', 0.1); tone(48, 0.05, 1.1, 'sine', 0.14); break;
      case 'alarm': [0, 0.28, 0.56].forEach((t) => { tone(1040, t, 0.12, 'square', 0.03); tone(780, t + 0.13, 0.12, 'square', 0.03); }); break;
      case 'tier': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, 'triangle', 0.06)); break;
    }
  } catch { /* audio blocked or unsupported */ }
}

/** Rarity reveal: each rank sounds bigger than the last. */
export function playRank(rank: number): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const scales = [[440], [523, 659], [523, 659, 784], [440, 554, 659, 880], [392, 494, 587, 784, 988], [523, 659, 784, 1047, 1319, 1568], [392, 523, 659, 784, 1047, 1319, 1568, 2093]];
    const notes = scales[Math.min(rank, 6)];
    notes.forEach((f, i) => tone(f, i * (0.085 - rank * 0.004), 0.22 + rank * 0.05, rank >= 4 ? 'triangle' : 'sine', 0.04 + rank * 0.006));
    if (rank >= 4) noise(0, 0.5, 0.05 + (rank - 4) * 0.03);
    if (rank >= 6) { tone(60, 0, 1.2, 'sine', 0.16); sweep(200, 2400, 0.1, 1.2, 'triangle', 0.05); }
  } catch { /* audio blocked */ }
}
