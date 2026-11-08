# What's Missing?: Codex prompt pack

One cover for **What's Missing?**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py whatsMissing`.

The raw file lands in `assets/playmona_assets/whats-missing/`, which git ignores.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "What's Missing?" memory game on the Playmona gaming platform.

THE GAME
Players study a neat grid of cute pictures. Then one picture vanishes and leaves an empty spot, and players must work out what was there.

LOOK
* Premium glossy 3D key art, like a top mobile puzzle title: chunky soft toy-like shapes, crisp highlights, gentle reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes on yellow-coral, SortRush's wooden shelf, Who Am I's magnifying glass, Guess the Country's globe). So: no question mark, no magnifying glass, no boxes, no shelf, no globe, no people or hands, no yellow-to-coral gradient.
* Background: a vivid gradient from magenta (#D946EF) at the top to warm tangerine (#FB923C) at the bottom, with soft bokeh dots and a few tiny sparkles.
* Scene: a floating 3x3 grid of chunky rounded glossy tiles, tilted slightly towards the viewer, in soft cream and pastel tones. Eight tiles each hold one cute glossy 3D object: a strawberry, a rocket, a rubber duck, a cupcake, a teddy bear, a hot-air balloon, a cactus in a pot, an alarm clock. The CENTRE tile is empty: just a glowing dashed outline in the shape of a cartoon cat, with a soft white light rising from it. Just above the grid, the cat itself is drifting away and dissolving into a swirl of sparkles and little glowing squares, half there, half gone.

COMPOSITION (important: the picture is cropped)
* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the grid, the empty centre tile and the vanishing cat inside the middle 45 percent of the height. The top and bottom quarters should be mostly gradient with bokeh and sparkles.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION
Create the directory if it does not exist:
assets/playmona_assets/whats-missing/
Save it as:
assets/playmona_assets/whats-missing/cover.png

WORKFLOW
* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if the grid is not 3x3, if more than one tile is empty, if the empty tile is not the centre one, or if the grid is not near the vertical middle.
* Verify the file exists and is a valid image.
```
