export const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Animates a number inside `el` from 0 to `to` (e.g. "+0.90"). Skips straight to the end for reduced motion. */
export function countUp(el: HTMLElement, to: number, opts: { ms?: number; prefix?: string; delay?: number } = {}): void {
  const { ms = 700, prefix = '', delay = 0 } = opts;
  const show = (v: number) => { el.textContent = `${prefix}${v.toFixed(2)}`; };
  if (reducedMotion()) return show(to);
  show(0);
  let start = 0;
  const step = (t: number) => {
    if (!el.isConnected) return;
    if (!start) start = t;
    const p = Math.min(1, (t - start) / ms);
    show(to * (1 - (1 - p) ** 3)); // ease-out
    if (p < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), delay);
}

/** Particle burst centred on `anchor`, drawn inside the positioned `host`. */
export function burst(host: HTMLElement, anchor: HTMLElement, count = 18, color = 'var(--accent)'): void {
  if (reducedMotion()) return;
  const h = host.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const x = a.left - h.left + a.width / 2;
  const y = a.top - h.top + a.height / 2;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 50 + Math.random() * 70;
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;--c:${color}`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}
