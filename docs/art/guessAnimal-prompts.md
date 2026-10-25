# Guess the Animal: Codex prompt pack

Pictures for **Guess the Animal**. There are 64 animals, each with a full
wildlife photo and a close-up, plus one cover.

How to use it:

1. Paste **Batch 1** into Codex, opened in the `playmona` folder, and let it
   finish. Then do Batches 2, 3 and 4. Each batch makes 32 images (16 full
   photos and 16 close-ups). The batches are separate so Codex never has to
   juggle 128 images at once.
2. Paste the **Cover** prompt.
3. Tell Claude the files are ready. Claude checks that every file exists, crops
   and compresses them for the game, and makes a contact sheet so you can
   reject any bad ones. A short **Redo** prompt for just those is at the end.

Raw files land in `assets/playmona_assets/guess-animal/`. Git ignores them
because they are about 2.5 MB each. Only the compressed copies ship.

---

## Batch 1: big cats, bears, apes, savanna

```
Use the image generation capability to generate 32 separate images for the "Guess the Animal" game on the Playmona gaming platform: a full wildlife photo AND a close-up for each of the 16 animals listed below.

PURPOSE

Players see one picture and pick the animal's name from four choices. On hard mode they see only the close-up. The pictures must look like real, world-class wildlife photography.

STYLE: FULL PHOTO (files in photos/)

1. Award-winning wildlife photograph, photorealistic. Not an illustration, painting, 3D render or cartoon.
2. Natural daylight, telephoto lens, shallow depth of field, rich but true-to-life colour.
3. The animal is in its own natural habitat, as described for each animal below. Keep the habitats varied so the set does not look alike.
4. The animal is unmistakable: the whole animal, or its head and shoulders, sharp and in focus, centred, filling about 50 to 70 percent of the frame, with breathing room on every side so it can be cropped to a square.
5. Exactly one species in the picture (a mother with young of the same species is fine).
6. No text, letters, numbers, watermarks, signatures, logos, borders, frames, people, or man-made objects (except farm settings where stated).
7. Square image, at least 1024 x 1024.

STYLE: CLOSE-UP (files in closeups/)

1. Same photographic realism and lighting as the full photo.
2. An extreme close-up of the ONE distinctive detail described for each animal, filling the whole frame.
3. The whole animal must NOT be visible. Its outline, full face and body must stay out of frame, except where the detail itself is part of the face.
4. An attentive player should still be able to work out the animal from texture, pattern and colour. Hard but fair, never an abstract blur.
5. No text, watermarks or frames. Square image, at least 1024 x 1024.

ANIMALS (id: full photo / close-up)

1. lion: an adult male lion with a full golden mane resting on a rock in the Serengeti grass at golden hour / close-up of thick golden-brown mane hair framing one amber eye
2. tiger: a Bengal tiger walking through a misty green Indian forest / close-up of bold orange-and-black striped fur beside one amber eye and white whisker patch
3. leopard: a leopard lying along a thick acacia branch, tail hanging down, in African evening light / close-up of golden fur covered in black rosette spots
4. cheetah: a cheetah standing alert on a termite mound on open dry savanna / close-up of the black "tear line" running from the inner eye down past the nose, on a spotted golden face
5. snow-leopard: a snow leopard on a snowy Himalayan rock ledge, long thick tail curled / close-up of pale grey-white fur with smoky black rosettes and a few snowflakes
6. brown-bear: a brown bear standing in a rushing river in Alaska, salmon leaping nearby / close-up of shaggy brown fur and a large curved claw on a wet rock
7. polar-bear: a polar bear walking across Arctic sea ice under a pale blue sky / close-up of a black nose and creamy white fur dusted with frost
8. giant-panda: a giant panda sitting in a bamboo forest eating a bamboo stalk / close-up of a black eye patch on white fur
9. gorilla: a silverback gorilla sitting in dense green Rwandan rainforest / close-up of a wrinkled, leathery dark hand with thick black hair on the back
10. chimpanzee: a chimpanzee sitting on a forest floor in Uganda, looking thoughtful / close-up of an expressive wrinkled face around one brown eye and a pale lip
11. orangutan: an orangutan hanging from vines in a Borneo rainforest canopy / close-up of long shaggy reddish-orange hair
12. ring-tailed-lemur: a ring-tailed lemur sitting on a rock in a dry Madagascar forest, tail curled up behind / close-up of the bushy tail's black-and-white rings
13. elephant: an African elephant walking across a dusty plain with Mount Kilimanjaro hazy in the background / close-up of deeply wrinkled grey skin around a small eye with long lashes
14. giraffe: a giraffe browsing the top of an acacia tree on the savanna / close-up of the brown patchwork coat pattern on its long neck
15. zebra: a plains zebra standing in green grass on the Masai Mara / close-up of crisp black-and-white stripes
16. hippopotamus: a hippopotamus with its mouth wide open in a muddy African river / close-up of wet pinkish-grey skin, small ear and eye just above the waterline

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/guess-animal/photos/
assets/playmona_assets/guess-animal/closeups/

Save each image as <id>.png in both folders, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/guess-animal/photos/lion.png
assets/playmona_assets/guess-animal/closeups/lion.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folders above.
* Look at every image as it is made. Regenerate it if the animal is wrong, has the wrong number of legs, eyes or other features, contains any text, or if a close-up shows the whole animal.
* Verify that all 32 files exist and are valid images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Batch 2: savanna, farm, wild mammals

```
Use the image generation capability to generate 32 separate images for the "Guess the Animal" game on the Playmona gaming platform: a full wildlife photo AND a close-up for each of the 16 animals listed below.

