# Picture Rush in the game library (replaces Picture Puzzle)

Brighton, 2026-11-25: "we need to replace picture puzzle with picture rush, picture rush already
works well so we just need to create proper images". Approved with "Yes, use your picks".

## Why

Picture Puzzle (`picturePuzzle`) is a sliding 15-puzzle over simple SVG drawings. Picture Rush,
built for Celebrations, plays better: swap any two tiles, tiles lock when home, a peek before the
clock. The library should have Picture Rush, with real pictures made for it.

## Goals

- Remove Picture Puzzle by the removal checklist and record it in `docs/removed-games.md`.
- A library game `pictureRush`: solo, pass and play, online rooms (parallel race), leaderboards,
  daily game and friend challenges (standard settings on a seeded deal).
- A Codex prompt pack and art config for 96 square puzzle pictures in 6 themes, plus a cover.

## Non-goals

- No shared co-op board online (needs a server referee; later, if wanted).
- No crew brain (Picture Puzzle had none either).
- The Celebrations Picture Rush keeps its behaviour; it only gains the cover when one exists.

## Approaches

1. **New id `pictureRush`** (picked). Old Picture Puzzle scores drop off like every other removed
   game; they were sliding-puzzle move counts and are not comparable.
2. Keep id `picturePuzzle` and rename it. Keeps history and saved settings, but mixes two scoring
   systems on one board and leaves a misleading id. Rejected.

Online: a parallel race through `FF.Parallel.run` (picked; same as Picture Puzzle and the newer
picture games) over a shared co-op board (needs a referee, rejected for now).

## Design

- File `js/games/pictureRush.js`, pure rules on `FF.PictureRush` (tested in
  `tools/test/pictureRush.test.js`). Reuses `FF.PictureRushBoard` (the celebrations board, already
  loaded by `play.html`) and `FF.PictureRushRules` (`scramble`, `swap`, `correct`, `roundPoints`).
- Settings: Pictures (Mix or one theme), Grid (3×3 / 4×4 / 5×5 / 6×6), Pictures per game (1 / 3 / 5),
  Peek at the start (Off / 3 s / 5 s). Time per picture follows the grid: 60 / 120 / 180 / 300 s.
  Standard (leaderboards, daily, challenges): Mix, 4×4, 3 pictures, 3 s peek. Difficulty picks the
  default grid (easy 3, normal 4, hard 5).
- Play: tap or drag a tile onto another to swap them. A tile in its place locks (green dot). A
  **Peek** button shows the whole picture for 3 s, twice per picture, each costing 100 × grid factor.
- Points per picture: `roundPoints` with base 1000, speed 500, partial 500, hint 100, times the grid
  factor (3: 0.5, 4: 1, 5: 1.5, 6: 2).
- Pass and play: everyone gets the same pictures with the same scramble, in turn.
- Rooms: rounds = pictures per game, each round's clock = peek + time; every phone deals the same
  picture and scramble from the round seed.
- Pictures: `js/data/pictureRush.js` lists the 96 pictures `{ id: '<theme>-<slug>', name }` by theme.
  A picture is used only when `FF.AssetManifest['games/pictureRush'][id]` exists
  (`tools/gen-asset-manifest.js` gains that folder). A theme with fewer pictures than a game needs,
  or no photos at all, falls back to the old SVG drawings (`js/data/visual.js`, `visual2.js`), which
  stay until the photos land and are then removed.

## Images (my calls)

- 96 pictures: Animals, Nature & places, Food, City & buildings, Vehicles & transport, Home & toys,
  16 each, in 3 Codex batches of 32, plus one cover (1086×1448, as the other covers).
- Style: bright, detailed storybook illustration, the same look across the set. Detail and colour in
  every part of the frame; no text, logos, borders or watermarks; no big flat areas (sky, walls,
  snow), no repeating patterns, no mirror symmetry, so every tile can be told apart.
- Square 1:1. Raw PNGs in `assets/playmona_assets/picture-rush/<id>.png`; processed to
  `assets/images/games/pictureRush/<id>.webp` at 1024×1024, under 170 KB.

## Left to the builder

Copy, CSS details, exact pass/results screens (follow Blink & Remember).
