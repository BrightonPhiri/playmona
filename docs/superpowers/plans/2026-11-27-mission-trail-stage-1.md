# Mission Trail (engine + Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Mission Trail engine and a fully playable Stage 1 (letter, walk, check the bus stop, score, stars, saved progress) inside PlayMona, drawn with the Codex Batch 1 art.

**Architecture:** Pure, DOM-free rules (grid, movement, route, fog, scoring, progress) and a mission engine tested in node; a canvas renderer for the town; `FF.GameUI` DOM screens for landing, stage picker, letter, HUD and results. Stages and maps are data; art is looked up by id through an asset registry.

**Tech Stack:** Classic-script vanilla JS (ES2017, IIFEs on `window.FF`), Canvas 2D, PlayMona's `FF.*` helpers, node test harness (`tools/test/harness.js`), Python + Pillow for art cutting.

**Spec:** `docs/superpowers/specs/2026-11-27-mission-trail-design.md`

## Global Constraints

- Classic scripts only, each file an IIFE starting `window.FF = window.FF || {};`; ES2017 or older: no `?.`, `??`, `.flat`, `.at`, `replaceAll`, modules, `require` in browser code.
- No libraries, no network in the game. All text through `FF.t(key, 'English fallback', vars)`, sentence case, no ALL CAPS, no emoji in buttons (pass an icon).
- Screens use `FF.GameUI` / `FF.UI` and `.mt-*` classes in `css/games.css` built on `css/tokens.css`; no inline colours or injected `<style>` (inline styles only for run-time positions/sizes).
- Works at 360 px wide without sideways scroll; every control at least 44 px; arrow buttons at least 56 px.
- Never show the route, a destination marker, a building's identity before a correct check, or the letter after "I understand".
- The clock starts on "I understand"; remaining time is always `deadline - now()`.
- Default weights `{ task: 30, nav: 25, obs: 20, seq: 15, time: 10 }`; stars at 90 / 70 / 50; wrong check costs 5000 ms; par = (route steps + 10) s; Stage 1 limit 60 s.
- Game id `missionTrail`, category `memory`, `modes: ['solo']`, `leaderboard: false`, icon `map-trifold`.
- Progress key `missionTrail`, shape `{ v: 1, stages: { '<id>': { stars, best, bestMs, done, plays } }, highest }`.
- Not merged to main until Stages 1–10 play (later plan).

## Review Focus

1. **Key mashing / held arrow during the step animation:** every press is one engine move, at most one press is queued while animating, and a wall stays a wall. Test in Task 3 (`ten bumps into a wall never move the walker`) and checked by hand in Task 9.
2. **Tab hidden or phone asleep mid-mission:** time keeps running; on return a passed deadline fails the mission at once. Test in Task 3 (`a hidden tab earns no time`).
3. **Correct check after the clock ran out** (same frame): the mission fails, nothing unlocks. Test in Task 3 (`a check after the deadline fails`).
4. **Worse replay or a double save of one attempt:** stars and best never drop; one attempt counts once. Tests in Task 2.
5. **Two devices with different progress:** after sign-in sync each stage keeps its best from both. Test in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `js/missiontrail/rules.js` | `FF.MissionTrail.Rules`: map building, walkability, moves, route cells, letter directions, reach, fog, road masks |
| `js/missiontrail/score.js` | `FF.MissionTrail.Score`: category scores, total, stars, par |
| `js/missiontrail/progress.js` | `FF.MissionTrail.Progress`: save shape, record, merge, totals, stage states, load/save |
| `js/missiontrail/engine.js` | `FF.MissionTrail.Engine`: one attempt, step registry (`reach`), mistakes, clock, events |
| `js/missiontrail/assets.js` | `FF.MissionTrail.Assets`: id → path registry, lazy loader with cache |
| `js/missiontrail/render.js` | `FF.MissionTrail.Render`: canvas town, roads, sprites, walker animation, fog, camera, hit tests |
| `js/missiontrail/screens.js` | `FF.MissionTrail.Screens`: landing, picker, letter, tip, HUD + controls, results |
| `js/data/missionTrailMaps.js` | `FF.data.missionTrailMaps` (array of maps) |
| `js/data/missionTrailStages.js` | `FF.data.missionTrail = { groups, stages }` |
| `js/games/missionTrail.js` | registers the game, wires screens ↔ engine ↔ renderer ↔ progress |
| `tools/missiontrail-check.js` | stage/map validator (CLI + `module.exports.check`) |
| `tools/art/missionTrail.json`, `tools/cut-art-sheets.py` | art config; cutter gains per-sheet grids, fit/bottom anchor, frame sets, manual crops, tiling textures |
| `tools/test/missionTrail.test.js`, `tools/test/cut-sheets-selftest.py` | tests |
| `js/sync.js`, `play.html`, `tools/load-check.js`, `js/icons.js`, `tools/gen-asset-manifest.js`, `css/games.css` | wiring and looks |

