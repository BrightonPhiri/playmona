# Cross-Device Multiplayer Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** `docs/superpowers/plans/2026-08-30-auto-advance.md` must be complete. This plan reuses its `FF.Advance` module and its Node test harness (`tools/test/harness.js`).

**Goal:** A host shares a 6-character code, link or QR; everyone who joins plays the same questions at the same time on their own device, and the first correct answer takes the point and advances the round for everyone.

**Architecture:** The room stores a random **seed**; every device reseeds `FF.util`'s RNG per round with `hash(seed, gameId, roundIndex)` and independently generates identical questions, so the network never carries a question — only players and answers. A correct answer contests a `winner` slot via an atomic transaction; round settlement and scores are pure functions of that data, so every device reaches the same conclusion with no coordinator and no host dependency.

**Tech Stack:** Vanilla ES5-compatible JavaScript, classic `<script>` tags, no build step. Firebase Realtime Database + Anonymous Auth (compat SDK, lazily loaded from `gstatic.com` only when someone opens online play). Node 24 for tests.

## Global Constraints

- **Deployment target:** `https://demo.brightappsoft.com/familygame/`. **Every path must stay relative** — the app lives in a subdirectory, so a leading `/` breaks it.
- **Offline play must be completely unaffected.** If `js/net/firebase-config.js` holds no real config, the PLAY TOGETHER button never renders and no network code loads. The app must still open from `file://` with no internet.
- **ES5-compatible classic scripts.** No modules, no build step. `js/games/*.js` use `var`; engine files may use `const`/`let` as `js/core.js` and `js/registry.js` already do.
- **Everything attaches to `window.FF`.** No globals other than `FF`.
- The **only** third-party runtime dependency is the Firebase compat SDK (lazy, CDN) and one vendored MIT QR library. Node tests use built-ins only.
- **Room codes:** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `O`, `0`, `I`, `1`).
- **Room capacity:** 12 devices. **Room lifetime:** 6 hours (`expiresAt`).
- **Scores are always derived** by replaying `rounds/*/winner`. Never store a score.
- **App version:** bump the `js/app.js` footer from `v1.0.0` to `v1.1.0`; the same string goes in `meta.appVersion` and gates stale clients.
- **Wrong answer = locked out for that round**, no points penalty; others keep racing.
- Result pause is `FF.Advance.defaultMs()` (2000 ms), shared with offline play.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `js/net/firebase-config.js` | Config placeholder the user fills in. Git-ignored. |
| `js/vendor/qrcode.js` | Vendored MIT QR encoder. |
| `js/net/qr.js` | `FF.QR.svg(text)` — wraps the vendored encoder, returns an SVG element. |
| `js/net/raceRules.js` | `FF.RaceRules` — **pure** settle and scoring logic. No DOM, no network. |
| `js/net/transport.js` | Transport interface + the BroadcastChannel dev adapter. |
| `js/net/firebaseTransport.js` | Firebase adapter implementing the same interface. |
| `js/net/room.js` | `FF.Room` — room lifecycle and state machine. |
| `js/net/race.js` | `FF.Race` — the only thing games talk to. |
| `js/net/roomUI.js` | Create / join / lobby / shared-results screens. |
| `js/net/raceUI.js` | The two screens every racing engine shares: lockout note and settled-round result. |
| `tools/test/rng.test.js` | Seeded RNG determinism, including cross-sandbox. |
| `tools/test/raceRules.test.js` | Settle and scoring rules. |
| `tools/test/transport.test.js` | Dev transport conformance. |
| `tools/test-seed.html` | Browser page: runs real question builders twice per seed and diffs. |
| `FIREBASE_SETUP.md` | Step-by-step Firebase project setup and security rules. |

**Modify**

| File | Change |
|---|---|
| `js/core.js` | `FF._rand()` indirection; `FF.Random.seed/unseed/seeded/roundSeed`. |
| `js/app.js` | PLAY TOGETHER hero button; version bump to `v1.1.0`. |
| `index.html` | New script tags. |
| `js/registry.js` | Launch a game inside a room. |
| `js/games/worldGames.js` | Race integration in `runTrivia`. |
| `js/games/visualGames.js` | Race integration in `runVisualGame`. |
| `js/games/quizGames.js` | Race integration (4 loops). |
| `js/games/reactionGames.js` | Seeded delay; race integration. |
| `CREDITS.md` | Credit the vendored QR library. |
| `.gitignore` | Ignore `js/net/firebase-config.js`. |

---

### Task 1: Seeded randomness in core.js

The foundation. Every device must generate identical questions from the same seed. Nothing else in this plan works without it.

**Files:**
- Modify: `js/core.js:100-160` (`FF.util` random helpers) and `js/core.js:162-200` (`FF.Random`)
- Create: `tools/test/rng.test.js`

**Interfaces:**
- Consumes: `loadFF`, `test`, `assert`, `assertEqual` from the auto-advance plan's Task 1.
- Produces:
  - `FF._rand() => number` — `0 <= n < 1`. `Math.random` normally; the seeded PRNG when seeded.
  - `FF.Random.seed(seedString: string) => void` — switch to deterministic mode.
  - `FF.Random.unseed() => void` — return to `Math.random`.
  - `FF.Random.seeded() => boolean`
  - `FF.Random.roundSeed(roomSeed: string, gameId: string, roundIndex: number) => string`
  - `FF.Random.newSeed() => string` — an 8-character room seed (always uses `Math.random`, never the seeded stream).

- [ ] **Step 1: Write the failing tests**

Create `tools/test/rng.test.js`:

```js
'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function seq(FF, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(FF._rand());
  return out;
}

test('the same seed produces the same sequence', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('abc123');
  const a = seq(FF, 20);
  FF.Random.seed('abc123');
  const b = seq(FF, 20);
  assertEqual(a, b, 'identical seeds must produce identical sequences');
});

test('different seeds produce different sequences', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('abc123');
  const a = seq(FF, 20);
  FF.Random.seed('abc124');
  const b = seq(FF, 20);
  assert(JSON.stringify(a) !== JSON.stringify(b), 'different seeds must diverge');
});

test('two independent sandboxes agree - this is the real device test', function () {
  const deviceA = loadFF(['js/core.js']);
  const deviceB = loadFF(['js/core.js']);
  deviceA.Random.seed('room-seed-xyz');
  deviceB.Random.seed('room-seed-xyz');
  assertEqual(seq(deviceA, 50), seq(deviceB, 50),
    'two separate devices with the same seed must generate the same numbers');
});

test('all values stay in [0, 1)', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('range-check');
  seq(FF, 500).forEach(function (n) {
    assert(n >= 0 && n < 1, 'value out of range: ' + n);
  });
});

test('unseed restores Math.random', function () {
  const FF = loadFF(['js/core.js']);
  assertEqual(FF.Random.seeded(), false, 'starts unseeded');
  FF.Random.seed('x');
  assertEqual(FF.Random.seeded(), true);
  FF.Random.unseed();
  assertEqual(FF.Random.seeded(), false);

  FF.Random.seed('x');
  const seeded = seq(FF, 10);
  FF.Random.unseed();
  const free = seq(FF, 10);
  assert(JSON.stringify(seeded) !== JSON.stringify(free),
    'after unseed the sequence must not repeat the seeded one');
});

test('shuffle is deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  a.Random.seed('shuffle-seed');
  b.Random.seed('shuffle-seed');
  assertEqual(a.util.shuffle(items), b.util.shuffle(items));
});

test('pick and sample are deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  a.Random.seed('pick-seed');
  b.Random.seed('pick-seed');
  assertEqual(a.util.pick(items), b.util.pick(items));
  assertEqual(a.util.sample(items, 4), b.util.sample(items, 4));
  assertEqual(a.util.int(1, 100), b.util.int(1, 100));
});

test('Bag is deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = ['w', 'x', 'y', 'z'];
  a.Random.seed('bag-seed');
  b.Random.seed('bag-seed');
  const bagA = a.Random.Bag(items);
  const bagB = b.Random.Bag(items);
  assertEqual(bagA.nextN(12), bagB.nextN(12), 'bags must deal the same order, including refills');
});

test('roundSeed depends on every input', function () {
  const FF = loadFF(['js/core.js']);
  const base = FF.Random.roundSeed('seed', 'guessFlag', 0);
  assert(base !== FF.Random.roundSeed('seed2', 'guessFlag', 0), 'room seed must matter');
  assert(base !== FF.Random.roundSeed('seed', 'mapChallenge', 0), 'game id must matter');
  assert(base !== FF.Random.roundSeed('seed', 'guessFlag', 1), 'round index must matter');
  assertEqual(base, FF.Random.roundSeed('seed', 'guessFlag', 0), 'and it must be stable');
});

test('round seeding makes round N independent of earlier rounds', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);

  // Device A plays rounds 0,1,2 then reseeds for round 3.
  [0, 1, 2].forEach(function (i) {
    a.Random.seed(a.Random.roundSeed('s', 'g', i));
    seq(a, 30);
  });
  a.Random.seed(a.Random.roundSeed('s', 'g', 3));
  const roundThreeOnA = seq(a, 10);

  // Device B joins late and goes straight to round 3.
  b.Random.seed(b.Random.roundSeed('s', 'g', 3));
  const roundThreeOnB = seq(b, 10);

  assertEqual(roundThreeOnA, roundThreeOnB,
    'a device that joins mid-game must still see the same round 3');
});

test('newSeed produces distinct 8-character seeds', function () {
  const FF = loadFF(['js/core.js']);
  const seen = {};
  for (let i = 0; i < 200; i++) {
    const s = FF.Random.newSeed();
    assertEqual(s.length, 8, 'seed length');
    seen[s] = true;
  }
  assert(Object.keys(seen).length > 190, 'seeds must be near-unique');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node tools/test/run.js
```

Expected: the `rng.test.js` tests FAIL with `FF.Random.seed is not a function`.

- [ ] **Step 3: Add the RNG indirection to `js/core.js`**

Insert this block immediately **before** the `/* ---------- Utilities ---------- */` comment in `js/core.js`:

```js
  /* ---------- Seedable random source ----------
     Every random call in the app routes through FF._rand(). Normally that
     is Math.random. Inside a multiplayer round it is a seeded PRNG, so all
     devices generate identical questions from the room's seed. */
  var _seeded = null;

  // xmur3: string -> 32-bit seed
  function _hashSeed(str) {
    var h = 1779033703 ^ String(str).length;
    for (var i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32: 32-bit seed -> uniform [0,1)
  function _mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  FF._rand = function () {
    return _seeded ? _seeded() : Math.random();
  };
```

- [ ] **Step 4: Route every random helper through `FF._rand`**

In `js/core.js`, replace **every** occurrence of `Math.random()` inside `FF.util` and `FF.Random` with `FF._rand()`. The affected helpers are `shuffle`, `pick`, `sample`, `int`, `uid` and `shuffleInPlace`.

Verify none were missed:

```bash
grep -n "Math.random" js/core.js
```

Expected: matches **only** inside `_mulberry32`/`_hashSeed`/`FF._rand` and inside `FF.Random.newSeed` (added next). Nothing in `FF.util`.

- [ ] **Step 5: Add the seed control API**

Inside the `FF.Random = { ... }` object literal in `js/core.js`, add these members alongside `int`, `pick`, `shuffle`, `sample`:

```js
    seed: function (seedString) { _seeded = _mulberry32(_hashSeed(seedString)()); },

    unseed: function () { _seeded = null; },

    seeded: function () { return !!_seeded; },

    // Per-round seed: round N depends only on N, never on earlier rounds.
    roundSeed: function (roomSeed, gameId, roundIndex) {
      return String(roomSeed) + '|' + String(gameId) + '|' + String(roundIndex);
    },

    // Room seeds must never come from the seeded stream.
    newSeed: function () {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var out = '';
      for (var i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
      return out;
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
node tools/test/run.js
```

Expected: `21 passed, 0 failed, 21 total` (10 from the auto-advance plan + 11 here), exit code `0`.

- [ ] **Step 7: Verify offline play is unchanged**

Open `index.html` and play two rounds of **Guess the Flag**. Questions must still vary between runs — if they repeat, the app is stuck in seeded mode. Confirm in the console:

```js
FF.Random.seeded()
```

Expected: `false`.

- [ ] **Step 8: Commit**

```bash
git add js/core.js tools/test/rng.test.js && git commit -m "feat: add seedable RNG so devices can generate identical questions"
```

---

### Task 2: Browser determinism harness

The Node tests prove the RNG is reproducible. This proves the *real question builders* are — the property that actually prevents desync.

**Files:**
- Create: `tools/test-seed.html`

**Interfaces:**
- Consumes: `FF.Random.seed/roundSeed` from Task 1; the registered games in `FF.Games`.
- Produces: no runtime interface. A pass/fail page.

- [ ] **Step 1: Write the page**

