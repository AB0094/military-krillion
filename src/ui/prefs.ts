const TIMER_KEY = 'military-krillion:timer';

/** The 20-second question timer is on by default; players can turn it off for relaxed play. */
export function timerEnabled(): boolean {
  try { return localStorage.getItem(TIMER_KEY) !== 'off'; } catch { return true; }
}

export function setTimerEnabled(on: boolean): void {
  try { localStorage.setItem(TIMER_KEY, on ? 'on' : 'off'); } catch { /* preference just won't persist */ }
}
