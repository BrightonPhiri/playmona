# Hidden Object with real pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emoji Hidden Object with one real picture per round, a list of objects to find, and pinch/drag zoom.

**Architecture:** A new classic-script game file `js/games/hiddenObject.js` modelled on `js/games/spotDifference.js` (pure rules on `FF.HiddenObject`, then play/setup/pass/results/online screens). Scene data in `js/data/hiddenObject.js`, found by `tools/art/spot-diff-find.py --game hiddenObject`. The old emoji code (`js/games/puzzleGames.js`, the only game left in it) is deleted.

**Tech Stack:** ES5 classic scripts, FF.UI/FF.GameUI, FF.Parallel, pointer events, node test harness (`tools/test/run.js`), Python art tools.

**Spec:** `docs/superpowers/specs/2026-11-26-hidden-object-design.md`

## Global Constraints

- Game id stays `hiddenObject`; ES5 only (no arrow functions, `let`, classes) in `js/`.
- Levels: Easy 6, Normal 9 (standard), Hard 12 objects; 90 / 120 / 150 s; bonus 1 / 1.5 / 2.
- Find: 100 × bonus; all found adds up to 200 × bonus for speed (same `points` maths as Spot the Difference); wrong tap −20; never below 0.
- Tapping an object that is in the picture but not on this round's list: "Not on your list", no penalty.
- Zoom 1–3×, pinch and drag on touch, wheel and drag on mouse, a reset button; taps measured through the zoom.
- Pictures: `assets/images/games/hiddenObject/<id>.webp` (the hidden picture only); cover `assets/images/covers/hiddenObject.webp`.
- No emoji fallback: no scene in the manifest → `FF.GameUI.exitCard` "needs its pictures".

## Review Focus

- A drag that ends on the picture must not count as a tap (no −20 for panning). Test: `isTap` false past 8 px movement.
- A tap while zoomed must hit the object under the finger. Test: `toPicture` at zoom 2 offset.
- Two objects close together (sailboat under the umbrella's tip): the nearest centre wins. Test in `hit`.
- Online phones must get the same scene and the same list. Test via `parallel.test.js` deal check.
- Pinching must not scroll or zoom the page: `touch-action: none` on the viewport.

---

### Task 1: Rules, data and tests

**Files:**
- Create: `js/games/hiddenObject.js` (rules section + `FF.HiddenObject` export), `js/data/hiddenObject.js`, `tools/test/hiddenObject.test.js`

**Interfaces:**
- Produces: `FF.HiddenObject = { COUNTS:[6,9,12], PICTURES:[1,3], SECONDS, BONUS, MARGIN:0.02, MAX_ZOOM:3, STANDARD:{count:9,pictures:1}, ART:'games/hiddenObject', defaults(difficulty), sanitize(s), isStandard(s), secondsFor(count), scenes(), deal(cfg, rand), dealScene(scene, count, rand) -> {id,name,objects,active:[indices in list order]}, hit(item, found, u, v) -> index | -2 found | -3 decoy | -1 miss, points(st, limitMs), clampView(v) -> {z,x,y}, zoomAt(v, factor, u, v) , toPicture(v, u, v) -> [x,y], isTap(dx, dy), summary, fields, ROOM }`.
- Data: `FF.data.hiddenObject.scenes = [{ id, name, objects: [{ n: name, b: [x,y,w,h] }] }]`.

- [ ] Step 1: tests — settings keep to offered values; a scene is used only with its picture in the manifest; the deal is shared by seed, `active.length === count`, distinct, in a shuffled order; `hit` returns the nearest live object, −2 for found, −3 for an object not on the list, −1 for empty space, with the 0.02 margin; `points` (100 × bonus, speed, −20, floor 0); view: `clampView` keeps z in 1..3 and the picture covering the frame, `toPicture({z:2,x:-0.5,y:-0.5}, 0.5, 0.5)` → `[0.5, 0.5]`, `zoomAt` keeps the point under the finger fixed, `isTap(3,4)` true and `isTap(9,0)` false.
- [ ] Step 2: run `node tools/test/run.js` → hiddenObject tests fail (file missing).
- [ ] Step 3: implement the rules section; view `{z, x, y}` means the picture is drawn at scale z, its top-left at (x, y) in frame fractions; `toPicture` = `[(u - x) / z, (v - y) / z]`.
- [ ] Step 4: tests pass.

### Task 2: Screens, zoom, registration, removal of the old version

**Files:**
- Modify: `js/games/hiddenObject.js` (play, setup, pass, results, online, registration), `css/games.css` (`.hob-*` replaces the `.scene-*`/`.find-prompt` block), `play.html`, `admin.html`, `tools/load-check.js`, `tools/test-seed.html` (load `js/data/hiddenObject.js` + `js/games/hiddenObject.js`, drop `puzzleGames.js`), `tools/test/parallel.test.js` (map to `hiddenObject.js`, drop `hiddenPoints`, give the test phone a manifest entry), `tools/test/pictureRush.test.js` (drop the deleted file from its list), `docs/removed-games.md` (record the emoji version)
- Delete: `js/games/puzzleGames.js`

- [ ] Step 1: play screen: the picture in a square viewport (`.hob-view`, `touch-action:none`) with a transformed inner layer (image + marks); a list of chips beside it on wide screens and below on phones; a found chip is ticked; zoom buttons (+, −, reset). Pointer handling: one pointer drags, two pinch, wheel zooms at the cursor; pointerup with `isTap` → `toPicture` → `hit`.
- [ ] Step 2: setup/pass/results/online copied from Spot the Difference with hob- keys and words ("objects"); online `FF.Parallel.run` with gate `.hob-chip`.
- [ ] Step 3: remove the old file and references; `node tools/test/run.js` → only the 3 known failures; `node tools/load-check.js` passes.

### Task 3: Art

**Files:**
- Create: `tools/art/hiddenObject.json`, `tools/art/hiddenObject-spots/attic.json` (done) + `commands.txt` (done), `assets/images/games/hiddenObject/attic.webp`, `assets/images/covers/hiddenObject.webp`
- Modify: `tools/gen-asset-manifest.js` (folder `games/hiddenObject`), `js/data/assetManifest.js`, `tools/art/spot-diff-find.py` (`--game hiddenObject`, done)

- [ ] Step 1: config with set `{from:'{id}-hidden.png', to:'assets/images/games/hiddenObject/{id}.webp', size:[1024,1024], max_kb:360}` and the cover; run `python tools/process-game-art.py hiddenObject`, `node tools/gen-asset-manifest.js`.
- [ ] Step 2: the 12 attic objects with names go into `js/data/hiddenObject.js`.

### Task 4: Check in the preview

- [ ] Desktop: Easy and Hard rounds, finds tick the list, decoy note, miss −20, time up rings, results.
- [ ] Phone (375 wide): list under the picture, pinch/drag via zoom buttons and drag, a tap at 2× hits the right object.
