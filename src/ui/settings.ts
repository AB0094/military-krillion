import { emptyState } from '../logic/progress';
import { parseSave, serializeSave } from '../logic/save';
import { on, type App } from './dom';
import { setTimerEnabled, timerEnabled } from './prefs';

export function settingsHtml(): string {
  return `<details class="card settings"><summary>Save data</summary>
    <p class="muted small">Progress is stored only in this browser. Copy it to back it up or move it to another device.</p>
    <label class="check"><input type="checkbox" id="timer-pref" ${timerEnabled() ? 'checked' : ''} /> 20-second question timer</label>
    <div class="row"><button class="btn small-btn" id="export">Copy save to clipboard</button><button class="btn small-btn danger" id="reset">Reset everything</button></div>
    <textarea id="import-text" rows="3" placeholder="Paste a save here to import it"></textarea>
    <button class="btn small-btn" id="import">Import save</button>
    <p class="muted small" id="settings-msg" role="status"></p>
  </details>`;
}

export function bindSettings(app: App): void {
  const msg = (t: string) => { app.root.querySelector('#settings-msg')!.textContent = t; };
  app.root.querySelector<HTMLInputElement>('#timer-pref')?.addEventListener('change', (e) => setTimerEnabled((e.target as HTMLInputElement).checked));
  on(app.root, '#export', async () => {
    try { await navigator.clipboard.writeText(serializeSave(app.getState())); msg('Save copied.'); }
    catch { msg('Clipboard blocked. Use the browser dev tools to read localStorage instead.'); }
  });
  on(app.root, '#import', () => {
    const text = app.root.querySelector<HTMLTextAreaElement>('#import-text')!.value.trim();
    const r = parseSave(text);
    if (!r.ok) return msg(r.error);
    if (!confirm('Replace your current progress with this save?')) return;
    app.setState(r.state);
    app.go({ name: 'home' });
  });
  on(app.root, '#reset', () => {
    if (!confirm('Delete all progress, stats and your Ranked rating? This cannot be undone.')) return;
    app.setState(emptyState());
    app.go({ name: 'home' });
  });
}
