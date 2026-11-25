import { pruneRuns } from '../logic/progress';
import { newRunSeed } from '../logic/seed';
import type { Mode } from '../logic/types';
import type { App } from './dom';

/** Starts a fresh Unlimited run: a new random seed means a new random set of prompts. Never ranked, never counted in daily stats. */
export function startRun(app: App, mode: Mode): void {
  app.setState(pruneRuns(app.getState()));
  app.go({ name: 'dive', mode, date: newRunSeed(), archive: true });
}
