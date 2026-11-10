# Say What?: Codex prompt pack

One cover for **Say What?**, the fill-in-the-missing-word game for sayings.
Paste the prompt into Codex, opened in the `playmona` folder. Then tell Claude
it's ready, and Claude crops and compresses it with
`python tools/process-game-art.py sayWhat`.

The raw file lands in `assets/playmona_assets/say-what/`, which git ignores.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Say What?" sayings game on the Playmona gaming platform.

THE GAME
Players see a famous saying with one word missing (like "____ wasn't built in a day") and race to fill the gap. When the right word drops in, the whole saying lights up.

LOOK
* Premium glossy 3D key art, like a top mobile word game: soft toy-like shapes, rich materials (glossy enamel, polished gold, soft felt), crisp highlights. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Bible Quiz's glowing book on royal purple, Charades' red theatre stage, Logo Rush's floating app badges on mint and sky blue, What's Missing's tile grid on magenta, Stacoend's letters, GeoSpin's globe, Ball Swap's glass bowls, Blink & Remember's gift boxes). So: no question mark, no book, no letter tiles, no grid, no stage, no red curtains, no mint or magenta background.
* Background: a warm, sunny gradient from soft cream (#FFF4DC) at the top to rich apricot (#FFB36B) at the bottom, with a gentle radial glow behind the centre and a few soft sparkles and drifting gold confetti.
* Scene: in the centre floats ONE large, chunky, glossy 3D speech bubble in deep teal (#0F766E) with a soft white rim light and a short tail pointing down-left. Inside the bubble sits a single row of five rounded pill-shaped "word blocks" in cream (#FFF8EC), of different lengths, like a sentence with the words hidden. They carry NO letters or marks. The first block's slot is EMPTY: a glowing dashed outline. A shiny golden pill block (#F5B82E) is flying down into that empty slot from above, with a short motion trail and a small burst of sparkles where it is about to click in.
* Floating around the bubble, at different depths and slightly tilted, are five small glossy 3D props, each hinting at a famous saying: a little Roman stone arch with a tiny half-built column (Rome wasn't built in a day), a shiny red apple (an apple a day), a cheerful round early bird holding a worm (the early bird), a small golden needle with a thread loop (a stitch in time), and a plump little egg basket with eggs (don't put all your eggs in one basket). The props at the edges are slightly blurred, as if drifting past.
* Optional: a small wise cartoon owl with round glasses perched on top of the speech bubble, looking down at the golden block with delight. Friendly, toy-like, not scary.

COMPOSITION (important: the picture is cropped)
* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the speech bubble, the row of blocks, the golden flying block and the owl inside the middle 45 percent of the height. Place the props around the bubble but close to that middle band. The top and bottom quarters should be mostly gradient with sparkles and confetti.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements. The word blocks must stay completely blank.

FILE ORGANISATION
Create the directory if it does not exist:
assets/playmona_assets/say-what/
Save it as:
assets/playmona_assets/say-what/cover.png

WORKFLOW
* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letter or digit (including on the word blocks), if there is no empty slot with the golden block flying into it, if the speech bubble is not teal, or if the bubble is not near the vertical middle.
* Verify the file exists and is a valid image.
```
