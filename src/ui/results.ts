import { PROMPTS } from '../data';
import { dailySet } from '../logic/seed';
import { getSession } from '../logic/progress';
import { tierFor, tierIndex } from '../logic/scoring';
import { buildShareText, scoreSquare } from '../logic/share';
import { esc, fmt, header, on, type App, type View } from './dom';
import { burst, countUp } from './fx';
import { ladderHtml } from './ladder';
import { play } from './sound';

type ResultsView = Extract<View, { name: 'results' }>;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function renderResults(app: App, v: ResultsView): void {
  const state = app.getState();
  const prompts = dailySet(v.date, v.mode, PROMPTS);
  const session = getSession(state, { date: v.date, mode: v.mode, archive: v.archive, prompts });
  if (!session?.complete) return app.go({ name: 'dive', mode: v.mode, date: v.date, archive: v.archive }, true);

  const tier = tierFor(session.depth, session.answers.length);
  const idx = tierIndex(session.depth, session.answers.length);
  const byId = new Map(PROMPTS.map((p) => [p.id, p]));
  const rows = session.answers.map((a) => {
    const prompt = byId.get(a.promptId);
    return `<li class="${a.matched ? 'ok' : 'miss'}"><span class="sq">${scoreSquare(a)}</span>
      <div><div class="q">${esc(prompt?.text ?? a.promptId)}</div>
      <div class="a">${a.matched ? `<strong>${esc(a.matched)}</strong>` : `<s>${esc(a.input)}</s>`}</div></div>
      <span class="pts">${fmt(a.score)}</span></li>`;
  }).join('');

  const entry = !v.archive && v.mode === 'Ranked' ? state.rankedHistory.find((h) => h.date === v.date) : undefined;
  const rating = entry ? `<p class="rating">Ranked rating ${entry.before} → <strong>${entry.after}</strong> (${entry.after - entry.before >= 0 ? '+' : ''}${entry.after - entry.before})</p>` : '';
  const text = buildShareText({ date: v.date, mode: v.mode, archive: v.archive, depth: session.depth, answers: session.answers });

  app.root.innerHTML = `${header(`${v.mode}${v.archive ? ' · archive' : ''} · ${v.date}`)}
    <section class="card result">
      <p class="muted">Final depth</p>
      <p class="depth" id="depth">0.00</p>
      <p class="tier">${esc(tier.name)}</p>
      <p class="field">${tier.flag} ${esc(tier.airfield)}, ${esc(tier.country)}</p>
      <p class="muted small">${esc(tier.blurb)}</p>
      ${rating}
      ${ladderHtml(idx, idx)}
      <ol class="answers">${rows}</ol>
      <pre class="share" id="share-text">${esc(text)}</pre>
      <div class="row"><button class="btn primary" id="share">Copy share text</button><button class="btn" id="home">Home</button></div>
      <p class="muted small" id="copied" role="status"></p>
    </section>`;

  const card = app.root.querySelector<HTMLElement>('.card')!;
  const depthEl = app.root.querySelector<HTMLElement>('#depth')!;
  countUp(depthEl, session.depth, { ms: 1200 });
  setTimeout(() => {
    play(idx >= 3 ? 'tier' : 'hit');
    if (idx >= 2) burst(card, depthEl, 12 + idx * 6, idx >= 5 ? 'var(--gold)' : 'var(--accent)');
  }, 1000);

  on(app.root, '#home', () => app.go({ name: 'home' }));
  on(app.root, '#share', async () => {
    const ok = await copy(text);
    app.root.querySelector('#copied')!.textContent = ok ? 'Copied to clipboard!' : 'Copy failed. Select the text above instead.';
  });
}
