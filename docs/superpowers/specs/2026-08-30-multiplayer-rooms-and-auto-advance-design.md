# Design: Cross-Device Multiplayer Rooms & Auto-Advance

**Date:** 2026-08-30
**Status:** Approved, ready for implementation planning
**Target deployment:** `https://demo.brightappsoft.com/familygame/`

---

## 1. Summary

Two changes to Family Fun:

1. **Shared rooms.** A host creates a room and shares a 6-character code (or link, or QR).
   Everyone who joins plays *the same game, the same questions, at the same time* on their own
   device. In a race game the first correct answer takes the point and the round advances for
   everyone.
2. **Auto-advance.** Question/answer games no longer require a "Next" tap between rounds, and
   the country games drop the post-answer country fact block.

These ship as two independently useful pieces. Auto-advance is implemented first because the
multiplayer round loop builds on the same advance mechanism.

### Non-goals

- Turn-based games (word, creative, party, memory, number, puzzle) are **not** multiplayer in
  this version. They keep their current single-device behaviour.
- No accounts, no login, no persistent player profiles across devices.
- No chat, no voice, no spectator mode.
- Offline `file://` play must keep working exactly as it does today.

---

## 2. Constraints from the existing codebase

These are load-bearing facts about the current app that the design must respect.

| Fact | Source | Consequence |
|---|---|---|
| Classic scripts, no modules, no build step | `index.html` | New code is plain `<script>` files attaching to `window.FF`. No bundler, no `import`. |
| Runs from `file://`, fully offline | `README.md`, app footer | Networking must be lazy-loaded and entirely optional. |
| All randomness funnels through `FF.util` / `FF.Random` | `js/core.js:118` | Deterministic question generation is a single-point change. Verified: **zero** direct `Math.random()` in `worldGames.js`, `visualGames.js`, `quizGames.js`. |
| Questions contain live DOM nodes | `worldGames.js:104` (`flagNode`), `visualGames.js` (`imageDOM`) | Questions **cannot** be serialised over the network without rewriting every builder. This rules out host-broadcast designs. |
| Two shared engines cover 11 of 18 target games | `runTrivia` (`worldGames.js:207`), `runVisualGame` (`visualGames.js:222`) | Most coverage comes from two edits. |
| Scoring/players/teams are local and in-memory | `js/scoring.js`, `js/players.js` | The room supplies a scorer roster in the same shape `FF.Scoring.init()` already expects. |
| Storage is a safe wrapper with memory fallback | `js/storage.js` | Reuse `FF.Storage` for identity persistence; it already degrades gracefully. |

### Target games (18)

| Engine | Games |
|---|---|
| `runTrivia` (worldGames) | `whereInWorld`, `mapChallenge`, `capitalChallenge`, `guessFlag` |
| `runVisualGame` (visualGames) | `guessCountry`, `guessLandmark`, `guessAnimal`, `guessFood`, `guessObject`, `guessSport`, `guessVehicle` |
| Bespoke loops (quizGames) | `familyQuiz`, `trueOrFalse`, `brainBattle`, `guessWho`, `pictureQuiz` |
| Bespoke loops (reactionGames) | `quickTap`, `colorReaction` |

---

## 3. Architecture

### 3.1 Chosen approach: seeded questions + Firebase as buzzer

The room stores a random **seed**. Every device seeds its RNG from it and independently generates
an identical question sequence — same country, same flag, same shuffled option order, same
A/B/C/D positions. The network therefore never carries a question, only *who answered what*.

**Why not host-broadcast:** questions hold live DOM nodes, so broadcasting them means rewriting
every question builder across 18 games to emit plain data and rebuild DOM on receipt. It is the
largest refactor, the most bandwidth, and it stalls the game when the host's tab closes.

**Why Firebase over MySQL:** MySQL requires hosting an API server alongside it, and the natural
client-server pattern for it is polling — which cannot reliably settle "who buzzed first". Firebase
Realtime Database pushes changes instantly, offers atomic transactions to arbitrate a tie, needs no
server of your own, and the free Spark tier covers family use. Realtime Database is chosen over
Firestore because its transactions on a single node are simpler and its pricing model suits many
tiny writes.

### 3.2 Per-round seeding

Round *N* is seeded with `hash(roomSeed, gameId, N)` — **not** one continuous stream.

