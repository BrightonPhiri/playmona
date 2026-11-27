# One settings screen, one end screen

Date: 2026-11-27. Branch: `feat/one-end-screen`, cut from `feat/points-rebalance` (PR #43), because both change the same game files.

## Why

Brighton's polish list, item 2: every game should have one place to set it up and one place to finish. Today:

- **Two settings screens.** 23 games ask twice: the game page asks for Difficulty, Game length and Time per turn, then the game's own setup screen asks again.
- **Two end screens.** 25 games show their own results first, then the player taps "See results" and gets the platform's results screen. Room games add a third step, the room podium.

Both repeats make the site feel unfinished. The single end screen is also where the coming medals and Hall of Fame work will show what a game earned.

## Goals

- A game with its own setup screen has one settings screen: its own. The game page no longer shows Options for it.
- Every game, solo, pass-the-phone and online room alike, finishes on one shared end screen. It shows:
  - the score;
  - any personal best;
  - the places;
  - the game's stats;
  - the XP earned;
  - the leaderboard place;
  - the buttons.
- The look-back lists people actually read stay: Stacoend's rounds, Charades' cards, What's Missing?'s answers.
- Play again repeats the same settings in one tap.
- The end-screen buttons are all the same size.

## Non-goals

- Medals and the Hall of Fame. These are later projects; this screen leaves room for them.
- TV display results (`showDisplayResults`). They have no points, so they stay as they are.
- The between-rounds screens of a tournament, and the Celebrations team games in `js/celebrate/`.
- Any change to points.

## Anti-goals

These would make the work a failure even if it technically works:

- A tap needed to see your own score.
- A game's useful look-back list lost.
- Play again getting slower than today.
- A game ending on anything other than the shared screen.

## Approaches

1. **Numbers only.** Each game sends its numbers; the platform draws everything. This is the most uniform, but the accuracy rings become plain tiles and anything that isn't a stat or a list, such as a grid or drawings, is lost.
2. **Numbers plus one game panel.** Picked by Brighton. Everything in 1, plus a game may add one section in a set frame below the stats. The top half looks the same in every game, and the useful look-backs stay.
3. **A kit each game builds from.** The platform provides shared pieces and each game assembles its own end screen. It is the most flexible, but the games only look alike if each one is careful, so it drifts back to 25 end screens.

## Settings: what changes

- **A game declares that it has its own setup** with `setup: true` on its `FF.Games.register` definition. This is my call; a flag reads better than guessing from the code.
  - The 23 games with `setup: true`: ballSwap, the three Bible games, bibleQuiz, blinkRemember, charades, miniCrossword, geoSpin, guessCountry, hiddenObject, logoRush, numberChallenge, numberRush, pictureRush, sayWhat, rememberSequence, sketchBack, sortRush, spotDifference, stacoend, whatsMissing, wordShift.
- **For a `setup: true` game, the game page keeps:**
  - the cover;
  - How to play;
  - Who is playing (with Play as: Individuals / Teams);
  - a single Sound effects switch;
  - the Play button.

  The Options section (Difficulty, Game length, Time per turn, Play style) is not shown. Play goes straight to the game's own setup screen, as today.
- **Any platform option a `setup: true` game still reads moves into that game's own setup screen** as a field. After the change, the platform's saved choices must not change how the game plays. From the audit:
  - `config.timer`:
    - Bible games, bibleQuiz, blinkRemember, rememberSequence and whatsMissing read it.
    - Each one either gets a seconds field or keeps the seconds field it already has.
  - `FF.GameLength`, the rounds-or-clock picker:
    - Bible games, bibleQuiz, geoSpin, guessCountry, logoRush and whatsMissing use it.
    - Each one gets the existing `FF.GameLength.picker` as a "Game length" field in its own setup.
  - `config.difficulty`, used to seed a game's setup defaults:
    - The defaults come from the game's own saved setup, or its standard settings.
    - The platform's Difficulty no longer feeds in.
  - Charades' TV display choice moves into Charades' own setup as "Play style".
- **Games without their own setup keep the Options section as it is today:** Letter Rush, Memory Match, Quiz Mix, Guess Who, Quick Tap, Word Scramble, Word Chain, Guess It!, Imposters and WordFlow. Guess It! and Quiz Mix keep their topic pickers.
- **Unchanged:** daily, friend-challenge and celebration runs still skip setup and play the standard settings.

## End screen: what it shows

The order, top to bottom:

```
 [trophy badge]
  Stacoend · Mixed · 4 rounds          ← kicker (the game's settings line)
  18 words found!                      ← headline
  ┌──────────────────────────┐
  │        142  points       │         ← solo: the big score, counting up
  │   ★ New personal best!   │            (or "Your best on these settings: 160")
  └──────────────────────────┘
  ── or, 2+ players ─────────────
   🥈 Amy 96   🥇 Ben 142   🥉 Cat 80   ← podium for the top three
   1 Ben   18 words · 82%      142      ← table: place, face, name, the game's line, points
   2 Amy   12 words · 75%       96
  ───────────────────────────────
  [ Words 18 ] [ Accuracy 82% ] [ Longest STARLIGHT ] [ Rare 2 ]   ← stat tiles (up to 6), or a ring
  ┌ What you earned ─────────────┐
  │ +50 XP   Level 4 ▓▓▓▓▓░░ 60/250 │    ← XP strip with the level bar
  │ 🏆 Top 10 this week          │    ← leaderboard place, when there is one
  └──────────────────────────────┘
  ▸ Round by round                     ← the game's panel or rounds list (open on wide screens)
  [ Play again ] [ Change settings ]   ← buttons, all the same size
  [ Challenge a friend ] [ Other game ] [ Home ]
```

- **Headline.** It comes from the game. The default is "Well played!" solo, "{name} wins!", or "It's a tie!".
- **Score.**
  - Solo: one big number that counts up, unless reduce-motion is on.
  - 2 or more: a podium for the top three, then the full table. Each row shows the game's short line, for example "12 words · 75%".
  - Rooms use the same layout, with the room's ranked results.
- **Personal best.** The game says whether this run is a new best, or what the best was. The platform only shows it.
- **Stats.** Up to 6 tiles, each with an icon, a label and a value. A game may instead send one ring (a value from 0 to 1 and a label) with up to 3 tiles beside it.
- **What you earned.**
  - XP: the XP added by `FF.Stats.recordResult`, with the level bar from `FF.Stats.level`.
  - Leaderboard place: the existing week or all-time place, or the daily place, shown as a line here in place of today's pop-up. It may arrive after the screen draws: the line shows "Checking the leaderboard…" and is filled in or removed when the answer comes.
  - The confetti stays.
  - Medals will join this strip in the medals project.
- **Panel.** At most one per game, drawn below the stats in a frame headed with the game's title (for example "Round by round" or "Your cards"). It is open by default on wide screens and folded on phones. A game sends either `rounds`, a list the platform draws, or `panel`, a function that fills the frame. A game sends one of them, not both.
- **Buttons** (one size, two per row on phones):
  - Normal run:
    - Play again: the same settings with no setup screen.
    - Change settings: opens the game's setup, shown only for `setup: true` games.
    - Challenge a friend: shown when the run can become one.
    - Choose another game.
    - Home.
  - Daily: Daily leaderboard, Home.
  - Friend challenge: See who won, Home.
  - Celebration: the existing status line, then Back to the party.
  - Room:
    - The host gets Play again.
    - Everyone gets Back to the room.
    - A guest sees "Waiting for the host…".

## The game's side: one call

A game ends with `api.end(payload)` and nothing else. It draws no results screen of its own, and nothing calls "See results". The payload keeps today's fields (`results`, `winnerId`, `bestStreak`, `fastest`, `mostWords`, `quizCorrect`, `achievements`) and adds one optional field, `summary`:

```js
summary: {
  kicker:   'Mixed · 4 rounds',        // string, optional
  headline: '18 words found!',         // string, optional
  best:     { isNew: true } | { value: 160 },   // the account holder's best, optional
  lines:    { <resultId>: '12 words · 75%' },   // the short line per table row, optional
  stats:    [{ icon: 'text-aa', label: 'Words', value: '18' }],   // up to 6
  ring:     { value: 0.82, label: 'Accuracy' },  // optional, then at most 3 stats
  rounds:   [{ label: 'START BR', mark: 'right'|'wrong'|'skip'|null, points: 24, note: '4 words' }],
  panel:    { title: 'Your cards', draw: function (el) { /* fills el */ } }
}
```

Every field is optional. A game that sends no `summary` gets the default screen: places, points and today's streak and fastest stats. A summary that breaks the limits is trimmed, not refused: stats beyond 6 are dropped, and if both `rounds` and `panel` are sent, `panel` wins. In a room, each phone shows the room's places and its own player's summary.

**Play again with the same settings.** `FF.GameFlow.launch(id, { skipIntro: true, replay: true })` sets `config.replay`. A `setup: true` game that sees `config.replay` and has a saved setup plays it straight away. With no saved setup it shows its setup. Change settings launches with `skipIntro: true` and no replay.

## What goes away

- Each game's own results function and its "See results" button: the 25 games in the audit.
- The room podium step in `js/net/parallel.js` (its "See results" step). The podium is now part of the shared screen.
- The post-game leaderboard pop-up from `FF.Leaderboards.afterGame` and `FF.Daily.finish`. The place becomes the line in "What you earned".
  - `FF.Leaderboards.celebrate` stays for any other caller, such as WordShift's server-scored places, which also move to the line.

## Where the code lives (my calls)

- A new file, `js/endScreen.js`, holds `FF.EndScreen.render(container, data)`. It draws only, from plain data, so the Node harness can test it.
- `FF.GameFlow.showResults` in `js/registry.js` builds the data and calls it.
- Styles go in the existing results stylesheet, using the design-system tokens.
- New strings get i18n keys with English fallbacks, as elsewhere.

## Testing

- `FF.EndScreen` gets harness tests:
  - each part draws from data;
  - limits are trimmed;
  - solo against 2+ players;
  - the button set for each run type;
  - the leaderboard line arriving late, or never.
- Every migrated game gets a test that its finish calls `api.end` with a `summary`, and that nothing on screen says "See results".
- `setup: true` games:
  - a test that the game page shows no Options;
  - a test that `config.replay` with a saved setup skips the setup screen.
- The suite stays at its current baseline (3 known failures).
- Browser pass:
  - one solo game, one pass-the-phone game and one room game played to the end;
  - a phone-width check and a dark-mode check of the end screen.

## Left to the builder

- The exact icons, tile wording and panel titles for each game, taken from what each game's results show today.
- Which of today's per-game numbers become tiles, the ring or the table line. Keep what the old screen showed, up to the limits.
- The order in which games migrate. The shared screen lands first, with the default screen working for every game, then games move one at a time.
