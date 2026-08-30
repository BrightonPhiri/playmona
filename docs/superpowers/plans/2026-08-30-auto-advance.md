# Auto-Advance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the manual "Next" tap from all question/answer games so rounds advance automatically after a short result pause, and drop the post-answer country information from the country games.

**Architecture:** One new module, `FF.Advance`, splits into a DOM-free countdown *controller* (unit tested in Node with an injected clock) and a thin DOM *button* wrapper that renders a progress bar and fires on its own. Every game site swaps its `FF.ui.button('Next…')` for `FF.Advance.button(...)`, a one-line change per site. `FF.GameFlow.pause/resume/restart/exitToHome` drive `FF.Advance.pauseAll/resumeAll/cancelAll` so a paused game does not advance behind the overlay.

**Tech Stack:** Vanilla ES5-compatible JavaScript, classic `<script>` tags, no build step, no dependencies. Node 24 (already installed, `v24.18.0`) runs the test harness — used only for tests, never shipped to the browser.

## Global Constraints

- **ES5-compatible classic scripts only.** No `import`/`export`, no arrow functions in shipped files, no `const`/`let` in the game modules (they use `var`). New engine files may use `const`/`let` only where neighbouring code already does (`js/core.js`, `js/registry.js`, `js/app.js` use them; all `js/games/*.js` use `var`).
- **Must run from `file://`.** No network requests, no CDN, no external assets.
- **Everything attaches to `window.FF`.** No globals other than `FF`.
- **Zero new runtime dependencies.** The Node test harness must use only Node built-ins (`fs`, `path`, `vm`).
- **Default result pause: `2000` ms**, read from `FF.Settings.get('autoAdvanceMs')`. No settings UI is added — this is a documented escape hatch only. Setting it to `0` restores fully manual behaviour.
- **Keyboard and TV-remote navigation must keep working.** The app is navigated with `FF.Nav.focus`/`focusFirst` and `data-focusable`; the advance control stays a real focusable `<button>` so nothing regresses.
- **Respect reduced motion.** When `FF.Settings.get('reduceMotion')` is true, render the countdown without the animated fill.
- Style injection follows the existing per-module pattern (see `ensureStyles` in `js/games/worldGames.js:120`), not edits to `css/styles.css`.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `js/advance.js` | `FF.Advance` — countdown controller (pure) + auto-advancing button (DOM) + global pause/resume/cancel registry. |
| `tools/test/harness.js` | Minimal assert/runner and a `vm` sandbox loader for classic `FF` scripts. No dependencies. |
| `tools/test/run.js` | Test entry point. Discovers and runs `tools/test/*.test.js`, exits non-zero on failure. |
| `tools/test/advance.test.js` | Unit tests for the countdown controller. |

**Modify**

| File | Change |
|---|---|
| `index.html` | Add `<script src="js/advance.js">` after `js/timer.js`. |
| `js/registry.js` | `FF.Settings.defaults.autoAdvanceMs`; wire `pause/resume/restart/exitToHome/launch` to `FF.Advance`. |
| `js/games/worldGames.js` | Auto-advance in `renderFeedback`; delete the fact block and stop building `fact`. |
| `js/games/visualGames.js` | Auto-advance in `showNext`; drop `factLines` for `guessCountry` only. |
| `js/games/quizGames.js` | Auto-advance at 4 sites. |
| `js/games/reactionGames.js` | Auto-advance at 2 sites. |

---

### Task 1: Node test harness

Nothing in this repo is testable today. This task creates the smallest harness that can unit-test `FF` modules, and proves it works with one real assertion. Everything later in this plan and in the multiplayer plan depends on it.

**Files:**
- Create: `tools/test/harness.js`
- Create: `tools/test/run.js`
- Create: `tools/test/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadFF(relativePaths: string[]) => FF` — loads classic `FF` scripts into a fresh sandbox and returns the populated `FF` namespace. Each call is fully isolated.
  - `test(name: string, fn: () => void)` — registers a test.
  - `assert(cond: any, msg: string)`, `assertEqual(actual, expected, msg)`, `assertClose(actual, expected, tolerance, msg)`.
  - `run() => Promise<number>` — runs registered tests, prints results, resolves with the failure count.

- [ ] **Step 1: Write the harness**

Create `tools/test/harness.js`:

