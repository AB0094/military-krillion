# Military Krillion

A daily military-trivia game. You type one answer per prompt and score by **how rare** your answer is. Rarer answers score more points, and points fly your HARM further. Vite + vanilla TypeScript, Vitest, no backend; progress lives in `localStorage`.

**Live site:** https://ab0094.github.io/military-krillion/

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run validate   # checks data/prompts.json (missing fields, duplicate answers/aliases)
npm run typecheck
npm run build      # static site in dist/ (relative base, works on any static host or sub-path)
```

## Look

The menu is a dusk airfield: stars, hills, a lit runway, drifting cloud, a carrier jet with a HARM passing over and a tank patrolling. Home is organised as Today's missions (Ground, Air, Ranked), Free play (Endless and Unlimited), then your Service record and the Airfield ladder. Styles for the overhaul are the `v11` block at the end of `src/style.css`; the scene is `src/ui/backdrop.ts`.

## Modes

| Mode | What it is |
|---|---|
| **Limited** | The daily sets: Ground, Air and Ranked. Seven prompts each, the same for every player on a date. Ranked also moves a separate Elo-style rating. The Archive replays past days, unranked. |
| **Unlimited** | Free dives: fresh random 7-prompt runs, as many as you like. Nothing touches your streak, rating or daily stats. |
| **Endless** | Random questions with no end, getting harder as you go. Three lives; every miss costs a life and adds DRAG. Lose all three and you crash. |

**All three modes use the same 20-second question timer.** A question that times out counts as incorrect: it scores 0 and takes the mode's usual penalty (a missed prompt in Limited/Unlimited; a lost life and DRAG in Endless), then moves on by itself after a few seconds. The timer sits in the HUD above the question so it never covers the aircraft. It can be switched off in the *Save data* panel on Home (`src/ui/prefs.ts`); constants are in `src/logic/timer.ts`.

## Scoring (the Krillion formula)

- A round is worth up to **100 points** (`rarity x 100`) and every **point is 10 metres** of distance. A perfect 7-round run is 700 points = **7,000m**.
- `rarity = 1 - (players who gave this answer / players who answered the prompt)`, in whole points. Until a prompt has `MIN_CROWD` (10) local answers the answer's `weight` in the data file is used instead. Wrong answers score 0 and show a short hint.
- Airfield tiers (Chocks Away, Hot Pit, Bingo Fuel, Winchester, Emcon Alpha, Magnum) start at 0m, 1,400m, 2,450m, 3,500m, 4,550m and 5,600m for a 7-round run (`tierMeters`, `src/logic/scoring.ts`).
- Matching ignores case and punctuation, accepts the aliases in the data, and **tolerates spelling mistakes** (`findMatch`, `src/logic/normalize.ts`): digits are never changed (`F-15` can't become `F-16`), the first letter must match, short designations must be exact, and it refuses when two answers are equally close.

## Rarity ranks

Each answer is ranked by how rare it is. Each rank has its own colours and its own reveal effect, and the presentation escalates:

| Rank | Tier | Points | Reveal |
|---|---|---|---|
| Recruit | Common | 0-19 | quiet grey stamp |
| Recon | Uncommon | 20-39 | green radar-ping rings |
| Vanguard | Rare | 40-59 | blue chevron wipe and shine |
| Apex | Epic | 60-79 | purple lightning and glow |
| Warbringer | Legendary | 80-89 | flames, shockwave, flash, shake |
| Mythic | Mythical | 90-99 | holographic rings, fireworks, sonic ring |
| Transcendent | Highest | 100 | full gold flash, rotating rays, starfield, slow-motion, rainbow text |

The game has no score multipliers, so the ranks are presentation only. Data weights were spread across all seven ranks (`data/prompts.json`).

## The flight

- **What you fly depends on the set.** Air and Ranked runs (and Endless Air/Ranked) fly an AGM-88 **HARM** released from a carrier aircraft. **Ground** runs (and Endless Ground) fly an **APFSDS** dart fired from a main battle tank. The HARM has a rocket flame and smoke trail; the APFSDS round is a bare tungsten rod with a fin assembly, no flame or trail, only a shockwave at the muzzle; Endless lives are shown as that craft.
- **Air launch.** Letterbox bars and a cockpit read-out (KTS, RPM, master-arm), engine start with the HARM armed on the pylon, brakes release and take-off roll with spinning wheels, dust, speed lines and a camera push-in, rotation, gear retract, level-off, **weapon release**, a slow-motion drop, ignition with flash and shockwaves, and the HARM surges ahead while the carrier banks away.
- **Tank launch.** Engine start and sabot loaded, an armour advance with dust and speed lines, a hard halt, the gun lays (servo elevation, laser rangefinder, fire solution), then **FIRE**: muzzle blast, shockwaves, ground dust, recoil, sabot petals flying off, slow motion, and the dart streaks away as the tank is left behind.
- **A different tank at every distance (Ground).** Each 1,000m milestone, a different unoccupied range-target tank rolls in and the dart destroys it: T-55, M60 Patton, T-72B3, Leopard 2A6, M1A2 Abrams, Challenger 2, K2 Black Panther, then Merkava Mk.4, T-90M, Type 99A, Leclerc and round again (`TANK_MODELS`, `src/ui/sprites.ts`). In the other sets the usual milestone set pieces play.
- **Resuming.** A reloaded run replays a short release (carrier fly-in, or tank halt-and-fire) instead of the full intro; reduced motion skips both. Tap skips.
- **Horizontal flight.** The HARM always flies left to right; the world scrolls past it with parallax layers. A rush of speed follows every correct answer.
- **Environments.** Each run picks one at random, never the same as the previous run: Dense Forest, Open Ocean, Vast Plains, Sandy Beach, a Normandy-style Coastal Battlefield (beach obstacles, landing-craft wrecks, smoke and distant blasts, no houses or civilian buildings) and Open Training Grounds (targets, sandbags, watchtower, coloured smoke). All are drawn procedurally on a canvas (`src/ui/horizon.ts`) with smoke, clouds, dust, waves, rain and distant explosions. For testing, set `localStorage["military-krillion:env"]` to an environment id to force one.
- **Distance milestones.** A fictional arcade set piece every 1,000m (decorative, unoccupied props only):

| Distance | Event | Set piece |
|---|---|---|
| 1,000m | Iron Sentinel | fly past an abandoned military vehicle |
| 2,000m | Ghost Watch | pass an unoccupied air-defence installation |
| 3,000m | Silent Signal | a radar installation lights up, then explodes (confined to the prop) |
| 4,000m | Dust Frontier | fly through a dusty battlefield |
| 5,000m | Ocean Phantom | cross a dramatic coastline with waves and smoke |
| 6,000m | Stormbreaker | a stormy battlefield with rain and lightning |
| 7,000m | Beyond the Horizon | giant sunrise, rays, fireworks and a sonic boom |

  Past 7,000m (possible in Endless) there are more: Iron Gauntlet, Ghost Battery, Silent Chorus, Dust Maelstrom, Crimson Tide, Thunder Apex, Beyond Again, then bigger numbered laps. See `src/logic/milestones.ts`.

## Endless rules

- **3 lives, never won back.** Each question has its own 20-second timer.
- **Speed** starts at 600 km/h. A miss adds **DRAG** (a big DRAG banner, shaking, smoke, the world slows) and costs 110, then 150, then 190 km/h. A correct answer recovers 40 km/h, up to +80 on a streak, capped at 800.
- **Distance** per correct answer is `points x 10 m` scaled by speed (1x at 600 km/h, down to 0.25x, up to 1.33x), so staying fast matters. The HUD shows distance, speed, score and lives.
- **Difficulty ramps.** The pool is ordered easy to hard (by whether a common answer exists and how many answers there are) with seeded noise, so early questions are easy and later ones are not (`endlessPromptAt`).
- **Losing.** The third miss triggers an enemy radar lock; a missile hits your craft, its motor fails, it pitches nose-down trailing smoke while the camera follows, then crashes in a large explosion with a dust cloud. The results screen shows score, distance, correct answers and accuracy, with **Retry** and **Main menu**.

## Add prompts

Edit `data/prompts.json` (no code changes needed):

```json
{
  "id": "air-example",
  "mode": "Air",
  "text": "Name an aircraft that ...",
  "detail": "Optional scope line shown under the prompt.",
  "fact": "Optional one-line briefing shown after answering.",
  "answers": [
    { "name": "Su-25", "aliases": ["Su25", "Frogfoot"], "weight": 0.1 }
  ]
}
```

- `id` is unique; `mode` is `"Ground"` or `"Air"`. Each mode needs at least 7 prompts.
- `weight` (0 to 1] is the fallback rarity: 0.1 Recruit, 0.3 Recon, 0.55 Vanguard, 0.7 Apex, 0.85 Warbringer, 0.9 Mythic, 1.0 Transcendent.
- List every variant, export version and common alias of a valid answer so players aren't marked wrong for being right.
- Run `npm run validate`.

## Layout

```
data/prompts.json      prompts and answers
scripts/               validate-data.ts
src/logic/             pure functions + tests (normalize, seed, scoring, endless, milestones, environments, elo, share, route, save, progress...)
src/ui/horizon.ts      the canvas scenery engine (environments, airfield, props, set pieces, weather)
src/ui/dive.ts         the flight scene: take-off, HUD, timer, answers, DRAG, crash
src/ui/rarity.ts       rarity reveal effects;  src/ui/explosion.ts pixel explosions;  src/ui/sprites.ts pixel sprites
src/ui/                home, results, archive, endless screens
```

## Save data and stability

- Saves are validated on load (`sanitizeState`): corrupt or hand-edited saves lose only the bad parts, derived values are recomputed.
- Hash routes (`#/dive/...`, `#/endless/...`) make refresh and Back work. A run in progress survives a refresh.
- The *Save data* panel on Home copies, imports or resets your save and toggles the timer.
- Fonts: Silkscreen and VT323 (SIL Open Font License), self-hosted in `src/fonts/`.

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which validates the data, runs the tests, builds, and publishes `dist/`. One-time setup: Settings, Pages, Source = **GitHub Actions**. Relative paths and hash routes mean it works under the repo sub-path with no extra config.
