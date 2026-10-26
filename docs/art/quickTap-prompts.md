# Quick Tap: Codex prompt pack

One cover for **Quick Tap**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py quickTap`.

The raw file lands in `assets/playmona_assets/quick-tap/`, which git ignores.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Quick Tap" reflex game on the Playmona gaming platform.

THE GAME

Players wait on a dark screen, and the instant it flashes bright green they tap as fast as they can. Online, everyone races the same signal at the same moment.

LOOK

* Bold, electric, high-energy neon. A polished modern game key art style, like a premium mobile esports title: crisp 3D rendering with glowing light, not a photo and not a painting.
* It must look completely different from the platform's other covers. Those are dark, painterly living-room scenes lit by a warm lamp, and a realistic wildlife photograph. So: no room, no lamp, no animals, no painterly brushwork.
* Scene: a single fingertip striking a big glowing round button at the exact moment of contact. A burst of electric green light (#2EE86B) explodes outward in a starburst shape, with crackling lightning arcs and speed lines. The background is a deep navy-to-black arena (#080C26) with faint concentric rings, like a target.
* The palette is mainly electric green and deep navy, with small accents of hot pink (#FF2F8F) and electric blue (#1E7BFF) in the sparks.
* The hand is stylised and friendly, with no skin detail that could look creepy. It could be a sleek gloved hand or a simple stylised one.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. So the fingertip, button and burst must all sit in the middle 40 percent of the height. The top and bottom quarters should be just dark arena with a few sparks.
* No text, letters, numbers, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/quick-tap/

Save it as:

assets/playmona_assets/quick-tap/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if the hand looks malformed (extra fingers), if there is any text, or if the burst is not in the vertical middle.
* Verify the file exists and is a valid image.
```
