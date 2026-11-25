# Picture Rush library game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Picture Puzzle with a library Picture Rush (swap-tile picture puzzle) and ready its art.

**Architecture:** One classic-script game file `js/games/pictureRush.js` with pure rules on
`FF.PictureRush`, drawing with the celebrations board `FF.PictureRushBoard` and scoring with
`FF.PictureRushRules`. Pictures come from `js/data/pictureRush.js`, used only once their webp is in the
asset manifest; until then the old SVG drawings stand in.

**Tech Stack:** ES5 classic scripts on `window.FF`, node test harness (`tools/test/run.js`), PHP lists.

**Spec:** `docs/superpowers/specs/2026-11-25-picture-rush-library-design.md`

## Global Constraints

- Game id `pictureRush`, name "Picture Rush", category `visual`, icon key `puzzle-piece`.
- Standard: theme `mix`, grid 4, count 3, peek 3. Grids 3/4/5/6; counts 1/3/5; peek 0/3/5 s.
- Seconds per picture by grid: 3: 60, 4: 120, 5: 180, 6: 300. Grid factor: 3: 0.5, 4: 1, 5: 1.5, 6: 2.
- Peek button: 2 per picture, shows 3000 ms, costs 100 × factor.
- Online lists (roomUI `ONLINE_GAMES`, `Crew::ONLINE_GAMES`) and `Leaderboards::GAMES` change in step.

## Review Focus

- A theme with no or too few photos: the game still deals `count` pictures (drawings stand in).
- Two phones with the same round seed: same picture and same scramble (parallel.test.js).
- Tapping a tile already home does nothing (it is locked); swapping a tile with itself puts it down.
- The clock running out mid-picture: partial points, never negative after peeks.
- Daily game / friend challenge skip the setup screen and play the standard settings.

---

### Task 1: Remove Picture Puzzle

**Files:** `js/games/puzzleGames.js` (registration, `picturePuzzleOnline`, `renderPuzzle`,
`puzzlePoints`, `puzzleNeighbors`, `puzzleAdjacent`, `PUZZLE_SECONDS`), `css/games.css` (`.puzzle-*`),
`js/icons.js`, `js/net/roomUI.js`, `api/lib/Crew.php`, `api/lib/Leaderboards.php`,
`tools/download-assets.js`, `tools/verify.ps1`, `tools/test/parallel.test.js`, `docs/expert-levels.md`,
`docs/removed-games.md`, `js/data/visual2.js` header.

- [ ] Replace `picturePuzzle` with `pictureRush` in every list (same position), drop the code and CSS.
- [ ] Add a "Removed 2026-11-25 (later)" Picture Puzzle entry to `docs/removed-games.md`.

### Task 2: Picture data and manifest folder

**Files:** Create `js/data/pictureRush.js` (`FF.data.pictureRush = { themes: [{ id, name, pictures: [{ id, name }] }] }`,
6 themes × 16, ids `<theme>-<slug>`); modify `tools/gen-asset-manifest.js` (folder `games/pictureRush`).

### Task 3: The game

**Files:** Create `js/games/pictureRush.js`, `tools/test/pictureRush.test.js`; modify `play.html`,
`admin.html`, `tools/load-check.js`, `tools/test-seed.html`, `css/games.css` (`.prx-*`),
`tools/test/parallel.test.js` (add `pictureRush`), `js/celebrate/common.js` (cover when present).

**Interfaces (Produces):** `FF.PictureRush = { STANDARD, GRIDS, COUNTS, PEEKS, sanitize(s), isStandard(s),
secondsFor(grid), factor(grid), pool(theme) -> [{ id, name, url }], deal(cfg, rand) -> [{ id, name, url, tiles }],
points(r, cfg) , summary(s), fields(), ROOM }`.

- [ ] Tests: sanitize keeps offered values and difficulty picks the grid; `deal` gives `count` distinct
  pictures each with a scramble of grid² tiles none solved; the same seed gives the same deal; a theme
  with no photos falls back to drawings; points: solved fast > solved slow > unsolved, peeks never take
  it below zero, grid factor applies; listed in roomUI, Crew, Leaderboards, icons, loaded by play/admin.
- [ ] Implement, following Blink & Remember for setup / pass / results / online.

### Task 4: Art pack

**Files:** Create `docs/art/pictureRush-prompts.md`, `tools/art/pictureRush.json` (ids from the data
file, set `board` 1024×1024 max 170 KB, cover 1086×1448 max 240 KB).

### Task 5: Verify

- [ ] `node tools/test/run.js`: only the 3 known failures. Play solo, pass and play in the browser.