Create `tools/test-seed.html`. Note the `../` paths — it lives in `tools/`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light" data-accent="purple">
<head>
  <meta charset="UTF-8">
  <title>Family Fun — Seed Determinism Test</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; }
    .pass { color: #15803d; } .fail { color: #b91c1c; font-weight: 700; }
    li { margin: 4px 0; font-family: ui-monospace, monospace; font-size: 13px; }
    #summary { font-size: 20px; font-weight: 700; margin: 16px 0; }
    pre { background: #f1f5f9; padding: 8px; overflow-x: auto; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Seed Determinism Test</h1>
  <p>Renders every race game's questions twice under the same seed and compares them.
     A failure here means devices in a room would see different questions.</p>
  <div id="summary">Running…</div>
  <ul id="results"></ul>

  <div id="stage" style="position:absolute;left:-9999px;top:0;width:900px;"></div>

  <script src="../js/core.js"></script>
  <script src="../js/storage.js"></script>
  <script src="../js/theme.js"></script>
  <script src="../js/audio.js"></script>
  <script src="../js/timer.js"></script>
  <script src="../js/advance.js"></script>
  <script src="../js/confetti.js"></script>
  <script src="../js/scoring.js"></script>
  <script src="../js/players.js"></script>
  <script src="../js/assets.js"></script>
  <script src="../js/flagrenderer.js"></script>
  <script src="../js/icons.js"></script>
  <script src="../js/icons-custom.js"></script>
  <script src="../js/registry.js"></script>
  <script src="../js/navigation.js"></script>
  <script src="../js/data/quiz.js"></script>
  <script src="../js/data/words.js"></script>
  <script src="../js/data/countries.js"></script>
  <script src="../js/data/flagcodes.js"></script>
  <script src="../js/data/party.js"></script>
  <script src="../js/data/visual.js"></script>
  <script src="../js/data/visual2.js"></script>
  <script src="../js/games/wordGames.js"></script>
  <script src="../js/games/quizGames.js"></script>
  <script src="../js/games/memoryGames.js"></script>
  <script src="../js/games/reactionGames.js"></script>
  <script src="../js/games/numberGames.js"></script>
  <script src="../js/games/creativeGames.js"></script>
  <script src="../js/games/partyGames.js"></script>
  <script src="../js/games/visualGames.js"></script>
  <script src="../js/games/puzzleGames.js"></script>
  <script src="../js/games/worldGames.js"></script>

  <script>
  (function () {
    'use strict';

    // The 18 games that support racing.
    var RACE_GAMES = [
      'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
      'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood',
      'guessObject', 'guessSport', 'guessVehicle',
      'familyQuiz', 'trueOrFalse', 'brainBattle', 'guessWho', 'pictureQuiz',
      'quickTap', 'colorReaction'
    ];
    var ROUNDS = 8;
    var results = document.getElementById('results');
    var passes = 0, failures = 0;

    FF.Storage.init();

    // Render a game's rounds into a detached stage and capture the visible text.
    function capture(gameId, seed) {
      var def = FF.Games.get(gameId);
      if (!def) return null;

      var frames = [];
      for (var r = 0; r < ROUNDS; r++) {
        FF.Random.seed(FF.Random.roundSeed(seed, gameId, r));

        var stage = document.getElementById('stage');
        stage.innerHTML = '';
        var root = document.createElement('div');
        stage.appendChild(root);

        var api = {
          def: def,
          config: FF.GameFlow.buildConfig(def, { skipIntro: true }),
          scoring: FF.Scoring, audio: { play: function () {} },
          ui: FF.ui, util: FF.util, random: FF.Random,
          timer: FF.Timer, assets: FF.Assets, flags: FF.Flags,
          shell: {
            root: root,
            updateScores: function () {}, setTimer: function () {},
            hideTimer: function () {}, toast: function () {}
          },
          end: function () {}, fail: function () {}
        };
        FF.Scoring.init(api.config.scorers, api.config.mode);

        try {
          def.start(api);
        } catch (e) {
          return { error: e.message };
        }
        // Normalise: text only, whitespace collapsed. Ignores DOM identity.
        frames.push((root.textContent || '').replace(/\s+/g, ' ').trim());
      }
      FF.Random.unseed();
      return frames;
    }

    function report(name, ok, detail) {
      var li = document.createElement('li');
      li.className = ok ? 'pass' : 'fail';
      li.textContent = (ok ? 'PASS  ' : 'FAIL  ') + name;
      if (!ok && detail) {
        var pre = document.createElement('pre');
        pre.textContent = detail;
        li.appendChild(pre);
      }
      results.appendChild(li);
      if (ok) passes++; else failures++;
    }

    RACE_GAMES.forEach(function (id) {
      var seed = 'test-seed-' + id;
      var first = capture(id, seed);
      var second = capture(id, seed);

      if (!first) { report(id + ' (not registered)', false, 'FF.Games.get returned null'); return; }
      if (first.error) { report(id, false, 'threw: ' + first.error); return; }

      var mismatch = -1;
      for (var i = 0; i < first.length; i++) {
        if (first[i] !== second[i]) { mismatch = i; break; }
      }

      if (mismatch === -1) {
        report(id + ' — ' + ROUNDS + ' rounds identical', true);
      } else {
        report(id + ' — round ' + mismatch + ' differs', false,
          'run 1: ' + first[mismatch].slice(0, 300) + '\n\nrun 2: ' + second[mismatch].slice(0, 300));
      }
    });

    var summary = document.getElementById('summary');
    summary.textContent = passes + ' passed, ' + failures + ' failed';
    summary.className = failures ? 'fail' : 'pass';
  })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Open the page and read the result**

Open `tools/test-seed.html` in a browser.

Expected: **`18 passed, 0 failed`**.

- [ ] **Step 3: Fix any non-determinism you find**

A failure means that game reads randomness outside `FF._rand()`, or its output depends on wall-clock time or DOM state. Find the cause:

```bash
grep -n "Math.random\|Date.now()" js/games/<file>.js
```

Two known cases to expect in `js/games/reactionGames.js`:

```js
      var delay = 2000 + Math.floor(Math.random() * 3001); // 2–5 seconds
```

Replace both with `FF._rand()`:

```js
      var delay = 2000 + Math.floor(FF._rand() * 3001); // 2–5 seconds
```

This is required, not optional: it is what makes the "TAP!" signal fire at the same instant on every device.

If a game legitimately cannot be made deterministic, remove it from `RACE_GAMES` here **and** from the online game list in Task 11, and note why in `FIREBASE_SETUP.md`. Do not ship a game that fails this page.

- [ ] **Step 4: Re-run the Node tests**

```bash
node tools/test/run.js
```

Expected: `21 passed, 0 failed, 21 total`.

- [ ] **Step 5: Commit**

```bash
git add tools/test-seed.html js/games/reactionGames.js && git commit -m "test: verify all 18 race games generate identical questions from a seed"
```

---

### Task 3: Race rules — the pure logic

Settlement and scoring, with no DOM and no network, so the rules that decide who wins a point are directly testable.

**Files:**
- Create: `js/net/raceRules.js`
- Create: `tools/test/raceRules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FF.RaceRules.settle(round, players, timerMs, now) => { settled, winnerId, reason }`
    - `round`: `{ startedAt: number, answers: { [uid]: { choice, correct, ms } }, winner: string|null }`
    - `players`: `[{ uid: string, online: boolean }]`
    - `reason`: `'winner' | 'exhausted' | 'timeout' | null`
  - `FF.RaceRules.lockedOut(round, uid) => boolean`
  - `FF.RaceRules.scores(rounds, players, pointsFor) => { [uid]: number }`
    - `rounds`: `{ [index]: round }`; `pointsFor(answer) => number`

- [ ] **Step 1: Write the failing tests**

Create `tools/test/raceRules.test.js`:

```js
'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function players(n, offline) {
  offline = offline || [];
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ uid: 'u' + i, online: offline.indexOf('u' + i) === -1 });
  }
  return out;
}

function round(answers, winner, startedAt) {
  return { startedAt: startedAt == null ? 1000 : startedAt, answers: answers || {}, winner: winner || null };
}

test('an untouched round is not settled', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(round(), players(3), 20000, 1000);
  assertEqual(r.settled, false);
  assertEqual(r.winnerId, null);
  assertEqual(r.reason, null);
});

test('a winner settles the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u2: { choice: 1, correct: true, ms: 1500 } }, 'u2'),
    players(3), 20000, 2500);
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, 'u2');
  assertEqual(r.reason, 'winner');
});

test('wrong answers alone do not settle while someone can still answer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 0, correct: false, ms: 900 } }),
    players(3), 20000, 2000);
  assertEqual(r.settled, false, 'u2 and u3 have not answered yet');
});

test('everyone answering wrong exhausts the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 2, correct: false, ms: 1200 },
      u3: { choice: 3, correct: false, ms: 1800 }
    }),
    players(3), 20000, 2000);
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, null);
  assertEqual(r.reason, 'exhausted');
});

test('offline players do not block exhaustion', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 2, correct: false, ms: 1200 }
    }),
    players(3, ['u3']), 20000, 2000);
  assertEqual(r.settled, true, 'u3 is offline, so u1 and u2 are everyone');
  assertEqual(r.reason, 'exhausted');
});

test('the timer expires the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const notYet = FF.RaceRules.settle(round({}, null, 1000), players(3), 20000, 20999);
  assertEqual(notYet.settled, false, '19999ms elapsed is not enough');

  const expired = FF.RaceRules.settle(round({}, null, 1000), players(3), 20000, 21000);
  assertEqual(expired.settled, true);
  assertEqual(expired.reason, 'timeout');
  assertEqual(expired.winnerId, null);
});

test('a timer of 0 means no time limit', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(round({}, null, 1000), players(3), 0, 9999999);
  assertEqual(r.settled, false, 'timer off must never expire the round');
});

test('a winner beats an expired timer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 1, correct: true, ms: 500 } }, 'u1', 1000),
    players(3), 20000, 99999);
  assertEqual(r.reason, 'winner', 'a settled winner takes precedence over timeout');
  assertEqual(r.winnerId, 'u1');
});

test('lockedOut is true only after a wrong answer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = round({
    u1: { choice: 0, correct: false, ms: 900 },
    u2: { choice: 1, correct: true, ms: 1000 }
  });
  assertEqual(FF.RaceRules.lockedOut(r, 'u1'), true);
  assertEqual(FF.RaceRules.lockedOut(r, 'u2'), false, 'a correct answer is not a lockout');
  assertEqual(FF.RaceRules.lockedOut(r, 'u3'), false, 'not answering is not a lockout');
});

test('scores are derived from round winners', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = {
    0: round({ u1: { choice: 1, correct: true, ms: 1000 } }, 'u1'),
    1: round({ u2: { choice: 0, correct: true, ms: 4000 } }, 'u2'),
    2: round({ u1: { choice: 2, correct: true, ms: 900 } }, 'u1'),
    3: round({ u1: { choice: 0, correct: false, ms: 800 } }, null)
  };
  const scores = FF.RaceRules.scores(rounds, players(3), function (a) {
    return a.ms <= 2500 ? 150 : 100;      // base 100, +50 speed bonus
  });
  assertEqual(scores.u1, 300, 'two fast wins');
  assertEqual(scores.u2, 100, 'one slow win');
  assertEqual(scores.u3, 0, 'no wins');
});

test('scores recompute identically from the same data', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = { 0: round({ u1: { choice: 1, correct: true, ms: 1000 } }, 'u1') };
  const pts = function () { return 100; };
  assertEqual(
    FF.RaceRules.scores(rounds, players(2), pts),
    FF.RaceRules.scores(rounds, players(2), pts),
    'derivation must be a pure function'
  );
});

test('a winner with no recorded answer scores zero, not NaN', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = { 0: round({}, 'u1') };   // corrupt/partial data
  const scores = FF.RaceRules.scores(rounds, players(2), function (a) { return 100; });
  assertEqual(scores.u1, 0, 'missing answer data must not produce NaN');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node tools/test/run.js
```

Expected: `raceRules.test.js` tests FAIL with `Failed loading js/net/raceRules.js: ENOENT`.

- [ ] **Step 3: Write the rules**

Create `js/net/raceRules.js`:

```js
/* ============================================================
   FAMILY FUN — net/raceRules.js
   Pure race logic: when is a round over, who won it, and what
   is everyone's score. No DOM, no network, no clock of its own
   — every input is passed in, so this is fully testable and
   every device computes the same answer from the same data.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function answersOf(round) {
    return (round && round.answers) ? round.answers : {};
  }

  FF.RaceRules = {
    /* Decide whether a round is over.
       round   : { startedAt, answers: {uid:{choice,correct,ms}}, winner }
       players : [{uid, online}]
       timerMs : round time limit; 0 or null means no limit
       now     : server-aligned timestamp
       returns : { settled, winnerId, reason } */
    settle: function (round, players, timerMs, now) {
      round = round || {};
      players = players || [];

      if (round.winner) {
        return { settled: true, winnerId: round.winner, reason: 'winner' };
      }

      var answers = answersOf(round);
      var active = players.filter(function (p) { return p && p.online !== false; });

      if (active.length) {
        var allAnswered = active.every(function (p) {
          return Object.prototype.hasOwnProperty.call(answers, p.uid);
        });
        if (allAnswered) {
          return { settled: true, winnerId: null, reason: 'exhausted' };
        }
      }

      if (timerMs && timerMs > 0 && round.startedAt != null && (now - round.startedAt) >= timerMs) {
        return { settled: true, winnerId: null, reason: 'timeout' };
      }

      return { settled: false, winnerId: null, reason: null };
    },

    /* True once this player has answered wrongly this round. */
    lockedOut: function (round, uid) {
      var a = answersOf(round)[uid];
      return !!(a && a.correct === false);
    },

    /* Scores are always derived, never stored, so devices cannot drift.
       pointsFor(answer) returns the points for a winning answer. */
    scores: function (rounds, players, pointsFor) {
      var out = {};
      (players || []).forEach(function (p) { out[p.uid] = 0; });

      Object.keys(rounds || {}).forEach(function (key) {
        var round = rounds[key];
        if (!round || !round.winner) return;
        var winner = round.winner;
        if (!Object.prototype.hasOwnProperty.call(out, winner)) out[winner] = 0;
        var answer = answersOf(round)[winner];
        if (!answer) return;                       // partial data: score nothing
        var pts = pointsFor(answer);
        out[winner] += (typeof pts === 'number' && isFinite(pts)) ? pts : 0;
      });

      return out;
    }
  };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node tools/test/run.js
```

Expected: `33 passed, 0 failed, 33 total` (21 + 12), exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add js/net/raceRules.js tools/test/raceRules.test.js && git commit -m "feat: add pure race settlement and derived scoring rules"
```

---

### Task 4: Transport interface and the dev adapter

A transport abstraction with a BroadcastChannel implementation, so the entire multiplayer flow can be built and tested across two browser tabs **before** any Firebase account exists.

**Files:**
- Create: `js/net/transport.js`
- Create: `tools/test/transport.test.js`

**Interfaces:**
- Consumes: `FF.util.uid` (`js/core.js:143`).
- Produces: `FF.Transport.dev(opts) => transport`, where every transport implements:
  - `connect() => Promise<{ uid }>`
  - `serverNow() => number`
  - `get(path) => Promise<any>` — `path` is a `/`-separated string relative to the room root
  - `set(path, value) => Promise<void>`
  - `update(path, obj) => Promise<void>`
  - `transaction(path, fn) => Promise<{ committed: boolean, value: any }>` — `fn(current)` returns the new value, or `undefined` to abort
  - `watch(path, cb) => function` — `cb(value)` on change; returns an unsubscribe function
  - `onDisconnectSet(path, value) => Promise<void>`
  - `close() => void`

  `FF.Transport.roomPath(code, sub) => string` builds `rooms/<code>/<sub>`.

- [ ] **Step 1: Write the failing tests**

Create `tools/test/transport.test.js`:

```js
'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

/* An in-process shared bus standing in for BroadcastChannel + localStorage. */
function makeBus() {
  const store = {};
  const listeners = [];
  return {
    store: store,
    read: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
    write: function (k, v) {
      if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v));
      listeners.slice().forEach(function (fn) { fn(k); });
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    }
  };
}

