# Letter Rush: Codex prompt pack

One new cover for **Letter Rush**. It replaces the old dark, lamp-lit table
scene with bright, glossy letter tiles that match the redesigned game screen.

How to use it:

1. Paste the **Cover** prompt into Codex, opened in the `playmona` folder.
2. Tell Claude the file is ready. Claude crops and compresses it to
   `assets/images/covers/letterRush.webp` with
   `python tools/process-game-art.py letterRush`, which also refreshes the asset
   manifest (its fingerprint makes the new cover show at once, past the 30-day
   image cache).
3. If it needs another go, use the **Redo** prompt at the end.

The raw file lands in `assets/playmona_assets/letter-rush/`. Git ignores it;
only the compressed copy ships.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Letter Rush" word game on the Playmona gaming platform.

LOOK

* A bright, high-energy 3D render, like premium key art for a top mobile word game. Glossy, tactile, playful and modern, with crisp studio lighting, rich colour and a shallow depth of field.
* It must feel completely different from the platform's old covers, which are dark, painterly living-room scenes lit by a warm lamp. No room, no table, no lamp, no people or hands, no painting style, no dark vignette.
* Scene: a burst of chunky letter tiles flying out towards the viewer from the centre, as if just shaken out of a bag. The tiles are thick rounded squares like premium board-game tiles: creamy white with a soft bevel and a slightly darker bottom edge, each with ONE bold, clean, dark navy capital letter. A few tiles are coloured instead (electric blue, purple, hot pink, sunny yellow) with white letters.
* In the centre, in sharp focus, four larger tiles sit in a neat, slightly tilted row and spell R U S H, left to right, one letter per tile. All the other tiles show single letters taken only from A, E, T, O, N, L, P, D, and are softly motion-blurred with light speed streaks trailing behind them.
* Behind the burst: a vivid gradient background, deep violet at the edges, electric blue and a warm pink-orange glow at the centre, with small sparkles and a few glowing particles. A sleek chrome stopwatch with a coral-pink face floats just behind one end of the RUSH row, slightly blurred, hinting at a race against the clock.
* Colour palette: navy #0b1030, electric blue #1e7bff, cyan #19c3f0, purple #8b3cf7, hot pink #ff2f8f, orange #ff8a1f, yellow #ffc83d.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* The game card and the wide banner show only the MIDDLE of the picture, so the RUSH row and the stopwatch must sit in the middle 50 percent of the height, centred left to right. The top and bottom quarters should hold only a few smaller, blurred flying tiles and background glow.
* Text: only single capital letters on tiles. No other words, no logos, no watermarks, no frames, no buttons or game interface.

FILE ORGANISATION

Save it as:

assets/playmona_assets/letter-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if the four centre tiles do not spell RUSH exactly, if any tile has a malformed letter or more than one letter, if the other tiles form a word, or if there is any other text.
* Verify the file exists and is a valid image.
```

---

## Redo (if the cover is rejected after review)

Claude fills in what was wrong after review.

```
Use the image generation capability to regenerate the cover image for the "Letter Rush" word game on the Playmona gaming platform, replacing assets/playmona_assets/letter-rush/cover.png. Follow exactly the same LOOK and COMPOSITION rules as before: a bright, glossy 3D render of chunky letter tiles bursting towards the viewer on a violet-to-blue gradient, four sharp centre tiles spelling R U S H, a chrome stopwatch with a coral face behind them, portrait 1024 x 1536 or larger, the key subject in the middle 50 percent of the height, no other text.

<what was wrong - what to change>

Generate it with a single request, look at it before saving, overwrite the old file, and verify the file exists.
```
