# WordShift — design

Date: 2026-11-17. Branch: feat/wordshift (cut from origin/main 3d93dd4).

## Intent
A premium word-ladder puzzle for PlayMona: change a start word into a target word one letter
at a time, every step a real English word. It must feel like a polished standalone word game,
be fair (no hints at all) and keep scores honest (the server checks every scored result).

## Goals
- Rules: same length throughout; exactly one letter changed per move; no rearranging; every
  word real; no word used twice in one puzzle (start word included); any valid path accepted.
- Green tiles: a position whose letter equals the target's letter is green, with a pop when it
  turns green. The player may still change a green letter (then it is normal again); "stays
  green" means it never flickers or fades while it holds. Full match = all green + celebration.
- Modes: Classic (no clock), Time Challenge (60/90/120/180 s, default 120), Daily (one Normal
  puzzle a day for everyone, its own leaderboard), online Race (2–8 players, same puzzle, first
  to the target wins; others shown only as move count + green count).
- Levels: Easy 3 letters, Normal 4, Hard 5, Expert 6 (plus 7–8-letter puzzles the generator
  accepts). Shortest path ranges: Easy 3–5, Normal 4–6, Hard 4–7, Expert 4–8 moves.
- Completion: all green, confetti, moves, time, shortest length, score, Next puzzle, Replay
  (same puzzle again).
- The server checks every scored result (solo, Daily, platform leaderboards, Race).

## Anti-goals (a failure even if it "works")
- Any hint: suggested words, a marked "change this" letter, autocomplete, keyboard letter
  colouring, revealing a path. The shortest LENGTH shows only on the completion card. No hint
  buttons or menus.
- The game changing letters for the player.
- Obscure, rude or impossible puzzles.
- A phone being able to write a WordShift score the server did not check.
- Breaking any existing game or shared code.

## Constraints (from the project)
- Classic scripts, ES5, `FF.registerGame` (see js/games/sayWhat.js); FF.UI / FF.GameUI rules;
  FF.t with fallbacks; FF.Random for seeded deals.
- Word bank: FF.Words (js/words.js + js/data/lexicon.js, tiers 1–4, 5 = quiet/rude).
- Online referee pattern: Say What? (api/lib/SayWhat.php start + Runner, api/crew/runner.js,
  js/saywhat/{rules,referee,client}.js, inbox rule hand-added to database.rules.json,
  Crew::ONLINE_GAMES matching roomUI.js ONLINE_GAMES, bootstrap.php class list).
- FF.Leaderboards eligible list must match Leaderboards::GAMES.
- Mobile-first; respects reduce-motion and the animations setting.

## Approaches considered
1. **Bank of pre-generated puzzles + server replay (chosen).** A Node generator builds about
   3,000 puzzles from common words (BFS over the one-letter graph) with the shortest length; a
   test validates them before they ship. Phone and server share the bank; the server replays
   move lists to score. Predictable, testable, cheap at runtime.
2. Generate puzzles live on each phone from a seed. No bank, but BFS over 5–8-letter graphs is
   slow on low-end phones, and the server would repeat it for every check.
3. Race-only server checking. Rejected by Brighton: every score must be checked.

## The design

### Data (tools/gen-wordshift.js)
- Graph words: tiers 1–2, not quiet, lengths 3–8, a–z only. Start/target from tier 1 for
  Easy/Normal, tiers 1–2 for Hard/Expert. While playing, any tier 1–4 word is accepted; quiet
  words are refused as "not in our word list".
- A puzzle needs a shortest path in its level's range using graph words only (so a familiar
  path always exists), start ≠ target, no repeated pair. Easy/Normal also need at least two
  distinct paths of length ≤ shortest + 1.
- Output: js/data/wordshiftPuzzles.js (`FF.data.wordshift = { v, puzzles: [{id, s, t, n, lv}] }`),
  api/data/wordshift-puzzles.json, and api/data/wordshift-words.txt (every accepted word of
  3–8 letters) for the PHP checker. Ids are stable (`e123`, `n45`, `h7`, `x9`).
- tools/test/wordshift.data.test.js re-runs BFS on every puzzle and checks ranges, lengths,
  tiers and duplicates.

