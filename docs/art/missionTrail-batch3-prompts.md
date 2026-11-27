# Mission Trail: Codex prompt pack, Batch 3

Batch 3 brings the **busy rooms**. When a letter says "find my keys and my water bottle", the
player no longer picks from a neat row of things: they search one big, cluttered room for them,
the way Hidden Object plays (drag, pinch or zoom, then tap the thing). Taking the wrong thing is
allowed; the player finds out at the door and has to go back for the right one.

Stages 11 to 20 are built and tested. Stage 11 plays now; Stages 12 to 20 stay hidden until these
pictures are cut in, then they open on their own. Stages 6, 8 and 10 switch to the busy rooms too.

Batch 3 is 11 images and 5 lists:

| File | What |
|---|---|
| `sheets/objects-2.png` | 12 more things to carry (glasses, scarf, mug...), 4 × 3 |
| `busy/<room>-empty.png` (5 files) | a busy room: bedroom, hallway, kitchen, library, living room |
| `busy/<room>-hidden.png` (5 files) | the same room with its 12 things hidden in it |
| `busy/<room>-objects.txt` (5 files) | where each of the 12 things ended up |

How to use it:

1. Open Codex in the `playmona` folder and paste **Batch 3** below. If it stops part way, say
   "carry on with the next room" until all five rooms are done.
2. Tell Claude the files are ready. Claude cuts the sheet, finds every hidden thing by comparing
   each empty room with its hidden copy pixel by pixel, checks them against the lists and shows
   you each room with its things circled, so you can reject any picture. Nobody marks them by hand.

Raw files land in `assets/playmona_assets/mission-trail/`, which git ignores. Only small WebP
copies ship.

Why the hidden picture must be an edit of the empty one: if it is drawn again from scratch,
every line moves a little and the game cannot tell the 12 things from the drift. An edit keeps
everything else in place.

Why the things must look like the sheets: after the player takes a thing, the game shows it in
their bag using the sheet picture (`objects-1.png`, `objects-2.png`). The keys in the hallway
must be the same keys as on the sheet, or the bag looks wrong.

---

## Batch 3: more things and five busy rooms

