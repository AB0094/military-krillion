import { hashString } from './seed';

export const ENVIRONMENTS = [
  { id: 'forest', name: 'Dense Forest' },
  { id: 'ocean', name: 'Open Ocean' },
  { id: 'plains', name: 'Vast Plains' },
  { id: 'beach', name: 'Sandy Beach' },
  { id: 'normandy', name: 'Coastal Battlefield' },
  { id: 'training', name: 'Training Grounds' },
] as const;

export type EnvId = (typeof ENVIRONMENTS)[number]['id'];
export const ENV_IDS: readonly EnvId[] = ENVIRONMENTS.map((e) => e.id);
export const isEnvId = (s: unknown): s is EnvId => ENV_IDS.includes(s as EnvId);

/** Picks an environment from a seed. If it equals `avoid` (the previous run's), the next one is used instead. */
export function envFromSeed(seed: string, avoid?: EnvId): EnvId {
  let i = hashString(`env|${seed}`) % ENV_IDS.length;
  if (avoid && ENV_IDS[i] === avoid) i = (i + 1) % ENV_IDS.length;
  return ENV_IDS[i];
}
