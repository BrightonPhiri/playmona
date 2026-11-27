# One Settings Screen, One End Screen: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every game with its own setup has exactly one settings screen: its own.
- Every game, rooms included, finishes on one shared end screen, `FF.EndScreen`.

**Architecture:**
- A new draw-only module, `js/endScreen.js`, renders the end screen from plain data.
- `FF.GameFlow.showResults` (`js/registry.js`) builds that data and the buttons, then calls it.
- Each game stops drawing its own results. It builds a `summary` with a pure `endSummary(...)` and passes it to `api.end`.
- Games with their own setup get `setup: true`. The game page then hides Options, `buildConfig` gives those games the standard platform values, and a shared helper replays the saved setup for Play again.

**Tech Stack:**
- Vanilla ES5 classic scripts on `window.FF`, no build step.
- Node test harness: `tools/test/harness.js` (`loadFF`, `test`, `assert`, `assertEqual`). The `loadGame(base, files)` pattern is in `tools/test/points.test.js`.

**Spec:** `docs/superpowers/specs/2026-11-27-one-settings-one-end-design.md`

## Global Constraints

- Work in the worktree `scratchpad/endscreen`, on branch `feat/one-end-screen` (cut from `feat/points-rebalance`). Never use git in the OneDrive checkout.
- Code style:
  - ES5 only (`var`/`function`; `const`/`let` only where the file already uses them).
  - No new dependencies.
  - Every visible string goes through `FF.t(key, 'English fallback')`. Any string whose meaning changes gets a new key.
- `summary` limits:
  - at most 6 `stats`;
  - with a `ring`, at most 3 `stats`;
  - one of `rounds` or `panel`, and `panel` wins if both are sent.

  Over-limit input is trimmed, never refused.
- End-screen buttons:
  - all one size: the `btn-lg` class on every action, with `primary` adding `btn-primary` only;
  - on phones, a 2-column grid.
- Counting up is skipped when `FF.Settings` is missing, animations are off, or reduce-motion is on. The final number is always in the DOM.
- Daily, friend-challenge and celebration runs keep skipping setup and play the standard settings.
- Baseline suite: `node tools/test/run.js` has 3 known failures (`ch TV display`, `ch timing`, `wordshift data`). No others are allowed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are inputs no task's tests fully exercise. Check each one deliberately in review:
1. **Room ends:** in a room, `summary` comes from this phone's game, but the places come from the room snapshot. A guest's summary must never overwrite the room's ranked rows or points. Task 2's room-path test pins this.
2. **The leaderboard place arriving after the player left the end screen:** `setPlaces` on a detached screen must not throw or draw anywhere. Task 1's test pins this.
3. **Play again for a `setup: true` game whose saved setup is from an older version:** `setupOrReplay` must pass it through the game's `sanitize`, never use it raw. Task 3's test pins this.
4. **A `setup: true` game in a ranked solo run:** the hidden platform Difficulty or Time per turn must not make the run unranked. Task 3's `buildConfig` test pins this.
5. **Pass-the-phone with 2+ players and no `summary.lines`:** the table must still show each player's points, with an empty line slot. Task 1's test pins this.

---

### Task 1: `FF.EndScreen`, the shared end screen

**Files:**
- Create: `js/endScreen.js`
- Modify:
  - `play.html` and `admin.html`: add `<script src="js/endScreen.js"></script>` right after `js/gameUI.js`.
  - `tools/load-check.js` ORDER: add `'js/endScreen.js'` after `'js/gameUI.js'`.
  - `css/styles.css`: add `.end-*` styles next to the `.results__*` block (around line 1114), using the tokens from `css/tokens.css`.
- Test: `tools/test/endScreen.test.js` (new)

