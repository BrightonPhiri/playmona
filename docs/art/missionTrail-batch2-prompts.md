# Mission Trail: Codex prompt pack, Batch 2

Batch 2 brings the pictures Stages 6 to 10 need: people to hand things to, things to pick up, cars to
drive and the rooms the pick scenes happen in. Stages 6 to 10 are already built and tested. They stay
hidden in the game until these pictures are cut in, then they open on their own.

Batch 2 is 11 images:

| File | What | Grid |
|---|---|---|
| `sheets/people-1.png` | 12 townspeople (librarian, teacher, doctor, nurse...) | 4 × 3 |
| `sheets/objects-1.png` | 12 things to carry (caps, bag, newspaper, keys...) | 4 × 3 |
| `sheets/cars-1.png` | 3 cars (red, blue, green) × 4 directions | 4 × 3 |
| `rooms/*.png` (8 files) | rooms behind the pick scenes: bedroom, hallway, kitchen, library, classroom, hospital, post office, garage | single |

How to use it:

1. Open Codex in the `playmona` folder and paste **Batch 2** below. Let it finish.
2. Tell Claude the files are ready. Claude cuts the sheets (`python tools/cut-art-sheets.py missionTrail`),
   removes the backgrounds, sizes the rooms and shows you a contact sheet so you can reject any picture.

Raw files land in `assets/playmona_assets/mission-trail/`, which git ignores. Only small WebP copies ship.

Why the details matter: the letters describe people by what they wear ("She wears glasses and a yellow
cardigan", "He wears a white coat"), and each scene puts a look-alike next to the right person (the
nurse beside the doctor, the mechanic beside the postman). So every outfit must match its line below
exactly, and no two people may share a main colour.

---

## Batch 2: people, things, cars and rooms

