/** Small inline icons, drawn in currentColor. */
export const ICONS = {
  Ground: `<svg viewBox="0 0 48 32" class="icon" aria-hidden="true"><g fill="currentColor"><rect x="3" y="21" width="42" height="9" rx="4.5" opacity=".55"/><path d="M8 21l3-7h24l4 7z"/><rect x="16" y="9" width="15" height="7" rx="2.5"/><rect x="29" y="11" width="18" height="3" rx="1.5"/></g></svg>`,
  Air: `<svg viewBox="0 0 48 32" class="icon" aria-hidden="true"><path fill="currentColor" d="M24 1l3.6 10.5L47 21.5v3.2l-19.6-3.4-.9 7.5 4.5 1.9V32H16.9v-1.3l4.5-1.9-.9-7.5L1 24.7v-3.2l19.4-10z"/></svg>`,
  Ranked: `<svg viewBox="0 0 48 32" class="icon" aria-hidden="true"><g fill="currentColor"><path d="M24 2l4.4 9 9.9 1.4-7.2 7 1.7 9.9L24 24.6l-8.8 4.7 1.7-9.9-7.2-7 9.9-1.4z"/></g></svg>`,
  Unlimited: `<span class="u-inf" aria-hidden="true">∞</span>`,
} as const;
