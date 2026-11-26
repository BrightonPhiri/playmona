# Removed games

A record of games taken off PlayMona, so any of them can be rebuilt properly later.
The full code and content still live in git history: check out the "last commit with it"
below to read or restore any file.

```powershell
git show 977f433:js/games/creativeGames.js
```

## Removed 2026-11-25

Last commit with all five: `977f433` (main, before `chore/remove-five-games`).

### Don't Say It (`dontSayIt`)

- **What it was:** a taboo-style word game. One player sees a word plus four forbidden
  words and describes it to their team without saying any of them.
- **How it played:** Reveal, then a turn timer. The host tapped **Correct** (100 points),
  **Pass** or **Forbidden said** (0). Two words per player by default; points scaled by
  difficulty (Easy ×1, Normal ×1.5, Hard ×2). Modes: solo, turn, team. 1 to 8 players.
  Had a TV display deck (word with its forbidden words, 40 s each).
- **Content:** 95 cards in `js/data/party.js` → `FF.data.party.dontSayIt`, shaped
  `{ word, forbidden: [4], category }`, e.g. Pizza: Food, Cheese, Tomato, Italian.
- **Code:** `js/games/creativeGames.js` (`runRevealGame` flow).
- **Weak spots:** too close to Charades; a pass-the-phone game with no real checking.
- **If rebuilt:** fold it into Charades as a "Describe it, don't say…" deck type, so it
  gets the theatre look, teams and timer for free.

### Drawing Challenge (`drawingChallenge`)

- **What it was:** draw a prompt on a canvas in 60 s, then the group rated it.
- **How it played:** one drawing per player. Votes: **Great** 120, **Good** 80,
  **Funny** 60 to the artist; every other player got 30 for voting. Only one tap counted,
  so it was really the host's verdict. Already left out of Quick play.
- **Content:** 135 simple nouns in `FF.data.party.drawingPrompts`.
- **Code:** `js/games/creativeGames.js` (shared `makeCanvas` drawing board).
- **Weak spots:** the scoring was arbitrary and it overlapped with Pictionary; the audit
  had already planned to merge the two.

### Pictionary (`pictionary`)

- **What it was:** the drawer sees a secret word and draws it; the others type guesses.
- **How it played:** 90 s per drawing, one turn each (more on Long). A correct typed
  guess gave 100 to the drawer and 100 to "the next player" (it could not tell who
  actually guessed on a shared screen). **Pass** and **New word** buttons. Offline only.
- **Content:** 133 words in `FF.data.party.pictionary`, shaped `{ word, category, hint }`,
  e.g. volcano / Places / "It erupts".
- **Code:** `js/games/creativeGames.js`.
- **Weak spots:** same device for drawing and guessing, guesser credit was a guess, and
  SketchBack now covers drawing.
- **If rebuilt:** make it an online room game: the drawer's strokes stream to the other
  phones and each player types their own guess (first right answer scores), with a server
  referee like SketchBack. Merge Drawing Challenge into it as a "just for fun" mode.

### Who Is Most Likely? (`whoIsMostLikely`)

- **What it was:** a party vote. "Who is most likely to… forget where they put their
  phone?" Everyone votes for a player.
- **How it played:** 3 to 8 players, "everyone" mode. Voters who matched the room's top
  pick scored, and the picked player got a crown bonus (`FF.PartyVote.likelyPoints`).
  It worked online in rooms using the vote race (`mode: 'vote'` in `js/net/raceRules.js`,
  which stays, unused for now) and had a TV deck. It was in Live match and crew lists.
- **Content:** 95 prompts in `FF.data.party.whoIsMostLikely` (plain strings).
- **Code:** `js/games/partyGames.js` (also held `FF.PartyVote`: tally, majority points,
  shared prompt draw). Tests were `tools/test/partyVote.test.js`.
- **Weak spots:** last of the old party vote games (Would You Rather and This or That
  went on 2026-11-17); light on play and awkward with crew.
- **If rebuilt:** a Celebrations team game may suit it best (real people in one room);
  `FF.PartyVote` from `977f433` is a ready starting point for the vote maths.

### Visual Riddle (`visualRiddle`)

- **What it was:** picture brain teasers with four answers.
- **How it played:** 8 rounds by default, 100 points (× difficulty) plus up to 50 for
  speed within 8 s. Online it raced in rooms, had crew (quiz brain, about 5.2 s answers)
  and was on leaderboards.
