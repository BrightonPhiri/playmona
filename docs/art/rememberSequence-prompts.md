# Remember the Sequence: Codex prompt pack

One cover for **Remember the Sequence**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py rememberSequence`.

The raw file lands in `assets/playmona_assets/remember-sequence/`, which git ignores.

The Pictures set needs no new art: it reuses the Memory Match card pictures
(`assets/images/games/memoryMatch/`). Colours, numbers and shapes are drawn in CSS and SVG.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Remember the Sequence" memory game on the Playmona gaming platform.

THE GAME

Glowing pads light up one after another, each with its own musical note. Players watch, then tap them back in the same order. The sequence grows by one each round. Pads can be colours, pictures, numbers or shapes.

LOOK

* Premium glossy 3D key art, like a top mobile puzzle title: soft-glass, jelly-like materials, crisp highlights, gentle reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms with a lamp, wildlife photos, Quick Tap's single green button, Number Rush's neon rings on navy, Ball Swap's glass bowls on navy). So: no room, no lamp, no people or hands, no rings, no bowls, no dark navy background.
* Background: a bright dreamy twilight gradient from soft teal (#5EEAD4) at the bottom to lavender (#C4B5FD) and warm peach (#FDBA74) at the top, with a few soft bokeh dots.
* Scene: seen from slightly above, four large rounded-square glass pads float in a tilted 2 x 2 diamond: ruby red (#EF4444), sapphire blue (#3B82F6), emerald green (#10B981) and sunflower yellow (#FACC15). Each pad glows softly from inside.
* A bright comet-like ribbon of white-gold light (#FFE7A3) leaps from pad to pad in a clear order: red, then blue, then yellow, then green. Where it touches a pad, that pad blazes brighter with a ripple of light. Earlier hops are fainter, the newest hop is the brightest, so the order reads at a glance.
* Small musical-note-shaped sparkles (shapes only) and tiny glowing orbs float off the ribbon. A few small floating glass bubbles drift around the pads, each holding a cute glossy 3D object: a fox, a rocket, a star, a slice of pizza (hinting at the picture mode).

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the four pads and the light ribbon inside the middle 40 percent of the height. The top and bottom quarters should be mostly soft gradient with a few bubbles and sparkles.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/remember-sequence/

Save it as:

assets/playmona_assets/remember-sequence/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any pad shows text or digits, if there are not exactly four pads, if the light ribbon's order is unclear, or if the pads are not near the vertical middle.
* Verify the file exists and is a valid image.
```
