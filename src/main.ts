import './style.css';
import { dateKey } from './logic/seed';
import { emptyState } from './logic/progress';
import { normalizeRoute, parseRoute, toHash, type Route } from './logic/route';
import { STORAGE_KEY, loadState, saveState } from './storage';
import type { SaveState } from './logic/types';
import { esc, type App } from './ui/dom';
import { renderHome } from './ui/home';
import { renderDive } from './ui/dive';
import { renderResults } from './ui/results';
import { renderArchive } from './ui/archive';
import { renderEndless } from './ui/endless';
import { mountBackdrop } from './ui/backdrop';
import { isMuted, setMuted } from './ui/sound';

const root = document.getElementById('app')!;
let state: SaveState = loadState(localStorage);
let current: Route = { name: 'home' };

function fatal(err: unknown): void {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  root.innerHTML = `<section class="card"><h2>Something went wrong</h2>
    <p class="muted">${esc(msg)}</p>
    <div class="row"><button class="btn primary" id="reload">Reload</button><button class="btn danger" id="wipe">Reset save data</button></div></section>`;
  root.querySelector('#reload')!.addEventListener('click', () => { location.hash = '#/'; location.reload(); });
  root.querySelector('#wipe')!.addEventListener('click', () => {
    if (confirm('Delete all saved progress?')) { app.setState(emptyState()); location.hash = '#/'; location.reload(); }
  });
}

function draw(view: Route): void {
  current = view;
  window.scrollTo(0, 0);
  document.body.classList.toggle('in-dive', view.name === 'dive');
  try {
    switch (view.name) {
      case 'home': return renderHome(app);
      case 'dive': return renderDive(app, view);
      case 'results': return renderResults(app, view);
      case 'archive': return renderArchive(app);
      case 'endless': return renderEndless(app, view.mode);
    }
  } catch (e) {
    fatal(e);
  }
}

const routeFromHash = () => normalizeRoute(parseRoute(location.hash), dateKey());

const app: App = {
  root,
  get today() { return dateKey(); },
  getState: () => state,
  setState(next) {
    state = next;
    saveState(localStorage, state);
  },
  go(view, replace = false) {
    const hash = toHash(view);
    if (replace) { history.replaceState(null, '', hash); draw(view); }
    else if (location.hash === hash || (hash === '#/' && !location.hash)) draw(view);
    else location.hash = hash; // the hashchange listener draws it, so Back/Forward and refresh work
  },
};

window.addEventListener('hashchange', () => draw(routeFromHash()));
window.addEventListener('error', (e) => fatal(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));
// Another tab changed the save: pick it up (and refresh the home screen if that's what's showing).
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state = loadState(localStorage);
  if (current.name === 'home') draw(current);
});

const soundBtn = document.createElement('button');
soundBtn.className = 'sound';
const paintSound = () => { soundBtn.textContent = isMuted() ? '🔇' : '🔊'; soundBtn.setAttribute('aria-label', isMuted() ? 'Sound off' : 'Sound on'); };
soundBtn.addEventListener('click', () => { setMuted(!isMuted()); paintSound(); });
paintSound();
document.body.appendChild(soundBtn);

mountBackdrop();
draw(routeFromHash());
