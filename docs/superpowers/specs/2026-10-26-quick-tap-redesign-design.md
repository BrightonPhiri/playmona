# Quick Tap redesign

## Intent

Quick Tap was added to test the platform. It is a plain dark screen with one circle
that turns green, and a list of times at the end. Brighton wants it to be an
awesome, modern reflex game that **plays online with several people at once**.

A throwaway prototype at `.superpowers/quicktap-spike/index.html` (git-ignored,
served at `http://localhost:8960/.superpowers/quicktap-spike/`) was built and
played. Brighton's verdict: "I actually love it, let's implement it". **The
prototype is the reference for look, feel and flow.** Where this document and the
prototype differ, this document wins. The prototype's bots, `window.__goAt` and
synthesised sounds are prototype-only.

## Goals

1. The four moments of a reflex game feel great:
   - **The wait:** a calm dark arena, a slow breathing ring, "Wait…", and a soft heartbeat.
   - **The signal:** the whole arena floods green, with a starburst and a huge "TAP!".
   - **Instant feedback:** a big millisecond time, a speed rating, and a meter against the average person.
   - **The payoff:** standings between rounds and a podium at the end.
2. **Online rooms:** everyone in a room gets the signal at the same shared instant,
   sees the others' taps land live in lanes, sees the same standings after each
   round, and ends on the same podium.
3. **Fair, exact timing:** time from when the signal is shown to the *touch* (pointerdown),
   not the lift. The current game times to `click` (finger lift) and `Date.now()`,
   which adds roughly 80–120 ms to every score.
4. Difficulty changes play, as in Guess the Animal:
   - **Easy:** a 2–4 s wait.
   - **Normal:** a 1.2–5.5 s wait.
   - **Hard:** normal's wait plus 1–2 decoy flashes (blue, or amber) that count as a false start if tapped.
5. Its own cover art in a new look: bold neon and electric, unlike Guess the Animal's
   photos and the older lamp-lit covers. Made through the usual Codex prompt pack.

## Non-goals

- New ways to play beyond the prototype, such as tap targets that move or several signals per round.
- Leagues or rankings across rooms. The personal best is per account, on the device.
- Changing Color Reaction, which lives in the same file.

## Anti-goals (a failure even if it works)

- Network delay deciding who wins. Times must compare fairly across devices.
- The signal shown by colour alone. The shape (starburst) and the word change too.
- A phone that waits forever because one player never taps.
- Motion for players who switched on "reduce motion". No shake, burst or confetti then.
- Breaking the design-system rules in DEV_GUIDE.md. Details are under Constraints.

## How it plays

### Modes (existing `modes: ['solo', 'turn']`, plus rooms)

- **Solo:** one player, 5 rounds.
- **Pass and play** (`turn`, several players on one device): each player in turn
  gets a hand-over screen ("Brighton, you're up", a big avatar, tap to start), a
  3-2-1 countdown, then their 5 rounds. After everyone has played comes the
  results screen with the podium.
- **Online room** (`FF.Race.active()`): each device plays only its own player.
  Every round is played by everyone at once:
  1. A 3-2-1 countdown before round 1.
  2. The wait (with decoys on hard), the shared signal, and live lanes for every player.
  3. After a short pause, **round standings** for all: the round's verdict ("You took it!", "Kai was fastest", or "Everyone jumped the gun"), the order, each player's round time or "too soon", medals for the top three, total points with "+gain", and arrows from round 2 on.
  4. Auto-advance to the next round with the existing `FF.Advance.button` countdown.
  5. Podium and player cards at the end.

The round count comes from `FF.GameLength.rounds(api, 5, 0)`, a default of 5
(today it is 3). Online, `FF.Race.plan` / `timeUp` behave as they do today.

### A round, step by step

- **Wait:** 2–4 s on easy, 1.2–5.5 s on normal and hard. Hard adds 1–2 decoys, each
  shown for 380 ms at a random point in the wait, with at least 400 ms clear before
  the signal. The wait and the decoy times come from `FF._rand()` **after**
  `FF.Race.beginRound(n)` seeds the round, so every device in a room gets the
  same schedule. Offline it is just random.
- **False start:** a tap during the wait or a decoy. The screen turns red and shakes
  (unless reduce motion is on), "Too soon!" appears, and on a decoy "That flash was
  a decoy". The round records no time. Online, the player stays on the round as
  "Out this round, watch the others…" and their lanes keep updating.
- **Signal:** the arena turns green, with a starburst and "TAP!", a sound and a
  25 ms vibration. The start time is taken when the signal is shown and refined on
  the next animation frame **only if no tap has arrived yet**. This is the
  prototype's fixed approach: a hidden tab holds animation frames back, so the
  signal must never wait for one.
- **Tap:** `pointerdown` anywhere in the arena, or the Space key on `keydown`. The
  time is `event.timeStamp − signalAt`, in whole milliseconds. Show the time, the
  speed rating, a "New personal best" with confetti when it is one, and the meter.
- **Miss:** no tap within 2.5 s of the signal counts as a miss (no time). This also stops online rounds hanging.

### Speed ratings

Under 180 ms is Lightning, under 230 Rocket, under 280 Quick, under 350 Steady,
and anything slower is Sleepy. The meter runs from 100 to 600 ms with an
"Average person 250" marker.

### Scoring

- **Offline (solo and pass and play):** each valid try scores by its rating
  (Lightning 300, Rocket 250, Quick 200, Steady 150, Sleepy 100), times the existing
  difficulty bonus (easy 1, normal 1.5, hard 2). A false start or miss scores 0.
  Per-player best, average and the list of tries go to `api.end` the same way they do today.
