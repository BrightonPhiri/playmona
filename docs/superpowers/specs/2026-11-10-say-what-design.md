# Say What?: fill the missing word of a saying

Date: 2026-11-10. New game, id `sayWhat`, name "Say What?".
Branch `feat/saywhat`, worktree from origin/main at 3e909a1b (the OneDrive
checkout is behind and git there fails on `js`).

## Intent

Brighton wants a game where players see a well-known saying with one word
missing and fill the gap: "____ wasn't built in a day" → **Rome**. A saying can
come back with a different word missing ("Rome wasn't ____ in a day" → **built**),
but never twice in the same round. A saying with only one good gap is used once.

It must have a great UI, at least the standard of Logo Rush and GeoSpin.

Success: a family plays a round on one phone or online, laughs at the near
misses, and learns what the sayings mean from the reveal.

## Goals

- About 300 sayings in four packs: **Everyday** (English proverbs and idioms),
  **African proverbs**, **Bible** (KJV wording) and **Kids** (easy, well-known).
  Each saying is tagged easy / normal / hard.
- **Default answer: letter tiles.** An on-screen board of tiles showing
  **twice the answer's letters**, shuffled, with decoys (ROME → 8 tiles such as
  N O R L M E T I), never the full keyboard. A physical keyboard picks tiles.
