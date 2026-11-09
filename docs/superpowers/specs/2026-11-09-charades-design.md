# Charades rebuild: design

Date: 2026-11-09. Game id stays `charades`, name stays "Charades".
Branch `feat/charades` (worktree from origin/main at aa87d46).

## Intent

Charades is one of the most played party games in the world, and PlayMona's
version doesn't do it justice. Today it is a plain screen shared with
Don't Say It: tap Reveal, see one word (about 140 single words), a 60 s count,
and Correct / Pass / Skip, where Pass and Skip do the same thing. There are no
teams, no titles, no signals and no recap, and it looks nothing like the newer games.

Brighton wants it rebuilt to be **correct** (played the way the world plays it),
**modern** (the way families play it on a phone today) and with **the same
UI feel as GeoSpin** (dark glossy arcade look, glass cards, gold, chunky 3D
buttons, timer ring, setup screen, recap).

Success: a family passes one phone around the living room, teams shout
guesses, the actor races through cards in 60 seconds, and at the end of each
turn everyone laughs at the recap. It feels like a polished party app, not a
word list.

## How charades is played (research, 2026-11-09)

- **Classic (UK/US parlour):** two teams. Each team writes secret titles for
  the other team to act: films, books, songs, TV shows, plays and sayings,
  up to about 7 words. The actor acts in silence while their own team guesses
  against a clock (1–3 min). No talking, mouthing, spelling, pointing at
  objects or sounds.
- **Standard signals:**
  - Category: film (crank an old camera), book (open your hands like a book),
    song (sing), TV show (draw a screen), play (pull a curtain rope or bow),
    saying or quote (air quotes).
  - Words and syllables: fingers up for the number of words, then for which
    word you're on. Fingers on the forearm for syllables.
  - Other signals: sounds like (hand cupped at the ear), small word (finger and
    thumb close together), whole idea (big sweep of both arms), longer (stretch
    elastic), shorter (karate chop), plural (link little fingers), past tense
    (wave a hand back over your shoulder), "on the nose" (touch your nose, point
    at the guesser), keep going (beckon or roll your hands).
- **Scoring:** a point per title guessed. Some groups give the other team a
  point for a miss. Serious groups add up the time and the lowest total wins.
- **India's "dumb charades":** mostly film titles, plus a language signal
  (thumbs up English, down Hindi, sideways a regional language).
- **Modern phone style (party apps):** 60 s turns, single words or short
  phrases from themed decks, as many cards as you can, fast Got it / Pass,
  recap at the end of the turn.

