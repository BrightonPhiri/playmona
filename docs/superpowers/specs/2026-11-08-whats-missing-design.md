# What's Missing? rebuild: design

Date: 2026-11-08. Game id stays `whatsMissing`, name stays "What's Missing?".

## Intent

What's Missing? is one of PlayMona's oldest games and still looks it: a row
of 5–9 emoji, one turns into "?", pick it from 4. Brighton wants it rebuilt
to the standard of GeoSpin: premium look, real depth, fair online play.
The new cover (`assets/images/covers/whatsMissing.webp`, a glossy 3x3 tile
grid with an empty cat tile in the middle) sets the look: the game should
feel like that picture come to life.

Success: a family plays it on one phone or in a room and it feels like a
polished mobile puzzle game. The tiles are glossy, the vanish is magical, the
twists keep you guessing, and nothing about it says "old emoji game".

## Goals

- Glossy picture tiles in a grid, like the cover, using the 192 Memory Match
  pictures (`js/data/memoryDecks.js`, art in `assets/images/games/memoryMatch/<id>.webp`).
- Four twists: **Gone**, **Added**, **Swapped**, **Several gone**.
- Levels set by how many pictures there are, plus an Endless mode.
- Choices to pick from, plus an Expert level that spells the answer.
- Points for correct answers, plus speed and streak bonuses.
- Online rooms run by a server referee, like GeoSpin and SortRush.
- A vanish animation, sounds, and picture themes.
- Fits a phone screen with nothing to scroll.

## Non-goals

- No new art. Pictures are the existing Memory Match cards; tiles, outlines
  and sparkles are CSS.
- No themed scenes (a room or beach where things vanish). Brighton picked tiles.
- Endless does not run in online rooms.

## Anti-goals

- Anything that looks flat or emoji-like. Brighton dislikes flat and
  symbol-heavy pieces (SortRush feedback): judge the look against the cover.
- A phone deciding what counts online. The referee decides.
- Breaking fairness: daily, challenge and room deals must come only from the
  seed, never from `Math.random` or localStorage while dealing.

## Brighton's decisions

- **Pictures:** picture tiles in a grid, from the Memory Match pictures.
- **Twists:** all four, Gone, Added, Swapped and Several gone.
- **Levels:** Easy = 4 pictures, Normal = 6, Hard = 8, Expert = 10+.
  **Endless** starts at 3 pictures and grows.
- **Answering:** pick from choices (4/6/8 is a setting, like GeoSpin), plus
  Expert, where you spell the name with the shared letter tiles.
- **Study time:** a fixed seconds setting picked by the host.
- **Scoring:** a correct answer earns points, plus a speed bonus and a streak multiplier.
- **Polish:** the vanish animation (like the cover), sounds, and picture themes.
- **Online:** a server referee.
- Brighton confirmed these Claude guesses:
  - Expert starts at 10 and adds one picture per round, up to 16, and spells the answers.
  - Endless grows by one picture for each correct answer, ends on the first miss, and is solo only.
  - Several gone shows up only from Hard up.

## How a round plays

1. **Study.** The grid appears (tiles pop in, with a soft `flip` per tile).
   A ring or bar counts down the study seconds. Solo and pass-and-play also
   have an "I'm ready" button. Rooms reveal at the same server instant for everyone.
