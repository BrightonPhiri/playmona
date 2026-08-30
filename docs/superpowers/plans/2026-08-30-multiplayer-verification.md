# Cross-Device Multiplayer — Verification Record

**Date:** 2026-08-30
**Plan:** `docs/superpowers/plans/2026-08-30-multiplayer-rooms.md`
**Method:** Node test suite, a browser determinism harness, and two real
browser tabs acting as two devices, driven through the actual UI.

> Sections 1-9 were verified against the BroadcastChannel development
> transport, which implements the identical interface. **Section 10 covers
> verification against the real Firebase project**, added once it was set up;
> it includes a serious security-rules defect found only at that stage.
>
> **Still not done:** testing on real phones, over mobile data, with three or
> more devices, and scanning the QR with a real camera.

---

## 1. Automated tests

```
$ node tools/test/run.js
53 passed, 0 failed, 53 total
```

Breakdown: 3 harness smoke, 7 auto-advance controller, 11 seeded RNG,
21 race rules, 11 transport.

The RNG suite's most important case loads **two independent sandboxes** and
asserts they produce identical sequences from one seed — the two-device
property, tested directly rather than by proxy.

## 2. Determinism harness

`tools/test-seed.html` → **18 passed, 0 failed.**

Renders every candidate game's rounds twice under the same seed and diffs the
visible text. It also clicks through hand-off gates, so the reaction and Brain
Battle rows compare real rounds rather than identical intro screens.

**Scope limit, stated on the page itself:** it diffs rendered text, so it
covers question content, option wording and option order. It does *not*
observe values produced later by timers, such as Quick Tap's GET READY delay.
Those are deterministic by construction — they call `FF._rand()`. That claim
was then verified directly; see §4.

## 3. Two-device behaviour (World / Visual / Quiz)

Driven through the real UI in two tabs, each with its own device identity.

| Check | Result |
|---|---|
| Room code is 6 chars, no `O/0/I/1` | pass |
| Join by typing the code | pass |
| Join by shared link (`#room=…` auto-fills) | pass |
| QR renders, dark-on-light, structurally valid | pass (§5) |
| Both devices show the same question and same option order | pass |
| First correct answer takes the point | pass |
| Both devices report the same winner, reason and points | pass |
| Wrong answer locks that device out; others keep racing | pass |
| Round with no answers expires on both devices | pass |
| Both auto-advance together after ~2s | pass |
| Header scoreboard reflects race standings | pass |
| Shared final scoreboard identical on both devices | pass |
| Only the host sees PLAY AGAIN | pass |
| Play Again: new seed, rounds cleared, both back in lobby | pass |

Sample of the identical-question property, captured simultaneously:

```
host  : ROUND 1 / 10  WHICH FLAG?  A Mexico  B Italy  C Zimbabwe  D Egypt
guest : ROUND 1 / 10  WHICH FLAG?  A Mexico  B Italy  C Zimbabwe  D Egypt
```

Verified per engine: Guess the Flag (`runTrivia`), Guess the Country
(`runVisualGame`), True or False and Guess Who (quiz loops).

## 4. Two-device behaviour (Reaction)

| Check | Result |
|---|---|
| No "Pass the device" gate in a room | pass |
| Each device plays only its own player | pass |
| GET READY signal fires simultaneously | pass — **1 ms apart** |
| Quickest tap wins, not the first write to arrive | pass |
| Both devices agree on winner and points | pass |

The signal timing was measured with a `MutationObserver` on each device:

```
host  TAP! at 1788114381797
guest TAP! at 1788114381798      →  1 ms apart
```

The fastest-wins rule was proven adversarially: the host submitted **first**
with a 480 ms tap, the guest submitted **second** with 210 ms, and the guest
won. Under a first-write-wins rule the host would have taken it.

## 5. QR code

Vendored `qrcode-generator` (MIT, Kazuhiko Arase), unmodified, credited in
`CREDITS.md`. Structural validation of the generated code:

| Property | Result |
|---|---|
| Module count 33 → version 4 (whole number, 1–40) | pass |
| Finder pattern top-left / top-right / bottom-left | pass, all three exact |
| Timing patterns, row 6 and column 6 | pass |
| 4-module quiet zone | pass |
| Dark-on-light regardless of app theme | pass |

`BarcodeDetector` was unavailable in the test browser, so decoding was not
verified programmatically. **Scanning with a real phone camera is still
outstanding** and is on the device checklist.

## 6. Offline guarantee

With `FF.FirebaseConfig = null`:

| Check | Result |
|---|---|
| PLAY TOGETHER button absent | pass |
| Firebase SDK never loaded (`typeof window.firebase === 'undefined'`) | pass |
| Zero external scripts | pass |
| Zero network requests to gstatic / firebase | pass |
| Transport refuses cleanly with a friendly message, no throw | pass |
| `FF.Race` calls are inert and never throw | pass |

## 7. Scope correction: Brain Battle

The spec claimed 18 raceable games. **The real number is 17.**

