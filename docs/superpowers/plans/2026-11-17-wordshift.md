# WordShift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete, no-hints word-ladder game (WordShift) with Classic, Time Challenge, Daily and an online Race, every scored result checked by the server.

**Architecture:** A Node generator builds a tested puzzle bank shared by phone, PHP and crew runner. Pure rules in `FF.WordShiftRules` are used by the phone, the referee and tests (PHP mirrors them). Solo scores go through `wordshift/begin` + `wordshift/finish` (server replay, server clock, server-written boards); the Race copies the Say What? referee pattern.

**Tech Stack:** ES5 classic scripts, Node test harness (`tools/test/harness.js`, `node tools/test/run.js`), PHP 8 (`php tools/api/test.php`), Firebase RTDB rules.

**Spec:** `docs/superpowers/specs/2026-11-17-wordshift-design.md`

## Global Constraints
- Game id `wordShift`; CSS/id prefix `ws-`; folder `js/wordshift/`.
- No hint of any kind: no suggested words, no marked "change this" letter, no autocomplete, no keyboard colouring, no path shown. The shortest LENGTH appears only on the completion card.
- Levels: easy 3, normal 4, hard 5, expert 6 (+7–8). Shortest ranges: easy 3–5, normal 4–6, hard 4–7, expert 4–8.
- Time Challenge clocks 60/90/120/180 s, default 120. Race: rounds 1/3/5, clock 90/120/180 s, 2–8 players.
- Scoring: 100 finish; + max(0, 100 − 15 × (moves − shortest)); timed + 2 × seconds left; − 5 per refused word; floor 0; unfinished 0. Race adds finish-order points 100/70/50/30.
- Accepted words: FF.Words tiers 1–4, not quiet (tier 5), a–z, length 3–8. Puzzle words: tiers 1–2.
- FF.Random (seeded) for any deal; FF.t with English fallbacks for every string.
- Respect reduce-motion and the animations setting.
- Work happens in the scratchpad worktree on `feat/wordshift`; never in the OneDrive checkout.

## Review Focus
- Typing a letter into a tile that already holds that letter, then Enter → refused as "same word", not counted as a move. (Task 2 test `checkMove same`.)
- Changing a green letter away → that tile goes normal, and goes green again if changed back. (Task 2 test `greens follow the word`.)
- Uppercase input or a physical keyboard with modifiers (Ctrl+R, Alt) → letters lowercased, shortcuts ignored. (Task 4 test `key filter`.)
- Calling `finish` twice with one ticket, or with a ticket for another uid → second/other refused with 409/403. (Task 3 PHP tests.)
- The Time Challenge clock running out mid-type → the puzzle ends unfinished with 0 and is not ranked; the server refuses a finish later than seconds + 5 s. (Task 3 test `late finish`.)

---

### Task 1: Puzzle generator, bank and word file

**Files:**
- Create: `tools/gen-wordshift.js`, `js/data/wordshiftPuzzles.js`, `api/data/wordshift-puzzles.json`, `api/data/wordshift-words.txt`
- Test: `tools/test/wordshift.data.test.js`

**Interfaces:**
- Produces: `FF.data.wordshift = { v: 1, puzzles: [{ id: 'n45', s: 'sing', t: 'bear', n: 6, lv: 'normal' }] }`; JSON file has the same object; words file = sorted accepted words, one per line, `\n`.
- Produces (generator module export, used by tests): `bfs(start, target, graphSet) -> string[] | null` (one shortest path), `pathsWithin(start, target, graphSet, maxLen) -> number` (count capped at 2).