- **Option: choices.** Tap one of 4 words.
- **No-repeat rule** (below).
- **Reveal:** the full saying lights up, with a one-line plain meaning.
- **Streak bonus** with a flame counter.
- **Two gaps on Hard:** some Hard sayings hide two words at once.
- **Two looks,** picked on the setup screen and remembered per device:
  **Speech bubble** (the cover's world, default) and **Chalkboard**.
- **Modes:** Solo, Turns (pass one phone, each player gets their own saying),
  and Online Race (everyone gets the same saying, a server referee scores it,
  crew players can fill seats).
- The cover from Brighton (prompt pack `docs/art/sayWhat-prompts.md`).

## Non-goals

- No hint button (Brighton said no).
- No "say it out loud" or host-judged mode.
- No teams mode.
- No new art inside the game. The bubble, chalkboard, pills and flame are CSS
  and inline SVG. Only the cover is an image.
- No free typing in a text box. Answers come from tiles or choices only.

## Anti-goals

- The same saying twice in one round, even with a different gap.
- A gap that isn't fair: a word that many other words fit equally well
  ("A ____ in time saves nine" with *stitch* is fine. Blanking *a* or *in* is not).
  Gaps are only nouns, verbs and strong adjectives that make the saying recognisable.
- A wrong choice that is also a real, accepted form of the saying.
- Sayings that are rude, scary, violent or need adult knowledge in Kids or on Easy.
- Plain or flat screens. Judge it next to Logo Rush.
- Scrolling on a phone while answering (375 × 667 must fit).

## Brighton's decisions (2026-11-10)

- Name **Say What?**. Cover prompt written, image to come from Codex.
- Answering: tiles by default (2× the letters, scrambled), choices as an option.
- Sayings: mixed packs, as listed above.
- Modes: Solo, Turns, Online Race with crew.
- Extras: meaning at reveal, streak bonus, two gaps on Hard. No hint.
- Look: Speech bubble and Chalkboard, the player picks.
- No visual mockups needed: build straight from this document.

## The sayings data: `js/data/sayings.js`

`FF.data.sayings = { PACKS, rows }`. One row per saying:

```js
{ id: 'rome', pack: 'everyday', level: 'easy',
  text: '{Rome} wasn\'t {built} in a day',
  meaning: 'Big things take time.',
  decoys: { Rome: ['Paris', 'London', 'Athens', 'Cairo'], built: ['found', 'made', 'won', 'cleaned'] },
  also: { built: ['made'] } }
```

- `{word}` marks every word that may be a gap. A saying has 1–3 gaps.
  The text is the commonly known form (Bible pack: KJV wording,
  "The love of {money} is the root of all {evil}").
- `decoys` per gap: 4 to 6 plausible wrong words, same word class, that do
  **not** make another real saying or an accepted form. Decoys use the gap's
  own case (proper nouns capitalised).
- `also` (optional): other words that are genuinely accepted in that gap. They
  count as right if spelled, and never appear as decoys. Tiles deal the main word.
- `two` (optional, Hard only): a pair of gap words that may be hidden together,
  e.g. `two: ['Rome', 'built']`. Only sayings with a `two` pair can come up as
  a two-gap saying.
- Ids are unique, short and stable (history depends on them).
- Packs: everyday ≈ 140, african ≈ 60, bible ≈ 50, kids ≈ 50.
  African proverbs are the widely quoted forms ("It takes a village to raise
  a {child}", "If you want to go {fast}, go alone; if you want to go {far}, go
  together"), not invented ones. *(Claude writes the list; counts may move by
  ±10 per pack to keep only strong sayings.)*
- A tools check (`tools/saywhat/check.js`, also run by the tests) proves: every
  gap is in the text, every gap has ≥ 4 decoys, no decoy equals the gap or an
  `also`, no duplicate ids or duplicate texts, `two` pairs name real gaps, only
  letters/digits/apostrophes/hyphens in gap words, and Kids rows are easy.

## The no-repeat rule

A **deal item** is one saying with one gap (or one `two` pair). Rules, pure and seeded:

1. **Within a round:** a saying appears at most once, whatever gap. This holds in
   every mode, including online and Turns (all players share the round).
2. **Across rounds on this device:** every (saying, gap) item is played once
   before it can come back. A saying with several gaps returns in later rounds
   with a gap not yet used. A one-gap saying therefore never repeats until the
   whole pool has been played. A two-gap item marks both of its gaps used.
3. **Pool runs dry:** when the chosen packs and level have fewer fresh sayings
   than the round needs, the history for that pool is cleared and the round is
   filled from all of it (still one per saying). *(Claude's call.)*
4. **Round bigger than the pool** (Turns with many players on one pack, e.g.
   20 × 4 = 80 on Kids): the round is **capped at the number of sayings in the
   pool**, and the setup shows "Kids has 50 sayings, so this round has 50". Rule 1
   always wins over the round length. *(Claude's call.)*
5. **Pack and level with no sayings:** the **Kids pack plays at every level**
   (its rows are all easy, it ignores the level filter). For other packs, each
   Level button shows how many sayings the chosen packs have at that level,
   a level with 0 is disabled, and the picked level moves to the nearest one that
   has sayings. *(Claude's call.)*
6. History lives in `FF.Storage` key `sayWhat:seen` (a map of item keys
   `id#gap`). Solo and Turns rounds both write to it. Daily, challenge and online
   rounds are seeded and do not read or write history (everyone must get the same
   deal). *(Claude's call.)*

## How it plays

### Setup screen (Say What?'s own, like Logo Rush's setup card)

- **Packs:** chunky toggle tiles with a small glyph and the saying count.
  **Mixed** (all packs) is on by default. The same toggle logic as Charades decks.
- **Level:** Easy (easy only) · Normal (easy + normal, standard) · Hard
  (normal + hard, two-gap sayings possible).
- **Answer:** Letter tiles (standard) · Choices.
- **Time per saying:** Quick / Normal / Relaxed / No limit =
  tiles 15 / 25 / 40 s, choices 8 / 12 / 18 s; a two-gap saying gets +10 s.
  Timeout = wrong. *(Claude's call.)*
- **Sayings:** 10 / 15 / 20 per round (standard 10). In Turns this is per player.
- **Look:** Speech bubble · Chalkboard (the player's own choice, not a game rule,
  like SortRush's look).
- Big Start button. Choices saved to `sayWhat:setup` (versioned).

### In play

Top bar: brand "Say / What?" two-tone, round counter, timer ring, score, flame
streak chip. Then the **saying card**, then the **answer panel**.

- The saying is shown as words. The gap is a glowing dashed slot sized to the
  answer's length. As tiles are placed, the letters appear **inside the slot in
  the saying itself** as well as in the tile slots. Two gaps: the first slot is
  active (highlighted), it moves to the second when the first word is full.
- **Tiles:** `FF.SpellTiles`, always dealt at 2× the letters (the `hard`
  multiplier, whatever the level; SpellTiles caps a board at 30 tiles), passing
  the gap's decoy words as `related`.
  **SpellTiles needs one small new option:** `onChange(chars)`, called whenever a
  tile is placed or removed, so the saying's own slot can show the letters live and
  the highlight can move to the second gap. It is optional and changes nothing for
  GeoSpin, Logo Rush or the Bible games (their tests must still pass). A full board
  checks itself, as it does today. *(Claude's call.)* Two gaps: one board spelling
  "WORD1 WORD2" (SpellTiles lays out the gap between words), 2× all letters,
  capped at SpellTiles' 30 tiles.
- **Choices:** 4 buttons: the answer + 3 decoys from the row. Two gaps:
  4 pair buttons ("Rome · built"), with decoys made from the rows' decoys.
- Checking: `FF.AnswerMatch` over the main word plus `also` words. Tiles can only
  spell real letters, so typo forgiveness rarely matters, but the shared checker
  is used. Two gaps: both words must be right; no part points.
- Phone fit like Logo Rush's `fitPhone()`. Desktop from 900 px: card left,
  panel right.

### Reveal

The right word drops into the gap (gold in Speech bubble, chalk-white with a dust
puff in Chalkboard). The whole saying glows, then the **meaning** fades in under
it ("Big things take time."), with the pack name. Wrong or timeout: the slot
shakes, shows the player's word struck through, then the right word drops in.
Points pop and count up. GameFlow auto-advances like Logo Rush.

### Points

- Right answer: 100 × level weight of the **saying** (easy 1, normal 2, hard 3).
- Speed: up to +50 (linear over the time limit; none with No limit).
- Two gaps: +50.
- **Streak:** from the 3rd right answer in a row, +25 per answer, rising by 25
  each step up to +100 (3rd +25, 4th +50, 5th +75, 6th and on +100). A wrong
  answer or timeout resets it. The flame chip grows and burns brighter at 3, 5
  and 8. *(Claude's call on the numbers.)*
- Choices mode is unranked (like GeoSpin and Logo Rush choice modes).

### Recap

Score ring, right count, best streak, then a "Sayings to remember" list: each
saying played in full with its meaning, the ones missed first. Confetti on a
new best.

### Modes

- `modes: ['solo', 'turn']` locally, plus `room` online.
- **Solo:** one player, the round as set.
- **Turns:** players pass the phone. Each turn is one saying for the current
  player, with a "Pass to Ama" hand-over card between turns so nobody sees the
  next saying early. The round has `sayings × players` items, still one per
  saying. Each player has their own streak.
- **Online Race:** everyone gets the same saying at once. The first right answer
  doesn't end it: each player answers once, the clock runs out or everyone has
  answered, then the reveal. Points as above with speed from the server's clock.
  Rooms allow Tiles or Choices, Normal or Hard, 10 / 15 / 20 sayings, and play
  **Mixed packs only** (like Logo Rush) *(Claude's call)*. Each phone keeps its own look.
  The server keeps each player's streak and adds the bonus. A two-gap answer
  is sent as one string, the two words separated by a space, as SpellTiles
  spells it ("Rome built"); choices send the same string. *(Claude's calls.)*

### Daily, challenge, leaderboard

Like Logo Rush: `leaderboard: true`. Daily and challenge play `R.STANDARD`
(Tiles, Normal, Normal time, Mixed, 10 sayings) from a seed. Choices never
count for leaderboards. *(Claude's call, matching Logo Rush.)*

## The two looks

Both share one layout and only change tokens and a few decorations, through
`data-sw-look="bubble|chalk"` on the root. CSS prefix `sw-`, tokens `--sw-*`
in `css/tokens.css`, rules in `css/games.css`.

- **Speech bubble (default, the cover's world):** warm gradient from cream
  `#FFF4DC` to apricot `#FFB36B`, soft sparkles and gold confetti. The saying sits
  in a big glossy deep-teal (`#0F766E`) speech bubble with a rim light and a tail.
  Words are cream pills with dark teal text. The gap is a glowing dashed cream
  slot. The right word is a gold pill (`#F5B82E`). Tiles are chunky cream 3D keys
  with a teal letter and a pressed shadow. Gold Start button.
- **Chalkboard:** a dark green board (`#1F3A2E` to `#16291F`) with a wooden frame,
  faint chalk smudges and a chalk tray at the bottom with a stick of chalk and a
  duster (CSS/SVG). The saying is in a hand-lettered chalk font (e.g. "Patrick Hand"
  or "Gochi Hand", OFL), self-hosted like the app's other fonts: added to
  `tools/download-assets.js` and `css/fonts.css` *(Claude's call)*. Off-white `#F4F1E8`. The gap is a chalk underline. The right word appears in
  yellow chalk (`#FDE68A`) with a small dust puff. Tiles are wooden letter blocks
  (light wood, dark letter). The timer ring is drawn in chalk.
- Both pass the contrast check (`tools` contrast tool) in light and dark app themes;
  the game stage keeps its own background in both.

## Build

### Files

- `js/data/sayings.js`: data as above.
- `js/saywhat/rules.js` (`FF.SayWhatRules`): pure, shared with the server.
  `PACKS`, `LEVELS`, `TIMES`, `STANDARD`, `items(settings)`, seeded
  `deal(settings, seed, count, seen)` (the no-repeat rule), `choices(item, rand)`,
  `tiles(item, rand)`, `check(item, text)`, `points(item, ms, limit, streak)`,
  `sanitizeRoom(settings)`.
- `js/games/sayWhat.js`: screen (frame, setup, play, reveal, recap, Turns hand-over,
  looks). Reuse `FF.SpellTiles`, `FF.AnswerMatch`, and GeoSpin's exported
  `timerRing` / `countUp` / `chip` helpers where they fit, like Logo Rush.
- `js/saywhat/referee.js`, `client.js`, `dev.js`: online Race, mirroring Logo Rush.
  View `rooms/<code>/sw`, inbox `swInbox`, answers as strings, screen draws a
  phase only when `ready(view)`.
- `api/lib/SayWhat.php` (constants match `rules.js`, a PHP test compares them),
  wired in `bootstrap.php`, `Routes.php`, `EngineRoutes.php`, `Db.php`, `api/cron.php`.
- Crew: `Crew::ONLINE_GAMES` + `Crew::GAMES`, `roomUI.js ONLINE_GAMES`, a brain
  `js/crew/brains/sayWhat.js` modelled on `whatsMissing.js` (answers right by
  accuracy trait and level, after a reaction-based delay, otherwise picks a decoy),
  `api/crew/lib/loader.js`, `api/crew/runner.js` (`saywhatRuns` / `saywhatState`).
- `database.rules.json`: `swInbox` rule **added by hand** after `skbInbox`.
- Wiring: `FF.registerGame` (category `word`, `leaderboard: true`, `room`),
  icon in `js/icons.js`, scripts in `play.html`, `admin.html`,
  `tools/test-seed.html`, `tools/load-check.js`, `api/lib/Leaderboards.php::GAMES`
  + `FF.Leaderboards.eligible`, i18n strings with English fallbacks.
- Cover: the build does not wait for it, but **the merge to main does**: the
  cover test and the cover go in last. *(Claude's call.)*
  `tools/art/sayWhat.json` + `python tools/process-game-art.py sayWhat`
  once Brighton's `assets/playmona_assets/say-what/cover.png` lands, then
  `node tools/gen-asset-manifest.js`.
- `docs/expert-levels.md`: add Say What? to Done (tiles are its standard).

Check `sw-` and `sayWhat` / `sw_` match ids are not already used before starting.

### Tests

- `tools/test/sayWhat.test.js`: data check passes; every gap is spellable from its
  own tiles (and both words of every `two` pair within 30 tiles); deals are seeded
  and repeatable; **no saying twice in a round** over many seeds, packs and levels;
  history: one-gap sayings never repeat until the pool is used, multi-gap sayings
  return with a new gap; dry pool resets; choices hold the answer once and never an
  `also` word; points and streak table; cover exists.
- `tools/test/sayWhat.referee.test.js` and `tools/api/sayWhat.test.php`.

## Verification

- `node tools/test/run.js` and `php tools/api/test.php` pass.
- Preview `/play`: both looks, tiles and choices, a two-gap Hard saying, a streak
  to 6, a timeout, Turns with 3 players, daily run, a challenge link; phone 375 px
  and desktop 1280 px; light and dark app theme.
- Play 5 rounds in a row on one pack and confirm no saying repeats inside a round
  and one-gap sayings don't come back.
- Two-tab dev room Race (two-tab testing notes): same saying in both tabs, server
  scores, crew player answers.
- PR → merge to main deploys, publishes rules and restarts the crew.

## Left to the builder

Exact pill, tile and bubble sizes; animation timings; glyphs for the pack tiles;
which hand-lettered font; crew brain numbers; the order of the "Sayings to
remember" list after missed-first.
