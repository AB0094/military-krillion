import { PROMPTS } from '../data';
import { dailySet, dateKey, msUntilNextDay } from '../logic/seed';
import { getSession, summarize } from '../logic/progress';
import { streaks } from '../logic/stats';
import { MODES, type Mode } from '../logic/types';
import { tierFor, tierIndex } from '../logic/scoring';
import { esc, fmt, header, on, type App } from './dom';
import { ladderHtml } from './ladder';
import { bindSettings, settingsHtml } from './settings';

const BLURB: Record<Mode, string> = {
  Ground: 'Tanks, IFVs, artillery and infantry weapons.',
  Air: 'Fixed-wing, helicopters and drones.',
  Ranked: 'A mixed Ground + Air set. Counts toward your rating.',
};

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function renderHome(app: App): void {
  const state = app.getState();
  const today = app.today;
  const stats = summarize(state);
  const streak = streaks(state, today);

  const cards = MODES.map((mode) => {
    const prompts = dailySet(today, mode, PROMPTS);
    const s = getSession(state, { date: today, mode, archive: false, prompts });
    let status = 'Not started';
    let action = 'Dive';
    if (s?.complete) { status = `Done · depth ${fmt(s.depth)} · ${tierFor(s.depth, prompts.length).name}`; action = 'View results'; }
    else if (s) { status = `In progress · ${s.answers.length}/${prompts.length}`; action = 'Resume'; }
    return `<article class="card mode-${mode.toLowerCase()}">
      <h2>${mode}</h2><p class="muted">${esc(BLURB[mode])}</p>
      <p class="status">${esc(status)}</p>
      <button class="btn primary" data-mode="${mode}" data-done="${s?.complete ? 1 : 0}">${action}</button>
    </article>`;
  }).join('');

  const rows = MODES.map((m) => {
    const x = stats[m];
    return `<tr><th>${m}</th><td>${x.played}</td><td>${x.played ? fmt(x.best) : '–'}</td><td>${x.played ? fmt(x.average) : '–'}</td></tr>`;
  }).join('');

  const played = MODES.some((m) => stats[m].played > 0);
  const reached = played ? tierIndex(Math.max(...MODES.map((m) => stats[m].best))) : -1;

  app.root.innerHTML = `${header(`Daily set · ${today}`)}
    <div class="chips">
      <span class="chip">🔥 Streak <strong>${streak.current}</strong></span>
      <span class="chip">Best streak <strong>${streak.best}</strong></span>
      <span class="chip">Next set in <strong id="countdown">--:--:--</strong></span>
    </div>
    <section class="grid">${cards}</section>
    <section class="card">
      <h2>Your depth</h2>
      <table><thead><tr><th></th><th>Played</th><th>Best</th><th>Average</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="rating">Ranked rating <strong>${stats.ranking}</strong></p>
    </section>
    <section class="card"><h2>Depth ladder</h2><p class="muted small">Each depth is an airfield. Your deepest dive so far is marked.</p>${ladderHtml(reached, reached)}</section>
    <p class="center"><button class="btn" id="archive">Archive: replay past days</button></p>
    ${settingsHtml()}`;

  on(app.root, '[data-mode]', (el) => {
    const mode = el.dataset.mode as Mode;
    app.go({ name: el.dataset.done === '1' ? 'results' : 'dive', mode, date: today, archive: false });
  });
  on(app.root, '#archive', () => app.go({ name: 'archive' }));
  bindSettings(app);

  const el = app.root.querySelector<HTMLElement>('#countdown')!;
  const timer = setInterval(tick, 1000);
  function tick(): void {
    if (!el.isConnected) return void clearInterval(timer); // navigated away
    if (dateKey() !== today) { clearInterval(timer); return renderHome(app); } // midnight: new set
    el.textContent = clock(msUntilNextDay());
  }
  tick();
}
