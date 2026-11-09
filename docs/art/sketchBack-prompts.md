# SketchBack: Codex prompt pack

Reference sketches for **SketchBack**: 128 black-and-white line drawings (animals, food, nature, transport,
household and everyday things), plus one cover.

Drawings are made as **sheets of 12** (a 4 x 3 grid), so Codex makes 11 images instead of 128. Claude cuts each
sheet into 12 sketches, removes the white around them, and saves each as a 512 px WebP.

How to use it:

1. In Codex, opened in the `playmona` folder, **attach your tree sketch** to every batch prompt: it is the style
   every drawing must match.
2. Paste **Batch 1** and let it finish, then the next batches. Each batch makes up to 4 sheets.
3. Paste the **Cover** prompt.
4. Tell Claude the files are ready. Claude runs `python tools/cut-art-sheets.py sketchBack`, then
   `node tools/sketchback/gen-files.js`, and shows a contact sheet so you can reject any drawing. A short
   **Redo** prompt is at the end.

Raw files land in `assets/playmona_assets/sketchback/`, which git ignores. The game stays off the games list
until at least 60 sketches are in.

---

## Batch 1: sheets 1 to 4

```
Use the image generation capability to generate 4 picture sheets for the "SketchBack" game on the Playmona gaming platform. Each sheet shows up to 12 different objects in a 4 x 3 grid. I have attached a tree sketch: it is the style reference for every drawing.

PURPOSE

Players see one of these sketches for a few seconds and copy it on their phone, then later try to remember what they drew. Each sketch must be instantly recognisable as one clear thing.

STYLE (the same for every sheet, so all 128 sketches look like one set)

1. Match the attached tree sketch exactly: a clean black ink line drawing, as if drawn by hand with a fine black pen. Natural, slightly uneven hand-drawn lines, not a computer vector look.
2. Black lines only on white. No colour, no grey fills, no gradients, no shading, no hatching, no shadows, no texture, no photographs.
3. One consistent medium line weight for every object, about as thick as the tree sketch's outline.
4. Each object is a recognisable silhouette with only a few inner details (the details listed). Simple enough that someone could copy it in 5 seconds, interesting enough that it is a challenge.
5. Every object at the same scale feel: it fills its cell, whether it is a key or an elephant.
6. Each object shown whole, nothing cut off, in the view described.
7. No text, letters, numbers, labels, logos, signatures, borders, frames, grid lines, ground lines or background elements. Only the object.
8. Original drawings, no famous characters or brands.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects (or the number listed) in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: plain pure white (#FFFFFF), perfectly flat. Every outline must be closed and unbroken where it meets the background, so the cutting tool keeps each object in one piece.

THE SHEETS

Sheet 1: sheets/sketches-01.png
1. a sitting cat seen from the front, pointed ears, whiskers and a curled tail
2. a friendly dog sitting side-on, floppy ears, collar and wagging tail
3. a simple fish side-on with a fan tail, one eye, a few scales and fins
4. a small round bird perched side-on, short beak, wing and tail feathers
5. a snail side-on with a spiral shell and two eye stalks
6. a snake coiled in an S shape with a forked tongue and a few pattern marks
7. a butterfly seen from above with four patterned wings and two antennae
8. an elephant side-on with big ears, a curled trunk and small tusks
9. a turtle side-on with a domed patterned shell, head and four legs
10. a rabbit sitting side-on with long upright ears and a fluffy tail
11. an owl seen from the front with big round eyes, ear tufts and folded wings
12. a spider seen from above with eight bent legs and a round body

Sheet 2: sheets/sketches-02.png
1. a duck side-on with a flat bill, a wing and webbed feet
2. a bee side-on with a striped body, two wings and a little stinger
3. a whale side-on with a big head, a tail fluke and a water spout
4. a whole giraffe side-on with a long neck, patches and small horns, sitting so it fits
5. an octopus with a round head and eight curling tentacles with suckers
6. a frog sitting front three-quarter, big eyes on top, bent back legs
7. a crab seen from the front with two big claws, eye stalks and six legs
8. a horse standing side-on with a mane, a tail and hooves
9. a lion head and shoulders from the front with a big shaggy mane
10. an apple with a short stalk and one leaf
11. a single curved banana with a stalk end
12. a triangle slice of pizza with a crust and round toppings

Sheet 3: sheets/sketches-03.png
1. a round ring doughnut with icing drips and sprinkles
2. an ice cream cone with two scoops and a criss-cross cone pattern
3. two cherries joined at the stalks with a leaf
4. a carrot with a pointed tip, a few lines across it and leafy top
5. a round spiral lollipop on a stick
6. a fried egg seen from above, wavy white edge and round yolk
7. a burger side-on with a sesame bun, lettuce, cheese and patty layers
8. a round layered birthday cake with icing drips and three candles
9. a pear with a stalk and one leaf
10. a strawberry with seed dots and a leafy top
11. a bunch of grapes with a stalk and a leaf
12. a cupcake with a ridged paper case and a swirl of icing with a cherry

Sheet 4: sheets/sketches-04.png
1. a half-moon slice of watermelon with rind lines and seeds
2. a pineapple with a criss-cross skin pattern and a spiky leaf crown
3. a hot dog in a bun side-on with a squiggle of mustard
4. a triangle sandwich side-on showing layers of bread, cheese and lettuce
5. a curved croissant with its rolled segments
6. a twisted knot pretzel with salt dots
7. a tree with a sturdy trunk, a few branches and a cloud-shaped leafy crown
8. a daisy-like flower with round petals, a centre, a stem and two leaves
9. a mushroom with a domed spotted cap and a thick stem
10. a round sun with straight rays all around
11. a fluffy cloud with three or four rounded bumps
12. a crescent moon with a couple of small craters

FILE ORGANISATION

Save the sheets as:

assets/playmona_assets/sketchback/sheets/sketches-01.png
assets/playmona_assets/sketchback/sheets/sketches-02.png
assets/playmona_assets/sketchback/sheets/sketches-03.png
assets/playmona_assets/sketchback/sheets/sketches-04.png

WORKFLOW

* Generate each sheet with its own request.
* Look at each sheet before saving. Regenerate it if an object is missing, coloured, shaded, cut off, touching another, out of order, or if there is any text.
* Verify each file exists and is a valid image.
```

