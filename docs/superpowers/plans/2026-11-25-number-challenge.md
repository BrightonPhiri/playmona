# Number Challenge Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Number Challenge (id `numberChallenge`) with four ways to play (Quick sums, Sprint, Chain, Make the target), four levels including a number-pad Expert, two looks, Solo/Turns, and a server-refereed online Race with crew.

**Architecture:** Pure seeded rules in `js/numberchallenge/rules.js` shared by the screen, the referee (runs in the Node crew runner) and the crew brain. Screen in `js/games/numberChallenge.js`. Online mirrors Say What?: `referee.js` / `client.js` / `dev.js`, view `rooms/<code>/nc`, inbox `ncInbox`, PHP start/nudge/results in `api/lib/NumberChallenge.php`.

**Tech Stack:** ES5 classic scripts on the global `FF` namespace (no modules, no build), CSS tokens, Firebase RTDB, PHP 8.3 API, Node 24 crew runner. Tests: `node tools/test/one.js <file>`, `node tools/test/run.js`, `php tools/api/test.php`.

**Spec:** `docs/superpowers/specs/2026-11-25-number-challenge-design.md`

**Worktree:** `C:\Users\Brighton\AppData\Local\Temp\claude\fc3e7a76139e9904\6daeae40-2f26-47fb-a796-e30589e1ecb2\scratchpad\wt`, branch `feat/number-challenge` (never git-switch the OneDrive checkout).

## Global Constraints

- Keep id `numberChallenge`, category `numbers`, icon `hash`.
- ES2017 or older in rules/referee/client/brain (they run in the crew runner); screen code ES5 like the rest of `js/games`.
- Deals use only the seed passed in (own `rng(seed)`), never `Math.random`.
- Every answer is a whole number 0–9999. No negatives, decimals or remainders. Chain values stay whole, 0–999.
- Standard Quick sums scores exactly `round((100 + speedBonus(ms)) × W)`, `speedBonus` = 50 at ≤ 2 s, linear to 0 at 15 s; `W = { easy: 1, normal: 1.5, hard: 2, expert: 2 }`; Expert +50. No streak points in Quick sums.
- `STANDARD = { mode: 'quick', level: 'normal', time: 'normal', rounds: 10, sprint: 60, speed: 'steady' }`.
- CSS prefix `nc-`, tokens `--nc-*`, looks by `data-nc-look="arcade|notebook"`; i18n keys prefixed `nc` with English fallbacks.
- Phone 375 × 667 never scrolls while answering. Respect reduced motion.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A choice list where a trap value equals the answer, or two traps collide, after rounding: every choice list must be 4 distinct whole numbers ≥ 0 with exactly one right (Task 2 property test over 2000 seeds per level).
2. A Make the target submission that names a tile the player never had, reuses a tile, divides inexactly or goes to 0: `replay` must refuse it and the referee must score 0 (Task 4 and Task 11 tests).
3. Online Sprint answers sent out of order, twice, or after the player's own penalised end time: the referee ignores them and its score wins over the phone's (Task 12 tests).
4. A pad answer with leading zeros (`007`) or empty input: `check` treats `'007'` as 7, empty as wrong, never throws (Task 2 test).
5. A rejoining phone mid-chain or mid-sprint: the view alone must redraw the current step / position (Task 13 `ready()` test).

---

### Task 1: Rules skeleton — settings, levels, seeded random

