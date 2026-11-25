import { PROMPTS } from '../data';
import { dailySet, dateKey, msUntilNextDay } from '../logic/seed';
import { getSession, summarize, summarizeUnlimited } from '../logic/progress';
import { streaks } from '../logic/stats';
import { MODES, type Mode } from '../logic/types';
import { depthMeters, formatMeters, tierFor, tierIndex } from '../logic/scoring';
import { QUESTION_SECONDS } from '../logic/timer';
import { esc, on, type App } from './dom';
import { logoSvg } from './logo';
import { dartSprite, harmSprite, jetSprite, tankSprite, TANK_MODELS } from './sprites';
import { ladderHtml } from './ladder';
import { startRun } from './run';
import { startEndlessRun } from './endless';
import { bindSettings, settingsHtml } from './settings';

const BLURB: Record<Mode, string> = {
  Ground: 'Tanks, artillery and infantry weapons. You fire an APFSDS round.',
  Air: 'Fighters, helicopters and drones. You fly a released HARM.',
  Ranked: 'A mixed Ground and Air set. Counts toward your rating.',
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
    let action = 'Deploy';
    if (s?.complete) { status = `Done · ${formatMeters(depthMeters(s.depth))} · ${tierFor(s.depth, prompts.length).name}`; st = 'done'; action = 'View results'; }
    else if (s) { status = `In progress · ${s.answers.length}/${prompts.length}`; st = 'go'; action = 'Resume'; }
    return `<article class="card mission mode-${mode.toLowerCase()}">
      <div class="art">ART_${mode}</div>
      <div class="mission-body">
        <div class="mc-top"><h2>${mode}</h2><span class="mc-tag">Limited · 7</span></div>
        <p class="muted">${esc(BLURB[mode])}</p>
        <p class="status st-${st}"><i></i>${esc(status)}</p>
        <button class="btn primary" data-mode="${mode}" data-done="${s?.complete ? 1 : 0}">${action}</button>
      </div>
    </article>`;
  }).join('');

  const rows = MODES.map((m) => {
    const x = stats[m];
    return `<tr><th>${m}</th><td>${x.played}</td><td>${x.played ? formatMeters(depthMeters(x.best)) : '–'}</td><td>${x.played ? formatMeters(depthMeters(x.average)) : '–'}</td></tr>`;
  }).join('');

  const played = MODES.some((m) => stats[m].played > 0);
  const reached = played ? tierIndex(Math.max(...MODES.map((m) => stats[m].best))) : -1;

  const ART: Record<Mode, string> = {
    Ground: `<span class="art-tank">${tankSprite(TANK_MODELS[4])}</span><span class="art-dart">${dartSprite()}</span>`,
    Air: `<span class="art-jet">${jetSprite()}</span><span class="art-harm">${harmSprite()}</span>`,
    Ranked: `<span class="art-harm solo">${harmSprite()}</span><span class="art-dart solo">${dartSprite()}</span>`,
  };

  app.root.innerHTML = `<header class="hero">
      <div class="hero-mark">${logoSvg()}</div>
      <div><h1>Military Krillion</h1><p class="tag">Answer rare. Fly further.</p></div>
    </header>
    <div class="chips">
      <span class="chip"><i>🔥</i> Streak <strong>${streak.current}</strong></span>
      <span class="chip">Best streak <strong>${streak.best}</strong></span>
      <span class="chip">Next set in <strong id="countdown">--:--:--</strong></span>
    </div>

    <h3 class="sec-h"><span>Today's missions</span><em>${today} · 7 prompts each</em></h3>
    <section class="missions">${cards.replace(/ART_(Ground|Air|Ranked)/g, (_m, k: Mode) => ART[k])}</section>

    <h3 class="sec-h"><span>Free play</span><em>no streak, no rating</em></h3>
    <section class="freeplay">
      <article class="card mode endless">
        <div class="mode-head"><span class="badge hot">Endless · 3 lives</span><h2>Fly until you crash</h2></div>
        <p class="muted">No end, ${QUESTION_SECONDS} seconds a question, harder as you go. Every miss costs a life and adds DRAG. Lose all three and you crash. Lives never come back.</p>
        ${live ? `<button class="btn primary wide" id="resume" data-resume="${live.mode}">Resume · question ${live.answers.length + 1} · ${live.lives} li${live.lives === 1 ? 'fe' : 'ves'} left</button>` : ''}
        <div class="row u-buttons">
          <button class="btn" data-endless="Ground">Ground</button>
          <button class="btn" data-endless="Air">Air</button>
          <button class="btn" data-endless="Ranked">Mixed</button>
        </div>
        <p class="stat-line">${endless.runs ? `Best ${formatMeters(endless.best.distance)} · ${endless.best.correct} correct · streak ${endless.best.streak} · ${endless.runs} run${endless.runs === 1 ? '' : 's'}` : 'No runs yet. How far can you get?'}</p>
      </article>
      <article class="card mode unlimited">
        <div class="mode-head"><span class="badge">Unlimited</span><h2>Free flights</h2></div>
        <p class="muted">Fresh seven-prompt runs, as many as you like, with the same ${QUESTION_SECONDS}-second timer. Nothing touches your streak, rating or daily stats.</p>
        <div class="row u-buttons">
          <button class="btn" data-run="Ground">Ground</button>
          <button class="btn" data-run="Air">Air</button>
          <button class="btn" data-run="Ranked">Mixed</button>
        </div>
        <p class="stat-line">${unlimited.played ? `${unlimited.played} recent run${unlimited.played === 1 ? '' : 's'} · best ${formatMeters(depthMeters(unlimited.best))} · average ${formatMeters(depthMeters(unlimited.average))}` : 'No runs yet. Pick a mode to start flying.'}</p>
      </article>
    </section>

    <h3 class="sec-h"><span>Service record</span><em>ranked rating ${stats.ranking}</em></h3>
    <section class="record">
      <article class="card">
        <table><thead><tr><th></th><th>Played</th><th>Best</th><th>Average</th></tr></thead><tbody>${rows}</tbody></table>
      </article>
      <article class="card"><h2>Airfield ladder</h2><p class="muted small">Every distance reached lands at a different airfield. Your furthest daily flight is marked.</p>${ladderHtml(reached, reached)}</article>
    </section>
    <p class="center"><button class="btn" id="archive">Archive · replay past days</button></p>
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
