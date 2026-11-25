import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession, submitAnswer, type PlayContext } from '../logic/progress';
import { MIN_CROWD, rarity, rarityLabel } from '../logic/scoring';
import { fmt, esc, header, on, type App, type View } from './dom';
import { burst, countUp } from './fx';
import { missileSvg } from './logo';
import { play } from './sound';

type DiveView = Extract<View, { name: 'dive' }>;

export function renderDive(app: App, v: DiveView): void {
  const ctx: PlayContext = { date: v.date, mode: v.mode, archive: v.archive, prompts: dailySet(v.date, v.mode, PROMPTS) };
  const total = ctx.prompts.length;
  const session = () => getSession(app.getState(), ctx);
  const title = `${v.mode}${v.archive ? ' · archive' : ''} · ${v.date}`;

  /** `label` is the prompt number shown; `at` is how far along the track the missile starts. */
  const top = (label: number, at: number, depth: number, mode: string) => `
    <div class="meta"><span>Prompt ${Math.min(label, total)} / ${total}</span><span class="tag tag-${mode.toLowerCase()}">${mode}</span><span>Depth <strong>${fmt(depth)}</strong></span></div>
    <div class="track" aria-hidden="true"><span class="mk" style="left:${(at / total) * 100}%">${missileSvg('missile')}</span></div>`;

  function ask(): void {
    const s = session();
    const index = s?.answers.length ?? 0;
    if (s?.complete || index >= total) return app.go({ name: 'results', mode: v.mode, date: v.date, archive: v.archive }, true);
    const prompt = ctx.prompts[index];
    app.root.innerHTML = `${header(title)}
      <section class="card dive">
        ${top(index + 1, index, s?.depth ?? 0, prompt.mode)}
        <h2 class="prompt">${esc(prompt.text)}</h2>
        ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
        <form id="f" autocomplete="off">
          <input id="answer" type="text" maxlength="80" placeholder="Type your answer…" autocapitalize="off" spellcheck="false" />
          <button class="btn primary" type="submit">Fire</button>
        </form>
        <p class="muted small">One answer per prompt. The rarer your answer, the deeper you dive.</p>
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
      reveal(index, result.record.matched, result.record.score, result.hint, input.value.trim(), before, result.record.corrected === true);
    });
  }

  function reveal(index: number, matched: string | null, score: number, hint: string | null, typed: string, before: Parameters<typeof rarity>[1], corrected: boolean): void {
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
      : `<p class="verdict bad">✗ “${esc(typed)}”</p><p class="score">+0.00</p><p class="hint">${esc(hint ?? '')}</p>`;
    app.root.innerHTML = `${header(title)}
      <section class="card dive ${matched ? 'hit' : 'miss'}">
        ${top(index + 1, index, session()?.depth ?? 0, prompt.mode)}
        <h2 class="prompt">${esc(prompt.text)}</h2>
        ${prompt.detail ? `<p class="detail">${esc(prompt.detail)}</p>` : ''}
        ${body}
        <h3 class="boardtitle">All valid answers</h3>
        <ul class="board">${board}</ul>
        ${prompt.fact ? `<p class="fact"><strong>Briefing.</strong> ${esc(prompt.fact)}</p>` : ''}
        <button class="btn primary" id="next">${last ? 'See results' : 'Next prompt'}</button>
      </section>`;

    // Launch the missile: it starts at the old position, then flies to the new one.
    const mk = app.root.querySelector<HTMLElement>('.mk')!;
    requestAnimationFrame(() => requestAnimationFrame(() => { mk.style.left = `${((index + 1) / total) * 100}%`; mk.classList.add('flying'); }));

    const card = app.root.querySelector<HTMLElement>('.card')!;
    const scoreEl = app.root.querySelector<HTMLElement>('#score');
    if (matched && scoreEl) {
      countUp(scoreEl, score, { prefix: '+', delay: 350 });
      play(score >= 0.8 ? 'rare' : 'hit');
      if (score >= 0.5) setTimeout(() => burst(card, scoreEl, score >= 0.8 ? 26 : 14, score >= 0.8 ? 'var(--gold)' : 'var(--accent)'), 450);
    } else {
      play('miss');
    }
    on(app.root, '#next', ask);
    app.root.querySelector<HTMLButtonElement>('#next')!.focus();
  }

  ask();
}