- **Online:** points by place in each round. The fastest valid tap gets 300, then
  200, then 150, and every other valid tap 100, times the difficulty bonus. False
  starts and misses get 0. Ties share the higher place.
  - This needs a new race mode, `'ranked'`, in `js/net/raceRules.js` and `js/net/race.js`:
    - It settles like `'fastest'` (once everyone has answered, or on timeout).
    - The winner is `fastestOf`.
    - `scores()` awards each correct answer its place points via `pointsFor(answer, place)`.
  - Unit tests go in `tools/test/raceRules.test.js`.
  - `'fastest'` stays as it is for any other game using it.
- **Personal best:** the best valid time per difficulty, kept with
  `FF.Storage.set('quickTapBest', { easy, normal, hard })` (account-scoped by the
  storage layer). It's shown on the start screen and in the arena's top bar.

### Online wiring (existing pieces to reuse)

- `FF.Race.begin('quickTap', { rounds, mode: 'ranked', timerMs: 12000, pointsFor })`.
  The 12 s timer is a safety net: the longest hard wait (about 6.7 s) plus the 2.5 s
  miss window, plus margin.
- Each round: call `FF.Race.beginRound(n)`, draw the round's random schedule, then
  open with `FF.RaceUI.gate`/`FF.Race.whenOpen`, so the wait starts at the shared
  open instant on every device.
- Submit with `FF.Race.submit(null, true, ms)` for a valid tap, and
  `FF.Race.submit(null, false, null)` for a false start or miss. The recorded `ms`
  is this device's own measured reaction time (signal shown to touch), not
  `msSinceOpen`, so network delay never enters it.
- **Live lanes:** subscribe with `FF.Room.on('rounds', …)` and read
  `FF.Room.current().rounds[n].answers`. Each lane shows a player's avatar and name
  (`FF.Room.racePlayers()`), then "…", their time, or "too soon". Unsubscribe when
  the round ends.
- **Standings:** on `FF.Race.onSettle`, build the standings screen from
  `FF.Race.scores()` and the round's answers, then call `FF.Race.syncScoring()` so
  the shell's header scores match.
- **Watchers:** keep `FF.Race.describe({ kind: 'card', text: … })` each round. The
  watch-page tests require it.
- **Rejoin and catch-up:** follow the current pattern. While
  `FF.Race.catchingUp()`, skip the standings for rounds already finished.

## Constraints (house rules)

- Classic-script ES5 in `js/games/reactionGames.js`, with no modules and no new libraries.
- **Looks** go in `css/games.css`, with a `qt-` prefix, and colours come only from
  `css/tokens.css`. Add tokens for the signal green, the decoy colours and the
  medal colours to both themes if none fit, then run `node tools/contrast-check.js`.
  Inline styles are only for computed geometry: the meter position and the bar heights.
- No `<style>` injection, and no inline style objects for looks.
- Strings go through `FF.t(key, fallback)`, in sentence case, with no emoji in buttons.
- Sounds go through `api.audio.play`. The existing sounds cover most moments
  (`countdown`, `tap`, `wrong`, `correct`, `winner`). Add a soft `heartbeat` entry
  to `js/audio.js`, and keep it subtle.
- Confetti uses the existing `js/confetti.js`.
- The arena is the game shell's content area, not the whole page, so the shell's
  header (quit, pause, scores) stays usable.
- Accessibility:
  - The arena is a focusable element with `role="button"` and a neutral label.
  - An `aria-live` region announces "Wait", "Tap now", the time and the rating.
  - `FF.Nav.modality` rules apply.
  - Reduce motion turns off the shake, the burst scaling and the confetti.

## Left to the builder

- **Pause:** what happens to a round in progress. A suggestion: offline, the round
  restarts after resume; online, pausing already means "stepped out", and the shell
  handles it.
- Exact CSS values and animation timings, matched to the prototype.
- How the pass-and-play hand-over handles one player only (skip it, as today's
  "Ready when you are").
- Test shape. At least:
  - Pure helpers: the rating, points, and a round schedule that is the same for the same seed.
  - The new `'ranked'` race rules.
  - The existing watch and race tests still passing.

## Decisions made while building (after the review)

- **The signal times from the shared open instant.** Online, each device times the
  wait and the decoys from the room's shared open instant (`FF.Race.msSinceOpen()`
  at `whenOpen`), not from when it got there. A device that arrives after the signal
  sits the round out ("sat out").
- **Standings auto-advance after a fixed 5 s**, whatever each player's own
  auto-advance setting, so the room moves on together. The podium waits 8 s
  online; offline it waits for a tap.
- **No extra 3-2-1 online:** the room's own countdown already runs. Offline, each
  player gets a hand-over and then a 3-2-1.
- **The hard wait** is the normal wait plus 600 ms, so about 6.1 s at most.
- **Personal bests** are kept per player profile and difficulty in
  `quickTapBest[playerId][difficulty]`. Confetti appears only when an existing best
  is beaten.
- **Team rooms:** the lanes and standings show individual players, and the shell's
  header shows the team totals through `syncScoring`.
- **Ties** share a place and the next place is skipped (1, 1, 3).
  See `FF.RaceRules.placesOf`.
- **Answers carry a `kind`** (tap, early, decoy, miss or late), so the lanes and
  standings say "too soon", "missed" or "sat out".
- **No all caps:** the signal reads "Tap!" and the badge reads "New personal best",
  per DEV_GUIDE.
- **Quick Tap shows its own podium**, then hands over to the shell's results screen.

## Cover art

`docs/art/quickTap-prompts.md` is a Codex prompt pack for one 1024×1536 portrait
cover (bold neon and electric, a hand striking a glowing button or lightning, no
text). It is processed with `tools/process-game-art.py` and a
`tools/art/quickTap.json` spec that has a cover only. The game can ship before the
cover, which falls back to the category colour as it does today.
