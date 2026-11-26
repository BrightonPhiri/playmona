# Spot the Difference: Codex prompt pack

Pictures for **Spot the Difference**. Each puzzle is a pair: picture A (the
original) and picture B (the same picture with 10 changes). Market Day (the
test pair) and the cover are done and live. **Batch 2** makes 12 more pairs.

How to use it:

1. Paste **Batch 2** into Codex, opened in the `playmona` folder. For each
   scene it makes picture A, edits A into picture B, and writes a list of the
   10 changes. (Market Day was made the same way from the **Test pair** prompt.)
2. Tell Claude the files are ready (a part batch is fine). Claude compares A and B pixel by pixel to
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

## Batch 2: twelve more pairs

```
Use the image generation capability to make 12 matching pairs of pictures for the "Spot the Difference" game on the Playmona gaming platform. For each of the 12 scenes below: picture A, and picture B, which is picture A with exactly 10 changes, plus a text file listing the changes.

THE GAME

Players see the two pictures side by side (on phones they swipe between them) and tap each spot where the pictures differ. Each change must be easy to see once you notice it, but not jump out at first glance. A game already uses a pair made this way (assets/playmona_assets/spot-difference/market-day-a.png and market-day-b.png); look at them first and match their look, detail and size of changes.

STYLE OF PICTURE A (the same for every scene, so the set looks like one family)

1. A bright, richly detailed storybook illustration: painterly digital art with crisp, clean edges, warm light and saturated, cheerful colours. Not a photo, not 3D, not flat vector clip art, not a cartoon with thick outlines.
2. Family friendly. People are shown small, at a distance or from the side, busy with what they are doing; no close-up faces.
3. Square, 1:1, 1024 x 1024 or larger, the scene running right to the edges (full bleed).
4. Lots of separate, clearly drawn small objects everywhere, so there is plenty to search. No large plain areas: sky, water, snow, walls or floor may cover at most a fifth of the picture and must carry detail.
5. No text, letters, numbers, signs or labels with writing, clock faces, book titles, logos, watermarks, signatures, borders, frames or UI.
6. Keep roughly to the layout given for each scene, so the 10 changes land in different parts of the picture.

HOW TO MAKE EACH PAIR (do all four steps for one scene before starting the next)

1. Generate picture A. Look at it. Regenerate it if it has any text or numbers, a border, a big plain area, or is missing most of what is listed.
2. Make picture B with the image EDITING capability, using picture A as the input image. Do NOT generate picture B from scratch. Picture B must be identical to picture A in every way (framing, size, colours, lighting, every object and every line) EXCEPT for the 10 changes listed for that scene.
3. Look at picture B next to picture A. Redo the edit if any change is missing, if anything else changed, or if the picture was cropped, resized or shifted.
4. Write the changes file: the 10 changes as they actually ended up, one per line, each with where it is (for example "top left") and what changed.

Rules for the changes:
* Each change sits in its own small area. No two changes touch or overlap.
* Each change is big enough to see on a phone: at least about one twentieth of the picture's width across.
* Nothing else changes: no shifted shadows, no recoloured sky, no moved people, no new or missing objects apart from the 10 listed.
* If a listed change is impossible because picture A turned out a little different, swap in a similar change (an object added, removed or recoloured) in the same area of the picture, and write down what you did.
* If the image tool cannot edit an existing image and can only make new ones, stop and say so instead of making any picture B from scratch.

SCENES (id: picture A, then the 10 changes for picture B)

1. family-kitchen: a cosy family kitchen on baking day.
   Picture A: top left, open shelves with jars of pasta, flour and sweets and a row of teacups on hooks; top right, a window with a potted herb on the sill and a striped curtain and a round mirror on the wall; middle, a wooden table with a mixing bowl, rolling pin, eggs in a box, a tray of cupcakes and a grown-up and a child baking (seen from the side); bottom left, a cat sitting on a stool and a basket of apples on the floor; bottom right, a cooker with a red kettle, a stack of pans and a tea towel hanging from the oven handle.
   Changes: 1 top left: one jar of sweets is gone. 2 top left: one teacup turns from white to blue. 3 top right: the potted herb on the sill becomes a small cactus. 4 top right: the curtain stripes change from red to green. 5 middle: one cupcake loses its cherry on top. 6 middle: the rolling pin is gone from the table. 7 middle: two eggs in the box become one (one egg is gone). 8 bottom left: the cat is grey instead of orange. 9 bottom left: a banana is added on top of the apple basket. 10 bottom right: the red kettle is yellow.

2. beach-day: a sunny beach full of families.
   Picture A: top left, blue sea with a small sailing boat and two seagulls; top right, a lighthouse on rocks and a hot air balloon in the sky with clouds; middle, striped beach umbrellas, towels, a family building a big sandcastle with flags, a beach ball; bottom left, a picnic basket, a cool box, sandals and a red bucket and spade; bottom right, rock pools with a crab and a starfish, a surfboard stuck in the sand.
   Changes: 1 top left: the sail of the boat changes from white to red. 2 top left: one seagull is gone. 3 top right: the hot air balloon has a different colour pattern (stripes become spots). 4 top right: a small boat is added near the lighthouse rocks. 5 middle: the flag on top of the sandcastle is gone. 6 middle: the beach ball changes from red-and-white to blue-and-yellow. 7 middle: one beach umbrella changes colour. 8 bottom left: the red bucket is green. 9 bottom left: one sandal is gone. 10 bottom right: the starfish is gone from the rock pool.

3. farm-yard: a busy farm yard in the morning.
   Picture A: top left, a red barn with a weathervane shaped like a rooster on the roof; top right, green fields, a tractor, a windmill and birds in the sky; middle, a wooden fence with chickens, a goat and a pig in a muddy patch, a farmer carrying a bucket; bottom left, hay bales, a wheelbarrow of pumpkins and a sleeping dog; bottom right, a duck pond with ducks, a water pump and a basket of eggs.
   Changes: 1 top left: the rooster weathervane is gone. 2 top left: the barn door changes from white to blue. 3 top right: the tractor is green instead of red. 4 top right: one of the windmill sails is gone. 5 middle: one chicken is gone. 6 middle: the pig has a black patch added on its back. 7 middle: the farmer's bucket is gone. 8 bottom left: one pumpkin in the wheelbarrow becomes a watermelon. 9 bottom right: a small duckling is added behind the ducks. 10 bottom right: the basket of eggs is gone.

4. toy-shop: a crowded old-fashioned toy shop.
   Picture A: top left, shelves of teddy bears, dolls and wooden trains; top right, model aeroplanes and a kite hanging from the ceiling, a window with balloons outside; middle, a counter with a till (no numbers on it), a jar of lollipops, a spinning top and a shopkeeper; bottom left, a rocking horse, building blocks and a toy drum; bottom right, a dolls' house with open rooms, a box of marbles and a toy robot.
   Changes: 1 top left: one teddy bear changes from brown to pink. 2 top left: one wooden train carriage is gone. 3 top right: one model aeroplane is gone. 4 top right: one balloon outside the window changes colour. 5 middle: the jar of lollipops is empty. 6 middle: the spinning top changes from red to purple. 7 bottom left: the rocking horse's saddle changes colour. 8 bottom left: a toy duck is added beside the drum. 9 bottom right: the toy robot is gone. 10 bottom right: one window of the dolls' house now has a cat in it.

5. city-park: a lively city park playground on a summer afternoon.
   Picture A: top left, tall trees, a kite stuck in a branch and a bird's nest; top right, city buildings far off, a hot dog cart with an umbrella; middle, a slide, swings with children, a seesaw and a sandpit; bottom left, a bench with a grandparent feeding pigeons, a lamp post, a bicycle; bottom right, a duck pond with a small bridge, a fountain and a dog chasing a ball.
   Changes: 1 top left: the kite in the tree is gone. 2 top left: the bird's nest has a bird added in it. 3 top right: the hot dog cart umbrella changes from red to yellow. 4 middle: the slide changes from blue to orange. 5 middle: one swing seat is empty (the child is gone). 6 middle: a bucket is added in the sandpit. 7 bottom left: two pigeons become one. 8 bottom left: the bicycle is gone. 9 bottom right: the dog's ball is gone. 10 bottom right: the bridge railing changes from white to brown.

6. coral-reef: a colourful underwater coral reef.
   Picture A: top left, sunbeams through the water and a turtle swimming; top right, a school of small silver fish and a jellyfish; middle, bright corals of many shapes, a clownfish in an anemone, a striped angelfish, an octopus on a rock; bottom left, a sunken treasure chest with gold coins (no writing) and an old anchor; bottom right, seaweed, shells, a crab and a starfish on the sand.
   Changes: 1 top left: the turtle's shell pattern changes colour. 2 top right: the jellyfish is gone. 3 top right: one small fish turns gold. 4 middle: the clownfish is gone from the anemone. 5 middle: one coral changes from pink to blue. 6 middle: the octopus is purple instead of orange. 7 bottom left: the treasure chest lid is closed. 8 bottom left: the anchor is gone. 9 bottom right: a second starfish is added. 10 bottom right: the crab is gone.

7. snowy-village: a winter village square on a snowy day.
   Picture A: top left, snowy rooftops and chimneys with smoke, a church tower without a clock; top right, snowy hills, a sledge run with children and a fir forest; middle, a big decorated tree with baubles, a snowman with a carrot nose and scarf, people in hats and coats; bottom left, a market stall selling hot drinks with mugs and a lantern; bottom right, an ice rink with skaters, a dog in a coat and a pile of presents.
   Changes: 1 top left: the smoke from one chimney is gone. 2 top left: one window glows yellow instead of dark. 3 top right: one child's sledge changes from red to blue. 4 middle: the star on top of the tree is gone. 5 middle: the snowman's scarf changes from red to green. 6 middle: the snowman's carrot nose is gone. 7 bottom left: the lantern on the stall is gone. 8 bottom left: one mug changes colour. 9 bottom right: the dog's coat changes from blue to red. 10 bottom right: one present is added to the pile.

8. birthday-party: a garden birthday party.
   Picture A: top left, bunting and balloons tied to a tree, a bird house; top right, a bouncy castle and a sunny sky with a few clouds; middle, a long table with a big birthday cake with candles, cups, plates of sandwiches, a jug of juice and party hats, children around it; bottom left, a pile of wrapped presents and a puppy with a bow; bottom right, a paddling pool, a toy boat and a garden gnome.
   Changes: 1 top left: one balloon changes from yellow to purple. 2 top left: the bird house is gone. 3 top right: the bouncy castle's roof changes colour. 4 middle: the cake has one fewer candle. 5 middle: the jug of juice is gone. 6 middle: one party hat changes from striped to spotted. 7 middle: a cupcake is added on an empty plate. 8 bottom left: the puppy's bow changes from red to blue. 9 bottom left: one present is gone. 10 bottom right: the garden gnome's hat is green instead of red.

9. lakeside-camp: a family camping by a mountain lake.
   Picture A: top left, mountains with snowy tops and an eagle in the sky; top right, a pine forest with a deer looking out; middle, two tents (one orange, one green), a campfire with a pot, folding chairs and a family toasting marshmallows; bottom left, a canoe pulled up on the shore, paddles and a fishing rod; bottom right, the lake with a jetty, a frog on a lily pad and a lantern on a log.
   Changes: 1 top left: the eagle is gone. 2 top right: the deer is gone. 3 top right: one pine tree becomes a tree with autumn orange leaves. 4 middle: the orange tent is blue. 5 middle: the pot over the fire is gone. 6 middle: one folding chair changes colour. 7 bottom left: the canoe changes from red to yellow. 8 bottom left: the fishing rod is gone. 9 bottom right: the frog is gone from the lily pad. 10 bottom right: a duck is added on the lake near the jetty.

10. train-station: a busy old-fashioned railway station.
   Picture A: top left, a glass roof with iron arches and pigeons on a beam; top right, a steam train arriving with a puff of steam, a signal light; middle, a platform with travellers, suitcases on a trolley, a flower stall and a newspaper stand with blank papers (no writing); bottom left, a bench with a sleeping traveller, an umbrella and a hat box; bottom right, a ticket window (no writing), a cat on a suitcase and a potted palm.
   Changes: 1 top left: one pigeon is gone. 2 top right: the signal light is green instead of red. 3 top right: the steam train changes from green to blue. 4 middle: the top suitcase on the trolley is gone. 5 middle: the flowers at the flower stall change from red to yellow. 6 middle: a balloon is added in a child's hand. 7 bottom left: the umbrella is gone. 8 bottom left: the hat box changes from pink to blue. 9 bottom right: the cat is gone from the suitcase. 10 bottom right: the potted palm becomes a potted sunflower.

11. art-class: a bright children's art class.
   Picture A: top left, children's paintings pinned to a wall (shapes and animals, no writing) and a string of paper lanterns; top right, a tall window with plants and a goldfish bowl; middle, big tables with paint pots, brushes in jars, clay models, scissors and coloured paper, children painting at easels; bottom left, a shelf of paint tubes, crayon boxes (no writing) and an apron on a hook; bottom right, a sink with a dripping tap, a bucket and a stack of drying paintings.
   Changes: 1 top left: one painting on the wall changes (a sun becomes a moon). 2 top left: one paper lantern is gone. 3 top right: the goldfish is gone from the bowl. 4 top right: one plant gets a flower. 5 middle: one paint pot changes from blue to red. 6 middle: the clay model of a snail is gone. 7 middle: the scissors are gone. 8 bottom left: the apron changes from yellow to green. 9 bottom right: the bucket is gone. 10 bottom right: a paint splash is added on the floor.

12. safari-waterhole: African animals at a waterhole at golden hour.
   Picture A: top left, a big acacia tree with a leopard resting on a branch and weaver bird nests; top right, distant hills, a safari jeep and flying birds; middle, the waterhole with elephants drinking, zebras, a giraffe bending down and a hippo half in the water; bottom left, a meerkat family on a termite mound and some rocks; bottom right, reeds, a crocodile on the bank and a flock of flamingos.
   Changes: 1 top left: the leopard is gone from the branch. 2 top left: one weaver nest is gone. 3 top right: the safari jeep changes from green to white. 4 middle: a baby elephant is added next to the adults. 5 middle: one zebra is gone. 6 middle: the hippo is gone (only ripples). 7 bottom left: one meerkat is gone. 8 bottom left: a small bird is added on a rock. 9 bottom right: the crocodile is gone. 10 bottom right: one flamingo is white instead of pink.

FILE ORGANISATION

Save every file in this directory (create it if needed):

assets/playmona_assets/spot-difference/

For each scene, using its id from the list above:

assets/playmona_assets/spot-difference/<id>-a.png
assets/playmona_assets/spot-difference/<id>-b.png
assets/playmona_assets/spot-difference/<id>-changes.txt

For example: family-kitchen-a.png, family-kitchen-b.png, family-kitchen-changes.txt. Do not touch the existing market-day files or cover.png.

WORKFLOW

* Work through the 12 scenes in order, finishing each pair (A, B, changes file) before the next.
* For each pair, the A and B PNGs must be exactly the same width and height.
* If the image tool cannot do all 12 in one go, use more requests and carry on until all 36 files exist.
* At the end, list every file you made and confirm each pair's two images are valid and the same size.
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