function connect(FF, bus) {
  const t = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  return t.connect().then(function () { return t; });
}

test('set then get round-trips a value', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  await t.set('meta/gameId', 'guessFlag');
  assertEqual(await t.get('meta/gameId'), 'guessFlag');
});

test('get returns null for a missing path', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  assertEqual(await t.get('meta/nothing'), null);
});

test('update merges keys without clobbering siblings', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  await t.set('players/u1', { name: 'Ana', avatar: '🦊' });
  await t.update('players/u1', { online: false });
  assertEqual(await t.get('players/u1'), { name: 'Ana', avatar: '🦊', online: false });
});

test('two transports on one bus see each other - the two-device case', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  await a.set('meta/status', 'playing');
  assertEqual(await b.get('meta/status'), 'playing', 'device B must see device A writes');
});

test('each connection gets a distinct uid', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  const b = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  const ra = await a.connect();
  const rb = await b.connect();
  assert(ra.uid && rb.uid, 'connect must return a uid');
  assert(ra.uid !== rb.uid, 'uids must be distinct');
});

test('watch fires on change and stops after unsubscribe', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  const seen = [];
  const off = b.watch('meta/status', function (v) { seen.push(v); });

  await a.set('meta/status', 'lobby');
  await a.set('meta/status', 'playing');
  assertEqual(seen[seen.length - 1], 'playing');

  off();
  await a.set('meta/status', 'ended');
  assertEqual(seen[seen.length - 1], 'playing', 'no callbacks after unsubscribe');
});

test('transaction commits when the slot is empty', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  const r = await t.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'u1' : undefined;
  });
  assertEqual(r.committed, true);
  assertEqual(r.value, 'u1');
  assertEqual(await t.get('rounds/0/winner'), 'u1');
});

test('the second racer loses the transaction - the buzzer test', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  const first = await a.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'ana' : undefined;
  });
  const second = await b.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'ben' : undefined;
  });

  assertEqual(first.committed, true, 'first writer wins');
  assertEqual(second.committed, false, 'second writer must be rejected');
  assertEqual(await b.get('rounds/0/winner'), 'ana', 'the winner must not be overwritten');
});

test('onDisconnectSet applies when the transport closes', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  await a.set('players/u1/online', true);
  await a.onDisconnectSet('players/u1/online', false);
  assertEqual(await b.get('players/u1/online'), true, 'still online before closing');

  a.close();
  assertEqual(await b.get('players/u1/online'), false, 'closing must apply the disconnect write');
});

test('roomPath builds room-scoped paths', function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  assertEqual(FF.Transport.roomPath('ABC123', 'players/u1'), 'rooms/ABC123/players/u1');
  assertEqual(FF.Transport.roomPath('ABC123'), 'rooms/ABC123');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node tools/test/run.js
```

Expected: `transport.test.js` tests FAIL with `Failed loading js/net/transport.js: ENOENT`.

- [ ] **Step 3: Write the transport**

Create `js/net/transport.js`:

```js
/* ============================================================
   FAMILY FUN — net/transport.js
   The storage interface every network backend implements, plus
   the development adapter (BroadcastChannel + localStorage) so
   the whole multiplayer flow can be built and tested across two
   browser tabs with no Firebase account and no internet.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function splitPath(path) {
    return String(path || '').split('/').filter(function (s) { return s.length; });
  }

  /* A bus backed by localStorage + BroadcastChannel, shared by
     every tab of the same origin. Swappable for tests. */
  function browserBus(namespace) {
    var KEY = 'ff-dev-bus:' + (namespace || 'default');
    var channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(KEY) : null;
    var listeners = [];

    function readAll() {
      try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
    }
    function writeAll(obj) {
      try { window.localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
    }
    function fire(k) {
      listeners.slice().forEach(function (fn) { fn(k); });
    }

    if (channel) channel.onmessage = function (ev) { fire(ev && ev.data); };
    window.addEventListener('storage', function (ev) { if (ev.key === KEY) fire(null); });

    return {
      read: function (k) {
        var all = readAll();
        return all[k] === undefined ? null : all[k];
      },
      write: function (k, v) {
        var all = readAll();
        if (v === null) delete all[k]; else all[k] = v;
        writeAll(all);
        if (channel) channel.postMessage(k);
        fire(k);
      },
      subscribe: function (fn) {
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        };
      }
    };
  }

  /* Development transport. Same interface as the Firebase one. */
  function dev(opts) {
    opts = opts || {};
    var bus = opts.bus || browserBus(opts.namespace);
    var root = opts.root || 'rooms/DEV';
    var uid = null;
    var disconnects = [];
    var unsubs = [];
    var closed = false;

    function key(path) {
      var parts = splitPath(root).concat(splitPath(path));
      return parts.join('/');
    }

    /* Read a path, assembling children written under deeper keys. */
    function readPath(path) {
      var k = key(path);
      var direct = bus.read(k);
      if (direct !== null && typeof direct !== 'object') return direct;

      var prefix = k + '/';
      var children = null;
      var all = bus.read('__keys__') || [];
      all.forEach(function (candidate) {
        if (candidate.indexOf(prefix) !== 0) return;
        var rest = candidate.slice(prefix.length).split('/');
        children = children || {};
        var node = children;
        for (var i = 0; i < rest.length - 1; i++) {
          node[rest[i]] = node[rest[i]] || {};
          node = node[rest[i]];
        }
        node[rest[rest.length - 1]] = bus.read(candidate);
      });

      if (children && direct && typeof direct === 'object') {
        Object.keys(direct).forEach(function (kk) {
          if (children[kk] === undefined) children[kk] = direct[kk];
        });
        return children;
      }
      return children !== null ? children : direct;
    }

    function trackKey(k) {
      var all = bus.read('__keys__') || [];
      if (all.indexOf(k) === -1) {
        all.push(k);
        bus.write('__keys__', all);
      }
    }

    function writePath(path, value) {
      var k = key(path);
      trackKey(k);
      bus.write(k, value);
    }

    var api = {
      connect: function () {
        uid = 'dev-' + FF.util.uid();
        return Promise.resolve({ uid: uid });
      },

      uid: function () { return uid; },

      serverNow: function () { return Date.now(); },

      get: function (path) { return Promise.resolve(readPath(path)); },

      set: function (path, value) {
        writePath(path, value);
        return Promise.resolve();
      },

      update: function (path, obj) {
        var current = readPath(path);
        var merged = (current && typeof current === 'object') ? current : {};
        Object.keys(obj || {}).forEach(function (k) { merged[k] = obj[k]; });
        writePath(path, merged);
        return Promise.resolve();
      },

      /* Synchronous read-modify-write. Single-threaded JavaScript makes
         this genuinely atomic within a tab; across tabs the localStorage
         write is last-write-wins, which is why the Firebase transport's
         real transaction is what ships. Good enough for development. */
      transaction: function (path, fn) {
        var current = readPath(path);
        var next = fn(current);
        if (next === undefined) {
          return Promise.resolve({ committed: false, value: current });
        }
        writePath(path, next);
        return Promise.resolve({ committed: true, value: next });
      },

      watch: function (path, cb) {
        var k = key(path);
        var last = JSON.stringify(readPath(path));
        var off = bus.subscribe(function (changed) {
          if (changed && changed !== k && changed.indexOf(k + '/') !== 0) return;
          var value = readPath(path);
          var snapshot = JSON.stringify(value);
          if (snapshot === last) return;
          last = snapshot;
          cb(value);
        });
        unsubs.push(off);
        return function () {
          off();
          var i = unsubs.indexOf(off);
          if (i !== -1) unsubs.splice(i, 1);
        };
      },

      onDisconnectSet: function (path, value) {
        disconnects.push({ path: path, value: value });
        return Promise.resolve();
      },

      close: function () {
        if (closed) return;
        closed = true;
        disconnects.forEach(function (d) { writePath(d.path, d.value); });
        disconnects = [];
        unsubs.slice().forEach(function (off) { off(); });
        unsubs = [];
      }
    };

    return api;
  }

  FF.Transport = {
    dev: dev,
    browserBus: browserBus,
    roomPath: function (code, sub) {
      return 'rooms/' + code + (sub ? '/' + sub : '');
    }
  };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total` (33 + 10), exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add js/net/transport.js tools/test/transport.test.js && git commit -m "feat: add transport interface and BroadcastChannel dev adapter"
```

---

### Task 5: Firebase transport, config and setup guide

The production backend, behind the exact interface Task 4 defined and Task 4's tests pin down.

**Files:**
- Create: `js/net/firebase-config.js`
- Create: `js/net/firebaseTransport.js`
- Create: `FIREBASE_SETUP.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the transport interface from Task 4.
- Produces:
  - `FF.FirebaseConfig` — `{ apiKey, authDomain, databaseURL, projectId, ... }` or `null`.
  - `FF.Net.configured() => boolean` — false when the config is a placeholder. **Gates the whole online UI.**
  - `FF.Net.firebase(opts) => Promise<transport>` — lazily loads the SDK, signs in anonymously, resolves with a transport.

- [ ] **Step 1: Create the config placeholder**

Create `js/net/firebase-config.js`:

```js
/* ============================================================
   FAMILY FUN — net/firebase-config.js
   Paste your Firebase web config here to enable online play.
   See FIREBASE_SETUP.md for step-by-step instructions.

   Leave this file exactly as it is to keep the app fully
   offline — the PLAY TOGETHER button will simply not appear.

   This file is git-ignored: it is per-deployment, not source.
   ============================================================ */
window.FF = window.FF || {};

FF.FirebaseConfig = null;

/* Replace the line above with your own config, for example:

FF.FirebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abcdef"
};

*/
```

- [ ] **Step 2: Ignore it in git**

Append to `.gitignore` (create the file if missing):

```
js/net/firebase-config.js
```

Then commit a template so a fresh clone still works:

```bash
cp js/net/firebase-config.js js/net/firebase-config.example.js
```

Deployment note for `FIREBASE_SETUP.md`: `firebase-config.js` must be uploaded to the server by hand, since git will not carry it.

- [ ] **Step 3: Write the Firebase transport**

Create `js/net/firebaseTransport.js`:

```js
/* ============================================================
   FAMILY FUN — net/firebaseTransport.js
   Firebase Realtime Database transport. Implements exactly the
   interface in net/transport.js. The SDK is loaded lazily from
   the CDN the first time online play is opened, so the offline
   app never touches the network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SDK_VERSION = '10.12.2';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
  var SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'];

  var sdkPromise = null;
  var app = null;
  var serverOffset = 0;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = SDK_FILES.reduce(function (chain, file) {
      return chain.then(function () { return loadScript(SDK_BASE + file); });
    }, Promise.resolve()).then(function () {
      if (!window.firebase) throw new Error('Firebase SDK did not initialise.');
      return window.firebase;
    });
    return sdkPromise;
  }

  function configured() {
    var c = FF.FirebaseConfig;
    return !!(c && c.apiKey && c.databaseURL &&
      String(c.apiKey).indexOf('AIza') === 0);
  }

  function firebaseTransport(opts) {
    opts = opts || {};
    var root = opts.root || 'rooms/UNKNOWN';

    return loadSdk().then(function (firebase) {
      if (!app) app = firebase.initializeApp(FF.FirebaseConfig);
      return firebase.auth().signInAnonymously().then(function (cred) {
        var db = firebase.database();
        var uid = cred.user.uid;

        // Align to server time so timers agree across devices.
        db.ref('.info/serverTimeOffset').on('value', function (snap) {
          serverOffset = snap.val() || 0;
        });

        function ref(path) {
          return db.ref(root + (path ? '/' + path : ''));
        }

        return {
          connect: function () { return Promise.resolve({ uid: uid }); },
          uid: function () { return uid; },
          serverNow: function () { return Date.now() + serverOffset; },

          get: function (path) {
            return ref(path).once('value').then(function (s) { return s.val(); });
          },

          set: function (path, value) { return ref(path).set(value); },

          update: function (path, obj) { return ref(path).update(obj); },

          transaction: function (path, fn) {
            return ref(path).transaction(function (current) {
              var next = fn(current);
              return next === undefined ? undefined : next;
            }).then(function (res) {
              return { committed: res.committed, value: res.snapshot ? res.snapshot.val() : null };
            });
          },

          watch: function (path, cb) {
            var r = ref(path);
            var handler = r.on('value', function (snap) { cb(snap.val()); });
            return function () { r.off('value', handler); };
          },

          onDisconnectSet: function (path, value) {
            return ref(path).onDisconnect().set(value);
          },

          serverTimestamp: function () {
            return window.firebase.database.ServerValue.TIMESTAMP;
          },

          close: function () { /* Firebase tears down with the page */ }
        };
      });
    });
  }

  FF.Net = FF.Net || {};
  FF.Net.configured = configured;
  FF.Net.firebase = firebaseTransport;
  FF.Net.SDK_VERSION = SDK_VERSION;
})();
```

- [ ] **Step 4: Verify the gate works with no config**

Open `index.html` and run in the console:

```js
FF.Net.configured()
```

Expected: `false`. **No network request must be made** — check the Network tab: nothing to `gstatic.com`. This is what keeps the offline app offline.

- [ ] **Step 5: Write the setup guide**

Create `FIREBASE_SETUP.md`:

````markdown
# Enabling Online Play (Firebase)

Family Fun works fully offline with no setup. Follow this only to enable
**PLAY TOGETHER**, which lets people on different devices play the same game.

The free **Spark** plan is enough for family use. No credit card is required.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, name it (e.g. `family-fun`), and continue.
3. Google Analytics is not needed — turn it off.

## 2. Enable the Realtime Database

1. In the left sidebar choose **Build → Realtime Database**.
2. Click **Create Database**.
3. Pick the region closest to you.
4. Choose **Start in locked mode**. The rules in step 5 replace this.

## 3. Enable anonymous sign-in

1. **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, enable **Anonymous** and save.

Nobody creates an account or types a password — this just gives each device a
stable identity so the rules can stop one player overwriting another's answer.

## 4. Authorise your domain

1. **Authentication → Settings → Authorised domains**.
2. Click **Add domain** and enter `demo.brightappsoft.com`.

Without this, sign-in fails on the live site.

## 5. Paste the security rules

Open **Realtime Database → Rules**, replace everything, and **Publish**:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && (!data.exists() || !data.child('meta/expiresAt').exists() || data.child('meta/expiresAt').val() > now)",

        "meta": {
          ".validate": "newData.hasChildren(['seed', 'status', 'appVersion'])",
          "hostUid": { ".validate": "!data.exists() || data.val() === auth.uid" }
        },

        "players": {
          "$uid": {
            ".write": "auth != null && $uid === auth.uid",
            ".validate": "newData.hasChildren(['name'])"
          }
        },

        "rounds": {
          "$index": {
            "answers": {
              "$uid": {
                ".write": "auth != null && $uid === auth.uid && !data.exists()",
                ".validate": "newData.hasChildren(['correct'])"
              }
            },
            "winner": {
              ".write": "auth != null && !data.exists()",
              ".validate": "newData.isString()"
            },
            "startedAt": {
              ".write": "auth != null && !data.exists()"
            }
          }
        }
      }
    }
  }
}
```

