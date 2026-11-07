# Blink & Remember: Codex prompt pack

One cover for **Blink & Remember**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py blinkRemember`.

The raw file lands in `assets/playmona_assets/blink-remember/`, which git ignores.

The game's pictures need no new art: it uses the Memory Match card pictures
(`assets/images/games/memoryMatch/`).

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Blink & Remember" memory game on the Playmona gaming platform.

THE GAME

A row of closed boxes. Each one pops open for a blink to show a cute picture, then shuts for good. Players must remember which picture was in which box, then pick each one from a big grid of pictures.

LOOK

* Premium glossy 3D key art, like a top mobile puzzle title: chunky soft toy-like shapes, crisp highlights, gentle reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quick Tap's green button, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's four glass pads on a teal-to-peach gradient). So: no glowing pads, no rings, no bowls, no people or hands, no teal-to-peach gradient.
* Background: a warm sunny gradient from butter yellow (#FFE08A) at the top to coral pink (#FF9AA2) at the bottom, with soft confetti dots and a few small floating stars.
* Scene: a gently curved row of five chunky rounded gift-style boxes, slightly from above, in candy colours: mint (#5EE6B0), sky blue (#6CB8FF), lilac (#B79CFF), tangerine (#FFA552) and hot pink (#FF6FB5), each with a soft ribbon band. The middle box has its lid flipped up and a bright burst of light spills out; floating just above it, a cute glossy 3D cartoon fox peeks out with a big smile. One neighbouring box shows a lid just closing with a little puff of sparkles. A large friendly cartoon eye shape made of light (shape only) winks above the row, as if blinking.
* Around the edges, a loose fan of small picture cards drifts in the air (an owl, a rocket, a strawberry, a dinosaur), slightly blurred, like the choices players pick from.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the row of boxes, the open box and the fox inside the middle 40 percent of the height. The top and bottom quarters should be mostly gradient with a few confetti dots and drifting cards.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/blink-remember/

Save it as:

assets/playmona_assets/blink-remember/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if there are not exactly five boxes, if more than one box is open, or if the boxes are not near the vertical middle.
* Verify the file exists and is a valid image.
```
