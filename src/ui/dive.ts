import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession, submitAnswer, type PlayContext } from '../logic/progress';
import { MIN_CROWD, TIERS, crossedTier, rarity, rarityLabel, shaftPosition, tierIndex } from '../logic/scoring';
import type { AnswerRecord } from '../logic/types';
import { esc, fmt, on, runTitle, type App, type View } from './dom';
import { burst, countUp, reducedMotion } from './fx';
import { SURFACE_Y, WORLD_H, camFor, missileY, worldHtml } from './scene';
import { play } from './sound';

type DiveView = Extract<View, { name: 'dive' }>;

const MOVE_MS = 1300;

export function renderDive(app: App, v: DiveView): void {
  const ctx: PlayContext = { date: v.date, mode: v.mode, archive: v.archive, prompts: dailySet(v.date, v.mode, PROMPTS) };
  const total = ctx.prompts.length;
  const session = () => getSession(app.getState(), ctx);

  const s0 = session();
  if (s0?.complete) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);
  const intro = (!s0 || s0.answers.length === 0) && !reducedMotion();

  app.root.innerHTML = `<div class="dv${intro ? ' intro' : ''}" id="dv">
    <div class="dv-view">
      <div class="dv-far" style="top:${SURFACE_Y}px;height:${Math.round(WORLD_H * 0.62)}px"></div>
      <div class="dv-world" style="height:${WORLD_H}px;--sy:${SURFACE_Y}px">${worldHtml(v.date)}</div>
    </div>
    <div class="scan"></div>
    <div class="hud">
      <button class="hud-btn" id="home" aria-label="Home">≡</button>
      <div class="hud-panel"><span class="lbl">Depth</span><b id="hd">0.00</b></div>
      <div class="hud-mid"><div class="pips" id="pips" aria-hidden="true"></div><span class="lbl" id="plabel"></span></div>
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
  const title = runTitle(v);

  let depth = s0?.depth ?? 0;
  const ratio = () => (dv.clientWidth <= 1000 ? 0.62 : 0.4);

  /** Moves the missile (and the camera that follows it) to the position for `d`. */
  function place(d: number, animate: boolean): void {
    const y = missileY(shaftPosition(d, total));
    const cam = camFor(y, dv.clientHeight, ratio());
    dv.classList.toggle('anim', animate);
    mk.style.top = `${y}px`;
    world.style.transform = `translateY(${-cam}px)`;
    far.style.transform = `translateY(${-cam * 0.55}px)`;
  }

  function hud(d: number, answers: readonly AnswerRecord[], index: number): void {
    if (!dv.isConnected) return; // delayed updates must not run after the player has left this screen
    $('#hd').textContent = fmt(d);
    $('#pips').innerHTML = Array.from({ length: total }, (_, i) => `<i class="pip ${i < answers.length ? (answers[i].matched ? 'hit' : 'miss') : i === answers.length ? 'now' : ''}"></i>`).join('');
    $('#plabel').textContent = `${title} · prompt ${Math.min(index + 1, total)} of ${total}`;
    const idx = tierIndex(d, total);
    $('#ht').textContent = `${TIERS[idx].flag} ${TIERS[idx].name}`;
    world.querySelectorAll<HTMLElement>('.gauge li').forEach((li) => li.classList.toggle('reached', Number(li.dataset.i) <= idx));
  }

  function bubbles(y0: number, y1: number): void {
    if (reducedMotion()) return;
    const x = mk.offsetLeft;
    for (let i = 0; i <= 11; i++) {
      setTimeout(() => {
        if (!world.isConnected) return;
        const b = document.createElement('i');
        b.className = 'bub';
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

  // ---------- the question ----------
  function ask(): void {
    const s = session();
    const index = s?.answers.length ?? 0;
    if (s?.complete || index >= total) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);
    const prompt = ctx.prompts[index];
    mk.classList.remove('abort');
    hud(s?.depth ?? 0, s?.answers ?? [], index);
    panel.className = `dv-panel px${dv.classList.contains('intro') ? '' : ' swap'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `<p class="plabel">Prompt ${index + 1} of ${total} · ${prompt.mode}</p>
      <h2 class="prompt">${esc(prompt.text)}</h2>
      ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
      <p class="hintline">▼ rarer answers sink deeper ▼</p>`;
    dock.innerHTML = `<form id="f" autocomplete="off"><input id="answer" type="text" maxlength="80" placeholder="Type your answer…" autocapitalize="off" spellcheck="false" aria-label="Your answer" /><button class="btn primary" type="submit">Fire</button></form>`;
    const input = $<HTMLInputElement>('#answer');
    if (!dv.classList.contains('intro')) input.focus();
    let locked = false; // guards against double-submit (Enter + click)
    $<HTMLFormElement>('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      if (locked || !input.value.trim()) return;
      locked = true;
      play('launch');
      const before = app.getState().crowd[prompt.id]; // board uses player data as it was when you answered
      const result = submitAnswer(app.getState(), ctx, input.value);
      app.setState(result.state);
      reveal(index, depth, result.session.depth, result.session.answers, result.record.matched, result.record.score, result.hint, input.value.trim(), before, result.record.corrected === true);
      depth = result.session.depth;
    });
  }

  // ---------- the result ----------
  function reveal(index: number, depthBefore: number, depthAfter: number, answers: readonly AnswerRecord[], matched: string | null, score: number, hint: string | null, typed: string, before: Parameters<typeof rarity>[1], corrected: boolean): void {
    const prompt = ctx.prompts[index];
    const last = index + 1 >= total;
    const board = [...prompt.answers]
      .map((a) => ({ a, r: rarity(a, before, MIN_CROWD) }))
      .sort((x, y) => y.r - x.r)
      .map(({ a, r }, i) => `<li class="${a.name === matched ? 'mine' : ''}" style="--i:${i}"><span class="bn">${esc(a.name)}</span><span class="bar"><i style="--w:${Math.round(r * 100)}%"></i></span><b>${fmt(r)}</b></li>`)
      .join('');
    const label = rarityLabel(score);
    const body = matched
      ? `<p class="verdict good">✓ ${esc(matched)} <span class="badge badge-${label.toLowerCase().replace(' ', '-')}">${label}</span></p>${corrected ? `<p class="muted small">Spelling corrected: you typed “${esc(typed)}”.</p>` : ''}<p class="score"><span id="score">+0.00</span> <span class="muted">rarity</span></p>`
      : `<p class="verdict bad"><s>“${esc(typed)}”</s></p><p class="stamp">Launch cancelled</p><p class="score">+0.00</p><p class="hint">${esc(hint ?? '')}</p>`;
    panel.className = `dv-panel px swap ${matched ? 'hit' : 'miss'}`;
    panel.scrollTop = 0;
    panel.innerHTML = `<p class="plabel">Prompt ${index + 1} of ${total} · ${prompt.mode}</p>
      <h2 class="prompt small">${esc(prompt.text)}</h2>
      ${body}
      <h3 class="boardtitle">All valid answers</h3>
      <ul class="board">${board}</ul>
      ${prompt.fact ? `<p class="fact"><strong>Briefing.</strong> ${esc(prompt.fact)}</p>` : ''}`;
    dock.innerHTML = `<button class="btn primary wide" id="next">${last ? 'See results' : 'Next prompt'} ▶</button>`;
    hud(depthBefore, answers.slice(0, -1), index); // pips/airfield update once the missile has moved

    const scoreEl = $<HTMLElement>('#score');
    if (matched && scoreEl) {
      const y0 = missileY(shaftPosition(depthBefore, total));
      const y1 = missileY(shaftPosition(depthAfter, total));
      place(depthAfter, true);
      bubbles(y0, y1);
      pop(`+${fmt(score)}`);
      countUp(scoreEl, score, { prefix: '+', delay: 350 });
      play(score >= 0.8 ? 'rare' : 'hit');
      if (score >= 0.5) setTimeout(() => dv.isConnected && burst(panel, scoreEl, score >= 0.8 ? 26 : 14, score >= 0.8 ? 'var(--gold)' : 'var(--accent)'), 450);
      setTimeout(() => hud(depthAfter, answers, index + 1), MOVE_MS * 0.6);
      const arrived = crossedTier(depthBefore, depthAfter, total);
      if (arrived !== null) setTimeout(() => arrive(arrived), MOVE_MS);
    } else {
      // Wrong: the launch is cancelled. The missile aborts where it is and the answer is struck out.
      mk.classList.add('abort');
      pop('Cancelled', true);
      play('miss');
      hud(depthAfter, answers, index + 1);
    }
    on(app.root, '#next', ask);
    $<HTMLButtonElement>('#next').focus();
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
    const ship = $('.w-ship');
    const W = dv.clientWidth;
    const jw = jet.offsetWidth;
    const jh = jet.offsetHeight;
    const tx = mk.offsetLeft;
    const y0 = missileY(0);
    const deckX = ship.offsetLeft + ship.offsetWidth * 0.18;
    const deckY = ship.offsetTop + jh * 0 + 8 * 3 - jh + 6;
    const releaseY = Math.max(64, SURFACE_Y * 0.34);
    const mkDy0 = releaseY + jh + 8 - y0;
    const surfDy = SURFACE_Y - 8 - y0;
    const c = 'translate(-50%,-50%)';

    const jetA = jet.animate([
      { transform: `translate(${deckX}px,${deckY}px) rotate(0deg)`, offset: 0, easing: 'cubic-bezier(.5,0,.9,.8)' },
      { transform: `translate(${tx - jw / 2}px,${releaseY}px) rotate(-3deg)`, offset: 0.5, easing: 'linear' },
      { transform: `translate(${W + jw}px,${releaseY - 30}px) rotate(-6deg)`, offset: 1 },
    ], { duration: 3000, fill: 'forwards' });

    const mkA = mk.animate([
      { transform: `${c} translate(0px,${mkDy0}px) rotate(-90deg)`, opacity: 1, offset: 0, easing: 'cubic-bezier(.5,0,1,.7)' },
      { transform: `${c} translate(46px,${surfDy}px) rotate(-30deg)`, opacity: 1, offset: 0.5, easing: 'ease-out' },
      { transform: `${c} translate(20px,${surfDy + 60}px) rotate(-6deg)`, opacity: 1, offset: 0.64, easing: 'ease-out' },
      { transform: `${c} translate(0px,0px) rotate(0deg)`, opacity: 1, offset: 1 },
    ], { delay: 1500, duration: 1500, fill: 'forwards' });

    const timers = [
      setTimeout(() => play('launch'), 1500),
      setTimeout(() => {
        const sp = document.createElement('i');
        sp.className = 'splash';
        sp.style.cssText = `left:${tx + 46}px;top:${SURFACE_Y - 2}px`;
        world.appendChild(sp);
        setTimeout(() => sp.remove(), 1000);
        bubbles(SURFACE_Y, y0);
        play('splash');
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
  on(app.root, '#home', () => app.go({ name: 'home' }));

  place(depth, false);
  ask();
  if (intro) {
    runIntro(() => {
      panel.classList.remove('swap');
      void panel.offsetWidth; // restart the entry animation now that the panel is visible
      panel.classList.add('swap');
      $<HTMLInputElement>('#answer')?.focus();
    });
  }
}
