import { previousDates } from '../logic/seed';
import { resetSession, sessionKey } from '../logic/progress';
import { MODES, type Mode } from '../logic/types';
import { header, on, type App } from './dom';
import { depthMeters, formatMeters } from '../logic/scoring';

const DAYS = 30;

export function renderArchive(app: App): void {
  const state = app.getState();
  const rows = previousDates(app.today, DAYS).map((date) => {
    const buttons = MODES.map((mode) => {
      const s = state.sessions[sessionKey(date, mode, true)];
      const label = s?.complete ? `${mode} · ${formatMeters(depthMeters(s.depth))}` : mode;
      return `<button class="btn small-btn" data-date="${date}" data-mode="${mode}">${label}</button>`;
    }).join('');
    return `<li><span class="date">${date}</span><span class="row">${buttons}</span></li>`;
  }).join('');

  app.root.innerHTML = `${header('Archive · replay past daily sets (unranked)')}
    <section class="card"><ul class="archive">${rows}</ul></section>
    <p class="center"><button class="btn" id="home">Home</button></p>`;

  on(app.root, '#home', () => app.go({ name: 'home' }));
  on(app.root, '[data-date]', (el) => {
    const date = el.dataset.date!;
    const mode = el.dataset.mode as Mode;
    // Each replay starts fresh. Archive plays never affect stats, player data or rating.
    app.setState(resetSession(app.getState(), { date, mode, archive: true }));
    app.go({ name: 'dive', mode, date, archive: true });
  });
}