```js
/* Minimal test harness for Family Fun.
   Node built-ins only. Loads classic `window.FF` scripts via vm. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

/* A document stub sufficient for modules that touch the DOM lazily.
   Enough for element creation and tree building; not a real DOM. */
function makeDocument() {
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      dataset: {},
      attributes: {},
      textContent: '',
      className: '',
      disabled: false,
      parentNode: null,
      _listeners: {},
      classList: {
        _set: {},
        add: function (c) { this._set[c] = true; },
        remove: function (c) { delete this._set[c]; },
        toggle: function (c, on) { if (on) this.add(c); else this.remove(c); },
        contains: function (c) { return !!this._set[c]; }
      },
      appendChild: function (c) { this.children.push(c); if (c) c.parentNode = this; return c; },
      removeChild: function (c) {
        const i = this.children.indexOf(c);
        if (i !== -1) this.children.splice(i, 1);
        if (c) c.parentNode = null;
        return c;
      },
      setAttribute: function (k, v) { this.attributes[k] = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
      removeEventListener: function (t, fn) {
        const list = this._listeners[t] || [];
        const i = list.indexOf(fn);
        if (i !== -1) list.splice(i, 1);
      },
      dispatch: function (t, ev) { (this._listeners[t] || []).slice().forEach(function (fn) { fn(ev || {}); }); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      focus: function () {},
      remove: function () { if (this.parentNode) this.parentNode.removeChild(this); }
    };
    return el;
  }
  const doc = makeEl('document');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.createElement = makeEl;
  doc.createTextNode = function (t) { return { nodeType: 3, textContent: String(t) }; };
  return doc;
}

/* Load one or more FF scripts into an isolated sandbox. */
function loadFF(relativePaths) {
  const doc = makeDocument();
  const win = {};
  const sandbox = {
    window: win,
    document: doc,
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Node: function Node() {}
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  relativePaths.forEach(function (rel) {
    const full = path.join(ROOT, rel);
    const code = fs.readFileSync(full, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      throw new Error('Failed loading ' + rel + ': ' + e.message);
    }
  });

  if (!win.FF) throw new Error('Scripts did not define window.FF: ' + relativePaths.join(', '));
  win.FF.__sandbox = sandbox;
  return win.FF;
}

/* --- assertions --- */
class AssertionError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'Expected truthy value');
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError((msg || 'Values differ') + '\n    expected: ' + b + '\n    actual:   ' + a);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new AssertionError((msg || 'Numbers differ') +
      '\n    expected: ' + expected + ' +/- ' + tolerance + '\n    actual:   ' + actual);
  }
}

/* --- runner --- */
const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function run() {
  let failures = 0;
  let passes = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passes++;
      console.log('  PASS  ' + t.name);
    } catch (e) {
      failures++;
      console.log('  FAIL  ' + t.name);
      console.log('        ' + String(e.message).split('\n').join('\n        '));
      if (!(e instanceof AssertionError)) console.log(e.stack);
    }
  }
  console.log('');
  console.log(passes + ' passed, ' + failures + ' failed, ' + tests.length + ' total');
  return failures;
}

module.exports = { loadFF, test, assert, assertEqual, assertClose, run, ROOT };
```

- [ ] **Step 2: Write the runner**

Create `tools/test/run.js`:

```js
#!/usr/bin/env node
/* Runs every tools/test/*.test.js file. Usage: node tools/test/run.js */
'use strict';

const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(function (f) { return f.endsWith('.test.js'); })
  .sort();

if (!files.length) {
  console.error('No .test.js files found in ' + dir);
  process.exit(1);
}

console.log('Family Fun test suite');
console.log('');
files.forEach(function (f) {
  console.log(f);
  require(path.join(dir, f));
});
console.log('');

harness.run().then(function (failures) {
  process.exit(failures > 0 ? 1 : 0);
});
```

- [ ] **Step 3: Write a smoke test that proves the sandbox loader works**

Create `tools/test/smoke.test.js`:

```js
'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

test('loadFF loads core.js and exposes FF.util', function () {
  const FF = loadFF(['js/core.js']);
  assert(FF.util, 'FF.util should exist');
  assert(typeof FF.util.shuffle === 'function', 'FF.util.shuffle should be a function');
});

test('FF.util.normalize lowercases and trims', function () {
  const FF = loadFF(['js/core.js']);
  assertEqual(FF.util.normalize('  Hello World!  '), 'hello world');
});

test('each loadFF call is isolated', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  a.util.__marker = 1;
  assert(b.util.__marker === undefined, 'sandboxes must not share state');
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:

```bash
node tools/test/run.js
```

Expected output ends with:

```
3 passed, 0 failed, 3 total
```

Exit code must be `0`. Verify with `echo $?` (Bash) — if any test fails, fix the harness before continuing; every later task depends on it.

- [ ] **Step 5: Verify the runner actually fails on a broken test**

Temporarily append to `tools/test/smoke.test.js`:

```js
test('DELIBERATE FAILURE - remove me', function () {
  assertEqual(1, 2, 'this must fail');
});
```

Run:

```bash
node tools/test/run.js
```

Expected: `3 passed, 1 failed, 4 total`, exit code `1`. A harness that cannot fail is worthless — this step proves it can. **Now delete that test block** and re-run to confirm `3 passed, 0 failed`.

---

### Task 2: The countdown controller

The DOM-free core of auto-advance. All timing rules live here so they can be tested without a browser.

**Files:**
- Create: `js/advance.js`
- Create: `tools/test/advance.test.js`

**Interfaces:**
- Consumes: `loadFF`, `test`, `assert`, `assertEqual` from Task 1.
- Produces: `FF.Advance.controller(opts) => controller`, where `opts` is
  `{ ms: number, onDone: function, onTick?: function(progress), now?: function(): number }`
  and the controller exposes:
  - `start()` — begin counting. No-op if not `idle`.
  - `tick()` — recompute against the clock; fires `onDone` once when elapsed >= `ms`.
  - `pause()` / `resume()` — freeze and unfreeze elapsed time.
  - `skip()` — fire `onDone` immediately.
  - `cancel()` — permanently prevent `onDone`.
  - `state()` — `'idle' | 'running' | 'paused' | 'done' | 'cancelled'`.
  - `progress()` — `0..1`.
  - `remaining()` — milliseconds left, never negative.

  Guarantee relied on by every later task: **`onDone` fires at most once, ever.**

- [ ] **Step 1: Write the failing tests**

Create `tools/test/advance.test.js`:

```js
'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