2. **Change.** Tiles flip face-down, or a short shimmer covers the grid
   (builder's call). Then the twist happens and the grid comes back:
   - **Gone:** one picture has dissolved (sparkles and little glowing squares
     rising, like the cover). Its tile is empty, with a glowing dashed outline.
     Question: "What was here?"
   - **Added:** every picture is back, plus one new one in a tile that was
     empty before. Question: "Which one is new?" Tap a tile.
   - **Swapped:** two pictures have traded places. Question: "Which two
     swapped?" Tap two tiles. The second tap submits.
   - **Several gone:** 2 or 3 tiles are empty. Question: "What was in each
     gap?" Fill the gaps one by one: the active gap glows, and you pick or
     spell its picture, then move on to the next.
3. **Answer.** The answer clock is `api.config.timer` (standard 20 s). In a room
   the referee's round clock is used instead.
4. **Reveal.** Right answers turn green and wrong ones red. The real
   picture flies back into its gap, or swapped pictures slide home, or the
   newcomer pulses. Then the points show, with the streak count.

### Board layout

- The board is a grid of fixed **slots**, a few more slots than pictures, so
  some slots start empty. Empty slots look like faint recessed tiles. That way
  Added has somewhere to appear, and the layout never shifts between study and answer.
- Suggested grid by picture count (builder may tune):
  - 3–4 pictures: 3x2
  - 6: 3x3
  - 8: 4x3
  - 10–12: 4x4
  - 13–16: 5x4
  - Endless past 16: 5x5, then 6x5, capped where tiles still fit a phone.
- Gone and Several gone empty a filled slot. Added fills an empty slot.
  Swapped trades two filled slots.

### Which twists appear

| Level | Pictures | Twists mixed in |
|---|---|---|
| Easy | 4 | Gone, Added |
| Normal | 6 | Gone, Added, Swapped |
| Hard | 8 | Gone, Added, Swapped, Several gone (2) |
| Expert | 10, +1 a round, up to 16 | all, Several gone up to 3 |
| Endless | 3, +1 per correct | unlock as it grows: Swapped from 6, Several gone from 8 |

- The first round of a game is always Gone, so new players learn the basic idea.
- After that the twist is seeded: no twist three times in a row.
- A **Twists** setting offers "Mix" (standard) or "Gone only", for little kids.

### Answers

- **Choices** (Gone, Several gone): the setting gives 4, 6 or 8 picture
  buttons. Decoys come from the same theme deck, and are never a picture that
  is still on the board. With Several gone, every gap's choices include all
  the missing pictures, so getting the order right is part of the challenge.
- **Expert** (Gone, Several gone): spell the picture's name with
  `FF.SpellTiles`, checked by `FF.AnswerMatch`, as in `docs/expert-levels.md`.
  Added and Swapped stay tap-based even on Expert.
  - Names come from memoryDecks. Add a small alias list next to the decks
    (for example `js/data/memoryAliases.js`: "Hotdog", "Ice-cream", "Doughnut"
    for Donut). An alias must never belong to two cards.
  - Picture names longer than 14 letters, or with characters the tiles can't
    spell, are left out of Expert boards.
  - Move What's Missing to Done in `docs/expert-levels.md` in the same commit.
- **Added:** tap one tile. **Swapped:** tap two tiles. Tapping a selected
  tile again deselects it. **Claude's call:** the tap order doesn't matter,
  and Swapped is all or nothing (both tiles right, or no points and the
  streak breaks).
- **Claude's call: decoys in Mix** come from the deck(s) of the pictures on
  the board, so decoys look like the real answer. Once the daily game uses
  this deal, don't change it.

## Settings

| Setting | Values | Standard (ranked) |
|---|---|---|
| Level | Easy, Normal, Hard, Expert, Endless | Normal |
| Theme | Mix, Animals, Sea life, Food & treats, Fruit & veg, Characters, Toys & things, Sport & music, Things that go | Mix |
| Study seconds | 3, 5, 8, 12 | 5 |
| Choices | 4, 6, 8 | 6 |
| Twists | Mix, Gone only | Mix |
| Rounds | from `FF.GameLength` (8 standard) | 8 |

- Endless ignores Rounds.
- Only the standard settings count for leaderboards, the daily game and
  challenges. Expert, Endless and anything else use `customRules`.
- Rooms offer Easy to Expert, never Endless.
- **Claude's call:** Endless keeps a personal best on the device
  (`whatsMissing:endlessBest`) and shows it on the end screen. It does not
  get a leaderboard of its own in this build.

## Scoring

- **Base:**
  - Gone and Added: 100.
  - Swapped: 150.
  - Several gone: 100 per gap right. Partial credit: right gaps score and
    wrong gaps don't, but the streak breaks unless every gap is right.
- **Speed bonus:** up to +50, falling straight to 0 across the answer clock.
- **Streak:** ×1.2 from 3 right in a row, ×1.5 from 5. A wrong answer or a
  timeout resets it. `api.audio.play('streak')` plays when a step is reached.
- **Expert:** +50 per right answer, and +6 s on the answer clock, matching the Bible Expert levels.
- **Endless:** your score is the points, and the end screen headline is "You
  reached N pictures".
- **Brighton's call:** old What's Missing? leaderboard scores stay as they
  are, the same as the earlier rebuilds. No reset and no versioning.
- Use `api.scoring.add(id, pts, { correct, fastest })` and `markAnswer` as
  today, so results, badges and the crew's level system keep working.

## Players and modes

- Solo, pass-and-play turns (as today: one player per round, in order), and
  online rooms. Players 1–8.
- Daily game and challenges: the standard settings, dealt from
  `config.challengeSeed` / the daily seed through the shared rules. Add the
  game to `tools/test/sharedDeal.test.js`.

## How it is built

Follow GeoSpin's layout. Copy its patterns, not its code, where they differ.

- `js/whatsmissing/rules.js`, `FF.WhatsMissingRules`. Pure, no DOM, ES2017.
  It is used by phones, the referee and tests:
  - `SETTINGS`, `STANDARD` and `sanitize(settings)`.
  - `deal(settings, seed, k)` gives round k: the slots, the board before, the
    twist, the board after, the answer, and the choices, all from the seed
    and k (with its own random stream for choices, as GeoSpin does).
  - `check(round, answer)` gives what was right, per gap.
  - `points(...)` gives the score.
  - `endlessAt(n, seed, k)` gives a deal for a board of n pictures.
- `js/whatsmissing/referee.js`, `FF.WhatsMissingReferee`, the same shape as
  `js/geospin/referee.js`:
  - The server picks the secret seed.
  - Each round it publishes only what phones need, when they need it: the
    before board at study time and the after board at answer time. The
    answer is never sent before the reveal.
  - It takes one answer per player per round, times it with the database
    clock (plus a grace period), and scores it.
  - Views are `rooms/<code>/wm` and `rooms/<code>/wmInbox/<uid>/<cmdId>`.
  - An answer is `{ kind, slots?: [..], picks?: [ids], text?: [..] }` for the
    twist. Expert answers are checked with AnswerMatch on the server.
- `js/whatsmissing/client.js`, `FF.WhatsMissingClient` and `FF.WhatsMissingApi`,
  like the GeoSpin client.
- `js/whatsmissing/dev.js`: the dev-room referee host, like `js/geospin/dev.js`.
- `js/games/whatsMissing.js`: registers the game and holds all UI.
  - Remove the old `whatsMissing` block from `js/games/memoryGames.js`,
    along with its now-unused bits (keep `EMOJI` if other games still use it).
  - New `.wm-*` styles in `css/games.css` replace the old ones.
- **Server:**
  - `api/lib/WhatsMissing.php`, the same shape as `api/lib/GeoSpin.php`:
    `start`, `nudge`, `sweep`, `stillActive`, `recordResult`.
  - Routes go in `api/lib/EngineRoutes.php` (`/whatsmissing/start|nudge`),
    plus the heartbeat drop list.
  - `Routes.php` factory; the class goes in the `api/lib/bootstrap.php` class list.
  - `Db.php` gets the tables `whatsmissing_matches` and `whatsmissing_seats`.
  - `api/cron.php` gets the sweep.
  - `api/crew/runner.js` gets `whatsmissingRuns` and `whatsmissingState`.
  - `api/crew/lib/loader.js` loads the rules, referee, memoryDecks and aliases.
- **Rules:** add `wmInbox` to `database.rules.json` by hand, matching
  `gsInbox`. `tools/gen-rules.js` would drop it, so note it there the way
  the other hand-added rules are noted.
- **Lists that must stay in step:**
  - `js/net/roomUI.js` ONLINE_GAMES
  - `Crew.php` ONLINE_GAMES
  - `Leaderboards.php` GAMES
  - `icons.js`, `download-assets.js`, `assetManifest.js` (cover already done)
  - `play.html`, `admin.html`, `tools/load-check.js` and `tools/test-seed.html` script tags
  - `tools/verify.ps1` if it lists games
- **Crew:** What's Missing is in `Crew::GAMES` today, played by the quiz
  brain. Keep crew able to play it: add `js/crew/brains/whatsMissing.js`,
  which answers through `wmInbox` the way the wordFlow brain uses its inbox.
  Its accuracy and speed come from its traits and the level, and it
  sometimes misses.
  - If this is much bigger than it looks, the builder may instead drop
    whatsMissing from `Crew::GAMES` and from the quiz brain list, but must
    say so.
- **Phones:** the screen never scrolls. Size the board to the height left after
  the top bar and the answer panel, on each round and on resize (GeoSpin's
  `fitPhone()` is the model). Tiles have a minimum size; if they get too small,
  the grid uses more columns.
- **Animation:**
  - CSS transforms and opacity, with timers rather than rAF only (the
    preview tab throttles rAF; see the dev workflow memory).
  - Respect `prefers-reduced-motion`: cross-fade instead of sparkles.
- **Sounds:** existing `api.audio.play` names:
  - `flip` for tiles popping in
  - `whoosh` for the vanish or change
  - `select` for a tap
  - `correct` / `wrong`
  - `streak`, `roundStart` and `winner`

## Tests

- `tools/test/whatsMissing.test.js`:
  - Deals are the same for the same seed and differ for another seed.
  - Each level has the right picture count.
  - The twist table per level holds, and round 1 is always Gone.
  - No twist comes three times in a row.
  - Choices always include the answer and never a picture still on the board.
  - Several gone choices include every missing picture.
  - Theme decks are used.
  - Scoring follows the table above, including streaks and partial credit.
  - Expert: aliases, spelling mistakes, every Expert picture spellable from its tiles.
  - Registration: icon, cover, ONLINE_GAMES, Crew, Leaderboards, script tags.
- `tools/test/sharedDeal.test.js`: add whatsMissing.
- `tools/test/parallel.test.js`: update its entry (the game no longer uses
  FF.Race or FF.Parallel online).
- `tools/api/whatsmissing.test.php`: like `geospin.test.php`.
- A referee test with a fake transport and clock (see GeoSpin's tests):
  - one answer per player
  - a late answer within the grace period counts
  - the answer is hidden until the reveal
  - scores and the end of the match
- Manual:
  - a solo run at each level and in Endless, on desktop and phone sizes
  - a two-tab dev room (`FF.Storage.set('devRooms', true)`; see the two-tab
    testing memory)

## Left to the builder

- Exact timings, easing, tile colours (pastel, cream faces like the cover),
  the study-to-answer transition, and the exact grid sizes.
- How Several gone moves between gaps.
- The alias list contents.
- The referee's phase timings (brief, study, answer, reveal), within GeoSpin's ranges.