These rules enforce:

- Only signed-in devices can read or write, and only within a room whose code they know.
- A player may write **only their own** entry and their own answer, and cannot change an answer once submitted.
- `winner` and `startedAt` can only be claimed once — they can never be overwritten. This is what makes the buzzer fair.
- Writes to an expired room are rejected.

## 6. Copy the config into the app

1. **Project settings → General → Your apps → Web (`</>`)**.
2. Register the app (any nickname). Hosting is not needed.
3. Copy the `firebaseConfig` object.
4. Open `js/net/firebase-config.js` and replace `FF.FirebaseConfig = null;` with your object.

Reload the app. **PLAY TOGETHER** now appears on the home screen.

## 7. Deploying

`js/net/firebase-config.js` is git-ignored because it is per-deployment, not
source. **Upload it to the server by hand** alongside the rest of the app, or
your deployed copy will have online play silently disabled.

## Turning online play off

Set `FF.FirebaseConfig = null;` again. The button disappears and the app makes
no network requests at all.

## Costs

Each round sends a few hundred bytes — no questions or images cross the network,
only answers. The Spark free tier's limits are far beyond family use. Rooms
expire after 6 hours.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No PLAY TOGETHER button | Config still `null`, or `apiKey` malformed. Check `FF.Net.configured()` in the console. |
| "Could not connect" | `demo.brightappsoft.com` is not in Authorised domains (step 4). |
| "Permission denied" in console | Rules were not published, or Anonymous sign-in is off. |
| Players see different questions | A device is running a cached old version. Hard-refresh; the version guard should have caught this. |
````

- [ ] **Step 6: Commit**

```bash
git add js/net/firebaseTransport.js js/net/firebase-config.example.js FIREBASE_SETUP.md .gitignore && git commit -m "feat: add Firebase transport, config gate and setup guide"
```

---

### Task 6: Room lifecycle

Owns creating, joining, watching and leaving a room. Knows about transports; knows nothing about games or the DOM.

**Files:**
- Create: `js/net/room.js`

**Interfaces:**
- Consumes: `FF.Transport`, `FF.Net`, `FF.RaceRules`, `FF.Random.newSeed`, `FF.Storage`, `FF.Players`.
- Produces:
  - `FF.Room.CODE_ALPHABET`, `FF.Room.MAX_PLAYERS = 12`, `FF.Room.TTL_MS`
  - `FF.Room.newCode() => string`
  - `FF.Room.identity() => { uid, name, avatar, color }` — persisted in `FF.Storage`
  - `FF.Room.create(opts) => Promise<state>` — `opts` is `{ mode: 'players'|'teams', dev?: boolean }`
  - `FF.Room.join(code, profile, opts) => Promise<state>`
  - `FF.Room.leave() => void`
  - `FF.Room.current() => state|null` — `{ code, uid, isHost, meta, players, rounds, transport }`
  - `FF.Room.on(event, cb) => off` — events: `'players'`, `'meta'`, `'rounds'`, `'error'`
  - `FF.Room.setMeta(patch) => Promise<void>` — host only
  - `FF.Room.shareUrl(code) => string`

- [ ] **Step 1: Write the module**

Create `js/net/room.js`:

```js
/* ============================================================
   FAMILY FUN — net/room.js
   Room lifecycle: create, join, watch, leave. Talks to a
   transport; knows nothing about games or the DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no O, 0, I, 1
  var CODE_LENGTH = 6;
  var MAX_PLAYERS = 12;
  var TTL_MS = 6 * 60 * 60 * 1000;                     // 6 hours
  var APP_VERSION = '1.1.0';

  var state = null;
  var handlers = { players: [], meta: [], rounds: [], error: [] };
  var unsubs = [];

  function emit(event, payload) {
    (handlers[event] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Room]', e); }
    });
  }

  function newCode() {
    var out = '';
    for (var i = 0; i < CODE_LENGTH; i++) {
      out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return out;
  }

  /* A stable per-device identity, reused across rooms and rejoins. */
  function identity() {
    var saved = FF.Storage.get('roomIdentity', null);
    if (saved && saved.uid) return saved;
    var players = FF.Players.get();
    var first = players && players.length ? players[0] : null;
    var fresh = {
      uid: 'd-' + FF.util.uid() + FF.util.uid(),
      name: first ? first.name : 'Player',
      avatar: first ? first.avatar : FF.util.pick(FF.Players.AVATARS),
      color: first ? first.color : FF.Players.COLORS[0]
    };
    FF.Storage.set('roomIdentity', fresh);
    return fresh;
  }

  function saveIdentity(patch) {
    var id = identity();
    Object.keys(patch || {}).forEach(function (k) { id[k] = patch[k]; });
    FF.Storage.set('roomIdentity', id);
    return id;
  }

  function makeTransport(code, useDev) {
    var root = FF.Transport.roomPath(code);
    if (useDev) return Promise.resolve(FF.Transport.dev({ root: root, namespace: 'familyfun' }));
    if (!FF.Net || !FF.Net.configured()) {
      return Promise.reject(new Error('Online play is not configured on this copy of the app.'));
    }
    return FF.Net.firebase({ root: root });
  }

  function watchAll(transport) {
    unsubs.push(transport.watch('players', function (v) {
      state.players = v || {};
      emit('players', state.players);
    }));
    unsubs.push(transport.watch('meta', function (v) {
      state.meta = v || {};
      emit('meta', state.meta);
    }));
    unsubs.push(transport.watch('rounds', function (v) {
      state.rounds = v || {};
      emit('rounds', state.rounds);
    }));
  }

  function registerPresence(transport, uid, profile) {
    return transport.set('players/' + uid, {
      name: profile.name,
      avatar: profile.avatar,
      color: profile.color,
      teamId: profile.teamId || null,
      joinedAt: transport.serverNow(),
      online: true
    }).then(function () {
      return transport.onDisconnectSet('players/' + uid + '/online', false);
    });
  }

  FF.Room = {
    CODE_ALPHABET: ALPHABET,
    MAX_PLAYERS: MAX_PLAYERS,
    TTL_MS: TTL_MS,
    APP_VERSION: APP_VERSION,
    newCode: newCode,
    identity: identity,
    saveIdentity: saveIdentity,

    current: function () { return state; },

    on: function (event, cb) {
      (handlers[event] = handlers[event] || []).push(cb);
      return function () {
        var list = handlers[event] || [];
        var i = list.indexOf(cb);
        if (i !== -1) list.splice(i, 1);
      };
    },

    shareUrl: function (code) {
      var base = window.location.href.split('#')[0];
      return base + '#room=' + code;
    },

    /* Read a room code from the URL hash, e.g. #room=ABC123 */
    codeFromUrl: function () {
      var m = /(?:^|[#&])room=([A-Z0-9]{6})/i.exec(window.location.hash || '');
      return m ? m[1].toUpperCase() : null;
    },

    create: function (opts) {
      opts = opts || {};
      var profile = identity();
      var code = newCode();

      return makeTransport(code, opts.dev).then(function (transport) {
        return transport.connect().then(function (res) {
          var uid = res.uid;
          var now = transport.serverNow();
          var meta = {
            seed: FF.Random.newSeed(),
            gameId: null,
            status: 'lobby',
            mode: opts.mode === 'teams' ? 'teams' : 'players',
            appVersion: APP_VERSION,
            hostUid: uid,
            createdAt: now,
            expiresAt: now + TTL_MS,
            config: null
          };

          return transport.set('meta', meta)
            .then(function () { return registerPresence(transport, uid, profile); })
            .then(function () {
              state = {
                code: code, uid: uid, isHost: true,
                meta: meta, players: {}, rounds: {}, transport: transport
              };
              watchAll(transport);
              return state;
            });
        });
      });
    },

    join: function (code, profile, opts) {
      opts = opts || {};
      code = String(code || '').toUpperCase().trim();
      if (code.length !== CODE_LENGTH) {
        return Promise.reject(new Error('A room code is ' + CODE_LENGTH + ' characters.'));
      }

      var merged = saveIdentity(profile || {});

      return makeTransport(code, opts.dev).then(function (transport) {
        return transport.connect().then(function (res) {
          var uid = res.uid;
          return transport.get('meta').then(function (meta) {
            if (!meta) throw new Error('No room with the code ' + code + '. Check it and try again.');
            if (meta.expiresAt && transport.serverNow() > meta.expiresAt) {
              throw new Error('That room has expired. Ask the host to start a new one.');
            }
            if (meta.appVersion !== APP_VERSION) {
              throw new Error('VERSION_MISMATCH');
            }
            return transport.get('players').then(function (players) {
              var count = players ? Object.keys(players).length : 0;
              var alreadyIn = players && players[uid];
              if (count >= MAX_PLAYERS && !alreadyIn) {
                throw new Error('That room is full (' + MAX_PLAYERS + ' devices).');
              }
              return registerPresence(transport, uid, merged).then(function () {
                state = {
                  code: code, uid: uid, isHost: meta.hostUid === uid,
                  meta: meta, players: players || {}, rounds: {}, transport: transport
                };
                watchAll(transport);
                return state;
              });
            });
          });
        });
      });
    },

    setMeta: function (patch) {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      return state.transport.update('meta', patch || {});
    },

    /* Online, non-stale players in the shape FF.RaceRules expects. */
    racePlayers: function () {
      if (!state) return [];
      return Object.keys(state.players || {}).map(function (uid) {
        var p = state.players[uid] || {};
        return { uid: uid, online: p.online !== false, name: p.name, avatar: p.avatar, color: p.color, teamId: p.teamId || null };
      });
    },

    /* Scorer entities in the shape FF.Scoring.init expects. */
    scorers: function () {
      if (!state) return [];
      if (state.meta && state.meta.mode === 'teams') {
        var teams = {};
        this.racePlayers().forEach(function (p) {
          var id = p.teamId || 'team1';
          teams[id] = teams[id] || { id: id, name: id, avatar: '👥', color: '#8b5cf6', players: [] };
          teams[id].players.push(p.uid);
        });
        return Object.keys(teams).map(function (k) { return teams[k]; });
      }
      return this.racePlayers().map(function (p) {
        return { id: p.uid, name: p.name, avatar: p.avatar || '😀', color: p.color || '#8b5cf6' };
      });
    },

    leave: function () {
      if (!state) return;
      var s = state;
      unsubs.slice().forEach(function (off) { try { off(); } catch (e) {} });
      unsubs = [];
      try { s.transport.set('players/' + s.uid + '/online', false); } catch (e) {}
      try { s.transport.close(); } catch (e) {}
      state = null;
    }
  };
})();
```