/* A controllable clock so tests never depend on real time. */
function fakeClock() {
  let t = 1000;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; }
  };
}

function make(FF, ms, clock, onDone) {
  return FF.Advance.controller({ ms: ms, now: clock.now, onDone: onDone });
}

test('controller starts idle and does not fire early', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  assertEqual(c.state(), 'idle');
  c.start();
  assertEqual(c.state(), 'running');

  clock.advance(1999);
  c.tick();
  assertEqual(fired, 0, 'must not fire before ms elapses');
  assertEqual(c.state(), 'running');
});

test('controller fires exactly once when the time elapses', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  clock.advance(2000);
  c.tick();
  assertEqual(fired, 1);
  assertEqual(c.state(), 'done');

  clock.advance(5000);
  c.tick();
  c.tick();
  assertEqual(fired, 1, 'extra ticks must not re-fire');
});

test('pause freezes elapsed time and resume continues it', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  clock.advance(500);
  c.tick();
  c.pause();
  assertEqual(c.state(), 'paused');

  clock.advance(60000);           // a whole minute paused
  c.tick();
  assertEqual(fired, 0, 'a paused countdown must never fire');

  c.resume();
  assertEqual(c.state(), 'running');
  clock.advance(1499);
  c.tick();
  assertEqual(fired, 0, '1999ms of running time is not enough');

  clock.advance(1);
  c.tick();
  assertEqual(fired, 1, 'fires after 2000ms of running time');
});

test('skip fires immediately and only once', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  c.skip();
  assertEqual(fired, 1);
  assertEqual(c.state(), 'done');

  c.skip();
  clock.advance(9999);
  c.tick();
  assertEqual(fired, 1, 'skip is idempotent');
});

test('cancel prevents the callback forever', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  c.cancel();
  assertEqual(c.state(), 'cancelled');

  clock.advance(9999);
  c.tick();
  c.skip();
  c.resume();
  c.tick();
  assertEqual(fired, 0, 'a cancelled controller must never fire');
});

test('progress runs 0 to 1 and remaining never goes negative', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  const c = make(FF, 2000, clock, function () {});

  c.start();
  assertEqual(c.progress(), 0);
  assertEqual(c.remaining(), 2000);

  clock.advance(1000);
  c.tick();
  assertEqual(c.progress(), 0.5);
  assertEqual(c.remaining(), 1000);

  clock.advance(5000);
  c.tick();
  assertEqual(c.progress(), 1);
  assertEqual(c.remaining(), 0, 'remaining must clamp at zero');
});

test('ms of 0 fires on the first tick', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 0, clock, function () { fired++; });
  c.start();
  c.tick();
  assertEqual(fired, 1, 'a zero-length pause still completes');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node tools/test/run.js
