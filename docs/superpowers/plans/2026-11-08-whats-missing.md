# What's Missing? Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild What's Missing? as a glossy picture-tile memory game with
four twists, levels plus Endless, Expert spelling, and online rooms run by a
server referee.

**Architecture:** This is GeoSpin's layout, copied for patterns, not code.
- Pure seeded rules (`js/whatsmissing/rules.js`) are shared by phones, the
  referee and tests.
- The referee (`js/whatsmissing/referee.js`) runs in the Node crew runner
  (or the host tab in dev rooms).
- A thin client follows `rooms/<code>/wm` and answers through `wmInbox`.
- All UI is in `js/games/whatsMissing.js`.
- The server start, sweep and results are in `api/lib/WhatsMissing.php`.

**Tech Stack:**
- Vanilla classic-script JS (ES5 style, ES2017 at most, no build step).
- CSS in `css/games.css`.
- PHP 8.3 API, Firebase RTDB, and the Node crew runner.
- Tests: `node tools/test/*.test.js` (harness `loadFF`) and `php tools/api/test.php`.

**Spec:** `docs/superpowers/specs/2026-11-08-whats-missing-design.md`. Read it first.

**Where:** worktree
`C:/Users/Brighton/AppData/Local/Temp/claude/f539e592a7ca46ff/2a964143-0801-49a1-9d37-158652c95769/scratchpad/wt`,
branch `feat/whats-missing`. Never run git in the OneDrive checkout (it breaks).

## Global Constraints

- The game id stays `whatsMissing` and the name stays "What's Missing?".
- Pictures come only from `FF.MemoryDecks` (8 decks × 24). Art is
  `assets/images/games/memoryMatch/<id>.webp`, with the emoji as a fallback
  when a picture is missing.
- No `Math.random` and no localStorage reads while dealing. Every deal comes
  from `seed` + `k` through `R.rng(R.hash(...))`.
- Levels and picture counts:
  - easy 4, normal 6, hard 8
  - expert `min(10 + k, 16)`
  - endless starts at 3, +1 per fully right round, up to `R.ENDLESS_MAX = 24`
- Settings:
  - level: easy|normal|hard|expert|endless
  - theme: mix|animals|sea|food|fruit|characters|toys|sports|vehicles
  - seconds: 3|5|8|12
  - choices: 4|6|8
  - twists: mix|gone
  - rounds: 5|8|12
- `STANDARD = { level:'normal', theme:'mix', seconds:5, choices:6, twists:'mix', rounds:8 }`.
  Rounds never make a run non-standard.
- Scoring:
  - Base: Gone and Added 100, Swapped 150, Several gone 100 per right gap.
  - Speed bonus: up to +50, falling straight to 0 across the answer clock.
    Fully right answers only.
  - Streak: ×1.2 from 3, ×1.5 from 5.
  - Expert: +50 per right gap or answer, and +6 s on the clock.
  - Swapped is all or nothing, with the tap order free. Several gone gives
    partial credit, but the streak breaks unless every gap is right.
- Twists by level:
  - easy: gone, added
  - normal: + swapped
  - hard: + several (2 gaps)
  - expert: all, several 2–3
  - endless: swapped from 6 pictures, several (2) from 8, several (2–3) from 12
- Round 1 is always Gone. No twist three times in a row. `twists:'gone'`
  means only Gone.
- Decoys come from the deck(s) of the pictures on the board, never a picture
  that was on the board before the change. If too few, widen to all cards.
- Expert boards use only spellable cards: letters, spaces and hyphens, 2–14
  letters. Added and Swapped stay tap-based.
- Rooms offer easy to expert, never endless. Online needs 2–8 players.
- Old leaderboard scores are kept (no reset).
- Sounds are existing `api.audio.play` names: `flip`, `whoosh`, `select`,
  `correct`, `wrong`, `streak`, `roundStart`, `winner`.
- Animation uses CSS transitions plus timers, never rAF alone (the preview
  tab throttles rAF). Respect `prefers-reduced-motion`.