- [ ] **Step 2: Verify against the dev transport in the browser**

Add `js/net/*.js` script tags per Task 11 first if not yet present, or load them manually. Then in the console:

```js
FF.Room.create({ mode: 'players', dev: true }).then(function (s) { console.log(s.code, s.meta); });
```

Expected: a 6-character code logged, containing no `O`, `0`, `I` or `1`, plus a meta object with `status: 'lobby'` and an 8-character `seed`.

Then in a **second tab** of the same origin:

```js
FF.Room.join('<THE CODE>', { name: 'Ben', avatar: '🦊' }, { dev: true }).then(function (s) { console.log('joined', s.players); });
```

Expected: both devices appear in `s.players`. In tab one, `FF.Room.racePlayers()` must now list two entries.

- [ ] **Step 3: Verify the error paths**

```js
FF.Room.join('ZZZZZZ', {}, { dev: true }).catch(function (e) { console.log(e.message); });
```

Expected: `No room with the code ZZZZZZ. Check it and try again.`

```js
FF.Room.join('SHORT', {}, { dev: true }).catch(function (e) { console.log(e.message); });
```

Expected: `A room code is 6 characters.`

- [ ] **Step 4: Run the Node tests**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total` — unchanged; this task adds no Node tests because `FF.Room` is I/O orchestration, covered by the transport tests beneath it and the two-tab checks above.

- [ ] **Step 5: Commit**

```bash
git add js/net/room.js && git commit -m "feat: add room lifecycle with presence, capacity and version guards"
```

---

### Task 7: The `FF.Race` adapter

The single boundary games talk to. Everything above it is networking; everything below it is game code.

**Files:**
- Create: `js/net/race.js`

**Interfaces:**
- Consumes: `FF.Room`, `FF.RaceRules`, `FF.Random`, `FF.Advance`.
- Produces:
  - `FF.Race.active() => boolean`
  - `FF.Race.begin(gameId, opts) => void` — `opts` is `{ rounds, timerMs, pointsFor }`
  - `FF.Race.beginRound(n) => Promise<void>` — seeds the RNG for round `n` and claims `startedAt`
  - `FF.Race.submit(choice, correct, ms) => Promise<void>`
  - `FF.Race.lockedOut() => boolean`
  - `FF.Race.onSettle(cb) => off` — `cb({ winnerId, winnerName, correct, points, reason })`
  - `FF.Race.scores() => { [id]: number }`
  - `FF.Race.roster() => scorers[]`
  - `FF.Race.end() => void`

- [ ] **Step 1: Write the module**

Create `js/net/race.js`:

```js
/* ============================================================
   FAMILY FUN — net/race.js
   The only multiplayer surface a game touches. When no room is
   active every call is inert and games fall through to their
   normal single-device behaviour.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var session = null;         // { gameId, rounds, timerMs, pointsFor, index, settled }
  var settleHandlers = [];
  var offRounds = null;

  function room() { return FF.Room ? FF.Room.current() : null; }

  function emitSettle(payload) {
    settleHandlers.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Race]', e); }
    });
  }

  function currentRound() {
    var r = room();
    if (!r || !session) return null;
    var node = (r.rounds || {})[session.index];
    return node || { startedAt: null, answers: {}, winner: null };
  }

  function nameOf(uid) {
    var r = room();
    var p = r && r.players ? r.players[uid] : null;
    return p ? p.name : 'Someone';
  }

  /* Re-evaluate the current round whenever round data changes. */
  function evaluate() {
    if (!session || session.settled) return;
    var r = room();
    if (!r) return;

    var node = currentRound();
    var verdict = FF.RaceRules.settle(
      node,
      FF.Room.racePlayers(),
      session.timerMs,
      r.transport.serverNow()
    );
    if (!verdict.settled) return;

    session.settled = true;

    var answer = verdict.winnerId ? (node.answers || {})[verdict.winnerId] : null;
    emitSettle({
      winnerId: verdict.winnerId,
      winnerName: verdict.winnerId ? nameOf(verdict.winnerId) : null,
      correct: verdict.winnerId === r.uid,
      points: answer ? session.pointsFor(answer) : 0,
      reason: verdict.reason
    });
  }

  FF.Race = {
    active: function () { return !!(session && room()); },

    begin: function (gameId, opts) {
      opts = opts || {};
      var r = room();
      if (!r) return;
      session = {
        gameId: gameId,
        rounds: opts.rounds || 8,
        timerMs: opts.timerMs || 0,
        pointsFor: opts.pointsFor || function () { return 100; },
        index: 0,
        settled: false
      };
      if (offRounds) offRounds();
      offRounds = FF.Room.on('rounds', evaluate);
    },

    /* Seed this round's RNG and claim its start time.
       Resolves once the round is open on this device. */
    beginRound: function (n) {
      var r = room();
      if (!r || !session) return Promise.resolve();

      session.index = n;
      session.settled = false;

      FF.Random.seed(FF.Random.roundSeed(r.meta.seed, session.gameId, n));

      // First device here claims startedAt; the rest read it.
      return r.transport.transaction('rounds/' + n + '/startedAt', function (current) {
        return current == null ? r.transport.serverNow() : undefined;
      }).then(function () {
        return r.transport.get('rounds/' + n + '/startedAt');
      }).then(function () {
        evaluate();
      });
    },

    lockedOut: function () {
      var r = room();
      if (!r || !session) return false;
      return FF.RaceRules.lockedOut(currentRound(), r.uid);
    },

    /* Record an answer. A correct one contests the winner slot. */
    submit: function (choice, correct, ms) {
      var r = room();
      if (!r || !session) return Promise.resolve();
      var n = session.index;

      return r.transport.set('rounds/' + n + '/answers/' + r.uid, {
        choice: choice == null ? null : choice,
        correct: !!correct,
        ms: ms == null ? null : Math.round(ms)
      }).then(function () {
        if (!correct) return null;
        return r.transport.transaction('rounds/' + n + '/winner', function (current) {
          return current == null ? r.uid : undefined;   // first correct answer wins
        });
      }).then(function () {
        evaluate();
      });
    },

    onSettle: function (cb) {
      settleHandlers.push(cb);
      return function () {
        var i = settleHandlers.indexOf(cb);
        if (i !== -1) settleHandlers.splice(i, 1);
      };
    },

    scores: function () {
      var r = room();
      if (!r || !session) return {};
      return FF.RaceRules.scores(r.rounds || {}, FF.Room.racePlayers(), session.pointsFor);
    },

    roster: function () {
      return FF.Room ? FF.Room.scorers() : [];
    },

    end: function () {
      if (offRounds) { offRounds(); offRounds = null; }
      session = null;
      settleHandlers.length = 0;
      FF.Random.unseed();
    }
  };
})();
```

- [ ] **Step 2: Verify the inert path**

With no room active, in the browser console:

```js
FF.Race.active()
```

Expected: `false`. Then confirm the no-op calls are safe:

```js
FF.Race.lockedOut(); FF.Race.scores(); FF.Race.submit(1, true, 100);
```

Expected: `false`, `{}`, and a resolved promise — no exceptions. Games call these unconditionally, so they must never throw offline.

- [ ] **Step 3: Verify the race across two tabs**

In tab one:

```js
FF.Room.create({ mode: 'players', dev: true }).then(function (s) {
  console.log('code', s.code);
  FF.Race.begin('guessFlag', { rounds: 5, timerMs: 20000, pointsFor: function (a) { return a.ms <= 2500 ? 150 : 100; } });
  FF.Race.onSettle(function (p) { console.log('SETTLED', p); });
  FF.Race.beginRound(0);
});
```

In tab two, join with the code and run the same `begin` / `onSettle` / `beginRound(0)` block. Then, in tab two only:

```js
FF.Race.submit(2, true, 1400);
```

Expected: **both tabs** log `SETTLED` with the same `winnerId` (tab two's uid), `reason: 'winner'`, and `points: 150`. Tab one must show `correct: false`, tab two `correct: true`.

Then in tab one:

```js
FF.Race.scores()
```

Expected: `150` for tab two's uid, `0` for tab one's.

- [ ] **Step 4: Verify lockout**

Start round 1 in both tabs. In tab one submit a **wrong** answer:

```js
FF.Race.beginRound(1).then(function () { return FF.Race.submit(0, false, 900); });
```

Then `FF.Race.lockedOut()` must be `true` in tab one and `false` in tab two, and no settle must fire yet — tab two can still answer.

- [ ] **Step 5: Commit**

```bash
git add js/net/race.js && git commit -m "feat: add FF.Race adapter as the single multiplayer boundary for games"
```

---

### Task 8: QR code

**Files:**
- Create: `js/vendor/qrcode.js`
- Create: `js/net/qr.js`
- Modify: `CREDITS.md`

**Interfaces:**
- Consumes: the vendored encoder.
- Produces: `FF.QR.svg(text, opts) => SVGElement|null` — `opts` is `{ size?: number }`, default 200.

- [ ] **Step 1: Vendor the library**

Do **not** hand-write a QR encoder — Reed-Solomon error correction is where hand-rolled versions silently produce unscannable codes. This project already vendors MIT third-party code (Phosphor Icons), so vendoring fits its established pattern.

Download `qrcode-generator` by Kazuhiko Arase (MIT):

```bash
mkdir -p js/vendor && curl -L -o js/vendor/qrcode.js https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/js/qrcode.js
```

Verify it landed and defines the global:

```bash
grep -c "qrcode" js/vendor/qrcode.js
```

Expected: a non-zero count. If the URL has moved, fetch the same library from npm (`qrcode-generator`, file `qrcode.js`) and place it at the same path. It must be the plain browser build with no module wrapper.

- [ ] **Step 2: Write the wrapper**

Create `js/net/qr.js`:

```js
/* ============================================================
   FAMILY FUN — net/qr.js
   Renders a join link as a scannable SVG QR code, using the
   vendored MIT encoder. Entirely local: no CDN, so it works on
   a LAN with no internet.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  FF.QR = {
    /* Returns an <svg> element, or null if the encoder is unavailable. */
    svg: function (text, opts) {
      opts = opts || {};
      var size = opts.size || 200;
      if (typeof window.qrcode !== 'function') return null;

      var qr;
      try {
        qr = window.qrcode(0, 'M');       // 0 = auto version, M = ~15% recovery
        qr.addData(String(text));
        qr.make();
      } catch (e) {
        return null;
      }

      var count = qr.getModuleCount();
      var quiet = 4;                       // required quiet zone, in modules
      var total = count + quiet * 2;

      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'QR code to join the room');
      svg.style.background = '#ffffff';
      svg.style.borderRadius = '12px';
      svg.style.padding = '0';

      var bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('width', total);
      bg.setAttribute('height', total);
      bg.setAttribute('fill', '#ffffff');
      svg.appendChild(bg);

      // One path for every dark module keeps the DOM small.
      var d = '';
      for (var row = 0; row < count; row++) {
        for (var col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            d += 'M' + (col + quiet) + ' ' + (row + quiet) + 'h1v1h-1z';
          }
        }
      }
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', '#000000');
      svg.appendChild(path);

      return svg;
    }
  };
})();
```

Note the QR is always black on white regardless of theme — inverted QR codes fail to scan on many readers.

- [ ] **Step 3: Credit the library**

In `CREDITS.md`, under **Third-party content**, add:

```markdown
- **qrcode-generator** by Kazuhiko Arase — used to render the join QR code for online play.
  Bundled at `js/vendor/qrcode.js`. Licensed under the **MIT License**.
  https://github.com/kazuhikoarase/qrcode-generator
