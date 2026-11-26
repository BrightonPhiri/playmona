# Hidden Object with real pictures: design

## Why

Hidden Object is the last game still on the old look: emoji scattered on a
blank box, one target per round (`js/games/puzzleGames.js`). Brighton wants
real pictures, like Spot the Difference. One test scene and the cover first;
more scenes once it plays well.

## Decided with Brighton

* **Find the list.** One picture, a list of objects to find underneath (beside
  it on wide screens), tapped in any order before the clock runs out. Each
  scene hides 12 objects; the level picks how many are on the list:
  Easy 6, Normal 9, Hard 12.
* **Pinch and drag on phones** (up to 3x), mouse wheel and drag on desktop,
  with a button to snap back.
* **Bright storybook art**, square 1:1, same family as Spot the Difference.
* **Test scene: Cluttered Attic.** Prompts in `docs/art/hiddenObject-prompts.md`.

## Approaches considered (how the objects get found)

1. **Pixel compare (chosen).** Codex draws the scene empty, then edits it to
   add the 12 objects. Comparing the two finds each object's box, exactly like
   Spot the Difference (`tools/art/spot-diff-find.py`, pointed at the
   hidden-object folder). Only the hidden picture ships.
2. Brighton marks each object in a click tool. Reliable but manual for every
   scene; the fallback if a pair drifts too much.
3. Codex writes coordinates. Rejected: image models don't know where they drew.

## How it works (Claude's calls, open to change)

* **Data:** `js/data/hiddenObject.js` lists scenes: id, name, 12 objects, each
  a name and a box in 0..1 picture coordinates. The picture ships as
  `assets/images/games/hiddenObject/<id>.webp`; a scene is used only once it
  is in the asset manifest. With none, the game shows a "needs its pictures"
  card (no emoji fallback kept).
* **The list:** words, in a random order; a found object is ticked off and
  gets a circle on the picture. Objects not on this round's list stay in the
  picture as decoys: tapping one says "not on your list" with no penalty.
* **Taps:** a hit counts inside the object's box plus a small finger margin,
  measured through the zoom. Wrong tap: a red cross and -20. Find:
  100 x level bonus (1, 1.5, 2); finding them all adds up to 200 for speed,
  as in Spot the Difference.
* **Clock:** 90 / 120 / 150 seconds for Easy / Normal / Hard. Time up rings
  the missed ones in amber.
* **Rounds:** 1 or 3 pictures per game, never the same scene twice while
  unplayed ones remain. Turns pass between players as today.
* **Online:** `FF.Parallel` race, as today: the same scene and the same list
  for everyone (from the room seed), each phone keeps its own score.
* **Code:** a new `js/games/hiddenObject.js` (rules on `FF.HiddenObject`, with
  tests); the old emoji version leaves `puzzleGames.js`. The game id stays
  `hiddenObject`.

## Not now

Hints, silhouettes instead of words, more scenes (after the attic is played).