**Files:**
- Create: `js/numberchallenge/rules.js`
- Test: `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces on `FF.NumberChallengeRules` (alias `R` below):
  `MODES = ['quick','sprint','chain','target']`, `LEVELS = ['easy','normal','hard','expert']`, `WEIGHT`, `TIMES = ['quick','normal','relaxed','none']`, `ROUNDS = { quick: [10,15,20], chain: [5,8,10], target: [3,5,8] }`, `SPRINTS = [30,60,90]`, `SPEEDS = ['steady','fast']`, `STEP_MS = { steady: 2200, fast: 1400 }`, `STANDARD`, `MIN_PLAYERS = 2`, `MAX_PLAYERS = 8`, `SPRINT_LIST = 150`;
  `hash(str) -> uint32`, `rng(seed) -> () => [0,1)`, `int(rand, lo, hi)`, `pick(rand, list)`, `shuffle(list, rand)`;
  `sanitize(raw) -> settings` (every key present, bad values → STANDARD's), `sanitizeRoom(raw)` (as sanitize, `time: 'none'` → `'normal'`), `isStandard(s) -> bool` (mode, level, time, rounds only);
  `secondsFor(settings, item) -> int` (0 = no limit).

- [ ] **Step 1: Write the failing tests**

```js
test('nc rules: sanitize falls back to the standard and keeps every key', () => {
  assertEqual(R.sanitize({}), R.STANDARD);
  assertEqual(R.sanitize({ mode: 'chain', rounds: 99 }).rounds, 5);   // chain's first option
  assertEqual(R.sanitize({ mode: 'target', level: 'expert' }).level, 'expert');
  assertEqual(R.sanitizeRoom({ time: 'none' }).time, 'normal');
  assert(R.isStandard(R.STANDARD) && !R.isStandard(R.sanitize({ level: 'hard' })));
});
test('nc rules: seconds per item', () => {
  const q = (o) => R.sanitize(Object.assign({ mode: 'quick' }, o));
  assertEqual(R.secondsFor(q({ time: 'quick' }), {}), 10);
  assertEqual(R.secondsFor(q({}), {}), 20);
  assertEqual(R.secondsFor(q({ time: 'relaxed', level: 'expert' }), {}), 36);
  assertEqual(R.secondsFor(q({ time: 'none' }), {}), 0);
  const c = (l) => R.sanitize({ mode: 'chain', level: l });
  assertEqual(R.secondsFor(c('hard'), {}), 10); assertEqual(R.secondsFor(c('expert'), {}), 16);
  const t = (l, time) => R.sanitize({ mode: 'target', level: l, time });
  assertEqual(R.secondsFor(t('easy', 'normal'), {}), 45); assertEqual(R.secondsFor(t('hard', 'quick'), {}), 68);
  assertEqual(R.secondsFor(t('expert', 'relaxed'), {}), 180);
});
test('nc rules: rng is repeatable per seed', () => {
  const a = R.rng('x'), b = R.rng('x'), c = R.rng('y');
  const s = (r) => [r(), r(), r()].join();
  assertEqual(s(a), s(b)); assert(s(R.rng('x')) !== s(c));
});
```

Load with `loadFF(['js/core.js', 'js/numberchallenge/rules.js'])`.

- [ ] **Step 2:** Run `node tools/test/one.js numberChallenge.test.js` — FAIL (no file).
- [ ] **Step 3:** Implement as listed. Target seconds = `round(base × {quick:.75, normal:1, relaxed:1.5})`, base `{easy:45, normal:60, hard:90, expert:120}`; Quick `{quick:10, normal:20, relaxed:30}` + 6 on Expert; Chain 10 (+6 Expert, ignores `time`); Sprint returns `settings.sprint`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(numberChallenge): rules settings and seeded random`.

### Task 2: Rules — sums, choices, checking, Quick and Sprint points

