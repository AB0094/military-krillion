import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession, submitAnswer, type PlayContext } from '../logic/progress';
import { MIN_CROWD, TIERS, crossedTier, rarity, rarityLabel, shaftPosition, tierIndex } from '../logic/scoring';
import { fmt, esc, header, on, type App, type View } from './dom';
import { burst, countUp } from './fx';
import { play } from './sound';
import { shaftHtml } from './shaft';

type DiveView = Extract<View, { name: 'dive' }>;

export function renderDive(app: App, v: DiveView): void {
  const ctx: PlayContext = { date: v.date, mode: v.mode, archive: v.archive, prompts: dailySet(v.date, v.mode, PROMPTS) };
  const total = ctx.prompts.length;
  const session = () => getSession(app.getState(), ctx);
  const title = `${v.mode}${v.archive ? ' · archive' : ''} · ${v.date}`;

  const meta = (label: number, depth: number, mode: string) => `
    <div class="meta"><span>Prompt ${Math.min(label, total)} / ${total}</span><span class="tag tag-${mode.toLowerCase()}">${mode}</span><span>Depth <strong>${fmt(depth)}</strong></span></div>`;

  function ask(): void {
    const s = session();
    const index = s?.answers.length ?? 0;
    if (s?.complete || index >= total) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);
    const prompt = ctx.prompts[index];
    const depth = s?.depth ?? 0;
    app.root.innerHTML = `${header(title)}
      <section class="card dive">
        ${meta(index + 1, depth, prompt.mode)}
        <div class="dive-grid">
          ${shaftHtml(shaftPosition(depth, total), tierIndex(depth, total))}
          <div class="dive-main">
            <h2 class="prompt">${esc(prompt.text)}</h2>
            ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
            <form id="f" autocomplete="off">
              <input id="answer" type="text" maxlength="80" placeholder="Type your answer…" autocapitalize="off" spellcheck="false" />
              <button class="btn primary" type="submit">Fire</button>
            </form>
            <p class="muted small">One answer per prompt. The rarer your answer, the deeper the missile dives.</p>
          </div>
        </div>
      </section>
      <p class="center"><button class="btn" id="home">Home</button></p>`;
    on(app.root, '#home', () => app.go({ name: 'home' }));
    const input = app.root.querySelector<HTMLInputElement>('#answer')!;
    input.focus();
    let locked = false; // guards against double-submit (Enter + click)
    app.root.querySelector<HTMLFormElement>('#f')!.addEventListener('submit', (e) => {
      e.preventDefault();
      if (locked || !input.value.trim()) return;
      locked = true;
      play('launch');
      const before = app.getState().crowd[prompt.id]; // board uses player data as it was when you answered
      const result = submitAnswer(app.getState(), ctx, input.value);
      app.setState(result.state);
      reveal(index, depth, result.session.depth, result.record.matched, result.record.score, result.hint, input.value.trim(), before, result.record.corrected === true);
    });
  }

  function reveal(index: number, depthBefore: number, depthAfter: number, matched: string | null, score: number, hint: string | null, typed: string, before: Parameters<typeof rarity>[1], corrected: boolean): void {
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
    app.root.innerHTML = `${header(title)}
      <section class="card dive ${matched ? 'hit' : 'miss'}">
        ${meta(index + 1, depthAfter, prompt.mode)}
        <div class="dive-grid">
          ${shaftHtml(shaftPosition(depthBefore, total), tierIndex(depthBefore, total))}
          <div class="dive-main">
            <h2 class="prompt">${esc(prompt.text)}</h2>
            ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
            ${body}
            <h3 class="boardtitle">All valid answers</h3>
            <ul class="board">${board}</ul>
            ${prompt.fact ? `<p class="fact"><strong>Briefing.</strong> ${esc(prompt.fact)}</p>` : ''}
            <button class="btn primary" id="next">${last ? 'See results' : 'Next prompt'}</button>
          </div>
        </div>
      </section>`;

    const card = app.root.querySelector<HTMLElement>('.card')!;
    const mk = app.root.querySelector<HTMLElement>('.shaft-mk')!;
    const scoreEl = app.root.querySelector<HTMLElement>('#score');

    if (matched && scoreEl) {
      // Correct: the missile dives down the shaft by the rarity it earned.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        mk.style.top = `${shaftPosition(depthAfter, total) * 100}%`;
        mk.classList.add('diving');
      }));
      countUp(scoreEl, score, { prefix: '+', delay: 350 });
      play(score >= 0.8 ? 'rare' : 'hit');
      if (score >= 0.5) setTimeout(() => burst(card, scoreEl, score >= 0.8 ? 26 : 14, score >= 0.8 ? 'var(--gold)' : 'var(--accent)'), 450);

      const arrived = crossedTier(depthBefore, depthAfter, total);
      if (arrived !== null) setTimeout(() => arrive(card, arrived), 1000);
    } else {
      // Wrong: the launch is cancelled. The missile aborts where it is and the answer is struck out.
      mk.classList.add('abort');
      play('miss');
    }
    on(app.root, '#next', ask);
    app.root.querySelector<HTMLButtonElement>('#next')!.focus();
  }

  /** Banner when the missile reaches a deeper airfield. */
  function arrive(card: HTMLElement, tierIdx: number): void {
    if (!card.isConnected) return;
    const t = TIERS[tierIdx];
    card.querySelectorAll<HTMLElement>('.shaft li').forEach((li) => { if (Number(li.dataset.i) <= tierIdx) li.classList.add('reached'); });
    const el = document.createElement('div');
    el.className = 'arrival';
    el.innerHTML = `<span class="aflag">${t.flag}</span><div><div class="alabel">Arrived</div><div class="aname">${esc(t.name)}</div><div class="afield">${esc(t.airfield)}, ${esc(t.country)}</div></div>`;
    card.appendChild(el);
    play('tier');
    burst(card, el, 20, 'var(--gold)');
    setTimeout(() => el.remove(), 3200);
  }

  ask();
}