This matters for robustness: question *N* depends only on *N*, never on how many random calls
preceded it. A device that joins mid-game, backgrounds its browser, drops a frame, or re-renders a
round still produces byte-identical output.

**Implementation.** `FF.util.shuffle/pick/sample/int` and `FF.Random.Bag` currently call
`Math.random()` directly. They will call `FF._rand()`, which is:

- `Math.random` normally (offline play is bit-for-bit unchanged), or
- a seeded **mulberry32** PRNG while a room round is active.

```js
FF.Random.seed(seedString)   // switch to deterministic mode
FF.Random.unseed()           // back to Math.random
```

`FF.Random.Bag` is seeded at game start with `hash(roomSeed, gameId, 'init')`. Its pool is shuffled
at construction and `next()` only pops, so it stays deterministic as long as each device makes the
same number of `next()` calls — which it does, since every device runs the same loop.

The two direct `Math.random()` calls in `reactionGames.js` (the "GET READY" delay) are routed
through the same source, so the signal fires at the same instant on every device. This is what
makes Quick Tap work as a genuine race.

### 3.3 Data model (Realtime Database)

```
rooms/
  ABC123/
    meta/
      seed:        "k4j2n9x1"
      gameId:      "guessFlag"
      status:      "lobby" | "playing" | "ended"
      mode:        "players" | "teams"
      appVersion:  "1.1.0"        # app.js footer bumps v1.0.0 → v1.1.0 with this work
      hostUid:     "<uid>"
      createdAt:   <server timestamp>
      expiresAt:   <server timestamp + 6h>
      config:      { difficulty, length, timer, rounds }
    players/
      <uid>/  { name, avatar, color, teamId, joinedAt, lastSeen, online }
    teams/            # only when mode === "teams"
      team1/  { name, color }
    rounds/
      3/
        startedAt: <server timestamp>
        answers/
          <uid>/ { choice: 2, correct: true, ms: 1840 }
        winner: "<uid>" | null
```

Note what is absent: no questions, no flags, no images. A full round is a few hundred bytes, so it
holds up on weak mobile data.

### 3.4 Settling a round

1. A device answers. It writes `rounds/N/answers/<uid>`.
2. If correct, it immediately runs a **transaction** on `rounds/N/winner`: set to own uid if
   currently `null`. First write wins atomically, so a photo-finish resolves identically everywhere.
3. If wrong, the device locks itself out locally. Other devices see the answer arrive and mark it.
4. The round is **settled** when any of:
   - `winner !== null`, or
   - every online, non-locked-out player has answered wrong, or
   - `now > startedAt + timer` (clock-aligned, see 3.6).

All three conditions are pure functions of the `rounds/N` node, so every device reaches the same
conclusion independently with no coordinator.

5. After the settle pause (~2s), the first device to get there sets `rounds/N+1/startedAt` with a
   set-if-null transaction. Everyone advances on the resulting event.

### 3.5 Scores are derived, never stored

Scores are recomputed by replaying `rounds/*/winner` plus the winner's `ms` for the speed bonus.
Nothing writes a score. This makes drift between devices structurally impossible — there is no
second source of truth to disagree with.

Point values reuse the existing per-game formulas (`computePoints` in `worldGames.js`,
`awardCorrect` in `quizGames.js`, etc.) so online and offline scoring match.

### 3.6 Clock alignment

Timer expiry needs a shared clock. Clients read Firebase's `.info/serverTimeOffset` once on connect
and apply it to all timestamp comparisons. `startedAt` is written with `ServerValue.TIMESTAMP`, so
every device measures the round from the same instant regardless of device clock skew.

### 3.7 Room codes

Six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `O/0/I/1` to avoid transcription
mistakes. Claimed with a transaction so two rooms cannot collide. Rooms carry `expiresAt`
(6 hours); security rules deny writes to expired rooms, and a host's client deletes its own room on
a clean exit.

### 3.8 Presence and rejoining

`onDisconnect()` marks `players/<uid>/online = false`; a 10-second heartbeat refreshes `lastSeen`.
Disconnected players render greyed out rather than disappearing, and are excluded from the
"everyone answered wrong" settle condition.

Identity (`uid`, name, avatar) persists in `FF.Storage`, so a locked phone or a dropped connection
rejoins the same room with its score intact — scores being derived, they reconstruct automatically.

### 3.9 Authentication

