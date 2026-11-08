# Mini Crossword Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mini Crossword with a proper crossword: 200+ well-clued puzzles, a GeoSpin-grade animated UI with a built-in keyboard, Expert mode, one-device turns, and server-refereed online Co-op and Race.

**Architecture:** Pure rules in `js/crossword/rules.js` (numbering, checking, scoring, settings, seeded pick) shared by the game, the referee and tests. Puzzles are generated offline from hand-written clue banks into `js/data/crosswords.js`. The game lives in `js/games/crossword.js` (id `miniCrossword`); online play copies GeoSpin's referee pattern (`rooms/<code>/cw`, `cwInbox`, `crosswordRuns`, `crosswordState`, `api/lib/Crossword.php`).

**Tech Stack:** ES5-style classic scripts on `window.FF`, no build step; Node test harness (`tools/test/harness.js`, run one file with `node tools/test/one.js <file>`); PHP 8 API with `tools/api/test.php`; Firebase RTDB rules in `database.rules.json`.

**Spec:** `docs/superpowers/specs/2026-11-08-crossword-design.md`

**Worktree:** `C:\Users\Brighton\AppData\Local\Temp\claude\8d40df9675dbedd9\59723709-17ce-4ff5-b826-5a58a8e09ab6\scratchpad\wt`, branch `feat/crossword`. Never work in the OneDrive checkout (git there fails with `cannot stat 'js'`).

## Global Constraints