PURPOSE

Players see one picture and pick the animal's name from four choices. On hard mode they see only the close-up. The pictures must look like real, world-class wildlife photography.

STYLE: FULL PHOTO (files in photos/)

1. Award-winning wildlife photograph, photorealistic. Not an illustration, painting, 3D render or cartoon.
2. Natural daylight, telephoto lens, shallow depth of field, rich but true-to-life colour.
3. The animal is in its own natural habitat, as described for each animal below. Keep the habitats varied so the set does not look alike.
4. The animal is unmistakable: the whole animal, or its head and shoulders, sharp and in focus, centred, filling about 50 to 70 percent of the frame, with breathing room on every side so it can be cropped to a square.
5. Exactly one species in the picture (a mother with young of the same species is fine).
6. No text, letters, numbers, watermarks, signatures, logos, borders, frames, people, or man-made objects (except farm settings where stated).
7. Square image, at least 1024 x 1024.

STYLE: CLOSE-UP (files in closeups/)

1. Same photographic realism and lighting as the full photo.
2. An extreme close-up of the ONE distinctive detail described for each animal, filling the whole frame.
3. The whole animal must NOT be visible. Its outline, full face and body must stay out of frame, except where the detail itself is part of the face.
4. An attentive player should still be able to work out the animal from texture, pattern and colour. Hard but fair, never an abstract blur.
5. No text, watermarks or frames. Square image, at least 1024 x 1024.

ANIMALS (id: full photo / close-up)

