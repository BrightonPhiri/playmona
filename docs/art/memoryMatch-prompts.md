# Memory Match: Codex prompt pack

Card pictures for **Memory Match**: 192 cute 3D-style pictures in 8 decks of 24 (animals, sea life,
food, fruit and veg, characters, toys and things, sport and music, vehicles), plus one cover.

Pictures are made as **sheets of 12** (a 4 x 3 grid) so Codex makes 16 images instead of 192. Claude cuts
each sheet into 12 cards, removes the background, and saves each card as a 256 px WebP of about 10 KB.

How to use it:

1. Paste **Batch 1** into Codex, opened in the `playmona` folder, and let it finish. Then Batches 2, 3 and 4.
   Each batch makes 4 sheets.
2. Paste the **Cover** prompt.
3. Tell Claude the files are ready. Claude runs `python tools/cut-art-sheets.py memoryMatch`, which cuts the
   sheets, checks every sheet really has 12 objects, and makes a contact sheet so you can reject any bad
   pictures. A short **Redo** prompt for just those is at the end.

Raw files land in `assets/playmona_assets/memory-match/`, which git ignores. Only the small WebP cards ship. The game already works
before the pictures exist: each card falls back to an emoji until its picture is added.

---

## Batch 1: animals and sea life

```
Use the image generation capability to generate 4 picture sheets for the "Memory Match" game on the Playmona gaming platform. Each sheet shows 12 different objects in a 4 x 3 grid.

PURPOSE

Players flip cards to find matching pairs. Each object becomes the face of one card, so every object must be instantly recognisable, charming and clearly different from the others.

STYLE (the same for every sheet, so all 192 pictures look like one set)

1. Cute, polished 3D cartoon illustration, like premium mobile-game icons or glossy sticker art: soft rounded chunky shapes, bright cheerful saturated colours, smooth slightly glossy materials, soft studio lighting from the top left, gentle highlights and soft shading.
2. Friendly and kid-safe, appealing to all ages. Animals and characters have big expressive eyes and happy faces. People and characters show a natural mix of skin tones.
3. Original designs only. No famous or copyrighted characters, mascots or brands (no Disney, Pixar, Marvel, Pokemon, Nintendo, Sanrio and so on).
4. Each object is shown whole (nothing cut off), from the front or a three-quarter view, as a single clear icon that reads instantly even when shown 70 pixels wide.
5. No text, letters, numbers, labels, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere.
6. No scenery, ground, floor, table, background shapes, shadows cast on the background, reflections or sparkles around the object. Only the object itself.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) background with no gradient, texture, vignette or shadow.
6. Because the background is removed by computer, objects must not have pure white areas on their outer edge: white things (wool, ghosts, sails, ambulances, a soccer ball) get light grey or cream shading and a slightly darker outline.
7. Every object on a sheet has its own main colour and shape, so two different objects are never confused for a pair.

SHEET animals-1 (Wild animals)

1. lion: a lion cub with a big fluffy orange mane
2. elephant: a baby grey elephant with its trunk raised
3. giraffe: a young yellow giraffe with brown patches, sitting so its neck fits the cell
4. zebra: a chubby zebra foal with bold black-and-white stripes
5. monkey: a brown monkey with a peach-coloured face, waving
6. panda: a round black-and-white panda sitting and hugging a bamboo stalk
7. koala: a grey koala with big fluffy ears
8. tiger: an orange tiger cub with black stripes
9. hippo: a lilac-grey hippo with a wide smile
10. kangaroo: a tan kangaroo with a joey peeking from the pouch
11. fox: a red fox with a bushy white-tipped tail
12. bear: a brown bear cub sitting down

SHEET animals-2 (Farm and pets)

1. cat: an orange tabby kitten
2. dog: a golden puppy with floppy ears
3. rabbit: a light grey bunny with long pink-lined ears
4. pig: a pink piglet with a curly tail
5. cow: a black-and-white cow with a pink nose and a little bell
6. horse: a chestnut pony with a dark mane
7. sheep: a fluffy cream sheep with a dark face and legs
8. chicken: a brown hen with a red comb
9. duck: a bright yellow duckling
10. frog: a bright green frog sitting up
11. owl: a brown owl with big round eyes
12. penguin: a black-and-white penguin with an orange beak and feet

SHEET sea-1 (Under the sea)

1. octopus: a purple octopus with curling arms
2. whale: a blue whale (no water spout)
3. dolphin: a grey-blue dolphin leaping in an arc
4. shark: a friendly grey shark with a goofy grin
5. clownfish: an orange clownfish with white stripes edged in black
6. pufferfish: a round, puffed-up yellow pufferfish with small spikes
7. seahorse: a golden-orange seahorse with a curled tail
8. jellyfish: a pink see-through jellyfish with wavy tentacles
9. crab: a red crab with raised claws
10. turtle: a green sea turtle swimming
11. starfish: a coral-orange starfish
12. blue-tang: a royal-blue tang fish with a yellow tail

SHEET sea-2 (Ocean friends)

1. seal: a grey seal pup lying on its tummy
2. squid: a pink-red squid
3. shrimp: a curled pink-orange shrimp
4. oyster: an open oyster shell holding a shiny pearl
5. seashell: a spiral conch shell, cream with pink inside
6. coral: a branching pink-red coral
7. stingray: a blue-grey stingray seen from above
8. narwhal: a light blue narwhal with a long spiral tusk
9. orca: a black-and-white orca
10. sea-otter: a brown sea otter floating on its back holding a shell
11. anglerfish: a cute dark teal anglerfish with a glowing yellow lure
12. sea-urchin: a round purple sea urchin with spines

FILE ORGANISATION

Create this directory if it does not exist:

assets/playmona_assets/memory-match/sheets/

Save each sheet as a PNG with exactly these names:

assets/playmona_assets/memory-match/sheets/animals-1.png
assets/playmona_assets/memory-match/sheets/animals-2.png
assets/playmona_assets/memory-match/sheets/sea-1.png
assets/playmona_assets/memory-match/sheets/sea-2.png

WORKFLOW

* Generate each sheet with its own generation request (one request = one sheet of 12).
* Save the actual generated image files at the paths above.
* Look at every sheet as it is made. Regenerate it if any object is missing, doubled, merged with a neighbour, cut off by the edge, in the wrong order, contains text, or if the background is not transparent or plain white.
* Verify that all 4 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Batch 2: food, fruit and vegetables

```
Use the image generation capability to generate 4 picture sheets for the "Memory Match" game on the Playmona gaming platform. Each sheet shows 12 different objects in a 4 x 3 grid.

