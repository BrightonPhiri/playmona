# Mission Trail: Codex prompt pack

Art for **Mission Trail**, the read-remember-explore game. **Batch 1** is everything the town needs,
which is all Stage 1 uses and most of Stages 2 to 3: buildings, street things, the walker, ground
textures, the letter's envelope and the cover. Batch 2 (people, things to carry, cars and the
rooms behind the pick scenes, for Stages 6 to 10) is in `missionTrail-batch2-prompts.md`.

Batch 1 is 12 images:

| File | What | Grid |
|---|---|---|
| `sheets/buildings-1.png` | 6 homes | 3 × 2 |
| `sheets/buildings-2.png` | 6 shops and town buildings | 3 × 2 |
| `sheets/props-1.png` | 12 street things (bus stop, fountain, trees...) | 4 × 3 |
| `sheets/walker.png` | the player's explorer, 4 directions × 3 walking poses | 4 × 3 |
| `textures/*.png` (6 files) | seamless ground: grass, pavement, asphalt, park path, water, garden | single |
| `ui/envelope.png` | the sealed mission envelope | single |
| `cover.png` | the game cover | single |

How to use it:

1. Open Codex in the `playmona` folder and paste **Batch 1**. Let it finish.
2. Paste the **Cover** prompt (it can be the same Codex session).
3. Tell Claude the files are ready. Claude cuts the sheets (`python tools/cut-art-sheets.py missionTrail`),
   removes the backgrounds, makes the textures tile, and shows you a contact sheet so you can reject any
   picture. A short **Redo** prompt for rejects is at the end.

Raw files land in `assets/playmona_assets/mission-trail/`, which git ignores. Only small WebP copies ship.

Why the buildings have no signs: the game must never tell the player which building is the library
until they walk up to it and check. So every building is an ordinary, unlabelled building, and the
game decides in its data which one is the library in each stage. The same 12 buildings make every town.

---

## Batch 1: the town

