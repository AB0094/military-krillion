# Military Krillion

A daily military-trivia game. Everyone gets the same 7 prompts per day; you type one answer per prompt and score by **how rare** your answer is. Your total is your **depth**.

Vite + vanilla TypeScript, Vitest, no backend. Progress lives in `localStorage`.

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
- **Mascot**: an anti-radiation missile (`src/ui/logo.ts`). It rides the progress track while you dive.
- **Ranked rating**: starts at 1000, stored in its own field (`ratings.ranked`), updated once when a live Ranked day completes. `updateRating` in `src/logic/elo.ts` compares your depth to the day's median depth. Without shared player data the median is a reference value derived from the answer weights.
- **Archive**: replay any of the last 30 days. Archive plays never affect stats, player data or rating.
- **v1 is local-only**: "players" means this browser's history. A backend would replace the `crowd` data and the median; none is included.

## Feel

- **Animations**: screens rise in; the missile flies along the track with an exhaust trail on every answer; scores and the final depth count up; rare answers get a particle burst; misses shake and flash; board bars fill in; the missile drops onto your tier on the ladder. All motion is off under `prefers-reduced-motion`.
- **Rarity badges**: Common, Uncommon, Rare, Ultra rare (`rarityLabel`, same cut-offs as the share squares).
- **Briefings**: each prompt has an optional `"fact"` shown after you answer.
- **Sound**: small synthesized cues (no audio files), toggled by the speaker button; the choice is remembered.

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
