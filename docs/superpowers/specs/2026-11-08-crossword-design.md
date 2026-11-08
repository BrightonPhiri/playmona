# Mini Crossword upgrade: design

Date: 2026-11-08. Branch: `feat/crossword` (worktree off origin/main). Game id stays `miniCrossword`.

## Why

Mini Crossword is one of the weakest games on PlayMona. It has 3 puzzles, sparse grids, clue numbers that skip
(1, 7, 11) and child-level clues ("Tells the time"). Brighton wants it to become a proper crossword: many puzzles,
real variety, clues in good English, and above all a UI and animation quality on a par with GeoSpin. The existing
cover image (`assets/images/covers/miniCrossword.*`) stays as it is.

Another session is upgrading What's Missing at the same time. This work must not touch that game or its files.

## Goals

1. **World-class look and feel first.** Dark GeoSpin-style stage, glossy raised tiles, a big live clue bar above the
   grid, satisfying motion for every action. This is the most important part.
2. **A proper crossword.** Standard numbering (left-to-right, top-to-bottom, a number on every square that starts an
   Across or Down word), symmetric-looking, well-filled grids, every white square checked where the grid style says so.
3. **200+ puzzles at launch** across three levels and themed packs, every clue written in proper English.
4. **Variations:** themed packs, race the clock with stars, clue styles that grow with the level, Expert (no checking).
5. **Play together:** Co-op on one grid, and a head-to-head Race in rooms run by a server referee.

## Non-goals

- No new cover art (keep the current one).
- No change to What's Missing or any other game.
- No user-made puzzles or puzzle editor.
- No cryptic crosswords; Hard has gentle wordplay only.

## Anti-goals (a failure even if it works)

- Clues that are vague, babyish on Hard, or bad English ("You drink it every day").
- Grids that look like the current ones: a few words floating in a sea of black squares.
- Wrong or skipping clue numbers, or a clue whose answer length doesn't match.
- The phone keyboard covering the grid by default.
- A flat, "web form" look, or animations that make typing feel slow.
- Online answers sitting on every phone in a Race.

## Levels and grids

Brighton's choice: whole family, three levels, a mix of tight minis and roomier grids done properly.

| Level  | Sizes        | Clue style                                                      | Who for       |
|--------|--------------|-----------------------------------------------------------------|---------------|
| Easy   | 5x5          | Plain, friendly definitions; common words (3-5 letters)          | Children      |
| Normal | 5x5, 7x7     | Definitions plus fill-in-the-blank ("Once upon a ___")           | Teens, family |
| Hard   | 7x7, 9x9     | Sharper definitions, fill-in-the-blank, gentle wordplay/general knowledge | Adults |

Two grid families, both "done properly":
- **Dense minis**: nearly every white square belongs to both an Across and a Down word, few black squares,
  rotationally symmetric where the generator can manage it (5x5 and some 7x7).
- **Open grids**: more black squares and longer words, but still connected and well-crossed: every word crosses at
  least one other, at least ~half the white squares are crossed, no isolated islands (7x7 and 9x9).

Minimum word length 3. No two-letter words. Every grid fully connected.

## Puzzles and clues

- **200+ puzzles** total, spread roughly evenly over the three levels, across themed packs:
  Animals, Food & Drink, Home & School, Sport & Games, Music & Arts, Geography, Bible, Nature & Weather, plus a
  **Mixed** pack that draws from everything. Every pack must have puzzles at every level (some packs may be
  thinner at Easy).
- Puzzles are built by an offline Node generator (`tools/gen-crossword.js`, rewritten) from a curated word bank.
  Each bank entry is a word, its themes, its level(s), and one or more clues in different styles
  (`def`, `blank`, `wordplay`) and per level. The generator fills grids with backtracking, validates them,
  numbers them, and emits `js/data/crosswords.js` (`FF.data.crosswords`). Generation is seeded so the file is
  reproducible.