- **Content:** 27 riddles in `js/data/visual2.js` (`FF.data.visual.visualRiddles`), each
  `{ type, question, options: [4], answer, svg }`. Types: what-comes-next, odd-one-out,
  complete-pattern, which-shadow, which-doesnt-belong. Several were weak (both shadow
  riddles drew the same generic shadow shapes).
- **Code:** `js/games/puzzleGames.js` (`renderRiddleRound`).
- **Weak spots:** small, uneven set with hand-drawn SVGs that did not match the new
  look.
- **If rebuilt:** needs a few hundred riddles with proper art (a Codex image pack), and
  answers that are checked to be unambiguous.

### Content that went with them

`js/data/party.js` was deleted whole. Besides the four packs above it held three packs no
game used any more: `charades` (165, Charades has its own decks now), `finishSentence`
(75) and `describeIt` (95). All are in `977f433:js/data/party.js`.

The sports and vehicle pictures in `js/data/visual2.js` stay: Picture Rush uses them until its own pictures are in.

## Replaced 2026-11-25: Picture Puzzle (`picturePuzzle`)

Last commit with it: `8976e66` (main, before `feat/picture-rush`).

- **What it was:** a sliding tile puzzle (the 15-puzzle): one gap, tap a tile next to it to slide it.
- **How it played:** Easy 3×3, Normal 4×4, Hard 5×5. Solo or turns; a solved picture scored
  `max(50, 300 - 5 × moves)` × the difficulty bonus (1, 1.5, 2). Online it was a parallel race
  (2 rounds on 3×3, 1 otherwise; 150 / 300 / 480 s), scored by moves against a par of 4 a tile,
  plus a speed bonus; unfinished boards scored by tiles in place. It had no cover and no crew brain.
- **Content:** about 147 simple SVG drawings: `js/data/visual.js` (animals, food, landmarks,
  objects) and `js/data/visual2.js` (sports, vehicles).
- **Code:** `js/games/puzzleGames.js` (`renderPuzzle`, `picturePuzzleOnline`, `puzzlePoints`),
  `.puzzle-*` styles in `css/games.css`.
- **Weak spots:** slow and fiddly on a phone (one move at a time, any order), the flat drawings were
  hard to read as tiles, and move counts made a dull score.
- **Replaced by:** Picture Rush (`pictureRush`), the swap-two-tiles game from Celebrations, with
  its own pictures. Picture Puzzle's leaderboard scores were left behind with the old id.

## Replaced 2026-11-26: the emoji Hidden Object (`hiddenObject`)

Last commit with it: `027c3a7` (main, before `feat/hidden-object`).

- **What it was:** 18 to 36 emoji and coloured shapes scattered on a plain light box, one target
  per round ("Find the 🍩" or "Find the red ball"), tapped before the 20 s clock ran out.
- **How it played:** 6 rounds by default (`FF.GameLength`), turns passed round by round. Each round
  added more, smaller items (Easy 2 fewer, Hard 2 more). A find scored
  `bonus × (50 + up to 100 for speed)`, wrong taps cost 10, bonus 1 / 1.5 / 2. Online: a parallel
  race of 6 rounds, 20 s each, the same scene on every phone.
- **Code:** `js/games/puzzleGames.js` (the last game left in it: `renderHiddenRound`,
  `placeSceneItems`, `hiddenOnline`, `hiddenPoints`), `.scene-*` and `.find-prompt*` styles in
  `css/games.css`.
- **Weak spots:** random emoji on a blank box looked nothing like a hidden object game, one target
  at a time made rounds very short, and the scenes were generated, so there was nothing to search.
- **Replaced by:** the same id with real pictures (`js/games/hiddenObject.js`,
  `js/data/hiddenObject.js`): one busy storybook scene, a list of 6 / 9 / 12 objects to find, pinch
  and drag zoom. It keeps its leaderboards and daily-game spot (ranked runs play Normal: 9 objects,
  1 picture), so older emoji scores stay on the boards until they age out.

## Earlier removals

- **2026-11-17** (`2145a67`): True or False, Color Reaction, Picture Quiz, Higher or
  Lower, Would You Rather?, This or That, Where in the World, Map Challenge, Capital
  Challenge. The seven "Guess the …" games became Guess It!.
- **2026-11-10** (`3d93dd4`): Picture Memory, Guess the Flag, Word Builder, Visual
  Charades, Brain Battle.