PlayMona follows the modern phone style (Brighton's pick) and keeps the classic
rules and signals: the silent-acting rules on the hand-over screen, the
category signal on title cards, and a signals sheet.

## Goals

- Fast-round turns: the actor gets a timer and acts as many cards as they can.
- Teams of 2–4, points per guessed card, actors rotate inside each team.
- About 600 cards in ~12 themed decks, each card tagged easy / normal / hard.
- Optional acting twists.
- A recap after every turn, and a podium at the end.
- A theatre-spotlight stage with GeoSpin's arcade parts.
- A signals sheet showing the standard gestures.
- Fits a phone screen without scrolling while acting.
- The TV display mode restyled to match.

## Non-goals

- **No online rooms** in this job (Brighton: same room + TV first; rooms may
  come later). No server referee, no crew players.
- **Visual Charades and Don't Say It are untouched.** They keep using
  `runRevealGame` in `js/games/creativeGames.js`.
- No leaderboard, daily or friend-challenge support. It's a party game, and
  the score depends on the people guessing, not the player.
- No phone-tilt or forehead mode.
- No new art inside the game. Curtains, spotlight, bulbs and signal drawings
  are CSS and inline SVG. Only the cover is an image (prompt below).

## Anti-goals

- Anything that looks flat, plain or like the old screen. Judge it next to GeoSpin.
- Leaking the card. Nobody but the actor should see the word before or during
  the turn: the hand-over screen shows no card, and the recap only comes after
  the timer.
- Making the actor aim at small buttons while acting. Got it and Pass must be
  huge and also work by swiping.
- Cards that are rude, scary or need adult knowledge on Easy. Every deck must
  be family-safe, and Easy must be actable by a 6-year-old.

## Brighton's decisions

- **Turns:** fast rounds. The actor acts as many cards as they can before the
  timer ends, taps Got it or Pass on each, and then sees a recap.
- **Cards:** themed decks, about 12, about 600 cards, tagged easy/normal/hard.
  Titles show their category signal.
- **Teams:** 2–4 teams, points per guessed card, actors rotate within the
  team. One team (or individuals) plays as a group high score.
- **Online:** same room and TV display first. No rooms now.
- **Look:** theatre spotlight. Dark velvet stage, red curtains at the edges, a
  gold spotlight on the card and marquee bulbs around the title, with
  GeoSpin's glass panels, arcade buttons and timer ring.
- **Twists:** optional, off by default. About 1 card in 4 gets one, worth +1.
- **Passes:** free, and listed in the recap.
- **Visual Charades:** left alone.
- **Bible deck:** part of Mixed by default.
- Brighton approved this document on 2026-11-09, with Claude's calls on uneven
  teams and on ignoring the app-wide length and timer settings.

## The game

### Who plays

The standard game details screen already chooses players and teams
(`FF.Teams`, "Play as: Individuals / Teams"). Charades uses what it gives:

- **Team mode** (`api.config.mode === 'team'`): `api.config.scorers` are team
  entities `{ id, name, color, players: [playerIds] }`. Teams take turns, A, B,
  C, A, B, C. Inside a team the actor rotates through its `players` in order.
  A team with no players present is skipped.
- **Individuals** (`turn` mode, 2+ players): each player is their own scorer
  and acts in turn. Everyone else guesses and nobody else scores on that card.
  This is the "each actor scores their turn" fallback.
- **Solo** (1 player): one "group" scorer. Turns repeat for the chosen number
  of turns, and the score is the group's high score for the night.
- `modes: ['solo', 'turn', 'team']`, `defaultMode: 'team'` when 2+ players
  *(Claude's call: charades is a team game; the registry already falls back to
  `turn` when teams can't be made)*.

### Setup screen (Charades' own, like GeoSpin's)

On the theatre stage, a glass panel with:

- **Decks:** a grid of chunky deck tiles to toggle, each with a small inline
  glyph and its card count. **Mixed** (all decks) is on by default. Turning on
  any single deck turns Mixed off. Turning off the last deck turns Mixed back on.
- **Level:** Easy / Normal / Hard (segmented). Easy uses only easy cards.
  Normal uses easy + normal. Hard uses normal + hard.
  *(Claude's call: so a deck never runs dry, and Hard still has variety.)*
- **Turn length:** 30 / 60 / 90 s, default 60.
- **Turns each:** 1 / 2 / 3, default 1. In team mode that's turns per team
  member (every player acts that many times). Solo, it's the number of turns.
  **Uneven teams** *(Claude's call)*: every team gets the same number of turns,
  `biggest team size × turns each`, so points stay fair. In a smaller team the
  first members act again (rotation wraps). The hand-over screen says
  "Ama acts again: Team Blue has fewer players".
- The app-wide **length** and **timer** settings are ignored. The setup's
  turn length and turns each decide them *(Claude's call: Charades' own setup
  is clearer, like GeoSpin's)*.
- **Twists:** Off / On, default Off.
- **Signals** button (opens the signals sheet) and a big green **Start** button.
- Choices are remembered per device (`charades:setup`, versioned like
  What's Missing's `:v2` so later changes can migrate).

### A turn

1. **Hand-over screen.** A spotlight on the actor's name and avatar in their
   team colour: "Pass the phone to Ama (Team Red). Only Ama looks." Below it,
   the three golden rules in one line each: no talking, no spelling, no
   pointing at things. A big **I'm ready** button. Team scores sit in a slim
   bar at the top.
2. **3-2-1 countdown** in the spotlight, with tick sounds.
3. **Acting.** The screen is built to be held facing the actor:
   - A big card in the spotlight with the word or title, plus the deck name as
     a small chip. Title cards (films, songs, books, TV, sayings) also show the
     category signal as a small drawing with a label ("Film: crank the camera")
     and the word count ("3 words").
   - With twists on, about 1 card in 4 shows a gold ribbon: "Twist: in slow
     motion (+1)".
   - The GeoSpin-style timer ring in the corner drains gold, turning red with a
     warning tick in the last 5 s.
   - Two huge arcade buttons fill the bottom: **Pass** (blue, left) and **Got
     it** (green, right, wider). A swipe up on the card is Got it, a swipe down
     is Pass. Each answer flicks the card off (up green, down grey) and deals
     the next one at once.
   - A small counter shows cards guessed this turn.
   - When time runs out mid-card, that card counts as passed. There's a
     "Time!" stamp and a buzzer.
4. **Turn recap.** A list of every card in order, ticked green (guessed) or
   grey (passed), twists marked. The points for this turn count up. Before
   moving on, the actor can fix a mis-tap by tapping a row to flip
   guessed ↔ passed *(Claude's call: mis-taps happen while acting, and the
   group sees the recap together, so it stays fair)*. Then the scoreboard
   (team rows, GeoSpin's `gs-row` style) and a **Next: Kofi (Team Blue)** button.

### Scoring

- Guessed card: 1 point. Guessed twist card: 2 points. Passed: 0.
- No penalty for passes. Passes appear in the recap.
- No points for the other team. Charades is acted for your own team.
- The winner has the most points. A tie is shared (`api.end` with the tied
  `winnerId` per the scoring module's usual handling).
- Per-player stats for the end screen: cards guessed while acting, and best turn.

### End of game

A podium in the spotlight with the winning team or player, confetti
(`FF.confetti` if present), final team scores, "Best actor: Ama, 9 cards in
60 s", and the normal `api.end(results)` to hand over to the shell's results
and play-again flow.

### Signals sheet

A sheet (`FF.UI` sheet, or a GeoSpin-style glass overlay) with about 14 signals,
each an inline SVG stick-figure pose and a one-line description:
film, book, song, TV show, play, saying, number of words, which word,
syllables, sounds like, small word, whole idea, plural, past tense, on the nose.
It can be opened from setup, the hand-over screen and the acting screen
(a small "?" icon button). During a turn the timer keeps running.

### Cards

New data file `js/data/charadesDecks.js` → `FF.data.charadesDecks`:

```js
[{ id: 'animals', name: 'Animals', glyph: 'paw', kind: 'word',
   cards: [{ t: 'Elephant', l: 'e' }, { t: 'Penguin', l: 'e' }, ...] },
 { id: 'films', name: 'Films', kind: 'title', signal: 'film', cards: [{ t: 'The Lion King', l: 'e' }, ...] }]
```

`l` is `e` / `n` / `h`. `kind: 'title'` decks show the signal and word count.

Twelve decks, about 50 cards each (≥ 15 easy, ≥ 15 normal, ≥ 10 hard per deck):

| Deck | Kind | Examples |
|---|---|---|
| Animals | word | elephant, penguin (e), chameleon (h) |
| Actions | word | brushing teeth (e), changing a tyre (n), parallel parking (h) |
| Jobs | word | chef (e), plumber (n), air-traffic controller (h) |
| Sports & games | word | football (e), hula hoop (n), synchronised swimming (h) |
| Food & cooking | word | eating spaghetti (e), flipping pancakes (n), sushi chef (h) |
| Around the house | word | vacuuming (e), assembling furniture (h) |
| Feelings & faces | word | happy (e), embarrassed (n), jealous (h) |
| Films | title | The Lion King (e), Jurassic Park (n) |
| Songs | title | Happy Birthday (e), Twinkle Twinkle Little Star (e), well-known family-safe pop titles (n/h) |
| Books & stories | title | Cinderella (e), Harry Potter (n), Robinson Crusoe (h) |
| TV & characters | title | Peppa Pig, SpongeBob SquarePants |
| Bible | title (signal: book) | Noah's Ark (e), David and Goliath (e), Jonah and the whale (n) |

- Titles are just names (no plot text), family-safe, and widely known across
  Africa, the UK and the US. Brighton's audience includes Zambia, so avoid
  very US-only titles on Easy.
- No real living people (the classic rule bans acting people, and it avoids
  likeness issues).
- The old `FF.data.party.charades` list stays for the TV display fallback and
  for Visual Charades, which reads `p.charades` when it has no pictures. The new
  decks reuse its words where they fit.

### Twists

`FF.CharadesRules.TWISTS` (about 10): in slow motion, one hand only, as a robot,
with your eyes closed, sitting down, on tiptoe, as a tiny mouse, really
angrily, underwater, as if you're freezing. Chosen at random per card at about
25% when twists are on, never two twists in a row.

### TV display (`displayStart`)

Kept as "everyone acts": the TV cycles cards for the whole room to act
together. Restyled into the theatre stage (spotlight card, curtains, bulbs)
instead of the plain `dsp-` deck. It draws cards from the chosen decks
(all decks, normal level) *(Claude's call: the current TV mode already works
this way, and secret cards don't make sense on a shared screen)*.

## Look: theatre spotlight

- **Scope:** `.ch-` classes in `css/games.css`, in a new block after GeoSpin's.
  Theatre colours are game-local custom properties on `.ch-shell` (like
  GeoSpin's `--gs-*`): `--ch-velvet` (deep plum-black), `--ch-curtain` (rich
  red), `--ch-curtain-deep`, `--ch-gold`, `--ch-gold-hi`, `--ch-ink`,
  `--ch-ink-soft`, `--ch-glass`, `--ch-line`. They reuse GeoSpin's
  green/blue arcade button colours. Colours must pass
  `node tools/contrast-check.js` where it covers them.
- **Stage:** velvet background with a soft radial gold spotlight behind the
  card. Two red curtain edges (CSS gradients with fold shading) at the left
  and right, narrowed on phones. A row of marquee bulbs (small radial-gradient
  dots, gently chasing, with motion off when reduced motion is on) above the
  "Charades" title on setup and hand-over.
- **Parts copied from GeoSpin's look:** glass cards, chunky 3D buttons with
  inset highlight and drop "lip", the timer ring (SVG arc), chips, the
  scoreboard row, the stamp animation and the rise animation. Copy the look
  into `ch-` classes rather than reusing `gs-` classes, so GeoSpin changes
  can't break Charades.
- **Phones:** while acting, nothing scrolls. Card in the middle, buttons at
  the bottom with at least 72 px height, timer top-right. Two-column layout
  from 900 px (card left, scoreboard and signals right), like GeoSpin.
- Sentence case, no emoji in buttons, strings via `FF.t(key, fallback)` with
  `ch`-prefixed keys. Respect `FF.Audio` sounds (`tap`, `correct`, `click`,
  `warning`, `roundEnd`, `winner`) and the animations setting.

## Code layout

- `js/charades/rules.js` → `FF.CharadesRules` (pure, testable):
  `LEVELS`, `SECONDS`, `TURNS`, `TWISTS`, `sanitize(setup)`,
  `pool(decks, setup)` (cards for the chosen decks and level),
  `Dealer(pool, rand)` (shuffled, no repeats until the pool runs out, then
  reshuffles while avoiding the last few), `twistFor(rand, prevHadTwist)`,
  `points(card)`, `turnOrder(scorers, players, turnsEach)` (the list of
  `{ scorerId, actorId }` turns), `wordCount(title)`.
- `js/data/charadesDecks.js` → `FF.data.charadesDecks`.
- `js/games/charades.js`: `FF.registerGame({ id: 'charades', … })` with
  setup, hand-over, countdown, acting, recap, podium, the signals sheet and
  `displayStart`. Remove the Charades block from `creativeGames.js` (keep
  `runRevealGame` for the others, and update that file's header comment).
- Add the three scripts to `play.html` (before `charades.js` loads),
  `tools/load-check.js` and `tools/test-seed.html` if it lists game scripts.
  Check `sw.js` for a precache list.
- Tests in `tools/test/charades.test.js` (harness like `whatsMissing.test.js`):
  - every deck has ≥ 40 cards and every level has enough
  - no duplicate cards across decks
  - `pool` respects the level rules
  - the dealer doesn't repeat until the pool runs out
  - twists come at about 25% and never twice in a row
  - `turnOrder` rotates the actors inside teams, skips empty teams and
    gives every player the same number of turns
  - points
  - `sanitize` resets bad saved setups
- The cover: `assets/images/covers/charades.webp` from Brighton's Codex run,
  processed with `tools/process-game-art.py charades`, then
  `node tools/gen-asset-manifest.js`. The prompt is in `docs/art/charades-prompts.md`.

## Left to the builder

- Exact deck wording and the final card list (keep within the rules above).
- Signal pose drawings, bulb animation timing, sound choices.
- Exact layout numbers, as long as the phone rules hold.
- Whether the signals sheet uses `FF.UI.sheet` or a game-local overlay.

## Testing

- `node tools/test/run.js` (or the project's usual test command), all passing.
- `node tools/load-check.js`.
- In the preview (port 8960, `node tools/serve.js`):
  - play a 3-team game at phone size and at desktop size
  - check: no card shows before I'm ready, swipe and buttons both work, time
    runs out mid-card, recap flipping, rotation inside teams, the end podium,
    twists on, the signals sheet, the TV display
  - check light and dark app themes (the stage is always dark, like GeoSpin)
- Screenshots of setup, acting and recap for Brighton.
