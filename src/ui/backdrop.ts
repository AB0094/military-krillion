import { carrierSprite, cloudSprite, fishSprite, jetSprite } from './sprites';

/** The fixed pixel-art sea scene behind the non-dive screens. */
export function mountBackdrop(): void {
  if (document.getElementById('bg')) return;
  const el = document.createElement('div');
  el.id = 'bg';
  el.setAttribute('aria-hidden', 'true');
  const clouds = [0, 1, 2, 3].map((i) => `<span class="bg-cloud" style="top:${2 + i * 3.2}vh;--d:${70 + i * 25}s;--delay:-${i * 23}s;--s:${i % 2 ? 1 : 0.7}">${cloudSprite()}</span>`).join('');
  const fish = Array.from({ length: 12 }, (_, i) => `<span class="bg-fish${i % 2 ? ' flip' : ''}" style="top:${30 + ((i * 17) % 62)}vh;--dur:${45 + (i * 13) % 40}s;--delay:-${(i * 11) % 45}s">${fishSprite(i, 'rgba(3,15,34,.6)')}</span>`).join('');
  const bubbles = Array.from({ length: 16 }, (_, i) => `<i class="bg-bub" style="left:${(i * 37) % 100}%;--d:${9 + (i * 3) % 10}s;--delay:-${(i * 5) % 14}s"></i>`).join('');
  el.innerHTML = `<div class="bg-sky"></div><div class="bg-sea"></div>${clouds}
    <div class="bg-ship">${carrierSprite()}</div><div class="bg-line"></div>
    <div class="bg-jet">${jetSprite()}</div>${fish}${bubbles}<div class="scan"></div>`;
  document.body.prepend(el);
}
