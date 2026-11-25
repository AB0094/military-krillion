import { PROMPTS } from '../data';
import { ENDLESS_SCALE, endlessPromptAt, endlessStats, startEndless, submitEndless } from '../logic/endless';
import { tierFor, tierIndex } from '../logic/scoring';
import { newRunSeed } from '../logic/seed';
import { buildEndlessShare, scoreSquare } from '../logic/share';
import type { EndlessRun, Mode } from '../logic/types';
import { copyText } from './clipboard';
import { runScene, type Game } from './dive';
import { esc, fmt, header, modeLabel, on, type App } from './dom';
import { ladderHtml } from './ladder';

/** Begins a brand-new Endless run (discarding any unfinished one) and opens it. */
export function startEndlessRun(app: App, mode: Mode): void {
  app.setState(startEndless(app.getState(), newRunSeed(), mode));
  app.go({ name: 'endless', mode });
}

function endlessGame(app: App, run: EndlessRun): Game {
  return {
    theme: 'sky',
    seedKey: run.seed,
    title: `Endless · ${modeLabel(run.mode, run.seed)}`,
    endless: true,
    scale: ENDLESS_SCALE,
    snapshot() {
      const r = app.getState().endless.run!;
      return { index: r.answers.length, depth: r.depth, answers: r.answers, lives: r.lives, streak: r.streak, over: r.over };
    },
    prompt: (i) => endlessPromptAt(run.seed, run.mode, i, PROMPTS),
    submit(input, timedOut) {
      const o = submitEndless(app.getState(), PROMPTS, input, { timedOut });
      app.setState(o.state);
      return { depth: o.run.depth, answers: o.run.answers, record: o.record, hint: o.hint, lives: o.run.lives, streak: o.run.streak, lostLife: o.lostLife, gainedLife: o.gainedLife, over: o.over };
    },
    crowd: (id) => app.getState().crowd[id],
    finish: () => app.go({ name: 'endless', mode: run.mode }, true), // re-renders as the results screen
  };
}

/** Plays the current Endless run, or shows its results once it is over. */
export function renderEndless(app: App, mode: Mode): void {
  let run = app.getState().endless.run;
  if (!run || run.mode !== mode) {
    app.setState(startEndless(app.getState(), newRunSeed(), mode));
    run = app.getState().endless.run!;
  }
  if (run.over) return renderEndlessResults(app, run);
  document.body.classList.add('in-dive');
  runScene(app, endlessGame(app, run), run.answers.length === 0);
}

function renderEndlessResults(app: App, run: EndlessRun): void {
  const best = app.getState().endless.best;
  const stats = endlessStats(run);
  const tier = tierFor(run.depth, ENDLESS_SCALE);
  const idx = tierIndex(run.depth, ENDLESS_SCALE);
  const byId = new Map(PROMPTS.map((p) => [p.id, p]));
  const text = buildEndlessShare(run);
  const nb = run.newBest;
  const rows = [...run.answers].reverse().slice(0, 15).map((a, i) => {
    const n = run.answers.length - i;
    return `<li class="${a.matched ? 'ok' : 'miss'}"><span class="sq">${scoreSquare(a)}</span>
      <div><div class="q">Q${n} · ${esc(byId.get(a.promptId)?.text ?? a.promptId)}</div>
      <div class="a">${a.matched ? `<strong>${esc(a.matched)}</strong>` : `<s>${a.timedOut ? 'time\'s up' : esc(a.input)}</s>`}</div></div>
      <span class="pts">${fmt(a.score)}</span></li>`;
  }).join('');
  const badge = (on: boolean | undefined) => (on ? ' <span class="newbest">New best</span>' : '');

  app.root.innerHTML = `${header(`Endless · ${modeLabel(run.mode, run.seed)}`)}
    <section class="card result">
      <p class="stamp big">Intercepted</p>
      <p class="muted">Final depth${badge(nb?.depth)}</p>
      <p class="depth" id="depth">0.00</p>
      <p class="tier">${esc(tier.name)}</p>
      <p class="field">${tier.flag} ${esc(tier.airfield)}, ${esc(tier.country)}</p>
      <div class="stat-grid">
        <div class="stat"><b>${stats.answered}</b><span>Questions</span></div>
        <div class="stat"><b>${stats.correct}</b><span>Correct${badge(nb?.correct)}</span></div>
        <div class="stat"><b>${Math.round(stats.accuracy * 100)}%</b><span>Accuracy</span></div>
        <div class="stat"><b>${run.bestStreak}</b><span>Best streak${badge(nb?.streak)}</span></div>
      </div>
      <p class="muted small">Your records: depth ${fmt(best.depth)} · ${best.correct} correct · streak ${best.streak}</p>
      ${ladderHtml(idx, idx)}
      <ol class="answers">${rows}</ol>
      ${run.answers.length > 15 ? `<p class="muted small">Showing the last 15 of ${run.answers.length} answers.</p>` : ''}
      <pre class="share" id="share-text">${esc(text)}</pre>
      <div class="row"><button class="btn primary" id="again">Dive again ∞</button><button class="btn" id="share">Copy share text</button><button class="btn" id="home">Home</button></div>
      <p class="muted small" id="copied" role="status"></p>
    </section>`;

  const depthEl = app.root.querySelector<HTMLElement>('#depth')!;
  import('./fx').then(({ countUp }) => countUp(depthEl, run.depth, { ms: 1200 }));
  on(app.root, '#again', () => startEndlessRun(app, run.mode));
  on(app.root, '#home', () => app.go({ name: 'home' }));
  on(app.root, '#share', async () => {
    const ok = await copyText(text);
    app.root.querySelector('#copied')!.textContent = ok ? 'Copied to clipboard!' : 'Copy failed. Select the text above instead.';
  });
}
