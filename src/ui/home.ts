import { PROMPTS } from '../data';
import { dailySet, dateKey, msUntilNextDay } from '../logic/seed';
import { getSession, summarize, summarizeUnlimited } from '../logic/progress';
import { streaks } from '../logic/stats';
import { MODES, type Mode } from '../logic/types';
import { depthMeters, formatMeters, tierFor, tierIndex } from '../logic/scoring';
import { QUESTION_SECONDS } from '../logic/timer';
import { esc, header, on, type App } from './dom';
import { ICONS } from './icons';
import { ladderHtml } from './ladder';
import { startRun } from './run';
import { startEndlessRun } from './endless';
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
  const unlimited = summarizeUnlimited(state);
  const streak = streaks(state, today);
  const endless = state.endless;
  const live = endless.run && !endless.run.over ? endless.run : null;

  const cards = MODES.map((mode) => {
    const prompts = dailySet(today, mode, PROMPTS);
    const s = getSession(state, { date: today, mode, archive: false, prompts });
    let status = 'Not started';
    let st = 'new';
    let action = 'Dive';
    if (s?.complete) { status = `Done · ${formatMeters(depthMeters(s.depth))} · ${tierFor(s.depth, prompts.length).name}`; st = 'done'; action = 'View results'; }
    else if (s) { status = `In progress · ${s.answers.length}/${prompts.length}`; st = 'go'; action = 'Resume'; }
    return `<article class="card mode-card mode-${mode.toLowerCase()}">
      <div class="mc-top">${ICONS[mode]}<span class="mc-tag">Limited · 7</span></div>
      <h2>${mode}</h2><p class="muted">${esc(BLURB[mode])}</p>
      <p class="status st-${st}"><i></i>${esc(status)}</p>
      <button class="btn primary" data-mode="${mode}" data-done="${s?.complete ? 1 : 0}">${action}</button>
    </article>`;
  }).join('');

  const rows = MODES.map((m) => {
    const x = stats[m];
    return `<tr><th>${m}</th><td>${x.played}</td><td>${x.played ? formatMeters(depthMeters(x.best)) : '–'}</td><td>${x.played ? formatMeters(depthMeters(x.average)) : '–'}</td></tr>`;
  }).join('');

  const played = MODES.some((m) => stats[m].played > 0);
  const reached = played ? tierIndex(Math.max(...MODES.map((m) => stats[m].best))) : -1;

  app.root.innerHTML = `${header(`Daily set · ${today}`, true)}
    <div class="chips">
      <span class="chip">🔥 Streak <strong>${streak.current}</strong></span>
      <span class="chip">Best streak <strong>${streak.best}</strong></span>
      <span class="chip">Next set in <strong id="countdown">--:--:--</strong></span>
    </div>
    <section class="grid">${cards}</section>
    <section class="card unlimited endless">
      <div class="u-head"><span class="u-inf" aria-hidden="true">☠</span><div><span class="u-badge hot">Endless · 3 lives</span><h2>Fly until you crash</h2></div></div>
      <p class="muted">Random questions with no end, ${QUESTION_SECONDS} seconds each, getting harder as you go. Every miss costs a life and adds DRAG, slowing your jet. Lose all three and you crash. Lives never come back.</p>
      ${live ? `<button class="btn primary wide" id="resume" data-resume="${live.mode}">Resume run · question ${live.answers.length + 1} · ${live.lives} li${live.lives === 1 ? 'fe' : 'ves'} left</button>` : ''}
      <div class="row u-buttons">
        <button class="btn primary" data-endless="Ground">Ground</button>
        <button class="btn primary" data-endless="Air">Air</button>
        <button class="btn primary" data-endless="Ranked">Mixed</button>
      </div>
      <p class="muted small u-stats">${endless.runs ? `Records: ${formatMeters(endless.best.distance)} · ${endless.best.correct} correct · streak ${endless.best.streak} · ${endless.runs} run${endless.runs === 1 ? '' : 's'}` : 'No runs yet. How deep can you get?'}</p>
    </section>
    <section class="card unlimited">
      <div class="u-head">${ICONS.Unlimited}<div><span class="u-badge">Unlimited</span><h2>Free dives</h2></div></div>
      <p class="muted">Unlimited 7-prompt runs, as many as you like, each with the same ${QUESTION_SECONDS}-second timer. No lives, and nothing touches your streak, rating or daily stats.</p>
      <div class="row u-buttons">
        <button class="btn primary" data-run="Ground">Ground</button>
        <button class="btn primary" data-run="Air">Air</button>
        <button class="btn primary" data-run="Ranked">Mixed</button>
      </div>
      <p class="muted small u-stats">${unlimited.played ? `Recent runs: ${unlimited.played} · best ${formatMeters(depthMeters(unlimited.best))} · average ${formatMeters(depthMeters(unlimited.average))}` : 'No runs yet. Pick a mode to start diving.'}</p>
    </section>
    <section class="card">
      <h2>Your depth</h2>
      <table><thead><tr><th></th><th>Played</th><th>Best</th><th>Average</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="rating">Ranked rating <strong>${stats.ranking}</strong></p>
    </section>
    <section class="card"><h2>Depth ladder</h2><p class="muted small">Each depth is an airfield. Your deepest daily dive so far is marked.</p>${ladderHtml(reached, reached)}</section>
    <p class="center"><button class="btn" id="archive">Archive: replay past days</button></p>
    ${settingsHtml()}
    <footer class="foot">${PROMPTS.length} prompts · progress is saved in this browser</footer>`;

  on(app.root, '[data-mode]', (el) => {
    const mode = el.dataset.mode as Mode;
    app.go({ name: el.dataset.done === '1' ? 'results' : 'dive', mode, date: today, archive: false });
  });
  on(app.root, '[data-run]', (el) => startRun(app, el.dataset.run as Mode));
  on(app.root, '[data-endless]', (el) => startEndlessRun(app, el.dataset.endless as Mode));
  on(app.root, '#resume', (el) => app.go({ name: 'endless', mode: el.dataset.resume as Mode }));
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
