# SortRush: Codex prompt pack

One cover for **SortRush**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py sortRush`.

The raw file lands in `assets/playmona_assets/sort-rush/`, which git ignores.

The game itself needs no art: the nuts, balls, rings, blocks and all three
board looks are drawn in code (CSS).

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "SortRush" colour-sorting puzzle game on the Playmona gaming platform.

THE GAME

Holders are filled with mixed colours. Players move the top piece from one holder to another until every holder holds one colour. It comes in four looks: hex nuts on bolts, balls in glass tubes, rings on pegs and blocks in trays. Players race to sort first.

LOOK

* Premium glossy 3D key art, like a top mobile puzzle title: chunky soft toy-like shapes, crisp highlights, gentle reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quick Tap's green button, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's four glass pads on a teal-to-peach gradient, Blink & Remember's gift boxes on yellow-to-coral). So: no bowls, no glowing pads, no gift boxes, no people or hands, no teal-to-peach or yellow-to-coral gradient.
* Background: a cool gradient from soft lavender (#C9B8FF) at the top to bright periwinkle blue (#7FA8FF) at the bottom, with a few soft sparkles and faint motion streaks.
* Scene: a warm honey-coloured wooden shelf seen slightly from above, with four holders standing on it in a gentle curve, left to right:
  1. a steel threaded bolt with a stack of glossy hex nuts (red, blue, red);
  2. a clear glass test tube holding glossy balls (green, yellow, green);
  3. a rounded wooden peg with stacked rings (purple, orange, purple);
  4. a small open tray with chunky bevelled blocks (blue, blue, blue: already sorted, with a little burst of sparkles and a soft glow around it as if just finished).
* Above the middle, one glossy yellow ball is mid-flight in a smooth arc from the tube towards the tray, with a faint motion trail. A couple of loose pieces (a hex nut, a ring) tumble in the air at the edges, slightly blurred.
* Colours of the pieces: tomato red (#FF5A4E), cobalt blue (#3F7BFF), leaf green (#38C76A), sunny yellow (#FFD23F), grape purple (#9B5CFF), tangerine (#FF9A3C). Each colour is clearly different.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the shelf, all four holders and the flying ball inside the middle 40 percent of the height. The top and bottom quarters should be mostly gradient with a few sparkles and tumbling pieces.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/sort-rush/

Save it as:

assets/playmona_assets/sort-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if there are not exactly four holders, if the four holders are not the four different kinds (bolt, tube, peg, tray), or if they are not near the vertical middle.
* Verify the file exists and is a valid image.
```
