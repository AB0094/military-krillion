import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession, submitAnswer, type PlayContext } from '../logic/progress';
import { MIN_CROWD, TIERS, crossedTier, rarity, rarityLabel, shaftPosition, tierIndex } from '../logic/scoring';
import { START_LIVES } from '../logic/endless';
import { QUESTION_SECONDS, isLow, secondsLeft } from '../logic/timer';
import type { AnswerRecord, AnswerStats, Prompt } from '../logic/types';
import { esc, fmt, on, runTitle, type App, type View } from './dom';
import { burst, countUp, reducedMotion } from './fx';
import { timerEnabled } from './prefs';
import { SURFACE_Y, WORLD_H, camFor, missileY, worldHtml, type Theme } from './scene';
import { play } from './sound';
import { missileSprite, samSprite } from './sprites';

type DiveView = Extract<View, { name: 'dive' }>;

const MOVE_MS = 1300;

/** A point-in-time view of a run, whatever kind of run it is. */
export interface Snapshot {
  index: number;
  depth: number;
  answers: readonly AnswerRecord[];
  lives: number;
  streak: number;
  over: boolean;
}

export interface Outcome {
  depth: number;
  answers: readonly AnswerRecord[];
  record: AnswerRecord;
  hint: string | null;
  lives: number;
  streak: number;
  lostLife: boolean;
  gainedLife: boolean;
  over: boolean;
}

/** Everything the scene needs from a run. Fixed daily/free runs and Endless runs each provide one. */
export interface Game {
  theme: Theme;
  seedKey: string;
  title: string;
  endless: boolean;
  /** Prompts per run (fixed) or the endless scale; depth/scale is the position down the shaft. */
  scale: number;
  snapshot(): Snapshot;
  prompt(index: number): Prompt;
  submit(input: string, timedOut: boolean): Outcome;
  crowd(promptId: string): AnswerStats | undefined;
  finish(): void;
}

/** Fixed-length runs: the daily sets, Ranked, the archive and free (unlimited) 7-prompt runs. */
export function renderDive(app: App, v: DiveView): void {
  const ctx: PlayContext = { date: v.date, mode: v.mode, archive: v.archive, prompts: dailySet(v.date, v.mode, PROMPTS) };
  const total = ctx.prompts.length;
  const session = () => getSession(app.getState(), ctx);
  const s0 = session();
  if (s0?.complete) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);

  const game: Game = {
    theme: 'sea', seedKey: v.date, title: runTitle(v), endless: false, scale: total,
    snapshot() {
      const s = session();
      return { index: s?.answers.length ?? 0, depth: s?.depth ?? 0, answers: s?.answers ?? [], lives: START_LIVES, streak: 0, over: !!s?.complete };
    },
    prompt: (i) => ctx.prompts[i],
    submit(input, timedOut) {
      const r = submitAnswer(app.getState(), ctx, input, { timedOut });
      app.setState(r.state);
      return { depth: r.session.depth, answers: r.session.answers, record: r.record, hint: r.hint, lives: START_LIVES, streak: 0, lostLife: false, gainedLife: false, over: r.session.complete };
    },
    crowd: (id) => app.getState().crowd[id],
    finish: () => app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true),
  };
  runScene(app, game, !s0 || s0.answers.length === 0);
}

