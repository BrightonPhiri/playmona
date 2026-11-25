# Picture Rush: Codex prompt pack

Pictures for **Picture Rush**, the tile-swap picture puzzle. There are 96
pictures in 6 themes (16 each), plus one cover.

How to use it:

1. Paste **Batch 1** into Codex, opened in the `playmona` folder, and let it
   finish. Then do Batches 2 and 3. Each batch makes 32 pictures.
2. Paste the **Cover** prompt.
3. Tell Claude the files are ready. Claude checks that every file exists, crops
   and compresses them (`python tools/process-game-art.py pictureRush`, then
   `node tools/gen-asset-manifest.js`), and makes a contact sheet so you can
   reject any bad ones. A short **Redo** prompt for just those is at the end.

Raw files land in `assets/playmona_assets/picture-rush/`. Git ignores them
because they are about 2.5 MB each. Only the 1024 x 1024 webp copies ship
(`assets/images/games/pictureRush/`). The game uses each picture as soon as its
file is there, so a batch can ship on its own; until then it uses the old
drawings.

The picture list lives in `js/data/pictureRush.js` (ids and names) and
`tools/art/pictureRush.json` (ids, sizes).

---

## Batch 1: Animals and Nature & places

```
Use the image generation capability to generate 32 separate images for the "Picture Rush" puzzle game on the Playmona gaming platform: one picture for each of the 32 scenes listed below.

PURPOSE

Each picture is cut into a grid of square tiles (from 3 x 3 up to 6 x 6) and scrambled. Players swap tiles until the picture is whole again. So every part of the picture must be different from every other part: a player looking at one small tile should be able to tell where it belongs.

STYLE (the same for every picture, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp edges, warm daylight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and joyful. Any people are friendly, simply drawn and shown from a distance or at their activity; no close-up faces.
3. Square, 1:1, at least 1024 x 1024, with the scene running right to the edges (full bleed).

COMPOSITION (important: it becomes a puzzle)

1. Detail and colour in EVERY part of the frame, corners and edges included. Spread the main things in the scene across the whole square, not all in the middle.
2. No large plain areas: plain sky, blank walls, still water, snow, fog or empty floor may cover at most a fifth of the picture, and should carry clouds, birds, ripples or texture.
3. No repeating patterns that make tiles look alike: no brick walls, tiled floors, wallpaper, checked cloths, rows of identical windows or identical animals in a line.
4. Not mirror-symmetric: show the scene a little from one side, so the left and right halves differ.
5. Varied colours across the picture: each area should have its own main colour.
6. No text, letters, numbers, signs with writing, logos, watermarks, signatures, borders, frames or UI.

PICTURES (id: what the picture shows)

1. animals-lions: a lion family (a maned male, two lionesses, three playful cubs) resting on a sunny rock in golden grass, flat-topped acacia trees and a distant herd of wildebeest behind
2. animals-elephants: elephants of different sizes drinking and splashing at a muddy waterhole, a baby spraying water, reeds, oxpecker birds and a thorn tree
3. animals-giraffes: three giraffes eating from tall acacia trees, two zebras and a big termite mound below, red earth and green bushes
4. animals-zebras: a small herd of zebras crossing a shallow river, splashing water, smooth boulders, a green bank with a grey heron
5. animals-cheetahs: a cheetah mother and three fluffy cubs on a fallen log in long grass, purple and yellow wildflowers, a hill behind
6. animals-gorillas: a gorilla family in a green forest clearing, a baby riding on its mother's back, ferns, fallen fruit and a mossy tree trunk
7. animals-hippos: hippos in a brown river with heads and backs showing, white egrets standing on their backs, papyrus reeds and a crocodile on a sandbank
8. animals-flamingos: pink flamingos in many different poses wading in a blue lake, some flying, their reflections in the water, green hills behind
9. animals-parrots: red, blue and yellow macaws on branches among big tropical leaves and orange flowers, a small waterfall behind
10. animals-pandas: a giant panda eating bamboo beside a stream, a red panda on a branch above, pink blossom and mossy rocks
11. animals-tiger: a tiger drinking at a jungle stream, mossy rocks, ferns, blue butterflies and patches of sunlight
12. animals-penguins: a group of penguins on a beach of orange and grey rocks, small waves, a seal on a rock, blue sea
13. animals-koalas: two koalas in a eucalyptus tree, a kangaroo with a joey in its pouch on the red earth below, yellow wattle flowers
14. animals-reef: a sea turtle, clownfish, a ray and many colourful fish over pink, orange and purple corals in clear blue water
15. animals-farm: a red barn, a cow, pigs in mud, hens and chicks, a sheep, a small tractor and a duck pond
16. animals-fox: a red fox among orange autumn leaves, red mushrooms, a hedgehog, two squirrels and golden trees
17. nature-waterfall: a huge waterfall plunging into a deep green gorge with a rainbow in the spray, wet cliffs, a small footbridge and tropical trees
18. nature-beach: leaning palm trees, a turquoise sea, a striped umbrella, a wooden canoe, shells on the sand and a small green island
19. nature-lake: rocky mountain peaks filling the top of the picture, a turquoise lake, a red canoe, pine trees and wildflowers on the shore
20. nature-forest: a path through a forest of red, orange and gold trees, a wooden bridge over a stream and a deer
21. nature-meadow: a hillside meadow of red poppies, daisies and purple lupins, beehives, a stone wall and a farmhouse
22. nature-oasis: golden sand dunes, a blue pool ringed by palm trees, three camels, a tent with patterned rugs
23. nature-terraces: bright green rice terraces stepping down a hillside, farmers in straw hats, a small village and a river
24. nature-tulips: fields of red, yellow and purple tulips, a windmill, a canal with a small boat and a farmhouse
25. nature-canyon: a red rock canyon with a winding green river, two yellow rafts, a hawk and pine trees on the rim
26. nature-jungle: a winding river through rainforest, a wooden boat, monkeys in the trees, giant leaves and pink flowers
27. nature-volcano: a smoking volcano on a green island, a village with coloured roofs, fishing boats and a blue sea
28. nature-baobab: giant baobab trees at sunset, a red dirt road, a family walking, elephants far away, orange and purple clouds with birds (sky no more than a third of the picture)
29. nature-blossom: pink cherry trees, a red bridge over a koi pond, stepping stones and stone lanterns
30. nature-lavender: curving rows of purple lavender, a stone farmhouse, sunflowers along the edge and a yellow bicycle
31. nature-aurora: green and pink northern lights over a lake, a wooden cabin with glowing windows, pine trees and the lights reflected in the water
32. nature-cave: a glowing cave with blue water, purple and gold crystals, a small boat with a lantern

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/picture-rush/

Save each image as <id>.png, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/picture-rush/animals-lions.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folder above.
* Look at every image as it is made. Regenerate it if it contains any text, letters or numbers, if it has a border or frame, if a big plain area (sky, wall, water, snow) covers more than a fifth of it, if it is mirror-symmetric, if it has a repeating pattern, or if the scene is missing what is listed.
* Verify that all 32 files exist and are valid square images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Batch 2: Food and City & buildings

```
Use the image generation capability to generate 32 separate images for the "Picture Rush" puzzle game on the Playmona gaming platform: one picture for each of the 32 scenes listed below.

