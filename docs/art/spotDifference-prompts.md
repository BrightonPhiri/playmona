# Spot the Difference: Codex prompt pack

Pictures for **Spot the Difference**. Each puzzle is a pair: picture A (the
original) and picture B (the same picture with 10 changes). This pack makes
**one test pair** (Market Day) and the cover. More pairs follow once the test
pair works in the game.

How to use it:

1. Paste **Test pair: Market Day** into Codex, opened in the `playmona` folder.
   It makes picture A, then edits A into picture B, then writes a list of the
   10 changes.
2. Paste the **Cover** prompt.
3. Tell Claude the files are ready. Claude compares A and B pixel by pixel to
   find the 10 changed spots, checks them against the list, and shows you a
   picture with each spot circled. Nobody has to mark them by hand.
   (`python tools/art/spot-diff-find.py <id>` writes the spots and
   `<id>-spots.jpg`; then `python tools/process-game-art.py spotDifference`
   and `node tools/gen-asset-manifest.js`; the spots and a label for each go
   into `js/data/spotDifference.js`, and the id into `tools/art/spotDifference.json`.)

Raw files land in `assets/playmona_assets/spot-difference/` (git ignores them).
Only the compressed webp copies ship.

Why B must be an edit of A: if B is drawn again from scratch, every leaf and
shadow moves a little and the game can't tell the real changes from the
drift. An edit keeps everything else in place.

---

## Test pair: Market Day

```
Use the image generation capability to make ONE matching pair of pictures for the "Spot the Difference" game on the Playmona gaming platform: picture A, and picture B, which is picture A with exactly 10 changes.

THE GAME

Players see the two pictures side by side (on phones they swipe between them) and tap each spot where the pictures differ. Each change must be easy to see once you notice it, but not jump out at first glance.

STEP 1: PICTURE A

A busy, cheerful outdoor market on a sunny morning in a small town square.

Style:
1. A bright, richly detailed storybook illustration: painterly digital art with crisp, clean edges, warm daylight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly. People are shown small, at a distance or from the side, busy at the stalls; no close-up faces.
3. Square, 1:1, 1024 x 1024 or larger, the scene running right to the edges (full bleed).
4. Lots of separate, clearly drawn small objects everywhere, so there is plenty to search. No large plain areas: sky may cover at most a fifth of the picture and must have clouds.
5. No text, letters, numbers, price tags with writing, signs with writing, clock faces, logos, watermarks, signatures, borders, frames or UI.

What goes where (keep roughly to this layout):
* Top left: a fruit stall under a red-and-white striped awning, a bunch of yellow bananas hanging from the awning, a string of coloured bunting flags running from the top left corner towards the middle.
* Top right: a flower stall under a big yellow umbrella, buckets of flowers, an iron lamp post with a small bird sitting on top, a red kite flying in the blue sky with two white clouds.
* Middle: a wooden cart piled with green watermelons, a vendor in an apron beside it, a small brown dog sitting by the cart wheel.
* Bottom left: wooden crates of oranges and red apples, a wicker basket of bread loaves on a checked cloth.
* Bottom right: a ginger cat sleeping on a wooden barrel, clay pots, a blue bicycle with a front basket full of pink flowers.
* Fill the gaps with shoppers carrying bags, baskets, cobblestones, potted plants and small details.

Save it, then look at it. Regenerate picture A if it has any text or numbers, a border, a big plain area, or is missing most of the things above. Only move on when picture A is right.

STEP 2: PICTURE B (an edit of picture A)

Use the image EDITING capability with picture A as the input image. Do NOT generate picture B from scratch. Picture B must be identical to picture A in every way (framing, size, colours, lighting, every object and every line) EXCEPT for these 10 changes:

1. Top left: one bunting flag changes colour (for example blue becomes green).
2. Top left: the bunch of bananas hanging from the awning is gone.
3. Top right: the kite in the sky is orange instead of red.
4. Top right: the bird on top of the lamp post is gone.
5. Middle: one watermelon on the cart becomes an orange pumpkin.
6. Middle: a red ball is added on the ground by the dog's front paws.
7. Bottom left: one crate of oranges becomes a crate of green limes.
8. Bottom left: a small potted plant is added on the ground next to the bread basket.
9. Bottom right: the sleeping cat is black instead of ginger.
10. Bottom right: the bicycle's front basket is empty (no flowers).

Rules for the changes:
* Each change sits in its own small area. No two changes touch or overlap, and none touches the edge of the picture.
* Each change is big enough to see on a phone: at least about one twentieth of the picture's width across.
* Nothing else changes: no shifted shadows, no recoloured sky, no moved people, no new or missing objects apart from the 10 above.
* If one of the 10 changes is impossible because picture A turned out a little different, swap in a similar change (an object added, removed or recoloured) in the same area of the picture, and write down what you did.

If the image tool cannot edit an existing image and can only make new ones, stop and say so instead of making picture B from scratch.

Look at picture B next to picture A. Redo the edit if any of the 10 changes is missing, if anything else changed, or if the picture was cropped, resized or shifted.

STEP 3: THE CHANGES LIST

Write a plain text file listing the 10 changes as they actually ended up, one per line, each with where it is (for example "top left") and what changed.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/spot-difference/

Save the files as:

assets/playmona_assets/spot-difference/market-day-a.png
assets/playmona_assets/spot-difference/market-day-b.png
assets/playmona_assets/spot-difference/market-day-changes.txt

Both PNGs must be exactly the same width and height. Verify all three files exist and that both images are valid and the same size.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Spot the Difference" game on the Playmona gaming platform.

THE GAME

Two pictures that look the same, side by side. Players hunt for the small changes and tap each one; every difference they find gets a bright circle around it.

LOOK

* Premium glossy key art, like a top mobile puzzle title: crisp, colourful, playful, with soft highlights and gentle depth. Not a photo.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quick Tap's green button, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes, Picture Rush's tiled puzzle board on lime-to-aqua). So: no tiles, no boxes, no bowls, no rings of light, no people's faces or hands, and none of those background colours.
* Background: a rich gradient from deep indigo (#3B2F8F) at the top to warm raspberry (#E5487A) at the bottom, with a few soft sparkles.
* Scene: two matching picture cards standing side by side, each with a thick white rounded border and a soft shadow, tilted slightly towards each other. Both show the same cheerful storybook market scene (a striped awning, a fruit stall, a yellow umbrella, a cat on a barrel, a kite in the sky), but with three small, clear differences between them (for example the kite colour, a missing bird, a different coloured cat). On the right card, two of the differences already have a glowing gold circle drawn around them. A big shiny magnifying glass hovers over the third difference on the right card, its lens slightly enlarging that spot.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep both cards and the magnifying glass inside the middle 45 percent of the height. The top and bottom quarters should be mostly gradient with a few sparkles.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/spot-difference/

Save it as:

assets/playmona_assets/spot-difference/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if there are not two matching cards, if there is no magnifying glass, or if the cards are not near the vertical middle.
* Verify the file exists and is a valid image.
```
