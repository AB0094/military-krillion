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

export type Cue = 'launch' | 'hit' | 'rare' | 'miss' | 'tier' | 'splash' | 'tick' | 'whoosh' | 'boom' | 'gain';

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
      case 'gain': [660, 880, 1320].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.06)); break;
      case 'tier': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, 'triangle', 0.06)); break;
    }
  } catch { /* audio blocked or unsupported */ }
}