**Files:** Modify `js/numberchallenge/rules.js`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces: `KINDS` (by level, from the spec's Levels table: `add, sub, mul, div, missing, sequence, double, half, order, percent, fraction, square`), `question(level, tier, rand, kind?) -> { kind, tier, text, answer }`, `choicesFor(item, rand) -> [4 ints]`, `solveText(text) -> int|null` (works the answer out from the shown text: `×`, `÷`, `−`, `?` missing slot, `%  of`, `½ ⅓ ¼ ¾ of`, `²`, sequences `a, b, c, d, ?`), `seqNexts(terms) -> [distinct next terms over the families arithmetic, ×2, squares that fit]`, `check(item, text) -> bool` (`parseInt` of trimmed digits; `'007'`→7; empty/non-digits → false), `speedBonus(ms)`, `points(mode, o) -> int` for `quick` (`{level, ms, right}`) and `sprint` (`{level, tier, right}`: `round((10 + 10×tier) × W)` + 5 Expert), `tierAt(i) = min(5, 1 + floor(i/4))`, `penaltyMs(level)` (2000 Easy, else 3000).
- Text uses `×` `÷` `−` (U+2212) and `?`; tiers 1–5 scale operand ranges within the level's maxima.

- [ ] **Step 1: Write the failing tests**

```js
test('nc sums: 2000 seeds per level give whole answers 0-9999 that the text proves', () => {
  R.LEVELS.forEach((lv) => { for (let s = 0; s < 2000; s++) {
    const r = R.rng(lv + s), q = R.question(lv, 1 + (s % 5), r);
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 9999, q.text);
    assertEqual(R.solveText(q.text), q.answer, q.text);
    assert(R.KINDS[lv].indexOf(q.kind) !== -1, lv + ' ' + q.kind);
  } });
});
test('nc sums: Easy stays within 20 and its tables; Hard reaches order and percent', () => { /* Easy: every number in text <= 20 except table products; kinds seen over 2000 seeds include every KINDS entry */ });
test('nc sums: choices are 4 distinct whole numbers >= 0 with exactly one right', () => {
  R.LEVELS.forEach((lv) => { for (let s = 0; s < 2000; s++) {
    const r = R.rng('c' + lv + s), q = R.question(lv, 3, r), c = R.choicesFor(q, r);
    assertEqual(c.length, 4); assertEqual(new Set(c).size, 4);
    assertEqual(c.filter((x) => x === q.answer).length, 1);
    c.forEach((x) => assert(Number.isInteger(x) && x >= 0));
  } });
});
test('nc sums: no shown sequence fits two families', () => { /* every sequence question: R.seqNexts(terms).length === 1 */ });
test('nc sums: check takes digits only', () => {
  const q = { answer: 7 };
  assert(R.check(q, '7') && R.check(q, '007') && R.check(q, ' 7 '));
  assert(!R.check(q, '') && !R.check(q, '8') && !R.check(q, 'seven') && !R.check(q, null));
});
test('nc points: standard Quick sums score exactly as the old game', () => {
  assertEqual(R.points('quick', { level: 'normal', ms: 1500, right: true }), 225);
  assertEqual(R.points('quick', { level: 'normal', ms: 8500, right: true }), 188);   // (100+25)*1.5 rounded
  assertEqual(R.points('quick', { level: 'normal', ms: 20000, right: true }), 150);
  assertEqual(R.points('quick', { level: 'expert', ms: 20000, right: true }), 250);
  assertEqual(R.points('quick', { level: 'hard', ms: 0, right: false }), 0);
  assertEqual(R.points('sprint', { level: 'normal', tier: 3, right: true }), 60);
  assertEqual(R.points('sprint', { level: 'expert', tier: 5, right: true }), 125);
  assertEqual(R.tierAt(0), 1); assertEqual(R.tierAt(16), 5); assertEqual(R.penaltyMs('easy'), 2000);
});
```

Fill the two commented tests with the assertions named in their comments.

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Traps for `choicesFor` (spec: off by 1, off by 10, wrong sign, left-to-right for `order`, digit swap, previous term), then near numbers; drop any trap `< 0`, non-integer, equal to the answer or already in the list; shuffle with `rand`. A generator that would break the sequence rule re-rolls.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(numberChallenge): sums, choices and points`.

### Task 3: Rules — Chain

**Files:** Modify `js/numberchallenge/rules.js`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces: `chain(level, rand) -> { kind: 'chain', start, steps: [{ op: '+'|'-'|'x'|'/'|'double'|'half', n, label }], values: [after each step], answer }` (steps: Easy 3, Normal 5, Hard/Expert 7; ops and ranges from the spec), `chainChoices(item, rand)` (traps: one step skipped, value before the last step, off by the last step's `n`, off by 1 / 10), `chainText(item) -> '6 → +4 → 10 → ×2 → 20'`, `points('chain', { level, steps, ms, limitMs, right })` = `round((100 + 10×steps + speed) × W)` + 50 Expert, speed `round(50 × max(0, 1 − ms/limitMs))`, 0 when `limitMs` is 0.

- [ ] **Step 1: Tests** — `nc chain: 2000 seeds per level keep every value whole within 0-999, the right step count, and answer = last value`; `nc chain: Easy uses only + and - up to 10, Normal never x4 or /`; `nc chain: choices 4 distinct, one right`; `nc chain: points` with `points('chain', { level: 'normal', steps: 5, ms: 0, limitMs: 10000, right: true }) === 300` and `{ level: 'expert', steps: 7, ms: 16000, limitMs: 16000, right: true } === 390`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Pick each step from ops valid for the current value (half/÷ only when exact, − only when the result stays ≥ 0, × only when ≤ 999); labels `+ 4`, `− 5`, `× 2`, `÷ 3`, `double it`, `half it` via i18n at render time (rules keep `op`/`n` only, `label` in English as fallback).
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat(numberChallenge): chain rules`.

### Task 4: Rules — Make the target

**Files:** Modify `js/numberchallenge/rules.js`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces: `target(level, rand) -> { kind: 'target', tiles: [ints], target, solution: 'a*b,c+d' , ops: ['+','-',...] }` (tiles/targets/ops per spec; Expert solution uses every tile; target never equals a tile or `a op b` of two tiles);
  `replay(tiles, ops, stepsText) -> { ok, left: [ints], error? }` — steps `'25*4,100+7'`, ops `+ - * /`, each operand must be present in the current multiset, result whole and > 0, `/` exact; `ok:false` on any breach;
  `submitText(steps, value) -> 'steps;value'`; `targetResult(item, text) -> { ok, value, off, usedAll }` (value must be in `replay(...).left`, else `ok:false`; no steps = value must be a dealt tile);
  `solveTarget(tiles, target, ops, opts) -> { steps, value, off }` (exhaustive search, best exact else nearest; `opts.allTiles` prefers all-tile exact);
  `points('target', { level, off, usedAll, ms, limitMs })` — exact `round((100 + speed) × W)` (+50 Expert with `usedAll`); Easy off 1–2 → `round(50×W)`, 3–5 → `round(25×W)`; others 1–5 / 6–10; else 0.

- [ ] **Step 1: Tests** — `nc target: 500 seeds per level, the own solution replays to the target`; `nc target: Expert solutions use all 6 tiles`; `nc target: never a tile or a two-tile sum`; `nc target: replay refuses missing or reused tiles, 0, negatives and inexact division`:

```js
const T = [25, 4, 7, 3];
assert(R.replay(T, ['+','-','*','/'], '25*4,100+7').ok);
['25*25', '25-25', '3-7', '7/3', '9+1', '25*4,25+1', '25+'].forEach((s) => assert(!R.replay(T, ['+','-','*','/'], s).ok, s));
assert(!R.replay(T, ['+','-'], '25*4').ok);   // sign not allowed at this level
assertEqual(R.targetResult({ tiles: T, ops: ['+','-','*','/'], target: 107 }, '25*4,100+7;107'), { ok: true, value: 107, off: 0, usedAll: false });
assertEqual(R.targetResult({ tiles: T, ops: ['+'], target: 30 }, ';25').off, 5);
assert(!R.targetResult({ tiles: T, ops: ['+'], target: 30 }, ';99').ok);
```

  and `nc target: points bands` (`{level:'normal', off:0, ms:0, limitMs:60000}` → 225; `{level:'easy', off:2}` → 50; `{level:'easy', off:4}` → 25; `{level:'hard', off:7}` → 50; `{level:'hard', off:11}` → 0; Expert exact all tiles at full time → 250).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Generate by combining random tiles with random allowed ops (respecting the replay rules) until the value lands in the level's target range; record the steps as `solution`. `solveTarget` is a DFS over pairs with memo on the sorted multiset; 6 tiles finishes well under 100 ms in Node (assert this in the 500-seed test's total time < 10 s).
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat(numberChallenge): make the target rules`.

### Task 5: Rules — deals, Turns matching, shared deal

**Files:** Modify `js/numberchallenge/rules.js`, `tools/test/sharedDeal.test.js`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces: `itemAt(settings, seed, k, p?) -> item` — the k-th item for player p (default 0), from `rng(seed + '|' + mode + '|' + k + '|' + p)`; for p > 0 it has the same `kind` and `tier` (sums), step count (chains) or level (targets) as `itemAt(settings, seed, k, 0)`. Quick items draw tier 1–5; Sprint uses `tierAt(k)`. Every non-Expert sum/chain item carries `choices` (seeded from the same rng); Expert items have `choices: null`.
  `deal(settings, seed, p?) -> { items }` — count = `rounds` (quick/chain/target) or `SPRINT_LIST` (sprint); no two items in one deal share `text` (re-roll with an attempt suffix).

- [ ] **Step 1: Tests** — `nc deal: seeded and repeatable for every mode and level`; `nc deal: counts per mode (sprint 150)`; `nc deal: no repeated text in a deal`; `nc deal: player 2 is matched in kind and tier but has different numbers` (over 200 seeds, ≥ 90 % of items differ in text); `nc deal: Expert items have no choices, others have 4`. In `sharedDeal.test.js` add `shared deal: Number Challenge deals from the seed alone` (two loads of the rules, same `deal(R.STANDARD, 'ch|abc')` JSON).
- [ ] **Step 2:** Run both files — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat(numberChallenge): seeded deals and matched turns`.