```

Expected: every `advance.test.js` test FAILS with `Failed loading js/advance.js: ENOENT` (the file does not exist yet).

- [ ] **Step 3: Write the controller**

Create `js/advance.js` with **only** the controller for now (the DOM button arrives in Task 3):

```js
/* ============================================================
   FAMILY FUN — advance.js
   Auto-advance: a countdown that moves the game to the next
   round without a manual tap, with a visible progress bar and
   tap-to-skip. Split into a DOM-free controller (unit tested)
   and a DOM button wrapper.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var DEFAULT_MS = 2000;

  /* ---------- Pure countdown controller ----------
     States: idle -> running -> done
                     running <-> paused
             any -> cancelled
     onDone fires at most once, ever. */
  function controller(opts) {
    opts = opts || {};
    var ms = Math.max(0, opts.ms == null ? DEFAULT_MS : opts.ms);
    var now = opts.now || function () { return Date.now(); };
    var onDone = opts.onDone || function () {};
    var onTick = opts.onTick || null;

    var state = 'idle';
    var elapsed = 0;        // accumulated running time, excluding pauses
    var startedAt = 0;      // clock reading when the current run leg began

    function runningElapsed() {
      return state === 'running' ? elapsed + (now() - startedAt) : elapsed;
    }

    function finish() {
      if (state === 'done' || state === 'cancelled') return;
      elapsed = ms;
      state = 'done';
      onDone();
    }

    var api = {
      start: function () {
        if (state !== 'idle') return api;
        state = 'running';
        startedAt = now();
        return api;
      },

      tick: function () {
        if (state !== 'running') return api;
        if (onTick) onTick(api.progress());
        if (runningElapsed() >= ms) finish();
        return api;
      },

      pause: function () {
        if (state !== 'running') return api;
        elapsed += now() - startedAt;
        state = 'paused';
        return api;
      },

      resume: function () {
        if (state !== 'paused') return api;
        state = 'running';
        startedAt = now();
        return api;
      },

      skip: function () {
        if (state === 'cancelled') return api;
        finish();
        return api;
      },

      cancel: function () {
        if (state === 'done') return api;
        state = 'cancelled';
        return api;
      },

      state: function () { return state; },

      progress: function () {
        if (ms <= 0) return 1;
        var p = runningElapsed() / ms;
        return p < 0 ? 0 : (p > 1 ? 1 : p);
      },

      remaining: function () {
        var r = ms - runningElapsed();
        return r < 0 ? 0 : r;
      }
    };

    return api;
  }

  FF.Advance = {
    DEFAULT_MS: DEFAULT_MS,
    controller: controller
  };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node tools/test/run.js
```

Expected: `10 passed, 0 failed, 10 total` (3 smoke + 7 advance), exit code `0`.

- [ ] **Step 5: Commit**

This project is not yet a git repository. If `git rev-parse --is-inside-work-tree` fails, initialise it first:

```bash
git init && printf 'node_modules/\njs/net/firebase-config.js\n' > .gitignore && git add -A && git commit -m "chore: initial commit of Family Fun app"
```

Then commit this task:

```bash
git add tools/test js/advance.js && git commit -m "feat: add auto-advance countdown controller and test harness"
```

---

### Task 3: The auto-advancing button

Wraps the controller in a real, focusable `<button>` so keyboard and TV-remote navigation keep working, and registers it globally so pause can freeze it.

**Files:**
- Modify: `js/advance.js`
- Modify: `index.html:16` (after the `js/timer.js` script tag)

**Interfaces:**
- Consumes: `FF.Advance.controller` from Task 2; `FF.ui.button` (`js/core.js:71`); `FF.Settings.get` (`js/registry.js:26`); `FF.Storage`.
- Produces:
  - `FF.Advance.button(label, fn, opts) => HTMLButtonElement` — a button that runs `fn` when clicked **or** when the countdown completes, whichever comes first, and never both. `opts` is `{ ms?: number, class?: string, primary?: boolean }`. The returned element carries `el.advance` (the controller).
  - `FF.Advance.defaultMs() => number` — `FF.Settings.get('autoAdvanceMs')` or `2000`.
  - `FF.Advance.pauseAll()`, `FF.Advance.resumeAll()`, `FF.Advance.cancelAll()` — act on every live controller.

- [ ] **Step 1: Add the DOM wrapper to `js/advance.js`**

Replace the closing block of `js/advance.js` (the `FF.Advance = { ... };` object literal and the lines after it) with:

```js
  /* ---------- Live controller registry ----------
     GameFlow pause/resume/exit drive these so a paused game
     never advances behind the overlay. */
  var live = [];

  function register(ctrl) {
    live.push(ctrl);
    return ctrl;
  }

  function forget(ctrl) {
    var i = live.indexOf(ctrl);
    if (i !== -1) live.splice(i, 1);
  }

  /* ---------- Styles (injected once, matching the app's pattern) ---------- */
  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var style = document.createElement('style');
    style.id = 'ff-advance-style';
    style.textContent = [
      '.ff-adv{position:relative;overflow:hidden;}',
      '.ff-adv__fill{position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:currentColor;opacity:0.18;pointer-events:none;border-radius:inherit;}',
      '.ff-adv__label{position:relative;z-index:1;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function defaultMs() {
    var v = (FF.Settings && typeof FF.Settings.get === 'function')
      ? FF.Settings.get('autoAdvanceMs')
      : DEFAULT_MS;
    v = parseInt(v, 10);
    if (isNaN(v) || v < 0) v = DEFAULT_MS;
    return v;
  }

  function reduceMotion() {
    return !!(FF.Settings && typeof FF.Settings.get === 'function' && FF.Settings.get('reduceMotion'));
  }

  /* Build a button that fires `fn` on click OR when the countdown ends. */
  function button(label, fn, opts) {
    opts = opts || {};
    ensureStyles();

    var ms = opts.ms == null ? defaultMs() : Math.max(0, opts.ms);
    var fired = false;
    var raf = null;

    var btn = FF.ui.button('', {
      class: 'ff-adv ' + (opts.class || 'btn btn-lg'),
      primary: opts.primary !== false,
      ariaLabel: String(label)
    });

    var fill = FF.ui.el('span', { class: 'ff-adv__fill', 'aria-hidden': 'true' });
    var text = FF.ui.el('span', { class: 'ff-adv__label' }, String(label));
    btn.appendChild(fill);
    btn.appendChild(text);

    function stopLoop() {
      if (raf != null) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(raf);
        else clearTimeout(raf);
        raf = null;
      }
    }

    function done() {
      if (fired) return;
      fired = true;
      stopLoop();
      forget(ctrl);
      fn();
    }

    var ctrl = controller({
      ms: ms,
      onDone: done,
      onTick: function (p) {
        if (!reduceMotion()) fill.style.width = Math.round(p * 100) + '%';
      }
    });

    btn.advance = ctrl;

    btn.addEventListener('click', function () {
      ctrl.skip();
    });

    // ms of 0 means "stay manual" — no countdown, click only.
    if (ms > 0) {
      register(ctrl);
      ctrl.start();
      var loop = function () {
        if (ctrl.state() === 'done' || ctrl.state() === 'cancelled') { stopLoop(); return; }
        ctrl.tick();
        raf = window.requestAnimationFrame ? window.requestAnimationFrame(loop) : setTimeout(loop, 50);
      };
      raf = window.requestAnimationFrame ? window.requestAnimationFrame(loop) : setTimeout(loop, 50);
    }

    return btn;
  }

  FF.Advance = {
    DEFAULT_MS: DEFAULT_MS,
    controller: controller,
    button: button,
    defaultMs: defaultMs,
    pauseAll: function () { live.slice().forEach(function (c) { c.pause(); }); },
    resumeAll: function () { live.slice().forEach(function (c) { c.resume(); }); },
    cancelAll: function () { live.slice().forEach(function (c) { c.cancel(); }); live.length = 0; }
  };
})();
```

- [ ] **Step 2: Add the script tag**

In `index.html`, immediately after the `js/timer.js` line, add:

```html
  <script src="js/advance.js"></script>
