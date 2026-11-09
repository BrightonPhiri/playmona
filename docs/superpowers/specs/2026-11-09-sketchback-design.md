# SketchBack — design

*Draw it. Remember it. Name it.* Written 2026-11-09 from Brighton's full brief (pasted in chat) and four answers.
Branch `feat/sketchback`, worktree in the session scratchpad, cut from origin/main f36f7a2.

## Intent

A memory game, not an art game. Players copy a black-and-white sketch for a few seconds, the reference
vanishes, and at the end they must say what each of their own scribbles was. The fun is the gap between
"I drew a dog" and "is that a dog or a cat?". Quality bar: GeoSpin / What's Missing, a premium mobile game.

## Decided by Brighton

- **Art:** reference sketches come from Codex as collage sheets (12 line drawings per sheet) in the style of
  Brighton's tree sketch. Claude writes the prompt pack (`docs/art/sketchBack-prompts.md`), Brighton generates,
  Claude cuts them with `tools/cut-art-sheets.py` into transparent webp line art. No art is drawn during play.
- **Online:** a server referee, like What's Missing / GeoSpin / Crossword (PHP starts it, the crew runner referees).
- **Drawings on results:** after everyone finishes, the room sees every player's drawing of each object.
- **Local play:** solo on one device plus online rooms. No pass-and-play, no take turns, no "everyone".
- **Naming has no countdown.** The clock belongs to the drawing phase. Naming (recall) has a quiet
  3-minute limit, solo and online alike: when it passes, only the labels already written count, blank
  cards score 0. Claude's call: no timer is shown, only a soft "30 seconds left" note at the end.
- **Rude drawings:** on "Everyone's drawings" any player can hide any drawing on their own screen only.
  No reporting, no host action.
- Claude's call (reviewer question): the reference sketch appears with a wipe-and-fade on the webp,
  not a stroke-by-stroke draw (that would need vector art).

## From the brief (fixed)

- Setup: sketches 5 / 10 / 15 (default 10); difficulty Easy 7 s, Normal 5 s, Hard 4 s (default Normal).
  In rooms the host's settings apply to all.
- Draw phase, per object: progress "Sketch 3/10", circular countdown, object name, large reference sketch,
  then below it a white paper canvas with Undo and Clear and a small "copy the sketch above" hint. No tracing aids.
  At zero: hide reference and label at once, lock the canvas, save the drawing, short transition, next object.
  Earlier drawings can never be edited.
- No object repeats within a game. Objects are picked at random (seeded: `FF.Random`).
- Recall phase: a gallery of the player's drawings as cards in a shuffled order (shuffled per player), with
  no names, an answered/unanswered mark on each card. Tapping a card opens a modal: enlarged drawing,
  "What did you draw?", text input, Submit. Answers can be changed until the player presses
  "See results", which is enabled only when every card is answered. Correctness stays hidden until then.
- Matching: case-insensitive, aliases and synonyms from a dictionary, small typos, singular/plural.
  Vague answers ("animal", "thing", "food") are not accepted.
- Results: sketches done, correct, wrong, accuracy %, score, time taken (recall phase time), then a gallery
  of drawing / reference / your answer / right answer / tick or cross. Correct cards get a satisfying
  pop; wrong ones a gentle shake. **Score = 100 per correct answer**, nothing for drawing quality.
- Multiplayer: same objects, same order, same per-sketch time; independent canvases and recall; leaderboard
  ranks by correct answers then points (equal, both are 100×correct) then faster recall time.
- Look: "premium creative studio": warm off-white, deep navy type, purple/blue accents, gradient buttons,
  rounded cards, soft shadows, light glass; the canvas looks like a sheet of paper. Responsive phone → desktop.
- Animations: sketch fades/draws in, countdown ring, warning pulse in the last 1.5 s, reference vanishes at
  zero, slide to next object, gallery cards stagger in, answer submit tick, results confetti/count-up.
  All respect reduce-motion.
- Use existing auth, rooms, scoring, leaderboards; no new auth or leaderboard systems.

## How it is built (Claude's calls, following existing patterns)

**Ids and files.** Game id `sketchBack`, name "SketchBack", CSS/text prefix `skb-`, tokens `--skb-*` in
`css/tokens.css` (checked with `tools/contrast-check.js`).
- `js/data/sketches.js`: the library: `{ id, name, cat, tier: 'e'|'n'|'h', alts: [...] }`, about 120
  objects over Animals, Food, Nature, Transport, Household, Everyday. `alts` holds other names
  (bike, airplane/plane, tv, automobile…). Plus a short `VAGUE` word list.