```
Use the image generation capability to generate 10 images for the "Mission Trail" game on the Playmona gaming platform: 4 picture sheets, 6 seamless ground textures. Then generate 1 envelope picture. Follow every rule below exactly.

THE GAME

Mission Trail is a 2D adventure game for children and adults. The player reads a secret mission letter, then walks a little town from memory to find the right place. The town is drawn on a square grid from above. These pictures are the pieces the game builds every town from: buildings, street things, the player's walking character and the ground. The game places them on the grid itself, so each piece must be a separate, clean object.

STYLE (identical for every image, so all pieces look like one world)

1. Bright, clean 2D illustrated mobile adventure game art: a hand-painted digital look with soft cel shading, clean dark-brown outlines of even medium weight, warm sunny daylight from the top left, cheerful saturated colours (not neon). Friendly and inviting, like a polished storybook town.
2. Not a 3D render, not a photograph, not pixel art, not flat vector clip art.
3. Original designs only. No real brands, logos, shop names or famous characters.
4. No text, letters, numbers, signs with writing, clock faces, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere. Signs and boards are plain colours with no writing and no symbols.

VIEWPOINT (critical: every piece must use exactly the same angle, or the town will look broken)

1. Three-quarter top-down view: the camera is high up in the south, looking down at about 50 degrees, facing straight north. You see the top (roof) of things and their front (south-facing) side.
2. Straight-on, not isometric: the front of every building is a flat rectangle facing the viewer, its bottom edge perfectly horizontal. No diagonal or rotated views, no visible side walls.
3. Everything is to one scale: a house is about two walking-character heights tall at the front wall.

SHEET LAYOUT (for the 4 sheets; Claude cuts each sheet into separate pieces)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly the number of pieces listed, in an even grid, in the numbered reading order (row 1 left to right, then row 2 ...).
3. Each piece sits in the centre of its own grid cell, whole (nothing cut off), filling about 75 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring pieces and between pieces and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) with no gradient, texture or vignette.
6. No ground, grass, pavement, shadows on the background or scenery under or around a piece. Only the piece itself. (The game draws the ground and the shadows.)
7. Because the white background is removed by computer, no piece has pure white on its outer edge: white walls, sails or paint get cream or light grey shading and the normal outline.

SHEET buildings-1 (homes; 3 columns x 2 rows, 6 buildings)

Each building's front wall faces the viewer, with a front door at the bottom centre of the front wall. Windows show curtains or soft reflections only. Each has a different colour scheme so a player could tell them apart by colour.

1. house-red: a small cottage, red tiled roof, cream walls, a dark green door, two windows.
2. house-blue: a small house, blue slate roof, pale grey-blue walls, a yellow door, a round window above the door.
3. house-green: a two-storey house, dark green roof, warm yellow walls, a white-framed porch drawn in light grey.
4. house-brown: a wooden cabin-style house, brown shingle roof, honey-coloured wood walls, a red door.
5. house-purple: a narrow tall town house, purple roof, lilac walls, three floors of windows, a blue door.
6. house-orange: a wide bungalow, orange roof, peach walls, a covered porch with two posts and flower boxes.

SHEET buildings-2 (shops and town buildings; 3 columns x 2 rows, 6 buildings)

These must NOT show what they sell or what they are. Shop windows show only soft reflections, plain shelves with plain boxes, or closed blinds: no bread, books, food, medicine, pictures of goods, crosses, flags or symbols. Signboards above shops are plain coloured strips with nothing on them.

7. shop-red: a corner shop with a red-and-cream striped awning over a big front window, a glass door, a plain red signboard.
8. shop-green: the same size of shop with a green-and-cream striped awning, plain green signboard, brick walls.
9. shop-blue: a shop with a blue awning, plain blue signboard, light stone walls, two front windows.
10. hall-stone: a wide, grand stone building with four columns, front steps and a triangular roof front (could be any town hall, bank, museum or library). About 1.5 times as wide as a house.
11. hall-brick: a wide red-brick building with a flat roof, a small square tower in the middle with a plain round window, double doors and a row of tall windows (could be any school, station or office). About 1.5 times as wide as a house.
12. block-glass: a modern two-storey building with a flat roof, teal panels and big glass windows, glass doors. About 1.5 times as wide as a house.

SHEET props-1 (street things; 4 columns x 3 rows, 12 pieces)

1. bus-stop: a small bus shelter with a curved roof, a glass back panel and a bench inside, with a pole beside it holding a plain round sign (no writing, no symbol).
2. fountain: a round stone fountain with water splashing up from the centre into a basin.
3. tree-round: a leafy round green tree with a brown trunk.
4. tree-pine: a tall dark-green pine tree.
5. bench: a wooden park bench facing the viewer.
6. street-lamp: a dark green iron street lamp with one lantern.
7. traffic-light: a traffic light on a pole facing the viewer, showing red, amber and green lights (green lit).
8. signpost: a street name sign on a pole: a plain green rectangle with nothing written on it.
9. bin: a green public litter bin.
10. flower-bed: a small round raised flower bed with mixed bright flowers.
11. bush: a round green bush with a few small flowers.
12. postbox: a red pillar postbox with a rounded top and a plain slot.

SHEET walker (the player's explorer; 4 columns x 3 rows, 12 poses of the SAME character)

One friendly young explorer, about 10 years old, with warm brown skin, short curly black hair, a bright yellow jacket, a teal backpack, dark blue trousers and red trainers. No hat. Full body, the same size, outfit, colours and proportions in every cell, seen from the same three-quarter top-down angle as the buildings.

Columns are directions:
* Column 1: facing down (towards the viewer, face visible).
* Column 2: facing left (side view, walking to the left).
* Column 3: facing right (side view, walking to the right).
* Column 4: facing up (away from the viewer, backpack visible, face not visible).

Rows are poses:
* Row 1: standing still.
* Row 2: walking, left foot forward.
* Row 3: walking, right foot forward.

So cell 1 is "facing down, standing", cell 2 is "facing left, standing", ... cell 12 is "facing up, right foot forward". Every pose stands on the same baseline so the character does not bob up and down between cells.

GROUND TEXTURES (6 separate images)

Each texture is a square 1024 x 1024 image seen straight down from above (not at the three-quarter angle), with flat even daylight, in the same painted style. Each must tile seamlessly: its left edge continues into its right edge and its top edge into its bottom edge, with no visible seam, no border and no single object that stands out (so repeating it shows no obvious pattern). No shadows of objects, no people, no text.

1. grass: short, healthy green lawn with soft variation in tone and a very few tiny scattered daisies.
2. pavement: light warm-grey square paving slabs laid in a straight grid, exactly 4 slabs across and 4 slabs down, with thin darker joints.
3. asphalt: smooth dark-grey road surface with a fine, even grain. No lines, markings, cracks or manhole covers.
4. park-path: a light sandy gravel path surface with small pebbles.
5. water: calm blue pond water with soft, gentle ripples and a few light glints.
6. garden: dark soil densely planted with small mixed flowers (red, yellow, purple, white) and leaves.

THE ENVELOPE (1 image)

A sealed paper envelope seen from the front, slightly tilted, cream-coloured paper with a soft shadow line along the flap, closed with a round red wax seal pressed with a simple star shape. No writing, stamps or address. Square, 1024 x 1024, the envelope filling about 70 percent of the image, on a transparent background if supported, otherwise plain pure white (#FFFFFF), same painted style.

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/mission-trail/sheets/
assets/playmona_assets/mission-trail/textures/
assets/playmona_assets/mission-trail/ui/

Save each image as a PNG with exactly these names:

assets/playmona_assets/mission-trail/sheets/buildings-1.png
assets/playmona_assets/mission-trail/sheets/buildings-2.png
assets/playmona_assets/mission-trail/sheets/props-1.png
assets/playmona_assets/mission-trail/sheets/walker.png
assets/playmona_assets/mission-trail/textures/grass.png
assets/playmona_assets/mission-trail/textures/pavement.png
assets/playmona_assets/mission-trail/textures/asphalt.png
assets/playmona_assets/mission-trail/textures/park-path.png
assets/playmona_assets/mission-trail/textures/water.png
assets/playmona_assets/mission-trail/textures/garden.png
assets/playmona_assets/mission-trail/ui/envelope.png

WORKFLOW

* Generate the buildings-1 sheet first, look at it, and keep its exact style, outline weight, lighting and viewing angle for every image after it.
* Generate each image with its own generation request (one request = one sheet, texture or picture).
* Save the actual generated image files at the paths above.
* Look at every image as it is made. Regenerate it if:
  - a piece is missing, doubled, merged with a neighbour, cut off by the edge or in the wrong order;
  - any text, letters, numbers, symbols or shop goods appear (check signboards and windows closely);
  - a building is drawn at a diagonal/isometric angle or shows a side wall;
  - the walker's outfit, colours or size change between cells, or a pose faces the wrong way;
  - a texture has a visible seam when repeated, a border, or one object that stands out;
  - the background of a sheet is not transparent or plain white.
* Verify that all 11 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Cover

```
Use the image generation capability to make ONE cover picture for the "Mission Trail" game on the Playmona gaming platform.