PURPOSE

Players flip cards to find matching pairs. Each object becomes the face of one card, so every object must be instantly recognisable, charming and clearly different from the others.

STYLE (the same for every sheet, so all 192 pictures look like one set)

1. Cute, polished 3D cartoon illustration, like premium mobile-game icons or glossy sticker art: soft rounded chunky shapes, bright cheerful saturated colours, smooth slightly glossy materials, soft studio lighting from the top left, gentle highlights and soft shading.
2. Friendly and kid-safe, appealing to all ages. Animals and characters have big expressive eyes and happy faces. People and characters show a natural mix of skin tones.
3. Original designs only. No famous or copyrighted characters, mascots or brands (no Disney, Pixar, Marvel, Pokemon, Nintendo, Sanrio and so on).
4. Each object is shown whole (nothing cut off), from the front or a three-quarter view, as a single clear icon that reads instantly even when shown 70 pixels wide.
5. No text, letters, numbers, labels, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere.
6. No scenery, ground, floor, table, background shapes, shadows cast on the background, reflections or sparkles around the object. Only the object itself.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) background with no gradient, texture, vignette or shadow.
6. Because the background is removed by computer, objects must not have pure white areas on their outer edge: white things (wool, ghosts, sails, ambulances, a soccer ball) get light grey or cream shading and a slightly darker outline.
7. Every object on a sheet has its own main colour and shape, so two different objects are never confused for a pair.

SHEET food-1 (Meals)