```
Use the image generation capability to make pictures for the "Mission Trail" game on the Playmona gaming platform: 1 picture sheet, then 5 matching pairs of busy room pictures (an EMPTY room and the same room with 12 things HIDDEN in it), each with a text list. Follow every rule below exactly.

THE GAME

Mission Trail is a 2D adventure game for children and adults. The player reads a mission letter once, then walks a little town from memory. Some letters ask the player to fetch things ("my keys and my water bottle") from a room. The room is shown as one big busy picture; the player searches it, zooms in, and taps the things the letter asked for. Every room hides 12 things, so most of them are decoys: the player has to remember which ones the letter named.

Look at these existing files first and match them: assets/playmona_assets/mission-trail/sheets/objects-1.png (the things the player carries), assets/playmona_assets/mission-trail/sheets/buildings-1.png and the room pictures in assets/playmona_assets/mission-trail/rooms/ (the game's style).

STYLE (identical for every image, and identical to the game's existing pictures)

1. Bright, clean 2D illustrated mobile adventure game art: a hand-painted digital look with soft cel shading, clean dark-brown outlines of even medium weight, warm sunny daylight from the top left, cheerful saturated colours (not neon). Friendly and inviting, like a polished storybook town.
2. Not a 3D render, not a photograph, not pixel art, not flat vector clip art.
3. Original designs only. No real brands, logos or famous characters.
4. No text, letters, numbers, name badges, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere. Newspapers, books, screens and labels show only plain lines or plain colour, never readable words. No clock faces with numbers.

PART 1: SHEET objects-2 (12 more things to carry)

1. One landscape image, 1536 x 1024.
2. Exactly 12 pieces in an even grid of 4 columns x 3 rows, in the numbered reading order (row 1 left to right, then row 2, then row 3).
3. Each piece sits in the centre of its own grid cell, whole (nothing cut off), filling about 75 percent of the cell, with a clear empty gap of at least 40 pixels between neighbouring pieces and between pieces and the image edge. Nothing touches or overlaps.
4. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) with no gradient, texture or vignette. No ground, floor or shadows under a piece. No piece has pure white on its outer edge (white parts get light grey shading and the normal outline).
5. Each thing is shown on its own, at a slight three-quarter angle from above, drawn at the same scale feel as objects-1.png. Bold, simple shapes and clear colours, because the player must spot them in a busy room.

1. reading-glasses: a pair of round reading glasses with thin gold frames, arms folded.
2. red-scarf: a bright red knitted scarf, loosely folded, with a fringe at each end.
3. yellow-mug: a bright yellow mug with a round handle, empty, no picture or writing.
4. toy-car: a small orange toy car with black wheels (a toy, clearly not a real car).
5. football: a classic black-and-white football.
6. pink-slippers: a pair of fluffy pink slippers side by side.
7. phone: a mobile phone with a plain dark blue case and a blank dark screen.
8. wallet: a brown leather wallet, folded shut, with stitching.
9. torch: a blue hand torch (flashlight), switched off.
10. sunglasses: a pair of dark sunglasses with black frames, arms open.
11. green-apple: one shiny green apple with a leaf.
12. lunchbox: a purple lunchbox with a handle on top, closed.

PART 2: FIVE BUSY ROOMS

Every room picture:

1. Square, exactly 1024 x 1024, full bleed (the room fills the whole picture), no border. (Square, so the whole room fits on a phone held upright.)
2. Seen from the front at about eye level, a little from above, like a stage set: a back wall, a floor, and side walls at the edges.
3. Packed with separate, clearly drawn furniture and clutter everywhere, so there is plenty to search: shelves full of things, a rug, cushions, baskets, boxes, plants, pictures on the walls (simple landscapes, no people), toys or tools as suits the room. No large plain areas: walls and floor may cover at most a fifth of the picture and must carry detail.
4. No people, no animals, no faces.
5. None of that room's 12 hidden things may appear anywhere in its empty picture, and nothing that looks like them (no other keys in a room that hides keys, no other umbrella, no other cap).

HOW TO MAKE EACH PAIR (do all four steps for one room before starting the next)

1. Generate the empty room. Look at it. Regenerate it if it has any text or numbers, a border, people, a big plain area, or any of its 12 things.
2. Make the hidden room with the image EDITING capability, using the empty room as the input image. Do NOT generate it from scratch. It must be identical to the empty room in every way (framing, size, colours, lighting, every object and every line) EXCEPT that its 12 things are added, one in each area listed. If the image tool cannot edit an existing image and can only make new ones, stop and say so instead.
3. Look at the hidden room next to the empty one. Redo the edit if any thing is missing, doubled or hard to recognise, if anything else changed, or if the picture was cropped, resized or shifted.
4. Write the objects list: one line per thing, as it actually ended up, with its name from the list, where it is (for example "top right, on the hat shelf beside the boxes") and what it looks like.

Rules for the 12 hidden things in every room:

* Each thing looks like the same thing on the sheets (objects-1.png, or objects-2.png from Part 1): same design, same colours. The keys are always a bunch of three keys on a round ring with a small blank yellow tag; the blue and red books are always closed plain hardbacks; the caps are always the same baseball cap in red, blue or green.
* Each thing is clearly that thing when you look at it, but tucked in: resting on a shelf among other things, half behind a cushion, lying in a basket, hanging from a hook. At least two thirds of each thing stays visible.
* Size: each thing is between one sixteenth and one tenth of the picture's width across (about 65 to 100 pixels). Not tiny specks, not big centrepieces.
* No two things touch or overlap, none touches the edge of the picture, and each is the only one of its kind in the whole picture.
* Nothing else changes: no shifted shadows, no recoloured walls, no moved or removed furniture apart from the 12 additions.
* If a thing is impossible to place where listed, put it somewhere else in the same area and write down what you did.

The areas: the picture is split into 3 rows (top, middle, bottom) and 4 columns (left, centre-left, centre-right, right). Each room puts one thing in each of the 12 areas, in the order given.

ROOM 1: bedroom (a cosy child's bedroom)
Empty room: a bed with a patchwork quilt and pillows on the left, a window with curtains and a window seat, a desk with a lamp and pencil pots, a tall bookcase with rows of plain book spines and boxes, a toy chest, a wardrobe on the right, a rug with toys (blocks, a ball of wool, a kite), posters of plain shapes, fairy lights.
Hidden things, by area:
1. top left: red-cap
2. top centre-left: book-blue
3. top centre-right: watch
4. top right: sunglasses
5. middle left: teddy-bear
6. middle centre-left: blue-cap
7. middle centre-right: umbrella
8. middle right: green-cap
9. bottom left: pink-slippers
10. bottom centre-left: toy-car
11. bottom centre-right: book-red
12. bottom right: football

ROOM 2: hallway (a busy family front hallway)
Empty room: a front door with a glass panel on the left, a coat rack crowded with coats and bags, a shoe rack full of shoes and boots, a little table with a bowl and a plant, a mirror, a staircase on the right with pictures up the wall, a long patterned rug, a basket of scarves (none red) and gloves.
Hidden things, by area:
1. top left: blue-cap
2. top centre-left: red-scarf
3. top centre-right: watch
4. top right: torch
5. middle left: umbrella
6. middle centre-left: keys
7. middle centre-right: newspaper
8. middle right: phone
9. bottom left: medical-bag
10. bottom centre-left: water-bottle
11. bottom centre-right: wallet
12. bottom right: book-red

ROOM 3: kitchen (a bright, busy family kitchen)
Empty room: cupboards along the back wall with open shelves of plates, jars, pots and tins (plain labels), a window over the sink with plants, a cooker with pans, a fridge covered with plain drawings and magnets, a table with chairs, a fruit bowl (no green apples), a bread board, hanging utensils, tea towels.
Hidden things, by area:
1. top left: yellow-mug
2. top centre-left: watch
3. top centre-right: reading-glasses
4. top right: book-blue
5. middle left: keys
6. middle centre-left: green-apple
7. middle centre-right: phone
8. middle right: water-bottle
9. bottom left: umbrella
10. bottom centre-left: newspaper
11. bottom centre-right: lunchbox
12. bottom right: wallet

ROOM 4: library (inside the town library)
Empty room: tall wooden bookshelves along the back wall full of plain coloured book spines (spines only, standing upright: no book lies flat or loose anywhere), a librarian's desk with a stamp and a lamp, reading tables with green lamps, armchairs, a globe, a ladder against a shelf, a book trolley of upright spines, potted plants, a noticeboard of plain paper shapes.
Hidden things, by area (the two books lie flat with their front covers showing, so they stand out from the upright spines once you spot them):
1. top left: torch
2. top centre-left: sunglasses
3. top centre-right: red-scarf
4. top right: watch
5. middle left: book-blue
6. middle centre-left: yellow-mug
7. middle centre-right: reading-glasses
8. middle right: newspaper
9. bottom left: keys
10. bottom centre-left: umbrella
11. bottom centre-right: book-red
12. bottom right: phone

ROOM 5: living-room (a cosy, busy family living room)
Empty room: a big sofa with cushions and a knitted blanket, an armchair, a coffee table with a plant and coasters, a fireplace with ornaments and photo frames (simple landscapes), a bookcase of plain spines and boxes, a TV cabinet with a blank screen, a lamp, a basket of toys and wool, a rug, curtains.
Hidden things, by area:
1. top left: book-blue
2. top centre-left: watch
3. top centre-right: reading-glasses
4. top right: yellow-mug
5. middle left: teddy-bear
6. middle centre-left: newspaper
7. middle centre-right: keys
8. middle right: phone
9. bottom left: pink-slippers
10. bottom centre-left: wallet
11. bottom centre-right: football
12. bottom right: umbrella

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/mission-trail/sheets/
assets/playmona_assets/mission-trail/busy/

Save the files with exactly these names:

assets/playmona_assets/mission-trail/sheets/objects-2.png
assets/playmona_assets/mission-trail/busy/bedroom-empty.png
assets/playmona_assets/mission-trail/busy/bedroom-hidden.png
assets/playmona_assets/mission-trail/busy/bedroom-objects.txt
assets/playmona_assets/mission-trail/busy/hallway-empty.png
assets/playmona_assets/mission-trail/busy/hallway-hidden.png
assets/playmona_assets/mission-trail/busy/hallway-objects.txt
assets/playmona_assets/mission-trail/busy/kitchen-empty.png
assets/playmona_assets/mission-trail/busy/kitchen-hidden.png
assets/playmona_assets/mission-trail/busy/kitchen-objects.txt
assets/playmona_assets/mission-trail/busy/library-empty.png
assets/playmona_assets/mission-trail/busy/library-hidden.png
assets/playmona_assets/mission-trail/busy/library-objects.txt
assets/playmona_assets/mission-trail/busy/living-room-empty.png
assets/playmona_assets/mission-trail/busy/living-room-hidden.png
assets/playmona_assets/mission-trail/busy/living-room-objects.txt

WORKFLOW

* Make Part 1 first, so the rooms can match the new things.
* Generate each picture with its own request (one request = one sheet, one empty room or one edit).
* Save the actual generated image files at the paths above.
* Each empty and hidden pair must be exactly the same width and height (1024 x 1024).
* Verify all 16 files exist, that every image is a valid PNG, and that each pair is the same size.
* Write a short summary listing each file and anything you had to move.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Redo (for rejected pictures)

```
Redo only these Mission Trail pictures, keeping every rule from the Batch 3 prompt (same style, same sizes, same file names, overwrite the old files): <list the files and what was wrong>. If you redo an empty room, redo its hidden room and objects list from the new empty room too.
```