```

- [ ] **Step 4: Verify it renders and scans**

With `js/vendor/qrcode.js` and `js/net/qr.js` loaded, run in the console:

```js
document.body.appendChild(FF.QR.svg('https://demo.brightappsoft.com/familygame/#room=ABC123', { size: 240 }));
```

Expected: a QR code appears. **Scan it with a phone camera** and confirm it opens exactly that URL. A code that renders but does not scan is a failure — check the quiet zone and that it is dark-on-light.

- [ ] **Step 5: Commit**

```bash
git add js/vendor/qrcode.js js/net/qr.js CREDITS.md && git commit -m "feat: render join links as scannable QR codes"
```

---

### Task 9: Room screens

**Files:**
- Create: `js/net/roomUI.js`

**Interfaces:**
- Consumes: `FF.Room`, `FF.QR`, `FF.Games`, `FF.GameFlow`, `FF.ui`, `FF.Nav`, `FF.Advance`.
- Produces:
  - `FF.RoomUI.ONLINE_GAMES` — the ids of the 18 race-capable games
  - `FF.RoomUI.showHome(main)` — create / join chooser
  - `FF.RoomUI.showCreate(main, mode)`
  - `FF.RoomUI.showJoin(main, prefillCode)`
  - `FF.RoomUI.showLobby(main)`
  - `FF.RoomUI.showError(main, message)`

- [ ] **Step 1: Write the module**

Create `js/net/roomUI.js`:

```js
/* ============================================================
   FAMILY FUN — net/roomUI.js
   Screens for online play: create, join, lobby.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ONLINE_GAMES = [
    'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
    'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood',
    'guessObject', 'guessSport', 'guessVehicle',
    'familyQuiz', 'trueOrFalse', 'brainBattle', 'guessWho', 'pictureQuiz',
    'quickTap', 'colorReaction'
  ];

  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var s = document.createElement('style');
    s.id = 'ff-roomui-style';
    s.textContent = [
      '.rm-wrap{max-width:720px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:18px;}',
      '.rm-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:2.6rem;',
      'font-weight:800;letter-spacing:.35em;text-align:center;padding:18px 10px 18px 22px;',
      'background:var(--accent-soft,#ede9fe);border-radius:18px;}',
      '.rm-share{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}',
      '.rm-qr{display:flex;justify-content:center;padding:12px;}',
      '.rm-players{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}',
      '.rm-player{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;',
      'background:var(--surface,#f8fafc);border:1px solid var(--border,#e2e8f0);font-weight:700;}',
      '.rm-player--off{opacity:.45;}',
      '.rm-player__ava{font-size:1.3rem;}',
      '.rm-input{font-size:2rem;text-align:center;letter-spacing:.3em;text-transform:uppercase;',
      'padding:14px;border-radius:14px;border:2px solid var(--border,#e2e8f0);width:100%;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
      '.rm-error{color:#b91c1c;font-weight:700;text-align:center;}',
      '.rm-hint{color:var(--muted,#6b7280);text-align:center;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function panel(children) {
    var w = FF.ui.div('rm-wrap');
    (children || []).forEach(function (c) { if (c) w.appendChild(c); });
    return w;
  }

  function title(text) { return FF.ui.el('h1', { class: 'section-title' }, text); }

  function backButton(fn) {
    return FF.ui.button('← Back', { class: 'btn btn-lg', onClick: fn });
  }

  FF.RoomUI = {
    ONLINE_GAMES: ONLINE_GAMES,

    showHome: function (main) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('🌐 PLAY TOGETHER'),
        FF.ui.div('rm-hint', 'Everyone plays the same game at the same time, on their own device. First correct answer takes the point.'),
        FF.ui.button('➕ CREATE A ROOM', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { self.showModePicker(main); }
        }),
        FF.ui.button('🔑 JOIN WITH A CODE', {
          class: 'btn btn-lg',
          onClick: function () { self.showJoin(main, FF.Room.codeFromUrl()); }
        }),
        backButton(function () { FF.Nav.go('home'); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showModePicker: function (main) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('How are you playing?'),
        FF.ui.button('👤 AS INDIVIDUAL PLAYERS', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { self.showCreate(main, 'players'); }
        }),
        FF.ui.div('rm-hint', 'Each device is one player with their own score.'),
        FF.ui.button('👥 IN TEAMS', {
          class: 'btn btn-lg',
          onClick: function () { self.showCreate(main, 'teams'); }
        }),
        FF.ui.div('rm-hint', 'Each device picks a team; points go to the team.'),
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showCreate: function (main, mode) {
      ensureStyles();
      FF.ui.clear(main);
      main.appendChild(panel([title('Creating room…')]));
      var self = this;

      FF.Room.create({ mode: mode }).then(function () {
        self.showLobby(main);
      }).catch(function (e) {
        self.showError(main, e.message || 'Could not create the room.');
      });
    },

    showJoin: function (main, prefill) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      var id = FF.Room.identity();

      var codeInput = FF.ui.el('input', {
        class: 'rm-input', type: 'text', maxlength: 6,
        value: prefill || '', 'aria-label': 'Room code', placeholder: 'ABC123'
      });
      var nameInput = FF.ui.el('input', {
        class: 'rm-input', type: 'text', maxlength: 14,
        value: id.name, 'aria-label': 'Your name',
        style: { fontSize: '1.3rem', letterSpacing: '0', textTransform: 'none' }
      });
      var error = FF.ui.div('rm-error', '');

      function go() {
        error.textContent = '';
        FF.Room.join(codeInput.value, { name: nameInput.value || 'Player' }).then(function () {
          self.showLobby(main);
        }).catch(function (e) {
          error.textContent = e.message === 'VERSION_MISMATCH'
            ? 'This device is running an older version. Refresh the page and try again.'
            : (e.message || 'Could not join that room.');
        });
      }

      codeInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });

      main.appendChild(panel([
        title('Join a room'),
        FF.ui.div('rm-hint', 'Enter the 6-character code the host shared.'),
        codeInput,
        FF.ui.div('rm-hint', 'Your name'),
        nameInput,
        error,
        FF.ui.button('▶ JOIN', { class: 'btn btn-lg', primary: true, onClick: go }),
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showLobby: function (main) {
      ensureStyles();
      var self = this;
      var state = FF.Room.current();
      if (!state) { this.showHome(main); return; }

      function render() {
        var s = FF.Room.current();
        if (!s) return;
        FF.ui.clear(main);

        var url = FF.Room.shareUrl(s.code);
        var players = FF.Room.racePlayers();

        var list = FF.ui.div('rm-players');
        players.forEach(function (p) {
          list.appendChild(FF.ui.div('rm-player' + (p.online ? '' : ' rm-player--off'), [
            FF.ui.span('rm-player__ava', p.avatar || '😀'),
            p.name + (p.uid === s.uid ? ' (you)' : '')
          ]));
        });

        var qrWrap = FF.ui.div('rm-qr');
        var qr = FF.QR ? FF.QR.svg(url, { size: 200 }) : null;
        if (qr) qrWrap.appendChild(qr);

        var share = FF.ui.div('rm-share', [
          FF.ui.button('📋 Copy link', {
            class: 'btn', onClick: function () {
              if (navigator.clipboard) navigator.clipboard.writeText(url);
              FF.Audio.play('click');
            }
          }),
          navigator.share ? FF.ui.button('📤 Share', {
            class: 'btn', onClick: function () { navigator.share({ title: 'Family Fun', url: url }); }
          }) : null
        ].filter(Boolean));

        var children = [
          title(s.isHost ? '🌐 Your room' : '🌐 ' + s.code),
          FF.ui.div('rm-code', s.code),
          share,
          qrWrap,
          FF.ui.div('rm-hint', FF.util.plural(players.length, 'device') + ' connected · up to ' + FF.Room.MAX_PLAYERS),
          list
        ];

        if (s.isHost) {
          var select = FF.ui.el('select', { class: 'rm-input', style: { fontSize: '1.1rem', letterSpacing: '0', textTransform: 'none' } });
          ONLINE_GAMES.forEach(function (id) {
            var def = FF.Games.get(id);
            if (!def) return;
            select.appendChild(FF.ui.el('option', { value: id }, def.name));
          });
          children.push(FF.ui.div('rm-hint', 'Choose a game'));
          children.push(select);
          children.push(FF.ui.button('▶ START GAME', {
            class: 'btn btn-lg', primary: true,
            onClick: function () {
              FF.Room.setMeta({ gameId: select.value, status: 'playing' });
            }
          }));
        } else {
          children.push(FF.ui.div('rm-hint', '⏳ Waiting for the host to start…'));
        }

        children.push(FF.ui.button('🚪 Leave room', {
          class: 'btn btn-lg',
          onClick: function () { FF.Room.leave(); self.showHome(main); }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      // Re-render as people arrive and leave.
      FF.Room.on('players', render);
      FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'playing' && meta.gameId) {
          FF.GameFlow.launch(meta.gameId, { skipIntro: true, room: true });
        }
      });
      render();
    },

    showError: function (main, message) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('😅 Something went wrong'),
        FF.ui.div('rm-error', message),
        FF.ui.button('← Back', { class: 'btn btn-lg', primary: true, onClick: function () { self.showHome(main); } })
      ]));
      FF.Nav.focusFirst(main);
    }
  };
})();
```

- [ ] **Step 2: Verify across two tabs**

After Task 11 wires the button, open the app in two tabs. Create a room in one and join from the other by code.

Expected: the code renders in large monospace, the QR scans to the join URL, and **both tabs show both players within a second**. Closing one tab greys it out in the other rather than removing it.

- [ ] **Step 3: Write the shared race screens**

Every racing engine needs the same two screens: "you're locked out" and "the round settled". Writing them once here keeps the six engine edits in Tasks 10 and 11 down to a few lines each.

Create `js/net/raceUI.js`:

```js
/* ============================================================
   FAMILY FUN — net/raceUI.js
   The two screens every racing game shares: the lockout note
   after a wrong answer, and the settled-round result. Written
   once so the engines stay thin.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.RaceUI = {
    /* Wrong answer in a room: disable the options, stay on the
       question, and let the round play out for everyone else. */
    lockOut: function (root, optionSelector) {
      FF.Audio.play('wrong');
      FF.ui.$$(optionSelector || 'button', root).forEach(function (b) {
        b.disabled = true;
        b.style.opacity = '0.45';
        b.style.cursor = 'default';
      });
      var note = FF.ui.div('hint', "❌ You're out — watch it play out");
      note.style.fontWeight = '800';
      note.style.textAlign = 'center';
      note.style.marginTop = '14px';
      root.appendChild(note);
      return note;
    },

    /* The round settled for everyone.
       opts: { payload, answerText, isLast, onNext } */
    result: function (root, opts) {
      opts = opts || {};
      var payload = opts.payload || {};
      FF.ui.clear(root);

      var wrap = FF.ui.div('wg-fb');
      wrap.style.textAlign = 'center';

      var result = FF.ui.div('wg-fb-result');
      if (payload.reason === 'winner') {
        var mine = !!payload.correct;
        result.textContent = mine ? '✅ You got it!' : '🏆 ' + payload.winnerName + ' got it';
        result.classList.add(mine ? 'wg-correct' : 'wg-wrong');
        FF.Audio.play(mine ? 'correct' : 'select');
      } else {
        result.textContent = payload.reason === 'timeout' ? "⏰ Time's up" : '❌ Nobody got it';
        result.classList.add('wg-wrong');
        FF.Audio.play('wrong');
      }
      wrap.appendChild(result);

      if (payload.reason === 'winner' && payload.points) {
        wrap.appendChild(FF.ui.div('wg-fb-points', '+' + payload.points + ' points'));
      }

      if (opts.answerText != null) {
        wrap.appendChild(FF.ui.div('wg-fb-answer', 'The answer was ' + opts.answerText));
      }

      wrap.appendChild(FF.Advance.button(
        opts.isLast ? '🏆 See Results' : 'Next ➜',
        opts.onNext || function () {},
        { class: 'btn btn-lg' }
      ));

      root.appendChild(wrap);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);
      return wrap;
    }
  };
})();
```

Add it to `index.html` in Task 11, immediately after `js/net/race.js`.

- [ ] **Step 4: Commit**

```bash
git add js/net/roomUI.js js/net/raceUI.js && git commit -m "feat: add create, join and lobby screens plus shared race result screens"
```

---

### Task 10: Wire the race into the game engines

The 11 World and Visual games come from two edits; the quiz and reaction games need their own.

**Files:**
- Modify: `js/games/worldGames.js` (`runTrivia`)
- Modify: `js/games/visualGames.js` (`runVisualGame`)

**Interfaces:**
- Consumes: `FF.Race`, `FF.Advance`.
- Produces: no new interface.

- [ ] **Step 1: Make `runTrivia` race-aware**

In `js/games/worldGames.js`, inside `runTrivia`, replace the `renderRound` opening and `handleAnswer` with the versions below. The single-device path is unchanged when `FF.Race.active()` is false.

At the top of `runTrivia`, after `var currentQuestion = null;`, add:

```js
    var racing = FF.Race.active();
    var offSettle = null;

    if (racing) {
      FF.Race.begin(api.def.id, {
        rounds: roundCount,
        timerMs: (api.config.timer || 0) * 1000,
        pointsFor: function (answer) { return computePoints(api, answer.ms); }
      });
      offSettle = FF.Race.onSettle(function (payload) {
        if (answered && !payload.winnerId) return;
        answered = true;
        api.shell.hideTimer();
        renderRaceFeedback(currentQuestion, payload);
      });
    }
```

Replace `activeScorer` so the whole group plays every round in a room:

```js
    function activeScorer() {
      if (racing) {
        var me = FF.Room.current();
        var mine = (api.config.scorers || []).filter(function (s) { return s.id === me.uid; })[0];
        return mine || order[0];
      }
      return order[roundIndex % order.length];
    }
```

In `renderRound`, replace the seeding point — add as the **first** statement of `renderRound`:

```js
      if (racing) { FF.Race.beginRound(roundIndex); }
