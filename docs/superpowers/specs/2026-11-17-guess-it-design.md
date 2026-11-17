# Guess It! — design (2026-11-17)

## Why

Brighton wants a shorter, less repetitive catalogue. Nine old games go, and the seven
"Guess the…" games become one premium game where the player picks what to guess.

## Part 1: remove nine games

Remove completely (game code, registration, icons, covers, lists, tests):
True or False (`trueOrFalse`), Color Reaction (`colorReaction`), Picture Quiz (`pictureQuiz`),
Higher or Lower (`higherOrLower`), Would You Rather? (`wouldYouRather`), This or That (`thisOrThat`),
Where in the World? (`whereInWorld`), Map Challenge (`mapChallenge`), Capital Challenge (`capitalChallenge`).

Places each id appears (from the 2026-11-10 removal): roomUI `ONLINE_GAMES`, `api/lib/Crew.php` (both lists +
personality `strong` lists), `api/lib/Leaderboards.php` `GAMES`, `js/crew/brains/quiz.js`, `js/crew/levels.js`,
`js/crew/controller.js` MODES, `js/gameConfig.js` GUEST_GAMES, `js/leaderboards.js` DEFAULT_FEATURED, `js/icons.js`,
`tools/download-assets.js`, `tools/test-seed.html`, `tools/verify.ps1`, `tools/load-check.js`, DEV_GUIDE.md, and tests
(raceGames, watchRace, rejoin, rng, sharedDeal, partyVote, admin, crewBrains count, crew.test.php, leaderboards.test.php).

Keep the data other games still use: True-or-False questions (Quiz Mix, `js/quizRun.js`), Would You Rather /
This or That prompts in `js/data/party.js` if another party game reads them, `js/data/countries.js` if GeoSpin or
others read it. Delete data only when nothing reads it. Their leaderboard scores are dropped (accepted).

Guest games and featured lists lose entries; fill the gaps with `guessIt` so the lists keep their length.

## Part 2: Guess It!

### What Brighton decided
- Name **Guess It!** (id `guessIt`).
- Topics: **Animals, Flags, Food, Landmarks, Objects, Sports, Vehicles, Jobs, Instruments**, plus **Mix**.
- Folds in Guess the Country (as Flags), Guess the Animal, Food, Landmark, Object, Sport, Vehicle. Guess Who / What
  stays its own game (it is a clue game, not "Guess the…").
- Approach A: one new game file with a shared photo engine for the picture topics; Flags reuses
  Guess the Country's engine (waving flags, Flash, Expert tiles, timer) restyled to sit inside Guess It.
- **Expert** (spell the answer with letter tiles) on every topic.
- Premium UI. All picture topics are realistic photos, made by Brighton in Codex from sheets of 6 that Claude cuts.

### Goals / non-goals / anti-goals
- Goal: one game that feels richer than any of the seven it replaces; picking a topic is the fun first moment.
- Non-goal: new game mechanics beyond picture guessing; a server referee (rooms keep the client race the old games used).
- Anti-goal: Flags losing anything it does today; a topic with cartoon art next to photo topics; the answer
  leaking through alt text, file names or aria labels.

### Player flow
1. **Topic picker.** A grid of large photo tiles (one per topic, using one of its own photos, Flags uses a waving
   flag), each with the topic name and how many pictures it has. Mix is a wide tile on top. Last topic is remembered.