THE GAME

Players read a secret mission letter once, close it, and then explore a little town from memory to find the right place before time runs out. The cover should make people want to set off on that adventure.

THE PICTURE

A sunny, colourful little town seen from high above at a three-quarter top-down angle: winding roads, a crossroads, cottages with red, blue and green roofs, shops with striped awnings, round trees, a fountain and a bus shelter. In the lower middle, a friendly young explorer (about 10 years old, warm brown skin, short curly black hair, bright yellow jacket, teal backpack, red trainers) stands on the road holding up an open cream-coloured letter, looking ahead with an excited smile. A sealed envelope with a red wax seal flutters beside them. The edges of the town fade into soft white-blue mist, as if the rest of the map is still to be discovered. A faint dotted trail of footprints leads from the explorer into the town.

Style: the same bright, clean 2D illustrated mobile adventure game look as the game's pieces: hand-painted digital art, soft cel shading, clean dark-brown outlines, warm sunlight from the top left, cheerful saturated colours. Not 3D, not a photo.

Rules:
1. Portrait, 1024 x 1536 (2:3), full bleed, no border.
2. Keep the explorer and the letter in the middle band of the picture (from 25 to 75 percent of the height); cards show that band.
3. No text, letters, numbers, title, logos, signs with writing, watermarks or signatures anywhere. The letter's paper shows only soft wavy lines, no readable words.
4. Original designs only. No real brands or famous characters.

Save it as:

assets/playmona_assets/mission-trail/cover.png

Look at it and regenerate it if any text or letters appear, the explorer is cut off, or the town is drawn at a diagonal isometric angle. Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Redo

Claude fills in the names after looking at the contact sheet.

```
Use the image generation capability to regenerate these Mission Trail images, following exactly the same STYLE, VIEWPOINT, SHEET LAYOUT and FILE ORGANISATION rules as before, and overwrite the old files:

* <file>: <what was wrong, and what to fix>

Look at each one as it is made and regenerate it again if the same problem appears. Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```
