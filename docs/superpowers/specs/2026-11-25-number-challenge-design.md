# Number Challenge: the upgrade

Date: 2026-11-25. Rebuild of the existing game, id `numberChallenge` (kept),
name "Number Challenge". Branch `feat/number-challenge`, worktree from
origin/main at 977f433 (the OneDrive checkout is behind and git there fails
on `js`).

## Intent

Number Challenge is one of the last games still in its first version:
`js/games/numberGames.js` shows one sum with 4 answer buttons, Easy / Normal /
Hard, 10 rounds, the old client-side `FF.Race` online. Brighton wants it
upgraded "and made to be perfect", like the games rebuilt since November
(Say What?, What's Missing?, Logo Rush), and asked for new ways to play.

Success: a family picks a way to play on one phone or online, the sums feel
fair for their level, near misses are fun ("I was one off!"), and it looks
as good as Say What? and Logo Rush next to them.

## Brighton's decisions (2026-11-25)

- **Four ways to play:** Quick sums, Sprint, Chain, Make the target.
- **Answering:** 4 choices as standard; a new **Expert** level answers on a
  **number pad** (exact number), as `docs/expert-levels.md` asks.
- **No topic picker.** The level alone sets what maths comes up.
- **Levels:** Easy / Normal / Hard / Expert (contents below).
- **Online:** server referee + crew, like Say What? and What's Missing?.
- **Two looks,** the player picks: **Neon arcade** (default) and **Notebook**.
- **Local modes:** Solo and Turns (pass one phone). Teams is dropped.
- **Leaderboard and daily:** Quick sums on Normal only; other modes unranked.

## Goals

- The four modes, each with its own setup options, reveal and recap.
- Fair, varied sums per level, with smart wrong choices (the mistakes people
  really make), never two right choices.
- Expert on a number pad in Quick sums, Sprint and Chain; in Make the target
  Expert means "use every tile" (see below).
- Solo, Turns, and an online Race with a server referee and crew seats.
- Two looks, phone fit with no scrolling while answering (375 × 667),
  desktop layout from 900 px, light and dark app themes.
- The cover from Brighton (prompt pack `docs/art/numberChallenge-prompts.md`).

## Non-goals

- No topic picker (Brighton said level only).
- No Teams mode, no hints, no 50:50.
- No negative numbers, decimals or remainders in any answer. Fractions and
  percentages only ever give whole answers.
- No new art inside the game: looks are CSS and inline SVG. Only the cover is
  an image.
- No free text box. Answers come from choices, the pad, or target tiles.

## Anti-goals

- Changing how standard Quick sums scores. The all-time leaderboard holds
  scores from the old game; standard runs must score the same way (below).
- A choice list with two right answers, or a sequence that fits two rules.
- A target that cannot be reached with the tiles dealt.
- Sums on Easy or Normal that need paper.
- A Chain step that goes below 0, above 999, or leaves a fraction.
- Flat, plain screens. Judge it next to Say What? and Logo Rush.
- Scrolling on a phone while answering.

## Levels: what maths comes up

The level is the only control. Every answer is a whole number from 0 to 9999.

| Level | Quick sums / Sprint kinds |
|---|---|
| **Easy** | + and − within 20 · the 2, 5 and 10 times tables · missing number in + and − (`7 + ? = 12`) · count-on sequences (steps 1, 2, 5, 10) |
| **Normal** | + and − to 100 · × to 10 × 10 · exact ÷ from those tables · missing number (+ − ×) · sequences up and down (steps 2 to 10) · doubles and halves |
| **Hard** | + and − to 1000 · × to 12 × 12 · exact ÷ · missing number (all four signs) · two-step sums with order of operations (`4 + 3 × 5`) · 10 / 20 / 25 / 50 / 75 % of round numbers · ½ ⅓ ¼ ¾ of numbers they divide · squares 2² to 15² · sequences (steps, ×2, squares) |
| **Expert** | Hard's maths, answered on the number pad. +6 s per sum, +50 per right answer |

Weights for points: Easy 1, Normal 1.5, Hard 2, Expert 2 (+50 flat). These
match the old game's `bonusMultiplier`.

**Wrong choices** (3 per question, distinct, 0 or more, never the answer):
off by 1, off by 10, the wrong sign (`a + b` for `a × b`), left to right
instead of order of operations, digit swap (`54` for `45`), the term before
in a sequence. Filled from near numbers when a trap does not apply.
*(Claude's call.)*

**Sequences:** only the families above, and four terms shown. A test proves no
shown sequence fits two families with different next terms.

## The four ways to play

### 1. Quick sums (the standard)

The old game done properly. One sum at a time, beat the clock.

- Setup: **Sums** 10 / 15 / 20 (standard 10); **Time per sum** Quick 10 s /
  Normal 20 s / Relaxed 30 s / No limit (standard Normal); Expert adds 6 s.
- In play: big sum card, 4 choices (2 × 2) or the pad, timer ring, round
  counter, score, streak flame chip.
- One answer per sum. Timeout = wrong.
- **Points (unchanged from the old game):** right =
  `round((100 + speed) × weight)`, speed = 50 at 2 s or less, fading
  linearly to 0 at 15 s (the old `speedBonus`). Expert adds +50. No points for
  streaks in Quick sums, so standard scores stay comparable with the boards;
  the flame still shows and counts for the streak achievements.
  *(Claude's call, to keep the all-time board fair.)*

### 2. Sprint

As many as you can before the clock runs out.

- Setup: **Length** 30 / 60 / 90 s (standard 60).
- The sums come from a seeded list that gets harder as you go: tier 1 for the
  first 4 sums, tier 2 for the next 4, up to tier 5 from the 17th sum. A tier
  draws bigger numbers within the level's kinds. *(Claude's call: a fixed
  list, so everyone in a room gets the same sums in the same order.)*
- A right answer moves on at once. A wrong answer costs 3 s off your clock
  (2 s on Easy), shows the right answer for a moment, and moves on.
- Points: right = `round((10 + 10 × tier) × weight)`, Expert +5 per right.
- The list is 150 sums long. Nobody reaches the end, but if someone does,
  their sprint ends.
- Screen: a big countdown bar across the top that flashes red as time is lost,
  right count, current tier as 1 to 5 pips.

### 3. Chain

Keep the running total in your head.

- A start number shows, then steps appear one at a time (`+ 4`, `× 2`,
  `− 5`, `half it`). Each step replaces the one before, so only the current
  step can be seen. After the last step: `= ?`, then choices or the pad.
- Length by level: Easy 3 steps (+ − up to 10, start up to 10), Normal 5 steps
  (+ − up to 20, × 2, × 3, half when even), Hard and Expert 7 steps (+ − up to
  50, × 2 to × 5, exact ÷, double, half). Every value along the way stays whole,
  0 to 999.
- Setup: **Chains** 5 / 8 / 10 (standard 5); **Speed** Steady (2.2 s a step) /
  Fast (1.4 s a step). The answer clock after the last step: 10 s, Expert 16 s.
- Wrong choices for a chain: the total with one step skipped, the value
  before the last step, off by the last step's number, off by 1 or 10.
- Points: right = `round((100 + 10 × steps + speed) × weight)`, speed up to 50,
  linear over the answer clock. Expert +50.
- Reveal: the whole chain written out with each value
  (`6 → +4 → 10 → ×2 → 20 → −5 → 15`).

### 4. Make the target

Combine number tiles to hit a target.

- Tiles and targets by level:
  - Easy: 4 tiles from 1–10, target 10–30, + and − only.
  - Normal: 5 tiles, four from 1–10 and one of 10 / 20 / 25, target 20–100,
    + − ×.
  - Hard: 6 tiles, four from 1–10 and two from 25 / 50 / 75 / 100, target
    101–500, all four signs.
  - Expert: as Hard, and using **every** tile to hit the target exactly
    earns +50.
- Every target is built from a random expression over the dealt tiles, so it
  can always be reached (Expert targets always use all 6). A target never equals
  a tile or a single sum of two tiles. *(Claude's call.)*
- How to play: tap a tile, tap a sign, tap another tile. The two merge into a
  new tile with the result, and a work line shows `25 × 4 = 100`. Results must
  be whole and above 0 (÷ only when exact; − only when the result is above 0).
  **Undo** steps back one merge, **Clear** starts over. A tile equal to the
  target glows and submits itself, except on Expert, where it submits itself
  only when it is the last tile left; a hit with tiles to spare glows, and the
  player presses Done (no bonus) or Undo to look for the all-tiles route.
  *(Claude's call.)* **Done** submits the tile nearest the target at any time.
  When the clock ends, the nearest tile is submitted.
- Setup: **Targets** 3 / 5 / 8 (standard 5); **Time per target** Quick /
  Normal / Relaxed / No limit = 0.75× / 1× / 1.5× of Easy 45 s, Normal 60 s,
  Hard 90 s, Expert 120 s.
- Points: exact = `round((100 + speed) × weight)`; off by 1 to 5 (1 to 2 on Easy)
  = `round(50 × weight)`; off by 6 to 10 (3 to 5 on Easy) = `round(25 × weight)`;
  further = 0. Expert +50 for an exact hit using every tile. *(Claude's call.)*
- Reveal: your closest tile and how far off it was, then "One way:" with the
  generator's own solution as steps.
- No pad or choices in this mode. Expert changes only the all-tiles bonus.

## Modes

- `modes: ['solo', 'turn']` locally, plus `room` online.
- **Solo:** one player, the run as set.
- **Turns:** pass one phone. Quick sums, Chain and Make the target take turns
  item by item (Ama's sum, then Kofi's...), with a short "Kofi's turn" banner
  and a Go button between turns. Sprint takes turns per whole sprint, with a
  "Pass to Kofi" card. Each player gets **their own** items, **matched** in kind
  and tier to the other players' items for that turn, so nobody gains from
  watching the player before. *(Claude's call: in the brainstorm the option said
  everyone gets the same sums, but whoever played second would already know
  the answer.)* Each player has their own streak.
- **Online Race:** everyone gets the same item at the same moment. Each player
  answers once per item; the round closes when the clock runs out or everyone
  has answered; then the reveal shows everyone's answer. Sprint online is one
  60 s (or 30 / 90 s) sprint: everyone works through the same list at their own
  pace, each phone shows a live progress strip of every player, and the reveal
  ranks them.
- Rooms allow every mode and every level. Rooms always use a clock (no
  "No limit"). Room settings: Mode, Level, Time (per mode), Length (per mode),
  Chain speed. 2 to 8 players. *(Claude's call.)*

## Daily, challenge, leaderboard, celebrations

- `leaderboard: true`. `R.STANDARD = { mode: 'quick', level: 'normal',
  time: 'normal', rounds: 10 }`. Any other setup sets `config.customRules`
  (unranked), as Say What? does.
- Daily, challenge and celebration-library runs (`config.daily` /
  `config.challenge`) skip the setup screen and play `R.STANDARD` from the seed,
  as Say What? does.
- Deals use only the seeded random (`FF.Random` / the passed seed), never
  `Math.random`, and add the game to `tools/test/sharedDeal.test.js`.
- Achievements as before: `streak5`, `streak10`, `perfect`.

## The two looks

One layout; looks change tokens and a few decorations through
`data-nc-look="arcade|notebook"` on the game root. CSS prefix `nc-`, tokens
`--nc-*` in `css/tokens.css`, rules in `css/games.css`. Remembered per device
(`numberChallenge:look`), the player's own choice like SortRush's look.

- **Neon arcade (default):** dark stage, deep ink `#0E1024` to plum `#1C1040`,
  faint scanlines. The sum in big glowing digits: numbers in cyan `#22D3EE`,
  signs in pink `#F472B6`, the `?` in gold `#FACC15`. Choices are chunky arcade
  keys with coloured neon rims and a pressed shadow. Timer is a neon ring. Right:
  green `#4ADE80` burst and the key lights up; wrong: a red flicker and shake.
  Target tiles are glowing hex-cut chips. It must not copy Number Rush's spinning
  rings.
- **Notebook:** graph paper, off-white `#FBFAF5` with a faint blue grid
  `#CFE3F5` and a red margin line `#E25B5B`. Digits in Patrick Hand (already in
  `css/fonts.css`), pencil grey `#2F3437`. Choices are sticky notes (yellow,
  pink, blue, green) with a soft shadow. Right: a red-pen tick and a circle
  drawn round the answer (SVG stroke animation); wrong: a red cross. Pad keys
  look like eraser blocks. Target tiles are torn paper squares.
- Both pass the contrast check in light and dark app themes; the stage keeps
  its own background in both. Respect reduced motion (no shakes or drawn strokes,
  only colour).

## The number pad (Expert)

A game-local component (`nc-pad`): keys 1 to 9, 0, ⌫ and ✓, 3 × 4 grid, big
enough for thumbs. A physical keyboard types digits, Backspace and Enter. The
answer box shows what is typed (up to 4 digits; the box never hints at the
answer's length). One go per question: ✓ locks it in. *(Claude's call: a
shared `FF.NumberPad` is not needed until a second game wants one.)*

## Screens

- **Setup** (the game's own, like Say What?'s card): a How to play strip, then
  **Way to play** as four big tiles with a glyph and one line each (Quick sums,
  Sprint, Chain, Make the target), **Level** (4 buttons), then the chosen mode's
  options (Time / Length / Speed), **Look**, and a big Start. Saved to
  `numberChallenge:setup:v1`.
- **Play:** top bar with the "Number / Challenge" brand in two tones, mode
  chip, round counter or sprint bar, timer ring, score, flame. Then the
  question card, then the answer panel (choices, pad, or tiles and signs).
  Phone fit as Say What?'s `fitPhone()`. Desktop from 900 px: card left, panel
  right.
- **Reveal:** the right answer drops into the `?` (gold in arcade, red-pen
  circle in notebook), points pop and count up, and GameFlow moves on
  automatically as in Say What?.
- **Recap:** score ring, right count, best streak, and a mode line (Sprint:
  sums per minute; Target: exact hits). Then "Sums to check": every missed item
  with its right answer, chains written out, targets with one solution. Confetti
  on a new best.

## Build

### Files

- `js/numberchallenge/rules.js` (`FF.NumberChallengeRules`): pure, shared by
  the screen, the referee and the crew. `MODES`, `LEVELS`, `TIMES`, `ROUNDS`
  (per mode), `STANDARD`, `MAX_PLAYERS`, `MIN_PLAYERS`, `sanitize`,
  `sanitizeRoom`, `isStandard`; seeded `deal(settings, seed, count)` per mode,
  `matched(item, seed, k)` for Turns; `question(kind, level, tier, rand)`
  returning a structured item (`{ kind, a, op, b, ... }`) and its `text`;
  `choices(item, rand)`; `chain(level, rand)`; `target(level, rand)` with its
  solution; `check(item, text)`; `replay(tiles, steps)` for targets;
  `solve(item)` (what a person would work out, used by the crew);
  `points(...)` per mode. A scoring table at the top of the file.
- `js/games/numberChallenge.js`: the screen (frame, setup, play per mode,
  reveal, recap, Turns banners, looks, pad). Reuse GeoSpin's exported
  `timerRing` / `countUp` where they fit, as Say What? does.
- `js/numberchallenge/referee.js`, `client.js`, `dev.js`: the online Race,
  mirroring `js/saywhat/*`. View `rooms/<code>/nc`, inbox `ncInbox`. Phases:
  `starting → ready → (steps) → open → reveal → ended`; Sprint is one round
  with per-player progress in the view. Answers travel as strings: a number
  `'42'`, target steps `'25*4,100+7=107'`. The referee checks with the same
  `check` / `replay`, times by the database clock, keeps streaks, and scores.
  Chain steps are published one at a time at their times, so the whole chain
  is never readable early.
  **Sprint online is the exception** *(Claude's call)*: waiting for the server
  after every sum would add a visible pause to each one, and a sum can be worked
  out by anyone who sees it anyway. So, like SortRush's Timed Score, the referee
  publishes the Sprint list (structured sums and their choice order, no
  answers) when the sprint opens. The phone marks each answer at once, takes its
  own penalties, and sends answers in order (`{ i, text }`, batched at most
  every 500 ms). The referee re-checks every answer in order against the same
  list, applies the penalties itself, refuses anything after that player's own
  end time (open time + length − 3 s per wrong + grace, by the database clock),
  and its score is the one that counts. Live progress in the view comes from
  the referee's count. The screen draws a phase only when
  `FF.NumberChallengeClient.ready(view)`.
- `api/lib/NumberChallenge.php`: settings lists matching `rules.js` (a PHP test
  compares them), start checks like `SayWhat.php`. Wired in `bootstrap.php`,
  `Routes.php`, `EngineRoutes.php`, `Db.php`, `api/cron.php`; runner
  `numberchallengeRuns` / `numberchallengeState`.
- Crew: a brain `js/crew/brains/numberChallenge.js` modelled on
  `sayWhat.js`. It works out answers with `R.solve` from the view, misses on
  purpose by the seat's accuracy (picking a likely wrong choice, or a pad typo
  near the answer), and takes a reaction-based time. Sprint: a pace per sum from
  the seat's reaction. Target: a small search over the tiles; strong seats find
  the exact target, weaker ones submit a near tile. Remove `numberChallenge` from
  `js/crew/brains/quiz.js`'s list. Wire `api/crew/lib/loader.js` and
  `api/crew/runner.js`. `Crew::ONLINE_GAMES` / `Crew::GAMES` and
  `roomUI.js` `ONLINE_GAMES` already name it; check they still fit.
- `database.rules.json`: `ncInbox` rule **added by hand** after `swInbox` (no
  generator covers inboxes).
- Remove `js/games/numberGames.js` (it now holds only Number Challenge) and its
  script tags in `play.html`, `admin.html`, `tools/test-seed.html`,
  `tools/load-check.js`; add the new files there. Update
  `tools/test/watchGames.test.js` (watching follows what Say What? does).
- `FF.registerGame`: id `numberChallenge`, category `numbers`,
  `leaderboard: true`, `room`, `modes: ['solo', 'turn']`, new description and
  how-to-play. Icon in `js/icons.js` stays `hash`. i18n strings with English
  fallbacks, keys prefixed `nc`.
- `docs/expert-levels.md`: move Number Challenge to Done in the same commit as
  Expert.
- Cover: the build does not wait for it, **the merge to main does**. When
  Brighton's `assets/playmona_assets/number-challenge/cover.png` lands:
  `tools/art/numberChallenge.json`, `python tools/process-game-art.py
  numberChallenge`, `node tools/gen-asset-manifest.js`, and the cover test.

Before starting, check no `nc-` CSS class, `nc` i18n key or `ncInbox` path is
already in use outside the old `numberGames.js`.

### Tests

- `tools/test/numberChallenge.test.js`: deals are seeded and repeatable for every
  mode and level; every answer is a whole number 0–9999; choices are 4 distinct
  values with exactly one right; no sequence fits two families; chain values stay
  whole within 0–999; every target is reachable by its own solution, never equals a
  tile or a two-tile sum, and Expert solutions use all tiles; `replay` refuses
  missing tiles, non-whole results, 0 or negative results; matched Turn items share
  kind and tier; points tables, including that standard Quick sums scores exactly
  as the old formula; `STANDARD` and `isStandard`; the cover exists.
- `tools/test/numberChallenge.referee.test.js`: phases per mode, one answer per
  item, late answers refused, Sprint in-order answers and time penalties per
  player, Chain steps published on time, target steps replayed and scored.
- `tools/test/numberChallenge.brain.test.js` and
  `tools/api/numberChallenge.test.php`.
- `tools/test/sharedDeal.test.js` includes the game.

## Verification

- `node tools/test/run.js` and `php tools/api/test.php` pass.
- Preview `/play`: each mode at each level, both looks, choices and the pad,
  a timeout, a long streak, Sprint penalties, a Fast chain, a target hit exactly
  and one submitted close, Expert all-tiles bonus; Turns with 3 players; a daily
  run and a challenge link; phone 375 px and desktop 1280 px; light and dark
  app themes.
- Two-tab dev room for each mode (two-tab testing notes): same items in both
  tabs, the server scores, a crew seat answers.
- PR, then merge to main deploys, publishes rules and restarts the crew.

## Left to the builder

Exact sizes, colours within the look descriptions, animation timings, glyphs on
the mode tiles, the tier number ranges inside each level, the distractor order,
crew brain numbers, and how the Sprint progress strip is drawn.
