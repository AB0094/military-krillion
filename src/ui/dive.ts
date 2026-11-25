import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession, submitAnswer, type PlayContext } from '../logic/progress';
import { MIN_CROWD, TIERS, crossedTier, depthMeters, depthPoints, formatMeters, rarity, rarityLabel, rarityRank, rarityTier, tierIndex } from '../logic/scoring';
import { START_LIVES, START_SPEED, speedFactor } from '../logic/endless';
import { milestone, milestonesCrossed, nextMilestone } from '../logic/milestones';
import { QUESTION_SECONDS, isLow, secondsLeft } from '../logic/timer';
import type { AnswerRecord, AnswerStats, Prompt } from '../logic/types';
import type { EnvId } from '../logic/environments';
import { ENVIRONMENTS } from '../logic/environments';
import { esc, on, runTitle, type App, type View } from './dom';
import { burst, reducedMotion } from './fx';
import { pickEnvironment } from './envpick';
import { CRUISE, createHorizon, type Horizon } from './horizon';
import { playExplosion, shockwave, smokeColumns, wreckage } from './explosion';
import { RARITY_COLORS, showRarity } from './rarity';
import { play } from './sound';
import { dartSprite, harmSprite, jetSprite, playerTank, samSprite, tankModel, tankSprite } from './sprites';

type DiveView = Extract<View, { name: 'dive' }>;

/** A point-in-time view of a run, whatever kind of run it is. */
export interface Snapshot {
  index: number;
  /** Sum of rarity so far: points = depth x 100. */
  depth: number;
  /** Metres flown. For Limited/Unlimited this is points x 10; in Endless it is scaled by speed. */
  distance: number;
  /** km/h. Only Endless changes it. */
  speed: number;
  answers: readonly AnswerRecord[];
  lives: number;
  streak: number;
  over: boolean;
}

export interface Outcome {
  depth: number;
  distance: number;
  speed: number;
  speedDelta: number;
  answers: readonly AnswerRecord[];
  record: AnswerRecord;
  hint: string | null;
  lives: number;
  streak: number;
  lostLife: boolean;
  over: boolean;
}

/** Everything the scene needs from a run. Limited/Unlimited runs and Endless runs each provide one. */
export interface Game {
  seedKey: string;
  title: string;
  /** 'air' flies a HARM released from a carrier aircraft; 'tank' flies an APFSDS dart fired from a tank. Default air. */
  theme?: 'air' | 'tank';
  endless: boolean;
  /** Prompts per run (fixed) or the endless scale; distance/1000 over this picks the airfield. */
  scale: number;
  snapshot(): Snapshot;
  prompt(index: number): Prompt;
  submit(input: string, timedOut: boolean): Outcome;
  crowd(promptId: string): AnswerStats | undefined;
  finish(): void;
}

/** Limited runs (the daily sets, Ranked, the archive) and Unlimited free runs: a fixed number of questions. */
export function renderDive(app: App, v: DiveView): void {
  const ctx: PlayContext = { date: v.date, mode: v.mode, archive: v.archive, prompts: dailySet(v.date, v.mode, PROMPTS) };
  const total = ctx.prompts.length;
  const session = () => getSession(app.getState(), ctx);
  const s0 = session();
  if (s0?.complete) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);

  const game: Game = {
    seedKey: `${v.archive ? 'archive|' : ''}${v.date}|${v.mode}`, title: runTitle(v), theme: v.mode === 'Ground' ? 'tank' : 'air', endless: false, scale: total,
    snapshot() {
      const s = session();
      const depth = s?.depth ?? 0;
      return { index: s?.answers.length ?? 0, depth, distance: depthMeters(depth), speed: START_SPEED, answers: s?.answers ?? [], lives: START_LIVES, streak: 0, over: !!s?.complete };
    },
    prompt: (i) => ctx.prompts[i],
    submit(input, timedOut) {
      const r = submitAnswer(app.getState(), ctx, input, { timedOut });
      app.setState(r.state);
      return { depth: r.session.depth, distance: depthMeters(r.session.depth), speed: START_SPEED, speedDelta: 0, answers: r.session.answers, record: r.record, hint: r.hint, lives: START_LIVES, streak: 0, lostLife: false, over: r.session.complete };
    },
    crowd: (id) => app.getState().crowd[id],
    finish: () => app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true),
  };
  runScene(app, game, !s0 || s0.answers.length === 0);
}

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The flight scene: a randomly chosen landscape scrolls past a jet that takes off from a military airfield and then flies
 * horizontally, with the HUD, the shared 20-second question timer, distance milestones, DRAG, and (in Endless) the crash.
 */
