# Military Krillion

A daily military-trivia game. Everyone gets the same 7 prompts per day; you type one answer per prompt and score by **how rare** your answer is. Your total is your **depth**.

Vite + vanilla TypeScript, Vitest, no backend. Progress lives in `localStorage`.

## Live site

https://ab0094.github.io/military-krillion/

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test, check, build

```bash
npm test           # unit tests (Vitest)
npm run validate   # checks data/prompts.json (missing fields, duplicate answers/aliases)
npm run typecheck
npm run build      # static site in dist/ (relative base, works on any static host or sub-path)
npm run preview    # serve dist/ locally
```

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which validates the data, runs the tests, builds, and publishes `dist/` to GitHub Pages. One-time setup: in the repository go to Settings, Pages, and set Source to **GitHub Actions**. The site is then at `https://<your-username>.github.io/<repo-name>/`. The build uses relative paths and hash routes, so it works under that sub-path with no extra configuration.

## How it works

- **Daily set**: `dailySet(date, mode, prompts)` shuffles the mode's prompts with a PRNG seeded by the date and takes 7. Ranked takes 4+3 (or 3+4) from the same Ground and Air daily sets, mixed.
- **Matching**: case-insensitive and punctuation/space-insensitive (`Mi-28N` = `mi28n`), plus the aliases in the data.
- **Spelling tolerance**: a typo like "Eurofigter Typhon" still counts and is flagged "Spelling corrected". The rules (`findMatch` in `src/logic/normalize.ts`): digits are never changed (so `F-15` can't become `F-16`), the first letter must match, short designations (under 5 characters) must be exact, one typo is allowed up to 7 characters and two beyond that, and it refuses if two different answers are equally close.
- **Points and metres** (the Krillion formula): a round is worth up to **100 points** (`rarity x 100`) and every **point is 10 metres** of depth. A perfect 7-round dive is 7 x 100 = 700 points = **7,000m**. HUD, results and the airfield gauge are in metres; the airfields sit at 0m, 1,400m, 2,450m, 3,500m, 4,550m and 5,600m for a 7-round dive. Rarity is always whole points. See `depthPoints`, `depthMeters` and `tierMeters` in `src/logic/scoring.ts`.
- **Rarity names** are security classifications: Unclassified (0-19 points), Restricted (20-39), Confidential (40-59), Secret (60-79) and Cosmic Top Secret (80-100). They also drive the share squares.
- **Score**: `rarity = 1 - (players who gave this answer / total players who answered)`. Until a prompt has `MIN_CROWD` (10) local answers, the answer's `weight` is used instead. Wrong answers score 0 and show a short hint.
- **Depth** = sum of the 7 rarities. Tiers use average rarity per prompt, and each tier is an airfield in a different country (`TIERS` in `src/logic/scoring.ts`):

  | Avg rarity | Tier | Airfield |
  |---|---|---|
  | 0% | Chocks Away | Ramstein AB, Germany |
  | 20% | Hot Pit | Incirlik AB, Türkiye |
  | 35% | Bingo Fuel | Kadena AB, Japan |
  | 50% | Winchester | RAF Akrotiri, Cyprus |
  | 65% | Emcon Alpha | Pituffik SB, Greenland |
  | 80% | Magnum | Groom Lake, United States |

  The Home screen shows a depth ladder: deeper tiers stay "Classified" until you reach them.
- **After each answer** you see the full board of valid answers with their rarity, so you learn what the deep cuts were.
- **Streaks**: consecutive days with a completed live set. A streak survives until the end of the day after your last play.
- **Pixel-sea look**: every screen sits on a pixel-art sea (carrier, jets, clouds, fish, scanlines). The Dive screen is a full-screen scene: a tall world with a camera that follows the missile down, a depth gauge on the right with one airfield per depth, pixel HUD panels (depth, progress pips, current airfield) and an answer bar at the bottom. Sprites are defined as strings in `src/ui/sprites.ts` and drawn as crisp SVG, so there are no image files.
- **Launch intro**: each new run opens with a jet taking off from the carrier and dropping the missile, which splashes in and sinks to its start position. Tap to skip; it is skipped automatically under `prefers-reduced-motion` and when resuming a run.
- **Fonts**: Silkscreen and VT323 (both SIL Open Font License), self-hosted in `src/fonts/`.
- **Descent shaft** (superseded by the scene above; kept for the rules): on the Dive screen the missile sits in a vertical shaft with one airfield per depth. Each correct answer sends it down by the rarity it earned; crossing a tier threshold shows an "Arrived" banner for that airfield. A wrong answer cancels the launch: the answer is struck out, a stamp appears, and the missile aborts in place (the one-answer-per-prompt rule is unchanged).
- **Mascot**: an anti-radiation missile (`src/ui/logo.ts`). It rides the progress track while you dive.
- **Ranked rating**: starts at 1000, stored in its own field (`ratings.ranked`), updated once when a live Ranked day completes. `updateRating` in `src/logic/elo.ts` compares your depth to the day's median depth. Without shared player data the median is a reference value derived from the answer weights.
- **20-second timer**: every question has a countdown bar. It turns red and ticks in the last 5 seconds. When it hits zero the question counts as a miss (no score, flagged "Time's up"). Turn it off in the Save data panel on Home for relaxed play (`timerEnabled` in `src/ui/prefs.ts`). Constants live in `src/logic/timer.ts`.
- **Endless mode** ("Survive the sky"): random questions with no end, in Ground, Air or Mixed, played in an open-sky scene. You have 3 lives (HARMs). A wrong answer or timeout costs one: enemy missiles streak past for a near miss. Lose the last one and your HARM is intercepted mid-air (flash, fireball, debris, screen shake). Lives never come back. Depth is the sum of rarity; tiers use a 14-prompt scale (`ENDLESS_SCALE`). The game keeps your best depth, correct count and streak, and a run in progress survives a refresh. Rules and tests are in `src/logic/endless.ts`; the scene engine is `src/ui/dive.ts`.
- **Unlimited**: endless play on top of the daily sets. Each run uses a new random seed (`newRunSeed`), so it is a fresh set of 7 in Ground, Air or Mixed, with "Dive again" on the results screen. Unlimited runs are archive-style: they never touch your streak, daily stats, player data or Ranked rating, and only the latest 40 are kept in the save.
- **Archive**: replay any of the last 30 days. Archive plays never affect stats, player data or rating.
- **v1 is local-only**: "players" means this browser's history. A backend would replace the `crowd` data and the median; none is included.

## Feel

- **Animations**: screens rise in; the missile flies along the track with an exhaust trail on every answer; scores and the final depth count up; rare answers get a particle burst; misses shake and flash; board bars fill in; the missile drops onto your tier on the ladder. All motion is off under `prefers-reduced-motion`.
- **Rarity badges**: Common, Uncommon, Rare, Ultra rare (`rarityLabel`, same cut-offs as the share squares).
- **Briefings**: each prompt has an optional `"fact"` shown after you answer.
- **Sound**: small synthesized cues (no audio files), toggled by the speaker button; the choice is remembered.

## Free dives vs Endless

- **Free dives** (formerly "Unlimited"): relaxed 7-prompt runs, no lives, as many as you like.
- **Endless**: the lives-and-timer survival mode above.

## Stability

- **Save data is validated on load** (`sanitizeState`): corrupt or hand-edited saves lose only the bad parts, derived fields (depth, completion) are recomputed, and values are clamped.
- **Hash routes** (`#/dive/Ground/2026-11-25`) make refresh and the Back button work. Live play is only allowed for today and archive play only for past days; anything else goes Home.
- **Changed data is safe**: a stored session whose prompt set no longer matches the data file is ignored rather than crashing.
- **Midnight rollover** switches the Home screen to the new set; a countdown shows when it happens.
- **Error screen** with Reload / Reset instead of a blank page. Double-submit is guarded. Other tabs' saves are picked up.
- **Save data panel** (Home): copy your save, import one, or reset everything.

## Add prompts

Edit `data/prompts.json` (no code changes needed):

```json
{
  "id": "air-example",
  "mode": "Air",
  "text": "Name an aircraft that ...",
  "fact": "Optional one-line briefing shown after answering.",
  "answers": [
    { "name": "Su-25", "aliases": ["Su25", "Frogfoot"], "weight": 0.1 }
  ]
}
```

- Prompt styles in the data today: platform to weapon ("Name a weapon that the Su-30 can fire"), weapon to platform ("Name an aircraft that can fire S-8 rockets"), families (MANPADS, ATGMs, APS), country or role lists (Indian Air Force fighters, 8x8 vehicles) and ammunition or caliber questions. Mix them freely.
- Optional `detail` (shown under the prompt: what counts) and `fact` (shown after answering). Both are checked by the data tests.
- `id` is unique; `mode` is `"Ground"` or `"Air"`.
- `weight` (0 to 1] is the fallback rarity. Conventions: very common 0.1, common 0.3, less common 0.55, rare 0.9.
- Aliases only need real alternatives; punctuation and case are already ignored.
- Run `npm run validate`. Each mode needs at least 7 prompts for a full daily set. Answer lists should be as complete as you can make them: list every variant, export version and common alias of a valid answer so players aren't marked wrong for being right.

## Layout

```
data/prompts.json      prompts and answers
scripts/               validate-data.ts
src/logic/             pure functions + tests (normalize, seed, scoring, elo, share, validate, progress, route, save, stats)
src/storage.ts         localStorage persistence
src/ui/                screens (home, dive, results, archive) + ladder, logo, settings
```