```

The order matters: `advance.js` uses `FF.ui` from `core.js` (loaded first) and reads `FF.Settings` lazily at call time, so it may load before `registry.js`.

- [ ] **Step 3: Verify the existing tests still pass**

Run:

```bash
node tools/test/run.js
```

Expected: `10 passed, 0 failed, 10 total`. The controller tests must be unaffected by the wrapper — if any now fail, the wrapper has leaked into the pure logic.

- [ ] **Step 4: Verify in the browser**

Open `index.html` in a browser, open the console, and run:

```js
FF.Advance.defaultMs()
```

Expected: `2000`. Then:

```js
var b = FF.Advance.button('Test', function () { console.log('FIRED'); }); document.body.appendChild(b);
```

Expected: the button appears, its fill sweeps left to right over ~2 seconds, then `FIRED` logs exactly once. Click a fresh one before it completes and confirm `FIRED` logs immediately and only once.

- [ ] **Step 5: Commit**

```bash
git add js/advance.js index.html && git commit -m "feat: add auto-advancing button with progress fill and tap-to-skip"
```

---

### Task 4: Pause, restart and exit integration

Without this, a paused game keeps counting down behind the overlay and jumps rounds when resumed.

**Files:**
- Modify: `js/registry.js:16-33` (settings defaults), `js/registry.js:607-635` (pause/resume/restart), and `FF.GameFlow.launch` / `exitToHome`.

**Interfaces:**
- Consumes: `FF.Advance.pauseAll/resumeAll/cancelAll` from Task 3.
- Produces: `FF.Settings.defaults.autoAdvanceMs = 2000`.

- [ ] **Step 1: Add the settings default**

In `js/registry.js`, inside `FF.Settings.defaults`, add after `displaySeconds: 60`:

```js
      displaySeconds: 60,
      autoAdvanceMs: 2000
```

(Note the comma added to the previous line.) No settings UI is added — this is a deliberate escape hatch, per the spec. Setting it to `0` makes every advance button manual again.

- [ ] **Step 2: Freeze countdowns while paused**

In `FF.GameFlow.pause` (`js/registry.js:607`), add as the first statement after the `if (!cur) return;` guard:

```js
      if (FF.Advance) FF.Advance.pauseAll();
```

In `FF.GameFlow.resume` (`js/registry.js:622`), add immediately before the closing brace of the function:

```js
      if (FF.Advance) FF.Advance.resumeAll();
```

- [ ] **Step 3: Cancel countdowns on restart, exit and launch**

In `FF.GameFlow.restart` (`js/registry.js:631`), add as the first statement:

```js
      if (FF.Advance) FF.Advance.cancelAll();
```

In `FF.GameFlow.launch` (`js/registry.js:294`), add as the first statement of the function:

```js
      if (FF.Advance) FF.Advance.cancelAll();
```

In `FF.GameFlow.exitToHome`, add as the first statement:

```js
      if (FF.Advance) FF.Advance.cancelAll();