- [ ] **Step 1: Write the failing test** `wordshift data: every puzzle is solvable within its level's range`: load `js/core.js` + `js/data/lexicon.js` + `js/words.js` + `js/data/wordshiftPuzzles.js` with `loadFF`; build tier 1–2 graph per length; for each puzzle assert `bfs(...).length - 1 === p.n`, `n` within the level range, `s.length === t.length`, length matches level, s and t tier ≤ 2 (tier 1 for easy/normal), no duplicate `s|t` or ids. Also: counts — easy ≥ 500, normal ≥ 1000, hard ≥ 800, expert ≥ 400; puzzles total ≥ 3000; words file contains every s/t and no quiet word (e.g. check `FF.Words` tier 5 sample is absent).
- [ ] **Step 2:** Run `node tools/test/one.js wordshift.data` → FAIL (file missing). (Check `tools/test/one.js` usage first; fall back to `node -e "require('./tools/test/wordshift.data.test.js');require('./tools/test/harness').run()"`.)
- [ ] **Step 3:** Implement the generator: neighbour lookup via wildcard buckets (`s_ng`), BFS from each candidate start over the graph, choose targets at distances in range, deterministic with a fixed seed (FNV), stable ids by level counter, easy/normal need `pathsWithin(..., n + 1) >= 2`. Cap expert 7/8 to what passes. Write the three files.
- [ ] **Step 4:** Run the test → PASS. Print counts per level in the generator.
- [ ] **Step 5:** Commit `feat(wordShift): tested puzzle bank and word list`.

### Task 2: Shared rules (FF.WordShiftRules)

**Files:**
- Create: `js/wordshift/rules.js`
- Test: `tools/test/wordShift.test.js`

**Interfaces:**
- Produces: `FF.WordShiftRules = { LEVELS, RANGES, CLOCKS:[60,90,120,180], DEFAULT_CLOCK:120, ROOM_ROUNDS:[1,3,5], ROOM_CLOCKS:[90,120,180], SCORING, STANDARD:{mode:'classic',level:'normal'}, clean(w)->string, checkMove(prev, next, used:string[], isWord:fn)->{ok:true}|{ok:false, reason:'length'|'same'|'many'|'word'|'used'}, greens(word,target)->bool[], score({moves,shortest,invalid,timed,secondsLeft,finished})->int, dailyPuzzle(day, puzzles)->puzzle, fnv(str)->uint32, pick(puzzles, level, seen:string[], rand)->puzzle, sanitizeRoom(raw)->{level,rounds,clock} }`.

