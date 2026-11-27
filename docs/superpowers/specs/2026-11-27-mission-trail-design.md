# Mission Trail: design

Date: 2026-11-27. Branch: `feat/mission-trail`. Source brief: `docs/PLAYMONA GAME DEVELOPMENT BRIEF.md`
(in Brighton's main checkout). This doc covers the engine and **Stage 1**; Stages 2–10 follow once
Stage 1 plays well, and reuse everything here.

## Intent

A solo PlayMona game where you read a mission letter once, close it, and then do the mission from
memory: walk a town you can't fully see, find the right place (later: the right item, person,
vehicle), before the clock runs out. It tests memory, comprehension, navigation, observation and
execution, for children and adults.

The long-term goal is an engine where Stage 101 is **data plus reusable art**, never new code.

## Goals

- A landing screen, a stage picker in groups of 10, locked / unlocked / completed states, stars.
- A mission letter that disappears for good once you tap "I understand"; the clock starts then.
- A 2D town in a three-quarter top-down view, grid movement, collision, a camera that follows.
- A mission engine that runs a stage's list of steps, tracks mistakes and scores five categories.
- Progress saved to the player's account and restored on any device.
- Stage 1 fully playable with real Codex art; Stages 2–10 next on the same engine.

## Non-goals (for now)

- Stages 11–100 (the data format and picker support them; they get written in later rounds).
- Online rooms, pass and play, the daily challenge and leaderboards (`leaderboard: false`).
- A reading-time challenge mode.

## Anti-goals (a failure even if it works)

- Anything that shows the route, the destination, or the instructions after the letter closes:
  no markers, arrows, highlighted roads, building names, special icons, or a pause menu with the letter.