```

Locate `exitToHome` with:

```bash
grep -n "exitToHome: function" js/registry.js
```

- [ ] **Step 4: Verify nothing regressed**

Run:

```bash
node tools/test/run.js
```

Expected: `10 passed, 0 failed, 10 total`.

Then in the browser console:

```js
FF.Settings.get('autoAdvanceMs')
```

Expected: `2000`.

Full manual check comes in Task 9, once a real game uses it.

- [ ] **Step 5: Commit**

```bash
git add js/registry.js && git commit -m "feat: freeze auto-advance while paused, cancel on restart and exit"
```

---

### Task 5: World games — auto-advance and remove the country fact

The four country games (`whereInWorld`, `mapChallenge`, `capitalChallenge`, `guessFlag`) all run through `runTrivia`, so this one edit covers all four.

**Files:**
- Modify: `js/games/worldGames.js:335-355` (the `next` button in `renderFeedback`)
- Modify: `js/games/worldGames.js:326-332` (the fact block in `renderFeedback`)
- Modify: the question builders that set `fact`

**Interfaces:**
- Consumes: `FF.Advance.button(label, fn, opts)` from Task 3.
- Produces: no new interface.

- [ ] **Step 1: Delete the fact block from `renderFeedback`**

In `js/games/worldGames.js`, inside `renderFeedback`, delete these lines entirely:

```js
      if (q.fact) {
        var fact = div('wg-fact');
        fact.appendChild(div('wg-fact-label', 'Did you know?'));
        fact.appendChild(div('', q.fact));
        wrap.appendChild(fact);
      }
```

The result line, the answer text and the points line stay exactly as they are.

- [ ] **Step 2: Replace the Next button with an auto-advancing one**

Still in `renderFeedback`, replace:

```js
      var isLast = (roundIndex + 1) >= roundCount;
      var next = FF.ui.button(isLast ? '🏆 See Results' : 'Next ➜', {
        class: 'btn btn-lg', primary: true,
        onClick: function () {
          api.audio.play('select');
          roundIndex++;
          if (roundIndex >= roundCount) finish();
          else renderRound();
        }
      });
      wrap.appendChild(next);
```

with:

```js
      var isLast = (roundIndex + 1) >= roundCount;
      var next = FF.Advance.button(isLast ? '🏆 See Results' : 'Next ➜', function () {
        api.audio.play('select');
        roundIndex++;
        if (roundIndex >= roundCount) finish();
        else renderRound();
      }, { class: 'btn btn-lg' });
      wrap.appendChild(next);
```

- [ ] **Step 3: Stop building the fact in the question builders**

Find every place a `fact` is attached to a question:

```bash
grep -n "fact" js/games/worldGames.js
```

Remove the `fact: countryFact(correct),` (and any `fact: ...`) property from each returned question object. Then delete the now-unused `countryFact` helper at `js/games/worldGames.js:43` and the `.wg-fact` / `.wg-fact-label` CSS rules in `ensureStyles`.

Verify nothing still references them:

```bash
grep -n "countryFact\|wg-fact" js/games/worldGames.js
```

Expected: no output.

- [ ] **Step 4: Verify in the browser**

Open `index.html`, add two players, and play **Guess the Flag**.

Expected on answering:
- The result shows ✅/❌, the correct country name and the points earned.
- **No "Did you know?" block appears.**
- The Next button's fill sweeps across and the next question loads on its own after ~2 seconds.
- Clicking the button early advances immediately.
- Pressing ⏸ during the pause freezes the fill; Resume continues it.

Repeat for **Where in the World?**, **Map Challenge** and **Capital Challenge** — all four share `runTrivia`, so they must behave identically.

- [ ] **Step 5: Commit**

```bash
git add js/games/worldGames.js && git commit -m "feat: auto-advance world games and remove post-answer country facts"
```

---

### Task 6: Visual games — auto-advance and remove the Guess the Country facts

`runVisualGame` drives all seven visual games. Auto-advance applies to all of them; the fact removal applies **only to `guessCountry`**, per the spec.

**Files:**
- Modify: `js/games/visualGames.js:250-265` (`showNext`)
- Modify: `js/games/visualGames.js:384-395` (`guessCountry` builder)

**Interfaces:**
- Consumes: `FF.Advance.button` from Task 3.
- Produces: no new interface.

- [ ] **Step 1: Replace the Next button in `showNext`**

In `js/games/visualGames.js`, replace the body of `showNext`:

```js
    function showNext() {
      var last = roundIndex >= rounds - 1;
      var nextBtn = FF.ui.button(last ? '🏁 FINISH' : 'NEXT ▶', {
        class: 'btn-lg', primary: true,
        onClick: function () { roundIndex++; nextRound(); }
      });
      nextBtn.style.display = 'block';
      nextBtn.style.margin = '18px auto 0';
      nextBtn.style.minWidth = '200px';
      api.shell.root.appendChild(nextBtn);
      FF.safe(function () { FF.Nav.focus(nextBtn); });
    }
