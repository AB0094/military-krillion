import { missileSprite } from './sprites';

/** The mascot: a pixel-art anti-radiation missile, nose down. CSS rotates it where a horizontal one is needed. */
export function missileSvg(cls = 'missile'): string {
  return missileSprite(cls);
}