- [ ] **Step 1: Write failing tests:** `checkMove` cases (`sing→sang` ok; `sing→sing` same; `sing→bang` many; `sing→sinx` word; `sing→sang` with `used:['sang']` used; `sing→sin` length); `greens follow the word` (`bead` vs `bear` → [t,t,t,f]; `bear` → all t; `beer` → [t,t,f,t]); `score`: finish shortest 6 moves 6 → 200; moves 8 → 170; moves 20 → 100; timed 30 s left → +60; invalid 3 → −15; unfinished → 0; never < 0; `dailyPuzzle('2026-11-17', P)` equals `P.filter(normal)[fnv('wordshift|2026-11-17') % len]` and is stable; `pick` prefers unseen and stays in level.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in ES5, attaches to `FF` (works in Node via loadFF like `js/saywhat/rules.js`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(wordShift): shared rules and scoring`.

### Task 3: Server score check (api/lib/WordShift.php, solo part)

**Files:**
- Create: `api/lib/WordShift.php`, `tools/api/wordShift.test.php`
- Modify: `api/lib/bootstrap.php` (class list), `api/lib/Routes.php` (`wordshift()` factory), `api/lib/EngineRoutes.php` (routes `POST /wordshift/begin`, `POST /wordshift/finish`), `tools/api/test.php` (require the test), `database.rules.json` (`wordshiftTickets` server-only; `wordshiftDaily/$day` read for signed-in, no client write; block client writes to `leaderboards/wordShift/**` and to `daily/$day/$uid` when `newData.child('game').val() === 'wordShift'`), `tools/gen-rules.js` if it owns those keys (splice changed keys only — see memory note on hand-added rules).

**Interfaces:**
- Consumes: puzzle bank JSON and words file (Task 1); scoring table from Task 2 (mirrored as PHP constants with a test comparing to `js/wordshift/rules.js` SCORING values by regex).
- Produces: `begin(AuthUser $u, array $body{puzzleId, mode:'classic'|'timed', seconds?, daily?:'ws'|'platform'|null}, int $now) -> ['ticket'=>string, 'puzzle'=>[...], 'serverNow'=>int]`; `finish(AuthUser $u, array $body{ticket, moves:string[], invalid:int}, int $now) -> ['ok'=>bool, 'score'=>int, 'ms'=>int, 'shortest'=>int, 'places'=>[{period, rank}], 'ranked'=>bool]`. Ticket stored at `wordshiftTickets/<id>` = {uid, puzzleId, mode, seconds, daily, day, t}; deleted on finish.
- Writes: `leaderboards/wordShift/week/<YYYY-Www>/<uid>` and `/all/<uid>` (only higher) `{name, avatar, score, t}`; `wordshiftDaily/<day>/<uid>` `{name, avatar, score, moves, ms, t}` once; `daily/<day>/<uid>` with `game:'wordShift'` when `daily==='platform'` and `dailyMeta/<day>/game === 'wordShift'`. Name/avatar from `users/<uid>/profile` (check the field names used by FF.Leaderboards `me()`).

- [ ] **Step 1: Write failing PHP tests:** begin refuses anonymous (401/403 like other routes), unknown puzzle 400, bad mode/seconds 400; a valid run `sing…bear` path from the bank replays to the expected score and writes week+all; a move changing two letters → 422 `bad-move`; a rare-but-real word accepted; finish twice → 409; other uid → 403; `late finish` timed 60 s finished at t+66 s → `ranked:false`, score 0; daily 'ws' second ticket same day → `ranked:false`; lower score does not overwrite all-time.
- [ ] **Step 2:** `php tools/api/test.php` → FAIL.
- [ ] **Step 3:** Implement. Words file loaded once into an array-set (`array_flip(file(..., FILE_IGNORE_NEW_LINES))`); reject > 200 moves; week key matches `FF.Leaderboards` weekKey (ISO week, UTC — confirm in js/leaderboards.js).
- [ ] **Step 4:** Tests PASS; also run `node tools/test/run.js` (rules tests).
- [ ] **Step 5:** Commit `feat(wordShift): server-checked solo and daily scores`.

### Task 4: The game screen (solo, Time Challenge, Daily, challenge)

**Files:**
- Create: `js/games/wordShift.js`, `css/games/wordShift.css` (or the project's per-game CSS location — follow sayWhat), `js/wordshift/api.js` (`FF.WordShiftApi.begin/finish`, dev fallback that scores locally and marks unranked)
- Modify: `play.html` (scripts + css), `tools/load-check.js`, `js/leaderboards.js` (eligible + `afterGame` skips `def.serverScored`), `js/social.js` (`submit` marks submitted without writing when the game's def has `serverScored`), `api/lib/Leaderboards.php` GAMES, `js/icons.js`, `js/data/assetManifest.js`, `tools/art/wordShift.json` + `assets/images/covers/wordShift.webp` (from `assets/playmona_assets/WordShift/cover.png` — copy the PNG into the worktree), `tools/test/parallel.test.js` / `smoke.test.js` if they list games.
- Test: extend `tools/test/wordShift.test.js`

**Interfaces:**
- Consumes: Task 1 bank, Task 2 rules, Task 3 endpoints.
- Produces: `FF.registerGame({ id:'wordShift', name:'WordShift', category:'word', icon:'🔤', players:[1,8], modes:['solo'], defaultMode:'solo', leaderboard:true, serverScored:true, room: ROOM, start })`; `FF.WordShiftGame.keyFilter(evt) -> 'a'..'z'|'enter'|'back'|'left'|'right'|null` (exported for tests); `FF.WordShiftGame.Board` (edit model: `select(i)`, `type(ch)`, `back()`, `word()`, `edited()`), used by Task 5.

- [ ] **Step 1: Failing tests:** registration (id, serverScored, leaderboard, in eligible list and Leaderboards::GAMES — the existing comparison test covers it); `key filter` (`{key:'A'}`→'a', `{key:'r',ctrlKey:true}`→null, `{key:'Enter'}`→'enter', `{key:'1'}`→null); Board: start `sing`, `select(1)`, `type('a')` → word `sang`, `edited()===[1]`; `back()` restores `sing`; typing in a second tile marks both edited (submission then refused as many); no API on the board returns a suggestion.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the screen per spec "Screen": setup (mode, level, clock; remembered in `wordShift:setup`), header with target tiles, ladder, board tiles (`ws-tile`, `ws-tile--green`, `ws-tile--edited`), on-screen keyboard, messages via short toast/inline line, tile flip on accept, pop on new green, green wave + `FF.Confetti` on win, completion card (moves, time, shortest length, score, ranked/unranked line, Next puzzle, Replay). Begin a ticket at puzzle start (not on Replay's unranked run: Replay begins a new ticket; daily replays get `ranked:false` from the server). Give up → card with shortest length only. Daily: `config.daily` → platform daily uses today's puzzle via `dailyPuzzle`; also a "WordShift Daily" entry on the setup screen with its board (top 50 from `wordshiftDaily/<day>`). Report results to GameFlow with the server's score.
- [ ] **Step 4:** Tests PASS; `node tools/load-check.js` passes.
- [ ] **Step 5:** Browser check in the dev preview (`/play`, Classic easy win, a refused word, Time Challenge, 375×667, dark mode); screenshot.
- [ ] **Step 6:** Commit `feat(wordShift): game screen, modes, daily and cover`.

### Task 5: Online Race (referee, client, server start, crew bots)

**Files:**
- Create: `js/wordshift/referee.js` (`FF.WordShiftReferee.create({transport, run, words})`), `js/wordshift/client.js` (`FF.WordShiftClient`), `js/wordshift/dev.js`, `js/crew/brains/wordShift.js` (`FF.CrewWordShift`), `tools/test/wordShift.referee.test.js`, `tools/test/wordShift.brain.test.js`
- Modify: `api/lib/WordShift.php` (`start`, `nudge`, `stillActive`, `recordResult`, `sweep` — copy SayWhat's shape, settings from `sanitizeRoom`), `api/lib/EngineRoutes.php` (`/wordshift/start`, `/wordshift/nudge`, heartbeat `wordshift`, event), `api/cron.php` (sweep), `api/crew/runner.js` (stream `wordshiftRuns`, state `wordshiftState/<id>`, map in heartbeat), `api/crew/lib/loader.js`, `api/lib/Crew.php` (ONLINE_GAMES + GAMES), `js/net/roomUI.js` ONLINE_GAMES, `js/crew/controller.js`, `database.rules.json` (`wsInbox` hand-added after `swInbox`, `rooms/$code/ws` read for members), `tools/api/wordShift.test.php` (start tests).

**Interfaces:**
- Consumes: Tasks 1, 2, Board from Task 4.
- Produces: view `rooms/<code>/ws = { round, rounds, puzzle:{s,t,n?hidden-until-end}, endsAt, players:{uid:{moves, greens, done, ms, points}}, last }`; inbox message `{ word, at }` per player at `wsInbox/<matchId>/<uid>/<push>`; the referee keeps paths in `wordshiftState` only. `n` (shortest) published only after the round ends.

- [ ] **Step 1: Failing referee tests:** deals the same puzzle to all; valid word advances only that player; refused word increments their invalid and is not published as a word; no player's word appears anywhere in the view; first finisher gets 100, then 70; round ends when all done or clock; totals summed over 3 rounds; rejoining player sees their own path restored only through their own state (client gets it from `wsInbox` echo or a private `ws/mine/<uid>` — pick the Say What equivalent).
- [ ] **Step 2:** Brain test: bot reaches target in ≤ n + 2 moves on 20 puzzles with fixed seed.
- [ ] **Step 3:** PHP start tests: host only, 2–8 players, ready check, bad settings 400.
- [ ] **Step 4:** Run → FAIL; implement; run → PASS (`node tools/test/run.js`, `php tools/api/test.php`).
- [ ] **Step 5:** Two-tab room test in the dev preview (see memory: guest gate override, dev transport); screenshot of race progress showing counts only.
- [ ] **Step 6:** Commit `feat(wordShift): online Race with server referee and crew bots`.

### Task 6: Docs and final check
- [ ] Add WordShift to `docs/expert-levels.md` if it lists spelled-answer games (it doesn't use SpellTiles: add a one-line note only if relevant), DEV_GUIDE/README game lists, CREDITS if needed.
- [ ] Full `node tools/test/run.js` and `php tools/api/test.php` green; phone 375×667 + dark pass.
- [ ] Commit `docs(wordShift): game docs`.
