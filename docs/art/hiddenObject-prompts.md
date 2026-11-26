# Hidden Object: Codex prompt pack

Pictures for **Hidden Object**. Each scene is a pair: the **empty** picture (a
busy scene) and the **hidden** picture (the same picture with 12 objects tucked
into it). Players only ever see the hidden picture, with a list of objects to
find. The test scene (the Cluttered Attic) and the cover are done and live;
**Batch 2** below adds eleven more scenes, twelve in all.

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

## Batch 2: eleven more scenes

Paste this one prompt into Codex. It makes 33 files (an empty picture, a
hidden picture and an objects list for each scene). If Codex stops part way,
say "carry on with the next scene" until all eleven are done.

```
Use the image generation capability to make 11 matching pairs of pictures for the "Hidden Object" game on the Playmona gaming platform. For each of the 11 scenes below: the EMPTY picture, the HIDDEN picture (the empty picture with exactly 12 objects hidden in it), and a text file listing the objects.

THE GAME

Players see the hidden picture and a list of object names ("carrot", "bell" ...). They search the busy scene and tap each object on the list. The objects must be findable by a sharp-eyed child, but not jump out at first glance: tucked among the clutter, partly behind things, and coloured to sit naturally in the scene. A pair made this way is already in the game: assets/playmona_assets/hidden-object/attic-empty.png and attic-hidden.png. Look at both first and match their look, level of detail and the size of the hidden objects.

STYLE OF EVERY EMPTY PICTURE (the same for every scene, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp, clean edges, warm light and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly and never scary. People, if any, are small, at a distance or seen from the side, busy with what they are doing; no close-up faces.
3. Square, 1:1, 1024 x 1024 or larger, the scene running right to the edges (full bleed).
4. Packed with separate, clearly drawn objects everywhere, so there is plenty to search. No large plain areas: sky, water, walls or floor may cover at most a fifth of the picture and must carry detail.
5. No text, letters, numbers, signs or labels with writing, book titles, clock faces, logos, watermarks, signatures, borders, frames around the picture, or UI.
6. Keep roughly to the layout given for each scene.
7. None of that scene's 12 hidden objects may appear anywhere in its empty picture, and nothing that looks like them (no other bell in a scene that hides a bell).

HOW TO MAKE EACH PAIR (do all four steps for one scene before starting the next)

1. Generate the empty picture. Look at it. Regenerate it if it has any text or numbers, a border, a big plain area, any of the 12 objects, or is missing most of what is listed.
2. Make the hidden picture with the image EDITING capability, using the empty picture as the input image. Do NOT generate it from scratch. It must be identical to the empty picture in every way (framing, size, colours, lighting, every object and every line) EXCEPT that the 12 listed objects are added.
3. Look at the hidden picture next to the empty one. Redo the edit if any object is missing or hard to recognise, if anything else changed, or if the picture was cropped, resized or shifted.
4. Write the objects file: the 12 objects as they actually ended up, one per line, in the order listed, each with where it is and what it looks like (for example "carrot: top left, lying on the second bookshelf between two red books; orange with green leaves").

Rules for the hidden objects:
* Each object is clearly that object when you look at it (a sharp, recognisable shape), but it is tucked in: resting on a shelf among other things, half behind a box, lying in a basket, hanging from a hook. At least two thirds of each object stays visible.
* Colour each one to suit the spot it sits in, so it blends a little, but never so much that it disappears.
* Size: each object is between one twentieth and one twelfth of the picture's width across. Not tiny specks, not big centrepieces.
* Spacing: keep at least one object's width of space between any two hidden objects. Never put one hidden object in front of, behind, inside or leaning on another. None touches the edge of the picture.
* Nothing else changes. The game finds each object by comparing the two pictures pixel by pixel, so anything else the edit redraws looks like an extra object. In the first pair, the edit slightly redrew some leaves in a window and an open wardrobe door; that must not happen. No shifted shadows, no redrawn leaves, no moved, recoloured, added or removed things apart from the 12 additions.
* If one object is impossible to place where listed, put it somewhere else in the same area and write down what you did.
* If the image tool cannot edit an existing image and can only make new ones, stop and say so instead of making any hidden picture from scratch.

SCENES (id: the empty picture, then the 12 objects to hide)

1. wizard-library: a magical library in a castle tower, cosy and friendly.
   Empty picture: top left, tall bookshelves of plain-spined books with a rolling ladder and an owl on a perch; top centre, a tall arched window of coloured glass in patterns (no figures) with floating candles in front of it; top right, a balcony with more shelves, a brass telescope and a hanging model of the planets; middle left, a reading armchair with a patchwork blanket and a pile of books; middle, a big wooden desk with open books (pages show only squiggles), potion bottles in many colours, a quill and inkpot and a crystal ball; middle right, a cauldron bubbling green over a small fire and shelves of jars; bottom left, a sleeping cat on a cushion and a basket of rolled scrolls; bottom right, a chest of glowing stones, a broomstick and a rug with stars; bottom centre, stacks of books and a footstool.
   Hide: 1 top left: a carrot, lying along a bookshelf among the books. 2 top left: a small bell, hanging from the ladder. 3 top centre: a lemon, on the window ledge between candles. 4 top right: a tennis racket, leaning on the balcony shelves. 5 top right: a toy car, on top of a shelf. 6 middle left: a frog, sitting on the armchair's arm. 7 middle: a pair of glasses, lying on an open book. 8 middle: an ice cream cone, standing among the potion bottles. 9 middle right: a sock, hanging from a jar shelf. 10 bottom left: a toothbrush, poking out of the scroll basket. 11 bottom centre: a hammer, on top of a book stack. 12 bottom right: a paintbrush, lying on the rug beside the chest.

2. pirate-ship: the deck of a friendly pirate ship moored at a sunny tropical island.
   Empty picture: top left, sails, rigging and rope ladders with a striped flag (no skull, no writing); top centre, a crow's nest on the mast and seagulls; top right, a palm-covered island with a small wooden hut and a waterfall; middle left, barrels, a coiled rope and a cannon with a stack of cannonballs; middle, the wooden deck with a ship's wheel, a treasure map pinned to a table (pictures only), a spyglass and a parrot on a rail; middle right, a lifeboat hanging on the side and nets full of coconuts; bottom left, crates of oranges and a bucket and mop; bottom centre, an open treasure chest of gold coins and pearls; bottom right, the blue sea with a rowing boat, a dolphin and floating barrels.
   Hide: 1 top left: a teddy bear, sitting in the rigging. 2 top left: a paper aeroplane, caught in the ropes. 3 top centre: a trumpet, hanging off the crow's nest. 4 top right: a guitar, leaning against the hut. 5 top right: a butterfly, on a palm leaf. 6 middle left: a cupcake, on top of a barrel. 7 middle: a pencil, lying on the map table. 8 middle: a spoon, hanging from the ship's wheel. 9 middle right: a light bulb, in the coconut net. 10 bottom left: a slipper, beside the bucket. 11 bottom centre: a snail, on the edge of the treasure chest. 12 bottom right: a mushroom, on a floating barrel.

3. greenhouse: a sunny greenhouse joined to a garden shed, crowded with plants.
   Empty picture: top left, hanging baskets of trailing flowers and a glass roof with a climbing vine; top centre, shelves of seed trays and small pots of seedlings; top right, the shed wall with garden tools on hooks (rake, shears, trowel), a coil of hose and a straw hat; middle left, tall tomato plants on canes and a watering can; middle, a potting bench with soil, empty pots, seed packets with pictures only, gloves and a trowel; middle right, cacti and succulents in clay pots and a bird bath; bottom left, sacks of compost and a wheelbarrow of flower pots; bottom centre, rows of lettuces and cabbages in a bed; bottom right, a robin on a fork handle, a stack of terracotta pots and a sleeping hedgehog.
   Hide: 1 top left: a pair of sunglasses, in a hanging basket. 2 top left: a paper boat, on a roof beam. 3 top centre: a crayon, among the seedling pots. 4 top right: a bow tie, hanging on a tool hook. 5 top right: a whistle, hanging from the hose. 6 middle left: a pear, hanging among the tomatoes. 7 middle: a kettle, on the potting bench. 8 middle: a comb, lying in the soil on the bench. 9 middle right: a toy dinosaur, among the cacti. 10 bottom left: a doughnut, on top of a compost sack. 11 bottom centre: a lollipop, stuck in the lettuce bed. 12 bottom right: a football, beside the pot stack.

4. inventor-workshop: a cheerful inventor's workshop full of gadgets.
   Empty picture: top left, a pegboard of tools (spanners, saws, screwdrivers) and hanging cables; top centre, a big round window and a model flying machine with propellers hanging from the ceiling; top right, shelves of jars of screws, springs and cogs, and a stack of blueprints with drawings only; middle left, a half-built friendly robot on a stand; middle, a long workbench with a vice, a desk lamp, gears, a magnifying lamp and a tray of springs; middle right, a big machine with brass pipes, dials without numbers, levers and a steaming kettle-like boiler; bottom left, crates of parts and a toolbox; bottom centre, a rolling stool and coiled wires; bottom right, a bicycle being rebuilt and a box of light bulbs.
   Hide: 1 top left: a feather, tucked behind the tools. 2 top left: a pair of cherries, hanging from a cable. 3 top centre: a kite, tangled in the flying machine. 4 top right: a strawberry, in a jar of cogs. 5 top right: a ballet shoe, on top of the blueprints. 6 middle left: a pineapple, on the robot's shoulder. 7 middle: a sandwich, on the workbench beside the vice. 8 middle: a small cactus in a pot, among the gears. 9 middle right: a flip-flop, hanging on a lever. 10 bottom left: a hedgehog, peeking out of a crate. 11 bottom centre: a toothbrush, on the stool. 12 bottom right: a slice of cake, on the bicycle saddle.

5. bakery: a busy old-fashioned bakery on a morning.
   Empty picture: top left, wooden shelves of loaves, baguettes and rolls; top centre, a striped awning seen through the shop window and hanging copper pans; top right, a tall glass cake stand with layer cakes and a chalkboard with drawings of cakes only (no writing); middle left, a baker (small, from the side) sliding bread into a brick oven; middle, a glass counter of pastries, croissants, tarts and biscuits, with paper bags and a cake box; middle right, jars of jam and honey, and a basket of eggs; bottom left, sacks of flour and a rolling pin on a table dusted with flour; bottom centre, a mixing bowl and whisk on a stool; bottom right, a cat curled in a bread basket and a little table with a teapot.
   Hide: 1 top left: a toy train, on a bread shelf. 2 top left: a glove, between two loaves. 3 top centre: a paper kite, hanging from a copper pan. 4 top right: a torch (flashlight), beside the cake stand. 5 top right: a toy sailboat, on top of a cake. 6 middle left: a snail, on the oven bricks. 7 middle: a hairbrush, among the pastries. 8 middle: a key ring with two keys, on the cake box. 9 middle right: a toy frog, in the egg basket. 10 bottom left: a sock, on a flour sack. 11 bottom centre: a toy bucket, beside the stool. 12 bottom right: a pair of headphones, on the little table.

6. moon-base: a friendly moon base with small astronauts at work.
   Empty picture: top left, a starry sky with planet Earth and a passing comet; top centre, a tall rocket on a launch pad; top right, a satellite dish, solar panels and a small flag with plain stripes; middle left, a glass dome with plants growing inside; middle, astronauts (small, from the side) driving a moon buggy, moon rocks and craters; middle right, a control room window with screens showing only shapes and coloured lights; bottom left, stacked supply crates with plain lids and air tanks; bottom centre, footprints in grey dust and a robot rover; bottom right, a landing pad with a small spaceship and coiled cables.
   Hide: 1 top left: a broom, floating among the stars. 2 top left: an apple, near the comet. 3 top centre: a scarf, wrapped round the launch tower. 4 top right: a fishing rod, leaning on the satellite dish. 5 top right: a cowboy hat, on a solar panel. 6 middle left: a sunflower, inside the dome. 7 middle: a hot dog, on a moon rock. 8 middle: a rubber boot, beside the buggy. 9 middle right: a birdcage, on the window sill. 10 bottom left: a watering can, on top of a crate. 11 bottom centre: a rolling pin, beside the rover. 12 bottom right: a bucket, under the spaceship.

7. castle-kitchen: a castle kitchen getting ready for a feast.
   Empty picture: top left, strings of onions, garlic and herbs hanging from beams, and copper pots; top centre, a huge stone fireplace with a roasting spit and a cauldron; top right, a high window with a stone sill and shelves of jugs and plates; middle left, a cook (small, from the side) kneading dough; middle, a long wooden table with pies, a roast, bowls of fruit, cheeses, loaves and jugs; middle right, a dresser with tankards and plates and a barrel tap; bottom left, sacks of grain and baskets of vegetables; bottom centre, a dog gnawing a bone and straw on the stone floor; bottom right, a stack of firewood and a water pail.
   Hide: 1 top left: a pair of headphones, hanging among the onions. 2 top left: a toy aeroplane, on a beam. 3 top centre: a camera, on the fireplace mantel. 4 top right: a toy dinosaur, on the window sill. 5 top right: a skateboard, on the top shelf. 6 middle left: a lollipop, in the dough bowl. 7 middle: a toy robot, among the fruit bowls. 8 middle: a pair of sunglasses, on a pie. 9 middle right: a bicycle helmet, on the dresser. 10 bottom left: a flip-flop, in a vegetable basket. 11 bottom centre: a tennis ball, in the straw. 12 bottom right: an umbrella, leaning on the firewood.

8. fairy-forest: an enchanted woodland glade on a sunny day.
   Empty picture: top left, tall trees with a tree-house door and round window in a trunk, and hanging lanterns; top centre, sunbeams through the leaves and butterflies; top right, a waterfall over mossy rocks and a rainbow; middle left, toadstool houses with tiny doors and windows; middle, a stream with stepping stones, a little wooden bridge, ducks and lily pads; middle right, a squirrel, a deer and rabbits by a hollow log; bottom left, ferns, flowers and a snail on a stone; bottom centre, a tiny picnic of acorn cups and berries on a leaf; bottom right, a fox asleep under a bush and a pile of autumn leaves.
   Hide: 1 top left: a teacup, on a branch. 2 top left: a pencil, beside the tree-house door. 3 top centre: a trumpet, hanging from a branch. 4 top right: a sock, drying on a rock. 5 top right: a spoon, by the waterfall. 6 middle left: a toy car, beside a toadstool house. 7 middle: a light bulb, on a lily pad. 8 middle: a pair of glasses, on the bridge rail. 9 middle right: a toothbrush, in the hollow log. 10 bottom left: a key, among the ferns. 11 bottom centre: a small bell, beside the picnic. 12 bottom right: a slipper, in the leaf pile.

9. fishing-harbour: a busy little fishing harbour on a sunny morning.
   Empty picture: top left, colourful cottages up a hill with washing lines; top centre, a lighthouse and seagulls; top right, the sea with sailing boats and a distant island; middle left, a stone quay with stacked lobster pots and coiled ropes; middle, fishing boats moored at the quay with nets, buoys and fishermen (small, from the side); middle right, a fish stall with crates of fish on ice and a weighing scale without numbers; bottom left, barrels, oars and an anchor; bottom centre, a cat eyeing a crate of fish; bottom right, rock pools with crabs and a starfish, and a beached rowing boat.
   Hide: 1 top left: a teddy bear, pegged on a washing line. 2 top left: a paintbrush, on a cottage window sill. 3 top centre: a kite, near the lighthouse. 4 top right: a football, floating near a sailing boat. 5 top right: a cupcake, on a boat's deck. 6 middle left: a pineapple, in a lobster pot. 7 middle: a trumpet, in a fishing net. 8 middle: a bowling pin, among the buoys. 9 middle right: a ballet shoe, beside the scale. 10 bottom left: a guitar, leaning on a barrel. 11 bottom centre: a party hat, on a crate. 12 bottom right: an ice cream cone, on a rock.

10. jungle-temple: old stone temple ruins in a bright jungle.
   Empty picture: top left, giant leaves, hanging vines and a parrot; top centre, the top of a stepped stone temple with carved patterns (no faces, no writing); top right, a waterfall and misty cliffs with orchids; middle left, monkeys on vines and a tree trunk with bracket fungi; middle, temple steps with stone animal statues (a jaguar, an elephant), moss and fallen stones; middle right, a toucan, a sloth on a branch and big flowers; bottom left, a river bank with a canoe and stepping stones; bottom centre, an explorer's camp (seen small): a tent, a backpack and a lantern; bottom right, a pool with frogs, lily pads and a turtle.
   Hide: 1 top left: a teapot, among the leaves. 2 top left: a wooden spoon, hanging from a vine. 3 top centre: a crown, on top of the temple. 4 top right: an umbrella, open on a cliff ledge. 5 top right: a book (plain cover, no writing), beside the orchids. 6 middle left: a toy rocket, on the tree trunk. 7 middle: a bow tie, on the elephant statue. 8 middle: a sock, on a fallen stone. 9 middle right: a rubber duck, on the sloth's branch. 10 bottom left: a roller skate, in the canoe. 11 bottom centre: a pair of scissors, on the backpack. 12 bottom right: a red ball, among the lily pads.

11. kids-bedroom: a cheerful, messy child's bedroom.
   Empty picture: top left, shelves of toys (teddies, a toy castle, building blocks) and a string of fairy lights; top centre, a window with a star-pattern curtain and a hanging mobile of planets; top right, bunk beds with patterned duvets and pillows; middle left, a toy chest overflowing with toys; middle, a play rug with a wooden train set, blocks, a doll's tea party and puzzle pieces; middle right, a desk with crayons, paper drawings (pictures only), a globe and a lamp; bottom left, a beanbag, picture books with plain covers and a skipping rope; bottom centre, a toy garage with little cars; bottom right, a toy kitchen with tiny pots and a dressing-up box with hats and capes.
   Hide: 1 top left: a carrot, on a toy shelf. 2 top left: a garden trowel, beside the toy castle. 3 top centre: a goldfish, hanging from the planet mobile. 4 top right: a banana, on the top bunk. 5 top right: a corn cob, on a pillow. 6 middle left: a lemon, in the toy chest. 7 middle: a mushroom, at the doll's tea party. 8 middle: a toothbrush, among the blocks. 9 middle right: a pineapple, next to the globe. 10 bottom left: a hammer, on the beanbag. 11 bottom centre: a sea shell, in the toy garage. 12 bottom right: a watering can, in the dressing-up box.

FILE ORGANISATION

Save every file in this directory (create it if needed):

assets/playmona_assets/hidden-object/

For each scene, using its id from the list above:

assets/playmona_assets/hidden-object/<id>-empty.png
assets/playmona_assets/hidden-object/<id>-hidden.png
assets/playmona_assets/hidden-object/<id>-objects.txt

For example: wizard-library-empty.png, wizard-library-hidden.png, wizard-library-objects.txt. Do not touch the existing attic files or cover.png.

WORKFLOW

* Work through the 11 scenes in order, finishing each pair (empty, hidden, objects file) before the next.
* For each pair, the two PNGs must be exactly the same width and height.
* If the image tool cannot do all 11 in one go, use more requests and carry on until all 33 files exist.
* At the end, list every file you made and confirm each pair's two images are valid and the same size.
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