```
Use the image generation capability to generate 11 images for the "Mission Trail" game on the Playmona gaming platform: 3 picture sheets and 8 room pictures. Follow every rule below exactly.

THE GAME

Mission Trail is a 2D adventure game for children and adults. The player reads a mission letter once, then walks a little town from memory. Some missions ask the player to pick up the right thing from a busy room, hand it to the right person, or get into the right car and drive it. These pictures are those people, things, cars and rooms. The game places the people and things on top of the rooms itself, so each piece on a sheet must be a separate, clean object.

STYLE (identical for every image, and identical to the game's existing town pictures)

1. Bright, clean 2D illustrated mobile adventure game art: a hand-painted digital look with soft cel shading, clean dark-brown outlines of even medium weight, warm sunny daylight from the top left, cheerful saturated colours (not neon). Friendly and inviting, like a polished storybook town.
2. Not a 3D render, not a photograph, not pixel art, not flat vector clip art.
3. Original designs only. No real brands, logos, car makes, uniforms of real companies or famous characters.
4. No text, letters, numbers, name badges, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere. Newspapers, books and signs show only plain lines or plain colour, never readable words.

SHEET LAYOUT (for the 3 sheets; Claude cuts each sheet into separate pieces)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 pieces in an even grid of 4 columns x 3 rows, in the numbered reading order (row 1 left to right, then row 2, then row 3).
3. Each piece sits in the centre of its own grid cell, whole (nothing cut off), filling about 75 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring pieces and between pieces and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) with no gradient, texture or vignette.
6. No ground, floor, shadows on the background or scenery under or around a piece. Only the piece itself.
7. Because the white background is removed by computer, no piece has pure white on its outer edge: white coats, shirts and paint get light grey shading and the normal outline.

SHEET people-1 (12 townspeople; 4 columns x 3 rows)

Full body, standing, facing the viewer (front view, slight three-quarter turn allowed), feet together on the same baseline, arms relaxed or holding the one item named. All adults are drawn at the same height and scale; children are about two thirds of an adult's height. A mix of skin tones and hair. Each person's main outfit colour is different from every other person's, so a player can tell them apart at a glance.

1. librarian: an older woman with grey hair in a neat bun and small round glasses, a long purple cardigan over a plum skirt, holding a tall pile of three plain books in both arms.
2. teacher: a young woman with dark hair in a ponytail and black-framed glasses, a bright yellow cardigan over a white blouse (drawn light grey) and a navy skirt, holding one closed notebook.
3. doctor: a man with short black hair, a long white doctor's coat drawn in light grey with grey shading, a stethoscope around his neck, a teal shirt underneath, dark trousers.
4. nurse: a woman with curly brown hair, a light sky-blue nurse's tunic and matching trousers, a small watch pinned to the tunic. No white coat, no stethoscope.
5. mechanic: a man with a short beard, bright orange work overalls with a few grease smudges, holding a large spanner.
6. postman: a man with a friendly smile, a royal-blue postal uniform jacket and trousers, a matching blue peaked cap, a brown mail bag across his body. No writing or emblem on the bag or cap.
7. shopkeeper: a woman with short red hair, a green apron over a cream shirt, holding nothing.
8. gardener: a man in a wide straw hat, brown dungarees over a checked shirt, holding a small green watering can.
9. grandma: a grandmother with white curly hair (drawn light grey), a flowery pink-and-red dress, a wooden walking stick.
10. grandpa: a grandfather with a grey moustache, a brown flat cap, a brown waistcoat over a light blue shirt, beige trousers.
11. boy: a boy about 8 years old, short hair, a red T-shirt, khaki shorts, trainers.
12. girl: a girl about 8 years old, two puffs of hair with ribbons, a pink dress, sandals.

SHEET objects-1 (12 things to carry; 4 columns x 3 rows)

Each thing is shown on its own, at a slight three-quarter angle from above, about the size that fills its cell, all things drawn at the same scale feel (a cap and a book look about the same size on the sheet). Bold, simple shapes and clear colours, because the player must spot them in a busy room.

1. red-cap: a bright red baseball cap with a curved peak, no logo.
2. blue-cap: the same baseball cap in bright blue, no logo.
3. green-cap: the same baseball cap in bright green, no logo.
4. medical-bag: a brown leather doctor's bag with a metal clasp and a handle, closed. No cross or symbol.
5. newspaper: a folded newspaper with plain grey lines and one plain grey picture box, no readable words.
6. keys: a bunch of three keys on a round metal ring with a small yellow tag (blank).
7. book-blue: a closed blue hardback book, plain cover, no title.
8. book-red: a closed red hardback book, plain cover, no title.
9. umbrella: a closed yellow umbrella with a curved wooden handle.
10. teddy-bear: a soft brown teddy bear sitting up.
11. water-bottle: a green reusable water bottle with a silver cap.
12. watch: a wristwatch with a brown leather strap and a plain round face with no numbers.

SHEET cars-1 (3 small cars x 4 directions; 4 columns x 3 rows)

One friendly little rounded hatchback car design (original, no real make, no badge, no number plate text), the SAME design, size and proportions in every cell, only the body colour changing by row. Seen from the same three-quarter top-down angle as the town: the camera is high up in the south looking down at about 50 degrees. Windows are light blue glass with no driver visible. Wheels touch one flat baseline.

Rows are colours:
* Row 1: bright red body.
* Row 2: bright blue body.
* Row 3: bright green body.

Columns are directions:
* Column 1: facing down (driving towards the viewer: the front, bonnet, headlights and roof are visible).
* Column 2: facing left (side view, driving to the left: the whole left side and the roof are visible).
* Column 3: facing right (side view, driving to the right: the mirror image of column 2).
* Column 4: facing up (driving away from the viewer: the back, rear lights and roof are visible).

So cell 1 is "red car facing down", cell 2 is "red car facing left", ... cell 12 is "green car facing up". In the side views the car is about 1.6 times as long as it is tall; in the front and back views it is about as wide as it is tall.

ROOMS (8 separate pictures)

These are the backgrounds the pick scenes are shown on. The game puts the people or things on top, so each room must be empty: no people, and no loose small objects that could be mistaken for something to pick (no caps, bags, books lying about, bottles, toys, keys or newspapers). Furniture and decoration stay around the edges and in the top third; the lower two thirds are mostly clear floor so the game's pieces stand out against it. Seen from the front at eye level, like a stage set, with a back wall and a floor. Soft, slightly muted colours so the pieces on top look brighter. Same painted style, warm light.

Each room is a landscape 1536 x 1024 image, full bleed (it fills the whole picture, no transparent or white background), no border.

1. bedroom: a cosy child's bedroom: a bed with a patchwork quilt against the left wall, a window with curtains, a rug, a wardrobe on the right. Shelves are empty or hold only plain boxes.
2. hallway: a family home's front hallway: a front door on the left, a coat rack with coats only (no hats, no bags), a long rug, a staircase on the right.
3. kitchen: a bright family kitchen: cupboards along the back wall, a window over the sink, a table with chairs pushed to one side, an empty table top.
4. library: inside a library: tall wooden bookshelves full of plain coloured book spines along the back wall (no titles), a wide reading area of wooden floor, a desk to one side.
5. classroom: a primary school classroom: a plain green chalkboard with nothing written on it, a teacher's desk, small desks pushed to the sides, colourful plain paper shapes on the walls.
6. hospital: a clean, friendly hospital corridor or waiting area: pale walls, a row of chairs along one side, a reception counter, potted plants. No crosses, no symbols, no medical equipment in the middle.
7. post-office: inside a small post office: a counter with a glass screen at the back, plain pigeonholes on the wall, parcels stacked neatly in a corner. No writing, no emblems.
8. garage: a car workshop: a tool wall with spanners on hooks, tyres stacked in a corner, a workbench, an open roller door at the back showing daylight, oil-stained concrete floor. No cars inside.

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/mission-trail/sheets/
assets/playmona_assets/mission-trail/rooms/

Save each image as a PNG with exactly these names:

assets/playmona_assets/mission-trail/sheets/people-1.png
assets/playmona_assets/mission-trail/sheets/objects-1.png
assets/playmona_assets/mission-trail/sheets/cars-1.png
assets/playmona_assets/mission-trail/rooms/bedroom.png
assets/playmona_assets/mission-trail/rooms/hallway.png
assets/playmona_assets/mission-trail/rooms/kitchen.png
assets/playmona_assets/mission-trail/rooms/library.png
assets/playmona_assets/mission-trail/rooms/classroom.png
assets/playmona_assets/mission-trail/rooms/hospital.png
assets/playmona_assets/mission-trail/rooms/post-office.png
assets/playmona_assets/mission-trail/rooms/garage.png

WORKFLOW

* Look at the existing Batch 1 sheets first (assets/playmona_assets/mission-trail/sheets/buildings-1.png and walker.png) and match their style, outline weight, lighting and colours exactly.
* Generate each image with its own generation request (one request = one sheet or one room).
* Save the actual generated image files at the paths above.
* Look at every image as it is made. Regenerate it if:
  - a piece is missing, doubled, merged with a neighbour, cut off by the edge or in the wrong order;
  - any text, letters, numbers, logos, symbols or name badges appear;
  - a person's outfit does not match its description, or two people share a main colour;
  - the doctor has no white coat or stethoscope, the nurse wears white, or the postman's uniform is not blue;
  - a car changes design or size between cells, faces the wrong way, or shows a badge or plate text;
  - a room contains people, loose small objects, or furniture in the middle of the floor;
  - the background of a sheet is not transparent or plain white.
* Verify that all 11 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Redo (for rejected pictures)

```
Regenerate only these Mission Trail pictures, keeping every rule from the Batch 2 prompt (same style, same layout, same file names, overwrite the old files): <list the files and what was wrong>.
```
