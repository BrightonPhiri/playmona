# Smaller points across every game — design

Date: 2026-11-27 · Branch: `feat/points-rebalance` · First of the platform polish projects

## Why

Scores are far too big: a 10-question game can end in the thousands. Brighton wants each award to
read like a real point. Small scores are also needed for the planned all-games total board
(Hall of Fame, a later project). If games keep handing out hundreds of points, that total grows
too big too fast and one game drowns out the rest.

## The rule

- Each game keeps its own way of scoring. A right answer is worth what suits that game
  (Letter Rush stays at 1 point a letter).
- **No single award is above 10.** That covers a right answer, a find, a word, a finish, and
  every bonus: speed, streak, typed, Expert, clean run. Each is 10 or less on its own.
- **No multipliers that push an award past 10.** Harder levels get a bigger base (for example Easy 6,
  Normal 8, Expert 10). A streak adds a flat bonus instead of multiplying.
- Costs and penalties (hints, reveals, mistakes) are 1–3 points.
- A round or run total can be above 10. It is the sum of small awards.

### Goals
- Every game below follows the rule, solo and in online rooms (the server referees use the same rules files).
- The how-to-play text, rules lines and "+N" pop-ups show the new numbers.
- XP keeps players levelling at about today's pace.
- Leaderboards start clean, so old big scores never sit above new ones.

### Non-goals
- The Hall of Fame total board (its own project, after this one).
- Settings screens, end screens and medals (later projects in the same polish list).
- The Celebrations quiz: the organiser picks those points (100–5,000 a question).

### Anti-goals (a failure even if it "works")
- A game whose rules text or pop-ups still say +100.
- Online rooms scoring on the old numbers while solo uses the new ones.
- Any leaderboard mixing old-scale and new-scale scores.
- Letter Rush's 1-a-letter scoring changing.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Change each game's own numbers where they live today, plus an automatic test over every game's points | Numbers stay spread over ~28 files, but each game's scoring code keeps its shape |
| B | One site-wide points table every game reads | One place to tune, but every game's scoring gets rewired, and the Node crew and referees would need to load a new file |
| C | Divide every score by 10 at the end | Letter Rush rounds to 0, pop-ups and text stop matching, and server-scored games skip it |

Brighton picked A.

**Changed from the chat (my call):** I had offered a runtime check that would catch any award over 10.
It doesn't fit: many games call `api.scoring.add` once with a whole run's total (Stacoend, Hidden Object,
Picture Rush), so a check there can't tell one award from a total. The automatic test does that job
instead (see Testing).

## The points table (approved 2026-11-27)

| Game (id) | Where the numbers live | New points |
|---|---|---|
| Letter Rush (`letterRush`), WordFlow (`wordFlow`) | `js/games/letterRush.js`, `js/wordflow/rules.js` | **No change** (1 a letter / word; Letter Rush's rush word still scores double, Brighton's carve-out) |
| Bible Quiz, Verse Rush, Books | `js/games/bibleQuiz.js`, `js/games/bibleGames.js` | 10 a right answer; speed up to +5; streak +5; spelled (Expert) +5. Bible Quiz's every-5th "double" question becomes a flat +5 bonus question (a ×2 breaks the rule) |
| Bible Who Am I | `js/games/bibleGames.js` | 10 / 8 / 5 / 3 by clue; streak +5 |
| Quiz Mix, Family Quiz | `js/games/quizMix.js`, `js/games/quizGames.js` | 6 / 8 / 10 by level; quick answer (rooms) +3; streak +5 |
| Guess Who | `js/games/quizGames.js` | 10 / 8 / 5 / 3 by clues shown (was 300 / 200 / 100 / 50) |
| Guess the Country, Guess It! | `js/games/guessCountry.js`, `js/games/guessIt.js` | 10; speed up to +5; typed +5; Flash +3; streak +5; room fastest +3 |
| GeoSpin | `js/geospin/rules.js` | 10 (by level within 10); speed up to +5; streak +2 to +5 flat; hints −1 to −3 |
| Logo Rush | `js/logorush/rules.js` | 10; speed up to +5 (up to +10 while zoomed); mode/twist bonus up to +5 |
| Say What? | `js/saywhat/rules.js` | 10 (by level within 10); speed up to +5; two gaps +5; streak up to +5 |
| What's Missing? | `js/whatsmissing/rules.js` | 10 a gap; speed up to +5; Expert +5 |
| Number Challenge | `js/numberchallenge/rules.js` | Quick 10, speed up to +5, Expert +3; Sprint 1–5 by tier; Chain 10 + speed up to +5; Target exact 10, near 5 / 3 |
| Number Rush | `js/games/numberRush.js` | 1 a number; combo +1 / +2; finish +10; speed up to +10; survive +10; clean +5 |
| Memory Match | `js/games/memoryGames.js` | 5 a pair |
| Remember the Sequence | `js/games/sequence.js` | 1 a step in the chain |
| Blink & Remember | `js/games/blinkRemember.js` | 5 a box; +10 all right |
| Picture Rush | `js/games/pictureRush.js` | 10 a picture; speed up to +10; part-solved 5; hint −2 |
| Spot the Difference, Hidden Object | `js/games/spotDifference.js`, `js/games/hiddenObject.js` | 5 a find; speed up to +10 a picture; wrong −1 |
| Sort Rush | `js/sortrush/rules.js` | holder 5; clear +3; few moves up to +5; finish 10; speed up to +10; sorted 1 |
| Ball Swap | `js/ballswap/rules.js` | 1 a swap; finish 10; speed up to +10; clean +5; mistake −1 |
| Stacoend | `js/games/stacoend.js` | 1 a letter (up to 10); long word (8+) +3; rare word +2 |
| Mini Crossword | `js/crossword/rules.js`, `js/games/crossword.js` | 1–3 a word by length; finish +10; speed up to +10; reveal letter −1, word −3; floor stays above 0 |
| WordShift | `js/wordshift/rules.js` **and** `api/lib/WordShift.php` | finish 10; few moves up to +5; time left up to +10; invalid −1; Race places 10 / 7 / 5 / 3 |
| SketchBack | `js/sketchback/rules.js` | 10 a drawing named (`R.POINTS`). `MAX_POINTS` is drawing stroke data, not score: unchanged |
| Quick Tap | `js/games/reactionGames.js` | Lightning 10, Rocket 8, Quick 6, Steady 4, Sleepy 2; other modes 10 |
| Word Scramble, Word Chain | `js/games/wordGames.js` | 10 a word, hint −3; 5 a link; letter-scored builder words 1 a letter, up to 10 |
| Imposters | `js/imposters/rules.js` | win 10; right vote 3; minority survives 5 |
| Charades | `js/charades/rules.js` | **No change** (already 1 a word, 2 with a twist) |

