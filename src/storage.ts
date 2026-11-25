import type { SaveState } from './logic/types';
import { emptyState } from './logic/progress';
import { sanitizeState } from './logic/save';

export const STORAGE_KEY = 'military-krillion:v1';

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function loadState(storage: KV): SaveState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(storage: KV, state: SaveState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: keep playing in memory */
  }
}