---

## Batch 2: sheets 5 to 8

```
Use the image generation capability to generate 4 picture sheets for the "SketchBack" game on the Playmona gaming platform. Each sheet shows up to 12 different objects in a 4 x 3 grid. I have attached a tree sketch: it is the style reference for every drawing.

PURPOSE

Players see one of these sketches for a few seconds and copy it on their phone, then later try to remember what they drew. Each sketch must be instantly recognisable as one clear thing.

STYLE (the same for every sheet, so all 128 sketches look like one set)

1. Match the attached tree sketch exactly: a clean black ink line drawing, as if drawn by hand with a fine black pen. Natural, slightly uneven hand-drawn lines, not a computer vector look.
2. Black lines only on white. No colour, no grey fills, no gradients, no shading, no hatching, no shadows, no texture, no photographs.
3. One consistent medium line weight for every object, about as thick as the tree sketch's outline.
4. Each object is a recognisable silhouette with only a few inner details (the details listed). Simple enough that someone could copy it in 5 seconds, interesting enough that it is a challenge.
5. Every object at the same scale feel: it fills its cell, whether it is a key or an elephant.
6. Each object shown whole, nothing cut off, in the view described.
7. No text, letters, numbers, labels, logos, signatures, borders, frames, grid lines, ground lines or background elements. Only the object.
8. Original drawings, no famous characters or brands.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects (or the number listed) in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: plain pure white (#FFFFFF), perfectly flat. Every outline must be closed and unbroken where it meets the background, so the cutting tool keeps each object in one piece.

THE SHEETS

Sheet 5: sheets/sketches-05.png
1. a five-pointed star
2. a zig-zag lightning bolt
3. a single teardrop-shaped raindrop with a small shine line
4. two pointed mountain peaks with snow caps
5. a single leaf with a stalk and veins
6. a tall cactus with two arms, ribs and little spines, in a small pot
7. a rainbow arc of four bands ending in two small clouds
8. a curling ocean wave with foam lines
9. an acorn with its textured cap and a little stalk
10. a single long feather with a quill and side barbs
11. a scallop seashell with ridges fanning out
12. a palm tree with a curved ringed trunk, big fronds and coconuts

Sheet 6: sheets/sketches-06.png
1. a cone-shaped volcano with lava dripping and a puff of smoke
2. a six-armed snowflake with branches on each arm
3. a small round island with one palm tree and waves around it
4. a pine cone with overlapping scales
5. a small car side-on with two wheels, windows and door lines
6. a small sailing boat side-on with a hull, mast and triangle sail
7. a bicycle side-on with two spoked wheels, frame, seat and handlebars
8. a passenger aeroplane seen from the side and slightly above, wings, tail and windows
9. a bus side-on with a row of windows, a door and wheels
10. a rocket standing upright with fins, a round window and flame at the bottom
11. a truck side-on with a cab and a box trailer and three wheels
12. a kick scooter side-on with a deck, two small wheels and a T handlebar

Sheet 7: sheets/sketches-07.png
1. a skateboard three-quarter view showing the deck and four wheels
2. an open parachute canopy with lines down to a small hanging person shape
3. a traffic light on a pole with three round lights
4. a ship anchor with a ring on top, crossbar and curved arms
5. a steam train engine side-on with a funnel, cab, wheels and puffs of smoke
6. a helicopter side-on with top rotor blades, tail rotor and skids
7. a motorbike side-on with two wheels, seat, handlebars and engine
8. a farm tractor side-on with a big back wheel, small front wheel and cab
9. a submarine side-on with a tower, periscope and round portholes
10. a hot air balloon with striped panels and a basket hanging below
11. a fire engine side-on with a ladder on top, wheels and a light
12. a roller skate boot side-on with laces and four wheels

Sheet 8: sheets/sketches-08.png
1. a car steering wheel seen from the front with three spokes
2. a wooden chair three-quarter view with four legs and a back
3. a simple table three-quarter view with four legs
4. a round wall clock with numbers shown as dashes and two hands
5. a front door with panels, a handle and a small window
6. a house window with four panes and open curtains
7. a mug with a handle and a little steam
8. a dinner fork with four prongs
9. a spoon with a rounded bowl
10. a candle with a flame and a drip of wax
11. a table lamp with a cone shade and round base
12. an old-style television set with a screen, two knobs and antennae

FILE ORGANISATION

Save the sheets as:

assets/playmona_assets/sketchback/sheets/sketches-05.png
assets/playmona_assets/sketchback/sheets/sketches-06.png
assets/playmona_assets/sketchback/sheets/sketches-07.png
assets/playmona_assets/sketchback/sheets/sketches-08.png

WORKFLOW

* Generate each sheet with its own request.
* Look at each sheet before saving. Regenerate it if an object is missing, coloured, shaded, cut off, touching another, out of order, or if there is any text.
* Verify each file exists and is a valid image.
```

