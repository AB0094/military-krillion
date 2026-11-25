import type { SaveState } from '../logic/types';
import type { Route } from '../logic/route';
import { missileSvg } from './logo';

export type View = Route;

/** What screens get from main.ts. Screens never touch localStorage or globals directly. */
export interface App {
  root: HTMLElement;
  /** Today's local date; re-read on every access so it rolls over at midnight. */
  readonly today: string;
  getState(): SaveState;
  setState(next: SaveState): void;
  go(view: View, replace?: boolean): void;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fmt(n: number): string {
  return n.toFixed(2);
}

export function header(subtitle: string): string {
  return `<header class="brand"><span class="logo-box">${missileSvg('missile logo')}</span><div><h1>Military Krillion</h1><p>${esc(subtitle)}</p></div></header>`;
}

export function on(root: ParentNode, selector: string, handler: (el: HTMLElement) => void): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => el.addEventListener('click', () => handler(el)));
}