"Speed up to +N" keeps each game's current curve (full at an instant answer, fading to 0 at the
clock), only scaled to the new top value.

## Everything else that moves with the points

1. **XP** (`FF.Stats.recordResult`, `js/scoring.js`): today `min(100, points ÷ 50)` and +25 for a win.
   New: `min(50, ceil(points ÷ 2))` and +25 for a win. The +10 a game in `recordGamePlayed` stays.
   Daily challenge and friend challenge XP (`js/social.js` `addXp`) should match the same scale.
   Existing XP and levels are kept.
2. **Leaderboards, Season 1.** Weekly and all-time boards move to new paths so they start empty and
   the old data stays as a record:
   `leaderboards/<game>/s1/week/<week>` and `leaderboards/<game>/s1/all` (`js/leaderboards.js` `path()`,
   `api/lib/WordShift.php`, `tools/gen-rules.js`). `leaderboards/featured` is unchanged.
   Daily boards are one day each, so they need no move. On launch day, the readers skip daily rows
   written before the deploy: new rows carry `v: 2`.
   `lbPlaces` (the local "your places" cache) is cleared once.
   WordShift's own daily board (`wordshiftDaily/<day>`) gets the same launch-day `v: 2` treatment, and
   the PHP tests in `tools/api/wordShift.test.php` move to the new paths.
3. **Score caps.** `FF.Leaderboards.MAX_SCORE` and the rules' `score <= 1000000` drop to **1,000**
   (my call: above any real run, including Endless modes, and far below today's cap).
   WordShift's PHP `MAX_SCORE` matches. Challenge caps in `js/social.js` (`MAX_SCORE = 1500`,
   `BIG_SCORE`) follow the same scale.
4. **Personal bests** saved on the device (`ballSwap:best`, `numberRush:best`, `stacoend:best`,
   `crossword:best`, `blinkRemember:best`, `rememberSequence:best`, `quickTapBest`, and any others the
   builder finds) are cleared once, so "Your best: 3,400" never sits next to a new 34.
   A one-time `pointsV2` flag in storage guards this.
5. **Friend challenges** made before launch hold old-scale scores. They are shown as ended
   ("made before the new points"), not playable. The cut-off is the launch time in the same `pointsV2` constant.
6. **Text.** Every how-to-play line, rules line, scoring note and "+N" pop-up that names a number
   changes to the new one. The six languages in `js/i18n.js` are checked for scoring strings.
7. **Online rooms and the crew.** The referees read the same rules files, so rooms change with solo.
   The deploy already restarts the crew. Bot answer timings (`js/crew/brains`) are not points, so they stay.

## Testing

- New `tools/test/points.test.js`, which runs in `node tools/test/run.js` (CI blocks the deploy on failure):
  - each rules file's exported point constants are all 10 or less (penalties −3 or more);
  - each exported points function (GeoSpin, Logo Rush, Say What?, What's Missing?, Number Challenge,
    Sort Rush, Ball Swap, WordShift, Crossword, Imposters) is driven at its most generous
    (instant answer, long streak, Expert, every twist), and every part of its breakdown is 10 or less;
  - Letter Rush still scores 1 a letter;
  - WordShift's JS score matches `api/lib/WordShift.php` for the same inputs (the existing check extends).
- Games whose points sit inside the game file (not a rules file) expose their numbers on a small
  `POINTS` object, so the test can read them.
- Existing tests that assert old numbers get updated to the new ones.
- Before merge, play every game once in the browser (solo; plus one room game each for the
  server-refereed games) and check the pop-ups, end score and rules text.

## Release

One branch and one PR, with commits grouped by game family (quiz games, picture games, word games,
number games, room games, platform: XP, boards, caps, bests). Everything goes live in one deploy,
which is the start of Season 1. A short note on the home page or leaderboard ("New season: points are
smaller, boards start fresh") is my call and simple to drop.

A phone that still has the old page open keeps the old numbers until it reloads. Its scores could land
on the new boards in that window. The `v: 2` mark covers this: the rules accept new board rows only
with `v: 2`, which old code never writes (my call). Deploy at a quiet hour, so few rooms are mid-game
when the crew restarts.

## Left to the builder
- The exact speed curves and per-level bases within the limits above.
- The launch-day daily filter: how many extra rows to fetch so the board still fills after skipping old ones.
- Any game, string or saved best this audit missed: apply the same rule.