1. pizza: a slice of pepperoni pizza with stretchy cheese
2. burger: a tall cheeseburger with lettuce and tomato
3. fries: French fries in a red carton
4. hot-dog: a hot dog with a squiggle of mustard
5. taco: a crunchy taco with lettuce, tomato and cheese
6. sushi: two salmon nigiri sushi pieces on a small wooden board
7. ramen: a blue bowl of ramen noodles with an egg and chopsticks
8. spaghetti: a plate of spaghetti with meatballs
9. sandwich: a triangle sandwich showing ham, cheese and lettuce
10. pancakes: a stack of pancakes with syrup and a pat of butter
11. fried-egg: a fried egg in a small black frying pan
12. popcorn: a red-and-white striped bucket of popcorn

SHEET food-2 (Treats)

1. cupcake: a cupcake with swirly pink frosting and a cherry
2. donut: a chocolate-glazed donut with rainbow sprinkles
3. ice-cream: an ice cream cone with a mint scoop and a strawberry scoop
4. cake: a slice of strawberry layer cake
5. cookie: a chocolate chip cookie
6. lollipop: a big rainbow swirl lollipop
7. candy-cane: a red-and-white striped candy cane
8. croissant: a golden croissant
9. gummy-bear: a shiny red gummy bear
10. jelly: a wobbly green jelly (jello) on a small plate
11. cheese: a yellow wedge of cheese with holes
12. hot-cocoa: a blue mug of hot cocoa topped with marshmallows

SHEET fruit-1 (Fruit)

1. apple: a shiny red apple with a green leaf
2. banana: a yellow banana
3. strawberry: a strawberry with green leaves
4. grapes: a bunch of purple grapes
5. watermelon: a triangle slice of watermelon
6. pineapple: a pineapple with a spiky green top
7. orange: a whole orange with a leaf
8. cherries: a pair of dark red cherries on stems
9. lemon: a bright yellow lemon
10. peach: a fuzzy peach with a leaf
11. pear: a green pear
12. kiwi: a kiwi cut in half showing the green inside

SHEET fruit-2 (Vegetables and more)

1. carrot: an orange carrot with leafy top
2. broccoli: a green broccoli floret
3. corn: a corn cob with the husk peeled back
4. tomato: a red tomato
5. avocado: an avocado half with the round pit
6. eggplant: a purple eggplant (aubergine)
7. mushroom: a brown-capped mushroom
8. pepper: a yellow bell pepper
9. potato: a brown potato
10. pumpkin: an orange pumpkin
11. coconut: a coconut split open
12. mango: a red-and-yellow mango

FILE ORGANISATION

Create this directory if it does not exist:

assets/playmona_assets/memory-match/sheets/

Save each sheet as a PNG with exactly these names:

assets/playmona_assets/memory-match/sheets/food-1.png
assets/playmona_assets/memory-match/sheets/food-2.png
assets/playmona_assets/memory-match/sheets/fruit-1.png
assets/playmona_assets/memory-match/sheets/fruit-2.png

WORKFLOW

* Generate each sheet with its own generation request (one request = one sheet of 12).
* Save the actual generated image files at the paths above.
* Look at every sheet as it is made. Regenerate it if any object is missing, doubled, merged with a neighbour, cut off by the edge, in the wrong order, contains text, or if the background is not transparent or plain white.
* Verify that all 4 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Batch 3: characters, toys and things