### Task 6: Screen frame, setup, looks, registration, old file removed

**Files:**
- Create: `js/games/numberChallenge.js`
- Delete: `js/games/numberGames.js`
- Modify: `play.html`, `admin.html`, `tools/test-seed.html`, `tools/load-check.js` (replace the `numberGames.js` tag with `js/numberchallenge/rules.js`, `js/numberchallenge/client.js`, `js/games/numberChallenge.js` — create an empty-shell `client.js` exposing `FF.NumberChallengeClient = { create, tidy, ready }` stubs now, filled in Task 13), `tools/test/watchGames.test.js` (drop `numberGames: 1`), `css/tokens.css`, `css/games.css`
- Test: `tools/test/numberChallenge.test.js`

**Interfaces:**
- Consumes: Task 1–5 rules.
- Produces in the game file: `frame(api, cfg) -> { root, top, card, panel, setScore(n), setRound(text), timer: { set(rem,total), idle() }, flame(n) }`, `setupScreen(api, players, onGo(cfg))`, `choiceBoard(values, onPick) -> { el, open(), finish(rightValue, picked) }`, `numberPad(onSubmit(text)) -> { el, open(), finish(ok), destroy() }` (keys 1–9, 0, ⌫, ✓; physical digits/Backspace/Enter; max 4 digits; ✓ with empty input does nothing), `revealBar(info)`, `recap(api, run)` where `run = { cfg, rows: [{ item, given, right, points }], best, score }`, and `FF.NumberChallengeGame = { frame, choiceBoard, numberPad, revealBar, look, room: ROOM }`. Setup saved to `numberChallenge:setup:v1`, look to `numberChallenge:look` (`'arcade'` default).
- `FF.registerGame({ id: 'numberChallenge', name: 'Number Challenge', category: 'numbers', icon: '🔢', players: [1, 8], modes: ['solo','turn'], defaultMode: 'solo', leaderboard: true, room: ROOM, howToPlay: [...4 modes...], start })`. `start` mirrors `sayWhat.js:1107-1118`: room → `online(api, room)`; daily/challenge → `play(api, R.STANDARD, seed, 'solo')`; else setup, `customRules` when `!R.isStandard(cfg)`. Mode players dispatch: `play(api, cfg, seed, playMode)` calls `playQuick | playSprint | playChain | playTarget` (Tasks 7–10; until then a stub that ends the run).