**Interfaces:**
- Produces:
  - `FF.EndScreen.trim(summary) -> summary`: a copy with the limits applied. `null` or `undefined` gives `{}`.
  - `FF.EndScreen.render(container, data) -> { setPlaces: function (lines) }`. It clears `container` and draws the screen.
    - `data.kind`: one of `'normal'`, `'daily'`, `'challenge'`, `'celebration'`, `'room'`.
    - `data.title`: the fallback title. `summary.headline` wins over it.
    - `data.ranked`: `[{ id, name, avatar, color, photo, points, isMe }]`, already ranked.
    - `data.summary`: the summary, trimmed inside `render`.
    - `data.xp`: `{ gained, total }` or `null`. The level bar uses `FF.Stats.level(total)` when `FF.Stats` exists.
    - `data.placesPending`: boolean. When true, it shows "Checking the leaderboar…" (`endChecking`) until `setPlaces` is called.
    - `data.gameId`: string.
    - `data.note`: a string, a node, or `null`. It is drawn above the buttons (daily hint, celebration status, waiting-for-host).
    - `data.actions`: `[{ id, label, icon, primary, onClick }]`.
  - `setPlaces(lines)`:
    - `lines` is `[{ period, rank }]`, or empty or `null`.
    - It replaces the pending line with one line per place, using `FF.Leaderboards.placeLine(p, gameId, FF.Leaderboards.threshold())`, or removes the line when there are none.
    - It does nothing once the screen is no longer connected (`!root.isConnected`).
- Section order and classes:
  - `end-badge`
  - `end-kicker`
  - `end-title`
  - `end-score` (1 ranked row) or `end-podium` + `end-table` (2+ rows)
  - `end-best`
  - `end-stats` (and `end-ring`)
  - `end-earned` (XP and places)
  - `end-panel` (a `<details>`, open when `window.matchMedia` exists and `'(min-width: 768px)'` matches)
  - `end-note`
  - `end-actions`

- [ ] **Step 1: Write the failing tests** in `tools/test/endScreen.test.js`.

  - **Load:** `loadFF(['js/core.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js', 'js/endScreen.js'])`.
  - **Helpers (in the test file):**
    - `textOf(el)`: joins `textContent` over the whole stub tree.
    - `findClass(el, cls)`: a depth-first search on `className`.
  - **Tests:**
    - `endScreen: trim keeps 6 stats, 3 with a ring, and panel over rounds`
      - 8 stats give 6.
      - A ring with 5 stats gives 3.
      - `{ rounds: [..], panel: {..} }` gives `rounds === undefined` and the panel kept.
      - `trim(null)` gives `{}`.
    - `endScreen: solo shows the score, the headline and a new best`
      - `ranked` is one row with points 142.
      - The summary is `{ headline: '18 words found!', kicker: 'Mixed · 4 rounds', best: { isNew: true } }`.
      - The text contains `142`, `18 words found!`, `Mixed · 4 rounds` and `New personal best!`.
      - `findClass(root, 'end-podium')` is null.
    - `endScreen: an older best shows the best value`
      - `best: { value: 160 }` gives text containing `160`.
    - `endScreen: 2+ players show a podium and a table row each, lines optional`
      - 3 rows with `lines: { a: '12 words · 75%' }`.
      - `end-podium` is present.
      - `end-table` has 3 row children.
      - The text contains every name and every points value, plus `12 words · 75%`.
      - The rows without a line still show their points.
    - `endScreen: stats tiles and the ring draw their label and value`
    - `endScreen: rounds become the panel list; a panel draw function fills the frame`
      - With `rounds`, 2 items are drawn.
      - With `panel: { title: 'Your cards', draw: function (el) { el.appendChild(FF.ui.div('x', 'hi')); } }`, the text contains `Your cards` and `hi`.
    - `endScreen: XP shows +N XP and the level`
      - `xp: { gained: 16, total: 120 }`, with `FF.Stats = { level: function () { return { level: 2, into: 20, need: 150, progress: 0.13 }; } }`.
      - The text contains `+16 XP` and `Level 2`.
    - `endScreen: places arrive late, replace the checking line, and are ignored once detached`
      - `placesPending: true` gives text with `Checking the leaderboard`.
      - Stub `FF.Leaderboards = { threshold: () => 10, placeLine: () => 'Top 10 this week' }`.
      - `setPlaces([{ period: 'week', rank: 3 }])` gives text with `Top 10 this week`, and the checking line is gone.
      - `setPlaces([])` on a fresh screen removes the line.
      - After `container.removeChild(...)` (the screen detached), `setPlaces([...])` doesn't throw.
    - `endScreen: actions are one size, and the first primary is marked`
      - Every action button's `className` contains `btn-lg`.
      - Only the `primary` one contains `btn-primary`.
      - Clicking calls `onClick` (`dispatch('click')`).