```
Use the image generation capability to generate 4 picture sheets for the "Memory Match" game on the Playmona gaming platform. Each sheet shows 12 different objects in a 4 x 3 grid.

PURPOSE

Players flip cards to find matching pairs. Each object becomes the face of one card, so every object must be instantly recognisable, charming and clearly different from the others.

STYLE (the same for every sheet, so all 192 pictures look like one set)

1. Cute, polished 3D cartoon illustration, like premium mobile-game icons or glossy sticker art: soft rounded chunky shapes, bright cheerful saturated colours, smooth slightly glossy materials, soft studio lighting from the top left, gentle highlights and soft shading.
2. Friendly and kid-safe, appealing to all ages. Animals and characters have big expressive eyes and happy faces. People and characters show a natural mix of skin tones.
3. Original designs only. No famous or copyrighted characters, mascots or brands (no Disney, Pixar, Marvel, Pokemon, Nintendo, Sanrio and so on).
4. Each object is shown whole (nothing cut off), from the front or a three-quarter view, as a single clear icon that reads instantly even when shown 70 pixels wide.
5. No text, letters, numbers, labels, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere.
6. No scenery, ground, floor, table, background shapes, shadows cast on the background, reflections or sparkles around the object. Only the object itself.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) background with no gradient, texture, vignette or shadow.
6. Because the background is removed by computer, objects must not have pure white areas on their outer edge: white things (wool, ghosts, sails, ambulances, a soccer ball) get light grey or cream shading and a slightly darker outline.
7. Every object on a sheet has its own main colour and shape, so two different objects are never confused for a pair.

SHEET characters-1 (Heroes and helpers)

1. wizard: an old wizard with a long grey beard, purple robe and starry hat
2. knight: a knight in silver armour with a red plume and a shield
3. princess: a princess in a pink gown with a golden tiara
4. pirate: a pirate with an eye patch, tricorn hat and striped shirt
5. astronaut: an astronaut in an orange spacesuit holding the helmet
6. robot: a round blue-and-silver robot with antenna
7. alien: a green alien with three eyes, waving
8. superhero: an original superhero kid with a red cape, blue suit and a plain star badge (no letters)
9. ninja: a ninja in a dark blue outfit with a red headband
10. mermaid: a mermaid with a teal tail and long red hair
11. fairy: a fairy in a green leaf dress with shimmering wings
12. genie: a blue genie rising from a small golden lamp

SHEET characters-2 (Magical friends)

1. dragon: a green baby dragon with small wings
2. unicorn: a lavender unicorn with a rainbow mane and golden horn
3. ghost: a pale mint-blue friendly ghost
4. monster: a fuzzy orange one-eyed monster with tiny horns
5. witch: a friendly witch with a black pointy hat riding a broom
6. viking: a viking with a horned helmet and a big red beard
7. cowboy: a cowboy with a brown hat and a red neckerchief
8. chef: a chef with a tall hat holding a wooden spoon
9. king: a king with a golden crown and a red velvet cape
10. vampire: a cute vampire with a black cape with red lining
11. mummy: a cute mummy wrapped in beige bandages
12. elf: an elf in a red-and-green outfit with pointy ears

SHEET toys-1 (Toys)

1. teddy: a brown teddy bear with a red bow
2. balloon: a shiny red balloon on a string
3. yo-yo: a blue yo-yo with its string
4. kite: a rainbow diamond kite with a short ribbon tail
5. dice: a pair of red dice with white dots
6. puzzle: a green jigsaw puzzle piece
7. controller: a purple game controller
8. magic-wand: a magic wand with a sparkling gold star tip
9. nesting-doll: a red nesting doll (matryoshka)
10. pinata: a colourful donkey pinata
11. gift: a blue gift box with a yellow ribbon bow
12. blocks: a stack of three wooden toy blocks painted with simple shapes (no letters)

SHEET toys-2 (Things)

1. palette: a wooden paint palette with blobs of paint and a brush
2. crayons: a bundle of three crayons: red, blue and yellow
3. top-hat: a black magician's top hat with a red band
4. crystal-ball: a glowing purple crystal ball on a golden stand
5. magnet: a red horseshoe magnet with silver tips
6. umbrella: an open yellow umbrella
7. alarm-clock: a red alarm clock with two bells (hands only, no numbers)
8. camera: a retro teal camera
9. backpack: an orange school backpack
10. sunglasses: a pair of pink heart-shaped sunglasses
11. telescope: a brass telescope on a small tripod
12. light-bulb: a glowing yellow light bulb

FILE ORGANISATION

Create this directory if it does not exist:

assets/playmona_assets/memory-match/sheets/

Save each sheet as a PNG with exactly these names:

assets/playmona_assets/memory-match/sheets/characters-1.png
assets/playmona_assets/memory-match/sheets/characters-2.png
assets/playmona_assets/memory-match/sheets/toys-1.png
assets/playmona_assets/memory-match/sheets/toys-2.png

WORKFLOW

* Generate each sheet with its own generation request (one request = one sheet of 12).
* Save the actual generated image files at the paths above.
* Look at every sheet as it is made. Regenerate it if any object is missing, doubled, merged with a neighbour, cut off by the edge, in the wrong order, contains text, or if the background is not transparent or plain white.
* Verify that all 4 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Batch 4: sport, music and vehicles

```
Use the image generation capability to generate 4 picture sheets for the "Memory Match" game on the Playmona gaming platform. Each sheet shows 12 different objects in a 4 x 3 grid.