/** The full-screen descent scene: world + camera, HUD, 20-second timer, answer dock, near misses and interceptions. */
export function runScene(app: App, game: Game, wantIntro: boolean): void {
  const intro = wantIntro && !reducedMotion();
  const start = game.snapshot();
  if (start.over) return game.finish();

  app.root.innerHTML = `<div class="dv ${game.theme}${intro ? ' intro' : ''}" id="dv">
    <div class="dv-view">
      <div class="dv-far" style="top:${game.theme === 'sea' ? SURFACE_Y : 0}px;height:${Math.round(WORLD_H * 0.62)}px"></div>
      <div class="dv-world" style="height:${WORLD_H}px;--sy:${SURFACE_Y}px">${worldHtml(game.seedKey, game.theme)}</div>
    </div>
    <div class="scan"></div><div class="dv-vig"></div>
    <div class="hud">
      <button class="hud-btn" id="home" aria-label="Home">≡</button>
      <div class="hud-panel"><span class="lbl">Depth</span><b id="hd">0.00</b></div>
      <div class="hud-mid">${game.endless ? '<div class="lives" id="lives" aria-label="Missiles left"></div>' : '<div class="pips" id="pips" aria-hidden="true"></div>'}<span class="lbl" id="plabel"></span></div>
      <div class="hud-panel hud-tier"><span class="lbl">Airfield</span><b id="ht"></b></div>
    </div>
    <div class="dv-panel px" id="panel"></div>
    <div class="dv-dock" id="dock"></div>
    <div class="dv-intro-msg">Launch sequence · tap to skip</div>
  </div>`;

  const $ = <T extends HTMLElement>(sel: string) => app.root.querySelector<T>(sel)!;
  const dv = $('#dv');
  const world = $('.dv-world');
  const far = $('.dv-far');
  const mk = $('.dv-mk');
  const panel = $('#panel');
  const dock = $('#dock');

  let depth = start.depth;
  let timerId = 0;
  let startQuestion: (() => void) | null = null;
  const ratio = () => (dv.clientWidth <= 1000 ? 0.62 : 0.4);

  // ---------- camera and HUD ----------
  function place(d: number, animate: boolean): void {
    const y = missileY(shaftPosition(d, game.scale));
    const cam = camFor(y, dv.clientHeight, ratio());
    dv.classList.toggle('anim', animate);
    mk.style.top = `${y}px`;
    world.style.transform = `translateY(${-cam}px)`;
    far.style.transform = `translateY(${-cam * 0.55}px)`;
  }

  function hud(d: number, answers: readonly AnswerRecord[], index: number, lives: number, streak: number): void {
    if (!dv.isConnected) return; // delayed updates must not run after the player has left this screen
    $('#hd').textContent = fmt(d);
    if (game.endless) {
      $('#lives').innerHTML = Array.from({ length: START_LIVES }, (_, i) => `<i class="life${i < lives ? '' : ' lost'}">${missileSprite()}</i>`).join('');
      $('#plabel').textContent = `${game.title} · question ${index + 1} · streak ${streak}`;
      dv.classList.toggle('low', lives === 1);
    } else {
      $('#pips').innerHTML = Array.from({ length: game.scale }, (_, i) => `<i class="pip ${i < answers.length ? (answers[i].matched ? 'hit' : 'miss') : i === answers.length ? 'now' : ''}"></i>`).join('');
      $('#plabel').textContent = `${game.title} · prompt ${Math.min(index + 1, game.scale)} of ${game.scale}`;
    }
    const idx = tierIndex(d, game.scale);
    $('#ht').textContent = `${TIERS[idx].flag} ${TIERS[idx].name}`;
    world.querySelectorAll<HTMLElement>('.gauge li').forEach((li) => li.classList.toggle('reached', Number(li.dataset.i) <= idx));
  }

  // ---------- small effects ----------
  const target = () => {
    const r = mk.getBoundingClientRect();
    const d = dv.getBoundingClientRect();
    return { x: r.left - d.left + r.width / 2, y: r.top - d.top + r.height / 2 };
  };

  function burstAt(x: number, y: number, count: number, color: string): void {
    const a = document.createElement('i');
    a.className = 'anchor';
    a.style.cssText = `left:${x}px;top:${y}px`;
    dv.appendChild(a);
    burst(dv, a, count, color);
    setTimeout(() => a.remove(), 60);
  }

  function bubbles(y0: number, y1: number): void {
    if (reducedMotion()) return;
    const x = mk.offsetLeft;
    for (let i = 0; i <= 11; i++) {
      setTimeout(() => {
        if (!world.isConnected) return;
        const b = document.createElement('i');
        b.className = game.theme === 'sky' ? 'bub puffy' : 'bub';
        b.style.cssText = `left:${x + (Math.random() - 0.5) * 26}px;top:${y0 + ((y1 - y0) * i) / 11}px`;
        world.appendChild(b);
        setTimeout(() => b.remove(), 1700);
      }, i * 95);
    }
  }

  function pop(text: string, bad = false): void {
    const el = document.createElement('span');
    el.className = `pop${bad ? ' bad' : ''}`;
    el.textContent = text;
    el.style.cssText = `left:${mk.offsetLeft}px;top:${parseFloat(mk.style.top) - 70}px`;
    world.appendChild(el);
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

  /** A hostile missile streaks in from a bottom corner. `miss` flies past; `hit` strikes the HARM. */
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
    if (kind === 'miss') {
      const side = fromLeft ? 1 : -1;
      const off = 190 + Math.random() * 70; // the path deviates by `off` 900px past the HARM, so the closest pass is ~70-120px
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
    if (kind === 'miss') {
      const closest = delay + dur * (len / (len + 900)) * 1.12;
      setTimeout(() => {
        if (!dv.isConnected) return;
        const now = target();
        const puff = document.createElement('i');
        puff.className = 'flak';
        puff.style.cssText = `left:${now.x + -uy * (fromLeft ? 1 : -1) * 78}px;top:${now.y + ux * (fromLeft ? 1 : -1) * 78}px`;
        dv.appendChild(puff);
        setTimeout(() => puff.remove(), 700);
      }, closest);
    }
  }

  function nearMiss(): void {
    play('whoosh');
    samFlight('miss', 0);
    samFlight('miss', 320);
    setTimeout(() => {
      if (!dv.isConnected) return;
      shake(600, false);
      mk.classList.add('wobble');
      setTimeout(() => mk.classList.remove('wobble'), 900);
      pop('Near miss!', true);
    }, 700);
  }

  function explode(done: () => void): void {
    if (!dv.isConnected) return;
    const { x, y } = target();
    play('boom');
    flash();
    shake(1000, true);
    const ball = document.createElement('i');
    ball.className = 'fireball';
    ball.style.cssText = `left:${x}px;top:${y}px`;
    dv.appendChild(ball);
    setTimeout(() => ball.remove(), 1100);
    burstAt(x, y, 36, '#ffffff');
    burstAt(x, y, 36, 'var(--gold)');
    burstAt(x, y, 30, 'var(--pink)');
    if (!reducedMotion()) {
      for (let i = 0; i < 12; i++) {
        const d = document.createElement('i');
        d.className = 'deb';
        d.style.cssText = `left:${x}px;top:${y}px`;
        dv.appendChild(d);
        const vx = (Math.random() - 0.5) * 320;
        const vy = 60 + Math.random() * 190;
        d.animate([
          { transform: 'translate(0,0)', opacity: 1 },
          { transform: `translate(${vx * 0.5}px,${-vy}px)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${vx}px,${dv.clientHeight - y + 40}px)`, opacity: 0.2 },
        ], { duration: 1500, easing: 'ease-in' }).onfinish = () => d.remove();
      }
    }
    mk.classList.add('gone');
    const banner = document.createElement('div');
    banner.className = 'intercepted';
    banner.textContent = 'Intercepted';
    dv.appendChild(banner);
    setTimeout(() => banner.remove(), 2600);
    setTimeout(done, 1500);
  }

  function intercept(done: () => void): void {
    play('whoosh');
    samFlight('miss', 0);
    samFlight('hit', 480, () => explode(done));
  }

  // ---------- the 20-second timer ----------
  function stopTimer(): void {
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  function startTimer(onExpire: () => void): void {
    stopTimer();
    const el = panel.querySelector<HTMLElement>('#timer');
    if (!el || !timerEnabled()) return;
    const fill = el.querySelector<HTMLElement>('#tfill')!;
    const num = el.querySelector<HTMLElement>('#tnum')!;
    const t0 = performance.now();
    let lastSec = QUESTION_SECONDS + 1;
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
    const snap = game.snapshot();
    if (snap.over) return game.finish();
    const index = snap.index;
    const prompt = game.prompt(index);
    depth = snap.depth;
    mk.classList.remove('abort', 'gone', 'wobble');
    hud(snap.depth, snap.answers, index, snap.lives, snap.streak);
    panel.className = `dv-panel px${dv.classList.contains('intro') ? '' : ' swap'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `${timerEnabled() ? `<div class="timer" id="timer"><div class="tbar"><i id="tfill"></i></div><b id="tnum">${QUESTION_SECONDS}</b></div>` : ''}
      <p class="plabel">${game.endless ? `Question ${index + 1}` : `Prompt ${index + 1} of ${game.scale}`} · ${prompt.mode}</p>
      <h2 class="prompt">${esc(prompt.text)}</h2>
      ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
      <p class="hintline">▼ rarer answers sink deeper ▼</p>`;
    dock.innerHTML = `<form id="f" autocomplete="off"><input id="answer" type="text" maxlength="80" placeholder="Type your answer…" autocapitalize="off" spellcheck="false" aria-label="Your answer" /><button class="btn primary" type="submit">Fire</button></form>`;
    const input = $<HTMLInputElement>('#answer');
    let locked = false; // guards against double-submit (Enter + click) and against a late timer firing
    const submitNow = (raw: string, timedOut: boolean) => {
      if (locked || !dv.isConnected) return;
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
    if (!dv.classList.contains('intro')) startQuestion();
  }

  // ---------- the result ----------
  function reveal(before: Snapshot, out: Outcome, typed: string, crowdBefore: AnswerStats | undefined, prompt: Prompt): void {
    const matched = out.record.matched;
    const score = out.record.score;
    const timedOut = out.record.timedOut === true;
    const label = rarityLabel(score);
    const board = [...prompt.answers]
      .map((a) => ({ a, r: rarity(a, crowdBefore, MIN_CROWD) }))
      .sort((x, y) => y.r - x.r)
      .map(({ a, r }, i) => `<li class="${a.name === matched ? 'mine' : ''}" style="--i:${i}"><span class="bn">${esc(a.name)}</span><span class="bar"><i style="--w:${Math.round(r * 100)}%"></i></span><b>${fmt(r)}</b></li>`)
      .join('');

    let body: string;
    if (matched) {
      body = `<p class="verdict good">✓ ${esc(matched)} <span class="badge badge-${label.toLowerCase().replace(' ', '-')}">${label}</span></p>${out.record.corrected ? `<p class="muted small">Spelling corrected: you typed “${esc(typed)}”.</p>` : ''}<p class="score"><span id="score">+0.00</span> <span class="muted">rarity</span></p>`;
    } else {
      const head = timedOut
        ? '<p class="verdict bad">⏱ Time\'s up</p><p class="stamp">Out of time</p>'
        : `<p class="verdict bad"><s>“${esc(typed)}”</s></p><p class="stamp">${game.endless ? 'Wrong answer' : 'Launch cancelled'}</p>`;
      body = `${head}<p class="score">+0.00</p><p class="hint">${esc(out.hint ?? '')}</p>`;
    }
    if (game.endless) {
      const n = out.lives;
      if (out.over) body += '<p class="lifeline danger">Last missile lost. Your HARM was intercepted.</p>';
      else if (out.lostLife) body += `<p class="lifeline danger">Near miss! ${n} HARM${n === 1 ? '' : 's'} left.</p>`;
      else if (out.gainedLife) body += `<p class="lifeline good">Resupply: +1 HARM after ${out.streak} in a row.</p>`;
      else if (matched && out.streak > 1) body += `<p class="lifeline">${out.streak} in a row. ${5 - (out.streak % 5)} more for a resupply.</p>`;
    }

    panel.className = `dv-panel px swap ${matched ? 'hit' : 'miss'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `<p class="plabel">${game.endless ? `Question ${before.index + 1}` : `Prompt ${before.index + 1} of ${game.scale}`} · ${prompt.mode}</p>
      <h2 class="prompt small">${esc(prompt.text)}</h2>
      ${body}
      <h3 class="boardtitle">All valid answers</h3>
      <ul class="board">${board}</ul>
      ${prompt.fact ? `<p class="fact"><strong>Briefing.</strong> ${esc(prompt.fact)}</p>` : ''}`;

    const finishing = !game.endless && out.over;
    const showNext = (label2: string, fn: () => void) => {
      dock.innerHTML = `<button class="btn primary wide" id="next">${label2} ▶</button>`;
      on(app.root, '#next', fn);
      $<HTMLButtonElement>('#next').focus();
    };
    dock.innerHTML = '';

    hud(before.depth, before.answers, before.index, before.lives, before.streak); // updates once the missile has moved
    const after = () => hud(out.depth, out.answers, before.index + 1, out.lives, out.streak);

    if (matched) {
      const y0 = missileY(shaftPosition(before.depth, game.scale));
      const y1 = missileY(shaftPosition(out.depth, game.scale));
      place(out.depth, true);
      bubbles(y0, y1);
      pop(`+${fmt(score)}`);
      const scoreEl = $<HTMLElement>('#score');
      countUp(scoreEl, score, { prefix: '+', delay: 350 });
      play(score >= 0.8 ? 'rare' : 'hit');
      if (score >= 0.5) setTimeout(() => dv.isConnected && burst(panel, scoreEl, score >= 0.8 ? 26 : 14, score >= 0.8 ? 'var(--gold)' : 'var(--accent)'), 450);
      setTimeout(after, MOVE_MS * 0.6);
      if (out.gainedLife) setTimeout(() => { if (dv.isConnected) { play('gain'); pop('+1 HARM'); } }, 700);
      const arrived = crossedTier(before.depth, out.depth, game.scale);
      if (arrived !== null) setTimeout(() => arrive(arrived), MOVE_MS);
      depth = out.depth;
      showNext(finishing ? 'See results' : game.endless ? 'Next question' : 'Next prompt', finishing ? () => game.finish() : ask);
    } else if (game.endless) {
      if (out.over) {
        intercept(() => { after(); showNext('See results', () => game.finish()); });
      } else {
        nearMiss();
        setTimeout(after, 800);
        showNext('Next question', ask);
      }
    } else {
      // Fixed runs: the launch is cancelled; the missile aborts in place and the answer is struck out.
      mk.classList.add('abort');
      pop('Cancelled', true);
      play('miss');
      after();
      showNext(finishing ? 'See results' : 'Next prompt', finishing ? () => game.finish() : ask);
    }
  }

  /** Banner when the missile reaches a deeper airfield. */
  function arrive(tierIdx: number): void {
    if (!dv.isConnected) return;
    const t = TIERS[tierIdx];
    const el = document.createElement('div');
    el.className = 'arrival px';
    el.innerHTML = `<span class="aflag">${t.flag}</span><div><div class="alabel">Arrived</div><div class="aname">${esc(t.name)}</div><div class="afield">${esc(t.airfield)}, ${esc(t.country)}</div></div>`;
    dv.appendChild(el);
    play('tier');
    burst(dv, el, 22, 'var(--gold)');
    setTimeout(() => el.remove(), 3400);
  }

  // ---------- opening: a jet launches the missile ----------
  function runIntro(onDone: () => void): void {
    const jet = $('.dv-jet');
    const ship = world.querySelector<HTMLElement>('.w-ship');
    const sea = game.theme === 'sea' && !!ship;
    const W = dv.clientWidth;
    const jw = jet.offsetWidth;
    const jh = jet.offsetHeight;
    const tx = mk.offsetLeft;
    const y0 = missileY(0);
    const releaseY = Math.max(64, SURFACE_Y * 0.34);
    const deckX = sea ? ship!.offsetLeft + ship!.offsetWidth * 0.18 : -jw;
    const deckY = sea ? ship!.offsetTop + 24 - jh + 6 : releaseY + 50;
    const mkDy0 = releaseY + jh + 8 - y0;
    const surfDy = SURFACE_Y - 8 - y0;
    const c = 'translate(-50%,-50%)';

    const jetA = jet.animate([
      { transform: `translate(${deckX}px,${deckY}px) rotate(0deg)`, offset: 0, easing: sea ? 'cubic-bezier(.5,0,.9,.8)' : 'linear' },
      { transform: `translate(${tx - jw / 2}px,${releaseY}px) rotate(-3deg)`, offset: 0.5, easing: 'linear' },
      { transform: `translate(${W + jw}px,${releaseY - 30}px) rotate(-6deg)`, offset: 1 },
    ], { duration: 3000, fill: 'forwards' });

    const frames: Keyframe[] = sea
      ? [
        { transform: `${c} translate(0px,${mkDy0}px) rotate(-90deg)`, opacity: 1, offset: 0, easing: 'cubic-bezier(.5,0,1,.7)' },
        { transform: `${c} translate(46px,${surfDy}px) rotate(-30deg)`, opacity: 1, offset: 0.5, easing: 'ease-out' },
        { transform: `${c} translate(20px,${surfDy + 60}px) rotate(-6deg)`, opacity: 1, offset: 0.64, easing: 'ease-out' },
        { transform: `${c} translate(0px,0px) rotate(0deg)`, opacity: 1, offset: 1 },
      ]
      : [
        { transform: `${c} translate(0px,${mkDy0}px) rotate(-90deg)`, opacity: 1, offset: 0, easing: 'cubic-bezier(.4,0,.8,.6)' },
        { transform: `${c} translate(44px,${mkDy0 * 0.45}px) rotate(-38deg)`, opacity: 1, offset: 0.4, easing: 'ease-out' },
        { transform: `${c} translate(0px,0px) rotate(0deg)`, opacity: 1, offset: 1 },
      ];
    const mkA = mk.animate(frames, { delay: 1500, duration: 1500, fill: 'forwards' });

    const timers = [
      setTimeout(() => play('launch'), 1500),
      setTimeout(() => {
        if (sea) {
          const sp = document.createElement('i');
          sp.className = 'splash';
          sp.style.cssText = `left:${tx + 46}px;top:${SURFACE_Y - 2}px`;
          world.appendChild(sp);
          setTimeout(() => sp.remove(), 1000);
          bubbles(SURFACE_Y, y0);
          play('splash');
        } else {
          const t = target();
          burstAt(t.x, t.y, 16, 'var(--gold)');
          play('whoosh');
        }
      }, 2250),
    ];

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      jetA.cancel();
      mkA.cancel();
      jet.classList.add('gone');
      dv.classList.remove('intro');
      onDone();
    };
    void Promise.all([jetA.finished, mkA.finished]).then(finish, finish);
    dv.addEventListener('pointerdown', () => { if (!finished) { jetA.finish(); mkA.finish(); } }, { once: true });
  }

  const onResize = () => { if (!dv.isConnected) return window.removeEventListener('resize', onResize); place(depth, false); };
  window.addEventListener('resize', onResize);
  on(app.root, '#home', () => { stopTimer(); app.go({ name: 'home' }); });

  place(depth, false);
  ask();
  if (intro) {
    runIntro(() => {
      panel.classList.remove('swap');
      void panel.offsetWidth; // restart the entry animation now that the panel is visible
      panel.classList.add('swap');
      startQuestion?.();
    });
  }
}