- [ ] **Step 2: Run the tests to watch them fail**
  - Run: `node tools/test/one.js endScreen`
  - Expected: FAIL, because `js/endScreen.js` doesn't exist (load error).

- [ ] **Step 3: Implement `js/endScreen.js`, the HTML script tags, the load-check entry and the `.end-*` CSS.**
  - Build elements with `FF.ui.el/div/span`, `FF.Icons.icon` and `FF.UI.button`.
  - The badge reuses the look of `resultBadge` in `registry.js`. Copy its three lines; don't export it.
  - The rank medals reuse the `rank-medal` markup.
  - Count-up: write the final number into the DOM first, then animate with `requestAnimationFrame` from 0 only when animations are allowed (see Global Constraints).
  - New i18n keys:
    - `endNewBest` 'New personal best!'
    - `endYourBest` 'Your best on these settings: {n}'
    - `endEarned` 'What you earned'
    - `endXp` '+{n} XP'
    - `endLevel` 'Level {n}'
    - `endChecking` 'Checking the leaderboard…'
  - For the default titles, reuse `wellPlayed`, `nrWins` and `itsATie`.

- [ ] **Step 4: Run the tests and the load check**
  - Run: `node tools/test/one.js endScreen` and `node tools/load-check.js`
  - Expected: all endScreen tests PASS, and the load check reports no load errors.

- [ ] **Step 5: Commit**
  - `git add js/endScreen.js tools/test/endScreen.test.js play.html admin.html tools/load-check.js css/styles.css`
  - Message: `feat(end): FF.EndScreen, one shared end screen drawn from data`

### Task 2: GameFlow ends on `FF.EndScreen`

**Files:**
- Modify `js/registry.js`:
  - `end` (line 1063)
  - `showResults` (line 1181)
  - `buildConfig` (line 425): add `replay`
- Modify `js/leaderboards.js`: `afterGame` (line 352) stops calling `celebrate`.
- Test: `tools/test/gameFlow.test.js` and `tools/test/leaderboards.test.js`.

**Interfaces:**
- Consumes: `FF.EndScreen.render` (Task 1).
- Produces:
  - `FF.GameFlow._endActions(kind, ctx) -> [{ id, label, icon, primary, onClick }]`, where `ctx` is `{ hasSetup, canChallenge, isHost }`. The ids, in order:
    - `'normal'`:
      - `playAgain` (primary)
      - `changeSettings` (only when `hasSetup`)
      - `challenge` (only when `canChallenge`)
      - `otherGame`
      - `home`
    - `'daily'`: `dailyBoard` (primary), `home`
    - `'challenge'`: `seeWhoWon` (primary), `home`
    - `'celebration'`: `backToParty` (primary)
    - `'room'`: `playAgain` (primary, host only), `backToRoom`
  - What the buttons do:
    - `playAgain` (normal): calls `FF.GameFlow.launch(id, { skipIntro: true, replay: true })`.
    - `changeSettings`: calls `launch(id, { skipIntro: true })`.
    - The others keep today's targets from `showResults`.
  - `buildConfig` sets `config.replay = !!overrides.replay`.
  - `FF.GameFlow.end(results)`:
    - It reads `FF.Stats.get().xp` before and after `recordResult`, so it knows how much XP was gained.
    - It keeps `results.summary`.
    - On the room path it passes `summary: results.summary` into `showResults`, next to the room's `ranked`.
    - It collects the leaderboard places from one of these, and hands them to `setPlaces`:
      - `FF.Leaderboards.afterGame(...)` (normal runs);
      - `FF.Daily.finish(...)`'s rank, as `[{ period: 'daily', rank }]`;
      - `results.summary.places`, a Promise a server-scored game may send.
  - `FF.Leaderboards.afterGame(cur, results) -> Promise<[{ period, rank }]>`:
    - It no longer opens the dialog, and it still calls `remember`.
    - It resolves with the lines that have a rank.