```

with:

```js
    function showNext() {
      var last = roundIndex >= rounds - 1;
      var nextBtn = FF.Advance.button(last ? '🏁 FINISH' : 'NEXT ▶', function () {
        roundIndex++;
        nextRound();
      }, { class: 'btn-lg' });
      nextBtn.style.display = 'block';
      nextBtn.style.margin = '18px auto 0';
      nextBtn.style.minWidth = '200px';
      api.shell.root.appendChild(nextBtn);
      FF.safe(function () { FF.Nav.focus(nextBtn); });
    }
```

- [ ] **Step 2: Drop the fact lines from Guess the Country only**

In the `guessCountry` registration, replace:

```js
          var factLines = [
            '🌍 ' + (country.name || ''),
            '🏙️ Capital: ' + (country.capital || '—'),
            '🗺️ Continent: ' + (country.continent || '—')
          ];
          if (country.facts && country.facts.length) factLines.push('💡 ' + country.facts[0]);
          return {
            imageDOM: flag,
            promptText: 'WHICH COUNTRY?',
            correctName: country.name,
            options: makeOptions(country.name, names),
            factLines: factLines
          };
```

with:

```js
          return {
            imageDOM: flag,
            promptText: 'WHICH COUNTRY?',
            correctName: country.name,
            options: makeOptions(country.name, names)
          };
```

`visualRound` already guards with `if (opts.factLines && opts.factLines.length)` (`js/games/visualGames.js:112`), so omitting the property leaves the fact box hidden. **Do not** change `visualRound` itself — the other six games still use it.

- [ ] **Step 3: Confirm the other six games kept their facts**

```bash
grep -n "factLines" js/games/visualGames.js
```

Expected: `guessLandmark`, `guessAnimal`, `guessFood`, `guessObject`, `guessSport` and `guessVehicle` still build `factLines`; `guessCountry` no longer appears.

- [ ] **Step 4: Verify in the browser**

Play **Guess the Country**: the correct option turns green, no fact panel appears, and the round advances on its own after ~2 seconds.

Play **Guess the Animal**: the fact panel still appears, and it also auto-advances.

- [ ] **Step 5: Commit**

```bash
git add js/games/visualGames.js && git commit -m "feat: auto-advance visual games, drop facts from Guess the Country"
```

---

### Task 7: Quiz games — auto-advance at four sites

Each quiz game has its own loop, so this is four near-identical edits. They are one task because they share a single verification pass.

**Files:**
- Modify: `js/games/quizGames.js` at approximately lines 326, 464, 845 and 974.

**Interfaces:**
- Consumes: `FF.Advance.button` from Task 3.
- Produces: no new interface.

- [ ] **Step 1: Locate the four sites**

```bash
grep -n "Next ➡" js/games/quizGames.js
```

Expected: four matches.

- [ ] **Step 2: Replace each one**

Every site currently reads:

```js
          const nextBtn = api.ui.button('Next ➡', { class: 'btn-lg', primary: true, onClick: function () { FF.Audio.play('click'); nextRound(); } });
          wrap.appendChild(nextBtn);
