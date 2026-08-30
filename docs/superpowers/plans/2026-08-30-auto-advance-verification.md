# Auto-Advance — Verification Record

**Date:** 2026-08-30
**Plan:** `docs/superpowers/plans/2026-08-30-auto-advance.md`
**Method:** Node test suite plus scripted in-browser play against a local
static server (`python -m http.server`), driving each game through real
clicks and DOM assertions.

---

## 1. Automated tests

```
$ node tools/test/run.js

advance.test.js
smoke.test.js

  PASS  controller starts idle and does not fire early
  PASS  controller fires exactly once when the time elapses
  PASS  pause freezes elapsed time and resume continues it
  PASS  skip fires immediately and only once
  PASS  cancel prevents the callback forever
  PASS  progress runs 0 to 1 and remaining never goes negative
  PASS  ms of 0 fires on the first tick
  PASS  loadFF loads core.js and exposes FF.util
  PASS  FF.util.normalize lowercases and trims
  PASS  each loadFF call is isolated

10 passed, 0 failed, 10 total
```

Exit code `0`.

The harness was also confirmed capable of failing: a deliberately broken
assertion produced `3 passed, 1 failed, 4 total` and exit code `1`, then was
removed.

---

## 2. Games that must auto-advance

All driven by script: launch, click an answer, assert the result screen, wait
2.4 s, assert the round changed.

| Game | Auto-advances | Click skips | Pause freezes |
|---|---|---|---|
| Where in the World? | yes | yes | yes |
| Map Challenge | yes | yes | yes |
| Capital Challenge | yes | yes | yes |
| Guess the Flag | yes | yes | yes |
| Guess the Country | yes | yes | yes |
| Guess the Landmark | yes | yes | yes |
| Guess the Animal | yes | yes | yes |
| Guess the Food | yes | yes | yes |
| Guess the Object | yes | yes | yes |
| Guess the Sport | yes | yes | yes |
| Guess the Vehicle | yes | yes | yes |
| Family Quiz | yes | yes | yes |
| True or False | yes | yes | yes |
| Guess Who / What | yes | yes | yes |
| Picture Quiz | yes | yes | yes |
| Quick Tap | yes | yes | yes |
| Color Reaction | yes | yes | yes |
| Brain Battle | yes (pre-existing) | n/a | yes |

**Brain Battle** was the one exception found during execution: it has no
"Next" button at all. It already advanced between questions on its own via a
built-in 650 ms hop, so it needed no change. Verified still automatic. Its only
button, `▶ <name>'s Run`, is a player hand-off and correctly stays manual.

Pause/resume was verified end to end on Guess the Flag: answering, pausing,
holding for 3 s with the countdown frozen at 36 % progress, then resuming and
advancing normally.

---

## 3. Games that must stay manual

Source check — all six are still plain `FF.ui.button`, with no `FF.Advance`
anywhere in either file:

| File | Site | Status |
|---|---|---|
| `wordGames.js:425` | `▶ Next Player` | manual |
| `wordGames.js:545` | `▶ Next Word` (TV display board) | manual |
| `wordGames.js:674` | `▶ Next` (Word Scramble → next player types) | manual |
| `wordGames.js:1034` | `▶ Next` (Word Chain → next player types) | manual |
| `partyGames.js:270` | `▶ Next Round` | manual |
| `partyGames.js:411` | `▶ Next Round` | manual |

The reaction games' hand-off gate was specifically confirmed **not** bypassed:
after Quick Tap auto-advanced Ana's summary, it landed on *"Pass the device to
Ben — ▶ START"* and remained there for a further 3 s without starting Ben's
turn. Color Reaction behaved identically.

---

## 4. Fact removal

| Game | Facts shown after answering |
|---|---|
| Where in the World? | no |
| Map Challenge | no |
| Capital Challenge | no |
| Guess the Flag | no |
| Guess the Country | no |
| Guess the Landmark | yes (kept) |
| Guess the Animal | yes (kept) |
| Guess the Food | yes (kept) |
| Guess the Object | yes (kept) |
| Guess the Sport | yes (kept) |
| Guess the Vehicle | yes (kept) |
| Quiz explanations | yes (kept) |

The correct answer and points earned are still shown in every case — e.g.
Guess the Flag renders `Answer: Australia` with no "Did you know?" block.

Dead code removed alongside: the `countryFact()` helper, the `.wg-fact` and
`.wg-fact-label` CSS rules, and all six `fact:` properties on the World
question builders. Four `howToPlay` lines that promised "a fun fact after each
answer" were rewritten, since that text would otherwise have been false.

---

## 5. Accessibility and the escape hatch

| Check | Result |
|---|---|
| Advance control is a real `<button>` | yes — `tagName: BUTTON` |
| Focusable | yes — `tabIndex: 0`, `document.activeElement` matches after `.focus()` |
| Labelled for screen readers | yes — `aria-label: "Next ➜"` |
| `autoAdvanceMs = 0` restores manual play | yes — sat on the result past 3 s; click still advanced |
| `reduceMotion = true` | yes — fill no longer animates, round still advances |

---

## 6. Defect found and fixed during execution

**The countdown stalled whenever `requestAnimationFrame` was throttled.**

The advance loop originally ran only on `requestAnimationFrame`. Browsers
throttle or suspend rAF in a background tab, so a game left mid-result would
sit on the result screen instead of advancing — reproduced reliably in a
hidden tab, where a resumed countdown failed to complete within 2.4 s.

Fixed by adding a 200 ms `setInterval` safety net beside the rAF loop. The
controller measures wall-clock time and `onDone` is idempotent, so whichever
ticks first finishes the round and the other is harmless. Re-verified: pause,
resume and auto-advance now all work correctly even in a hidden tab.

One harness bug was also fixed before any product code was written: the vm
sandbox modelled `window` as a plain object, but in a browser `window` **is**
the global, so `window.FF = {}` must create a global `FF`. Scripts assigning
via `window.FF` and reading bare `FF` failed until the sandbox was corrected.

---

## Outcome

All nine tasks complete. 10/10 automated tests pass, all 18 question games
advance on their own with click-to-skip and correct pause behaviour, all six
hand-off screens still wait for a tap, and country facts are gone from the five
country games while every other game keeps its facts.