- [ ] **Step 1: Write the failing tests**
  - In `gameFlow.test.js`:
    - `end screen: normal actions with and without setup and challenge`
      - `_endActions('normal', { hasSetup: true, canChallenge: true })` ids are `['playAgain','changeSettings','challenge','otherGame','home']`.
      - With both false, the ids are `['playAgain','otherGame','home']`.
      - Only `playAgain` is primary.
    - `end screen: daily, challenge, celebration and room actions`
      - The id lists are exactly as in the Interfaces above.
      - With `isHost: false`, the room ids are `['backToRoom']`.
    - `end screen: play again replays, change settings does not`
      - Stub `FF.GameFlow.launch` to record its arguments.
      - Clicking `playAgain` records `{ skipIntro: true, replay: true }`.
      - Clicking `changeSettings` records `{ skipIntro: true }`, and its `replay` is not true.
    - `end screen: a room end keeps the room's places and this phone's summary`
      - Stub `FF.EndScreen.render` to capture `data`.
      - Call `showResults({ results: roomRanked, room: true, summary: { headline: 'Mine', stats: [...] } })` with a stub `FF.Room.current()` returning `{ isHost: true }`.
      - `data.ranked === roomRanked`, `data.summary.headline === 'Mine'`, and `data.kind === 'room'`.
    - `end screen: XP gained is the difference recordResult made`
      - Stub `FF.Stats` so that `get()` returns `{xp: 100}` before and `{xp: 116}` after `recordResult`.
      - Run `end()` on a solo local game. The captured `data.xp` is `{ gained: 16, total: 116 }`.
  - In `leaderboards.test.js`:
    - `leaderboards: afterGame resolves the places without opening a dialog`
      - Stub `FF.UI.dialog` to count calls, and stub `submitGame` to resolve `[{ period: 'week', rank: 4 }, { period: 'all' }]`.
      - It resolves to `[{ period: 'week', rank: 4 }]`.
      - The dialog count is 0, and `remember` was called once.

- [ ] **Step 2: Run the tests to watch them fail**
  - Run: `node tools/test/one.js gameFlow leaderboards`
  - Expected: the new tests FAIL, because `_endActions` is not a function, `render` is never called, and the dialog count is 1. The old tests pass.

- [ ] **Step 3: Implement.** `showResults` becomes:
  - work out `kind`;
  - build `actions` from `_endActions`, with ctx `hasSetup: !!def.setup`, `canChallenge: !!(results.challengeSeed && FF.Challenge)` and `isHost`;
  - build `note` (the daily hint, `FF.CelebrateLibraryRun.status(...)`, or the waiting-for-host line);
  - call `FF.EndScreen.render(screen, data)`;
  - keep the room `FF.Room.on('meta')` hookup, the `FF.Audio.play('winner')` and the confetti.

  Delete the old DOM building in `showResults`. Leave `resultBadge` only if something else still uses it.

- [ ] **Step 4: Run the tests**
  - Run: `node tools/test/one.js gameFlow leaderboards challengeFlow celebrate.library sharedDeal roomScreens`
  - Expected: all PASS.

- [ ] **Step 5: Commit**
  - Message: `feat(end): every game ends on FF.EndScreen; places and XP on the screen, no pop-up`

### Task 3: One settings screen for games with their own setup

**Files:**
- Modify `js/registry.js`:
  - `showDetails` (line 537): the Options section
  - `buildConfig`: give setup games the standard values
- Modify `js/gameUI.js`: add `setupOrReplay`.
- Modify `js/gameLength.js`: add `apply`.
- Test: `tools/test/gameFlow.test.js` and `tools/test/gameUI.test.js`. Create `gameUI.test.js` if it doesn't exist.

**Interfaces:**
- Produces:
  - `def.setup: true` is a registry flag that the game files set (Tasks 4 to 10).
  - `FF.GameFlow._detailsSections(def, config) -> string[]`:
    - a setup game: `['howto', 'players', 'sound']`;
    - any other game: `['howto', 'players', 'options']`.

    `showDetails` renders from this list. The `'sound'` section is the lone Sound effects `switchRow`; `'options'` already contains it.
  - `buildConfig(def, overrides)`: when `def.setup`, it sets `difficulty`, `length`, `timer` and `clock` to `FF.Leaderboards.standard()`, or `{ difficulty: 'normal', length: 'normal', timer: FF.Settings.defaults.timer, clock: 0 }` without Leaderboards. It ignores the saved Settings and overrides for those four keys.
  - `FF.GameUI.setupOrReplay(api, { key, sanitize, show, play })`:
    - if `api.config.replay` and `FF.Storage.get(key, null)` is set, it calls `play(sanitize(saved))`;
    - otherwise it calls `show(play)`.
  - `FF.GameLength.apply(api, { length, clock })`:
    - It sets `api.config.length` and `api.config.clock` (seconds, 0 for none).
    - It then calls `stop()`, and `start(FF.GameFlow.current)` when `timed(api.config)`.

    The game calls it when its own setup starts play, so `rounds()` and `timeUp()` read the game's own choice.

