# Logo Rush: Codex prompt pack

One cover for **Logo Rush**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py logoRush`.

The raw file lands in `assets/playmona_assets/logo-rush/`, which git ignores.

The game's logos are real brand files (`assets/images/games/logoRush/`). The cover
must use made-up symbols only: image models garble real logos, and real
trademarks don't belong on our cover.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Logo Rush" brand-guessing quiz game on the Playmona gaming platform.

THE GAME

Players are shown a company's symbol with no name (like a swoosh, a bitten fruit or a smile-shaped arrow) and race to name the brand: by picking from choices, spelling it with letter tiles or typing it. At the reveal the full logo and a fun fact appear.

LOOK

* Premium glossy 3D key art, like a top mobile quiz title: chunky soft shapes, crisp highlights, gentle reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, GeoSpin's globe, SortRush's lavender sky and wooden shelf, Ball Swap's glass bowls, Blink & Remember's gift boxes). So: no globe, no shelf, no bowls, no boxes, no people or hands.
* Background: a fresh gradient from soft mint (#B8F2DA) at the top to bright sky blue (#6EC6FF) at the bottom, with a few soft sparkles and faint confetti.
* Scene: a loose cluster of about nine glossy rounded-square badges (like big 3D app icons) floating at slightly different angles and depths, each a different bold colour: tomato red (#FF5A4E), cobalt blue (#3F7BFF), leaf green (#38C76A), sunny yellow (#FFD23F), grape purple (#9B5CFF), tangerine (#FF9A3C), hot pink (#FF5FA2), black, and white.
* Each badge carries ONE simple MADE-UP symbol, invented for this picture and not belonging to any real company: a curved swoosh-like wave, a five-point star with a tail, a lightning bolt, a leaf, a crown, a spiral, a paper-plane arrow, a heart with a notch, a bird made of three curves.
* In the centre, the largest badge sits in front. A large shiny magnifying glass with a gold rim hovers over it, its lens making that symbol look bigger and sharper, with a soft glow and a little burst of sparkles as if the brand has just been recognised.
* The badges at the edges are slightly blurred, as if rushing past, with faint motion streaks.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the magnifying glass, the central badge and most of the cluster inside the middle 40 percent of the height. The top and bottom quarters should be mostly gradient with sparkles, confetti and a few blurred badges.
* No text, letters, numbers, digits, words, real brand logos, watermarks, frames or UI elements. None of the symbols may resemble a real company's logo (no Nike swoosh, no Apple apple, no Twitter bird, no McDonald's arches, no Shell shell).

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/logo-rush/

Save it as:

assets/playmona_assets/logo-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letter or digit, if any symbol looks like a real brand's logo, if there is no magnifying glass, or if the magnifying glass and central badge are not near the vertical middle.
* Verify the file exists and is a valid image.
```