### Rules (js/wordshift/rules.js, FF.WordShiftRules — phone, referee and tests)
- `checkMove(prev, next, used, isWord)` → ok or a reason: length, same, many, word, used.
- `greens(word, target)` → per-position booleans.
- `score({moves, shortest, invalid, timed, secondsLeft})`: 100 for finishing; efficiency
  max(0, 100 − 15 × (moves − shortest)); Time Challenge + 2 × seconds left; − 5 per refused
  word; floor 0; unfinished 0. The SCORING table is at the top of the file. PHP mirrors it.

### Screen (js/games/wordShift.js + its CSS)
- Header: target word tiles always shown, start word, move counter, clock in Time Challenge.
- Ladder: past words as small tile rows (greens shown), newest at the bottom, scrolling.
- Board: the current word as big tiles. The player taps a tile (or arrow keys) to select a
  position, then types a letter; the tile they edited gets an outline. Backspace restores
  that tile. Enter submits. Physical keyboard plus an on-screen A–Z keyboard (no colouring).
- Feedback: refused → shake + short message ("Change just one letter", "Not in our word
  list", "Already used"). Accepted → the changed tile flips; a tile turning green pops.
  Win → green wave + confetti + completion card.
- Setup: mode (Classic / Time Challenge), level, clock. Daily and challenge links skip setup.
  Give up ends the puzzle (score 0; card shows the shortest length only, never words).
- Puzzle choice: unseen first per level (local `wordShift:seen`), like Crossword.

### Score checking (api/lib/WordShift.php)
- `POST wordshift/begin {puzzleId, mode, seconds, daily}` → a ticket id; the ticket (uid,
  puzzle, mode, seconds, day, server start time) is stored server-only at wordshiftTickets/<id>.
- `POST wordshift/finish {ticket, moves[], invalid}` → replays moves with the PHP checker,
  takes the time from the server clock (Time Challenge must end within seconds + 5 s),
  scores with the same table, then writes with the service account: leaderboards/wordShift
  week + all (only higher), daily/<day>/<uid> when WordShift is the platform's daily game and
  the ticket says daily, and wordshiftDaily/<day>/<uid> for its own daily puzzle. One finish
  per ticket.
- Database rules: phones cannot write leaderboards/wordShift or a daily/<day>/<uid> entry with
  game 'wordShift'; wordshiftDaily is read-only to phones.
- Guests play but aren't ranked, as elsewhere. Offline: play works; the card says the score
  wasn't ranked.
- WordShift Daily: FNV-1a("wordshift|<day>") over Normal puzzles, same in JS and PHP. One
  ranked try per day; replays are unranked.

### Online Race (js/wordshift/referee.js + client.js; WordShift::start)
- Host starts from the room; the server checks host/ready/settings (level, rounds 1/3/5, clock
  90/120/180 s) and hands the match to the crew runner (stream `wordshiftRuns`, inbox
  `wsInbox`, view `rooms/<code>/ws`, meta.wsMatch, match ids `w_…`).
- The referee deals from a secret seed, checks each word (FF.Words in Node), keeps paths
  private, publishes per player {moves, greens, done, ms}. A round ends on the clock or when
  all finish. Points: finish order (100/70/50/30) + efficiency as solo, summed over rounds.
- Crew bots: js/crew/brains/wordShift.js walks a BFS path with human-like delays and the odd
  detour.
- Prefix: `ws-`.

### Integration
- registerGame id `wordShift`, category word, leaderboard: true, modes solo, room: ROOM.
- Leaderboards::GAMES / FF.Leaderboards, Crew lists, roomUI ONLINE_GAMES, play.html, loader.js,
  load-check.js, bootstrap.php, Routes.php, icons, assetManifest, docs.
- Cover: assets/playmona_assets/WordShift/cover.png → assets/images/covers/wordShift.webp via
  tools/art/wordShift.json.

## Calls made by Claude (Brighton to check)
- Green tiles can be changed away (rules allow any one letter).
- Scoring numbers above; refused words in solo come from the phone's log.
- Expert is mainly 6 letters.
- Race points: finish order + efficiency.

## Left to the builder
- Animation timings and colours within the design system; exact message copy.
