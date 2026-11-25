# Number Challenge: Codex prompt pack

One cover for **Number Challenge**, the mental maths game (Quick sums,
Sprint, Chain and Make the target). Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py numberChallenge`.

The raw file lands in `assets/playmona_assets/number-challenge/`, which git
ignores. Until then the game shows the Numbers category wash.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Number Challenge" mental maths game on the Playmona gaming platform.

THE GAME
Players solve quick sums against the clock: pick the right answer, sprint through as many as they can, keep a running total in their head, or combine number tiles to hit a target. When an answer is right, it lights up with a burst.

LOOK
* Premium glossy 3D key art, like a top mobile puzzle game: chunky toy-like shapes, rich materials (glossy candy plastic, polished gold, soft rubber), crisp highlights and soft shadows. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Number Rush's neon rings on navy-black space, Quick Tap's single green button, Quiz Mix's question mark on a stage, Say What's teal speech bubble on apricot, What's Missing's tile grid on magenta, Logo Rush's app badges on mint and sky blue, GeoSpin's globe, Ball Swap's glass bowls on navy, Blink & Remember's gift boxes, Remember the Sequence's four glass pads). So: no dark space, no neon rings, no question mark, no speech bubble, no grid of tiles, no globe, no single big button, no navy, magenta or apricot background.
* Background: a fresh, zesty gradient from bright lime (#C5F542) at the top to deep emerald (#047857) at the bottom, with a soft sunny glow (#FDE68A) behind the centre, a few soft sparkles and faint curved speed streaks.
* Scene: in the centre floats a large, chunky, glossy 3D equals sign in polished gold (#F5B82E), tilted slightly towards the viewer. Just to its right sits ONE empty rounded answer slot, a glowing dashed outline in warm white, and a glossy green check-mark badge (#22C55E) is popping out of it in a bright burst of sparks, as if a right answer has just landed.
* Flying in from the left towards the equals sign, at different depths and angles, are four chunky glossy 3D maths signs, each a different candy colour: a plus in coral (#FF6B5B), a minus in sky blue (#38BDF8), a times sign in sunny yellow (#FACC15) and a divide sign in violet (#A78BFA). Short motion trails show them zooming in.
* Around the scene, smaller and slightly blurred at the edges, float four little glossy props, one for each way to play: a lightning bolt in orange (Sprint), three linked rounded chain links in teal (Chain), a small round archery target with a dart in its centre (Make the target), and a chubby retro stopwatch in cream and red (beat the clock).
* Optional: a few small blank rounded number tiles (cream squares with soft bevels and NOTHING printed on them) tumbling near the bottom of the middle band.

COMPOSITION (important: the picture is cropped)
* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. Keep the equals sign, the answer slot with the check-mark burst, and the four flying maths signs inside the middle 45 percent of the height. Place the props close around that band. The top and bottom quarters should be mostly gradient with sparkles and streaks.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements. The maths signs are shapes only (plus, minus, times, divide, equals), and the answer slot, the tiles and the stopwatch face must stay blank, with no digits.

FILE ORGANISATION
Create the directory if it does not exist:
assets/playmona_assets/number-challenge/
Save it as:
assets/playmona_assets/number-challenge/cover.png

WORKFLOW
* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letter or digit (including on the stopwatch, the tiles or the answer slot), if any of the five maths signs is missing or looks like a letter, if the background is not lime to emerald, or if the equals sign and the burst are not near the vertical middle.
* Verify the file exists and is a valid image.
```