PURPOSE

Players flip cards to find matching pairs. Each object becomes the face of one card, so every object must be instantly recognisable, charming and clearly different from the others.

STYLE (the same for every sheet, so all 192 pictures look like one set)

1. Cute, polished 3D cartoon illustration, like premium mobile-game icons or glossy sticker art: soft rounded chunky shapes, bright cheerful saturated colours, smooth slightly glossy materials, soft studio lighting from the top left, gentle highlights and soft shading.
2. Friendly and kid-safe, appealing to all ages. Animals and characters have big expressive eyes and happy faces. People and characters show a natural mix of skin tones.
3. Original designs only. No famous or copyrighted characters, mascots or brands (no Disney, Pixar, Marvel, Pokemon, Nintendo, Sanrio and so on).
4. Each object is shown whole (nothing cut off), from the front or a three-quarter view, as a single clear icon that reads instantly even when shown 70 pixels wide.
5. No text, letters, numbers, labels, logos, watermarks, signatures, borders, frames, grid lines or captions anywhere.
6. No scenery, ground, floor, table, background shapes, shadows cast on the background, reflections or sparkles around the object. Only the object itself.

LAYOUT (important: Claude cuts each sheet into 12 separate pictures)

1. One landscape image per sheet, 1536 x 1024.
2. Exactly 12 objects in an even grid of 4 columns and 3 rows, in the numbered order: row 1 is objects 1 to 4 from left to right, row 2 is 5 to 8, row 3 is 9 to 12.
3. Each object sits in the centre of its own grid cell and fills about 70 percent of the cell.
4. Leave a clear empty gap of at least 40 pixels between neighbouring objects and between objects and the image edge. Nothing touches or overlaps.
5. Background: fully transparent if the image tool supports it. Otherwise a perfectly flat, plain pure white (#FFFFFF) background with no gradient, texture, vignette or shadow.
6. Because the background is removed by computer, objects must not have pure white areas on their outer edge: white things (wool, ghosts, sails, ambulances, a soccer ball) get light grey or cream shading and a slightly darker outline.
7. Every object on a sheet has its own main colour and shape, so two different objects are never confused for a pair.

SHEET sports-1 (Sport)

1. soccer-ball: a black-and-white soccer ball
2. basketball: an orange basketball
3. tennis: a tennis racket with a yellow-green tennis ball
4. baseball: a baseball and a wooden bat
5. rugby-ball: a brown rugby ball (American football)
6. volleyball: a yellow-and-blue volleyball
7. bowling: a bowling ball and a single bowling pin
8. ping-pong: a red table tennis paddle with a small ball
9. boxing-glove: a blue boxing glove
10. skateboard: a green skateboard
11. medal: a gold medal on a blue ribbon
12. trophy: a shiny gold trophy cup

SHEET sports-2 (Music)

1. guitar: an acoustic guitar in warm wood
2. drum: a red drum with two drumsticks
3. trumpet: a gold trumpet
4. violin: a violin with its bow
5. piano: a small black grand piano
6. saxophone: a silver saxophone
7. microphone: a retro microphone on a short stand
8. headphones: a pair of pink headphones
9. maracas: a pair of colourful maracas
10. accordion: a red accordion
11. banjo: a banjo
12. xylophone: a toy xylophone with rainbow bars

SHEET vehicles-1 (Things that go)

1. car: a red cartoon car
2. bus: a yellow school bus
3. fire-truck: a red fire truck with a ladder
4. police-car: a blue-and-white police car with lights
5. ambulance: a white-and-red ambulance with soft grey shading
6. tractor: a green tractor with big back wheels
7. train: a blue steam locomotive
8. airplane: a sky-blue airplane
9. helicopter: an orange helicopter
10. rocket: a red-and-silver rocket
11. sailboat: a sailboat with a striped red-and-yellow sail
12. bicycle: a teal bicycle

SHEET vehicles-2 (More things that go)

1. motorbike: a purple motorbike
2. scooter: a pink kick scooter
3. taxi: a yellow taxi with a checkered stripe (no text)
4. race-car: a green race car
5. ship: a cruise ship with a red funnel
6. speedboat: a speedboat
7. cable-car: a red cable car hanging from a cable
8. ufo: a silver flying saucer with a green glass dome
9. tram: an orange tram
10. van: a blue delivery van
11. canoe: a wooden canoe with a paddle
12. hot-air-balloon: a rainbow hot-air balloon with a basket

FILE ORGANISATION

Create this directory if it does not exist:

assets/playmona_assets/memory-match/sheets/

Save each sheet as a PNG with exactly these names:

assets/playmona_assets/memory-match/sheets/sports-1.png
assets/playmona_assets/memory-match/sheets/sports-2.png
assets/playmona_assets/memory-match/sheets/vehicles-1.png
assets/playmona_assets/memory-match/sheets/vehicles-2.png

WORKFLOW

* Generate each sheet with its own generation request (one request = one sheet of 12).
* Save the actual generated image files at the paths above.
* Look at every sheet as it is made. Regenerate it if any object is missing, doubled, merged with a neighbour, cut off by the edge, in the wrong order, contains text, or if the background is not transparent or plain white.
* Verify that all 4 files exist and are valid PNG images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock images or programmatically drawn images.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Memory Match" game on the Playmona gaming platform.

LOOK

* Bright, cheerful, playful 3D cartoon render in the same cute glossy style as the game's card pictures. Daylight colours: candy pink, sky blue, sunny yellow and mint.
* It must feel completely different from the platform's other covers, which are dark, painterly living-room scenes lit by a warm lamp. No indoor room, no lamp, no painting style, no dark vignette.
* Scene: a cascade of chunky rounded game cards tumbling through a soft pastel sky with little clouds. Most cards are face down, showing a simple star pattern on their backs. A few are flipping over to show cute pictures: a fox, a pizza slice, a rocket, a unicorn. In the centre, two matching cards that both show the same smiling fox glow together with a burst of soft sparkles.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* The game card shows only the MIDDLE of the picture (a wide band across the centre), so the glowing matching pair and the face-up cards must sit in the middle 50 percent of the height. The top and bottom quarters should be just sky and a few face-down cards.
* No text, letters, numbers, logos, watermarks, frames or people.

FILE ORGANISATION

Save it as:

assets/playmona_assets/memory-match/cover.png

WORKFLOW

* Generate it with a single request.
* Look at it. Regenerate if any card picture is malformed or there is any text.
* Verify the file exists and is a valid image.
```

---

## Redo (for sheets or pictures rejected after review)

Claude fills in the list below after review. A bad picture is fixed by redoing its whole sheet.

```
Use the image generation capability to regenerate these picture sheets for the "Memory Match" game on the Playmona gaming platform, replacing the existing files. Follow exactly the same STYLE and LAYOUT rules as before: cute glossy 3D cartoon icons, 12 objects in a 4 x 3 grid in the numbered order, at least 40 px of empty space between objects, a transparent or plain pure white background, no text, no white outer edges, landscape 1536 x 1024.

<list: path - which objects were wrong - what to show instead, plus the full numbered list of 12 for that sheet>

Generate each sheet with its own request, look at it before saving, overwrite the old file, and verify each file exists.
```