1. rhinoceros: a white rhinoceros grazing on a grassy South African plain / close-up of the large front horn and thick, cracked grey skin
2. meerkat: a meerkat standing upright on its hind legs on red Kalahari sand, keeping watch / close-up of the dark eye patch and pointed tan snout
3. horse: a chestnut horse galloping across a green meadow, mane flying (a wooden fence far in the background is fine) / close-up of a flowing mane over a glossy chestnut neck
4. cow: a black-and-white dairy cow standing in a lush green pasture with rolling hills / close-up of a wet pink nose and black-and-white hair on the muzzle
5. pig: a pink pig standing in straw on a sunny farm / close-up of a round pink snout with two nostrils
6. sheep: a fluffy white sheep in a green hillside field in Wales / close-up of thick, curly cream wool
7. goat: a white-and-brown goat standing on a rocky outcrop / close-up of a horizontal rectangular pupil in a golden eye
8. camel: a dromedary camel with one hump walking over golden Sahara sand dunes / close-up of long eyelashes and a heavy-lidded eye, with sand-coloured fur
9. wolf: a grey wolf standing in a snowy pine forest / close-up of thick grey-and-cream fur around a pale yellow eye
10. fox: a red fox sitting in a frosty autumn meadow / close-up of a bushy rust-red tail with a white tip
11. deer: a red deer stag with large antlers in misty Scottish moorland / close-up of a velvety branching antler tip
12. raccoon: a raccoon peeking from a hollow tree trunk in a North American forest / close-up of the black "mask" across the eyes on grey fur
13. squirrel: a red squirrel sitting on a mossy branch holding a nut / close-up of tufted ear tips and reddish fur
14. hedgehog: a hedgehog walking through fallen autumn leaves / close-up of sharp brown-and-cream spines
15. sloth: a three-toed sloth hanging upside down from a branch in a Costa Rican rainforest / close-up of long curved claws wrapped around a mossy branch
16. otter: a sea otter floating on its back in calm kelp-filled water, paws on its chest / close-up of dense, wet brown fur and long white whiskers

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/guess-animal/photos/
assets/playmona_assets/guess-animal/closeups/

Save each image as <id>.png in both folders, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/guess-animal/photos/rhinoceros.png
assets/playmona_assets/guess-animal/closeups/rhinoceros.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folders above.
* Look at every image as it is made. Regenerate it if the animal is wrong, has the wrong number of legs, eyes or other features, contains any text, or if a close-up shows the whole animal.
* Verify that all 32 files exist and are valid images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Batch 3: pets, Australian animals, birds, reptiles

```
Use the image generation capability to generate 32 separate images for the "Guess the Animal" game on the Playmona gaming platform: a full wildlife photo AND a close-up for each of the 16 animals listed below.

PURPOSE

Players see one picture and pick the animal's name from four choices. On hard mode they see only the close-up. The pictures must look like real, world-class wildlife photography.

STYLE: FULL PHOTO (files in photos/)

1. Award-winning wildlife photograph, photorealistic. Not an illustration, painting, 3D render or cartoon.
2. Natural daylight, telephoto lens, shallow depth of field, rich but true-to-life colour.
3. The animal is in its own natural habitat, as described for each animal below. Keep the habitats varied so the set does not look alike.
4. The animal is unmistakable: the whole animal, or its head and shoulders, sharp and in focus, centred, filling about 50 to 70 percent of the frame, with breathing room on every side so it can be cropped to a square.
5. Exactly one species in the picture (a mother with young of the same species is fine).
6. No text, letters, numbers, watermarks, signatures, logos, borders, frames, people, or man-made objects (except home or garden settings where stated).
7. Square image, at least 1024 x 1024.

STYLE: CLOSE-UP (files in closeups/)

1. Same photographic realism and lighting as the full photo.
2. An extreme close-up of the ONE distinctive detail described for each animal, filling the whole frame.
3. The whole animal must NOT be visible. Its outline, full face and body must stay out of frame, except where the detail itself is part of the face.
4. An attentive player should still be able to work out the animal from texture, pattern and colour. Hard but fair, never an abstract blur.
5. No text, watermarks or frames. Square image, at least 1024 x 1024.

ANIMALS (id: full photo / close-up)

1. dog: a happy golden retriever running across a sunny garden lawn, ears flapping / close-up of a wet black nose and soft golden fur
2. cat: a tabby cat sitting on a sunlit windowsill, looking at the camera / close-up of a green eye with a narrow vertical pupil and striped tabby fur
3. rabbit: a brown wild rabbit sitting in a spring meadow with daisies / close-up of a long, upright ear glowing pink in the sunlight
4. kangaroo: a red kangaroo standing upright in the Australian outback, a joey peeking from the pouch / close-up of a powerful long hind foot on red dust
5. koala: a koala hugging a eucalyptus trunk, holding leaves / close-up of a large, leathery black nose and fluffy grey fur
6. platypus: a platypus swimming in a clear Australian creek / close-up of the flat, duck-like bill and wet brown fur
7. eagle: a bald eagle perched on a dead branch above a lake in Alaska / close-up of the hooked yellow beak and white head feathers
8. owl: a barn owl perched on a mossy post in a misty field at dawn / close-up of the heart-shaped white facial disc around a dark eye
9. parrot: a scarlet macaw perched on a rainforest branch / close-up of bright red, yellow and blue wing feathers
10. penguin: an emperor penguin standing on Antarctic ice / close-up of the yellow-orange neck patch on sleek black-and-white feathers
11. flamingo: a pink flamingo standing on one leg in a shallow salt lake / close-up of a curved pink-and-black beak
12. peacock: a peacock with its tail fully fanned on a garden lawn / close-up of iridescent blue-green "eye" spots on the tail feathers
13. toucan: a toco toucan on a branch in a Brazilian forest / close-up of the huge orange beak with a black tip
14. ostrich: an ostrich running across a dry African plain / close-up of a big brown eye with long lashes and a fuzzy grey head
15. hummingbird: a ruby-throated hummingbird hovering at a red tubular flower, wings blurred / close-up of shimmering emerald-green and ruby feathers and a needle-thin beak
16. crocodile: a Nile crocodile resting on a muddy riverbank with its jaws slightly open / close-up of bumpy, armoured scales and a golden eye with a slit pupil

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/guess-animal/photos/
assets/playmona_assets/guess-animal/closeups/

Save each image as <id>.png in both folders, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/guess-animal/photos/dog.png
assets/playmona_assets/guess-animal/closeups/dog.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folders above.
* Look at every image as it is made. Regenerate it if the animal is wrong, has the wrong number of legs, eyes or other features, contains any text, or if a close-up shows the whole animal.
* Verify that all 32 files exist and are valid images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Batch 4: reptiles, amphibians, ocean, insects

```
Use the image generation capability to generate 32 separate images for the "Guess the Animal" game on the Playmona gaming platform: a full wildlife photo AND a close-up for each of the 16 animals listed below.

