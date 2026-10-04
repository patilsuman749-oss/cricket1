# ScoreX

**Every Ball. Every Run. Every Moment.**

Offline-first, mobile-first cricket scoring in the browser. Set up teams in a few taps, score ball by ball with one thumb, undo mistakes, and keep every match on the device (IndexedDB). No framework, no build step.

## Run it

```bash
npm start              # python3 -m http.server 4173  → open http://localhost:4173
```

Serve over HTTP (not `file://`) — ES modules and the service worker need it. Any static host works (GitHub Pages, Netlify, Vercel): upload the folder as-is.

## Tests

```bash
npm run check          # syntax of every file + version/service-worker wiring
npm test               # 38 unit tests: scoring engine + setup validation (no browser needed)
npm i -D puppeteer     # once, for the browser tests
npm run test:e2e       # 37 real-browser checks (set CHROME_PATH to use an existing Chrome)
npm run test:all       # all of the above
```

The e2e suite drives headless Chromium through the exact Step 2 → Step 3 scenario, scoring (every run value, extras, wickets, undo, edit, innings, result), refresh recovery, IndexedDB contents, export/import, theme, five phone widths + desktop, offline mode and a service-worker version update.

## What was wrong, and what changed in v2

### "Enter a name for player 1" on Step 2 — root cause
Validation lived in ad-hoc `if (step === n)` branches inside one click handler, and every problem was reported through a **single global toast with no idea which step it belonged to**. Any path that ran the player check (START MATCH, a stale cached bundle, a stray extra tap, a re-render) surfaced `"<team>: enter a name for player 1."` on whatever screen was showing.

Fix (`src/pages/setup-validation.js`):

- One validator **per step**: `validateFormatStep`, `validateTeamsStep`, `validatePlayersStep`, `validateTossStep`, `validateConfirmationStep`. `advance()` runs **only the current step's** validator.
- Every error is tagged: `{ step: 'players', field: 'team1-player-1', message: '…' }`. The UI renders only `visibleErrors()` = errors whose `step` equals the active step, so a player error **cannot** appear on Format/Teams/Toss/Confirm.
- Errors are wiped on Back, step change, successful Next, every edit (team/player/toss/format), add/remove player, and when a new setup is created.
- START MATCH runs each step's own validator in order and jumps to (and shows) the first step that fails.
- Messages for players name the team, e.g. `Team A: enter a name for Player 1`.

### Slow scoring
Each ball used to `structuredClone` the whole match (growing with the innings) and often rebuilt the page. Now:

- The delivery list is the **only** stored truth; score, stats, partnership and over summaries are **derived** (`deriveInnings`) in microseconds and never persisted. Undo = remove the last delivery and re-derive, so it is exact by construction.
- The live screen is built **once**; each tap patches only the changed text nodes and list rows (`updateLive`). Measured in headless Chromium: **~1 ms average, 6 ms worst** per tap over 120 balls, zero DOM sections replaced.
- Saving is a coalescing queue (`storage/saveQueue.js`) that runs *after* the screen updates; one IndexedDB connection, one write in flight, flush on tab hide/close.
- One delegated listener set, registered once (guarded); one reused `AudioContext`.

### Stale code after updates
`service-worker.js` now derives its cache name from `version.js`, deletes every other cache on activate, and fetches HTML/JS/CSS **network-first with `cache:'no-cache'`** (cache only when offline). `index.html` loads CSS/JS with `?v=<version>`, and the worker is registered with `updateViaCache:'none'`. When a new version installs, a **Reload** banner appears — it never reloads mid-over.

**Deploy checklist:** bump `version.js` **and** `package.json` (`npm run check` verifies they match and that every module is precached).

## Using the app

1. **New Match** → *Format* (T5/T10/T20/T30/T50/custom) → *Teams* (names + colours) → *Players* (**names only**, two per team to start, **Add Player** for more, trash icon removes extras, minimum 2) → *Toss* (winner + bat/bowl, nothing is pre-selected) → *Confirm*.
2. Choose striker, non-striker and opening bowler, then score.
3. **Wide**: enter the total wide runs (1 = just the wide). **No Ball**: runs off the bat (+ optional byes). **Bye / Leg Bye**: runs run. **Wicket**: how out, who is out (either batter for a run-out), ball type (normal/wide/no-ball), runs completed for a run-out, and the new batter.
4. **Undo** removes the whole last ball (repeatable, even the winning ball). **Edit Last Ball** replaces it in one step and keeps the original if the new ball is invalid. **Change Strike** is a manual correction.
5. After the 6th legal ball the bowler picker opens (the bowler of the previous over is disabled).

### Rules implemented (see `src/scoring/engine.js`)
- Over = exactly 6 **legal** balls. Wides and no-balls are not legal; byes and leg-byes are. No 7th legal ball is possible.
- Strike: odd *runs run* change ends; end of a legal over swaps. A wide counts as 1 penalty + runs run (a plain wide does not change strike); a no-ball likewise.
- Bowler is charged for bat runs, wides and the no-ball penalty — **not** byes/leg-byes. Bowled/caught/LBW/stumped/hit-wicket credit the bowler; run-out/retired/other do not.
- Wides: only run-out, stumped, hit-wicket, other are possible. No-balls: only run-out (and other).
- **Retired** records a wicket against the batter without using a ball.
- An innings ends at the over limit, when a chase reaches the target, or when **players − 1** wickets have fallen (so a 2-a-side team is all out after one wicket). A wicket needs a valid replacement unless it ends the innings.
- Scoring is blocked after the innings/match ends; a dismissed batter can never return; striker ≠ non-striker.

## Project layout

```text
index.html  version.js  service-worker.js  manifest.webmanifest
src/
  app.js                 boot, routing, ONE delegated listener set, action table
  state/store.js         app state
  scoring/engine.js      pure scoring engine (history = truth, derived stats)
  scoring/calculations.js scorecard / partnership helpers
  storage/db.js          IndexedDB (single shared connection)
  storage/saveQueue.js   coalescing, non-blocking autosave + status
  services/              theme, share, cloud/auth, SW updates
  pages/                 setup-validation.js, setup.js, live.js, live-modals.js,
                         home, history, settings, scorecard, result
  components/            ui.js (toast, modal, focus trap), icons.js
  styles/app.css         design system (light + dark, mobile-first)
  data/ utils/           constants, helpers
tests/                   unit tests (*.test.mjs) and tests/e2e (real browser)
scripts/syntax-check.mjs
```

## Data storage
Matches are stored as **delivery history + minimal state** (no derived numbers). Derived player and score statistics are rebuilt when a match is loaded, so Match History can show the batting and bowling performance from every completed match without storing duplicate statistics.

## Not in this version (by design)
No cloud, Google login, live spectators, leaderboards or tournaments — nothing is faked. The match record has a unique `matchId` and `cloud` marker, storage and services are isolated, and derived state is recomputable, so a Firebase sync layer, auth and an Android WebView/TWA wrapper can be added without touching the scoring engine.

## Known limits
- Verified in headless Chromium (Puppeteer). Safari/iOS, Firefox and real-device vibration/sound/share sheet have not been exercised here.
- Fonts use the system stack (no external requests), so the app is fully offline.
- Per-ball player/pace/jersey/role metadata was intentionally removed; older records keep working (extra fields are ignored).