- [ ] **Step 1: Write the failing tests**
  - `details: setup games show no options, others do`
    - `_detailsSections({ setup: true, modes: ['solo'] }, {})` gives `['howto','players','sound']`.
    - `{ modes: ['solo'] }` gives `['howto','players','options']`.
  - `details: a setup game gets the standard difficulty, length, timer and no clock`
    - Stub `FF.Settings.get` to return `'hard'` for difficulty, `40` for timer and `1200` for gameClock, with the stubs `FF.Players` and `FF.Teams`.
    - `buildConfig({ id: 'x', setup: true, modes: ['solo'] }, {})` gives `difficulty 'normal'`, `timer` equal to `FF.Settings.defaults.timer`, and `clock 0`.
    - The same def without `setup` gives `'hard'`.
  - `gameUI: setupOrReplay replays a sanitized saved setup, else shows setup`
    - `replay: true` with a saved `{ rounds: 99 }` and `sanitize` clamping `rounds` to 6: `play` is called with `{ rounds: 6 }`, and `show` is not called.
    - `replay: true` with nothing saved: `show` is called with `play`.
    - `replay: false` with something saved: `show` is called.
  - `gameLength: apply sets the config and starts the clock only when timed`
    - Stub `start` and `stop` to count calls.
    - `apply(api, { length: 'long', clock: 0 })` sets `api.config.length` to `'long'`, with 0 starts.
    - `apply(api, { clock: 600 })` gives 1 start.

- [ ] **Step 2: Run the tests to watch them fail**
  - Run: `node tools/test/one.js gameFlow gameUI`
  - Expected: FAIL, because the functions are missing.

- [ ] **Step 3: Implement the four functions.** In `showDetails`, render the sections from `_detailsSections`.

- [ ] **Step 4: Run the tests**
  - Run: `node tools/test/one.js gameFlow gameUI leaderboards points`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Message: `feat(setup): one settings screen for games with their own setup; Play again replays it`

---

## The game migrations (Tasks 4 to 10)

Every migration task applies the same recipe to each of its games.

**Interfaces, for every game below:**
- Consumes:
  - `summary` from Task 1;
  - `def.setup`, `FF.GameUI.setupOrReplay` and `FF.GameLength.apply` from Task 3;
  - `FF.GameFlow.end` keeping `summary` and `summary.places` (Task 2).
- Produces: `<Namespace>.endSummary(...) -> summary`, a pure function with no storage and no DOM. Its arguments are the data the removed results function used, minus `api`. Saving personal bests stays in the finish code and happens before `endSummary` is called. `endSummary` receives each player's best as `{ isNew }` or `{ value }`.