PURPOSE

Players see one picture and pick the animal's name from four choices. On hard mode they see only the close-up. The pictures must look like real, world-class wildlife photography.

STYLE: FULL PHOTO (files in photos/)

1. Award-winning wildlife photograph, photorealistic. Not an illustration, painting, 3D render or cartoon.
2. Natural light, telephoto or underwater lens as suits the animal, shallow depth of field, rich but true-to-life colour.
3. The animal is in its own natural habitat, as described for each animal below. Keep the habitats varied so the set does not look alike.
4. The animal is unmistakable: the whole animal, or its head and shoulders, sharp and in focus, centred, filling about 50 to 70 percent of the frame, with breathing room on every side so it can be cropped to a square.
5. Exactly one species in the picture (a mother with young of the same species is fine).
6. No text, letters, numbers, watermarks, signatures, logos, borders, frames, people, divers or man-made objects.
7. Square image, at least 1024 x 1024.

STYLE: CLOSE-UP (files in closeups/)

1. Same photographic realism and lighting as the full photo.
2. An extreme close-up or macro of the ONE distinctive detail described for each animal, filling the whole frame.
3. The whole animal must NOT be visible. Its outline, full face and body must stay out of frame, except where the detail itself is part of the face.
4. An attentive player should still be able to work out the animal from texture, pattern and colour. Hard but fair, never an abstract blur.
5. No text, watermarks or frames. Square image, at least 1024 x 1024.

ANIMALS (id: full photo / close-up)