2. **Settings sheet** for the picked topic (same pattern as Guess the Country's setup): Level, Time for each
   picture, Twist, Pictures (rounds), and a "Standard settings" button. Flags opens Guess the Country's own setup,
   headed "Guess It! · Flags".
3. **Rounds.** A large rounded photo card with soft depth, topic chip, round counter, shell timer, answer buttons
   (or letter tiles on Expert). After answering: the photo zooms out to the full picture (if it was a close-up),
   the name and a fact card slide in, then Next.
4. **Recap.** Score, right/answered, best streak, and a "To learn" strip of thumbnails of the missed pictures with
   their names (like Guess the Country's "Flags to learn"). Then the normal results screen.

### Levels (picture topics)
| Level  | Picture                                  | Answers                          |
|--------|------------------------------------------|----------------------------------|
| Easy   | full photo                               | 4, wrong ones from other groups  |
| Normal | close-up                                 | 4, two lookalikes (same group)   |
| Hard   | blurred close-up                         | 6, lookalikes first              |
| Expert | full photo                               | spell it with `FF.SpellTiles`, checked by `FF.AnswerMatch` (accepts `aka` names) |

Close-up: Animals keep their own `-closeup.webp` files. Other topics zoom the photo in CSS (scale about 2.3) on a
per-item focus point (`focus: [x, y]` in %, default centre). Lookalikes come from each item's `group`.

### Time and twists
- Time for each picture: 5 / 8 / 12 s / no limit (standard 8). Timeout counts as wrong. Expert gets +6 s.
- Twists: **None**, **Flash** (picture hides after 1.5 s, +25), **Zoom out** (starts as a tight close-up and slowly
  widens to the full photo over the time; picture topics only).

### Scoring
- Solo/turns: 100 x level (Easy 1, Normal 1.5, Hard 2, Expert 2) + up to 50 for speed (share of time left) +
  50 for every 3 in a row + Flash 25 + Expert typing 50. Flags keeps its own scoring (`FF.GuessCountry.points`).
- Rooms: the existing race points (100 x difficulty + 50 inside 3 s), so room scoring does not change.

### Standard settings, leaderboards, daily, challenges
- Standard = any topic, Normal, 8 s, no twist, default length. Topic does not make a run custom, so Flags and
  Animals runs both count on the one `guessIt` board. (Claude's call: a board per topic would split few players.)
- Daily and challenge runs: the challenger's topic travels in `config.dealOptions` (like Quiz Mix topics); the
  daily run plays Mix. All dealing uses `FF.Random` so seeded runs match (add `guessIt` to sharedDeal.test.js).

### Rooms
- `def.room` lobby fields: Topic (all topics + Mix), Level (Easy/Normal/Hard; Expert is not offered online),
  Time. Picture topics race like the old visual games (`FF.Race`, `FF.RaceUI`, `FF.Race.describe` with the image
  for watchers, max 6 options). Flags in a room runs Guess the Country's existing race path on its standard settings.
- `guessIt` replaces the seven old ids in `ONLINE_GAMES`, `Crew.php` lists and crew brains (quiz brain answers
  choice rounds); crew personalities that were strong at the old guess games are strong at `guessIt`.

### Data
- New `js/data/guessIt.js`: `FF.data.guessIt = { topics: [...], items: { food: [...], ... } }`.
  Item: `{ id, name, group, fact, aka?, focus? }`. Animals stay in `js/data/animals.js`; Flags stay in `worldFlags.js`.
- Counts (multiples of 6 so sheets fill): Food 30, Landmarks 24, Objects 30, Sports 18, Vehicles 24, Jobs 24,
  Instruments 24 = 174 new photos, 29 sheets. Landmarks are named by the landmark (country and city go in the fact).
- Pictures: `assets/images/games/guessIt/<topic>/<id>.webp`, 640 px square, under about 90 KB. File names are ids,
  which are the answer in plain words — same as Guess the Animal today; acceptable because a file name is not shown.
- **Ship only when every photo is in** (Brighton, 2026-11-17): the branch is not merged to main (a push to main
  deploys) until all 29 sheets are cut. While building, a missing photo shows a neutral shimmer placeholder.
  The old SVG drawings in `visual.js` are deleted once nothing reads them (`visualRiddles` stays).

### Art
- Prompt pack `docs/art/guessIt-prompts.md`: one cover prompt, then 29 sheet prompts. Each sheet is 1536 x 1024,
  a 3 x 2 grid of six square realistic photos separated by pure white gutters, no text or labels.
- `tools/art/guessIt.json` lists the sheets; `tools/cut-art-sheets.py` gets a `"cut": "photos"` mode that crops each
  grid cell square (keeps the photo, no background removal), resizes and compresses, and writes a contact sheet.

### Code layout (builder's call within this)
- `js/games/guessIt.js`: topic picker, settings, picture engine, recap, room fields, registration; pure rules on
  `FF.GuessIt` for tests (deal, options, points, sanitize, isStandard).
- `js/games/guessCountry.js`: stops registering its own game; exposes `setupScreen` and `play` (and its race path)
  for Guess It. Its storage keys stay, so players keep their Flags settings.
- `js/games/visualGames.js`: deleted once Guess It covers every topic it held.
- Styles in `css/games.css` with tokens only (`.gi-*`), `FF.GameUI` building blocks, sentence case, `FF.t` strings.
- Cover `assets/images/covers/guessIt.webp`, then `node tools/gen-asset-manifest.js`.

### Left to the builder
Exact tile layout and motion, focus points, fact wording, crew levels for `guessIt`, which old covers and art files
to delete, how the Flags restyle is done (header/frame) as long as its behaviour is unchanged.

## Approaches considered
- **A (picked): new game + shared photo engine, Flags plugged in.** Most work; one consistent premium game, Flags intact.
- B: a topic menu that launches the old games. Cheap, but each topic keeps its plain old look — fails "premium".
- C: rebuild Flags inside the photo engine. Cleaner code, but re-creates waving flags, Flash and Expert for no visible gain.