**The recipe, per game:**
1. **Test first** (in the game's existing `tools/test/<game>.test.js`), `<game>: endSummary carries what the old results screen showed`:
   - Build a fixture run in the shape the game's finish already produces.
   - Assert:
     - `headline` is the old title;
     - `stats` labels are the old numbers in the old order, within the limits;
     - `best` is passed through;
     - `rounds` or `panel` is present where the old screen had a list;
     - `lines[id]` is the old per-player status line for 2+ players.
   - For a setup game, also add `<game>: replay plays the saved setup` (`api.config.replay` plus a saved setup leads to play with no setup screen), using the `setupOrReplay` stub pattern from Task 3.
2. **Watch it fail:** run `node tools/test/one.js <game>`. Expected: FAIL, because `endSummary` is not a function.
3. **Implement:**
   - Add `endSummary`.
   - Replace the results function, and the room `showEnd` where there is one, with a direct `api.end({ results, winnerId, summary: NS.endSummary(...) })`.
   - Delete the old results DOM and its CSS block.
   - A last-round "See results" button is kept only where it now goes straight to `api.end`.
   - For setup games:
     - add `setup: true` to the definition;
     - route `start` through `setupOrReplay` with the game's setup storage key;
     - stop reading `api.config.difficulty` for defaults (use the standard settings);
     - move each platform option the game reads, listed in its task, into its setup as a field;
     - set `api.config.customRules = true` when that field is off-standard.
4. **Run:** `node tools/test/one.js <game> points`. Expected: PASS.
5. **Commit** once per task:
   - Message: `feat(end): <games> end on the shared screen`
   - Add `; one settings screen` to the message where the task has setup games.

**Fields that move into a game's own setup:**
- `timer`:
  - It uses `FF.SettingsUI.duration(value, onChange, { allowOff: true })`, stored as `timer` in the game's setup, in seconds, with 0 for off.
  - Its default is `FF.Settings.defaults.timer`.
  - The game reads `cfg.timer` where it used to read `api.config.timer`.
  - Skip it if the game already has its own seconds field that does the job.
- `length`:
  - It uses `FF.GameLength.picker(obj, onChange)`, stored as `length` and `clock` in the game's setup.
  - Its default is `{ length: 'normal', clock: 0 }`.
  - On Start, the game calls `FF.GameLength.apply(api, cfg)`.

### Task 4: Stacoend, Number Rush, Blink & Remember, Remember the Sequence

- **Results functions to remove:**
  - Stacoend `results` (line 854). The rounds list becomes `rounds`; the tiles are Words, Accuracy, Rejected, Longest and Rare finds.
  - Number Rush `results` (line 1055).
  - Blink & Remember `results` (line 592).
  - Remember the Sequence `results` (line 835).
- **Setup storage keys:** `stacoend:setup`, `numberRush:setup`, `blinkRemember:setup`, `rememberSequence:setup`.
- **Fields to move:**
  - Blink & Remember: `timer` (it read `api.config.timer * cfg.boxes`, which becomes `cfg.timer * cfg.boxes`).
  - Remember the Sequence: `timer` (lines 647 and 954).
- **Tests:** `stacoend`, `numberRush`, `blinkRemember`, `sequence`.

### Task 5: Picture Rush, Spot the Difference, Hidden Object, Ball Swap

- **Results functions to remove:**
  - Picture Rush `results` (line 492).
  - Spot the Difference `results` (line 476).
  - Hidden Object `results` (line 541).
  - Ball Swap: `soloResults` (line 911) and `resultsTable` (line 723), and the room `showEnd` (line 1189).
- **Setup storage keys:** `pictureRush:setup`, `spotDifference:setup`, `hiddenObject:setup`, `ballSwap:setup`.
- **Fields to move:** none. Only the `api.config.difficulty` defaults go.
- **Tests:** `pictureRush`, `spotDifference`, `hiddenObject`, `ballSwap`.

### Task 6: Sort Rush, SketchBack, Mini Crossword, WordShift

- **Results functions to remove:**
  - Sort Rush `results` (line 1052) and `resultsTable` (line 884), and `showEnd` (line 1496).
  - SketchBack `resultsScreen` (line 567) and `results` (line 714), and `showEnd` (line 1075). The drawings become a `panel`.
  - Mini Crossword: the finish screen (line 885). The solved grid becomes a `panel`.
  - WordShift: its end screen (around line 611). It sends `summary.places` (a Promise of its server places) instead of calling `FF.Leaderboards.celebrate`.
- **Setup storage keys:** read each game's own `SETUP_KEY` constant.
- **Tests:** `sortRush`, `sketchBack`, `crossword`, `wordShift`.

### Task 7: GeoSpin, Logo Rush, Say What?, What's Missing?

- **Results functions to remove:** their `recap` functions and room `showEnd`:
  - GeoSpin: lines 970 and 1255;
  - Logo Rush: lines 860 and 1156;
  - Say What?: lines 659 and 976;
  - What's Missing?: lines 826 and 1191.
- **What the old screens become:** each recap ring becomes `ring`. What's Missing?'s answers become `rounds`.
- **Fields to move:**
  - `length` for all four (they use `FF.GameLength.rounds`).
  - `timer` for What's Missing? (line 631).
- **Tests:** `geoSpin`, `logoRush`, `sayWhat`, `whatsMissing`.

### Task 8: Guess the Country, Guess It!, Quiz Mix, Bible Quiz

- **Results functions to remove:** the `recap` functions:
  - Guess the Country, line 821;
  - Guess It!, line 824;
  - Quiz Mix, line 594;
  - Bible Quiz, line 825.
- **Setup games:** Guess the Country and Bible Quiz only.
  - Guess the Country moves `length`.
  - Bible Quiz moves `length` and `timer` (line 538).
- **No setup:** Guess It! and Quiz Mix stay without `setup`. Their topic pickers and the game page's Options are unchanged.
- **Tests:** `guessCountry`, `guessIt`, `quizMix`, `bibleQuiz`.

### Task 9: Bible games (Who Am I, Verse Rush, Books), Number Challenge

- **Results functions to remove:**
  - Bible games: `recap` (line 686) and the three `finish` screens (lines 1176, 1621 and 1855).
  - Number Challenge: `recap` (line 1025) and `showEnd` (line 1521).
- **Fields to move:**
  - The three Bible games move `length` and `timer` (lines 959, 1271 and 1704). Who Am I's online minimum, `WHO_ONLINE_MIN_SECS`, still applies to `cfg.timer`.
  - Number Challenge has none.
- **Tests:** `bibleGames`, `numberChallenge`.

### Task 10: Charades, Letter Rush, Quick Tap, the room podium

- **Results functions to remove:**
  - Charades: `recap` (line 585). The card board becomes a `panel` titled "Your cards".
  - Letter Rush: `finishGame` (line 831).
  - Quick Tap: the two `finish` screens (lines 615 and 779).
  - `js/net/parallel.js`: the podium step (around lines 370 to 410) now calls `api.end({ summary: opts.summary ? opts.summary() : undefined })` straight away. The podium is drawn by `FF.EndScreen`.
- **Setup games:** Charades only. It moves `Play style` (TV display) into its setup, and with TV display chosen sets `api.config.variation = 'display'` before play.
- **No setup:** Letter Rush and Quick Tap stay without `setup`.
- **Tests:** `charades`, `letterRush`, `reactionGames`, `raceGames`.

### Task 11: Guard tests, full suite, browser pass, PR

**Files:**
- Test: `tools/test/endScreen.test.js`

- [ ] **Step 1: Write the guard tests**
  - `end screen guard: every game with its own setup screen says setup: true`
    - For each `js/games/*.js` whose source contains `function setupScreen(`, the source contains `setup: true`.
  - `end screen guard: no game draws an old results screen`
    - No `js/games/*.js` or `js/net/parallel.js` contains any of these class strings: `'nr-results'`, `'bs-results__score'`, `'srt-results__score'`, `'gs-recap'`, `'sw-recap'`, `'nc-recap'`, `'wm-recap'`, `'chr-recap__board'`, `'sc-rounds'`, `'pp-step'`.
- [ ] **Step 2: Run them**
  - Run: `node tools/test/one.js endScreen`
  - Expected: PASS. If one fails, the migration task that owns the game isn't finished: finish it.
- [ ] **Step 3: Run the full suite and the load check**
  - Run: `node tools/test/run.js > .superpowers/full.txt; tail -5 .superpowers/full.txt` and `node tools/load-check.js`
  - Expected: only the 3 baseline failures, and no load errors.
- [ ] **Step 4: Browser pass**
  - Use the `playmona-points-9931` launch entry, pointed at this worktree's `serve.js`.
  - Play to the end:
    - one solo setup game (Stacoend): one settings screen, the end screen shows score, best, tiles, rounds and XP;
    - Play again replays with no setup, and Change settings shows the setup;
    - one pass-the-phone game with 2 players (Number Rush): podium and table;
    - one room game in two tabs (Say What?): the room places and this phone's tiles;
    - the daily: the place line fills in.
  - Check the end screen at 375px and in dark mode.
  - Screenshot each.
- [ ] **Step 5: Push and open the PR**
  - Title: "One settings screen and one end screen for every game". The base is `main`, after PR #43 merges; until then the base is `feat/points-rebalance`.
  - The body says what changed for players, lists the games, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
