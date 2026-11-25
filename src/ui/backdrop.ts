import { cloudSprite, dartSprite, harmSprite, jetSprite, tankSprite, TANK_MODELS } from './sprites';

/** The fixed pixel-art dusk airfield behind the menu screens: stars, hills, a runway, drifting cloud, a jet carrying a HARM and a patrolling tank. */
export function mountBackdrop(): void {
  if (document.getElementById('bg')) return;
  const el = document.createElement('div');
  el.id = 'bg';
  el.setAttribute('aria-hidden', 'true');
  const stars = Array.from({ length: 46 }, (_, i) => `<i class="bg-star" style="left:${(i * 53) % 100}%;top:${(i * 29) % 46}%;--t:${2 + (i % 5)}s;--dl:-${(i * 7) % 6}s;--sz:${i % 7 === 0 ? 3 : 2}px"></i>`).join('');
  const clouds = [0, 1, 2, 3].map((i) => `<span class="bg-cloud" style="top:${8 + i * 7}vh;--d:${90 + i * 30}s;--delay:-${i * 31}s;--s:${i % 2 ? 1.1 : 0.7}">${cloudSprite()}</span>`).join('');
  const lights = Array.from({ length: 26 }, (_, i) => `<i style="left:${i * 4.2}%"></i>`).join('');
  el.innerHTML = `<div class="bg-sky"></div><div class="bg-sun"></div>${stars}${clouds}
    <div class="bg-hills far"></div><div class="bg-hills near"></div>
    <div class="bg-ground"><div class="bg-runway"></div><div class="bg-lights">${lights}</div></div>
    <div class="bg-jet"><span class="bg-jet-body">${jetSprite()}</span><span class="bg-jet-harm">${harmSprite()}</span></div>
    <div class="bg-tank">${tankSprite(TANK_MODELS[4])}</div>
    <div class="bg-dart">${dartSprite()}</div>
    <div class="scan"></div><div class="bg-fade"></div>`;
  document.body.prepend(el);
}