export function runScene(app: App, game: Game, wantIntro: boolean): void {
  const start = game.snapshot();
  if (start.over) return game.finish();
  const intro = wantIntro && !reducedMotion();
  const env: EnvId = pickEnvironment(game.seedKey);
  const tank = game.theme === 'tank';
  const pt = playerTank();
  const GUN = 30; // barrel length, sprite cells
  const craftSprite = () => (tank ? dartSprite() : harmSprite());
  const envName = ENVIRONMENTS.find((e) => e.id === env)!.name;

  app.root.innerHTML = `<div class="dv env-${env}${tank ? ' tank' : ''}${intro ? ' intro' : ''}" id="dv">
    <div class="dv-stage" id="stage">
      <canvas class="dv-canvas" id="cv"></canvas>
      <div class="dv-jet${tank ? ' tank-car' : ''}" id="carrier">
        ${tank
          ? `<div class="jet-body">${pt.svg}</div><i class="tank-gun" id="gun" style="left:calc(var(--px) * ${pt.pivot.x});top:calc(var(--px) * ${pt.pivot.y - 1})"></i><i class="tank-exh"></i>`
          : `<div class="jet-body">${jetSprite()}</div><i class="gear g1"></i><i class="gear g2"></i><i class="jet-flame"></i><i class="jet-heat"></i>`}
      </div>
      <div class="dv-harm" id="jet">
        <div class="harm-body">${craftSprite()}</div><i class="harm-flame"></i>
      </div>
    </div>
    <div class="speedlines" id="sl"></div><div class="lbx t"></div><div class="lbx b"></div>
    <div class="cockpit" id="cock"><span>KTS <b id="kts">0</b></span><span>RPM <b id="rpm">0</b>%</span><span id="arm">MASTER ARM · SAFE</span></div>
    <div class="ignite" id="ignite"></div>
    <div class="scan"></div><div class="dv-vig"></div>
    <div class="hud">
      <button class="hud-btn" id="home" aria-label="Main menu">≡</button>
      <div class="hud-panel"><span class="lbl">Distance</span><b id="hd">0m</b></div>
      <div class="hud-panel hud-score"><span class="lbl">Score</span><b id="hs">0</b></div>
      ${game.endless ? '<div class="hud-panel hud-speed"><span class="lbl">Speed</span><b id="hv">600</b><small>km/h</small></div>' : ''}
      <div class="hud-mid">
        ${game.endless ? '<div class="lives" id="lives" aria-label="Lives left"></div>' : '<div class="pips" id="pips" aria-hidden="true"></div>'}
        <div class="timer" id="timer"><div class="tbar"><i id="tfill"></i></div><b id="tnum">${QUESTION_SECONDS}</b></div>
        <span class="lbl" id="plabel"></span>
        <span class="lbl mile" id="mile"></span>
      </div>
      <div class="hud-panel hud-tier"><span class="lbl">Airfield</span><b id="ht"></b></div>
    </div>
    <div class="dv-panel px" id="panel"></div>
    <div class="dv-dock" id="dock"></div>
    <div class="dv-intro-msg" id="intromsg">${tank ? 'Armour advance · APFSDS fire · tap to skip' : 'Take-off · HARM release · tap to skip'}</div>
    <div class="callout" id="callout"></div>
  </div>`;

  const $ = <T extends HTMLElement>(sel: string) => app.root.querySelector<T>(sel)!;
  const dv = $('#dv');
  const cv = $<HTMLCanvasElement>('#cv');
  const jet = $('#jet'); // the HARM: the craft the player flies in every mode
  const carrier = $('#carrier'); // the aircraft that carries it off the runway and releases it
  const panel = $('#panel');
  const dock = $('#dock');
  const callout = $('#callout');

  const horizon: Horizon = createHorizon({
    canvas: cv, env, seed: game.seedKey,
    onEvent: (e) => { if (e === 'radar-lit') play('ping'); if (e === 'radar-blast') { play('boom'); shake(500, false); } if (e === 'sun') play('boom'); },
  });
  horizon.start();

  let timerId = 0;
  let autoId = 0;
  let startQuestion: (() => void) | null = null;
  let busy = false; // a crash or take-off owns the scene
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { if (dv.isConnected) fn(); }, ms); timers.push(id); return id; };

  // ---------- jet pose ----------
  let jw = 0;
  let jh = 0;
  const measure = () => { jw = jet.offsetWidth; jh = jet.offsetHeight; };
  const cw = () => carrier.offsetWidth;
  const ch = () => carrier.offsetHeight;
  const pxNow = () => parseFloat(getComputedStyle(carrier).getPropertyValue('--px')) || 3;
  // the tank's muzzle sits this far (CSS px) right of the hull's left edge when the barrel is level
  const muzzleReach = () => (pt.pivot.x + GUN + 1) * pxNow();
  const cruiseXY = () => tank
    ? { x: Math.max(dv.clientWidth * 0.24, muzzleReach() + 70) - jw / 2, y: horizon.groundYCss() - 12 - jh / 2 }
    : { x: dv.clientWidth * 0.24 - jw / 2, y: dv.clientHeight * 0.58 - jh / 2 };
  let pose = { x: 0, y: 0, pitch: 0 };
  function setPose(x: number, y: number, pitch = 0, scale = 1): void {
    pose = { x, y, pitch };
    jet.style.transform = `translate(${x}px,${y}px) rotate(${pitch}deg) scale(${scale})`;
    horizon.setJet(x + jw / 2, y + jh, true);
  }
  const jetCenter = () => ({ x: pose.x + jw / 2, y: pose.y + jh / 2 });
  const cruiseSpeed = (kmh: number) => CRUISE * speedFactor(kmh);

  // ---------- hud ----------
  function tween(el: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string): void {
    if (reducedMotion() || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      if (!el.isConnected) return;
      const u = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(Math.round(lerp(from, to, 1 - (1 - u) ** 3)));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function hud(depth: number, dist: number, answers: readonly AnswerRecord[], index: number, lives: number, streak: number, speed: number): void {
    if (!dv.isConnected) return;
    $('#hd').textContent = formatMeters(dist);
    $('#hs').textContent = String(depthPoints(depth));
    if (game.endless) {
      $('#lives').innerHTML = Array.from({ length: START_LIVES }, (_, i) => `<i class="life${i < lives ? '' : ' lost'}">${craftSprite()}</i>`).join('');
      $('#hv').textContent = String(Math.round(speed));
      $('#plabel').textContent = `${game.title} · question ${index + 1} · streak ${streak}`;
      dv.classList.toggle('low', lives === 1);
    } else {
      $('#pips').innerHTML = Array.from({ length: game.scale }, (_, i) => `<i class="pip ${i < answers.length ? (answers[i].matched ? 'hit' : 'miss') : i === answers.length ? 'now' : ''}"></i>`).join('');
      $('#plabel').textContent = `${game.title} · prompt ${Math.min(index + 1, game.scale)} of ${game.scale}`;
    }
    const idx = tierIndex(dist / 1000, game.scale);
    $('#ht').textContent = `${TIERS[idx].flag} ${TIERS[idx].name}`;
    const nm = nextMilestone(dist);
    $('#mile').textContent = `${envName} · next: ${nm.name} ${formatMeters(nm.meters)}`;
  }

  // ---------- small effects ----------
  const target = () => jetCenter();

  function burstAt(x: number, y: number, count: number, color: string): void {
    const a = document.createElement('i');
    a.className = 'anchor';
    a.style.cssText = `left:${x}px;top:${y}px`;
    dv.appendChild(a);
    burst(dv, a, count, color);
    setTimeout(() => a.remove(), 60);
  }

  function pop(text: string, bad = false): void {
    const el = document.createElement('span');
    el.className = `pop${bad ? ' bad' : ''}`;
    el.textContent = text;
    const t = target();
    el.style.cssText = `left:${t.x}px;top:${t.y - 56}px`;
    dv.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function shake(ms: number, big: boolean): void {
    const cls = big ? 'shake-big' : 'shake';
    dv.classList.add(cls);
    setTimeout(() => dv.classList.remove(cls), ms);
  }

  function flash(): void {
    const el = document.createElement('div');
    el.className = 'flash';
    dv.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function showCallout(title: string, sub: string, kind = ''): void {
    callout.className = `callout show ${kind}`;
    callout.innerHTML = `<small>${esc(sub)}</small><b>${esc(title)}</b>`;
    void callout.offsetWidth;
    callout.className = `callout show on ${kind}`;
    later(() => { callout.classList.remove('on'); }, 2600);
  }

  function smoke(n: number, dark = true): void {
    const t = target();
    horizon.emit(t.x - jw * 0.45, t.y + 4, { n, color: dark ? ['#2b2b2e', '#3c3c40', '#55555a'] : ['#ffffff', '#dfe6ec'], size: 3, vx: -40, vy: -8, spread: 30, life: 1.6 });
  }

  /** Enemy radar lock: the screen goes red and an alarm sounds before any missile is launched. */
  function lockWarning(): void {
    play('alarm');
    dv.classList.add('alert');
    const el = document.createElement('div');
    el.className = 'lockwarn';
    el.textContent = 'Missile lock';
    dv.appendChild(el);
    setTimeout(() => { dv.classList.remove('alert'); el.remove(); }, 1100);
  }

  /** A hostile missile streaks in from below, leaving smoke. `miss` flies past; `hit` strikes the jet. */
  function samFlight(kind: 'miss' | 'hit', delay: number, onHit?: () => void): void {
    if (reducedMotion()) { if (kind === 'hit') setTimeout(() => onHit?.(), delay); return; }
    const W = dv.clientWidth;
    const H = dv.clientHeight;
    const { x: tx, y: ty } = target();
    const fromLeft = Math.random() < 0.5;
    const sx = fromLeft ? -30 : W + 30;
    const sy = H + 30;
    const len = Math.hypot(tx - sx, ty - sy);
    const ux = (tx - sx) / len;
    const uy = (ty - sy) / len;
    let ex = tx;
    let ey = ty;
    const side = fromLeft ? 1 : -1;
    if (kind === 'miss') {
      const off = 190 + Math.random() * 70;
      ex = tx + -uy * off * side + ux * 900;
      ey = ty + ux * off * side + uy * 900;
    }
    const ang = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI - 90;
    const el = document.createElement('div');
    el.className = 'sam';
    el.innerHTML = samSprite();
    dv.appendChild(el);
    const dur = kind === 'hit' ? 950 : 1250;
    const a = el.animate([
      { transform: `translate(${sx}px,${sy}px) translate(-50%,-50%) rotate(${ang}deg)` },
      { transform: `translate(${ex}px,${ey}px) translate(-50%,-50%) rotate(${ang}deg)` },
    ], { delay, duration: dur, easing: 'cubic-bezier(.45,0,.9,.6)', fill: 'both' });
    a.onfinish = () => { el.remove(); if (kind === 'hit') onHit?.(); };
    for (let i = 1; i <= 14; i++) {
      const f = i / 14;
      setTimeout(() => {
        if (!dv.isConnected) return;
        const q = document.createElement('i');
        q.className = 'trail';
        q.style.cssText = `left:${sx + (ex - sx) * f * f}px;top:${sy + (ey - sy) * f * f}px`;
        dv.appendChild(q);
        setTimeout(() => q.remove(), 900);
      }, delay + dur * f);
    }
    if (kind === 'miss') {
      setTimeout(() => {
        if (!dv.isConnected) return;
        const now = target();
        const px = now.x + -uy * side * 84;
        const py = now.y + ux * side * 84;
        playExplosion(dv, px, py, { px: 4, frames: 9, size: 17, seed: 11 + Math.floor(Math.random() * 40) });
        shockwave(dv, px, py, 70);
      }, delay + dur * (len / (len + 900)) * 1.12);
    }
  }

  // ---------- DRAG ----------
  function showDrag(delta: number): void {
    play('drag');
    const el = document.createElement('div');
    el.className = 'dragfx';
    el.innerHTML = `<span class="chevs">‹‹‹ ‹‹‹ ‹‹‹</span><b>DRAG</b><small>${Math.round(delta)} km/h</small>`;
    dv.appendChild(el);
    setTimeout(() => el.remove(), 2200);
    jet.classList.add('jolt');
    setTimeout(() => jet.classList.remove('jolt'), 900);
    dv.classList.add('dragging');
    setTimeout(() => dv.classList.remove('dragging'), 1800);
    shake(420, false);
    smoke(14);
    $('#hv')?.parentElement?.classList.add('bad');
    setTimeout(() => $('#hv')?.parentElement?.classList.remove('bad'), 1400);
  }

  // ---------- Endless: the loss ----------
  function crash(done: () => void): void {
    busy = true;
    stopTimer();
    lockWarning();
    const hit = () => {
      if (!dv.isConnected) return;
      const c = target();
      play('boom');
      flash();
      shake(700, true);
      playExplosion(dv, c.x, c.y, { px: 5, frames: 12, size: 21, seed: 9 });
      shockwave(dv, c.x, c.y, 50);
      burstAt(c.x, c.y, 28, 'var(--gold)');
      jet.classList.add('burning', 'jolt');
      showCallout(tank ? 'Penetrator deflected' : 'Motor failure', tank ? 'Round lost' : 'Mayday', 'bad');
      showDrag(-190);
      const fire = window.setInterval(() => {
        if (!dv.isConnected) return window.clearInterval(fire);
        const p = target();
        horizon.emit(p.x - jw * 0.35, p.y, { n: 3, color: ['#ff8a2a', '#ffd84a', '#e0322f'], size: 3, vx: -50, vy: -10, spread: 30, life: 0.6 });
        horizon.emit(p.x - jw * 0.4, p.y, { n: 3, color: ['#2b2b2e', '#3c3c40', '#55555a'], size: 4, vx: -70, vy: -14, spread: 30, life: 1.6 });
      }, 70);
      later(() => { window.clearInterval(fire); descend(fire, done); }, 1100);
    };
    later(() => { play('whoosh'); samFlight('hit', 480, hit); }, 950);
  }

  function descend(fire: number, done: () => void): void {
    jet.classList.add('burning');
    const W = dv.clientWidth;
    const H = dv.clientHeight;
    const x0 = pose.x;
    const y0 = pose.y;
    const impactWorldY = horizon.groundYCss() + 0 - jh * 0.35;
    const x1 = Math.min(W - jw - 20, x0 + W * 0.2);
    const camMax = Math.max(0, (impactWorldY - H * 0.64) / horizon.scale);
    const t0 = performance.now();
    const DUR = 2500;
    horizon.setSpeed(40);
    const fireId = window.setInterval(() => {
      if (!dv.isConnected) return window.clearInterval(fireId);
      const p = target();
      horizon.emit(p.x - jw * 0.3, p.y, { n: 4, color: ['#ff8a2a', '#ffd84a', '#e0322f'], size: 3, vx: -60, vy: -16, spread: 36, life: 0.55 });
      horizon.emit(p.x - jw * 0.35, p.y, { n: 4, color: ['#222226', '#3a3a3e', '#55555a'], size: 4, vx: -80, vy: -20, spread: 36, life: 1.8 });
    }, 55);
    showCallout('Going down', 'Mayday', 'bad');
    play('alarm');
    const step = (now: number) => {
      if (!dv.isConnected) return window.clearInterval(fireId);
      const u = Math.min(1, (now - t0) / DUR);
      const e = u ** 2.1;
      const camNow = camMax * easeInOut(u);
      horizon.setCam(camNow, true);
      const worldY = lerp(y0, impactWorldY, e);
      setPose(lerp(x0, x1, u), worldY - camNow * horizon.scale, 6 + 56 * u);
      if (u < 1) { requestAnimationFrame(step); return; }
      window.clearInterval(fireId);
      impact(done);
    };
    requestAnimationFrame(step);
    void fire;
  }

  function impact(done: () => void): void {
    const c = target();
    jet.style.visibility = 'hidden';
    horizon.setJet(0, 0, false);
    horizon.setSpeed(0);
    play('crash');
    flash();
    shake(1500, true);
    const gy = horizon.groundYCss();
    horizon.boomAt(c.x, gy - 40, 3.6);
    playExplosion(dv, c.x, gy - 50, { px: 11, frames: 14, size: 27, seed: 3 });
    later(() => playExplosion(dv, c.x - 90, gy - 24, { px: 6, frames: 11, size: 21, seed: 21 }), 220);
    later(() => playExplosion(dv, c.x + 80, gy - 30, { px: 6, frames: 11, size: 21, seed: 34 }), 380);
    shockwave(dv, c.x, gy - 10, 70);
    later(() => shockwave(dv, c.x, gy - 10, 46), 160);
    burstAt(c.x, gy - 40, 44, '#ffffff'); burstAt(c.x, gy - 40, 46, 'var(--gold)'); burstAt(c.x, gy - 40, 36, 'var(--pink)');
    wreckage(dv, c.x, gy - 40, gy);
    smokeColumns(dv, c.x, gy - 20, 12);
    // a big rolling dust cloud along the ground
    for (let k = 0; k < 6; k++) later(() => horizon.emit(c.x, gy - 8, { n: 18, color: ['#c9a66a', '#d8b87a', '#b8955a', '#e6d2a0'], size: 5, vx: (k % 2 ? 1 : -1) * 140, vy: -26, spread: 90, life: 2.8, world: true }), k * 110);
    const fireId = window.setInterval(() => {
      if (!dv.isConnected) return window.clearInterval(fireId);
      horizon.emit(c.x, gy - 14, { n: 3, color: ['#ff8a2a', '#ffd84a', '#e0322f'], size: 3, vy: -34, spread: 24, life: 0.7, world: true });
      horizon.emit(c.x, gy - 22, { n: 2, color: ['#222226', '#3a3a3e', '#55555a'], size: 5, vy: -30, spread: 20, life: 2.6, world: true });
    }, 90);
    showCallout('Crashed', 'Mission over', 'bad');
    const banner = document.createElement('div');
    banner.className = 'intercepted';
    banner.textContent = 'Crashed';
    dv.appendChild(banner);
    setTimeout(() => banner.remove(), 2800);
    later(() => { window.clearInterval(fireId); done(); }, 3000);
  }

  // ---------- the question timer (shared by every mode) ----------
  function stopTimer(): void {
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  function startTimer(onExpire: () => void): void {
    stopTimer();
    const el = $('#timer');
    const fill = $('#tfill');
    const num = $('#tnum');
    const t0 = performance.now();
    let lastSec = QUESTION_SECONDS + 1;
    el.classList.remove('low');
    timerId = window.setInterval(() => {
      if (!dv.isConnected) return stopTimer();
      const left = secondsLeft(t0, performance.now());
      const sec = Math.ceil(left);
      fill.style.width = `${(left / QUESTION_SECONDS) * 100}%`;
      num.textContent = String(sec);
      el.classList.toggle('low', isLow(left));
      if (sec !== lastSec) {
        lastSec = sec;
        if (isLow(left) && sec > 0) play('tick');
      }
      if (left <= 0) { stopTimer(); onExpire(); }
    }, 100);
  }

  // ---------- the question ----------
  function ask(): void {
    window.clearTimeout(autoId);
    const snap = game.snapshot();
    if (snap.over) return game.finish();
    const index = snap.index;
    const prompt = game.prompt(index);
    jet.classList.remove('hit');
    hud(snap.depth, snap.distance, snap.answers, index, snap.lives, snap.streak, snap.speed);
    $('#tfill').style.width = '100%';
    $('#tnum').textContent = String(QUESTION_SECONDS);
    panel.className = `dv-panel px${dv.classList.contains('intro') ? '' : ' swap'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `<p class="plabel">${game.endless ? `Question ${index + 1}` : `Prompt ${index + 1} of ${game.scale}`} · ${prompt.mode}</p>
      <h2 class="prompt">${esc(prompt.text)}</h2>
      ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
      <p class="hintline">▶ rarer answers fly further ◀</p>`;
    dock.innerHTML = `<form id="f" autocomplete="off"><input id="answer" type="text" maxlength="80" placeholder="Type your answer…" autocapitalize="off" spellcheck="false" aria-label="Your answer" /><button class="btn primary" type="submit">Fire</button></form>`;
    const input = $<HTMLInputElement>('#answer');
    let locked = false; // guards against double-submit (Enter + click) and against a late timer firing
    const submitNow = (raw: string, timedOut: boolean) => {
      if (locked || !dv.isConnected || busy) return;
      locked = true;
      stopTimer();
      play('launch');
      const crowdBefore = game.crowd(prompt.id); // the board uses player data as it was when you answered
      const out = game.submit(raw, timedOut);
      reveal(snap, out, raw.trim(), crowdBefore, prompt);
    };
    $<HTMLFormElement>('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) submitNow(input.value, false);
    });
    startQuestion = () => { input.focus(); startTimer(() => submitNow('', true)); };
    if (!dv.classList.contains('intro') && !busy) startQuestion();
  }

  // ---------- the result ----------
  function reveal(before: Snapshot, out: Outcome, typed: string, crowdBefore: AnswerStats | undefined, prompt: Prompt): void {
    const matched = out.record.matched;
    const score = out.record.score;
    const timedOut = out.record.timedOut === true;
    const rank = rarityRank(score);
    const board = [...prompt.answers]
      .map((a) => ({ a, r: rarity(a, crowdBefore, MIN_CROWD) }))
      .sort((x, y) => y.r - x.r)
      .map(({ a, r }, i) => `<li class="${a.name === matched ? 'mine' : ''}" style="--i:${i}"><span class="bn">${esc(a.name)}</span><span class="bar"><i style="--w:${Math.round(r * 100)}%;background:${RARITY_COLORS[rarityRank(r)]}"></i></span><b>${Math.round(r * 100)}</b></li>`)
      .join('');

    let body: string;
    if (matched) {
      body = `<p class="verdict good">✓ ${esc(matched)} <span class="badge badge-r${rank}" title="${rarityTier(score)}">${rarityLabel(score)}</span></p>${out.record.corrected ? `<p class="muted small">Spelling corrected: you typed “${esc(typed)}”.</p>` : ''}<p class="score"><span id="score">+${Math.round(score * 100)}</span> <span class="muted">points</span> <span class="meters" id="metres">+${formatMeters(out.distance - before.distance)}</span></p>`;
    } else {
      const head = timedOut
        ? '<p class="verdict bad">⏱ Time\'s up</p><p class="stamp">Out of time</p>'
        : `<p class="verdict bad"><s>“${esc(typed)}”</s></p><p class="stamp">${game.endless ? 'Wrong answer' : 'Missed'}</p>`;
      body = `${head}<p class="score">+0 <span class="muted">points</span></p><p class="hint">${esc(out.hint ?? '')}</p>`;
    }
    if (game.endless) {
      const n = out.lives;
      if (out.over) body += '<p class="lifeline danger">Last life lost. Your aircraft is going down.</p>';
      else if (out.lostLife) body += `<p class="lifeline danger">DRAG! ${Math.round(out.speedDelta)} km/h. ${n} li${n === 1 ? 'fe' : 'ves'} left.</p>`;
      else if (matched) body += `<p class="lifeline good">${out.speedDelta > 0 ? `+${Math.round(out.speedDelta)} km/h` : 'Full speed'}${out.streak > 1 ? ` · ${out.streak} in a row` : ''}</p>`;
    }

    panel.className = `dv-panel px swap ${matched ? `hit rar-${rank}` : 'miss'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `<p class="plabel">${game.endless ? `Question ${before.index + 1}` : `Prompt ${before.index + 1} of ${game.scale}`} · ${prompt.mode}</p>
      <h2 class="prompt small">${esc(prompt.text)}</h2>
      ${body}
      <h3 class="boardtitle">All valid answers</h3>
      <ul class="board">${board}</ul>
      ${prompt.fact ? `<p class="fact"><strong>Briefing.</strong> ${esc(prompt.fact)}</p>` : ''}`;

    const finishing = !game.endless && out.over;
    const showNext = (label: string, fn: () => void, auto = false) => {
      dock.innerHTML = `<button class="btn primary wide${auto ? ' auto' : ''}" id="next">${label} ▶</button>`;
      on(app.root, '#next', () => { window.clearTimeout(autoId); fn(); });
      $<HTMLButtonElement>('#next').focus();
      if (auto) autoId = window.setTimeout(() => { if (dv.isConnected) { fn(); } }, 3400); // a timed-out question moves on by itself
    };
    dock.innerHTML = '';
    const nextLabel = finishing ? 'See results' : game.endless ? 'Next question' : 'Next prompt';
    const goNext = finishing ? () => game.finish() : ask;

    hud(before.depth, before.distance, before.answers, before.index, before.lives, before.streak, before.speed);
    const after = () => hud(out.depth, out.distance, out.answers, before.index + 1, out.lives, out.streak, out.speed);

    if (matched) {
      const gained = out.distance - before.distance;
      horizon.boost(gained * 0.32);
      horizon.setSpeed(cruiseSpeed(out.speed));
      tween($('#hd'), before.distance, out.distance, 1500, formatMeters);
      tween($('#hs'), depthPoints(before.depth), depthPoints(out.depth), 1200, String);
      jet.classList.add('surge');
      later(() => jet.classList.remove('surge'), 1600);
      later(after, 900);
      showRarity(dv, rank, { shake, flash, burstAt, slowmo: (ms) => { horizon.setTimeScale(0.35); later(() => horizon.setTimeScale(1), ms); }, target });
      play(rank >= 4 ? 'rare' : 'hit');
      // distance milestones: an arcade set piece for every 1,000m passed
      milestonesCrossed(before.distance, out.distance).forEach((k, i) => later(() => {
        const m = milestone(k);
        if (!tank || !['vehicle', 'sam', 'radar'].includes(m.kind)) horizon.milestone(m);
        if (tank) tankTarget(k);
        play('milestone');
        showCallout(m.name, `${formatMeters(m.meters)} · ${m.blurb}`, `ms-${m.kind}`);
      }, 700 + i * 2700));
      const arrived = crossedTier(before.distance / 1000, out.distance / 1000, game.scale);
      if (arrived !== null) later(() => arrive(arrived), 1700);
      showNext(nextLabel, goNext, false);
    } else if (game.endless) {
      if (out.over) {
        crash(() => { after(); game.finish(); });
        dock.innerHTML = '<button class="btn wide" id="skip">Skip ▶</button>';
        on(app.root, '#skip', () => { busy = false; game.finish(); });
      } else {
        lockWarning();
        later(() => { play('whoosh'); samFlight('miss', 0); samFlight('miss', 340); }, 950);
        later(() => { shake(500, false); pop('Near miss!', true); showDrag(out.speedDelta); horizon.setSpeed(cruiseSpeed(out.speed)); after(); }, 1950);
        showNext(nextLabel, goNext, timedOut);
      }
    } else {
      // Limited / Unlimited: no points, and a short stall as the jet is hit by flak
      jet.classList.add('hit');
      smoke(10);
      pop('Missed', true);
      shake(360, false);
      play('miss');
      after();
      showNext(nextLabel, goNext, timedOut && !finishing);
    }
  }

  /** Banner when the jet reaches a deeper airfield tier. */
  function arrive(tierIdx: number): void {
    const t = TIERS[tierIdx];
    const el = document.createElement('div');
    el.className = 'arrival px';
    el.innerHTML = `<span class="aflag">${t.flag}</span><div><div class="alabel">Arrived</div><div class="aname">${esc(t.name)}</div><div class="afield">${esc(t.airfield)}, ${esc(t.country)}</div></div>`;
    dv.appendChild(el);
    play('tier');
    burst(dv, el, 22, 'var(--gold)');
    setTimeout(() => el.remove(), 3400);
  }

  // ---------- opening: the carrier jet takes off with a HARM on its pylon, releases it, and the missile takes over ----------
  function takeoff(onDone: () => void): void {
    busy = true;
    const cruise = cruiseXY();
    const VMAX = 620;
    const t0 = performance.now();
    let finished = false;
    const did: Record<string, boolean> = {};
    let from = { x: 0, y: 0 };
    const kts = $('#kts'); const rpm = $('#rpm'); const arm = $('#arm');
    const cx = dv.clientWidth * 0.24; // the pilot's world column (matches the scenery)
    const rest = () => horizon.runwayYCss() - ch() - 3;
    const airY = () => dv.clientHeight * 0.4; // carrier altitude at release (centre)
    const setCarrier = (x: number, y: number, pitch: number) => {
      carrier.style.transform = `translate(${x - cw() / 2}px,${y}px) rotate(${pitch}deg)`;
      return { x, y, pitch };
    };
    // carried: the HARM hangs under the fuselage, small, and follows the jet
    const hang = (x: number, y: number, pitch: number, drop = 0, scale = 0.7) => {
      pose = { x: x - jw / 2, y: y + ch() * 0.84 - jh / 2 + drop, pitch };
      jet.style.transform = `translate(${pose.x}px,${pose.y}px) rotate(${pitch}deg) scale(${scale})`;
    };
    const stage = $('#stage');
    const zoom = (z: number) => { stage.style.transform = z === 1 ? '' : `scale(${z})`; };
    stage.style.transformOrigin = '24% 78%';
    jet.style.visibility = 'visible';
    jet.classList.add('carried');
    carrier.classList.add('grounded');
    dv.classList.add('cine');
    horizon.setSpeed(0, true);
    horizon.setJet(0, 0, false);
    setCarrier(cx, rest(), 0);
    hang(cx, rest(), 0);

    const finish = () => {
      if (finished) return;
      finished = true;
      dv.classList.remove('intro', 'cine', 'rolling');
      zoom(1);
      jet.classList.remove('carried');
      carrier.style.display = 'none';
      jet.classList.remove('armed');
      jet.classList.add('engine', 'cruise');
      setPose(cruise.x, cruise.y, 0);
      horizon.setSpeed(cruiseSpeed(start.speed));
      busy = false;
      onDone();
    };

    const step = (now: number) => {
      if (finished || !dv.isConnected) return;
      const t = (now - t0) / 1000;
      const r = rest();
      if (t < 1.8) {
        // engine start: spool-up, shudder, heat haze; weapons armed
        if (!did.eng) { did.eng = true; showCallout('Engine start', 'Pre-flight', 'info'); play('engine'); }
        if (t > 0.4 && !did.fl) { did.fl = true; carrier.classList.add('engine', 'shudder'); }
        if (t > 1.0 && !did.arm) { did.arm = true; arm.textContent = 'MASTER ARM · HARM ARMED'; arm.classList.add('on'); showCallout('HARM armed', 'AGM-88 · anti-radiation', 'info'); play('ping'); }
        rpm.textContent = String(Math.round(Math.min(100, (t / 1.6) * 100)));
        const sh = (Math.random() - 0.5) * (t > 0.4 ? 1.2 : 0);
        setCarrier(cx, r + sh, 0); hang(cx, r + sh, 0);
        if (Math.random() < 0.5 && t > 0.5) horizon.emit(cx - cw() * 0.5, horizon.runwayYCss() + 2, { n: 1, color: ['#d8cfb8', '#b9b09a'], size: 3, vx: -60, vy: -10, spread: 20, life: 1.2, world: true });
      } else if (t < 4.7) {
        // take-off roll: brakes off, afterburner, wheels spin, dust, speed climbs
        const u = (t - 1.8) / 2.9;
        zoom(1 + 0.1 * easeInOut(u));
        if (!did.roll) { did.roll = true; dv.classList.add('rolling'); carrier.classList.add('afterburner'); showCallout('Brakes release', 'Take-off roll', 'info'); play('roar'); rpm.textContent = '100'; }
        if (u > 0.55 && !did.v1) { did.v1 = true; showCallout('Rotate', 'V1 · V-R', 'info'); }
        horizon.setSpeed(VMAX * u ** 2.2, true);
        kts.textContent = String(Math.round(170 * u ** 1.3));
        const sh = (Math.random() - 0.5) * 1.5 * (1 - u);
        setCarrier(cx, r + sh, -u * 1.5); hang(cx, r + sh, -u * 1.5);
        horizon.emit(cx - cw() * 0.45, horizon.runwayYCss() + 1, { n: 2, color: ['#d8cfb8', '#b9b09a', '#ffffff'], size: 4, vx: -90, vy: -14, spread: 26, life: 1.4, world: true });
      } else if (t < 6.2) {
        // rotation and climb, gear retracts
        const u = (t - 4.7) / 1.5;
        const e = easeInOut(u);
        if (!did.lift) { did.lift = true; showCallout('Lift-off', 'Positive rate', 'info'); }
        if (u > 0.3 && !did.gear) { did.gear = true; carrier.classList.add('retract'); later(() => carrier.classList.remove('grounded'), 450); showCallout('Gear up', 'Climbing', 'info'); }
        kts.textContent = String(Math.round(lerp(170, 260, e)));
        horizon.setSpeed(lerp(VMAX, CRUISE * 1.3, e), true);
        zoom(1.1 - 0.1 * e);
        const y = lerp(r, airY(), e);
        if (u > 0.2) horizon.emit(cx - cw() * 0.1, y + ch() * 0.78, { n: 1, color: ['#ffffff', '#dfe6ec'], size: 2, vx: -140, vy: 4, spread: 6, life: 0.9 });
        const p = -14 * Math.sin(Math.PI * Math.min(1, u * 1.15));
        setCarrier(cx, y, p); hang(cx, y, p);
      } else if (t < 7.0) {
        // level off, lining up the shot
        const u = (t - 6.2) / 0.8;
        if (!did.lvl) { did.lvl = true; showCallout('Weapon release', 'Stand by', 'info'); }
        kts.textContent = String(Math.round(lerp(260, 420, u)));
        horizon.setSpeed(lerp(VMAX * 0.95, CRUISE, u), true);
        zoom(1);
        dv.classList.remove('rolling');
        const y = airY() + Math.sin(u * 6) * 1.2;
        setCarrier(cx, y, 0); hang(cx, y, 0);
      } else if (t < 7.45) {
        // pylon release: the missile drops clear and noses over
        const u = (t - 7.0) / 0.45;
        if (!did.rel) { did.rel = true; play('release'); showCallout('HARM away', 'Released', 'good'); dv.classList.add('intro-end'); arm.textContent = 'HARM AWAY'; jet.classList.remove('carried'); horizon.emit(cx, airY() + ch() * 0.8, { n: 8, color: ['#ffffff', '#cfd8e0'], size: 3, vx: -30, vy: -20, spread: 24, life: 0.8 }); }
        const y = airY() - 5 * Math.sin(Math.PI * Math.min(1, u * 1.6));
        setCarrier(cx, y, 0);
        hang(cx, y, 4 * u, 8 + 70 * u * u, lerp(0.7, 0.78, u));
      } else if (t < 8.6) {
        // ignition: flash, shockwave, the HARM surges to its cruise position while the carrier banks away
        const u = (t - 7.45) / 1.15;
        const e = easeInOut(u);
        if (!did.ign) {
          did.ign = true; play('ignite'); jet.classList.add('engine', 'surge', 'cruise');
          from = { x: pose.x + jw / 2, y: pose.y + jh / 2 };
          const fl = $('#ignite'); fl.style.cssText = `left:${from.x}px;top:${from.y}px`; fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
          shockwave(dv, from.x, from.y, 56);
          horizon.emit(from.x - jw * 0.4, from.y, { n: 18, color: ['#fff6d0', '#ffd84a', '#ff8a2a'], size: 3, vx: -120, vy: -6, spread: 40, life: 0.8 });
          shake(260, false);
          dv.classList.remove('intro'); panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
        }
        const tx = cruise.x + jw / 2;
        const ty = cruise.y + jh / 2;
        const hx = lerp(from.x, tx, e);
        const hy = lerp(from.y + 0, ty, e);
        setPose(hx - jw / 2, hy - jh / 2, lerp(4, 0, e), lerp(0.78, 1, e));
        if (u < 0.12) shockwave(dv, hx, hy, 60 + u * 700); // the supersonic shockwave at the start, and nothing else
        horizon.setSpeed(lerp(CRUISE * 0.9, cruiseSpeed(start.speed), e), true);
        kts.textContent = String(Math.round(lerp(420, 900, e)));
        const jx = lerp(cx, dv.clientWidth + cw(), e * e);
        const jy = lerp(airY(), -ch() * 2, e);
        setCarrier(jx, jy, -18 * e);
        horizon.setJet(hx, hy + jh / 2, true);
      } else { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    dv.addEventListener('pointerdown', () => { if (!finished) { horizon.jump(1900); finish(); } }, { once: true });
  }

  /** Resumed run (already in flight): a carrier flies in, releases the HARM and leaves, so every mode shows the release. */
  function airRelease(onDone: () => void): void {
    busy = true;
    const cruise = cruiseXY();
    const cx = dv.clientWidth * 0.24;
    const ay = dv.clientHeight * 0.4;
    const t0 = performance.now();
    let released = false;
    let from = { x: 0, y: 0 };
    let done = false;
    const place = (x: number, y: number, pitch: number) => { carrier.style.transform = `translate(${x - carrier.offsetWidth / 2}px,${y}px) rotate(${pitch}deg)`; };
    const finish = () => {
      if (done) return;
      done = true;
      carrier.style.display = 'none';
      jet.classList.remove('carried');
      jet.classList.add('engine', 'cruise');
      setPose(cruise.x, cruise.y, 0);
      horizon.setSpeed(cruiseSpeed(start.speed));
      busy = false;
      onDone();
    };
    jet.classList.add('carried');
    carrier.classList.add('engine', 'afterburner');
    horizon.setSpeed(CRUISE, true);
    const step = (now: number) => {
      if (done || !dv.isConnected) return;
      const t = (now - t0) / 1000;
      const hang = (x: number, y: number, drop: number, pitch: number, sc: number) => {
        pose = { x: x - jw / 2, y: y + carrier.offsetHeight * 0.84 - jh / 2 + drop, pitch };
        jet.style.transform = `translate(${pose.x}px,${pose.y}px) rotate(${pitch}deg) scale(${sc})`;
      };
      if (t < 0.9) {
        const u = easeInOut(t / 0.9);
        const x = lerp(-carrier.offsetWidth, cx, u);
        place(x, ay, 0); hang(x, ay, 0, 0, 0.7);
      } else if (t < 1.35) {
        const u = (t - 0.9) / 0.45;
        if (!released) { released = true; play('release'); showCallout('HARM away', 'Released', 'good'); jet.classList.remove('carried'); }
        place(cx, ay - 5 * Math.sin(Math.PI * Math.min(1, u * 1.6)), 0);
        hang(cx, ay, 8 + 70 * u * u, 4 * u, lerp(0.7, 0.78, u));
        from = { x: pose.x + jw / 2, y: pose.y + jh / 2 };
      } else if (t < 2.4) {
        const u = (t - 1.35) / 1.05;
        const e = easeInOut(u);
        if (u < 0.05) { play('ignite'); jet.classList.add('engine', 'surge', 'cruise'); shockwave(dv, from.x, from.y, 56); shake(220, false); }
        const hx = lerp(from.x, cruise.x + jw / 2, e);
        const hy = lerp(from.y, cruise.y + jh / 2, e);
        setPose(hx - jw / 2, hy - jh / 2, lerp(4, 0, e), lerp(0.78, 1, e));
        place(lerp(cx, dv.clientWidth + carrier.offsetWidth, e * e), lerp(ay, -carrier.offsetHeight * 2, e), -18 * e);
      } else { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- tank theme: a different tank model is destroyed at every distance milestone ----------
  function tankTarget(k: number): void {
    const m = tankModel(k);
    const el = document.createElement('div');
    el.className = 'tgt';
    el.innerHTML = tankSprite(m);
    dv.appendChild(el);
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const W = dv.clientWidth;
    const hitX = pose.x + jw * 0.98;
    const top = pose.y + jh / 2 - th * 0.52;
    el.style.top = `${top}px`;
    const v = Math.max(300, W * 0.4); // px per second, close to the scenery's scroll
    const total = W + tw;
    const hitMs = ((W - hitX) / v) * 1000;
    el.animate([{ transform: `translateX(${W}px)` }, { transform: `translateX(${-tw}px)` }], { duration: (total / v) * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => el.remove();
    later(() => {
      if (!dv.isConnected) return;
      const cx = hitX;
      const cy = top + th * 0.5;
      play('boom');
      flash();
      shake(520, true);
      jet.classList.add('surge');
      later(() => jet.classList.remove('surge'), 700);
      playExplosion(dv, cx + 10, cy, { px: 6, frames: 12, size: 25, seed: 5 + k });
      shockwave(dv, cx, cy, 70);
      smokeColumns(dv, cx, cy - 10, 8);
      wreckage(dv, cx, cy - 10, top + th);
      burstAt(cx, cy, 22, 'var(--gold)');
      el.classList.add('dead');
      pop(`${m.name} destroyed`);
      horizon.emit(cx, cy, { n: 18, color: ['#ffd84a', '#ff8a2a', '#e0322f'], size: 3, vx: 0, vy: -40, spread: 120, life: 1, grav: 160 });
      const fire = window.setInterval(() => {
        if (!el.isConnected) return window.clearInterval(fire);
        const r = el.getBoundingClientRect();
        const d = dv.getBoundingClientRect();
        horizon.emit(r.left - d.left + r.width * 0.45, r.top - d.top + th * 0.3, { n: 2, color: ['#2b2b2e', '#3c3c40', '#ff8a2a'], size: 4, vx: 0, vy: -26, spread: 14, life: 1.4 });
      }, 90);
    }, hitMs);
  }

  // ---------- opening (tank): advance, halt, lay the gun, FIRE the APFSDS round, and the dart takes over ----------
  function fireTank(quick: boolean, onDone: () => void): void {
    busy = true;
    const gun = $('#gun');
    const stage = $('#stage');
    const kts = $('#kts'); const rpm = $('#rpm'); const arm = $('#arm');
    $('#kts').parentElement!.firstChild!.textContent = 'KPH ';
    $('#rpm').parentElement!.firstChild!.textContent = 'RNG ';
    $('#rpm').nextSibling!.textContent = ' m';
    arm.textContent = 'APFSDS · SAFE';
    const px = pxNow();
    const cruise = cruiseXY();
    const dartTx = cruise.x + jw / 2;
    const dartTy = cruise.y + jh / 2;
    const tankCx = Math.max(8 + cw() / 2, dv.clientWidth * 0.2 - muzzleReach() + cw() / 2); // hull fully on screen, gun reaching right
    const rest = () => horizon.runwayYCss() - ch() - 3;
    const zoom = (z: number) => { stage.style.transform = z === 1 ? '' : `scale(${z})`; };
    stage.style.transformOrigin = '24% 78%';
    let gx = tankCx; // hull centre x
    let gyp = rest();
    let ang = 0;
    let recoil = 0;
    const setTank = (x: number, y: number, pitch: number) => {
      gx = x; gyp = y;
      carrier.style.transform = `translate(${x - cw() / 2}px,${y}px) rotate(${pitch}deg)`;
    };
    const setGun = (a: number, rc: number) => { ang = a; recoil = rc; gun.style.transform = `rotate(${-a}deg) translateX(${-rc * px}px)`; };
    const muzzle = () => {
      const a = (ang * Math.PI) / 180;
      const len = (GUN + 1 - recoil) * px;
      return { x: gx - cw() / 2 + pt.pivot.x * px + Math.cos(a) * len, y: gyp + pt.pivot.y * px - Math.sin(a) * len };
    };
    const t0 = performance.now() - (quick ? 5300 : 0);
    let finished = false;
    let from = { x: 0, y: 0 };
    const did: Record<string, boolean> = {};
    jet.style.visibility = 'hidden';
    carrier.classList.add('grounded');
    dv.classList.add('cine');
    horizon.setSpeed(quick ? 0 : 0, true);
    horizon.setJet(0, 0, false);
    setTank(tankCx, rest(), 0);
    setGun(0, 0);

    const finish = () => {
      if (finished) return;
      finished = true;
      dv.classList.remove('intro', 'cine', 'rolling');
      zoom(1);
      horizon.setTimeScale(1);
      carrier.style.display = 'none';
      jet.style.visibility = 'visible';
      jet.classList.add('engine', 'cruise');
      setPose(cruise.x, cruise.y, 0);
      horizon.setSpeed(cruiseSpeed(start.speed));
      busy = false;
      onDone();
    };
    const exhaust = (n: number, dark = true) => horizon.emit(gx - cw() / 2 + 6 * px, gyp + 10 * px, { n, color: dark ? ['#2b2b2e', '#3c3c40', '#55555a'] : ['#d8cfb8', '#b9b09a'], size: 4, vx: -60, vy: -26, spread: 12, life: 1.3 });

    const step = (now: number) => {
      if (finished || !dv.isConnected) return;
      const t = (now - t0) / 1000;
      const r = rest();
      if (t < 1.8) {
        // engine start
        if (!did.eng) { did.eng = true; showCallout('Engine start', 'Pre-flight', 'info'); play('engine'); }
        if (t > 0.4) carrier.classList.add('shudder');
        if (t > 1.0 && !did.ld) { did.ld = true; arm.textContent = 'APFSDS-T · LOADED'; arm.classList.add('on'); showCallout('Sabot loaded', 'APFSDS-T · tungsten penetrator', 'info'); play('ping'); }
        rpm.textContent = String(Math.round(Math.min(100, (t / 1.6) * 100) * 0)); // RNG stays 0 until the target is lased
        kts.textContent = '0';
        setTank(tankCx, r + (Math.random() - 0.5) * 1.4, 0);
        if (Math.random() < 0.6) exhaust(1);
      } else if (t < 4.0) {
        // advance: tracks bite, dust trails, the world rushes past
        const u = (t - 1.8) / 2.2;
        if (!did.adv) { did.adv = true; dv.classList.add('rolling'); play('roar'); showCallout('Advance', 'Full throttle', 'info'); }
        zoom(1 + 0.08 * easeInOut(u));
        horizon.setSpeed(380 * Math.min(1, u * 1.4) ** 1.6, true);
        kts.textContent = String(Math.round(68 * Math.min(1, u * 1.4) ** 1.6));
        setTank(tankCx, r + (Math.random() - 0.5) * 1.8, -0.6 * u);
        exhaust(1);
        horizon.emit(gx - cw() * 0.5, horizon.runwayYCss() + 1, { n: 3, color: ['#d8cfb8', '#b9b09a', '#ffffff'], size: 4, vx: -110, vy: -16, spread: 22, life: 1.5, world: true });
      } else if (t < 5.2) {
        // brake: the hull dips, dust surges forward, the world slows to a stop
        const u = (t - 4.0) / 1.2;
        if (!did.brk) { did.brk = true; dv.classList.remove('rolling'); showCallout('Halt', 'Brakes', 'info'); play('drag'); }
        horizon.setSpeed(380 * (1 - easeInOut(u)) ** 1.6, true);
        kts.textContent = String(Math.round(68 * (1 - u)));
        zoom(1.08 + 0.1 * easeInOut(u));
        const nod = 2.6 * Math.sin(Math.PI * Math.min(1, u * 1.3));
        setTank(tankCx, r, nod);
        if (u < 0.7) horizon.emit(gx + cw() * 0.4, horizon.runwayYCss() + 1, { n: 4, color: ['#d8cfb8', '#b9b09a', '#ffffff'], size: 4, vx: 80, vy: -18, spread: 20, life: 1.6, world: true });
      } else if (t < 6.7) {
        // lay the gun: servo whine, elevation, rangefinder, fire solution
        const u = (t - 5.2) / 1.5;
        horizon.setSpeed(0, true);
        zoom(1.18);
        kts.textContent = '0';
        setTank(tankCx, r, 0);
        setGun(3.5 * easeInOut(Math.min(1, u * 1.3)) + (u < 1 ? (Math.random() - 0.5) * 0.2 : 0), 0);
        if (!did.acq) { did.acq = true; showCallout('Target acquired', 'Laser rangefinder', 'info'); play('ping'); }
        rpm.textContent = String(Math.round(lerp(0, 1850, Math.min(1, u * 1.2))));
        if (u > 0.7 && !did.sol) { did.sol = true; arm.textContent = 'FIRE SOLUTION · LOCKED'; showCallout('Fire solution', 'Stand by', 'info'); play('alarm'); }
        if (Math.random() < 0.15) exhaust(1);
      } else if (t < 6.9) {
        // FIRE: flash, blast, recoil, sabot petals fly off, the dart leaves the muzzle
        const u = (t - 6.7) / 0.2;
        const m = muzzle();
        if (!did.fire) {
          did.fire = true;
          play('cannon');
          arm.textContent = 'ROUND AWAY';
          showCallout('FIRE!', 'APFSDS away', 'good');
          flash();
          shake(520, true);
          horizon.setTimeScale(0.4);
          later(() => horizon.setTimeScale(1), 650);
          const f = document.createElement('i');
          f.className = 'muzzle';
          f.style.cssText = `left:${m.x}px;top:${m.y}px`;
          dv.appendChild(f);
          setTimeout(() => f.remove(), 700);
          shockwave(dv, m.x, m.y, 110);
          setTimeout(() => shockwave(dv, m.x, m.y, 190), 90);
          horizon.emit(m.x, m.y, { n: 40, color: ['#fff6d0', '#ffd84a', '#ff8a2a', '#8a8f96'], size: 4, vx: 60, vy: -4, spread: 90, life: 1.4 });
          horizon.emit(m.x - 20, horizon.runwayYCss() + 2, { n: 36, color: ['#d8cfb8', '#b9b09a', '#ffffff'], size: 5, vx: 0, vy: -30, spread: 220, life: 1.8, world: true });
          for (let i = 0; i < 3; i++) {
            const sb = document.createElement('i');
            sb.className = 'sabot';
            sb.style.cssText = `left:${m.x + 40}px;top:${m.y}px`;
            dv.appendChild(sb);
            sb.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${160 + i * 40}px,${(i - 1) * 90 + 40}px) rotate(${(i + 1) * 420}deg)`, opacity: 0.1 }], { duration: 900, easing: 'ease-out' }).onfinish = () => sb.remove();
          }
          jet.style.visibility = 'visible';
          jet.classList.add('engine', 'surge', 'cruise');
          dv.classList.add('rolling');
        }
        setGun(3.5, 9 * Math.sin(Math.PI * Math.min(1, u)) + 4 * u);
        setTank(tankCx - 16 * Math.sin(Math.PI * Math.min(1, u)), r, -2.4 * Math.sin(Math.PI * Math.min(1, u)));
        from = { x: m.x + 30, y: m.y };
        setPose(from.x - jw / 2, from.y - jh / 2, -1, 0.5);
        dv.classList.remove('intro'); panel.classList.remove('swap');
      } else if (t < 8.3) {
        // the dart streaks away, the camera pulls back, the tank is left behind
        const u = Math.min(1, (t - 6.9) / 1.2);
        const e = 1 - (1 - u) ** 3;
        if (!did.sw) { did.sw = true; void panel.offsetWidth; panel.classList.add('swap'); }
        setGun(3.5, 4 * (1 - e));
        zoom(1.18 - 0.18 * easeInOut(u));
        const hx = lerp(from.x, dartTx, e);
        const hy = lerp(from.y, dartTy, easeInOut(u));
        setPose(hx - jw / 2, hy - jh / 2, 0, lerp(0.5, 1, e));
        horizon.setSpeed(lerp(380, cruiseSpeed(start.speed), easeInOut(u)), true);
        if (u < 0.12) shockwave(dv, hx, hy, 60 + u * 700); // the supersonic shockwave at the start, and nothing else
        kts.textContent = String(Math.round(lerp(0, 1700, e)));
        setTank(tankCx - 16 - 360 * e * e, r, 0);
        if (Math.random() < 0.5) exhaust(1);
      } else { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    dv.addEventListener('pointerdown', () => { if (!finished) { horizon.jump(1900); finish(); } }, { once: true });
  }

  // ---------- wiring ----------
  const onResize = () => {
    if (!dv.isConnected) return window.removeEventListener('resize', onResize);
    horizon.resize();
    measure();
    if (!busy) { const c = cruiseXY(); setPose(c.x, c.y, pose.pitch); }
  };
  window.addEventListener('resize', onResize);
  on(app.root, '#home', () => { stopTimer(); horizon.stop(); app.go({ name: 'home' }); });
  // stop the render loop when the player leaves this screen by any route
  const watch = window.setInterval(() => { if (!dv.isConnected) { horizon.stop(); window.clearInterval(watch); timers.forEach(window.clearTimeout); } }, 500);

  // motor trail: a thin ribbon of smoke behind the HARM in flight
  const trail = window.setInterval(() => {
    if (!dv.isConnected) return window.clearInterval(trail);
    if (busy || document.hidden || tank) return;
    const t = jetCenter();
    horizon.emit(t.x - jw * 0.5, t.y, { n: 1, color: ['#ffffff', '#dfe6ec'], size: 2, vx: -70, vy: -3, spread: 5, life: 1.1 });
  }, 70);

  measure();
  hud(start.depth, start.distance, start.answers, start.index, start.lives, start.streak, start.speed);
  ask();
  if (intro) {
    (tank ? fireTank : (_q: boolean, d: () => void) => takeoff(d))(false, () => startQuestion?.());
  } else {
    horizon.jump(2600); // resuming mid-run: start already in flight, past the airfield
    if (reducedMotion()) {
      const c = cruiseXY();
      setPose(c.x, c.y, 0);
      jet.classList.add('engine', 'cruise');
      horizon.setSpeed(cruiseSpeed(start.speed), true);
      carrier.style.display = 'none';
    } else {
      jet.style.visibility = 'visible';
      measure();
      stopTimer();
      if (tank) fireTank(true, () => startQuestion?.());
      else airRelease(() => startQuestion?.());
    }
    dv.classList.remove('intro');
  }
}