Brain Battle's format is *"each player gets their own run of rapid-fire
questions until they get one wrong"* — a personal streak run, not a shared
question. There is no "first correct answer" to compete for, so it cannot be
a race without redesigning the game. It is excluded from the online list, with
a comment in `js/net/roomUI.js` saying why. It is unchanged offline.

## 8. Defects found and fixed

Every one of these was caught by two-device testing, not by unit tests.

1. **`FF.Race.active()` was unreachable.** It required a session, but games
   check it *before* calling `begin()`, which creates the session. Rooms
   silently played turn-based. `active()` now means "in a room";
   `running()` reports session state.

2. **Devices dealt different questions from round one.** Games build shuffled
   pools and question `Bag`s during *setup*, not only per round.
   `GameFlow.start` now seeds before `def.start()` runs.

3. **A won round could settle as "nobody won".** The answer is written before
   the winner slot is claimed, leaving a window where every player had
   answered but no winner was recorded. `settle` no longer treats a round
   holding a correct answer as exhausted.

4. **Two devices could disagree about the same round.** Each judged timeouts
   from its own clock and latched the verdict. A round ending unwon now
   publishes a `NOBODY` sentinel, making the outcome a shared fact.

5. **A round nobody answered hung forever.** No answer means no write, so
   nothing woke the round watcher. Added a slow poll while a round is open.

6. **Every final scoreboard showed zeroes.** `finish()` tore down the race
   session before the results screen read the scores. The finished session is
   retained for scoring.

7. **Starting a game replayed the previous game.** Only `meta.status` was
   flipped, leaving old rounds in place, which settled the new game instantly.
   `FF.Room.startGame` clears rounds and takes a fresh seed.

8. **Exiting a game stranded the host.** The re-render called `showHome`,
   which calls `offAll()`, dropping the room's listeners while still in a
   room. The online view now returns to the lobby.

9. **The header scoreboard always read zero in a room.** It renders from local
   `FF.Scoring`. `FF.Race.syncScoring()` pushes derived scores into it.

10. **Dev transport did not match Firebase.** Firebase's `on('value')` fires
    immediately with the current value; the dev adapter only fired on later
    changes, so a device that subscribed after registering never saw its own
    write. Fixed, with a regression test.

11. **Two tabs shared one device identity**, because they share
    `localStorage`. Dev-rooms mode now keeps identity in per-tab
    `sessionStorage`, so the simulation is faithful.

Also fixed in the harness itself, before any product code: the vm sandbox
modelled `window` as a plain object, but in a browser `window` **is** the
global, so `window.FF = {}` must create a global `FF`.

## 9. Still outstanding

- Firebase project creation, security rules and domain authorisation
  (`FIREBASE_SETUP.md`) — owner's account.
- Deployment to `https://demo.brightappsoft.com/familygame/`, remembering that
  `js/net/firebase-config.js` is git-ignored and must be uploaded by hand.
- Real-phone checklist: QR scan, mobile data, 3+ devices, host disconnect,
  guest rejoin, team mode, 13th device refused, all 17 games end to end.

---

## 10. Live Firebase verification (added after setup)

Verified against the real project `family-fun-game`, Realtime Database in
`europe-west1`, from `localhost`.

| Check | Result |
|---|---|
| `FF.Net.configured()` with a real config | true, button appears |
| SDK loads lazily from CDN on first use | pass |
| Anonymous sign-in | pass |
| Create room over Firebase | pass |
| Lobby shows the host once the watch delivers | pass |
| Start game (clears rounds — host-only rule) | pass |
| Claim `startedAt`, write answer, claim `winner` | pass |
| Result screen: verdict, points, answer, scoreboard | pass |
| Stored round data matches the design exactly | pass |

### A serious defect in the original security rules

The rules originally shipped in `FIREBASE_SETUP.md` **enforced nothing.**

In Realtime Database a `.write` rule that grants access **cascades to every
child**, and deeper rules are never consulted. The original rules put a broad
`".write": "auth != null && …"` on the `$code` node, which granted write access
to the entire room subtree. The carefully nested per-path rules underneath were
decorative.

This was found by attempting each forbidden operation against the live
database. Every one succeeded:

```
STEAL winner (overwrite)          ALLOWED
CHANGE my answer after the fact   ALLOWED
FORGE another player answer       ALLOWED
REWRITE startedAt                 ALLOWED
```

Fixed by removing the room-level `.write` entirely and giving each write path
its own rule. Re-tested against the live database:

```
claim winner (first time)         ALLOWED   <- the app works
write my own answer               ALLOWED
create room meta (host)           ALLOWED
STEAL winner (overwrite)          DENIED
CHANGE my answer after the fact   DENIED
FORGE another player answer       DENIED
FORGE another player entry        DENIED
REWRITE startedAt                 DENIED
meta without required fields      DENIED
```

Reading the whole `rooms` collection is also denied, so rooms cannot be
enumerated — only a room whose 6-character code you already have.

The corrected rules were then confirmed not to break legitimate play: a full
game was created, started and played through a round against the live
database.

**Known edge case:** a room whose `meta` somehow lacks `hostUid` can never be
written again, because the host check cannot resolve. The app always writes
`hostUid` at creation, so this cannot occur through normal use — it only
affected a raw test node written by hand during this verification.