---

## Batch 3: sheets 9 to 11

```
Use the image generation capability to generate 3 picture sheets for the "SketchBack" game on the Playmona gaming platform. Each sheet shows up to 12 different objects in a 4 x 3 grid. I have attached a tree sketch: it is the style reference for every drawing.

PURPOSE

Players see one of these sketches for a few seconds and copy it on their phone, then later try to remember what they drew. Each sketch must be instantly recognisable as one clear thing.

STYLE (the same for every sheet, so all 128 sketches look like one set)

1. Match the attached tree sketch exactly: a clean black ink line drawing, as if drawn by hand with a fine black pen. Natural, slightly uneven hand-drawn lines, not a computer vector look.
2. Black lines only on white. No colour, no grey fills, no gradients, no shading, no hatching, no shadows, no texture, no photographs.
3. One consistent medium line weight for every object, about as thick as the tree sketch's outline.
4. Each object is a recognisable silhouette with only a few inner details (the details listed). Simple enough that someone could copy it in 5 seconds, interesting enough that it is a challenge.
5. Every object at the same scale feel: it fills its cell, whether it is a key or an elephant.
6. Each object shown whole, nothing cut off, in the view described.
7. No text, letters, numbers, labels, logos, signatures, borders, frames, grid lines, ground lines or background elements. Only the object.
8. Original drawings, no famous characters or brands.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects (or the number listed) in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: plain pure white (#FFFFFF), perfectly flat. Every outline must be closed and unbroken where it meets the background, so the cutting tool keeps each object in one piece.

THE SHEETS

Sheet 9: sheets/sketches-09.png
1. a bed side-on with a headboard, pillow and blanket
2. a three-seat sofa from the front with cushions and armrests
3. a broom with a long handle and bristles
4. a bucket with a handle
5. a frying pan from above at an angle with a long handle
6. a light bulb with a screw base and a filament inside
7. a teapot side-on with a spout, lid, knob and handle
8. a clawfoot bathtub side-on with bubbles and a tap
9. an electric kettle side-on with a handle, spout and switch
10. a toaster with two slices of toast popping up
11. an open umbrella with panels and a curved handle
12. an old-style key with a round loop and teeth

Sheet 10: sheets/sketches-10.png
1. a closed hardback book three-quarter view with page lines
2. a pencil lying at an angle with a sharpened tip and an eraser
3. a top hat with a band
4. a single sock with stripes at the top and a heel
5. a round party balloon with a knot and a curly string
6. a closed envelope with the flap lines
7. a lace-up trainer side-on with a sole and laces
8. a pair of glasses from the front with round lenses and arms
9. a pair of open scissors with two finger loops
10. a gift box with a ribbon and a bow on top
11. a king crown with five points and jewels
12. a claw hammer with a handle

Sheet 11: sheets/sketches-11.png
1. a wooden ladder standing slightly angled with rungs
2. a short-sleeved T-shirt laid flat from the front
3. an old desk telephone with a rotary dial and handset on top
4. a school backpack from the front with a pocket and straps
5. a camera from the front with a big lens, flash and button
6. an acoustic guitar with a sound hole, strings and tuning pegs
7. a trophy cup with two handles on a stepped base
8. a pair of over-ear headphones with a headband

FILE ORGANISATION

Save the sheets as:

assets/playmona_assets/sketchback/sheets/sketches-09.png
assets/playmona_assets/sketchback/sheets/sketches-10.png
assets/playmona_assets/sketchback/sheets/sketches-11.png

WORKFLOW

* Generate each sheet with its own request.
* Look at each sheet before saving. Regenerate it if an object is missing, coloured, shaded, cut off, touching another, out of order, or if there is any text.
* Verify each file exists and is a valid image.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "SketchBack" game on the Playmona gaming platform. Tagline: Draw it. Remember it. Name it.

LOOK

* A premium creative-studio scene: a warm off-white sheet of drawing paper on a soft lilac-to-blue gradient desk, lit softly from the top left. Clean, modern, calm, with deep navy, purple and blue accents only.
* On the paper: a crisp black ink sketch of a cat (in the same hand-drawn line style as the attached tree sketch), and next to it a wobbly, unfinished copy of the same cat drawn by a player, as if from memory. A navy pencil lies across the paper, its tip just finishing a line.
* Around it, slightly out of focus, three small paper cards with simple line sketches (a bicycle, a cup, an umbrella) and a round purple-and-blue countdown ring floating above the paper, two thirds full.
* It must feel different from the platform's other covers, which are dark, painterly living-room scenes lit by a warm lamp. No room, no lamp, no dark vignette.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* The game card shows only the MIDDLE of the picture (a wide band across the centre), so the two cats and the pencil must sit in the middle 50 percent of the height. The top and bottom quarters are just desk and soft blur.
* No text, letters, numbers, logos, watermarks, frames or hands.

FILE ORGANISATION

Save it as:

assets/playmona_assets/sketchback/cover.png

WORKFLOW

* Generate it with a single request.
* Look at it. Regenerate if a sketch is malformed or there is any text.
* Verify the file exists and is a valid image.
```

---

## Redo (for sheets or sketches rejected after review)

Claude fills in the list below after review. A bad sketch is fixed by redoing its whole sheet.

```
Use the image generation capability to regenerate these picture sheets for the "SketchBack" game on the Playmona gaming platform, replacing the existing files. I have attached the tree sketch again: match its style. Follow exactly the same STYLE and LAYOUT rules as before: black hand-drawn ink lines only, no colour or shading, 12 objects in a 4 x 3 grid in the numbered order, at least 40 px of empty space between objects, plain pure white background, no text, landscape 1536 x 1024.

<list: path - which objects were wrong - what to show instead, plus the full numbered list for that sheet>

Generate each sheet with its own request, look at it before saving, overwrite the old file, and verify each file exists.
```
