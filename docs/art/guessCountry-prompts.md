# Guess the Country: Codex prompt pack

One cover for **Guess the Country**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py guessCountry`, then runs
`node tools/gen-asset-manifest.js` so the game card picks it up.

The raw file lands in `assets/playmona_assets/guess-country/`, which git ignores.

The flags inside the game are the official ones (Flagpedia SVGs), so the cover
must not try to draw real national flags: image models get their details wrong.

If it needs another go, use the **Redo** prompt at the end.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Guess the Country" game on the Playmona gaming platform.

THE GAME

A fast flag quiz for families: a flag waves on screen and you name its country before the time runs out. Every country in the world. Bright, adventurous and a little bit race-against-the-clock.

LOOK

* Premium glossy 3D key art, like a top family mobile game: soft toy-like shapes, crisp highlights, gentle reflections, warm sunny light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's giant question mark on a game-show podium, Number Rush's neon rings, Ball Swap's glass bowls, Bible Quiz's glowing open book, Blink & Remember's gift boxes). So: no question mark, no podium, no stage spotlights, no answer buttons, no book.
* Scene: in the centre, a big glossy 3D globe (blue oceans, soft green and sand continents, no country borders, no labels), tilted a little and floating. Around it, six to eight small flags on short golden poles stick out of the globe at different angles, each one rippling in the wind like real cloth with soft folds and highlights.
* IMPORTANT: the flags are NOT real national flags. Each is a simple made-up design in bright solid colours: plain two-colour halves, three stripes, a single circle or a single star. No coats of arms, no crests, no writing, no Union Jack, no stars-and-stripes, no maple leaf, no red disc on white.
* In front of the globe, slightly to one side, a chunky glossy 3D stopwatch, its hand near the top, with a little motion streak, to say "beat the clock".
* A paper-plane trail loops around the globe, and a few small white clouds drift past.
* Background: bright sky blue (#38BDF8) at the top fading to warm teal (#14B8A6) and a soft sunny glow (#FDE68A) behind the globe, with gentle light rays and a few twinkling sparkles.
* Family friendly: no people, no faces, no hands.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the globe, the flags and the stopwatch inside the middle 40 percent of the height, centred left to right. The top and bottom quarters should be mostly sky, clouds and light rays.
* No text, letters, numbers, logos, watermarks, frames or UI elements anywhere, including on the stopwatch face (use plain tick marks only) and on the flags.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/guess-country/

Save it as:

assets/playmona_assets/guess-country/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any flag looks like a real country's flag, if there is any text, letters or numerals (check the stopwatch closely), if any person or face appears, or if the globe is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## Redo

```
Regenerate assets/playmona_assets/guess-country/cover.png using the same Guess the Country cover brief, and fix this: <WHAT TO FIX>.
Keep the globe with its waving made-up flags in the middle 40 percent of the height, no real national flags, no text or numerals anywhere, and no people or faces. Overwrite the same file.
```