- The clock running while the letter is open, or tab switching that earns extra time.
- Per-stage JavaScript. A stage is data.
- A heavy engine or library, or loading every stage's art at once.
- Placeholder art. The game waits for the Codex art (Brighton's choice, 2026-11-27).

## Constraints from PlayMona

Classic scripts in IIFEs on `window.FF`, ES2017, no libraries, no network in the game, screens from
`FF.GameUI`, text through `FF.t()`, no ALL CAPS (the button reads "I understand"), no emoji in
buttons, 44 px controls, 360 px wide with no sideways scroll. Art comes from Codex prompt packs and
`tools/cut-art-sheets.py` / `tools/process-game-art.py`.

## Approaches considered (Brighton handed me the how; my pick is A)

- **A. Canvas map, DOM everything else (picked).** One `<canvas>` draws the town, walker, fog and
  camera; the HUD, letter, picker and results are normal `FF.GameUI` DOM. Fog, smooth movement and
  buildings that overlap the row above them are cheap on a canvas, and only one element redraws.
- **B. All DOM / CSS grid.** Simple, but a 20×20 town is 400+ nodes, fog needs a node per cell, and
  the three-quarter view (a building drawn taller than its footprint) needs manual stacking.
- **C. A game engine (Phaser etc.).** Ruled out: PlayMona allows no outside libraries, and it is heavy
  on low-end Android.

## How it plays (Stage 1 as the example)

1. **Landing.** Cover art, "Mission Trail", "Read. Remember. Explore. Complete!", Continue playing
   (the first unlocked stage not yet completed, else the last one), Select stage, and three numbers:
   stages completed of those available, total stars, highest stage reached.
2. **Stage picker.** One group of 10 per page, with the group name ("Beginner missions"), previous /
   next group, "Group 1 of N", a progress bar and total stars. Cards: locked (grey, lock icon,
   "Finish stage N first", not focusable as a button), unlocked (full colour), completed (1–3 stars,
   or a tick when completed under 50 points; replayable). Only stages that exist in the data are
   shown: there are no empty cards for stages not yet written.
3. **The letter.** An illustrated envelope opens into a letter ("Dear {player name}," from the
   PlayMona player), the mission, numbered directions, "Good luck!", and an **I understand** button.
   Templates (letter, note, scroll, official order) are CSS variants of one component; a stage picks
   one. Closing it removes the text from the page; the engine keeps the mission in memory but no
   screen ever shows it again during that attempt. Stage 1's letter:

   > Go straight for 5 steps. Turn right and go straight for 3 steps. You will reach the bus stop.

4. **First-time tip** (Stage 1 only, before the clock): "Use the arrows to walk. When you are next to
   a place, tap it to check it." One tap to dismiss. It says nothing about the route.
5. **Play.** Top: stage number, the clock, mission progress (step dots), inventory (empty in Stage 1).
   Middle: the town. Bottom: four large arrow buttons and a context button ("Check") that appears
   only when the walker is next to something checkable. Arrow keys and WASD on desktop.
6. **Checking a place.** Tapping a building or landmark (or Check) works only within one cell
   (including diagonals). Right place: it is revealed (name and a glow), success sound, next step.
   Wrong place: "This isn't the place from your letter.", 5 seconds off the clock, a mistake.
   Tapping something out of reach: "Walk closer to check it." (no penalty).
   When two checkable things are in reach, the Check button checks the one the walker faces (else
   the nearest); tapping one on the map always checks that one.
7. **Results.** Mission complete or failed, score out of 100, stars (animated), time taken, accuracy,
   mistakes, the five-category breakdown, best previous score, Replay, Next stage (when unlocked),
   Stages. This is Mission Trail's own screen, because one visit plays many missions; it borrows the
   `FF.EndScreen` look (and its renderer, if it takes custom buttons). A Done button on the landing
   and stage picker calls `api.end` once with a summary of the visit (missions completed, stars
   earned), so PlayMona's shared end screen and stats still close the game.

## Controls (my call, please check)

The four arrows are **screen directions** (Up is up the screen, the map is always drawn north-up).
Pressing an arrow turns the walker to face that way and takes one step in the same press; the sprite
always shows which way you face. The letter speaks in **relative** terms ("go straight", "turn right"),
so the player must work out which arrow "right" is from the way they face. Stage 1 starts facing up,
so "turn right" is simply the Right arrow; later stages start facing other ways, which makes the same
words a real comprehension test. A blocked press (wall, building) turns you but doesn't move you and
counts as a bump. Turn-in-place buttons (Turn left / Turn right) are supported by the engine as a
per-stage `controls` option for later advanced stages, but are not shown in Stage 1.

Why not "tank" controls (Up = forward, Left/Right = rotate): with a north-up map, rotating while
facing down makes Left move you to the screen's right, which confuses children and adults alike.

## The town and its art

- **Grid:** one cell = one step. Roads and paths are one cell wide. The walker walks on road, pavement
  and path cells only; grass, water, buildings and props block. Every map is drawn north-up.
- **View:** three-quarter top-down: you see roofs and the south (front) wall of buildings. A building
  has a footprint (e.g. 2×2 cells) and its sprite is drawn bottom-anchored, taller than the footprint,
  sorted by row so nearer things overlap farther ones.
- **Buildings carry no signs or text.** Twelve unlabelled building looks (houses, shops, civic
  buildings in different colours) are reused everywhere; a stage gives a building instance its
  identity ("bakery") in data, and the identity is shown only after a correct check. Later "similar
  buildings" puzzles come for free.
- **Roads are drawn by the renderer** from the road cells: Codex's asphalt and pavement textures are
  filled into the road shape, with kerbs, centre dashes and corner curves worked out from each cell's
  neighbours. AI images can't make road pieces whose lane lines meet exactly, and this removes the
  whole road-tile set from the art list. It is finished art, not a placeholder.
- **Ground textures** (grass, pavement, asphalt, park path, water, garden) are seamless Codex
  textures, each repeated across 2×2 cells so the pattern doesn't look stamped.
- **Fog of war** (off in Stage 1, on from the exploration stages): cells within `radius` (default 3)
  are clear, explored cells are dimmed, unexplored cells are fully covered. Computed per move from
  the walker's cell; explored cells are a `Set`.
- **Camera:** follows the walker smoothly, clamped to the map edge. On a phone a cell is about 48 px.

### Asset registry

`FF.MissionTrail.Assets` maps ids to files: `assets/images/games/missionTrail/<category>/<id>.webp`
(categories `buildings`, `props`, `walker`, `ground`, `ui`; later `characters`, `objects`, `vehicles`,
`scenes`). Stages and maps name ids only. When a stage starts, the loader fetches only the ids its map
and steps use, caches them for the session, and shows a short loading state. A missing id is an error
the validator reports, never a silent swap. Fingerprints come from `FF.AssetManifest` as elsewhere.

Raw Codex sheets stay in `assets/playmona_assets/mission-trail/` (git-ignored; this is the brief's
`spritesheets/original`). `tools/cut-art-sheets.py` gains per-sheet `cols`/`rows`, a `fit` mode that
keeps an object's shape (not squared) with a bottom anchor for buildings and the walker, and manual
`crops` boxes for sheets that don't sit on a clean grid; it already removes backgrounds, exports WebP
and writes a contact sheet. The art list is `docs/art/missionTrail-prompts.md`.

## Data

**Map** (`js/data/missionTrailMaps.js`), reusable by many stages:

```js
{ id: 'village-1', name: 'Small village', size: [11, 12],
  rows: [ 'gggggggggg', 'g====....g', ... ],   // g grass, = road, - path, ~ water, p pavement, f garden
  buildings: [ { key: 'b1', look: 'house-red', x: 2, y: 1, w: 2, h: 2 } ],
  props: [ { key: 'stopA', look: 'bus-stop', x: 6, y: 2 } ],
  streets: [ { name: 'Dave Street', cells: [[1,3],[2,3]] } ],   // later stages
  start: { x: 5, y: 10, facing: 'up' } }
```

**Stage** (`js/data/missionTrailStages.js`):

```js
{ id: 1, group: 1, title: 'The bus stop', map: 'village-1', letter: 'letter',
  time: 60, fog: false, start: null /* map default */, controls: 'arrows',
  identities: { stopA: 'busStop', stopB: 'busStop', stopC: 'busStop' },
  briefing: { title: 'A trip to the bus stop', from: 'Grandma',
              message: 'Please meet me at the bus stop. I will be waiting there.' },
  route: [ { go: 5 }, { turn: 'right' }, { go: 3 } ],          // the letter's directions are written from this
  steps: [ { do: 'reach', target: 'stopB' } ],
  scoring: null /* default weights */ }
```

The numbered directions in the letter are generated from `route`, so the words and the path the engine
checks can never disagree (a stage may override the wording for landmark phrases later). Step types
are a registry: `reach` / `visit` (check a place), and later `collect`, `identify_person`,
`identify_object`, `identify_vehicle`, `enter_vehicle`, `drive`, `deliver`, `follow`, with `avoid`
and `if` conditions on routes. Each type is one small module with `begin`, `onAction`, `isDone`.

Groups: `[{ from: 1, name: 'Beginner missions' }, { from: 11, name: 'Getting around' }, ...]` (the
brief's ten names), so stage 101 just starts a new group.

## Engine

Pure rules, no DOM, tested in node (`tools/test/missionTrail.test.js`, existing harness):

- `Rules`: parse a map, walkability, a move (turn + step or bump), route cells from `route`,
  directions text from `route`, fog visibility, adjacency checks, scoring, stars, progress merge.
- `Engine.create(stage, map)`: one attempt. `start()` (letter closed, clock starts), `move(dir)`,
  `check(key)`, later `pick(id)`, etc. It records every action and mistake and emits events the
  screens listen to (`moved`, `bumped`, `revealed`, `wrong`, `stepDone`, `complete`, `failed`).
- **Clock:** a deadline from `performance.now()`; the remaining time is always `deadline - now`, so a
  hidden tab or a slow phone never adds time. Time penalties move the deadline. Warning look and sound
  at 10 s. Stops the moment the mission ends. The shell's own timer is hidden.
- **Screens** (`js/missiontrail/screens.js`) and the **renderer** (`js/missiontrail/render.js`,
  `requestAnimationFrame` only while something moves) are separate from the rules.

Files: `js/missiontrail/{rules,engine,assets,render,screens}.js`, `js/games/missionTrail.js`
(registers the game), the two data files, `.mt-*` styles in `css/games.css`, `tools/missiontrail-check.js`,
`tools/art/missionTrail.json`, plus the usual wiring (`play.html`, `tools/load-check.js`, the game icon,
`gen-asset-manifest.js` folders, `sync.js`).

## Scoring

Five categories, each 0–1, weighted (defaults from the brief, a stage can override):

| Category | Weight | Stage 1 meaning |
|---|---:|---|
| Task completion and memory | 30 | 1 when done; partial for later multi-step stages (share of steps done right first time) |
| Navigation accuracy | 25 | `1 − 0.2 × wrong turns − 0.03 × extra steps − 0.02 × bumps`, floored at 0 |
| Observation | 20 | `1 − 0.5 × wrong checks`, floored at 0 |
| Task sequence | 15 | not used (one step) |
| Time | 10 | 1 when done within par (route steps + 10 s), falling to 0 at the time limit |

A category a stage doesn't use is dropped and the rest scaled up to 100. A **wrong turn** is each time
the walker leaves the letter's route; **extra steps** are steps beyond the route's length. Total =
round(weighted sum). Stars: 90+ three, 70+ two, 50+ one, under 50 a completed tick. Time running out
is a failed mission: no unlock, nothing saved but the attempt count. All numbers are constants in
`Rules` with tests, so they can be tuned after play-testing.

## Progress

One account key, `missionTrail`, saved on the device at once and synced to `users/{uid}/data` by
`FF.Sync` (added to `SYNC_KEYS`):

```js
{ v: 1, stages: { '1': { stars: 3, best: 96, bestMs: 21400, done: true, plays: 4 } }, highest: 2 }
```

Totals (stars, completed, missions) are worked out from `stages`. A replay only ever raises `stars`,
`best` and lowers `bestMs`. Sync today is "newer copy wins" per key, which could lose a stage played on
another device, so `missionTrail` gets a merge on arrival: the best of each stage from both copies.
Each attempt has an id and saves once. Guests keep progress on their device only, as in every PlayMona
game. Leaving mid-mission (refresh, exit) simply drops that attempt; the stage stays as it was.
Because the game is off the leaderboards, a tampered save only affects that player's own progress.

## Map validation

`node tools/missiontrail-check.js` (also run by the test) checks every stage: its map and asset ids
exist; walking its `route` from the start stays on walkable cells and ends next to the step's target;
the target is reachable; each `reach` target's identity is shared by at least one decoy when the stage
asks for decoys; every turn in the route happens at a junction that also offers another way (so the
instruction matters). A stage that fails is a test failure.

## Stage 1 specifics

A small village (about 11×12), visible all at once (no fog), camera following. Start at the south
facing up. The route goes 5 up, turns right at a crossroads, 3 right, and ends beside bus stop B.
Two identical bus stops are decoys where the likely mistakes end (turning left instead of right;
turning right too early). Houses and shops line the roads; trees, benches and a lamp or two dress it.
60 seconds. Clock and sounds use the existing `FF.Audio` set (`flip` for the letter, `tap` per step,
`correct`, `wrong`, `warning`, `winner`).

## Release

The branch is not merged to main until Stages 1–10 all play (PlayMona's no-placeholder rule).
Stage 1 is play-tested on the branch with the dev server first.

## Left to the builder

Exact map layout, sizes and animation timings; the letter's paper look within the design tokens;
loading state; how the step dots look; any tuning of the scoring constants after play-testing
(recorded in this doc).
