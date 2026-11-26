# Spot the Difference with real pictures: design

## Why

Spot the Difference is one of the last two games still on the old look:
emoji and coloured shapes on a blank board (`renderSpotRound` in
`js/games/puzzleGames.js`). Brighton wants real pictures where players tap the
spot that changed, and on phones swipe between the original and the changed
picture. One test pair first; more pairs once it plays well.

## Decided with Brighton

* **10 differences per pair; the level picks how many count.** Easy 5,
  Normal 7, Hard 10. The game quietly paints the unused changes back from
  picture A, so one pair serves every level.
* **Tap either picture.** A hit circles the spot on both pictures.
* **Bright storybook art** (same family as Picture Rush), square 1:1.
* **First test pair: Market Day.** Prompts in `docs/art/spotDifference-prompts.md`.

## Approaches considered (how the spots get found)

1. **Pixel compare A and B (chosen).** Codex edits A into B, so only the
   changed spots differ. A script blurs both, diffs them, groups the changed
   pixels into regions and writes their boxes. Claude checks the regions
   against Codex's changes list and a circled contact picture. No hand work.
2. Brighton marks each spot in a small click tool. Reliable but manual for
   every pair; kept as the fallback if a pair drifts too much to compare.
3. Codex writes the coordinates. Rejected: image models don't know where
   they drew things.

## How it works (Claude's calls, open to change)

* **Data:** `js/data/spotDifference.js` lists pairs: id, name, and 10 regions
  as boxes in 0–1 picture coordinates with a short label. Pictures ship as
  webp in `assets/images/games/spotDifference/<id>-a.webp` / `-b.webp`; a pair
  is used only once it's in the asset manifest.
* **Finder tool:** `tools/art/spot-diff-find.py <id>`: diff, group, write
  the regions, save a contact image with numbered circles for review.
* **Undoing changes for Easy/Normal:** picture B is drawn on a canvas, and
  for each unused region the matching patch of A is drawn over it with soft
  edges. Which changes count is picked by the round's seed, so online players
  share the same set.
* **Desktop / wide screens:** the two pictures side by side.
* **Phones:** one picture at a time, full width. Swipe left/right, or tap the
  "Original / Changed" switch; two dots show which one you're on. Found
  circles show on both.
* **Taps:** a hit counts inside the region box plus a small margin
  (finger-sized). Wrong tap: a quick red cross and −20, as today. Hit:
  +100 × level bonus, as today. Online stays the current Parallel race.
* **No fallback (changed while building):** the test pair ships with the
  game, so the old shape scenes were removed rather than kept as dead code.
  With no pair in the manifest the game shows a "needs its pictures" card.
* **Phone feel (as built):** the picture is a square as wide as the screen;
  Changed shows first; swiping updates the switch and the switch scrolls.
* **Time up:** the missed spots get dashed amber circles on both pictures.
* **Rounds:** one pair per turn/round, never the same pair twice in a game
  while unplayed pairs remain; with only the test pair, online plays 1 round.

## Not now

Pinch zoom, a hint button, Hidden Object (next game), extra pairs (after the
test pair passes).