```

In `handleAnswer`, wrap the scoring so a room defers to the race:

```js
    function handleAnswer(choiceIndex) {
      if (answered) return;
      var elapsed = Date.now() - roundStart;
      var q = currentQuestion;
      var correct = (choiceIndex != null && choiceIndex === q.answer);

      if (racing) {
        // Wrong answers lock you out; the round continues for everyone else.
        FF.Race.submit(choiceIndex, correct, elapsed);
        if (!correct) { renderLockedOut(); }
        return;
      }

      answered = true;
      api.shell.hideTimer();
      var scorer = activeScorer();
      totalAnswered++;
      var points = 0;
      if (correct) {
        totalCorrect++;
        points = computePoints(api, elapsed);
        api.scoring.add(scorer.id, points, { correct: true, fastest: elapsed });
        api.audio.play('correct');
      } else {
        api.scoring.markAnswer(scorer.id, false, elapsed);
        api.audio.play('wrong');
      }
      api.shell.updateScores(scorer.id);
      renderFeedback(q, correct, points);
    }
```

Add the two new render functions beside `renderFeedback`:

```js
    /* Wrong answer in a room: stay on the question, watch it play out. */
    function renderLockedOut() {
      FF.RaceUI.lockOut(root, '.wg-option');
    }

    /* The round settled for everyone. */
    function renderRaceFeedback(q, payload) {
      api.shell.updateScores();
      FF.RaceUI.result(root, {
        payload: payload,
        answerText: q && q.answerText != null ? q.answerText : '',
        isLast: (roundIndex + 1) >= roundCount,
        onNext: function () {
          roundIndex++;
          if (roundIndex >= roundCount) finish();
          else renderRound();
        }
      });
    }
```

In `finish`, release the race:

```js
    function finish() {
      api.shell.hideTimer();
      if (offSettle) { offSettle(); offSettle = null; }
      if (racing) FF.Race.end();
      api.shell.updateScores();
      api.end(buildResults(api, totalCorrect, totalAnswered));
    }
```

- [ ] **Step 2: Make `runVisualGame` race-aware**

In `js/games/visualGames.js`, inside `runVisualGame`, make these five edits.

**2a.** After `var finished = false;`, add:

```js
    var racing = FF.Race.active();
    var offSettle = null;
    var currentCorrectName = null;

    if (racing) {
      FF.Race.begin(api.def.id, {
        rounds: rounds,
        timerMs: (api.config.timer || 0) * 1000,
        pointsFor: function (answer) {
          var pts = Math.round(BASE_POINTS * difficultyBonus(api.config.difficulty));
          if (answer.ms != null && answer.ms <= FAST_MS) pts += SPEED_BONUS;
          return pts;
        }
      });
      offSettle = FF.Race.onSettle(function (payload) {
        stopShellTimer();
        showRaceResult(payload);
      });
    }
```

**2b.** Add `showRaceResult` next to `showNext`:

```js
    function showRaceResult(payload) {
      api.shell.updateScores();
      FF.RaceUI.result(api.shell.root, {
        payload: payload,
        answerText: currentCorrectName,
        isLast: roundIndex >= rounds - 1,
        onNext: function () { roundIndex++; nextRound(); }
      });
    }
```

**2c.** As the first statement inside `nextRound`, after the `if (finished) return;` guard, add:

```js
      if (racing) { FF.Race.beginRound(roundIndex); }
```

**2d.** In `nextRound`, record the answer name and divert the answer handler. Replace:

```js
      var controls = visualRound(wrap, {
        imageDOM: q.imageDOM,
        promptText: q.promptText,
        correctName: q.correctName,
        options: q.options,
        factLines: q.factLines,
        onAnswer: function (correct) {
          if (answered) return;
          answered = true;
          handleAnswer(active, correct, Date.now() - startTime);
        }
      });
```

with:

```js
      currentCorrectName = q.correctName;

      var controls = visualRound(wrap, {
        imageDOM: q.imageDOM,
        promptText: q.promptText,
        correctName: q.correctName,
        options: q.options,
        factLines: q.factLines,
        onAnswer: function (correct) {
          if (answered) return;
          if (racing) {
            // The race decides the round; a wrong answer only locks this device out.
            FF.Race.submit(null, correct, Date.now() - startTime);
            if (!correct) FF.RaceUI.lockOut(api.shell.root, '.ffv-option');
            return;
          }
          answered = true;
          handleAnswer(active, correct, Date.now() - startTime);
        }
      });
```

**2e.** In `finish`, release the race. Replace `finished = true;` with:

```js
      finished = true;
      if (offSettle) { offSettle(); offSettle = null; }
      if (racing) FF.Race.end();
```

- [ ] **Step 3: Verify offline is untouched**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total`.

Open `tools/test-seed.html`. Expected: `18 passed, 0 failed`.

Play **Guess the Flag** and **Guess the Country** offline. Turn-taking, scoring and auto-advance must behave exactly as after the auto-advance plan — `FF.Race.active()` is false, so nothing changed.

- [ ] **Step 4: Verify a real two-device race**

Create a room in one tab, join in another, host picks **Guess the Flag** and starts.

Expected:
- Both tabs show the **same flag and the same four options in the same order**. This is the whole design working.
- Answering correctly in one tab settles both, showing `🏆 <name> got it` in the other.
- Answering wrong greys out that tab's options with "You're out"; the other tab can still answer.
- Both advance together after ~2 seconds, and the scoreboards agree.

- [ ] **Step 5: Commit**

```bash
git add js/games/worldGames.js js/games/visualGames.js && git commit -m "feat: race support in the world and visual game engines"
```

---

### Task 11: App wiring

**Files:**
- Modify: `index.html`, `js/app.js`, `js/registry.js`

**Interfaces:**
- Consumes: everything above.
- Produces: no new interface.

- [ ] **Step 1: Add the script tags**

In `index.html`, after `<script src="js/navigation.js"></script>`, add:

```html
  <!-- Online play (optional; inert unless firebase-config.js is filled in) -->
  <script src="js/vendor/qrcode.js"></script>
  <script src="js/net/firebase-config.js"></script>
  <script src="js/net/qr.js"></script>
  <script src="js/net/raceRules.js"></script>
  <script src="js/net/transport.js"></script>
  <script src="js/net/firebaseTransport.js"></script>
  <script src="js/net/room.js"></script>
  <script src="js/net/race.js"></script>
  <script src="js/net/raceUI.js"></script>
  <script src="js/net/roomUI.js"></script>
```

Order matters: `raceRules` before `race`, `transport` before `room`, `firebase-config` before `firebaseTransport`, `race` before `raceUI`.

- [ ] **Step 2: Add the home button and the online view**

In `js/app.js`, in the `home` view's `actions` block, after the QUICK ROUND button, add:

```js
        if (FF.Net && FF.Net.configured()) {
          actions.appendChild(FF.App.heroButton('globe', '🌐', 'PLAY TOGETHER', 'Same game, different devices', function () { FF.Nav.go('online'); }));
        }
```

The `FF.Net.configured()` guard is what keeps the offline build clean — without a config, nothing renders.

Then register the view. In `FF.App.views`, add:

```js
      online: function (main) {
        FF.RoomUI.showHome(main);
      },
```

Bump the footer version:

```js
      footer.appendChild(FF.ui.div('app-footer__ver', 'v1.1.0'));
```

This must match `FF.Room.APP_VERSION`.

- [ ] **Step 3: Auto-open a shared link**

In `FF.App.init`, after `this.render('home');`, add:

```js
      var joinCode = (FF.Room && FF.Room.codeFromUrl) ? FF.Room.codeFromUrl() : null;
      if (joinCode && FF.Net && FF.Net.configured()) {
        FF.Nav.go('online');
        FF.RoomUI.showJoin(this.root(), joinCode);
      }
```

- [ ] **Step 4: Use the room's scorers when launching in a room**

In `FF.GameFlow.buildConfig` (`js/registry.js:259`), after `const scorers = ...`, add:

```js
      const roomScorers = (overrides.room && FF.Race && FF.Race.active && FF.Room && FF.Room.current())
        ? FF.Room.scorers() : null;
```

and use `roomScorers || scorers` in the config object. Also add `room: !!overrides.room` to the returned config.

- [ ] **Step 5: Verify everything**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total`.

Open `tools/test-seed.html`. Expected: `18 passed, 0 failed`.

Open `index.html` with `FF.FirebaseConfig = null`. Expected: **no** PLAY TOGETHER button, no network requests, everything else works.

- [ ] **Step 6: Commit**

```bash
git add index.html js/app.js js/registry.js && git commit -m "feat: wire online play into the app shell"
```

---

### Task 11b: Race support in the quiz engines

The four quiz games have separate loops, but each needs the same four hooks. `FF.RaceUI` from Task 9 supplies the screens, so each edit is small.

**Files:**
- Modify: `js/games/quizGames.js` — the `familyQuiz`, `trueOrFalse`, `brainBattle` and `pictureQuiz` loops (`guessWho` shares `brainBattle`'s structure; treat it as a fifth site if it has its own loop)

**Interfaces:**
- Consumes: `FF.Race`, `FF.RaceUI`.
- Produces: no new interface.

- [ ] **Step 1: Add a shared race helper to the file**

Rather than repeat the wiring four times, add this near the top of `js/games/quizGames.js`, after the existing helper functions:

```js
  /* ---------- Race support ----------
     One helper serves every quiz loop. Returns null offline, so
     each loop's single-device path stays exactly as it was. */
  function raceFor(api, opts) {
    if (!FF.Race || !FF.Race.active()) return null;

    FF.Race.begin(api.def.id, {
      rounds: opts.rounds,
      timerMs: (api.config.timer || 0) * 1000,
      pointsFor: opts.pointsFor
    });

    var handle = {
      beginRound: function (n) { FF.Race.beginRound(n); },
      submit: function (choice, correct, elapsedMs) {
        FF.Race.submit(choice, correct, elapsedMs);
        if (!correct) FF.RaceUI.lockOut(api.shell.root, opts.optionSelector || 'button');
      },
      onSettle: function (cb) { return FF.Race.onSettle(cb); },
      end: function () { FF.Race.end(); }
    };
    return handle;
  }
```

- [ ] **Step 2: Wire the `familyQuiz` loop**

Inside `familyQuiz`'s `start`, after the round-count variable is established, add:

```js
      var race = raceFor(api, {
        rounds: total,
        optionSelector: '.quiz-option',
        pointsFor: function (answer) { return answer.ms != null && answer.ms <= 2500 ? 150 : 100; }
      });
      var offSettle = race ? race.onSettle(function (payload) {
        api.shell.hideTimer();
        api.shell.updateScores();
        FF.RaceUI.result(api.shell.root, {
          payload: payload,
          answerText: currentQuestion ? currentQuestion.options[currentQuestion.answer] : null,
          isLast: (round + 1) >= total,
          onNext: function () { round++; if (round >= total) finishGame(); else renderRound(); }
        });
      }) : null;
```

Confirm the real local variable names for the round counter, total and current question before pasting — they differ between loops. Use whatever that loop actually calls them.

As the first statement of `renderRound`, add:

```js
        if (race) race.beginRound(round);
```

In `onAnswer`, before the existing scoring code, add:

```js
          if (race) {
            race.submit(idx, correct, Date.now() - startTime);
            return;
          }
```

In the finish path, before `api.end(...)`, add:

```js
          if (offSettle) offSettle();
          if (race) race.end();
```

- [ ] **Step 3: Repeat for the other three loops**

Apply the identical four hooks — `raceFor(...)`, `race.beginRound(n)`, the `race.submit(...)` early return, and the `race.end()` teardown — to `trueOrFalse`, `brainBattle` and `pictureQuiz`, adjusting only:

- the local variable names for round index, total and current question,
- `optionSelector` to match that loop's option class,
- `pointsFor` to match that loop's existing point formula (read it from its `awardCorrect` call).

Find each loop's option class with:

```bash
grep -n "class: 'quiz-option'\|optionBtn\|markOption" js/games/quizGames.js
```

- [ ] **Step 4: Verify**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total`.

Open `tools/test-seed.html`. Expected: `18 passed, 0 failed`.

Play each quiz game **offline** — turn-taking, scoring, explanations and auto-advance must be unchanged. Then play each in a two-tab room: same questions and option order on both, first correct answer wins, wrong answer locks out.

- [ ] **Step 5: Commit**

```bash
git add js/games/quizGames.js && git commit -m "feat: race support in the quiz game engines"
```

---

### Task 11c: Race support in the reaction engines

Reaction games race differently: everyone taps simultaneously on their own device and the **fastest valid tap** wins the round. The "Pass the device to X" screen is skipped entirely in a room, because nobody is passing anything.

**Files:**
- Modify: `js/games/reactionGames.js` — `startQuickTap` and the Color Reaction loop

**Interfaces:**
- Consumes: `FF.Race`, `FF.RaceUI`.
- Produces: no new interface.

- [ ] **Step 1: Skip the hand-off screen in a room**

In `startQuickTap`, replace `next`:

```js
    function next() {
      if (index >= players.length) { finish(); return; }
      var player = players[index];
      index++;
      intro(player);
    }
```

with:

```js
    function next() {
      if (index >= players.length) { finish(); return; }
      var player = players[index];
      index++;
      // In a room every player has their own device, so there is
      // nothing to hand over — go straight into the rounds.
      if (FF.Race && FF.Race.active()) { runRounds(player, 0, []); return; }
      intro(player);
    }
```

Apply the same change to the Color Reaction loop's equivalent function.

- [ ] **Step 2: Race on reaction time**