- [ ] **Step 1: Tests** — `numberChallenge registered: solo and turns, on the leaderboards, listed in every page` (copy the shape of `sayWhat.test.js:283`, and assert no file still names `numberGames.js`); `numberChallenge looks: arcade and notebook tokens exist` (`--nc-` tokens in `css/tokens.css` for both `[data-nc-look="arcade"]` and `[data-nc-look="notebook"]`, Patrick Hand used by notebook).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement frame, setup (Way to play tiles → Level → mode options: Quick: Sums + Time; Sprint: Length; Chain: Chains + Speed; Target: Targets + Time → Look → Start), looks CSS from the spec's colour lists, `fitPhone()` like Say What?, desktop two columns from 900 px. Grep first that no other file uses `nc-` classes or `ncInbox`.
- [ ] **Step 4:** Run the test file plus `node tools/test/run.js` — PASS (watchGames, smoke, parallel included).
- [ ] **Step 5:** Commit `feat(numberChallenge): new screen frame, setup and looks; retire numberGames.js`.

### Task 7: Quick sums play (Solo) with the pad, reveal and recap

**Files:** Modify `js/games/numberChallenge.js`, `css/games.css`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Consumes: `R.deal`, `R.secondsFor`, `R.check`, `R.points('quick')`, Task 6 frame parts.
- Produces: `playQuick(api, cfg, items, turns)` where `turns` is the `FF.NumberChallengeTurns` state or null; scoring through `api.scoring.add(id, pts, { correct: true, fastest: ms })` / `markAnswer(id, false)`; `api.end({ results, winnerId, bestStreak, quizCorrect, quizAnswered, achievements })` with `streak5`, `streak10`, `perfect` as the old `finishNumberChallenge`.

- [ ] **Step 1: Test** — `nc quick: a headless run of the standard deal scores the old way` — drive `playQuick` with a fake api (as `sayWhat.test.js:339` does for the daily run), answer every item right at 1.5 s → total `10 × 225`, achievements include `perfect`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: sum card (aria-label reads signs as words), choices 2 × 2 or pad on Expert, timer ring (`secondsFor`, hidden for No limit), flame chip from the 2nd right in a row, reveal drops the answer into `?` then auto-advances (1 s right / 1.8 s wrong, as Say What?), recap "Sums to check" missed first.
- [ ] **Step 4:** Run — PASS; then preview check: `/play` → Number Challenge → Quick sums, Normal and Expert, both looks, 375 px and 1280 px (see `familygame-dev-workflow`: `localStorage['playmona:devAuth']='true'`, `FF.Access.canPlay = () => true`).
- [ ] **Step 5:** Commit `feat(numberChallenge): Quick sums with pad, reveal and recap`.