- UI copy goes through `FF.t(key, fallback)` with `wm*` keys.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Shared shapes (every task uses these names)

```text
card   = { id, name, emoji, deck }                 // from FF.MemoryDecks
round  = { k, n, cols, rows, slots,                 // slots = cols*rows
           before: [cardId|null x slots],           // the study board
           after:  [cardId|null x slots],           // the board after the change
           twist: 'gone'|'added'|'swapped'|'several',
           gaps: number,                            // 1 for gone/added/swapped, 2-3 for several
           answer: { slots: [int], ids: [cardId] }, // gone/several: emptied slots (ascending) + their ids;
                                                    // added: [newSlot] + [newId]; swapped: [a,b] (a<b) + their ids
           choices: [cardId] | null,                // gone/several when not spelled; always holds every answer id
           spell: bool,                             // expert gone/several
           secs: number }                           // answer seconds (base 20, +6 expert, +5 per gap over 1)
answer = { picks?: [cardId], text?: [string], slots?: [int] }
check  -> { ok: bool, right: [bool], rightGaps: int }
points -> { base, speed, bonus, mult, total }
```

## Review Focus

1. **Small themes with big boards:** Expert or Endless on one 24-card theme
   must still deal full boards, decoys and an Added newcomer without repeats
   or crashes. The board is capped and decoys widen. Test: in Task 1.
2. **Answer timeout in the middle of Several gone:** gaps left unfilled count
   as wrong, filled gaps still score, and the streak breaks. Test: in Task 2
   (`check` with a short `picks` array).
3. **Duplicate or out-of-range taps:** Swapped with the same slot twice,
   Added on an empty slot, or a slot index past `slots` → not ok, and no
   throw. Test: in Task 2.
4. **A late or replayed answer online:** a second answer for a round, an
   answer for an old `k`, or one after `closeAt` plus grace scores nothing.
   Test: in Task 5.
5. **Phone height:** on a 375×667 screen with 16 slots, the board and four
   choice rows fit with no page scroll. Test: in Task 4 (manual check in the
   preview at that size, `document.scrollingElement.scrollHeight <= innerHeight`).

---

### Task 1: Rules — settings, seeded boards, twists, choices

**Files:**
- Create: `js/whatsmissing/rules.js`
- Test: `tools/test/whatsMissing.test.js`