Firebase **Anonymous Auth**. It is free on Spark and gives each device a stable `auth.uid`, which
lets security rules enforce "you may only write your own answer node". `demo.brightappsoft.com`
must be added to Firebase's authorised domains.

---

## 4. The `FF.Race` boundary

Games never touch Firebase. They consult one small adapter:

```js
FF.Race.active()                      // are we in a room?
FF.Race.beginRound(n)                 // reseed RNG; resolve when the round opens
FF.Race.submit(choice, correct, ms)   // write answer; contest the winner slot
FF.Race.onSettle(cb)                  // cb({ winnerId, winnerName, answer, points })
FF.Race.lockedOut()                   // am I out of this round?
FF.Race.roster()                      // live scorer list for the scoreboard
```

Offline, `active()` returns `false` and every engine falls through to today's local behaviour plus
the new auto-advance. One branch point per engine, one interface to test.

**Isolation check.** `FF.Race` can be exercised with no Firebase, no network and no UI, against the
BroadcastChannel transport (§7.2). Games can be tested with a stub `FF.Race`. Neither needs the
other's internals.

---

## 5. User-facing flow

A new **PLAY TOGETHER 🌐** hero button joins Quick Play / Game Night / Quick Round on the home
screen. **It renders only when `firebase-config.js` holds a real config** — an unconfigured or
offline copy of the app shows no trace of it.

**Host:**
1. Choose Players or Teams mode.
2. Room is created; screen shows the 6-character code, a share link
   (`…/familygame/#room=ABC123`), a Copy button, and a **QR code** of the link.
3. Lobby lists joined devices live.
4. Host picks the game and settings, presses **START**.

**Guest:**
1. Opens the link (code auto-fills from the URL hash) or types the code.
2. Name and avatar pre-fill from their local `FF.Players` list; picks a team in team rooms.
3. Waiting room until the host starts.

**During play:** all devices show the same question simultaneously. A wrong answer greys out the
options with *"You're out — watch it play out"*; the round continues for everyone else. On settle,
every device shows the same result for ~2 seconds — *"🏆 Sarah got it — Portugal"* — then advances
together.

**After the game:** a shared results screen. The host can **Play Again** (same room, fresh seed) or
**Change Game** (back to the lobby). Guests follow automatically.

### QR code

Generated by a small QR encoder bundled locally in `js/net/qr.js` — **no CDN**, so it also works
when the app is served from a LAN without internet.

---

## 6. Auto-advance

### 6.1 The helper

`FF.Advance.after(ms, fn, opts)` in a new `js/advance.js`:

- Renders a thin progress bar during the result pause.
- **Any tap advances immediately**, so nobody waits when everyone is ready.
- Respects the existing pause button: pausing freezes the countdown rather than skipping the round.
- Cancels cleanly on unmount, game exit and restart.

Default pause: **2000 ms**.

### 6.2 Where it applies

**Auto-advance (question/answer):**

| File | Site |
|---|---|
| `js/games/worldGames.js` | `renderFeedback` Next button (~line 340) |
| `js/games/visualGames.js` | `showNext` (~line 253) |
| `js/games/quizGames.js` | lines ~326, ~464, ~845, ~974 |
| `js/games/reactionGames.js` | lines ~286, ~541 |

**Stays manual — all sites verified by reading the surrounding code:**

| File | Site | Why |
|---|---|---|
| `js/games/wordGames.js` | "▶ Next Player" (~425) | Explicit hand-off. |
| `js/games/wordGames.js` | "▶ Next Word" (~545) | TV display board, paired with "Reveal Answer". Self-paced by the room; auto-advancing would pull the word away mid-thought. |
| `js/games/wordGames.js` | "▶ Next" (~674) | Word Scramble result → next player, who must **type**. Requires physically taking the device. |
| `js/games/wordGames.js` | "▶ Next" (~1034) | Word Chain result → `advance()` moves to the next player, who must **type**. |
| `js/games/partyGames.js` | "▶ Next Round" (~270, ~411) | Round hand-off. |

The distinction: quiz/world/visual rounds are answered by **tapping one of four large buttons the
whole group can already see**, so the turn passing is not physical. Word games require typing, which
means the device genuinely changes hands.

