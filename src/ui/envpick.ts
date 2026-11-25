import { envFromSeed, isEnvId, type EnvId } from '../logic/environments';

const MAP = 'military-krillion:envs';
const LAST = 'military-krillion:lastenv';
/** Debug/testing: set localStorage["military-krillion:env"] to an environment id to force it. */
const FORCE = 'military-krillion:env';

/**
 * Picks the scenery for a run. It is random between runs, never the same as the previous run, and remembered per run
 * so refreshing mid-run keeps the same landscape.
 */
export function pickEnvironment(runKey: string): EnvId {
  try {
    const forced = localStorage.getItem(FORCE);
    if (isEnvId(forced)) return forced;
    const map = JSON.parse(localStorage.getItem(MAP) ?? '{}') as Record<string, string>;
    if (isEnvId(map[runKey])) return map[runKey] as EnvId;
    const last = localStorage.getItem(LAST);
    const env = envFromSeed(`${runKey}|${Math.random()}`, isEnvId(last) ? last : undefined);
    const keys = Object.keys(map);
    if (keys.length > 60) delete map[keys[0]];
    map[runKey] = env;
    localStorage.setItem(MAP, JSON.stringify(map));
    localStorage.setItem(LAST, env);
    return env;
  } catch {
    return envFromSeed(`${runKey}|${Math.random()}`);
  }
}