### Task 8: Sprint play

**Files:** Modify `js/games/numberChallenge.js`, `css/games.css`; Test `tools/test/numberChallenge.test.js`

**Interfaces:**
- Produces: `FF.NumberChallengeSprint = { create(items, level, lengthMs) -> state, answer(state, text, now) -> { right, points, penaltyMs, done }, endAt(state) }` (pure, also used by Task 12's referee re-check), and `playSprint(api, cfg, items, turns)`.

- [ ] **Step 1: Tests** — `nc sprint: a wrong answer takes the penalty off the end and moves on`; `nc sprint: answers after the end are ignored`; `nc sprint: the list's end finishes the sprint` (feed 150 right answers).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement the pure state, then the screen: countdown bar that flashes red on a penalty, tier pips, right count, right answer flashed 700 ms on a miss.
- [ ] **Step 4:** Run — PASS; preview Sprint Easy and Expert. **Step 5:** Commit `feat(numberChallenge): Sprint`.

### Task 9: Chain play

**Files:** Modify `js/games/numberChallenge.js`, `css/games.css`

**Interfaces:** Produces `playChain(api, cfg, items, turns)`. Uses `R.STEP_MS[cfg.speed]`, `R.chainText`, `R.points('chain')`.

- [ ] **Step 1: Test** — `nc chain screen: steps show one at a time and only the current step is in the card` (fake timers; after `start + 2 × STEP_MS` the card text holds step 2's label and not step 1's).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement: start number, then each step replaces the last (a slide, plain swap under reduced motion), then `= ?` and the answer panel with its own clock; reveal writes the whole chain.
- [ ] **Step 4:** Run — PASS; preview Steady and Fast. **Step 5:** Commit `feat(numberChallenge): Chain`.

### Task 10: Make the target play

**Files:** Modify `js/games/numberChallenge.js`, `css/games.css`

**Interfaces:** Produces `targetBoard(item, opts) -> { el, open(), steps() -> 'a*b,...', best() -> int, finish(result) }` and `playTarget(api, cfg, items, turns)`. Submits `R.submitText(steps, value)` and scores with `R.targetResult` + `R.points('target')`.

- [ ] **Step 1: Tests** — `nc target board: tile, sign, tile merges and logs the step`; `nc target board: refused merges leave the tiles alone` (7 ÷ 3, 3 − 7); `nc target board: a hit submits itself, except on Expert with tiles left`; `nc target board: Undo and Clear restore the tiles`. Drive with synthetic clicks in the harness DOM, as `sayWhat.test.js:79` drives SpellTiles.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement per spec (Done = nearest tile, clock end = nearest tile; reveal shows off-by and "One way:" from `item.solution`).
- [ ] **Step 4:** Run — PASS; preview all four levels. **Step 5:** Commit `feat(numberChallenge): Make the target`.

### Task 11: Turns

**Files:** Modify `js/games/numberChallenge.js`; Test `tools/test/numberChallenge.test.js`

**Interfaces:** Produces `FF.NumberChallengeTurns = { create(ids), next(s), award(s, id, pts, ok) }` (same shape as `FF.SayWhatTurns`). Quick/Chain/Target: item k for player index p is `R.itemAt(cfg, seed, k, p)`, a "Kofi's turn" banner + Go between turns. Sprint: one whole sprint per player from `R.deal(cfg, seed, p)`, with a "Pass to Kofi" card.

- [ ] **Step 1: Tests** — `nc turns: points and streak go to the player who answered`; `nc turns: next wraps`; `nc turns: each player's item k is matched to player 0's`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; preview 3 players in each mode. **Step 5:** Commit `feat(numberChallenge): Turns`.

### Task 12: Referee

**Files:**
- Create: `js/numberchallenge/referee.js`
- Test: `tools/test/numberChallenge.referee.test.js` (copy the bus/clock harness from `sayWhat.referee.test.js:1-108`)

**Interfaces:**
- Produces: `FF.NumberChallengeReferee.create({ run, room, store, randomInt, timers, log, report, onEnd }) -> { start(), stop() }`, same contract as `FF.SayWhatReferee`.
- View `rooms/<code>/nc`: `{ v, matchId, settings, phase: 'starting'|'ready'|'steps'|'open'|'reveal'|'ended', k, total, readyAt, openAt, closeAt, nextAt, order, p: { uid: { name, score, streak, best, right, inK, at?, end? } }, round, last, result }`.
  `round` per mode: quick `{ k, text, choices: 'a|b|c|d' | null, seconds }`; chain `{ k, start, shown: n, step: { op, n }, steps: total, choices, seconds }` (published step by step: `phase 'steps'`, one write per `STEP_MS`); target `{ k, tiles: 'a,b,c', ops: '+-*/', target, seconds }`; sprint (k = 0 only) `{ k: 0, list: [{ text, choices, tier }], seconds }`.
  `last` = `{ k, answer | solution, results: { uid: { text, right, off?, points } } }`.
- Inbox `ncInbox/<uid>/<cmdId>`: `{ matchId, k, text, t }`; sprint text `'i:answer'` items joined by `,` (in order); target text `R.submitText(...)`. Text ≤ 80 chars.
- Scoring: quick/chain/target via `R.points`, speed from the database clock (`t` vs `openAt`); sprint re-checked with `FF.NumberChallengeSprint` per player, end = `openAt + sprint×1000 − penalties + GRACE_MS`. Rank as Say What? (`points`, then `right`, then total `ms`). `report('numberchallenge', { rows, mode, level })` at the end.

- [ ] **Step 1: Tests** — `nc referee: the seed stays secret; quick sum published ready then opened`; `nc referee: a right answer scores by speed, wrong 0, results together`; `nc referee: one answer per item; early, late, other rounds and other matches do nothing`; `nc referee: chain steps are published one at a time, never ahead`; `nc referee: target steps are replayed; a tile the player never had scores 0`; `nc referee: sprint answers count only in order and before the player's own end; penalties shorten it; the referee's score wins`; `nc referee: the match ends ranked and reports`; `nc referee: a restarted referee carries on from saved state`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement, structure as `js/saywhat/referee.js`. **Step 4:** PASS. **Step 5:** Commit `feat(numberChallenge): server referee`.

### Task 13: Client, dev rooms and the online screen

**Files:**
- Modify: `js/numberchallenge/client.js` (fill in), `js/games/numberChallenge.js` (`online(api, room)`, `ROOM`)
- Create: `js/numberchallenge/dev.js`
- Test: `tools/test/numberChallenge.referee.test.js`

**Interfaces:**
- Produces: `FF.NumberChallengeClient = { create({ room, onChange }) -> { view(), send(text), sendSprint(i, text), serverNow(), stop() }, tidy(nc), ready(nc) }`; `sendSprint` queues and flushes at most every 500 ms; `FF.NumberChallengeApi = { start(room, pick), nudge(code) }` (POST `/api/numberchallenge/start|nudge`, dev → `FF.NumberChallengeDev.start`). `ROOM = { minPlayers: 2, defaults: R.STANDARD, fields() /* mode, level, time (not none), rounds per mode, sprint, speed */, sanitize: R.sanitizeRoom, summary, start }`.
- `ready(nc)`: `starting` true; `ended` needs `result`; else `round.k === k` plus the mode's fields (chain: `shown` and `step`; sprint: whole `list`); `reveal` needs `last.k === k`.

- [ ] **Step 1: Tests** — `nc client: one answer per item, only while open`; `nc client: a phase is drawn only once its round has arrived in full` (each mode, fields delivered one by one); `nc client: sprint answers flush in order, batched`; `nc client: a rejoining view redraws the current chain step and sprint position`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; online screen draws each phase from the view only; local marking in Sprint uses `FF.NumberChallengeSprint` and shows the referee's numbers in the live strip.
- [ ] **Step 4:** PASS; two-tab dev room in each mode (see `playmona-two-tab-room-testing`). **Step 5:** Commit `feat(numberChallenge): online race client and dev rooms`.

### Task 14: Server wiring (PHP, rules, runner)

**Files:**
- Create: `api/lib/NumberChallenge.php`, `tools/api/numberChallenge.test.php`
- Modify: `api/lib/bootstrap.php` (class list), `api/lib/Routes.php` (`numberchallenge()`), `api/lib/EngineRoutes.php` (`/numberchallenge/start`, `/numberchallenge/nudge`, heartbeat `dropNumberchallenge`, report event `numberchallenge`), `api/lib/Db.php` (`numberchallenge_matches` with `mode`, `level`, `rounds`; `numberchallenge_seats` as `saywhat_seats`; indexes), `api/cron.php` (sweep), `api/crew/runner.js` (`numberchallengeRuns` / `numberchallengeState`, heartbeat list, drop, idle check, close), `api/crew/lib/loader.js` (rules, referee), `tools/api/test.php` (require), `database.rules.json` (`ncInbox` added by hand after `swInbox`: write rule as `swInbox` with `sw` → `nc`; validate `matchId`, `k`, `text` string ≤ 80, `t`)

**Interfaces:**
- Produces: `NumberChallenge::GAME = 'numberChallenge'`, `MODES`, `LEVELS`, `TIMES = ['quick','normal','relaxed']`, `ROUNDS`, `SPRINTS`, `SPEEDS`, `settings(array) -> array` (strict, refusing unknown values), `start`, `nudge`, `recordResult`, `stillActive`, `sweep`, `end` — the `SayWhat.php` contract. Meta flag `ncMatch` on the room for the crew controller.

- [ ] **Step 1: Tests** in `numberChallenge.test.php`: host-only start, 2–8 players, ready check; bad settings refused and `settings([])` equals the standard; the PHP lists equal `FF.NumberChallengeRules` (read rules.js through node as `sayWhat.test.php` does); results recorded once; heartbeat drops finished matches; sweep ends abandoned ones.
- [ ] **Step 2:** `php tools/api/test.php` — FAIL. **Step 3:** Implement. **Step 4:** PHP and node suites PASS. **Step 5:** Commit `feat(numberChallenge): server start, results and runner`.

### Task 15: Crew brain

**Files:**
- Create: `js/crew/brains/numberChallenge.js`, `tools/test/numberChallenge.brain.test.js`
- Modify: `js/crew/brains/quiz.js` (remove `'numberChallenge'` from `GAMES`), `js/crew/controller.js` (`onNumberChallenge` like `onSayWhat`, keyed on `meta.ncMatch`), `api/crew/lib/loader.js` (brain), `js/crew/levels.js` (keep `answerMs.numberChallenge`)

**Interfaces:**
- Produces: `FF.CrewNumberChallenge = { strategy: { accuracy(ctx, level), answer(round, mode, ctx, random) -> text, delayMs(round, mode, ctx, random) }, create({ transport, uids, crew, later, log }) -> { start(), stop() } }`. Answers from `R.solveText` (quick, sprint), a running total of the published steps (chain), `R.solveTarget` (target; weaker seats submit a near tile). A miss picks a likely wrong choice or a pad value ±1/±10.

- [ ] **Step 1: Tests** — `nc crew: accuracy 1 is always right in every mode`; `nc crew: accuracy 0 is never right`; `nc crew: delays fit the clock; sprint pace follows reaction`; `nc crew: seats answer an open round through ncInbox once each`; `numberChallenge: the inbox rule, online and crew lists, runner and controller know the game` (as `sayWhat.brain.test.js:134`), and quiz.js no longer lists it.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (`node tools/test/run.js`). **Step 5:** Commit `feat(numberChallenge): crew brain`.

### Task 16: Docs, Expert list, final checks

**Files:** Modify `docs/expert-levels.md` (move Number Challenge to Done: "Expert answers on a number pad; exact numbers; +6 s, +50. Make the target: +50 for using every tile."), add `docs/art/numberChallenge-prompts.md` (already written), `tools/art/numberChallenge.json` (as `sayWhat.json`, source `assets/playmona_assets/number-challenge`, to `assets/images/covers/numberChallenge.webp`).

- [ ] **Step 1:** Run `node tools/test/run.js` and `php tools/api/test.php` — all PASS.
- [ ] **Step 2:** Full preview pass from the spec's Verification list (each mode × level, both looks, pad, timeout, long streak, Sprint penalties, Fast chain, exact and close targets, Expert all-tiles bonus, Turns × 3, daily run, challenge link, 375 px and 1280 px, light and dark). Screenshot proof.
- [ ] **Step 3:** Commit `docs(numberChallenge): Expert done, cover prompt and art config`.
- [ ] **Step 4 (when Brighton's cover lands):** `python tools/process-game-art.py numberChallenge`, `node tools/gen-asset-manifest.js`, add `numberChallenge cover: processed and in the asset manifest` test, commit. Merge to main waits for this.
