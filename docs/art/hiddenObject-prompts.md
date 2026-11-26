# Hidden Object: Codex prompt pack

Pictures for **Hidden Object**. Each scene is a pair: the **empty** picture (a
busy scene) and the **hidden** picture (the same picture with 12 objects tucked
into it). Players only ever see the hidden picture, with a list of objects to
find. Start with the test scene (the Cluttered Attic) and the cover; more
scenes come once the attic has been played.

How to use it:

1. Paste the **Test scene** prompt into Codex, opened in the `playmona` folder.
   It makes the empty picture, edits it to hide the 12 objects, and writes a
   list of them.
2. Paste the **Cover** prompt (it can be the same Codex session).
3. Tell Claude the files are ready. Claude compares the two pictures pixel by
   pixel to find where each object is, checks them against the list, and shows
   you a picture with each object circled. Nobody has to mark them by hand.

Raw files land in `assets/playmona_assets/hidden-object/` (git ignores them).
Only the compressed webp copy of the hidden picture ships.

Why the hidden picture must be an edit of the empty one: if it is drawn again
from scratch, every line moves a little and the game can't tell the 12 objects
from the drift. An edit keeps everything else in place.

---

## Test scene: Cluttered Attic

```
Use the image generation capability to make ONE matching pair of pictures for the "Hidden Object" game on the Playmona gaming platform: the EMPTY picture, and the HIDDEN picture, which is the empty picture with exactly 12 objects hidden in it.

THE GAME

Players see the hidden picture and a list of object names ("teapot", "golden key" ...). They search the busy scene and tap each object on the list. The objects must be findable by a sharp-eyed child, but not jump out at first glance: tucked among the clutter, partly behind things, and coloured to sit naturally in the scene.

STEP 1: THE EMPTY PICTURE

A cosy, cluttered attic on a sunny afternoon, crammed with old things.

Style:
1. A bright, richly detailed storybook illustration: painterly digital art with crisp, clean edges, warm sunlight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and not spooky: warm light, friendly clutter, a few soft cobwebs at most. No people, no faces, no creepy dolls.
3. Square, 1:1, 1024 x 1024 or larger, the scene running right to the edges (full bleed).
4. Packed with separate, clearly drawn objects everywhere, so there is plenty to search. No large plain areas: walls are covered with shelves, frames and hanging things; the floor is covered with rugs, boxes and piles.
5. No text, letters, numbers, labels with writing, book titles, clock faces, logos, watermarks, signatures, borders, frames around the picture, or UI.

What goes where (keep roughly to this layout):
* Top left: a sloping wooden roof beam with a string of old bunting and a hanging oil lantern, shelves of plain-spined books, glass jars and hat boxes.
* Top centre: a round attic window letting in a beam of sunlight with floating dust, a birdcage (empty, door open) hanging beside it.
* Top right: stacked suitcases and travel trunks with brass corners, a rolled-up carpet leaning against the wall, picture frames showing simple landscapes.
* Middle left: a dressmaker's dummy wearing a patterned shawl, a coat stand with scarves and hats.
* Middle: a big open treasure-style trunk spilling fabric, ribbons and old letters (no writing visible), a rocking chair with a knitted blanket.
* Middle right: a tall wooden wardrobe with one door ajar, a gramophone with a brass horn, a lamp with a fringed shade.
* Bottom left: a toy box, a rocking horse, a stack of board-game boxes with plain lids, wooden blocks.
* Bottom right: crates of jars and bottles, a sewing basket with balls of wool, an old bicycle wheel, potted plants.
* Fill every gap with small clutter: buttons, spools, candles, baskets, cushions, boxes, plants.

Keep these 12 things OUT of the empty picture completely (they are hidden in step 2, and each must be the only one of its kind): a teapot, a rubber duck, a golden key, an umbrella, a violin, a red mitten, a sea shell, a toy sailboat, a banana, a horseshoe, a roller skate, a crown.

Save it, then look at it. Regenerate the empty picture if it has any text or numbers, a border, a big plain area, people, or any of the 12 objects above. Only move on when it is right.

STEP 2: THE HIDDEN PICTURE (an edit of the empty picture)

Use the image EDITING capability with the empty picture as the input image. Do NOT generate the hidden picture from scratch. It must be identical to the empty picture in every way (framing, size, colours, lighting, every object and every line) EXCEPT that these 12 objects are added, one in each area:

1. Top left: a teapot.
2. Top centre: a rubber duck.
3. Top right: a golden key.
4. Top right (lower): an umbrella.
5. Middle left: a violin.
6. Middle: a red mitten.
7. Middle: a sea shell.
8. Middle right: a toy sailboat.
9. Bottom left: a banana.
10. Bottom left (towards the middle): a horseshoe.
11. Bottom right: a roller skate.
12. Bottom right (towards the middle): a small crown.

Rules for the hidden objects:
* Each object is clearly that object when you look at it (a sharp, recognisable shape), but it is tucked in: resting on a shelf among other things, half behind a box, lying in a basket, hanging from a hook. At least two thirds of each object stays visible.
* Colour each one to suit the spot it sits in, so it blends a little, but never so much that it disappears.
* Size: each object is between one twentieth and one twelfth of the picture's width across. Not tiny specks, not big centrepieces.
* No two objects touch or overlap, none touches the edge of the picture, and each is the only one of its kind in the whole picture.
* Nothing else changes: no shifted shadows, no recoloured walls, no moved or removed things apart from the 12 additions.
* If one object is impossible to place where listed, put it somewhere else in the same area and write down what you did.

If the image tool cannot edit an existing image and can only make new ones, stop and say so instead of making the hidden picture from scratch.

Look at the hidden picture next to the empty one. Redo the edit if any of the 12 objects is missing or hard to recognise, if anything else changed, or if the picture was cropped, resized or shifted.

STEP 3: THE OBJECTS LIST

Write a plain text file listing the 12 objects as they actually ended up, one per line, each with where it is (for example "top left, on the bookshelf next to the jars") and what it looks like (for example "blue teapot with white spots").

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/hidden-object/

Save the files as:

assets/playmona_assets/hidden-object/attic-empty.png
assets/playmona_assets/hidden-object/attic-hidden.png
assets/playmona_assets/hidden-object/attic-objects.txt

Both PNGs must be exactly the same width and height. Verify all three files exist and that both images are valid and the same size.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Hidden Object" game on the Playmona gaming platform.

THE GAME

One busy, cluttered picture with a dozen objects hidden in it. Players read a list of what to find and tap each object; every find gets a bright circle and is ticked off the list.

LOOK

* Premium glossy key art, like a top mobile puzzle title: crisp, colourful, playful, with soft highlights and gentle depth. Not a photo.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quick Tap's green button, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes, Picture Rush's tiled puzzle board on lime-to-aqua, and Spot the Difference's two picture cards with a magnifying glass on indigo-to-raspberry). So: no magnifying glass, no side-by-side cards, no tiles, no bowls, no rings of light, no people's faces or hands, and none of those background colours.
* Background: a rich gradient from deep midnight navy (#1B2440) at the top to warm amber (#F0A03A) at the bottom, with a few soft floating dust sparkles.
* Scene: a cheerful heap of attic treasures (an open trunk spilling ribbons, a stack of hat boxes, books with plain spines, a lantern, a rocking horse, balls of wool) lit by a warm torch beam coming in from the upper left. Inside the beam, three objects peek out of the clutter (a golden key, a rubber duck and a teapot), each with a glowing gold circle drawn around it, as if just found. A small curled paper list floats beside the heap with three tick marks and three short blank lines (no writing).

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the heap, the torch beam's bright spot and the three circled objects inside the middle 45 percent of the height. The top and bottom quarters should be mostly gradient with a few sparkles.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/hidden-object/

Save it as:

assets/playmona_assets/hidden-object/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if there are no circled objects, if there is a magnifying glass, or if the heap is not near the vertical middle.
* Verify the file exists and is a valid image.
```