- `js/sketchback/rules.js` (`FF.SketchBackRules`, no DOM, shared by phone, referee and tests):
  settings/`sanitize`, `deal(settings, seed)` (no repeats), `check(answer, objectId)` built on the shared
  `FF.AnswerMatch` (plurals, typos, aliases, vague words refused, a guess equal to *another* object's
  name never counts), `score`, stroke encode/decode.
- `js/games/sketchBack.js`: the screen (intro/setup, draw, recall, results) and `online()` for rooms.
- `js/sketchback/{referee,client,dev}.js`, `api/lib/SketchBack.php` and its migration, routes, bootstrap
  class list, `Crew::ONLINE_GAMES` + roomUI `ONLINE_GAMES` (crew bots don't play it), `Leaderboards::GAMES`,
  a hand-added `skbInbox` rule in `database.rules.json`, `play.html`, `tools/test-seed.html`,
  `tools/load-check.js`, tests in `tools/test/` and `tools/api/`.
- Art: `assets/images/sketchback/<id>.webp` (transparent, black lines, ~512px square). The cover is a
  separate prompt in the same pack.

**Difficulty and object choice.** Easy deals mostly simple objects (tier e), Normal a mix, Hard leans on the
more detailed ones (tier h). Time per sketch is the difficulty's seconds.

**Drawing.** One `<canvas>` sized to its box × devicePixelRatio, pointer events (touch, pen, mouse) with
`touch-action: none`, strokes smoothed with quadratic curves, a single navy pen of fixed width. Strokes are
kept as point lists in canvas units (0–1000), so they redraw at any size (gallery thumbnails, modal,
results). Undo removes the last stroke; Clear empties the canvas (both disabled when locked). The canvas
locks on the referee's/local clock, and pointerup after the lock is ignored.

**Saving.** After every sketch the strokes are encoded (quantised points, a compact string) and saved to
the device (`localStorage`, key per match/run), so a reload mid-game keeps finished drawings. Solo resumes
at the next sketch; a sketch whose time ran out while away is saved as whatever was drawn.

**Online flow (referee).** Phases `starting → draw(k) → … → recall → ended`.
- `draw` publishes only the current object (id/name/art) and `drawAt`/`closeAt`. The next object is never
  in the view. Everyone gets the same clock from the database time.
- Phones send nothing during drawing. When the last sketch closes, each phone sends one `drawings`
  command (all strokes) to `rooms/<code>/skbInbox/<uid>`. The referee keeps them out of the view.
- `recall` lasts at most 3 minutes and the view holds no object names. Each phone sends one `answers`
  command (strings keyed by sketch number) on "See results", or automatically with whatever is typed when
  the 3 minutes end (accepted for a short grace after). One answers command per player, later ones are
  ignored (no duplicate submissions). The referee checks them with the shared rules and moves on as soon
  as everyone still here has answered. Recall time for the tiebreak is send time minus recall start.
- `ended` publishes the ranking, each player's answers/correctness and everyone's drawings, then the
  platform results (`meta.results`). A player who sends nothing scores 0.
- Reconnects: the phone rebuilds from the view and its saved strokes; a phone that missed sketches has
  blank drawings for them. Disconnected players are not waited for once the clock ends.
- Room size 2–8 (as What's Missing).

**Online results.** Your own results first (same screen as solo), then the room leaderboard (existing podium
style), then "Everyone's drawings": per object, the reference and each player's drawing with name and tick.

**Solo, daily, challenges, leaderboards.** Solo scores go through the platform scoring; standard settings
(10 sketches, Normal) count for the game leaderboard and daily challenge. Challenge links replay the seed.

**Until the art lands.** The game is registered but marked not ready (not listed) until the sketches are in,
so no placeholder art ships. All code, tests and the prompt pack land first.

## Non-goals

No drawing scoring or AI image judging. No colours or brush sizes. No crew bots. No pass-and-play.
No AI answer judge (dictionary + fuzzy matching only).

## Left to the builder

Exact copy, animation timings, card layout breakpoints, the precise vague-word list, stroke
encoding format, and how many objects per tier, within the rules above.