**Interfaces:**
- Consumes: `FF.MemoryDecks` (`js/data/memoryDecks.js`).
- Produces: `FF.WhatsMissingRules` with
  - constants `LEVELS, THEMES, SECONDS, CHOICES, TWISTS, ROUNDS, STANDARD, ENDLESS_MAX, MIN_PLAYERS (2), MAX_PLAYERS (8)`
  - `sanitize(s) -> settings`, `isStandard(s) -> bool`
  - `hash(s) -> uint`, `rng(seed) -> () => [0,1)`, `shuffle(list, rand)`
    (copy GeoSpin's three)
  - `cards() -> [card]`, `cardOf(id) -> card|null`
  - `picturesAt(level, k) -> n`, `grid(n) -> { cols, rows }`
  - `twistsAllowed(level, n) -> [twist]`
  - `deal(settings, seed, k, opts) -> round`, where opts `{ n, prev: [twist] }`
    is only for endless; otherwise twists come from `twistPlan(settings, seed, count)`
  - `twistPlan(settings, seed, count) -> [twist]`

- [ ] **Step 1: Write the failing tests** in `tools/test/whatsMissing.test.js`,
  loading `['js/core.js','js/data/memoryDecks.js','js/answerMatch.js','js/whatsmissing/rules.js']`
  with `loadFF` (see `tools/test/geoSpin.test.js` for the harness):
  - `wm settings`:
    - `sanitize({level:'x',theme:'mars',seconds:7})` deep-equals `STANDARD`.
    - `isStandard({rounds:5})` is true.
    - `isStandard({choices:4})` and `isStandard({level:'endless'})` are false.
  - `wm grid`: `grid(n)` for n = 3, 4, 6, 8, 12, 16, 20, 24 gives
    `3x2, 3x2, 3x3, 4x3, 4x4, 5x4, 5x5, 6x5`, and always `cols*rows > n`.
  - `wm pictures`:
    - `picturesAt('easy',0)` is 4, normal 6, hard 8.
    - Expert at k = 0, 3 and 9 gives 10, 13 and 16.
  - `wm deal same seed`:
    - `JSON.stringify(deal(S,'abc',k))` is the same twice for k = 0..7.
    - Seed `'abd'` differs at some k.
  - `wm deal boards`, for each level easy to expert and k = 0..7:
    - `before` has exactly n cards, all unique.
    - Gone: `after` has n-1 cards and the emptied slot is `answer.slots[0]`.
    - Added: `after` has n+1 cards, the newcomer is in a slot that was null
      before, and the newcomer was not on the board.
    - Swapped: exactly the two `answer.slots` differ, and their cards traded.
    - Several: `gaps` empty slots, matching `answer.slots` (ascending).
  - `wm twists`:
    - For 200 seeds, `twistPlan(...,8)[0] === 'gone'`.
    - No three equal twists in a row.
    - Each twist is in `twistsAllowed(level, n)`.
    - `twists:'gone'` gives only gone.
    - Several gaps: 2 on hard, 2–3 on expert.
  - `wm choices`:
    - The list length is `settings.choices`.
    - It contains every `answer.ids`.
    - It never contains another card from `before`.
    - Decoys share a deck with some board card unless the pool was too small.
  - `wm theme`:
    - `theme:'sea'` deals only sea cards on the board.
    - **Review Focus 1:** `{level:'expert',theme:'sea'}` k = 0..12, and
      endless `{n:24, theme:'sea'}`: no throw, unique board, Added newcomer
      not on the board, choices are full.
  - `wm expert spellable`: every card on an expert board matches
    `/^[A-Za-z][A-Za-z -]{1,13}$/` by letter count, and `round.spell` is true
    for gone and several.

- [ ] **Step 2: Run** `node tools/test/one.js whatsMissing.test.js`.
  Expected: FAIL (`FF.WhatsMissingRules` undefined).

- [ ] **Step 3: Implement `js/whatsmissing/rules.js`**
  - Use the same header comment style as `js/geospin/rules.js`.
  - Use separate random streams:
    - `rng(hash('board|'+seed+'|'+k))` for pictures and slots
    - `'twist|'+seed` for the plan
    - `'choice|'+seed+'|'+k` for decoys
  - The Mix board picks from all cards (filtered to spellable on Expert).
  - Endless `n` is `min(opts.n, ENDLESS_MAX, poolSize-1)`.
  - `secs = 20 + (expert ? 6 : 0) + 5*(gaps-1)`.

- [ ] **Step 4: Run** `node tools/test/one.js whatsMissing.test.js`. Expected: all PASS.

- [ ] **Step 5: Commit** `feat(whatsMissing): seeded rules for boards, twists and choices`.

### Task 2: Rules — checking, points, Expert names

**Files:**
- Create: `js/data/memoryAliases.js` (`FF.data.memoryAliases = { cardId: ['Other name', ...] }`)
- Modify: `js/whatsmissing/rules.js`
- Test: `tools/test/whatsMissing.test.js`

**Interfaces:**
- Consumes: `FF.AnswerMatch.create/check` (`js/answerMatch.js`), Task 1's round.
- Produces:
  - `check(round, answer) -> { ok, right, rightGaps }`
  - `checkName(text, cardId) -> AnswerMatch result`
  - `streakMult(streak) -> 1|1.2|1.5`
  - `points({ round, res, ms, secs, streak }) -> { base, speed, bonus, mult, total }`,
    where `streak` counts this answer if ok

- [ ] **Step 1: Write the failing tests:**
  - `wm check gone/added`: the right pick or slot gives ok, and the wrong one
    does not. Added on a slot that is null in `after` is not ok.
  - `wm check swapped`: `[a,b]` and `[b,a]` are both ok. `[a,c]` is not ok
    with `rightGaps` 0. **Review Focus 3:** `[a,a]`, `[a,99]` and `[]` are not
    ok and don't throw.
  - `wm check several`, for a 3-gap round:
    - two right picks out of three gives `right` `[true,true,false]`,
      `rightGaps` 2, not ok.
    - **Review Focus 2:** `picks` of length 1 gives `rightGaps` ≤ 1 and the
      missing gaps false.
  - `wm check expert text`: `'hotdog'` passes for `hot-dog`, `'dougnut'`
    passes for `donut` (via the alias Doughnut plus a mistake), and `'cat'`
    for `dog` fails.
  - `wm aliases`: no alias belongs to two cards, and no alias equals another
    card's name (normalised with AnswerMatch).
  - `wm points`:
    - Gone at ms 0 with secs 20 and streak 1 is total 150.
    - Gone at ms = secs*1000 is total 100.
    - Swapped at ms 0 with streak 3 is `round(200*1.2)` = 240.
    - Several partial 2 of 3 is base 200, speed 0, mult 1, total 200.
    - Expert gone at ms 0 with streak 5 is `round((100+50+50)*1.5)` = 300.
    - Wrong is total 0.

- [ ] **Step 2: Run** `node tools/test/one.js whatsMissing.test.js`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement**
  - `check` dispatches on `round.twist`:
    - picks or text are compared per gap in `answer.slots` order;
    - text goes through `checkName`, which builds one `FF.AnswerMatch` over
      all cards: names = `[card.name].concat(aliases[id]||[])`.
  - Write `memoryAliases.js` with common other names only (for example
    Doughnut, Hotdog, Icecream, Ladybird, Aeroplane). Keep it short.

- [ ] **Step 4: Run** the file. Expected: all PASS.

- [ ] **Step 5: Commit** `feat(whatsMissing): answer checks, points and Expert names`.

### Task 3: Solo game — setup, board, Gone/Added/Swapped with choices

**Files:**
- Create: `js/games/whatsMissing.js`
- Modify:
  - `js/games/memoryGames.js`: delete the `whatsMissing` registerGame block
    (lines ~663–899) and the header line. Keep `EMOJI`, which Memory Match uses.
  - `css/games.css`: replace the old `.wm-*` rules at lines ~316–328.
  - Script tags after `js/games/memoryGames.js`, adding
    `js/data/memoryAliases.js`, `js/whatsmissing/rules.js` and
    `js/games/whatsMissing.js`, in `play.html`, `admin.html`,
    `tools/load-check.js` and `tools/test-seed.html`.
- Test: `tools/test/whatsMissing.test.js` (registration),
  `tools/test/sharedDeal.test.js`, `tools/test/parallel.test.js`

**Interfaces:**
- Consumes: `FF.WhatsMissingRules` (Tasks 1–2). Copy these patterns from
  `js/games/geoSpin.js`:
  - `setupScreen`: the remembered setup in `whatsMissing:setup`, and the
    unranked note when `!R.isStandard`.
  - `fitPhone`.
  - The `start(api)` order: online check first, then the seed via `rand0()`,
    then `daily`/`challenge` playing `R.STANDARD`, then setup.
- Produces:
  - `FF.WhatsMissingGame = { board(host, round, opts), setTwist(...) }`, the
    board renderer Task 6 reuses for rooms. `opts`:
    `{ phase: 'study'|'open'|'reveal', onTap(slot), selected: [slot], marks: {slot:'right'|'wrong'} }`.

- [ ] **Step 1: Write the failing tests:**
  - `wm registered`:
    - The def `whatsMissing` exists with `leaderboard: true`.
    - It has the modes solo and turn.
    - `icons.js`, `assetManifest.js`, `roomUI.js` ONLINE_GAMES, `Crew.php`
      ONLINE_GAMES and `Leaderboards.php` list it.
    - The four script lists load `js/games/whatsMissing.js`.
    - `memoryGames.js` no longer has `id: 'whatsMissing'`.
  - Add `whatsMissing` to `tools/test/sharedDeal.test.js`, following its
    existing entries.
  - Update `tools/test/parallel.test.js`: drop whatsMissing from the
    memoryGames.js map, and add `'whatsMissing.js': []` as for geoSpin or
    blinkRemember.

- [ ] **Step 2: Run** `node tools/test/one.js whatsMissing.test.js`.
  Expected: the registration test FAILS.

- [ ] **Step 3: Implement the game:**
  - Setup screen with level (endless included), theme, seconds, choices,
    twists. Rounds come from `FF.GameLength.rounds(api, 8, 0)`.
  - Turn order: `scorersFor`, as the old code does (copy the helper; don't
    import from memoryGames).
  - Round flow:
    1. **Study:** the tiles pop in (`flip`), a countdown ring runs for
       `settings.seconds`, and there is an "I'm ready" button.
    2. **Change** (~900 ms): the tiles shimmer, then `whoosh`.
    3. **Open:** the question, plus choices or tile taps. The clock is
       `api.config.timer` as the base: `secs = round.secs - 20 + timer`.
       No clock when the timer is 0.
    4. **Reveal:** green and red marks, the answer animates home, and the
       points line shows.
  - Scoring through `api.scoring.add(id, pts.total, { correct, fastest })`
    and `markAnswer`, then `api.end(buildResults(api))`.
  - Tiles: cream faces with pastel sides, like the cover. Empty slots look
    recessed. The Gone gap gets a glowing dashed outline.
  - The vanish animation is CSS particles: ~10 small squares and sparkles
    rising and fading over 700 ms. With `prefers-reduced-motion`, a fade.
  - Phones: `fitPhone()` sizes the board to the height left after the top bar
    and the panel. The minimum tile is 44 px; past that, use more columns.

- [ ] **Step 4: Run** `node tools/test/run.js` and `node tools/load-check.js`.
  Expected: everything passes.

- [ ] **Step 5: Check in the preview.**
  - Add a `.claude/launch.json` entry that serves this worktree on a new port
    (as `playmona-geospin-9121` does), then
    `preview_start`, guest overrides, `FF.GameFlow.launch('whatsMissing')`.
  - Play Easy and Normal to the end, then screenshot.

- [ ] **Step 6: Commit** `feat(whatsMissing): new picture-tile game with Gone, Added and Swapped`.

### Task 4: Solo game — Several gone, Expert spelling, Endless, polish

**Files:**
- Modify: `js/games/whatsMissing.js`, `css/games.css`, `docs/expert-levels.md`
- Test: `tools/test/whatsMissing.test.js`

**Interfaces:**
- Consumes:
  - `FF.SpellTiles.deal(name, rand, { difficulty })` and
    `.board(set, { audio, onSubmit })` (`js/spellTiles.js`): call
    `board.open()` when the clock starts and `board.finish(correct)` after.
  - `R.check`, `R.points`.
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing test** `wm endless`:
  - Simulate with the rules: `deal(S_endless, seed, k, { n, prev })`,
    starting at n = 3 and rising by 1 per round to 24.
  - Each board has n cards and its twist is allowed for n.
  - No triple repeats when `prev` is passed through.

- [ ] **Step 2: Run** it. Expected: PASS if Task 1 covered it. If not, fix
  the rules until it does.

- [ ] **Step 3: Implement:**
  - **Several gone:** the active gap glows, a pick fills it and moves on, and
    tapping a filled gap re-picks it. The answer is submitted when every gap
    is filled or the clock ends; then the filled picks are checked.
  - **Expert:** in gone and several, the choice panel is replaced by
    `FF.SpellTiles` per gap, using the random `R.rng(R.hash('spell|'+seed+'|'+k+'|'+gap))`.
  - **Endless:**
    - n starts at 3 and rises after each fully right round.
    - It ends on a miss or timeout.
    - Headline: "You reached N pictures".
    - Best kept in `whatsMissing:endlessBest` (try/catch around storage).
    - `api.config.customRules = true`.
  - **Streak:** a badge on the panel, and `streak` plays at 3 and 5.
  - **docs/expert-levels.md:** move What's Missing to Done, with a one-line note.
  - **Review Focus 5:** at 375×667, check that
    `document.scrollingElement.scrollHeight <= innerHeight` for a 16-slot
    Expert board with the choices showing.

- [ ] **Step 4: Run** `node tools/test/run.js`. Expected: everything passes.
  In the preview, play Hard (see Several gone), Expert (spell) and Endless to
  10 pictures. Check phone and desktop sizes, then screenshot.

- [ ] **Step 5: Commit** `feat(whatsMissing): Several gone, Expert spelling and Endless`.

### Task 5: Referee, client and dev host

**Files:**
- Create: `js/whatsmissing/referee.js`, `js/whatsmissing/client.js`, `js/whatsmissing/dev.js`
- Test: `tools/test/whatsMissing.referee.test.js`

**Interfaces:**
- Consumes: the rules; `FF.Transport.dev` for tests.
- Produces:
  - `FF.WhatsMissingReferee.create({ run, room, store, randomInt, timers, log, report, onEnd })`
    with `.start()` and `.stop()`, plus constants `BRIEF_MS 5000`, `CHANGE_MS 1200`,
    `REVEAL_MS 4500`, `GRACE_MS 600`. The run is
    `{ matchId:'m_…', roomCode, seats, settings, startAt, seed? }`.
  - **Phases:** `starting → study → change → open → reveal → … → ended`.
  - **View `rooms/<code>/wm`:**
    - Always: `{ matchId, settings, order, phase, k, studyAt, changeAt, openAt, closeAt, nextAt, p, result }`.
    - `round` during `study`: `{ n, cols, rows, slots, before, twist:null }`.
    - From `open`: `{ n, cols, rows, slots, after, twist, gaps, choices, spell, secs }`.
      `before` is removed.
    - From `reveal`: `round.answer` and `round.before`.
  - Inbox `rooms/<code>/wmInbox/<uid>/<cmdId>` =
    `{ type:'answer', matchId, k, picks?|text?|slots?, t }`.
  - `p[uid] = { score, streak, right, last: { ok, rightGaps, pts } }`.
  - `report('result', { matchId, rows })` at the end, in the same shape as
    GeoSpin's.
  - `FF.WhatsMissingClient.create({ room, onChange })` with
    `view() -> { wm, uid, seated, me }`, `send(answer) -> bool`, `stop()`.
  - `FF.WhatsMissingApi.start(room, pick)` / `nudge(code)` POST to
    `/api/whatsmissing/start|nudge`, or use `FF.WhatsMissingDev` when
    `FF.Storage.get('devRooms')`.
  - `FF.WhatsMissingDev.start(room, pick)`, the same as `js/geospin/dev.js`
    with `wm*` names and `meta.wmMatch`.

- [ ] **Step 1: Write the failing tests.**
  - Copy `makeBus`, `makeClock`, `flush` and the `match()` helper from
    `tools/test/geoSpin.test.js`, with paths `wm`/`wmInbox`.
  - `wm referee: seed secret, study then open`:
    - No `round` while starting.
    - In study, `round.before` is there and has no `after` or `answer`.
    - In open, `before` is gone and `after` is there.
    - The seed never appears in `JSON.stringify(wm)`.
  - `wm referee: answers scored on the server`:
    - p1 answers right and gets `last.ok` and points > 0.
    - p2 answers wrong and gets 0.
    - Both are in, so it reveals early.
  - **Review Focus 4:** `wm referee: one answer per round`. None of these
    change scores: a second answer, an answer with `k-1`, an answer with
    another matchId, an answer sent before open, or an answer arriving
    after `closeAt + GRACE_MS`.
  - `wm referee: an answer within grace counts`.
  - `wm referee: ends ranked and reports`: after `rounds` rounds the phase is
    `ended`, `result.rows` are sorted by score, and one `report` comes out.
  - `wm referee: restart resumes with the same boards` (saved state).
  - `wm referee: refuses endless` (`sanitize` maps endless to normal for runs).

- [ ] **Step 2: Run** `node tools/test/one.js whatsMissing.referee.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the referee by following `js/geospin/referee.js`
  phase by phase. Checking and points come only from `R.check` and
  `R.points`; `ms` is `t - openAt`, using the database clock.

- [ ] **Step 4: Run** the file and `node tools/test/run.js`. Expected: everything passes.

- [ ] **Step 5: Commit** `feat(whatsMissing): server referee, client and dev host`.

### Task 6: Server API, runner and rules

**Files:**
- Create: `api/lib/WhatsMissing.php`, `tools/api/whatsmissing.test.php`
- Modify:
  - `api/lib/bootstrap.php` (the class list)
  - `api/lib/Routes.php` (a `whatsmissing()` factory like `geospin()`)
  - `api/lib/EngineRoutes.php` (`POST /whatsmissing/start|nudge`; heartbeat
    `whatsmissing` → `dropWhatsmissing`; event `whatsmissing` → `recordResult`)
  - `api/lib/Db.php` (tables `whatsmissing_matches` and `whatsmissing_seats`,
    plus indexes, copying the geospin ones)
  - `api/cron.php` (the sweep)
  - `api/crew/runner.js` (a `whatsmissings` map: `whatsmissingRuns` stream,
    `whatsmissingState/<id>` store, heartbeat list, drop, idle check, close)
  - `api/crew/lib/loader.js` (memoryDecks, memoryAliases, the rules and the
    referee, after answerMatch)
  - `database.rules.json` (`wmInbox` copied from `gsInbox`, and every
    `geospinRuns`/`geospinState` entry copied as `whatsmissing*`; note
    hand-added in the same place gsInbox is noted)
  - `tools/api/test.php` (require the new test after geospin)

**Interfaces:**
- Consumes: `FF.WhatsMissingReferee` (Task 5).
- Produces:
  - `WhatsMissing::start(user, body, now)` returns `{ matchId, startAt }`.
  - `nudge`, `sweep(now)`, `stillActive(ids)`, `recordResult(body, now)`.
  - `WhatsMissing::LEVELS = ['easy','normal','hard','expert']`, plus THEMES,
    SECONDS, CHOICES, TWISTS and ROUNDS equal to the JS lists (endless excluded).

- [ ] **Step 1: Write the failing PHP tests**, copying `geospin.test.php`:
  - Start refuses a non-host, refuses when not everyone is ready, and refuses
    1 or 9 players.
  - Strict settings: `level:'endless'` gives a 400.
  - Start writes `whatsmissingRuns/<id>` and room `meta.wmMatch`.
  - Nudge and heartbeat drop work.
  - recordResult writes the seats.
  - **JS test** in `whatsMissing.test.js`: the PHP lists equal the JS lists,
    read with a regex the way other games' tests compare lists.

- [ ] **Step 2: Run** `php tools/api/test.php`. Expected: the WhatsMissing section FAILS.

- [ ] **Step 3: Implement** by copying `api/lib/GeoSpin.php`, with game
  `whatsMissing` and match prefix `m_`.

- [ ] **Step 4: Run** `php tools/api/test.php` and `node tools/test/run.js`.
  Expected: everything passes. Also run
  `node -e "require('./api/crew/lib/loader.js')"` (or however runner tests
  load it) to confirm the referee loads in Node.

- [ ] **Step 5: Commit** `feat(whatsMissing): server start, runner referee and database rules`.

### Task 7: Online rooms UI

**Files:**
- Modify: `js/games/whatsMissing.js`, plus script tags for
  `js/whatsmissing/client.js` in the four lists (`dev.js` and `referee.js`
  are loaded on demand, as GeoSpin does)

**Interfaces:**
- Consumes:
  - `FF.WhatsMissingClient` and `FF.WhatsMissingApi` (Task 5).
  - `FF.WhatsMissingGame.board` (Task 3).
  - GeoSpin's `ROOM` object and `racingRoom(api)` pattern
    (`js/games/geoSpin.js` ~1036–1335): settings picker without endless, a
    `start: FF.WhatsMissingApi.start`, a brief screen, and the round recap.

- [ ] **Step 1: Implement**
  - `online(api, room)`:
    - Draw from the view by phase.
    - Answers go through `client.send` and are locked after sending.
    - Show "Waiting for others".
    - On reveal, show every player's result row and the right answer.
  - Final results go through the shared end screen, in the same way as GeoSpin.

- [ ] **Step 2: Test a two-tab dev room.**
  - Use `FF.Storage.set('devRooms', true)` and the guest overrides from the
    two-tab testing memory.
  - Play 3 rounds on Hard: one tab right, one wrong, and one Swapped round.
  - Check that the scores match in both tabs and the recap shows.
  - Screenshot both, then turn `devRooms` back off.

- [ ] **Step 3: Run** `node tools/test/run.js`. Expected: everything passes.

- [ ] **Step 4: Commit** `feat(whatsMissing): online rooms with the server referee`.

### Task 8: Crew players

**Files:**
- Create: `js/crew/brains/whatsMissing.js` (`FF.CrewWhatsMissing = { strategy, create }`)
- Modify:
  - `js/crew/controller.js` (an `onWhatsMissing` hook like `onWordFlow`)
  - `js/crew/brains/quiz.js` (remove `'whatsMissing'` from its list)
  - `api/crew/lib/loader.js`
  - `api/lib/WhatsMissing.php` (seat crew like `WordFlow::start`'s
    `crewUids`, so crew in the room are seats)
  - `api/lib/Crew.php` (keep `whatsMissing` in `GAMES`)
- Test: `tools/test/crewBrains.test.js` (or a new `whatsMissing.brain.test.js`)

**Interfaces:**
- Consumes: the view `wm`, `R.check`, `js/crew/levels.js` (`whatsMissing: 3600` already exists).
- Produces: `strategy.answer(round, before, level, rand) -> answer | null`
  - It works out the answer by comparing the `before` it saw during study
    with `after`.
  - It misses on purpose by level accuracy. `null` means no answer.
  - `create({ transport, uids, crew, later, log })` sends through `wmInbox`
    at a delay picked from the level.

- [ ] **Step 1: Write the failing tests:**
  - With accuracy 1, `strategy.answer` is right for all four twists.
  - With accuracy 0, it is never right.
  - Delays fall within the round's `secs`.

- [ ] **Step 2: Run** it. Expected: FAIL.

- [ ] **Step 3: Implement** by following `js/crew/brains/wordFlow.js` for
  `create`, the controller hook and the loader entry.

- [ ] **Step 4: Run** `node tools/test/run.js` and `php tools/api/test.php`. Expected: everything passes.

- [ ] **Step 5: Commit** `feat(whatsMissing): crew players answer through the inbox`.

- **Fallback the spec allows:** if seating crew in a server-run match turns
  out much bigger than WordFlow's pattern, drop whatsMissing from
  `Crew::GAMES` and from the quiz brain list instead, update the tests, and
  say so in the final report.

### Task 9: Whole-branch check

- [ ] Run all of these, each passing:
  - `node tools/test/run.js`
  - `php tools/api/test.php`
  - `node tools/load-check.js`
  - `powershell -File tools/verify.ps1` (no MISSING, and whatsMissing registered)
  - `node tools/contrast-check.js` if the new CSS added colour pairs
- [ ] In the preview, at phone and desktop sizes:
  - a solo Normal run
  - a daily-style standard run (`config.daily`)
  - a two-tab room
- [ ] Update the memory file `playmona-whats-missing.md` with how it is built
  and the gotchas.
- [ ] Ask Brighton before pushing: a push to main deploys and publishes the rules.
