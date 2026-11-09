# SketchBack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete solo + online SketchBack game (copy a sketch against the clock, then name your own drawings).

**Architecture:** Mirrors Logo Rush, the newest server-refereed game: pure shared rules (`FF.SketchBackRules`),
a drawing pad module, one screen file with `online()`, and a referee run by the crew runner (host tab in dev rooms),
started by a PHP class. Reference art is Codex line art cut by `tools/cut-art-sheets.py`.

**Tech Stack:** ES5/ES2017 classic scripts on `window.FF`, Canvas 2D + pointer events, PHP 8.3 + MySQL/SQLite (`Db.php`),
Firebase RTDB (dev transport locally), Node test harness `tools/test/harness.js`, PHP tests `tools/api/test.php`.

**Spec:** `docs/superpowers/specs/2026-11-09-sketchback-design.md`

## Global Constraints

- Game id `sketchBack`, name "SketchBack", tagline "Draw it. Remember it. Name it."; CSS/text-key prefix `skb-`, tokens `--skb-*` in `css/tokens.css`.
- Sketches 5 / 10 / 15 (default 10). Difficulty easy 7 s, normal 5 s, hard 4 s (default normal). `STANDARD = { count: 10, level: 'normal' }`.
- Score = 100 × correct. Nothing for drawing.
- Naming: no visible timer; 3-minute limit (`RECALL_MS = 180000`); a soft "30 seconds left" note at 150 s; when it ends only written labels count.
- Rooms 2–8 players (`MIN_PLAYERS = 2`, `MAX_PLAYERS = 8`). Crew bots do not play: in `Crew::ONLINE_GAMES` only.
- Phones send nothing while drawing. Everyone's drawings are shown at the end; any player can hide one on their own screen.
- Random only via the seed (`FF.Random` / rules' own rng), never `Math.random`, so daily/challenge runs repeat.
- Design-system rules: colours from tokens only, `FF.t(key, fallback)` strings, sentence case, no emoji in buttons, never the answer in alt/aria text, reduce-motion respected.
- Not listed until art exists: the game registers only when `FF.SketchFiles` lists ≥ 60 cut sketches, or when `localStorage['playmona:sketchPreview'] === '1'` (dev).
- Work only in the worktree `scratchpad/sketchback` (OneDrive checkout breaks git). Never `git stash`.

## Review Focus

1. A stroke that starts before the clock and is still being drawn at zero: the point stream stops at the lock; the drawing is saved as it stood (Task 3 test `pad locks mid-stroke`).
2. Reload/rejoin mid-draw: finished drawings survive, the current sketch continues with its remaining time or is skipped as blank if it closed (Task 4 `resume after reload`, Task 7 `rejoin`).
3. An answer that is another object's name or a vague word ("animal") never counts, even within typo distance (Task 1 `check refuses vague and other objects`).
4. Double-submit of answers (tap twice, auto-send at 3 min racing the button): one command only, referee takes the first (Task 5 `one answers command`).
5. Big drawings: a scribble of thousands of points still fits one inbox write (cap points per drawing, Task 1 `encode caps size`).

---

### Task 1: Object library and rules

**Files:**
- Create: `js/data/sketches.js`, `js/sketchback/rules.js`, `tools/test/sketchBack.test.js`

**Interfaces:**
- Produces `FF.SketchData = { CATS: ['animals','food','nature','transport','household','everyday'], LIST: [{ id, name, cat, tier: 'e'|'n'|'h', alts: [] }], VAGUE: [] }` — about 120 objects (≥ 18 per category, ≥ 30 per tier), ids camelCase (`hotAirBalloon`).
- Produces `FF.SketchBackRules`:
  - `COUNTS = [5,10,15]`, `LEVELS = ['easy','normal','hard']`, `SECONDS = { easy: 7, normal: 5, hard: 4 }`, `STANDARD`, `MIN_PLAYERS`, `MAX_PLAYERS`, `RECALL_MS`, `POINTS = 100`.
  - `sanitize(s) -> { count, level }`, `sanitizeRoom(s)` (same lists), `isStandard(s) -> bool`.
  - `pool(ids?) -> objects` (only ids with art when `FF.SketchFiles` is loaded; all otherwise).
  - `deal(settings, seed:string) -> [id]` — `count` distinct ids; easy draws tiers e:n:h ≈ 6:3:1, normal 3:5:2, hard 1:4:5 (fall back to other tiers when short); deterministic per seed.
  - `check(answer:string, id) -> { ok, empty, matched, near }` via one `FF.AnswerMatch.create` over every object's `[name].concat(alts)` plus plural forms (`s`, `es`, `y→ies`), refusing `VAGUE` words (normalised) before matching.
  - `score(results) -> { correct, wrong, total, accuracy (0–100 int), points }`.
  - `encode(strokes) -> string`, `decode(string) -> strokes`. Strokes are `[[x,y,x,y,...], ...]` in 0–1000 units; encode rounds to ints, drops points closer than 4 units to the last kept, caps 1200 points per drawing (thinning evenly), and writes base-36 pairs: strokes joined by `;`, numbers by `,`.
- Also `rng(seed)`/`hash(s)` as in `FF.WhatsMissingRules` (copy the small mulberry/fnv pair).

- [ ] **Step 1: Write failing tests** in `tools/test/sketchBack.test.js` (loadFF `['js/core.js','js/answerMatch.js','js/data/sketches.js','js/sketchback/rules.js']`):
  - `library: ≥120 objects, unique ids and names, every category ≥18, every tier ≥30, no alt equals another object's name`.
  - `deal: right count, no repeats, same seed same deal, different seeds differ, easy is mostly tier e`.
  - `check accepts`: `('Bike','bicycle')`, `('airplane','aeroplane')`, `('TV','television')`, `('automobile','car')`, `('Cats','cat')`, `('butterfy','butterfly')`, `('  DONUT ','donut')`, `('doughnut','donut')`, `('strawberries','strawberry')`.
  - `check refuses vague and other objects`: `('animal','cat')`, `('thing','key')`, `('food','pizza')`, `('dog','cat')`, `('','cat').empty === true`.
  - `score`: 7 of 10 → `{ correct: 7, wrong: 3, accuracy: 70, points: 700 }`.
  - `encode/decode round trip within 1 unit; encode caps size` (a 5000-point stroke decodes to ≤ 1200 points and encodes under 9000 chars).
  - `sanitize`: unknown values fall back to `STANDARD`; `'15'` → 15.
- [ ] **Step 2:** `node tools/test/one.js sketchBack` — expect FAIL (files missing).
- [ ] **Step 3:** Write `js/data/sketches.js` and `js/sketchback/rules.js` to the interfaces above. Objects must be drawable as a simple line sketch and distinct (no "puppy" next to "dog").
- [ ] **Step 4:** `node tools/test/one.js sketchBack` — expect PASS.
- [ ] **Step 5:** Commit `feat(sketchBack): object library and rules`.

### Task 2: Art prompt pack and art wiring

**Files:**
- Create: `docs/art/sketchBack-prompts.md`, `tools/art/sketchBack.json`, `js/data/sketchFiles.js`, `tools/sketchback/gen-files.js`
- Test: `tools/test/sketchBack.test.js` (add)

**Interfaces:**
- `tools/art/sketchBack.json`: `source: "assets/playmona_assets/sketchback"`, `cards: { to: "assets/images/sketchback/{id}.webp", size: 512, max_kb: 18, cols: 4, rows: 3 }`, one sheet per 12 objects in library order, item descriptions written for line art, plus `cover` (`assets/images/covers/sketchBack.webp`, 1086×1448, max 240 KB).
- `node tools/sketchback/gen-files.js` writes `js/data/sketchFiles.js` = `FF.SketchFiles = { ids: [...] }` listing ids whose webp exists (empty list now).
- Prompt pack in the Memory Match pack's shape (purpose, STYLE, LAYOUT, per-batch prompts of 4 sheets, cover prompt, Redo prompt). STYLE: black ink line drawing in the style of Brighton's tree sketch (Brighton attaches it in Codex); clean black outlines on pure white, no colour/grey fills/gradients/shading/text; recognisable silhouette with a few inner details; consistent line weight; one object per cell filling ~70 %.

- [ ] **Step 1:** Add test `art: every object is on exactly one sheet; gen-files lists only files that exist`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Write the four files.
- [ ] **Step 4:** Run, expect PASS; `python tools/cut-art-sheets.py sketchBack --check` lists every sheet as missing.
- [ ] **Step 5:** Commit `docs(sketchBack): line-art prompt pack and art wiring`.

### Task 3: Drawing pad

**Files:**
- Create: `js/sketchback/pad.js`
- Test: `tools/test/sketchBack.test.js` (add)

**Interfaces:**
- `FF.SketchPad.create(canvasEl, opts?) -> { strokes(), undo(), clear(), lock(), locked(), isEmpty(), onChange(fn), resize(), destroy() }`.
  Pointer events (`pointerdown/move/up/cancel`, `setPointerCapture`), `touch-action: none` via the `skb-pad` class, one pointer at a time, points in 0–1000 units of the canvas box, redraw on rAF **and** after each event batch (preview rAF is throttled), quadratic-midpoint smoothing, line width 7 units, round caps, colour from `--skb-ink`.
- `FF.SketchPad.paint(canvasEl, strokes, opts?)` draws saved strokes at any size (thumbs, modal, results), sized to box × devicePixelRatio.
- Pure helpers exported for tests: `FF.SketchPad._model()` → `{ start(x,y), move(x,y), end(), undo(), clear(), lock(), strokes() }`.

- [ ] **Step 1:** Tests on `_model()`: `undo removes last stroke`, `clear empties`, `pad locks mid-stroke` (start, move, lock, move → the stroke keeps only points before lock; further start ignored), `a tap makes a dot` (start+end → one 2-point stroke).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement `pad.js`.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat(sketchBack): drawing pad`.

### Task 4: Solo game screen

**Files:**
- Create: `js/games/sketchBack.js`
- Modify: `css/games.css` (append a `skb-` section), `css/tokens.css` (`--skb-*`: paper `#fdfbf6`-ish warm off-white, ink deep navy, accents purple/blue, gradients, in both themes), `play.html`, `admin.html`, `tools/test-seed.html`, `tools/load-check.js` (script order: `js/data/sketches.js`, `js/data/sketchFiles.js`, `js/sketchback/rules.js`, `js/sketchback/pad.js`, `js/sketchback/client.js`, `js/games/sketchBack.js`), `js/icons.js` (`"sketchBack": "pencil"` or nearest existing icon), `api/lib/Leaderboards.php` `GAMES`, `js/data/assetManifest.js` via `node tools/gen-asset-manifest.js` once the cover exists.
- Test: `tools/test/sketchBack.test.js` (add)

**Interfaces:**
- `FF.registerGame({ id: 'sketchBack', category: 'memory', players: [1, 8], modes: ['solo'], defaultMode: 'solo', leaderboard: true, room: ROOM, howToPlay: [...], start })` — guarded by the listing rule in Global Constraints.
- `FF.SketchBackGame = { summary, fields }` for the room setup.
- Flow: intro + setup (count segmented 5/10/15, difficulty segmented with seconds shown, Start) → draw × count → recall → results → `api.end({ results, quizCorrect, quizAnswered })` with `api.scoring.add(playerId, 100)` per correct. Daily/challenge: skip setup, `STANDARD`, seed from `FF.Random` as Logo Rush does.
- Draw screen: `Sketch 3/10` chip, SVG ring countdown (warning class in last 1.5 s), object name, reference `<img>` (wipe/fade in), gap, paper canvas (`FF.SketchPad`), Undo/Clear, hint "Copy the sketch above". At zero: hide reference + name in the same frame, `pad.lock()`, save, 700 ms slide, next. Timing from `Date.now()` deadlines checked by a 100 ms interval (not rAF).
- Saving: after each sketch `localStorage['playmona:skb:run'] = JSON.stringify({ seed, settings, k, drawings: [encoded], startedAt })` (try/catch); `start` resumes an unfinished run of the same seed; cleared on results.
- Recall: grid of cards in a per-player shuffle (seeded from seed + uid), each a `FF.SketchPad.paint` thumb with an answered tick; modal (`FF.UI.dialog`) with large drawing, "What did you draw?", input, Submit; "See results" enabled when all answered; silent 3-minute limit, soft note at 150 s, auto-finish at 180 s.
- Results: count-up stats (sketches, correct, wrong, accuracy, score, time taken), gallery rows (drawing, reference, your answer, right answer, tick/cross; correct pop, wrong shake), confetti at ≥ 80 %, Play again / Back to games via the platform end screen.

- [ ] **Step 1:** Tests: `registered only with art or preview flag`, `listed in Leaderboards::GAMES and icons`, `every page loads the scripts in order and never dev.js`, `no Math.random in sketchBack files`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement screen, CSS, tokens, page wiring. Run `node tools/contrast-check.js`.
- [ ] **Step 4:** `node tools/test/run.js` — all PASS (CRLF-only failures in Charades are known); `node tools/load-check.js` clean.
- [ ] **Step 5:** Browser check (preview, `localStorage['playmona:sketchPreview']='1'`, devAuth): a 5-sketch Hard run end to end on phone and desktop sizes; reload mid-run resumes.
- [ ] **Step 6:** Commit `feat(sketchBack): solo game`.

### Task 5: Referee, client, dev runner

**Files:**
- Create: `js/sketchback/referee.js`, `js/sketchback/client.js`, `js/sketchback/dev.js`, `tools/test/sketchBack.referee.test.js`

**Interfaces:**
- Referee `FF.SketchBackReferee.create({ run, room, store, randomInt, timers, log, report, onEnd })` like Logo Rush. Phases `starting → draw → gap → … → recall → ended`; `BRIEF_MS 5000`, `GAP_MS 900`, `RECALL_MS` from rules, `GRACE_MS 1500`.
  View `rooms/<code>/skb`: `{ v, matchId, phase, k, total, settings, order, startAt, drawAt, closeAt, recallAt, recallEnd, p: { uid: { drew: bool, named: bool } }, round?: { k, id, name } (draw phase only), result? }`. Never the deal ahead, never names during recall.
  Inbox `rooms/<code>/skbInbox/<uid>/<cmdId>`: `{ type: 'drawings', matchId, art: '<encoded>|<encoded>|…' }` (accepted from the last draw's close until recall end; one per player) and `{ type: 'answers', matchId, t, text: 'a|b|…' }` (one per player; `t` ≤ recallEnd + GRACE; indexes by sketch number). Incomplete commands are skipped (field-by-field delivery).
  Recall ends early when every present player has answered. Ranking: correct desc, then recall ms asc. Ended view adds `result: { rows: [{ uid, place, points, correct, ms }], deal: [ids], answers: { uid: [text] }, ok: { uid: [bool] }, art: { uid: [encoded] } }`; writes `meta.results` with `gameId: 'sketchBack'`; `report('sketchback', …)`.
- Client `FF.SketchBackClient.create({ room, onChange }) -> { view(), sendDrawings([encoded]), sendAnswers([text]), serverNow(), stop() }` (each send once; retried on write failure), `ready(view)`, `tidy(view)`; `FF.SketchBackApi.start(room, pick)` / `nudge(code)` (dev → `dev.js`).
- Dev `FF.SketchBackDev.start(room, pick)` as `whatsmissing/dev.js`.

- [ ] **Step 1:** Tests modelled on `tools/test/logoRush.referee.test.js`: `seed secret, only the current object published`, `no names in the recall view`, `drawings and answers are taken once; replays, other matches and late answers ignored`, `one answers command (button and auto-send race)`, `half-delivered commands wait`, `recall ends early when everyone answered; leavers not waited for`, `ranked by correct then recall time; reports; meta.results`, `restart resumes the same deal`, `client sends once and only in the right phase`, `inbox rule/lists/runner know the game`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat(sketchBack): online referee and client`.

### Task 6: Server side

**Files:**
- Create: `api/lib/SketchBack.php`, `tools/api/sketchBack.test.php`
- Modify: `api/lib/Db.php` (`sketchback_matches`, `sketchback_seats` + indexes, as logorush), `api/lib/bootstrap.php` (class list), `api/lib/Routes.php` (`sketchback()`), `api/lib/EngineRoutes.php` (`/sketchback/start`, `/sketchback/nudge`, heartbeat `dropSketchback`, report event `sketchback`), `api/cron.php` (sweep), `api/crew/runner.js` (`sketchbackRuns`/`sketchbackState`, `SketchBackReferee`), `api/crew/lib/loader.js` (`js/data/sketches.js`, `js/sketchback/rules.js`, `js/sketchback/referee.js`), `api/lib/Crew.php` `ONLINE_GAMES`, `js/net/roomUI.js` `ONLINE_GAMES`, `database.rules.json` (`skbInbox` right after `lrInbox`: write only own uid, new id, seated in `skb/p`; validate `type` ∈ drawings/answers, `matchId` equals view's, `art` string ≤ 200000, `text` string ≤ 1200), `tools/api/test.php` (require).
- `SketchBack::settings()` lists must equal `FF.SketchBackRules` (test reads rules.js like logoRush.test.php). Room key `skbMatch`, match ids `k_…`.

- [ ] **Step 1:** PHP tests copied from `logoRush.test.php` shape: host-only start, settings lists match JS, start hands run + seed to runner and opens the room, result recorded once and run cleared, heartbeat drops, nudge and sweep.
- [ ] **Step 2:** `php tools/api/test.php` — expect FAIL for sketchback.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `php tools/api/test.php` and `node tools/test/run.js` — PASS.
- [ ] **Step 5:** Commit `feat(sketchBack): server start, runner and rules`.

### Task 7: Online screen

**Files:**
- Modify: `js/games/sketchBack.js` (`online(api, room)` and `ROOM` setup fields), `css/games.css`
- Test: `tools/test/sketchBack.referee.test.js` (rejoin case on the client side)

**Interfaces:** uses Task 5 client. Draw screen identical to solo but timed by `client.serverNow()` against `drawAt/closeAt`; strokes kept in memory + `localStorage['playmona:skb:<matchId>']`; after the last close `sendDrawings`. Recall uses the same gallery/modal; `sendAnswers` on See results or at `recallEnd`. Waiting card ("Waiting for 2 players") with ticks from `p.named`. Ended: own results (from `result`), the room podium, then "Everyone's drawings": per object the reference and each player's drawing + name + tick, each with a "Hide" toggle (local only). `rejoin`: drawings for past sketches come from localStorage, missing ones blank.

- [ ] **Step 1:** Test `rejoin keeps saved drawings and sends them once`.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5:** Two-tab dev-room check (see memory "Two-tab room testing": devRooms, `FF.Access` overrides, `FF.GameFlow.pause = function(){}`): two players, 5 sketches, both name, podium and everyone's drawings show; hide works locally.
- [ ] **Step 6:** Commit `feat(sketchBack): online rooms`.

### Task 8: Finish

- [ ] Spec/plan committed; `node tools/test/run.js`, `php tools/api/test.php`, `node tools/load-check.js`, `node tools/contrast-check.js` all clean.
- [ ] Push branch `feat/sketchback`; do not merge to main until the art lands (main deploys live).
- [ ] Update memory (`playmona-sketchback.md` + index line).