In `startQuickTap`, after `var summary = [];`, add:

```js
    var racing = !!(FF.Race && FF.Race.active());
    var offSettle = null;

    if (racing) {
      FF.Race.begin(api.def.id, {
        rounds: roundsPerPlayer,
        timerMs: 0,                       // reaction games are not on a round timer
        pointsFor: function (answer) {
          return answer.ms == null ? 0 : Math.round(scoreForAverage(answer.ms / 1000) * bonus);
        }
      });
      offSettle = FF.Race.onSettle(function (payload) {
        FF.RaceUI.result(api.shell.root, {
          payload: payload,
          answerText: null,
          isLast: true,
          onNext: function () { finish(); }
        });
      });
    }
```

In `runRound`, before `var delay = ...`, add:

```js
      if (racing) FF.Race.beginRound(roundNumber);
```

This is what makes the "GET READY" delay identical on every device — it is generated from the seeded RNG (Task 2, Step 3).

In `onTap`'s `'ready'` branch, after `times.push(sec);`, add:

```js
          if (racing) { FF.Race.submit(null, true, ms); }
```

and in the `'waiting'` (false start) branch, after `times.push(null);`, add:

```js
          if (racing) { FF.Race.submit(null, false, null); }
```

A false start is a wrong answer: it locks that device out of the round, exactly like a wrong quiz answer.

In `finish`, add before the results are built:

```js
      if (offSettle) { offSettle(); offSettle = null; }
      if (racing) FF.Race.end();
```

- [ ] **Step 3: Repeat for Color Reaction**

Apply the same four hooks to the Color Reaction loop, using its own point formula and treating a wrong-colour tap as the wrong answer.

- [ ] **Step 4: Verify**

Play **Quick Tap** offline with two players: the "Pass the device to X" screen with its `▶ START` gate must still appear. This is the offline behaviour the auto-advance plan deliberately preserved.

Then play it in a two-tab room: **no** hand-off screen, both tabs count down together, the "TAP!" signal fires at the same instant on both, and the faster tap takes the point.

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total`.

- [ ] **Step 5: Commit**

```bash
git add js/games/reactionGames.js && git commit -m "feat: race support in the reaction game engines"
```

---

### Task 12: Error states and the version guard

**Files:**
- Modify: `js/net/roomUI.js`, `js/net/room.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `FF.RoomUI.showVersionBlock(main)`, `FF.RoomUI.banner(text)`.

- [ ] **Step 1: Add the reconnecting banner**

In `js/net/roomUI.js`, add:

```js
    banner: function (text) {
      var existing = FF.ui.$('#rm-banner');
      if (existing) existing.parentNode.removeChild(existing);
      if (!text) return;
      var b = FF.ui.el('div', {
        id: 'rm-banner',
        style: {
          position: 'fixed', left: '0', right: '0', top: '0', zIndex: '9999',
          padding: '10px', textAlign: 'center', fontWeight: '800',
          background: '#f59e0b', color: '#111827'
        }
      }, text);
      document.body.appendChild(b);
    },
```

- [ ] **Step 2: Add the version block screen**

```js
    showVersionBlock: function (main) {
      ensureStyles();
      FF.ui.clear(main);
      main.appendChild(panel([
        title('🔄 Update needed'),
        FF.ui.div('rm-hint', 'This device is running an older version of the game than the room. Refresh the page to update, then join again.'),
        FF.ui.button('🔄 REFRESH NOW', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { window.location.reload(true); }
        })
      ]));
      FF.Nav.focusFirst(main);
    },
```

Call it from `showJoin`'s catch when `e.message === 'VERSION_MISMATCH'`, replacing the inline text.

- [ ] **Step 3: Show the banner on disconnect**

In `js/net/room.js`, inside `watchAll`, add a connection watch for the Firebase transport:

```js
    if (transport.watchConnection) {
      unsubs.push(transport.watchConnection(function (online) {
        if (FF.RoomUI) FF.RoomUI.banner(online ? null : '📡 Reconnecting…');
      }));
    }
```

And add `watchConnection` to the Firebase transport in `js/net/firebaseTransport.js`:

```js
          watchConnection: function (cb) {
            var r = window.firebase.database().ref('.info/connected');
            var handler = r.on('value', function (snap) { cb(snap.val() === true); });
            return function () { r.off('value', handler); };
          },
```

- [ ] **Step 4: Verify**

With two tabs in a room, open DevTools → Network → **Offline** in one tab.

Expected: the orange "📡 Reconnecting…" banner appears within a few seconds. Restore the connection: the banner clears and the tab catches up to the current round without a reload.

To test the version guard, temporarily change `APP_VERSION` in `js/net/room.js` to `'1.0.9'` in one tab only, then try to join a room made by the other. Expected: the "Update needed" screen. **Change it back to `'1.1.0'`.**

- [ ] **Step 5: Commit**

```bash
git add js/net/roomUI.js js/net/room.js js/net/firebaseTransport.js && git commit -m "feat: add reconnect banner and stale-client version guard"
```

---

### Task 12b: Shared results, Play Again, and host migration

Three spec requirements that close out the game loop: everyone sees the same final scoreboard, the host can run it back, and the room survives the host leaving.

**Files:**
- Modify: `js/net/room.js`, `js/net/roomUI.js`, `js/registry.js`

**Interfaces:**
- Consumes: `FF.Room`, `FF.Race`, `FF.RaceRules`.
- Produces:
  - `FF.Room.playAgain() => Promise<void>` — host only; new seed, cleared rounds, back to the lobby
  - `FF.Room.claimHost() => Promise<void>` — the longest-connected device takes over
  - `FF.RoomUI.showResults(main)` — the shared final scoreboard

- [ ] **Step 1: Add host migration**

In `js/net/room.js`, add to `FF.Room`:

```js
    /* If the host goes offline, the longest-connected device takes
       over so the room keeps working. Everyone runs this; the
       transaction guarantees only one of them wins. */
    claimHost: function () {
      if (!state) return Promise.resolve();
      var players = this.racePlayers();
      var host = state.players[state.meta.hostUid];

      if (host && host.online !== false) return Promise.resolve();

      var online = players.filter(function (p) { return p.online !== false; });
      if (!online.length) return Promise.resolve();

      online.sort(function (a, b) {
        var pa = state.players[a.uid] || {};
        var pb = state.players[b.uid] || {};
        return (pa.joinedAt || 0) - (pb.joinedAt || 0);
      });

      if (online[0].uid !== state.uid) return Promise.resolve();

      var self = this;
      return state.transaction
        ? Promise.resolve()
        : state.transport.transaction('meta/hostUid', function (current) {
            var cur = state.players[current];
            // Only take over if the recorded host really is gone.
            return (cur && cur.online !== false) ? undefined : self.current().uid;
          }).then(function (res) {
            if (res.committed) state.isHost = true;
          });
    },

    playAgain: function () {
      if (!state || !state.isHost) return Promise.resolve();
      return state.transport.set('rounds', null).then(function () {
        return state.transport.update('meta', {
          seed: FF.Random.newSeed(),
          status: 'lobby',
          gameId: null
        });
      });
    },
```

Then call `claimHost` whenever presence changes — inside `watchAll`'s `players` handler, after `emit('players', state.players)`:

```js
      FF.Room.claimHost();
```

- [ ] **Step 2: Add the shared results screen**

In `js/net/roomUI.js`, add to `FF.RoomUI`:

```js
    showResults: function (main) {
      ensureStyles();
      var self = this;
      var s = FF.Room.current();
      if (!s) { this.showHome(main); return; }

      function render() {
        var state = FF.Room.current();
        if (!state) return;
        FF.ui.clear(main);

        var scores = FF.Race.scores();
        var ranked = FF.Room.racePlayers().map(function (p) {
          return { uid: p.uid, name: p.name, avatar: p.avatar, points: scores[p.uid] || 0 };
        }).sort(function (a, b) { return b.points - a.points; });

        var list = FF.ui.div('rm-players');
        list.style.flexDirection = 'column';
        ranked.forEach(function (r, i) {
          var medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '  '));
          list.appendChild(FF.ui.div('rm-player', [
            FF.ui.span('rm-player__ava', medal + ' ' + (r.avatar || '😀')),
            r.name + (r.uid === state.uid ? ' (you)' : ''),
            FF.ui.span('', '  ' + FF.util.formatNumber(r.points))
          ]));
        });

        var children = [
          title(ranked.length && ranked[0].points > 0 ? '🏆 ' + ranked[0].name + ' wins!' : '🏁 Game over'),
          list
        ];

        if (state.isHost) {
          children.push(FF.ui.button('🔄 PLAY AGAIN', {
            class: 'btn btn-lg', primary: true,
            onClick: function () { FF.Room.playAgain(); }
          }));
        } else {
          children.push(FF.ui.div('rm-hint', '⏳ Waiting for the host…'));
        }

        children.push(FF.ui.button('🚪 Leave room', {
          class: 'btn btn-lg',
          onClick: function () { FF.Room.leave(); self.showHome(main); }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      // Play Again returns everyone to the lobby together.
      FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'lobby') self.showLobby(main);
      });
      FF.Room.on('players', render);
      render();
    },
```

- [ ] **Step 3: Route the end of a room game to the shared results**

In `js/registry.js`, in `FF.GameFlow.end`, before the existing results rendering, add:

```js
      if (cur.config.room && FF.Room && FF.Room.current()) {
        FF.Stats.recordGamePlayed(cur.def.id, cur.def.name);
        FF.Recents.add(cur.def.id, cur.def.name);
        FF.GameFlow.exitToHome();
        FF.Nav.go('online');
        FF.RoomUI.showResults(FF.App.root());
        return;
      }
```

This makes every device show the same derived scoreboard, rather than each rendering its own local `FF.Scoring` state.

- [ ] **Step 4: Verify**

With two tabs in a room, play a game to the end.

Expected:
- Both tabs show the **same** final scoreboard in the same order, with matching point totals.
- Only the host sees PLAY AGAIN; the guest sees "Waiting for the host…".
- Pressing PLAY AGAIN returns **both** tabs to the lobby with the same players still listed, and starting again produces a **different** question sequence (new seed).

For host migration: with three tabs in a room, close the host's tab. Within a few seconds the longest-connected remaining tab must gain the game picker and the START button. The other guest must not.

- [ ] **Step 5: Commit**

```bash
git add js/net/room.js js/net/roomUI.js js/registry.js && git commit -m "feat: add shared results, play again and host migration"
```

---

### Task 13: Real-device verification

The dev transport proves the logic; only real phones on real networks prove the product.

**Files:**
- Create: `docs/superpowers/plans/2026-08-30-multiplayer-verification.md`

- [ ] **Step 1: Complete the Firebase setup**

Follow `FIREBASE_SETUP.md` end to end and fill in `js/net/firebase-config.js`. Confirm in the console:

```js
FF.Net.configured()
```

Expected: `true`, and PLAY TOGETHER now appears.

- [ ] **Step 2: Deploy**

Upload the app to `https://demo.brightappsoft.com/familygame/`, **including `js/net/firebase-config.js`** — git does not carry it. Confirm the site loads and the button appears.

- [ ] **Step 3: Run the automated suites against the deployed copy**

```bash
node tools/test/run.js
```

Expected: `43 passed, 0 failed, 43 total`.

Open `https://demo.brightappsoft.com/familygame/tools/test-seed.html`. Expected: `18 passed, 0 failed`.

- [ ] **Step 4: Run the multi-device checklist**

Use at least three real devices on different networks (one on mobile data, not WiFi).

| # | Check | Pass |
|---|---|---|
| 1 | Host creates a room; code is 6 chars, no `O/0/I/1` | |
| 2 | Guest joins by typing the code | |
| 3 | Guest joins by tapping the shared link | |
| 4 | Guest joins by scanning the QR | |
| 5 | All devices show the same question and the same option order | |
| 6 | First correct answer takes the point on every device | |
| 7 | Two devices answering near-simultaneously produce exactly one winner | |
| 8 | A wrong answer locks that device out; others keep racing | |
| 9 | Nobody answering expires the round on every device | |
| 10 | All devices advance together after ~2 seconds | |
| 11 | Scoreboards match exactly on every device | |
| 12 | Host locks their phone mid-game; the others keep playing | |
| 13 | A guest disconnects, greys out, rejoins, and keeps their score | |
| 14 | Team mode: points pool to the team | |
| 15 | 13th device is refused with "room is full" | |
| 16 | Play Again starts a fresh seed with the same players | |
| 17 | All 18 online games play through end to end | |
| 18 | Offline `file://` copy still works with no PLAY TOGETHER button | |

- [ ] **Step 5: Record the results and commit**

Write the completed table, the device and browser list, and any defects found to `docs/superpowers/plans/2026-08-30-multiplayer-verification.md`, then:

```bash
git add docs/superpowers/plans/2026-08-30-multiplayer-verification.md && git commit -m "docs: record multiplayer multi-device verification results"
```

---

## Done when

- `node tools/test/run.js` exits `0` with 43 passing tests.
- `tools/test-seed.html` reports `18 passed, 0 failed` — every race game generates identical questions from a seed.
- Three real devices can join one room by code, link and QR, and race through all 18 games with matching scoreboards.
- Wrong answers lock a player out without ending the round; the first correct answer takes the point and everyone advances together.
- The host can disconnect without stalling the game.
- With `FF.FirebaseConfig = null`, the app is byte-for-byte the offline experience it was before: no button, no network requests, `file://` works.