**Reaction games are safe to auto-advance** despite being turn-based: `NEXT ▶` at
`reactionGames.js:286` leads to `intro(player)`, a *"Pass the device to X"* screen with its own
`▶ START` gate (`reactionGames.js:167`). Auto-advance lands on that gate, which still waits for a
human. In an online room the intro is skipped entirely, since each player has their own device.

### 6.3 Country information removal

Removed:
- The `q.fact` "Did you know?" block in `runTrivia`'s `renderFeedback` (`worldGames.js`), and the
  `fact` construction in its question builders.
- The country `factLines` in `guessCountry` (`visualGames.js`).

Kept: the correct/incorrect result, the correct answer text, and points earned.

Facts remain in `guessAnimal`, `guessFood`, `guessSport`, `guessObject`, `guessVehicle`,
`guessLandmark` and in Quiz explanations, since the request was scoped to country games.

---

## 7. Failure handling and verification

### 7.1 Failure modes

| Condition | Behaviour |
|---|---|
| `firebase-config.js` not filled in | PLAY TOGETHER button never renders. Offline app untouched. |
| SDK blocked or no connection | "Online play needs an internet connection." Returns to offline home. |
| Room code not found / expired | Clear message, return to join screen. |
| Room full (cap **12** devices) | "This room is full." |
| Network drop mid-game | "Reconnecting…" banner; answers queued locally and flushed on reconnect. |
| Stale cached client | `meta.appVersion` mismatch → blocking "Refresh to update" screen, rather than silent desync. |
| Host leaves mid-game | Game continues. Host controls transfer to the longest-connected device. |

### 7.2 Verification

No test framework exists in the repo. Verification is:

1. **`tools/test-seed.html`** — the critical one. Runs every question builder twice under the same
   seed and diffs the output; asserts mulberry32 conformance against known vectors. If this passes,
   desync is ruled out at the source.
2. **BroadcastChannel dev transport** — a second implementation of the same transport interface as
   Firebase, driving a full multi-device game across two browser tabs with no Firebase account and
   no internet. This is how race logic is tested before the Firebase project exists.
3. **Manual multi-device checklist** — real phones on real networks: join by code, join by link,
   join by QR, simultaneous answers, wrong-answer lockout, timer expiry with nobody answering,
   host disconnect, guest disconnect and rejoin, team mode scoring, play-again.

---

## 8. Files

**New**

```
js/advance.js                 FF.Advance — auto-advance helper
js/net/firebase-config.js     Config placeholder, filled in by the user
js/net/qr.js                  Local QR encoder (no CDN)
js/net/net.js                 Transport interface + Firebase and BroadcastChannel adapters
js/net/room.js                FF.Room — room lifecycle and state machine
js/net/race.js                FF.Race — the adapter games consult
js/net/roomUI.js              Create / join / lobby / shared-results screens
tools/test-seed.html          Determinism test harness
FIREBASE_SETUP.md             Step-by-step project setup
```

**Modified**

```
js/core.js                    Seeded RNG via FF._rand()
js/registry.js                GameFlow launch inside a room; pause ↔ FF.Advance
js/app.js                     PLAY TOGETHER hero button and online views
index.html                    New script tags
js/games/worldGames.js        Auto-advance; remove fact block
js/games/visualGames.js       Auto-advance; remove guessCountry factLines
js/games/quizGames.js         Auto-advance (4 sites)
js/games/reactionGames.js     Auto-advance (2 sites); seeded delay
```

---

## 9. Firebase setup (documented in `FIREBASE_SETUP.md`)

1. Create a Firebase project (free Spark tier).
2. Enable **Realtime Database**.
3. Enable **Anonymous** sign-in under Authentication.
4. Add `demo.brightappsoft.com` to Authentication → Settings → Authorised domains.
5. Paste the security rules (below).
6. Copy the web config into `js/net/firebase-config.js`.

Security rules enforce: anyone with a code may read the room; a player may write only their own
node and their own answer; nobody may overwrite a settled `winner`; writes to expired rooms are
denied.

---

## 10. Open items

None. All decisions are settled:

- Firebase Realtime Database over MySQL — no server to run, instant push, atomic tie-breaking.
- Seeded generation over host-broadcast — questions contain DOM nodes.
- Derived scores over stored scores — no drift possible.
- Wrong answer locks you out, others race on.
- ~2 second auto-advance, tap to skip.
- Players **and** Teams modes, chosen at room creation.
- QR code included, encoder bundled locally.
- Country fact block removed; correct answer retained.
