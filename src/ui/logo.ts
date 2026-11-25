import { harmSprite, missileSprite } from './sprites';

/** A small vertical missile, used as the pin on the airfield ladder. */
export function missileSvg(cls = 'missile'): string {
  return missileSprite(cls);
}

/** The mascot: a HARM anti-radiation missile in level flight. */
export function logoSvg(cls = 'missile logo'): string {
  return harmSprite(cls);
}