Tasks 1–5 need no art and can run while Codex works. Task 6 needs the Batch 1 files. Tasks 7–9 are verified with the real art.

---

### Task 1: Grid rules and Stage 1 data

**Files:**
- Create: `js/missiontrail/rules.js`, `js/data/missionTrailMaps.js`, `js/data/missionTrailStages.js`
- Test: `tools/test/missionTrail.test.js` (new; load with `loadFF(['js/core.js', 'js/missiontrail/rules.js', 'js/data/missionTrailMaps.js', 'js/data/missionTrailStages.js'])`)

**Interfaces:**
- Produces `FF.MissionTrail.Rules`:
  - `DIRS = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }`, `WALK = '=p-'` (road, pavement, path are walkable; `g` grass, `~` water, `f` garden block).
  - `turn(facing, side) -> facing` (`side` `'left'|'right'`).
  - `buildMap(def) -> map` with `{ id, w, h, ground(x, y) -> char|null, walkable(x, y) -> bool, things: [thing], thing(key) -> thing|null, thingAt(x, y) -> thing|null, start: { x, y, facing } }`; `thing = { key, kind: 'building'|'prop', look, x, y, w, h, check: bool }` (buildings always checkable; props only with `check: true`). Cells under a thing are not walkable.
  - `move(map, pos, dir) -> { x, y, facing: dir, moved: bool }` (blocked or off-map: same cell, new facing, `moved: false`).
  - `routeCells(map, start, route) -> { ok, cells: [[x, y]...] (start included), end: { x, y, facing }, error }`; route items `{ go: n }` and `{ turn: 'left'|'right' }`.
  - `directions(route) -> [string]` via `FF.t`: `{go:1}` "Go straight for 1 step.", `{go:n}` "Go straight for {n} steps.", `{turn:'right'}` "Turn right.", `{turn:'left'}` "Turn left.".
  - `inReach(pos, thing) -> bool` (Chebyshev distance from the cell to the thing's rectangle ≤ 1).
  - `visibleCells(map, pos, radius) -> [index]` (`index = y * w + x`, cells with `dx² + dy² ≤ r² + r`).
  - `roadMask(map, x, y) -> 0..15` (bit 1 up, 2 right, 4 down, 8 left: walkable neighbours of a walkable cell).
- Produces `FF.data.missionTrailMaps` (array) and `FF.data.missionTrail = { groups: [{ from, name }], stages: [stage] }` in the design's shapes.

- [ ] **Step 1: Write the failing tests** (`missionTrail.test.js`)

```js
test('mission trail: turn and move', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.turn('up', 'right'), 'right'); assertEqual(R.turn('left', 'left'), 'down');
  assertEqual(R.move(m, { x: 5, y: 10, facing: 'up' }, 'up'), { x: 5, y: 9, facing: 'up', moved: true });
  assertEqual(R.move(m, { x: 5, y: 10, facing: 'up' }, 'left'), { x: 5, y: 10, facing: 'left', moved: false }); // grass
});
test('mission trail: buildings and props block, only checkable things check', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(m.walkable(8, 4), false); assertEqual(m.thingAt(8, 4).key, 'stopB');
  assertEqual(m.thing('stopB').check, true); assertEqual(m.thing('tree1').check, false);
});
test('mission trail: stage 1 route ends beside bus stop B', function () {
  const FF = load(), R = FF.MissionTrail.Rules, s = FF.data.missionTrail.stages[0], m = R.buildMap(map(s.map));
  const r = R.routeCells(m, m.start, s.route);
  assert(r.ok); assertEqual(r.cells.length, 9); assertEqual([r.end.x, r.end.y], [8, 5]);
  assert(R.inReach(r.end, m.thing('stopB'))); assert(!R.inReach(r.end, m.thing('stopC')));
  assertEqual(R.directions(s.route), ['Go straight for 5 steps.', 'Turn right.', 'Go straight for 3 steps.']);
});
test('mission trail: a route through grass is not ok', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.routeCells(m, m.start, [{ turn: 'left' }, { go: 1 }]).ok, false);
});
test('mission trail: fog radius and road mask', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.visibleCells(m, { x: 5, y: 5 }, 1).length, 9);
  assertEqual(R.roadMask(m, 5, 5), 15); assertEqual(R.roadMask(m, 5, 10), 5);
});
```

(`load()` and `map(id)` are small helpers at the top of the test file.)

- [ ] **Step 2: Run** `node tools/test/one.js missionTrail` — Expected: FAIL (`MissionTrail` undefined).

- [ ] **Step 3: Write the Stage 1 data.** Map `village-1`, 11 × 12, `start: { x: 5, y: 10, facing: 'up' }`:

```
y0  ggggggggggg
y1  g=========g
y2  g=ggg=ggg=g
y3  g=ggg=ggg=g
y4  g=ggg=ggg=g
y5  g=========g
y6  ggggg=ggg=g
y7  ggggg=====g
y8  ggggg=ggggg
y9  ggggg=ggggg
y10 ggggg=ggggg
y11 ggggg=ggggg
```

Things: buildings `b1` house-red (2,2,2×2), `b2` shop-red (6,2,2×2), `b3` house-blue (3,6,2×2), `b4` house-green (3,9,2×2), `b5` shop-green (6,9,2×2), `b6` house-orange (9,9,2×2); props `stopA` bus-stop (2,4, check), `stopB` bus-stop (8,4, check), `stopC` bus-stop (8,8, check), `tree1` tree-round (4,2), `tree2` tree-round (8,2), `tree3` tree-pine (0,0), `tree4` tree-pine (10,3), `bench1` bench (6,4), `flowers1` flower-bed (7,6), `lamp1` street-lamp (4,4), `bush1` bush (6,6), `bin1` bin (4,8). Stage 1 as in the design (`route: [{go:5},{turn:'right'},{go:3}]`, `steps: [{ do: 'reach', target: 'stopB' }]`, `identities` all three stops `busStop`, `time: 60`, `fog: false`, `tip: true`, `briefing.arrive: 'You will reach the bus stop.'`, `identityNames: { busStop: 'Bus stop' }` in data). Groups: the brief's ten names at 1, 11, … 91.

- [ ] **Step 4: Implement `rules.js`** to the interface above.
- [ ] **Step 5: Run** `node tools/test/one.js missionTrail` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(missionTrail): grid rules and Stage 1 data`.

---

### Task 2: Scoring and progress

**Files:** Create `js/missiontrail/score.js`, `js/missiontrail/progress.js`; extend `tools/test/missionTrail.test.js`.

**Interfaces:**
- `FF.MissionTrail.Score`: `WEIGHTS`, `nav({ wrongTurns, extraSteps, bumps }) -> 0..1` = max(0, 1 − 0.2w − 0.03e − 0.02b); `obs(wrongChecks)` = max(0, 1 − 0.5w); `time(usedMs, limitMs, parMs)` = 1 if used ≤ par, else max(0, (limit − used) / (limit − par)); `parMs(routeSteps)` = (steps + 10) × 1000; `total(parts, weights?) -> int` where a `null` part is unused and the rest are scaled to 100; `stars(score) -> 0..3`.
- `FF.MissionTrail.Progress`: `KEY = 'missionTrail'`, `empty()`, `record(prog, stageId, result, attemptId) -> prog` (new object; `result = { done, score, stars, ms }`; same `attemptId` twice is a no-op via `prog.last`), `merge(a, b) -> prog`, `totals(prog) -> { stars, completed }`, `state(prog, stageId) -> 'locked'|'open'|'done'`, `next(prog, stageIds) -> id`, `load() -> prog`, `save(prog)` (through `FF.Storage`).

- [ ] **Step 1: Failing tests**

```js
test('mission trail: scoring', function () {
  const S = load().MissionTrail.Score;
  assertEqual(S.total({ task: 1, nav: 1, obs: 1, seq: null, time: 1 }), 100);
  assertEqual(S.total({ task: 1, nav: 0.8, obs: 0.5, seq: null, time: 1 }), 82);
  assertEqual([S.stars(90), S.stars(89), S.stars(70), S.stars(50), S.stars(49)], [3, 2, 2, 1, 0]);
  assertClose(S.nav({ wrongTurns: 1, extraSteps: 4, bumps: 2 }), 0.64);
  assertEqual(S.time(18000, 60000, 18000), 1); assertClose(S.time(39000, 60000, 18000), 0.5);
});
test('mission trail: a worse replay keeps the best, an attempt saves once', function () {
  const P = load().MissionTrail.Progress;
  let p = P.record(P.empty(), 1, { done: true, score: 95, stars: 3, ms: 20000 }, 'a1');
  p = P.record(p, 1, { done: true, score: 60, stars: 1, ms: 15000 }, 'a2');
  p = P.record(p, 1, { done: true, score: 60, stars: 1, ms: 15000 }, 'a2');
  assertEqual(p.stages['1'], { stars: 3, best: 95, bestMs: 15000, done: true, plays: 2 });
  assertEqual(p.highest, 2);
});
test('mission trail: a failed attempt unlocks nothing', function () {
  const P = load().MissionTrail.Progress;
  const p = P.record(P.empty(), 1, { done: false, score: 0, stars: 0, ms: 60000 }, 'a1');
  assertEqual([P.state(p, 1), P.state(p, 2), p.stages['1'].plays], ['open', 'locked', 1]);
});
test('mission trail: merge keeps the best of both copies', function () {
  const P = load().MissionTrail.Progress;
  const a = { v: 1, highest: 3, stages: { '1': { stars: 3, best: 92, bestMs: 30000, done: true, plays: 2 }, '2': { stars: 1, best: 55, bestMs: 50000, done: true, plays: 1 } } };
  const b = { v: 1, highest: 2, stages: { '1': { stars: 2, best: 80, bestMs: 21000, done: true, plays: 5 } } };
  const m = P.merge(a, b);
  assertEqual(m.stages['1'], { stars: 3, best: 92, bestMs: 21000, done: true, plays: 5 });
  assertEqual([m.highest, P.totals(m).stars, P.totals(m).completed], [3, 4, 2]);
});
```

- [ ] **Step 2: Run** `node tools/test/one.js missionTrail` — Expected: FAIL.
- [ ] **Step 3: Implement** both files (`plays` merges as the max; `highest` only grows; `state`: 1 is always open, `id ≤ highest` open, `done` when stored done).
- [ ] **Step 4: Run** — Expected: PASS. **Step 5: Commit** `feat(missionTrail): scoring and progress`.

---

### Task 3: Mission engine

**Files:** Create `js/missiontrail/engine.js`; extend the test.

**Interfaces:**
- Consumes `Rules`, `Score`.
- `FF.MissionTrail.Engine.create(stage, map, opts) -> run`; `opts.now` (defaults to `performance.now`).
- `run.state` `'ready'|'playing'|'complete'|'failed'`; `run.pos`; `run.start()`; `run.remaining() -> ms` (≥ 0); `run.move(dir) -> { type: 'moved'|'bumped'|'ignored', pos }`; `run.check(key) -> { type: 'revealed'|'wrong'|'far'|'ignored', name }`; `run.tick()` (fails when the deadline has passed); `run.on(type, fn)` for `moved`, `bumped`, `revealed`, `wrong`, `stepDone`, `complete`, `failed`; `run.result() -> { done, score, stars, ms, parts, mistakes: { wrongTurns, extraSteps, bumps, wrongChecks } }`; `run.stepIndex`.
- `Engine.STEPS.reach = { onCheck(run, step, thing) -> 'done'|'wrong' }` (done when `thing.key === step.target`). New step types register here.
- Every `move`/`check` first calls `tick()`; after the deadline they return `'ignored'`. A wrong turn is counted each time the walker steps from a route cell onto a cell not on the route. Wrong check: `deadline -= 5000`. `parts.seq = null` with one step, `parts.task = 1` when done.

- [ ] **Step 1: Failing tests** (fake clock `let now = 0; opts = { now: () => now }`)

```js
test('mission trail: a perfect stage 1 scores 100', function () { /* start, up×5, right×3, check('stopB') → complete, score 100, stars 3 */ });
test('mission trail: the clock waits for the letter', function () { /* now = 99999 before start(); remaining() after start() === 60000 */ });
test('mission trail: ten bumps into a wall never move the walker', function () { /* left×10 from start → pos unchanged, mistakes.bumps 10 */ });
test('mission trail: a wrong stop costs 5 seconds and observation', function () { /* walk to stopC, check → 'wrong', remaining drops 5000, then reach stopB → parts.obs 0.5 */ });
test('mission trail: out of reach says walk closer, no penalty', function () { /* check('stopB') at start → 'far', remaining unchanged */ });
test('mission trail: a wrong turn is counted once per departure', function () { /* up×5, left×1, right×1 (back on route), right×3, check → wrongTurns 1, extraSteps 2 */ });
test('mission trail: a hidden tab earns no time', function () { /* start, now += 61000, move → 'ignored', state 'failed', failed event fired once */ });
test('mission trail: a check after the deadline fails', function () { /* walk to end, now = 60001, check('stopB') → 'ignored', state 'failed' */ });
```

Write each body with concrete `assertEqual`s for the values in its comment.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(missionTrail): mission engine`.

---

### Task 4: Stage validator

**Files:** Create `tools/missiontrail-check.js`; extend the test.

**Interfaces:** `module.exports.check(FF) -> [string]` (empty = good); CLI `node tools/missiontrail-check.js` prints each problem and exits 1, or prints `N stages OK`. `FF.MissionTrail.Assets.known(category, id)` (Task 7) is used when present, else asset checks are skipped.

Checks per stage: map exists; every `look` is a known asset id (when Assets loaded); `routeCells` is ok; the last step's target is in reach of the route end; every `{turn}` happens on a cell whose `roadMask` has at least 3 bits; every target is reachable by BFS; ids are unique and consecutive from 1; `identities` keys exist on the map.

- [ ] **Step 1: Failing tests:** `check(FF)` on the real data returns `[]`; on a copy of Stage 1 with `route: [{go:4},{turn:'right'},{go:3}]` returns problems that all start `Stage 1:` and at least one contains `junction` (the turn cell (5,6) has only 2 road neighbours); with target `'nope'` returns a problem containing `nope`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** test and `node tools/missiontrail-check.js` → `1 stages OK`. **Step 5: Commit** `feat(missionTrail): stage validator`.

---

### Task 5: Account sync merge

**Files:** Modify `js/sync.js` (`SYNC_KEYS`, `incoming`); test `tools/test/missionTrail.test.js`.

- [ ] **Step 1: Failing test:** load `js/core.js`, `js/storage.js`, `js/missiontrail/progress.js`, `js/sync.js`; set local `missionTrail` to copy `a` from Task 2's merge test; call `FF.Sync._incoming('missionTrail', b)`; expect the merged result from Task 2. Also `assert(FF.Sync.SYNC_KEYS.indexOf('missionTrail') !== -1)`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3:** Add `'missionTrail'` to `SYNC_KEYS`; in `incoming`, when `key === 'missionTrail'` and `FF.MissionTrail && FF.MissionTrail.Progress`, return `Progress.merge(local, value)`; expose `SYNC_KEYS` and `_incoming: incoming` on `FF.Sync` for the test.
- [ ] **Step 4: Run** `node tools/test/run.js` — Expected: whole suite PASS. **Step 5: Commit** `feat(missionTrail): progress syncs and merges across devices`.

---

### Task 6: Cut the Batch 1 art (needs the Codex files)

**Files:** Create `tools/art/missionTrail.json`, `tools/test/cut-sheets-selftest.py`; modify `tools/cut-art-sheets.py`, `tools/gen-asset-manifest.js` (add `games/missionTrail/buildings`, `/props`, `/walker`, `/ground`, `/ui`).

**Config additions** (backwards compatible; Memory Match etc. unchanged):
- Sheet fields: `cols`, `rows`, `to` (overrides `cards.to`), `size` (longest edge), `fit: "trim"` (keep shape: trim to the outline plus `MARGIN`, no square pad), `frames: true` (every cut on the sheet gets the same canvas, the largest trimmed box, bottom-centre aligned, so walk frames don't jitter), `crops: { id: [x0, y0, x1, y1] }` (manual boxes win over the grid).
- `textures: [{ from, to, size: 256, max_kb: 30 }]`: resize, then cross-fade a 12 % band of each edge with the opposite edge so it tiles; contact sheet shows each texture repeated 3 × 3.
- Outputs: `assets/images/games/missionTrail/buildings/<id>.webp` (size 384, trim), `props/<id>.webp` (256, trim), `walker/walker-<dir>-<n>.webp` (192, frames; ids `walker-down-0` … `walker-up-2`, cell order columns down/left/right/up, rows 0–2), `ground/<id>.webp`, `ui/envelope.webp` (512); cover `assets/images/covers/missionTrail.webp` 1086 × 1448.

- [ ] **Step 1: Failing self-test** (`python tools/test/cut-sheets-selftest.py`): builds a synthetic 3 × 2 white sheet with coloured rectangles of different heights and a 4 × 3 "frames" sheet in a temp folder, runs the cutter's functions, asserts trimmed outputs keep their aspect ratio (± 2 px), all frames share one size with the object touching the same bottom row, a manual crop overrides its cell, and a texture's left and right edge columns differ by under 8 on average.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, and `python tools/cut-art-sheets.py memoryMatch --check` behaves as before.
- [ ] **Step 5:** When Brighton says the files are there: `python tools/cut-art-sheets.py missionTrail`, `node tools/gen-asset-manifest.js`, open the contact sheet, check every piece (angle, no text, outline, walker consistency, seams). Write the Redo prompt for rejects and wait for them before Task 8.
- [ ] **Step 6: Commit** `art(missionTrail): Batch 1 town pieces and cutter options` (only WebP, json, scripts, manifest).

---

### Task 7: Asset registry and loader

**Files:** Create `js/missiontrail/assets.js`; extend the test.

**Interfaces:** `FF.MissionTrail.Assets`: `CATS = ['buildings', 'props', 'walker', 'ground', 'ui']`; `known(category, id) -> bool` (in `FF.AssetManifest['games/missionTrail/' + category]`); `path(category, id)` via `FF.Assets.artPath`; `forMap(map) -> [{ category, id }]` (each look once, the six ground textures the map uses, the 12 walker frames); `load(list) -> Promise<{ 'category/id': HTMLImageElement }>` (cached across stages; a failed image rejects with its id).

- [ ] **Step 1: Failing tests:** with a stub manifest, `known('props', 'bus-stop')` true and `known('props', 'nope')` false; `forMap(village-1)` has `bus-stop` once and 12 walker frames; the Task 4 validator now reports an unknown look.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). **Step 5: Commit** `feat(missionTrail): asset registry`.

---

### Task 8: Town renderer

**Files:** Create `js/missiontrail/render.js`; add `.mt-map` styles to `css/games.css`.

**Interfaces:** `FF.MissionTrail.Render.create(canvas, map, images, opts) -> view`; `opts = { fog: bool, radius: 3 }`; `view.place(pos)` (no animation), `view.walk(pos, done)` (≈160 ms step with walk frames 1 and 2, camera eases to follow), `view.face(dir)`, `view.reveal(key, name)` (glow + name label above the thing), `view.shake()` (bump), `view.fog(visibleIdx, exploredSet)`, `view.thingAtPoint(clientX, clientY) -> key|null`, `view.resize()`, `view.destroy()` (cancels `requestAnimationFrame` and listeners).

Approach: cell size `clamp(floor(viewportWidth / 7.5), 40, 72)` css px, drawn at `devicePixelRatio`. Draw order per frame: ground textures as patterns (each texture spans 2 × 2 cells); road cells filled with the asphalt pattern, a pavement kerb on each side `roadMask` says has no road, centre dashes along straight runs and none inside junctions; then things and the walker sorted by bottom row, sprites bottom-centre anchored on their footprint with a soft ellipse shadow; then fog (unexplored solid, explored at 55 % dim). Redraw only while animating or after a change. No names, outlines or highlights on any thing before `reveal`.

- [ ] **Step 1:** Make a scratch page (in the scratchpad, not committed) that loads the Mission Trail scripts and the manifest and renders `village-1` with all things at a phone size, with buttons to walk and toggle fog.
- [ ] **Step 2: Verify** in the browser preview at 375 × 812 and desktop: roads join cleanly at the crossroads and T-junction, buildings overlap the row above correctly, nothing shows a name, walk animation is smooth, fog on/off both look right.
- [ ] **Step 3: Commit** `feat(missionTrail): town renderer`.

---

### Task 9: Screens, game registration, play-test

**Files:** Create `js/missiontrail/screens.js`, `js/games/missionTrail.js`; modify `play.html` (scripts after `js/data/hiddenObject.js` / `js/games/hiddenObject.js` in this order: data maps, data stages, rules, score, progress, engine, assets, render, screens, game), `tools/load-check.js`, `js/icons.js` (`"missionTrail": "map-trifold"`), `css/games.css` (`.mt-*`), `tools/verify.ps1` game id list.

**Interfaces:** `FF.MissionTrail.Screens`: `landing(root, ctx)`, `picker(root, ctx, groupIndex)`, `letter(root, stage, playerName, onUnderstood)`, `tip(root, onDone)`, `play(root, ctx) -> { hud, controls, canvas }`, `results(root, ctx, result, previousBest)`; `ctx = { api, progress, stages, groups, open(stageId), home(), done() }`. Controls call `onMove(dir)` / `onCheck()`; keyboard arrows and WASD bound while playing and unbound after.

Behaviour to match the design's "How it plays" 1–7, including: locked cards are disabled with "Finish stage {n} first"; the letter's DOM is removed on "I understand" (assert `root` no longer contains the directions text); the Check button shows only when a checkable thing is in reach; arrow presses during a step animation queue at most one; `touch-action: none` on the map and controls only; the shell timer hidden, the HUD clock reads `run.remaining()` each frame and on `visibilitychange`; warning look + `warning` sound at 10 s; results save once through `Progress.record` with the attempt id; Done calls `api.end({ summary })` with missions completed and stars this visit.

- [ ] **Step 1: Failing tests:** harness DOM: `Screens.picker` with progress `{ highest: 1 }` renders stage 1 as a button and no stage 2 card (only defined stages); after `letter(...)` then `onUnderstood`, no node's text contains "Go straight for 5 steps."; the registered def has `id 'missionTrail'`, `leaderboard: false`, `modes ['solo']`.
- [ ] **Step 2–4:** Run (FAIL), implement, run `node tools/test/run.js` and `node tools/load-check.js` (PASS).
- [ ] **Step 5: Play-test in the browser preview** (375 × 812 and desktop): play Stage 1 perfectly (3 stars, Stage 2 card absent, progress survives reload); play with a wrong stop and two wrong turns (expect 2 stars range); let time run out (failed, no unlock); hide the tab for 65 s mid-run (fails on return); mash arrows into a wall; check no scroll on arrow taps; dark mode; screenshot each screen for Brighton.
- [ ] **Step 6: Commit** `feat(missionTrail): screens and Stage 1 playable`.