```

Replace each with:

```js
          const nextBtn = FF.Advance.button('Next ➡', function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
          wrap.appendChild(nextBtn);
```

The following `FF.Nav.focus(nextBtn)` line at each site stays — the button is still a real focusable element.

**Check each site's callback before replacing.** Three call `nextRound()`; confirm the fourth does the same and preserve whatever it actually calls. Do not assume they are identical.

- [ ] **Step 3: Confirm all four were converted**

```bash
grep -n "Next ➡" js/games/quizGames.js
```

Expected: four matches, every one now inside an `FF.Advance.button(` call. Confirm none remain as `api.ui.button('Next ➡'`:

```bash
grep -n "ui.button('Next ➡'" js/games/quizGames.js
```

Expected: no output.

- [ ] **Step 4: Verify in the browser**

Play each of **Family Quiz**, **True or False**, **Brain Battle** and **Picture Quiz**. Each must: show the result and any explanation, auto-advance after ~2 seconds, advance immediately on click, and freeze while paused. Quiz explanations stay — the spec removed facts from country games only.

- [ ] **Step 5: Commit**

```bash
git add js/games/quizGames.js && git commit -m "feat: auto-advance quiz game rounds"
```

---

### Task 8: Reaction games — auto-advance at two sites

Safe despite being turn-based: `NEXT ▶` leads to `intro(player)` (`js/games/reactionGames.js:167`), a *"Pass the device to X"* screen with its own `▶ START` gate. Auto-advance lands on that gate, which still waits for a human.

**Files:**
- Modify: `js/games/reactionGames.js:286` and `js/games/reactionGames.js:541`

**Interfaces:**
- Consumes: `FF.Advance.button` from Task 3.
- Produces: no new interface.

- [ ] **Step 1: Locate both sites**

```bash
grep -n "NEXT ▶" js/games/reactionGames.js
```

Expected: two matches.

- [ ] **Step 2: Replace each one**

Both currently read:

```js
      var nextBtn = api.ui.button(isLast ? '🏆 RESULTS' : 'NEXT ▶', { primary: true, class: 'btn-lg', onClick: function () {
        api.audio.play('select');
        next();
      } });
```

Replace each with:

```js
      var nextBtn = FF.Advance.button(isLast ? '🏆 RESULTS' : 'NEXT ▶', function () {
        api.audio.play('select');
        next();
      }, { class: 'btn-lg' });
```

Confirm the local variable holding "is this the last player" is actually named `isLast` at both sites before replacing; the second site may differ. The following `focusSafe(nextBtn)` line stays at both.

- [ ] **Step 3: Confirm both were converted**

```bash
grep -n "ui.button(isLast" js/games/reactionGames.js
```

Expected: no output.

- [ ] **Step 4: Verify in the browser**

Play **Quick Tap** with two players. After a player's three tries, the summary must auto-advance after ~2 seconds to the *"Pass the device to X"* screen — and then **wait** there for START. That gate must not be bypassed; if it is, the wrong site was edited.

Repeat for **Color Reaction**.

- [ ] **Step 5: Commit**

```bash
git add js/games/reactionGames.js && git commit -m "feat: auto-advance reaction game summaries"
```

---

### Task 9: Full regression pass

Confirms the change did what was asked and broke nothing — in particular that the games deliberately left manual are still manual.

**Files:**
- Create: `docs/superpowers/plans/2026-08-30-auto-advance-verification.md` (the filled-in checklist, committed as evidence)

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Run the automated tests**

```bash
node tools/test/run.js
```

Expected: `10 passed, 0 failed, 10 total`, exit code `0`. Record the exact output.

- [ ] **Step 2: Confirm the manual sites are still manual**

```bash
grep -n "Next Player\|Next Round\|Next Word" js/games/wordGames.js js/games/partyGames.js
```

Expected: every match is still a plain `FF.ui.button(...)`, **not** `FF.Advance.button`. Per the spec these stay manual because the device physically changes hands.

Then play, and confirm each waits indefinitely for a tap:
- **Word games** — the "▶ Next Player" hand-off, the "▶ Next Word" TV display board, the Word Scramble result, and the Word Chain result.
- **Party games** — the "▶ Next Round" hand-off.

- [ ] **Step 3: Check the auto sites against the spec**

Play all 18 target games. For each, confirm: it auto-advances after ~2 seconds, clicking advances immediately, and pausing freezes the countdown.

| Game | Auto-advances | Click skips | Pause freezes |
|---|---|---|---|
| Where in the World? | | | |
| Map Challenge | | | |
| Capital Challenge | | | |
| Guess the Flag | | | |
| Guess the Country | | | |
| Guess the Landmark | | | |
| Guess the Animal | | | |
| Guess the Food | | | |
| Guess the Object | | | |
| Guess the Sport | | | |
| Guess the Vehicle | | | |
| Family Quiz | | | |
| True or False | | | |
| Brain Battle | | | |
| Guess Who | | | |
| Picture Quiz | | | |
| Quick Tap | | | |
| Color Reaction | | | |

- [ ] **Step 4: Check fact removal**

- **Guess the Flag / Where in the World / Map Challenge / Capital Challenge** — no "Did you know?" block, but the correct answer and points still show.
- **Guess the Country** — no country/capital/continent panel.
- **Guess the Animal / Food / Sport / Object / Vehicle / Landmark** — facts still shown.
- **Quiz games** — explanations still shown.

- [ ] **Step 5: Check accessibility and the escape hatch**

- Tab to the advance button — it must be focusable and Enter must advance.
- In the console run `FF.Settings.set('autoAdvanceMs', 0)`, then play a round: the button must **not** auto-fire, restoring fully manual behaviour. Reset with `FF.Settings.set('autoAdvanceMs', 2000)`.
- Set `FF.Settings.set('reduceMotion', true)` and confirm the fill no longer animates while the button still fires.

- [ ] **Step 6: Commit the completed checklist**

Write the filled-in results to `docs/superpowers/plans/2026-08-30-auto-advance-verification.md`, then:

```bash
git add docs/superpowers/plans/2026-08-30-auto-advance-verification.md && git commit -m "docs: record auto-advance verification results"
```

---

## Done when

- `node tools/test/run.js` exits `0` with 10 passing tests.
- All 18 question/answer games advance on their own after ~2 seconds, and skip on click.
- Word and party hand-off screens still wait for a tap.
- Country facts are gone from the four World games and Guess the Country; facts and explanations remain everywhere else.
- Pausing freezes the countdown; restart and exit cancel it.
- `js/advance.js` is the only new runtime file, and the app still opens from `file://`.