- Clues are written by Claude in proper British-leaning English (the site's spelling: colour, favourite), checked
  by a validator: clue present, capitalised, ends sensibly, does not contain the answer, enumeration added in
  display ("(5)"). The data file is the source of truth; the generator is a tool.
- A puzzle has an id (stable, e.g. `an-e-014`), level, size, pack, grid and clues. Puzzles in one pack should not
  reuse the same answer too often.

## Play (one device)

Setup screen (GeoSpin-style setup cards): Level, Pack, Checking (Normal / Expert), and in "turn"/"everyone"
modes how the group plays. Daily and challenge runs skip the setup and use the standard settings (Normal, Mixed,
checking on) with a seeded puzzle, using `FF.Random`, never `Math.random` while dealing.

Screen, top to bottom:
1. **Top bar**: timer, star meter (3 stars falling to 2/1 as help is used), pack chip, pause.
2. **Clue bar**: "3 DOWN" plus the clue text, large; swipe or arrows to go to the previous/next clue. Tapping it
   flips direction where the selected square crosses.
3. **Grid**: glossy raised tiles on a dark stage. The selected square glows; the current word is lit; the crossing
   word is faintly lit. Clue numbers sit in the tile corner.
4. **Keyboard**: built-in on-screen QWERTY (default) with previous/next clue, flip direction and backspace keys.
   A setting (stored per device) switches to the phone's own keyboard. A real keyboard always works on computers
   (letters, arrows, Tab/Shift+Tab, Space to flip, Backspace).
5. **Clue list**: on wide screens a scrollable Across/Down list sits beside the grid (finished clues struck through,
   active one highlighted); on phones it opens from a "Clues" button as a sheet.

Typing moves to the next empty square in the word, skipping filled ones; at the end of a word it jumps to the next
unfinished clue. Backspace clears then steps back.

Help: **Reveal letter**, **Reveal word**, **Check** (Expert only, marks wrong letters), **Clear wrong**. Help costs
stars and points.

**Checking modes**
- *Normal (checking on):* a right letter settles in; a wrong letter shakes and tints red; a finished word sweeps.
- *Expert (no checking):* letters stay neutral; "Check grid" at the end shows wrong squares; finishing needs every
  square right. Expert gives a points bonus. Expert must be added to `docs/expert-levels.md` (move the row to Done
  if it is listed; add it otherwise).

**Race the clock**: every solve is timed. Best time per level/pack is kept per device. Stars: 3 = no help,
2 = a little help, 1 = lots of help. Score = base by level + time bonus + Expert bonus - help costs (exact numbers
are the builder's call, but faster and help-free must always score more).

## Animations (the most important part)

The bar is GeoSpin. Must have:
- Grid entrance: tiles flip/rise in a diagonal wave when the puzzle starts.
- Letter typed: pops in with a small scale bounce and a soft tick.
- Selection: the glow slides smoothly between squares; the word highlight sweeps along the word.
- Wrong letter (checking on): quick shake and red flash.
- Word finished: a light sweep runs along the word, tiles settle gold-green, the clue in the list strikes through
  and the clue bar slides to the next clue.
- Reveal: the letter flips over like a card.
- Puzzle finished: a ripple wave across the whole grid, stars land one by one, the time counts up, confetti,
  then the results card.
- Respect `prefers-reduced-motion` (fades only).
Animations must never delay input: a fast typist is never blocked by an animation.

Uses the design-system tokens (`css/tokens.css`) and `FF.UI`/`FF.GameUI` conventions; colours must pass the
contrast tool (`tools/contrast-check.js`). Works at 360px phone width with no page scroll during play where possible
(grid sized to the height left after bars and keyboard, like GeoSpin's `fitPhone()`).

## Playing together

Modes: `solo`, `turn`, `everyone` on one device stay supported, plus online rooms.

**One device** (Brighton's choices):
- `turn` (take turns): a player solves one word, scores it, then the device passes to the next player (a "pass to"
  card between turns). With checking on, a wrong letter also ends the turn. With Expert, the turn passes after each
  word is filled; scoring happens at the end-of-puzzle check (a word scores for whoever filled it, if right).
- `everyone`: Co-op on one screen (everyone shouts answers, one person types); a team score, no per-player points.

**Online rooms**: the host picks **Co-op** or **Race** on the setup card (with level, pack and checking) before
starting; the choice travels in the match settings to `Crossword.php`. Both modes are run by the **server referee**.
Phones never hold the answers in either mode.

- **Co-op** (room, 2-8 players): one shared grid. The referee owns it: phones send letter entries
  (`{type:'fill', r, c, ch}` / clear) to the inbox; the referee writes the shared grid (letters only, no answers) to
  the public view, resolves two players typing in the same square (last write by database clock wins), and when a
  word becomes complete checks it. With checking on, a right word locks green and scores for the player whose letter
  completed it; a wrong word is marked wrong (letters stay so others can fix them). With Expert, nothing is marked
  until every square is filled; then the referee checks the grid and scores words to whoever completed them. No
  reveals online.
- **Race** (room, 2-8 players): everyone gets the same puzzle and solves it on their own grid. The
  **server referee** holds the answers, following the GeoSpin/SortRush pattern:
  - `api/lib/Crossword.php` starts the match (host, ready check, settings), writes `crosswordRuns/<matchId>`.
  - `js/crossword/referee.js` runs in the crew runner, picks the puzzle from a secret seed, publishes the grid
    shape and clues only (no letters) to `rooms/<code>/cw`, takes each player's word attempts from
    `rooms/<code>/cwInbox/<uid>/<cmdId>`, checks them, and publishes each player's progress (words done, %, no
    letters) and the finish order. First to finish wins; a time limit ends the race and ranks by words solved,
    then time.
  - Phones never receive the answers in a Race. Help in a Race (Brighton's choice): **word check only, no
    reveals**. When all squares of a word are filled the phone sends the word automatically and the referee answers
    right/wrong; right words lock. The host can choose Expert instead: nothing is checked until the player submits a
    full grid, and a wrong grid gets a count of wrong squares (not which ones) and a time penalty (builder's call).
  - No stars or help costs online; room points come from the finish order (Race) or words scored (Co-op), written
    by the referee into the room's usual results, as GeoSpin does. Online runs never count for leaderboards.
  - New `cwInbox` rule hand-added to database.rules.json (gen-rules.js drops hand-added rules); the PHP class goes
    into `api/lib/bootstrap.php`; routes in Routes.php; loader/runner registration as GeoSpin does.
  - Dev rooms (`devRooms` flag) run the referee in the host tab, as GeoSpin's `dev.js`.

## Files (expected)

- `js/crossword/rules.js`: pure rules (numbering, words per cell, checking, scoring, settings sanitise, seeded pick).
- `js/crossword/referee.js`, `js/crossword/client.js`, `js/crossword/dev.js`: online Race.
- `js/data/crosswords.js`: the 200+ puzzles.
- `js/games/crossword.js`: the game (replacing the Mini Crossword block in `js/games/wordGames.js`, which is removed
  along with the old `crosswords` array in `js/data/words.js`).
- `css/games.css`: `cw-*` styles.
- `api/lib/Crossword.php` + tests in `tools/api/`; JS tests in `tools/test/crossword.test.js` (rules, data
  validation of every puzzle, referee).
- Script tags in `index.html`/`play.html` and lists in `tools/load-check.js`, `tools/verify.ps1` as other games do.
- `DEV_GUIDE.md` crossword data section updated.

## Constraints

- Vanilla ES5-style classic scripts on `window.FF`, no build step (as the rest of the site).
- Leaderboards: solo standard runs stay eligible; `Leaderboards::GAMES` already lists `miniCrossword`.
- Challenge links and the daily game: deal from the seed, add to `tools/test/sharedDeal.test.js` if needed.
- Do not touch What's Missing.
- Old challenge links and daily seeds for Mini Crossword will deal a puzzle from the new set (the old 3 puzzles
  are dropped). Claude's call: acceptable, since the seed still deals the same new puzzle for everyone.

## Left to the builder

Exact scoring numbers, time limits for Race, the word bank size beyond what 200+ puzzles need, animation timings,
the exact tile styling (within "glossy raised tiles on a dark GeoSpin-like stage"), and the internal structure of
the files above.