1. snake: a green tree python coiled over a rainforest branch / close-up of glossy green scales with a few white flecks
2. turtle: a green sea turtle gliding over a coral reef in clear blue water / close-up of the patterned plates on its shell
3. chameleon: a panther chameleon gripping a twig, tail curled, in bright rainforest colours / close-up of the cone-shaped, swivelling eye covered in tiny bumpy scales
4. frog: a red-eyed tree frog clinging to a green leaf in a rainforest at dusk / close-up of a bright red eye and orange sticky toe pads
5. shark: a great white shark swimming through deep blue open ocean, sunlight rays above / close-up of rows of sharp triangular teeth
6. dolphin: a bottlenose dolphin leaping out of a sparkling blue sea / close-up of the smooth grey blowhole on its back with water droplets
7. whale: a humpback whale breaching out of the ocean, long pectoral fins spread / close-up of the black-and-white tail fluke edge dripping water
8. octopus: a common octopus crawling over rocks on the sea floor, arms spread / close-up of rows of round suckers on one curling arm
9. seal: a grey harbour seal resting on a rocky shore / close-up of large dark eyes and long whiskers on a spotted grey face
10. jellyfish: a glowing moon jellyfish drifting in dark blue water / close-up of translucent, softly glowing frilly edges
11. clownfish: a clownfish among the swaying tentacles of a sea anemone / close-up of bright orange scales with a white stripe edged in black
12. seahorse: a yellow seahorse holding on to seagrass with its curled tail / close-up of the bony ridged snout and small eye
13. butterfly: a monarch butterfly resting on a purple flower in a sunny meadow / close-up of orange wing scales with black veins and white dots
14. bee: a honeybee covered in pollen on a yellow sunflower / close-up of fuzzy yellow-and-black striped hair
15. ant: a red ant carrying a leaf piece along a twig on a forest floor / close-up macro of shiny segmented head and pincer-like jaws
16. ladybug: a red ladybug crawling on a dewy green leaf / close-up macro of a glossy red shell with round black spots

FILE ORGANISATION

Create these directories if they do not exist:

assets/playmona_assets/guess-animal/photos/
assets/playmona_assets/guess-animal/closeups/

Save each image as <id>.png in both folders, using the ids above exactly (lowercase, with hyphens), for example:

assets/playmona_assets/guess-animal/photos/snake.png
assets/playmona_assets/guess-animal/closeups/snake.png

WORKFLOW

* Generate each image with its own generation request. Never make a collage, grid, sprite sheet or contact sheet.
* Save the actual generated image files into the folders above.
* Look at every image as it is made. Regenerate it if the animal is wrong, has the wrong number of legs, eyes or other features, contains any text, or if a close-up shows the whole animal.
* Verify that all 32 files exist and are valid images.
* Write a short summary listing each file.
* Do not substitute placeholder graphics, SVG drawings, stock photos or programmatically drawn images.

If the image generation tool cannot generate all 32 images in one operation, use multiple requests and continue until all 32 images exist.
```

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Guess the Animal" game on the Playmona gaming platform.

LOOK

* A bright, joyful, golden-hour wildlife photograph. Photorealistic, like a magazine cover from a top nature photographer.
* It must feel completely different from the platform's other covers, which are dark, painterly living-room scenes lit by a warm lamp. No indoor scene, no lamp, no painting style, no dark vignette.
* Scene: on the African savanna at sunrise, a curious meerkat stands upright in sharp focus, looking just past the camera. Softly blurred behind it are a zebra, a giraffe and an elephant, with warm golden backlight and a soft blue sky.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* The game card shows only the MIDDLE of the picture (a wide band across the centre), so the meerkat's head and the other animals must sit in the middle 50 percent of the height. The top and bottom quarters should be just sky and grass.
* No text, letters, logos, watermarks, frames or people.

FILE ORGANISATION

Save it as:

assets/playmona_assets/guess-animal/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any animal is malformed or there is any text.
* Verify the file exists and is a valid image.
```

---

## Redo (for images rejected after review)

Claude fills in the list below after review.

```
Use the image generation capability to regenerate these images for the "Guess the Animal" game on the Playmona gaming platform, replacing the existing files. Follow exactly the same STYLE rules as before: a photorealistic, award-winning wildlife photograph, natural light, one species, the animal centred with room to crop to a square, no text or watermarks, square and at least 1024 x 1024. Close-ups are an extreme close-up of one distinctive detail, and the whole animal is not visible.

<list: path - what was wrong - what to show instead>

Generate each image with its own request, look at it before saving, overwrite the old file, and verify each file exists.
```
