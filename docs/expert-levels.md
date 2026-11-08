# Expert levels: spell the answer

Games where the answer is a name (a country, a city, a person, a thing)
get an **Expert** level: the player spells the answer instead of picking
it. Check this list whenever a game is upgraded, and tick it off here in
the same commit.

Last checked: 2026-11-08 (main at 40dfa32, 53 games).

## How every Expert level works

Build on what Guess the Country and GeoSpin already do. Don't write a
second checker.

- **Checking:** use `FF.AnswerMatch.create({ answers: [{ id, names }] })` from
  `js/answerMatch.js`, then `check(guess, id)`. It ignores case, accents,
  spaces and punctuation, and forgives small spelling mistakes (none up to
  4 letters, 1 for 5–8, 2 for 9–12, 3 for longer) and doubled letters. It
  never accepts another valid answer, or a guess that is as close to one.
- **Other names:** each answer lists every name it accepts. Countries use the
  central `js/data/countryAliases.js`. A game with other kinds of answers
  keeps its own list next to its data (for example `js/data/<game>Aliases.js`),
  and never lists a name that belongs to two answers.
- **Input:** letter tiles on phones (slots plus scrambled tiles with decoys,
  1.5×, 1.75× or 2× the letters by `api.config.difficulty`). Typing on a
  keyboard picks tiles. Catch keys in the capture phase, because Backspace is
  the app's "back" key.
- **Rules that stay:**
  - Expert gets extra seconds and a bonus.
  - Expert is not the ranked standard (`customRules`).
  - Daily, challenge and rooms keep their standard settings.
  - In online rooms, the server referee checks the spelling (the crew
    runner already loads `answerMatch.js`); the phone never decides.
- **Tests:** aliases, spelling mistakes, doubled letters, short answers,
  other answers rejected, and every answer spellable from its own tiles.

## The list

### Done

| Game | File | Notes |
|---|---|---|
| Guess the Country | `js/games/guessCountry.js` | Letter tiles, country aliases, shared checker (66bb617). Rooms play Normal choices. |
| GeoSpin | `js/games/geoSpin.js` | Letter tiles from the start; the server referee checks answers in rooms. |

### Already upgraded, Expert still missing

These games have had their full upgrade but have no Expert level yet. Do
these first: the rest of the game is already in good shape.

| Game | File | What to spell | Other names to accept |
|---|---|---|---|
| Who Am I? (Bible) | `js/games/bibleGames.js` | The person from the clues | Saul / Paul, Simon / Peter / Simon Peter, Abram / Abraham, Jacob / Israel… (two people may share a name: those need the full name) |
| Books of the Bible | `js/games/bibleGames.js` | The book's name | 1 Kings / First Kings / I Kings, Song of Songs / Song of Solomon, Psalm / Psalms |
| Bible Quiz | `js/games/bibleQuiz.js` | "Who said it" and "finish the verse" questions only; choice, true/false and order stay as they are | Same person names as Who Am I; the missing word must be exact for words of 4 letters or fewer |
| Verse Rush | `js/games/bibleGames.js` | "Find where it is": spell the book. Building the verse from pieces already works like tiles. | Book names as above |

Upgraded games where Expert spelling does **not** apply: Ball Swap,
SortRush, Number Rush, Remember the Sequence, Blink & Remember, Imposters,
WordFlow, and Stacoend (Stacoend is typed already, and its words must be
real words spelled right: no forgiveness).

### Not upgraded yet: include Expert when they are

| Game | File | What to spell | Other names to accept |
|---|---|---|---|
| Capital Challenge | `js/games/worldGames.js` | The capital city | Kyiv / Kiev, Washington / Washington DC, Mexico City / Ciudad de México… A city that is also a country (Singapore, Monaco) is fine. |
| Where in the World? | `js/games/worldGames.js` | The country | `js/data/countryAliases.js` |
| Map Challenge | `js/games/worldGames.js` | Continents, countries and capitals | Country aliases; continents: America is too vague (North / South America) |
| Guess the Landmark | `js/games/visualGames.js` | The landmark | Statue of Liberty / Liberty, Big Ben / Elizabeth Tower, Taj Mahal… |
| Guess the Animal | `js/games/visualGames.js` | The animal | Hippo / Hippopotamus, Rhino / Rhinoceros |
| Guess the Food | `js/games/visualGames.js` | The food | Chips / Fries / French fries, Aubergine / Eggplant |
| Guess the Object | `js/games/visualGames.js` | The object | Phone / Mobile phone / Cellphone |
| Guess the Sport | `js/games/visualGames.js` | The sport | Football / Soccer (choose one meaning for the game), Ping pong / Table tennis |
| Guess the Vehicle | `js/games/visualGames.js` | The vehicle | Lorry / Truck, Motorbike / Motorcycle |
| Guess Who / What | `js/games/quizGames.js` | The person or thing from the clues | Per answer |
| Picture Quiz | `js/games/quizGames.js` | Only questions whose answer is a name | Per answer |
| Visual Riddle | `js/games/puzzleGames.js` | The riddle's answer word | Per answer, singular and plural |
| What's Missing | `js/games/memoryGames.js` | Name the item that vanished (Expert only; pick it on the other levels) | Per emoji: Car / Automobile |
| Number Challenge | `js/games/numberGames.js` | The number, on a number pad | None: numbers must be exact (no spelling forgiveness) |

### Needs a decision

| Game | File | Question |
|---|---|---|
| Guess the Flag | `js/games/worldGames.js` | It is the same game as Guess the Country. Retire it, or point it at Guess the Country, rather than adding Expert twice. |
| Quiz Mix, Brain Battle | `js/games/quizMix.js`, `js/games/quizGames.js` | General trivia with choices. Expert would only suit questions with a short name for an answer; worth it only if the question bank marks those. |

### Expert spelling does not apply

These answer by tapping, timing, drawing, voting or acting:

- True or False
- Quick Tap, Color Reaction
- Memory Match, Picture Memory
- Picture Puzzle, Spot the Difference, Hidden Object
- Higher or Lower
- Letter Rush
- Charades, Visual Charades, Don't Say It, Drawing Challenge, Pictionary
- Would You Rather?, This or That, Who Is Most Likely?

Word games are already about spelling, and their answers must be exact:

- Word Scramble
- Word Builder
- Word Chain
- Mini Crossword
