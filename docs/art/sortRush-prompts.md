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

---

## Board backdrops (optional)

The boards are drawn in code and already match the cover: a lavender sky with
sparkles, a honey wood shelf, glossy pieces. These three painted backdrops are
an optional upgrade, one for each board look. Each sits behind the shelves and
is cropped to whatever shape the screen is (wide on a laptop, tall on a phone),
so the middle must stay plain and every detail must live near the edges.

Generate each with its own request, then tell Claude they are ready.

### Workshop backdrop

```
Use the image generation capability to generate ONE background image for the "SortRush" colour-sorting puzzle game on the Playmona gaming platform.

It sits BEHIND the game board: wooden shelves and colourful pieces are drawn on top of it, so it must be calm and must not compete with them.

LOOK

* Soft, dreamy, premium mobile-game backdrop in the same style as the game's cover: glossy 3D, gentle light, no hard detail.
* A smooth vertical gradient from soft lavender (#C9B8FF) at the top to bright periwinkle blue (#7FA8FF) at the bottom.
* A very soft glow of light from the top centre, like a studio spotlight.
* Near the edges only: a few tiny four-point sparkles, a few soft out-of-focus bokeh circles, and two or three tiny blurred toy pieces drifting (a hex nut, a ring, a ball) in muted tones.
* The middle 70 percent of the image (both directions) must be plain gradient with nothing in it.
* No shelves, no tubes, no holders, no people, no text, letters, numbers, logos, frames or UI.

SIZE

* Square, 2048 x 2048. It will be cropped to wide and tall shapes, so nothing important may sit near the middle.

FILE

Create the directory if it does not exist: assets/playmona_assets/sort-rush/
Save it as: assets/playmona_assets/sort-rush/bg-workshop.png

WORKFLOW

* One request, not a collage. Regenerate if anything sits in the middle, or if there is any text.
* Verify the file exists and is a valid image.
```

### Candy backdrop

```
Use the image generation capability to generate ONE background image for the "SortRush" colour-sorting puzzle game on the Playmona gaming platform.

It sits BEHIND the game board: glossy pink shelves and colourful pieces are drawn on top of it, so it must be calm and must not compete with them.

LOOK

* Soft, sweet, premium mobile-game backdrop: glossy 3D, pastel, gentle light, no hard detail.
* A smooth diagonal gradient from candy pink (#FFD0E6) at the top left to soft periwinkle (#CDD7FF) at the bottom right.
* A faint pattern of soft white polka dots fading out towards the middle.
* Near the edges only: a few tiny sparkles, soft out-of-focus bokeh, and two or three tiny blurred sweets (a round candy, a swirl lollipop, a gumdrop) in pastel tones.
* The middle 70 percent of the image (both directions) must be plain gradient with nothing in it.
* No shelves, no tubes, no people, no text, letters, numbers, logos, frames or UI.

SIZE

* Square, 2048 x 2048. It will be cropped to wide and tall shapes, so nothing important may sit near the middle.

FILE

Create the directory if it does not exist: assets/playmona_assets/sort-rush/
Save it as: assets/playmona_assets/sort-rush/bg-candy.png

WORKFLOW

* One request, not a collage. Regenerate if anything sits in the middle, or if there is any text.
* Verify the file exists and is a valid image.
```

### Neon backdrop

```
Use the image generation capability to generate ONE background image for the "SortRush" colour-sorting puzzle game on the Playmona gaming platform.

It sits BEHIND the game board: dark glass shelves and glowing coloured pieces are drawn on top of it, so it must be dark and calm and must not compete with them.

LOOK

* Moody, premium neon arcade backdrop: deep and soft, with no hard detail.
* A vertical gradient from deep indigo (#1B1460) at the top to near-black navy (#060924) at the bottom.
* Soft glows near the edges: a violet glow (#C04BFF) at the top left and a cyan glow (#2EEEFF) at the top right, fading well before the middle.
* A faint perspective grid of thin cyan lines on the floor area at the very bottom, fading out upwards.
* A few tiny sparkles near the edges.
* The middle 70 percent of the image (both directions) must be dark plain gradient with nothing in it.
* No shelves, no objects, no people, no text, letters, numbers, logos, frames or UI.

SIZE

* Square, 2048 x 2048. It will be cropped to wide and tall shapes, so nothing important may sit near the middle.

FILE

Create the directory if it does not exist: assets/playmona_assets/sort-rush/
Save it as: assets/playmona_assets/sort-rush/bg-neon.png

WORKFLOW

* One request, not a collage. Regenerate if anything sits in the middle, or if there is any text.
* Verify the file exists and is a valid image.
```