- Game id stays `miniCrossword`; display name stays "Mini Crossword"; cover image untouched.
- Do not touch What's Missing (`whatsMissing`) or any other game's code.
- Levels: `easy` (5x5), `normal` (5x5, 7x7), `hard` (7x7, 9x9). Minimum word length 3, no two-letter words, every grid connected.
- Packs: `animals`, `food`, `home`, `sport`, `music`, `geography`, `bible`, `nature`, plus `mixed`.
- 200+ puzzles total; every pack has puzzles at Normal and Hard, and at Easy where the bank allows (at least 3).
- British spelling (colour, favourite). Clues capitalised, never containing the answer; enumeration "(5)" added at display time.
- Deal with the seed (`FF.Random` / passed seed), never `Math.random`, so daily and challenge runs are fair.
- Built-in on-screen keyboard is the default; per-device setting `crossword:keyboard` = `'builtin' | 'device'`.
- Animations never block input; `prefers-reduced-motion` gets fades only.
- Online: phones never receive answers in Co-op or Race; no reveals online; online runs never count for leaderboards.
- Colours come from tokens in `css/tokens.css` and pass `node tools/contrast-check.js`.
- Look (Claude's call, from the cover): a lamp-lit night stage — deep navy/walnut background, cream glossy tiles with navy ink, terracotta-red and warm-gold accents. Tokens prefixed `--cw-`, classes prefixed `cw-`.
- New PHP class goes in `api/lib/bootstrap.php`'s class list; the `cwInbox` rule is hand-added to `database.rules.json` (gen-rules.js would drop it).

## Review Focus

1. **Typing over filled squares and at word ends** — typing into a word that is partly filled skips filled squares; at the last square it jumps to the next *unfinished* clue; when every clue is finished it stays put. Test in Task 4.
2. **Two players typing the same Co-op square at once** — last write by database clock wins and both phones end up showing the same letter. Test in Task 6.
3. **A Race player who leaves mid-race** — the race still ends (all present players finished, or time limit), and the leaver is ranked by words solved. Test in Task 6.
4. **Expert grid with one wrong square** — the puzzle does not finish; "Check grid" marks exactly the wrong squares (solo) or reports the count only (online). Tests in Tasks 1 and 6.
5. **Daily/challenge seed** — the same seed deals the same puzzle on every device and ignores per-device history. Test in Task 3 (sharedDeal).

---

### Task 1: Pure rules (`js/crossword/rules.js`)

**Files:**
- Create: `js/crossword/rules.js`
- Test: `tools/test/crossword.test.js`

**Interfaces:**
- Produces `FF.CrosswordRules` with:
  - Constants `LEVELS`, `PACKS` (8 themes + `'mixed'`), `CHECKING = ['on','expert']`, `PLAYS = ['coop','race']`, `MIN_PLAYERS = 2`, `MAX_PLAYERS = 8`, `STANDARD = { level:'normal', pack:'mixed', checking:'on', play:'race' }`, `SIZES = { easy:[5], normal:[5,7], hard:[7,9] }`, `RACE_MS = { easy:360000, normal:480000, hard:720000 }`.
  - Puzzle data shape: `{ id:'an-n-014', level, pack, size, kind:'dense'|'open', rows:['CAMEL','O#A#I',...], clues:{ '1A':'…', '2D':'…' } }` (`#` = black square, letters A-Z).
  - `sanitize(raw) -> settings` (unknown values fall back to `STANDARD`).
  - `build(puzzle) -> { size, block:[[bool]], num:[[int|0]], words:[{ id:'1A', num, dir:'across'|'down', r, c, len, cells:[[r,c],…], clue }], at:{ 'r,c': { across:'1A'|null, down:'1D'|null } } }` with standard numbering (row-major; a number on every white square that starts an across word of length ≥ 2 to its right or a down word below).
  - `shape(puzzle) -> { id, level, pack, size, kind, blocks:'…', clues }` — `blocks` is the rows with every letter replaced by `.`; no letters anywhere.
  - `answer(puzzle, wordId) -> 'CAMEL'`; `checkWord(puzzle, wordId, text) -> bool` (case-insensitive).
  - `wrongCells(puzzle, grid) -> [[r,c],…]` where `grid` is an array of row strings using `.` or `' '` for empty.
  - `pool(list, settings) -> puzzles` (level match; pack match unless `mixed`); `pick(list, settings, seed, avoidIds?) -> puzzle` deterministic for a given seed (`avoidIds` ignored when `settings.sharedDeal`).
  - `score({ level, ms, help:{ letter, word, check }, expert }) -> { points, stars }`.

- [ ] **Step 1: Write failing tests** in `tools/test/crossword.test.js` (load `['js/core.js','js/crossword/rules.js']` with `loadFF`):
  - `build numbers a 5x5 the standard way`: rows `['CAMEL','O#A#I','WHZEO','L#E#N','STARE']` → assert word ids in order `['1A','1D','2D','3D','4A','5A']`, `1D` answer `COWLS`, and `at['2,1'].across === '4A'`.
  - `shape hides every letter`: `JSON.stringify(shape(p))` matches no `/[A-Z]{2}/` outside clue text, and `blocks` contains only `.` and `#`.
  - `checkWord / wrongCells`: one wrong square in an Expert grid → `wrongCells` returns exactly that `[r,c]`; empty squares count as wrong.
  - `sanitize falls back`: `sanitize({level:'master', pack:'cars'})` deep-equals `STANDARD`.
  - `pick is deterministic`: same seed → same id on two calls; different seeds over 50 tries give ≥ 5 distinct ids from a 20-puzzle fixture; `avoidIds` respected unless `sharedDeal`.
  - `score`: no help beats any help at the same time; faster beats slower; `expert:true` scores more than `expert:false`; stars: help weight (letter 1, word 3, check 1) 0 → 3, ≤ 3 → 2, else 1. Values: base easy 100 / normal 200 / hard 300; time bonus 1 point per second under par (easy 180 s, normal 300 s, hard 480 s); Expert ×1.5 on base; costs letter 10, word 30, check 15; never below 10.
- [ ] **Step 2: Run** `node tools/test/one.js crossword.test.js` — expect FAIL (`CrosswordRules` undefined).
- [ ] **Step 3: Implement** `js/crossword/rules.js` (header comment in the style of `js/geospin/rules.js`). `pick` mixes the seed with a small integer hash (FNV-1a of `level|pack`), so it never touches `Math.random`.
- [ ] **Step 4: Run** the test file — expect PASS.
- [ ] **Step 5: Commit** `feat(crossword): pure rules for numbering, checking and scoring`.

### Task 2: Generator, validator and the first puzzles

**Files:**
- Create: `tools/crossword/bank/<pack>.txt` (one per pack plus `general.txt` for fill words), `tools/crossword/templates.js`, `tools/crossword/validate.js`
- Rewrite: `tools/gen-crossword.js`
- Create (generated): `js/data/crosswords.js`
- Test: `tools/test/crosswordData.test.js`

**Interfaces:**
- Consumes `FF.CrosswordRules.build/shape` (Task 1).
- Bank line format: `WORD|level-set|easy clue|normal clue|hard clue` where level-set is any of `e`,`n`,`h` (e.g. `enh`); empty clue fields allowed only for levels not in the set. `#` starts a comment.
- `validate.js` exports `validatePuzzle(p, bankIndex) -> string[]` (problems) and `validateAll(list) -> string[]`.
- Produces `FF.data.crosswords = [puzzle, …]` (shape from Task 1), file header says it is generated by `node tools/gen-crossword.js`.

Generator approach: block-pattern templates per size (`dense`: 5x5 with 0-4 blocks in symmetric corners, 7x7 near-full; `open`: 7x7 and 9x9 with symmetric blocks, all slots ≥ 3). Fill with backtracking (most-constrained slot first, candidate words by pattern index), seeded RNG (mulberry32 with a fixed seed per puzzle id) so output is reproducible. Theme puzzles need ≥ 40% of answers from the pack's bank (rest from `general.txt`); no answer repeated within a puzzle; an answer used at most 4 times per pack per level. Clue text picked from the bank column for the puzzle's level.

- [ ] **Step 1: Write failing tests** `crosswordData.test.js` (load core, rules, `js/data/crosswords.js`):
  - `every puzzle builds and its clue keys match its words exactly` (`Object.keys(p.clues).sort()` equals `build(p).words.map(w=>w.id).sort()`).
  - `no word shorter than 3`, `grid connected` (flood fill), `sizes match level` (`SIZES`).
  - `density`: `kind:'dense'` → ≥ 85% of white squares in two words; `kind:'open'` → ≥ 50%, and every word crosses at least one other.
  - `clues are clean`: non-empty, starts with a capital letter or quote/digit, ≤ 90 chars, does not contain the answer (case-insensitive, whole word), no two clues in a puzzle identical.
  - `ids unique`, `no repeated answer in one puzzle`.
  - `coverage`: total ≥ 200; for every theme pack: normal ≥ 3, hard ≥ 3, easy ≥ 3; per level ≥ 60.
- [ ] **Step 2: Run** `node tools/test/one.js crosswordData.test.js` — expect FAIL (no data file).
- [ ] **Step 3: Implement** templates, validator and generator; write starter banks (≈ 150 lines in `general.txt`, ≈ 40 in `animals.txt`) — enough to generate a handful of puzzles and prove the pipeline. `node tools/gen-crossword.js` prints puzzles per pack/level and any slots it could not fill, and refuses to write if `validateAll` reports problems.
- [ ] **Step 4: Run** the generator and the data test (coverage test still fails; all structural tests pass on the starter set). Temporarily mark coverage with `test.skip` only if the harness supports it; otherwise leave it failing until Task 3.
- [ ] **Step 5: Commit** `feat(crossword): puzzle generator, validator and starter banks`.

### Task 3: Write the clue banks and generate 200+ puzzles

**Files:**
- Modify: `tools/crossword/bank/*.txt`, `js/data/crosswords.js` (regenerated)
- Modify: `tools/test/sharedDeal.test.js` (add `miniCrossword` if the file lists games explicitly)

This is content work: each pack is independent and can be written in parallel (one subagent per pack, each given the bank format, the clue-style rules below, and told not to touch other files).

Clue style by level (from the spec):
- **Easy:** plain, friendly definitions a child knows. "Striped horse of Africa".
- **Normal:** clear definitions plus fill-in-the-blank. "Once upon a ___".
- **Hard:** sharper definitions, general knowledge, gentle wordplay (no cryptics). "It's black and white and red all over, in the old joke".
- Proper English, British spelling, no answer in the clue, no clue that only works with the grid.

Targets: each theme bank ≥ 120 words with clues for every level it is tagged with; `general.txt` ≥ 1,200 common 3-7 letter words (fill words for dense minis), each with clues for its levels. Bible bank uses KJV-familiar names and words only.

- [ ] **Step 1: Write the banks** (parallel per pack). Each writer runs `node tools/crossword/validate.js --bank <pack>` (bank lint: format, duplicates, answer-in-clue, length 3-9, A-Z only) until clean.
- [ ] **Step 2: Generate** `node tools/gen-crossword.js` until it reports ≥ 200 puzzles meeting coverage; add bank words where a pack/level falls short.
- [ ] **Step 3: Read a sample** of 20 generated puzzles across levels (print with `node tools/gen-crossword.js --show <id>`) and fix weak clues in the banks; regenerate.
- [ ] **Step 4: Run** `node tools/test/one.js crosswordData.test.js` and `node tools/test/one.js sharedDeal.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat(crossword): 200+ puzzles with hand-written clues across eight packs`.

### Task 4: The solo game, keyboard and animations

**Files:**
- Create: `js/games/crossword.js`, `js/crossword/keyboard.js`
- Modify: `css/games.css` (append a `cw-*` section), `css/tokens.css` (add `--cw-*` tokens next to `--gs-*`), `js/games/wordGames.js` (delete the Mini Crossword block, lines ~1025 to the end of its `registerGame`, and any helpers only it used), `js/data/words.js` (delete the `crosswords` array), `play.html`, `admin.html`, `tools/test-seed.html`, `tools/load-check.js` (add `js/data/crosswords.js`, `js/crossword/rules.js`, `js/crossword/keyboard.js`, `js/games/crossword.js` where GeoSpin's scripts sit), `DEV_GUIDE.md` (replace the crossword data section with the new shape and generator command)
- Test: `tools/test/crossword.test.js` (add cursor tests)

**Interfaces:**
- Consumes `FF.CrosswordRules`, `FF.data.crosswords`.
- Produces in `crossword.js` a pure, exported-for-tests cursor helper `FF.CrosswordCursor = { next(built, filled, sel, dir), prev(...), nextClue(built, filled, wordId, step) }` where `filled` is `{ 'r,c': 'A' }`, `sel = {r,c}`; returns `{ r, c, dir }`.
- Produces `FF.CrosswordKeyboard.create(host, { onKey(ch), onBack(), onPrev(), onNext(), onFlip() }) -> { el, destroy() }`.
- `registerGame({ id:'miniCrossword', name:'Mini Crossword', category:'words', icon:'🧩', players:[1,8], modes:['solo','turn','everyone'], defaultMode:'solo', leaderboard:true, tags:['spelling','puzzle','online'], room: ROOM (Task 7), howToPlay:[…] })`.

Screen (spec "Play (one device)"): setup cards (Level, Pack, Checking) styled like GeoSpin's `setupScreen`; daily/challenge skip setup and use `STANDARD` with `pick(list, settings, seed)` where seed comes from the run like GeoSpin's `rand0()`. Top bar (timer, star meter, pack chip, pause), clue bar (dir + number + clue + enumeration; arrows; tap flips), grid, keyboard, clue list (side panel ≥ 900px; "Clues" sheet below). Help menu: Reveal letter, Reveal word, Check grid (Expert), Clear wrong. Best time per `level|pack` in `FF.Storage` key `crossword:best`. Results card: stars land one by one, time counts up, points, best-time badge, Play again / Next puzzle.

Animations (spec "Animations"): diagonal tile wave on start (CSS `animation-delay` from `r+c`), letter pop (scale 0.6→1.08→1), selection glow that moves with a transform transition on one overlay element (not per-tile re-render), word sweep (gradient pass along cells with staggered delay), wrong shake + red flash, reveal flip (rotateY), finish ripple from the last cell + confetti (`FF.Confetti.burst`), reduced-motion fades. Input is handled synchronously; animation classes are added after state updates and removed on `animationend`.

Phone fit: like GeoSpin's `fitPhone()` — grid size = min(width − 32, height left after top bar, clue bar and keyboard), recomputed on resize.

- [ ] **Step 1: Write failing cursor tests**: typing in a half-filled across word skips filled squares; at the word end jumps to the next unfinished clue (row-major order, across then down); when all clues are finished `next` returns the same square; `prev` from the first square of a word steps back into the previous word's last square.
- [ ] **Step 2: Run** `node tools/test/one.js crossword.test.js` — expect FAIL.
- [ ] **Step 3: Implement** cursor helper, keyboard, game screen, CSS and tokens; remove the old block and data; update script lists and DEV_GUIDE.
- [ ] **Step 4: Run** `node tools/test/one.js crossword.test.js`, `node tools/test/run.js`, `node tools/load-check.js`, `node tools/contrast-check.js` — expect all PASS.
- [ ] **Step 5: Verify in the browser** (preview server from `.claude/launch.json`; add a temporary entry on a free port if 8960 is taken, don't commit it): play an Easy puzzle to the end with the built-in keyboard; switch to device keyboard; Expert with one wrong square; screenshot at 375×812 and desktop. Remember the preview tab throttles rAF/transitions.
- [ ] **Step 6: Commit** `feat(crossword): new Mini Crossword screen, built-in keyboard and animations`.

### Task 5: One-device group modes

**Files:**
- Modify: `js/games/crossword.js`
- Test: `tools/test/crossword.test.js`

**Interfaces:**
- Consumes `scorerEntities`-style players from `api` (see `js/games/wordGames.js:60` for how the old game got them; copy the helper into `crossword.js` rather than sharing).
- Produces pure `FF.CrosswordTurns = { afterWord(state, wordId, byId) -> state, afterWrong(state) -> state }` with `state = { order:[ids], cur:index, points:{id:n} }`.

Rules (spec "One device"): `turn` — one word per turn, then a "Pass to {name}" card; with checking on, a wrong letter ends the turn; with Expert the turn passes when the word is filled and words score at the end check to whoever filled them. `everyone` — Co-op on one screen, team score only.

- [ ] **Step 1: Failing tests**: `afterWord` gives the word's points to `byId` and advances `cur`; `afterWrong` advances without points; wraps around the order.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** helpers and wire the pass card and scoreboard into the screen. **Step 4: Run** all tests — PASS; check a 3-player `turn` game in the browser.
- [ ] **Step 5: Commit** `feat(crossword): take-turns and everyone-together on one device`.

### Task 6: The online referee (Co-op and Race)

**Files:**
- Create: `js/crossword/referee.js`
- Test: `tools/test/crossword.referee.test.js`

**Interfaces:**
- `FF.CrosswordReferee.create({ run, room, store, randomInt, timers, log, report, onEnd }) -> { start() -> Promise, stop() }` — same options and lifecycle as `FF.GeoSpinReferee` (`js/geospin/referee.js`); `run = { matchId, roomCode, hostUid, seats:[uid], settings, startAt }`.
- Public view `rooms/<code>/cw`: `{ matchId, settings, shape (rules.shape), status:'brief'|'play'|'over', startAt, endsAt, p:{ uid:{ done, total, finishedAt|null, wrong|null, solved:{ wordId:true } } }, grid:{ 'r_c':{ ch, by } } (coop only), locked:{ wordId: uid } (coop only), bad:{ wordId:true } (coop, checking on), result:{ rows:[{ uid, place, points, words, ms }] } }`.
- Inbox `rooms/<code>/cwInbox/<uid>/<cmdId>` commands (all carry `matchId`, `t` = server timestamp):
  - Race, checking on: `{ type:'word', word:'1A', text:'CAMEL' }`
  - Race, Expert: `{ type:'grid', text:'CAMEL/O#A#I/…' }` (rows joined by `/`)
  - Co-op: `{ type:'fill', r, c, ch }` (`ch` = `''` to clear)
- Secret seed from `randomInt`; puzzle from `FF.CrosswordRules.pick(FF.data.crosswords, settings, seed)`; answers kept in memory, never written to the room.
- Race end: every present seat finished, or `startAt + BRIEF_MS + RACE_MS[level]`; rank by finished first (by time), then words solved, then last solve time. Expert wrong grid: `wrong` = count, `+20000` ms penalty to that player's time.
- Co-op: a fill on a locked word's cell is ignored; same-cell writes resolve by `t` (later wins, ties by uid); when a word's cells are all filled, check it: right → lock + point to the uid whose letter completed it; wrong (checking on) → `bad[wordId] = true` until a cell changes. Expert: check only when every square is filled. Ends when all words locked or time runs out.
- Skip incomplete inbox commands (dev transport delivers fields one at a time). `report('result', …)` with the same payload shape GeoSpin's referee sends at the end.

- [ ] **Step 1: Failing tests** over the dev transport with a hand-moved clock, modelled on the referee section of `tools/test/geoSpin.test.js`:
  - `race: the view never contains an answer` (scan every write for any answer string of the dealt puzzle).
  - `race: right word locks, wrong word does not, finish order ranks`.
  - `race: a player who leaves is ranked by words solved when time runs out`.
  - `race expert: one wrong square → wrong:1, not finished, time penalty applied on the next correct submit`.
  - `coop: two fills on one cell at once → later t wins, both clients read the same grid`.
  - `coop: completing a word scores the completer; locked cells ignore fills`.
  - `incomplete commands are skipped`, `commands for another matchId are ignored`.
- [ ] **Step 2: Run** `node tools/test/one.js crossword.referee.test.js` — FAIL.
- [ ] **Step 3: Implement** `referee.js` following GeoSpin's structure (`later()` write queue, `store` save after each change, presence staleness 20000 ms).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(crossword): server referee for online Co-op and Race`.

### Task 7: Server, rules and wiring

**Files:**
- Create: `api/lib/Crossword.php`, `tools/api/crossword.test.php`
- Modify, each mirroring the GeoSpin entry in the same file (find them with `grep -n -i geospin`): `api/lib/bootstrap.php`, `api/lib/Routes.php` (`crossword()` factory), `api/lib/EngineRoutes.php` (`POST /crossword/start`, `/crossword/nudge`, heartbeat `dropCrossword`, report event `crossword`), `api/lib/Db.php` (`crossword_matches`, `crossword_seats` tables + indexes), `api/cron.php` (sweep), `api/lib/Crew.php` (game list), `api/crew/lib/loader.js` (`js/data/crosswords.js`, `js/crossword/rules.js`, `js/crossword/referee.js`), `api/crew/runner.js` (`crosswords` map, `startCrossword`, `crosswordRuns` stream, heartbeat/idle/close), `database.rules.json` (hand-add `cw` read and `cwInbox` write rules next to `gsInbox`), `tools/api/test.php` (require the new test)

**Interfaces:**
- `Crossword::GAME = 'miniCrossword'`, `MIN_PLAYERS = 2`, `MAX_PLAYERS = 8`, `LEVELS`, `PACKS`, `CHECKING`, `PLAYS` equal to the JS constants (a test compares them by reading `js/crossword/rules.js`, as GeoSpin's test does if it does; otherwise add that check).
- `start(AuthUser, body, now)`, `nudge(…)`, `recordResult(array, now)`, `stillActive(ids)`, `sweep(now)`, `end(id, status, now)` — same contracts as `GeoSpin`. Match ids start with `x_`. Runs at `crosswordRuns/<matchId>`, state at `crosswordState/<matchId>`.
- `cwInbox` rule: write only own uid, only new, not banned, seated in `rooms/$code/cw/p/$uid`; validate `type` in `word|grid|fill`, `matchId` equals the view's, `t === now`, `text` ≤ 200 chars, `word` matches `/^[0-9]{1,2}[AD]$/`, `r`,`c` numbers 0-8, `ch` matches `/^[A-Z]?$/`.

- [ ] **Step 1: Failing PHP tests** in `tools/api/crossword.test.php` modelled on `geospin.test.php`: host-only start, ready check, 2-8 players, settings strictly validated (`bad-settings` on `pack:'cars'`), run written to `crosswordRuns`, nudge, result recorded once, sweep ends abandoned matches.
- [ ] **Step 2: Run** `php tools/api/test.php` — FAIL. **Step 3: Implement** the class and every wiring point above. **Step 4: Run** `php tools/api/test.php` and `node tools/test/run.js` — PASS (Leaderboards test still passes; `miniCrossword` is already in `Leaderboards::GAMES`).
- [ ] **Step 5: Commit** `feat(crossword): server start, crew runner referee and database rules`.

### Task 8: Online client and room screens

**Files:**
- Create: `js/crossword/client.js`, `js/crossword/dev.js`
- Modify: `js/games/crossword.js` (online branch + `ROOM`), `js/net/roomUI.js` (add `'miniCrossword'` to the server-refereed list next to `'geoSpin'`), script lists from Task 4 (add `client.js`; `dev.js` is loaded on demand like GeoSpin's)

**Interfaces:**
- `FF.CrosswordClient.create({ room, onChange }) -> { view() -> { cw, uid, seated, me }, sendWord(id, text), sendGrid(rows), fill(r, c, ch), stop() }` — like `FF.GeoSpinClient`, with `cmdId()` from crypto and `tidy()` for Firebase arrays.
- `FF.CrosswordApi.start(room, pick)` / `nudge(code)`: POST `/api/crossword/*`, or `FF.CrosswordDev.start` when `FF.Storage.get('devRooms')`.
- `ROOM = { minPlayers:2, defaults:STANDARD, fields() -> [play (Co-op/Race), level, pack, checking], sanitize, summary, start }`.

Screen: same grid/keyboard/animations as solo, fed from the view. Race shows rivals as progress chips (avatar + % ring) above the clue bar and a finish banner with place; Co-op shows each placed letter tinted by its author's colour, locked words gold, and a live "words by player" strip. Results use GeoSpin's recap card style.

- [ ] **Step 1: Write a failing test** in `crossword.referee.test.js`: `client.sendWord` writes a complete command the referee accepts; `fill` with a lowercase letter is uppercased; a second `sendWord` for a locked word is not sent.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** client, dev starter, online screen and room settings. **Step 4: Run** all JS tests — PASS.
- [ ] **Step 5: Verify in two preview tabs** with `FF.Storage.set('devRooms', true)` and the overrides in memory `playmona-two-tab-room-testing` (`FF.Access.canUse/canPlay = () => true`, `FF.GameFlow.pause = function(){}`): a Race to the finish and a Co-op game with both tabs typing; check no answer appears in `localStorage` keys for `cw`. Turn `devRooms` off after.
- [ ] **Step 6: Commit** `feat(crossword): online Race and Co-op screens`.

### Task 9: Finish

**Files:**
- Modify: `docs/expert-levels.md` (add or move Mini Crossword to Done: Expert = no checking), `tools/verify.ps1` only if it needs a new file listed

- [ ] **Step 1: Run** the full suites: `node tools/test/run.js`, `php tools/api/test.php`, `node tools/load-check.js`, `node tools/contrast-check.js`.
- [ ] **Step 2: Final browser pass** at 375×812 and desktop, light and dark site themes: solo Easy/Normal/Hard, Expert, daily-style start, a challenge seed giving the same puzzle twice.
- [ ] **Step 3: Commit** `docs(crossword): Expert level listed as done` and ask Brighton before pushing (push to main deploys).