PURPOSE

Each picture is cut into a grid of square tiles (from 3 x 3 up to 6 x 6) and scrambled. Players swap tiles until the picture is whole again. So every part of the picture must be different from every other part: a player looking at one small tile should be able to tell where it belongs.

STYLE (the same for every picture, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp edges, warm daylight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and joyful. Any people are friendly, simply drawn and shown from a distance or at their activity; no close-up faces.
3. Square, 1:1, at least 1024 x 1024, with the scene running right to the edges (full bleed).

COMPOSITION (important: it becomes a puzzle)

1. Detail and colour in EVERY part of the frame, corners and edges included. Spread the main things in the scene across the whole square, not all in the middle.
2. No large plain areas: plain sky, blank walls, still water, snow, fog or empty floor may cover at most a fifth of the picture, and should carry clouds, birds, ripples or texture.
3. No repeating patterns that make tiles look alike: no brick walls, tiled floors, wallpaper, checked cloths, rows of identical windows or identical animals in a line.
4. Not mirror-symmetric: show the scene a little from one side, so the left and right halves differ.
5. Varied colours across the picture: each area should have its own main colour.
6. No text, letters, numbers, signs with writing, logos, watermarks, signatures, borders, frames or UI.

PICTURES (id: what the picture shows)

1. food-fruit-market: a market stall piled with mangoes, watermelons, bananas, pineapples, oranges and grapes in woven baskets
2. food-pizza: a big pizza with colourful toppings on a wooden table, a salad bowl, drinks, a candle, hands reaching for slices
3. food-breakfast: eggs, toast, sliced fruit, a jug of juice and a teapot on a wooden table with a flowered cloth
4. food-cakes: a bakery counter with decorated cakes, cupcakes, cookies and a tall birthday cake, each a different colour
5. food-sushi: sushi and rolls on a dark wooden board, chopsticks, a teapot and small dipping bowls
6. food-picnic: a picnic blanket with sandwiches, fruit and juice, a wicker basket, a dog, a kite in a tree, a pond
7. food-vegetables: a garden with tomatoes, pumpkins, carrots, cabbages and sunflowers, a wheelbarrow and a scarecrow
8. food-ice-cream: an ice cream cart with many flavours, cones, sprinkles and a striped awning on a sunny seaside path
9. food-braai: a braai grill with sausages, corn and meat, bowls of salad, a garden table with plates and a tree
10. food-nshima: a family table with nshima, relish, green vegetables, beans, fried fish and chicken stew in colourful bowls
11. food-sweets: jars of different shapes and colours full of sweets, lollipops, candy canes and wrapped chocolates
12. food-tacos: tacos, guacamole, salsa, limes, peppers and corn on a bright table
13. food-pancakes: a tall stack of pancakes with berries, syrup and cream, a milk jug and a bowl of fruit
14. food-spices: heaps of colourful spices in sacks and bowls, hanging lanterns and strings of dried chillies
15. food-smoothies: glasses of colourful smoothies, cut fruit, a blender and straws by a sunny window with plants
16. food-burger: a tall burger, a basket of chips, a strawberry milkshake and a ketchup bottle on a diner table
17. city-street: a hillside street of brightly painted houses with flower boxes, a tram, a cat on a step
18. city-harbour: colourful fishing boats in a harbour, a lighthouse, houses climbing the hill, seagulls
19. city-paris: the Eiffel Tower above a park with a carousel, café tables, flower beds and the river
20. city-pyramids: the Giza pyramids and the Sphinx, a camel caravan and a grove of palm trees
21. city-taj-mahal: the Taj Mahal seen from an angle (not straight on), its gardens, a long pool, a boat on the river and birds
22. city-great-wall: the Great Wall winding over green mountains, watchtowers and trees in autumn colours
23. city-london: Tower Bridge, a red bus crossing it, a boat on the river, Big Ben in the distance
24. city-venice: a canal with gondolas, colourful old buildings, a stone bridge and flower pots on the windowsills
25. city-santorini: white houses with blue domes on a cliff, pink bougainvillea, the deep blue sea and a boat
26. city-sydney: the Sydney Opera House and Harbour Bridge, sailing boats and a green ferry
27. city-castle: a castle on a green hill, a village below, a river, sheep and coloured flags
28. city-night-city: a city skyline at dusk with lit windows, a river with boats and a lit-up Ferris wheel
29. city-market: a busy square with market stalls, striped umbrellas, a fountain, pigeons and a clock tower
30. city-lighthouse: a red-and-white lighthouse on rocks, crashing waves, a cottage and wildflowers
31. city-rome: the Colosseum with a busy street, a red scooter, umbrella pine trees and a fountain
32. city-liberty: the Statue of Liberty on its island, ferries on the water and the city skyline behind

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/picture-rush/

Save each image as <id>.png, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/picture-rush/food-fruit-market.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folder above.
* Look at every image as it is made. Regenerate it if it contains any text, letters or numbers, if it has a border or frame, if a big plain area (sky, wall, water, snow) covers more than a fifth of it, if it is mirror-symmetric, if it has a repeating pattern, or if the scene is missing what is listed.
* Verify that all 32 files exist and are valid square images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Batch 3: Vehicles & transport and Home & toys

```
Use the image generation capability to generate 32 separate images for the "Picture Rush" puzzle game on the Playmona gaming platform: one picture for each of the 32 scenes listed below.

PURPOSE

Each picture is cut into a grid of square tiles (from 3 x 3 up to 6 x 6) and scrambled. Players swap tiles until the picture is whole again. So every part of the picture must be different from every other part: a player looking at one small tile should be able to tell where it belongs.

STYLE (the same for every picture, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp edges, warm daylight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and joyful. Any people are friendly, simply drawn and shown from a distance or at their activity; no close-up faces.
3. Square, 1:1, at least 1024 x 1024, with the scene running right to the edges (full bleed).

COMPOSITION (important: it becomes a puzzle)

1. Detail and colour in EVERY part of the frame, corners and edges included. Spread the main things in the scene across the whole square, not all in the middle.
2. No large plain areas: plain sky, blank walls, still water, snow, fog or empty floor may cover at most a fifth of the picture, and should carry clouds, birds, ripples or texture.
3. No repeating patterns that make tiles look alike: no brick walls, tiled floors, wallpaper, checked cloths, rows of identical windows or identical animals in a line.
4. Not mirror-symmetric: show the scene a little from one side, so the left and right halves differ.
5. Varied colours across the picture: each area should have its own main colour.
6. No text, letters, numbers, signs with writing, logos, watermarks, signatures, borders, frames or UI.

PICTURES (id: what the picture shows)

1. vehicles-steam-train: a steam train crossing a stone viaduct over a green valley, puffing smoke, a river below
2. vehicles-balloons: many patterned hot air balloons over hills and a river at sunrise
3. vehicles-fire-engine: a red fire engine with its ladder up, firefighters, a cat in a tree and houses
4. vehicles-tractor: a green tractor pulling a trailer of hay through golden fields, a farmhouse and a red barn
5. vehicles-sailing: sailing boats with coloured sails racing across a blue bay, a lighthouse and seagulls
6. vehicles-rocket: a rocket lifting off with fire and smoke, a launch tower, palm trees and people watching
7. vehicles-helicopter: an orange rescue helicopter over a mountain lake, a boat, hikers waving
8. vehicles-classic-car: a shiny red classic car on a coastal road, cliffs, the sea and a picnic on the grass
9. vehicles-safari: a safari jeep with people watching elephants and giraffes, dust, acacia trees
10. vehicles-submarine: a small yellow submarine exploring a coral reef, fish and a sunken ship
11. vehicles-cable-car: red cable car cabins over green mountains with snowy tops, a village below
12. vehicles-bicycles: a family riding bicycles along a park path, a lake with ducks, flower beds
13. vehicles-cargo-ship: a cargo ship stacked with coloured containers, cranes, tugboats and seagulls
14. vehicles-airport: a big plane at the gate, luggage carts, a fuel truck and a control tower
15. vehicles-tuk-tuk: colourful tuk-tuks and bikes on a busy market street with fruit stalls
16. vehicles-bus: a red double-decker bus on a busy street with a taxi, a bike and shop fronts
17. home-toy-shelf: a shelf of toys: a teddy bear, a robot, dolls, a drum, a toy train, building blocks and a spinning top
18. home-bedroom: a cosy bedroom with a bunk bed, a rug, toys, a globe, a fish tank and a window with a tree
19. home-baking: a kitchen with a parent and child baking, flour, a mixing bowl, cookies on a tray and fruit
20. home-games-night: a family around a table with a board game, dice, cards, snacks and a lamp
21. home-garden: a backyard with a tree swing, a slide, flowers, a cat and a washing line
22. home-treehouse: a wooden treehouse with a rope ladder and a flag, children playing, a dog in the garden
23. home-blocks: a little city built from colourful toy blocks with toy cars and figures on a rug
24. home-train-set: a wooden toy train on a track through tunnels, a toy station and little trees
25. home-crafts: paints, brushes, crayons, paper flowers, glitter, scissors and a half-painted picture
26. home-music: a guitar, a keyboard, drums, a trumpet, a xylophone and a music stand
27. home-bath: a bath full of bubbles, rubber ducks, a toy boat, folded towels and a plant
28. home-birthday: a party table with a cake and candles, balloons, presents and party hats
29. home-camping: a tent in the backyard at dusk, a small campfire, marshmallows, fireflies and a lantern
30. home-christmas: a decorated tree, presents, stockings, a fireplace and a cat in a box
31. home-reading: a window seat with cushions, a pile of books, a teddy bear, a cup of cocoa and a plant
32. home-playground: a playground with a climbing frame, slides, swings, a sandpit, children and trees

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/picture-rush/

Save each image as <id>.png, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/picture-rush/vehicles-steam-train.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folder above.
* Look at every image as it is made. Regenerate it if it contains any text, letters or numbers, if it has a border or frame, if a big plain area (sky, wall, water, snow) covers more than a fifth of it, if it is mirror-symmetric, if it has a repeating pattern, or if the scene is missing what is listed.
* Verify that all 32 files exist and are valid square images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Picture Rush" puzzle game on the Playmona gaming platform.

THE GAME

A bright picture is cut into square tiles and scrambled. Players swap two tiles at a time, racing the clock, and each tile that lands in its right place locks in with a green glow until the whole picture is back.

LOOK

* Premium glossy key art, like a top mobile puzzle title: crisp, colourful, playful, with soft highlights and gentle depth. Not a photo.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quick Tap's green button, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes on yellow-to-coral). So: no boxes, no bowls, no rings, no pads, no people or hands, no yellow-to-coral gradient.
* Background: a fresh gradient from lime (#C8F169) at the top to aqua (#43D4C8) at the bottom, with a few soft sparkles.
* Scene: a large square puzzle board, tilted slightly towards the viewer, showing a cheerful storybook scene (a hot air balloon over green hills, a river and a red-roofed village) cut into a 4 x 4 grid of thick glossy tiles with small gaps. Most tiles are in place, several with a soft green glow at their edges. Two tiles are lifted out of the board and swapping places in mid-air, with curved motion trails crossing between them. One or two tiles near a corner are still visibly in the wrong place (their picture does not line up).

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the board and the two swapping tiles inside the middle 45 percent of the height. The top and bottom quarters should be mostly gradient with a few sparkles.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/picture-rush/

Save it as:

assets/playmona_assets/picture-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if the board is not a 4 x 4 grid, if no tiles are swapping, or if the board is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## Redo (for images rejected after review)

Replace the list with the ids Claude names after the review, and add what was wrong with each.

```
Use the image generation capability to regenerate these pictures for the "Picture Rush" puzzle game on the Playmona gaming platform, replacing the existing files.

PURPOSE

Each picture is cut into a grid of square tiles (from 3 x 3 up to 6 x 6) and scrambled. Players swap tiles until the picture is whole again. So every part of the picture must be different from every other part: a player looking at one small tile should be able to tell where it belongs.

STYLE (the same for every picture, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp edges, warm daylight and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and joyful. Any people are friendly, simply drawn and shown from a distance or at their activity; no close-up faces.
3. Square, 1:1, at least 1024 x 1024, with the scene running right to the edges (full bleed).

COMPOSITION (important: it becomes a puzzle)

1. Detail and colour in EVERY part of the frame, corners and edges included. Spread the main things in the scene across the whole square, not all in the middle.
2. No large plain areas: plain sky, blank walls, still water, snow, fog or empty floor may cover at most a fifth of the picture, and should carry clouds, birds, ripples or texture.
3. No repeating patterns that make tiles look alike: no brick walls, tiled floors, wallpaper, checked cloths, rows of identical windows or identical animals in a line.
4. Not mirror-symmetric: show the scene a little from one side, so the left and right halves differ.
5. Varied colours across the picture: each area should have its own main colour.
6. No text, letters, numbers, signs with writing, logos, watermarks, signatures, borders, frames or UI.

PICTURES TO REDO (id: what the picture shows; what was wrong)

1. <id>: <what the picture shows, copied from the batch>; <what was wrong>

FILE ORGANISATION

Overwrite assets/playmona_assets/picture-rush/<id>.png for each id above.

WORKFLOW

* Generate each image with its own generation request. Never make a collage or grid.
* Check each one against the list and the rules above, and regenerate until it passes.
* Verify the files exist and are valid square images, and list them.
```
