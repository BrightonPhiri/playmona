# Guess It!: Codex prompt pack

Two prompts for **Guess It!**:

1. **Cover**: one image.
2. **Photo sheets**: 29 images, each holding six photos. Claude cuts each sheet into six game pictures, so you never make them one at a time.

Paste each prompt into Codex, opened in the `playmona` folder. When the files are saved, tell Claude. Claude then runs:

- `python tools/cut-art-sheets.py guessIt` for the sheets (it writes a contact sheet to check),
- `python tools/process-game-art.py guessIt` and `node tools/gen-asset-manifest.js` for the cover.

Raw files land in `assets/playmona_assets/guess-it/`, which git ignores.

Animals already have their wildlife photos, and Flags use the real flag files, so neither needs new art.

If something needs another go, use a **Redo** prompt at the end.

---

## 1. Cover

```
Use the image generation capability to generate ONE cover image for the "Guess It!" game on the Playmona gaming platform.

THE GAME

A bright picture-guessing game for families. You choose what to guess: animals, flags, food, famous landmarks, everyday objects, sports, vehicles, jobs or musical instruments. A photo appears and you name it before the time runs out. It should feel premium, exciting and full of variety.

LOOK

* Premium glossy 3D key art, like a top family mobile game: soft toy-like shapes, crisp highlights, gentle reflections, warm light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's giant question mark on a game-show podium, Guess the Country's globe with flags, Number Rush's neon rings, Ball Swap's glass bowls, Bible Quiz's open book, Blink & Remember's gift boxes). So: no question mark, no globe, no podium, no stage spotlights, no answer buttons, no book.
* Scene: in the centre, a big glossy rounded camera viewfinder frame (four chunky golden corner brackets with a soft glow inside), as if a photo is about to be snapped. Bursting out of the frame in a lively fan, like instant photo cards flying out, are glossy 3D toy-like objects, one from each topic: a friendly lion's head, a slice of pizza, a little Eiffel-Tower-style iron tower, a hot air balloon, a violin, a football, a chef's white hat, an alarm clock, and one small made-up waving flag (simple two-colour halves, NOT a real country's flag).
* Small white camera-flash sparkles and soft light streaks around the frame, to say "snap, guess it!".
* Background: warm coral (#FB7185) at the top blending into rich violet (#7C3AED) at the bottom, with a sunny golden glow (#FDE68A) behind the frame and a few soft bokeh circles.
* Family friendly: no people, no faces apart from the toy lion, no hands.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the viewfinder frame and the flying objects inside the middle 40 percent of the height, centred left to right. The top and bottom quarters should be mostly background glow and bokeh.
* No text, letters, numbers, logos, watermarks, frames around the image or UI elements anywhere, including on the clock face (plain tick marks only) and on the flag.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/guess-it/

Save it as:

assets/playmona_assets/guess-it/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letters or numerals (check the clock closely), if the flag looks like a real country's flag, if any person appears, or if the frame is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## 2. Photo sheets (29 images)

```
Use the image generation capability to generate 29 images for the "Guess It!" picture-guessing game on the Playmona gaming platform. Each image is a SHEET OF SIX PHOTOS that will be cut into six separate game pictures, so the layout rules matter as much as the pictures.

REQUIREMENTS FOR EVERY SHEET

Layout (strict, the sheet is cut by a script):
* Landscape image, exactly 1536 x 1024.
* A grid of 3 columns x 2 rows = six SQUARE photo tiles of equal size, in reading order: top left, top middle, top right, bottom left, bottom middle, bottom right.
* Pure white (#FFFFFF) gutters of about 32 px between the tiles and around the outside edge. Nothing crosses a gutter: no object, shadow or background may spill from one tile into the next.
* Each tile is a full-bleed photo (its own background fills the whole square). No white or plain backgrounds inside the tiles, so the tiles stand out from the gutters.
* The subject sits in the middle of its tile, fully visible, filling about 60 to 75 percent of it, with a little space all around (the game zooms in on the centre for harder levels).

Look:
* Realistic, high-quality photographs, like a premium stock photo: sharp focus, true colours, bright natural daylight or soft studio light, shallow depth of field so the background is softly blurred.
* All six tiles in a sheet share the same bright, clean lighting so they look like one set.
* Each tile shows exactly ONE thing to guess and nothing that gives away a different answer.
* No text, letters, numbers, logos, brand names, number plates, shirt numbers, signs or watermarks anywhere, not even tiny ones. Packaging and screens are blank.
* People (jobs and sports): friendly adults of many different backgrounds, including Black African, Asian, white and Latino people, men and women in roughly equal numbers. Faces natural and kind. Uniforms without badges, names or writing.
* Landmarks: the real, recognisable landmark in daytime, shot from its most famous angle, no people in the foreground.
* Food: appetising, freshly served, on a plate, board or bowl that fits the dish.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/guess-it/sheets/

Save each sheet with the exact file name given below (lower case, .png).

THE SHEETS

1. food-1.png
   * top left: two golden flaky croissants on a wooden board
   * top middle: a sesame bagel cut open with cream cheese, on a plate
   * top right: a large soft pretzel with coarse salt on baking paper
   * bottom left: a glazed ring doughnut with pink icing and sprinkles
   * bottom middle: a tall stack of fluffy pancakes with syrup dripping and butter on top
   * bottom right: two square golden waffles with strawberries on a white plate

2. food-2.png
   * top left: a whole margherita pizza with melted mozzarella and basil, seen from above
   * top middle: a bowl of spaghetti with red tomato meat sauce and grated cheese
   * top right: a square slice of lasagne showing its layers, on a plate
   * bottom left: a bowl of ramen with noodles, a halved soft egg, spring onion and broth
   * bottom middle: a plate of pad thai noodles with prawns, peanuts and a lime wedge
   * bottom right: a bamboo steamer full of pleated steamed dumplings

3. food-3.png
   * top left: a neat row of sushi pieces on a slate board with chopsticks
   * top middle: a wide shallow pan of paella with yellow rice, prawns and mussels
   * top right: a plate of orange-red jollof rice with fried plantain and chicken
   * bottom left: a pot of biryani with long-grain spiced rice, herbs and fried onions
   * bottom middle: a bowl of egg fried rice with peas, carrots and spring onion
   * bottom right: a white smooth mound of nshima maize porridge with a bowl of green vegetable relish beside it

4. food-4.png
   * top left: a tall beef burger with cheese, lettuce and tomato in a sesame bun
   * top middle: a hot dog in a soft bun with mustard and ketchup lines
   * top right: three soft tacos with meat, onion, coriander and lime
   * bottom left: a paper cone of golden chips, French fries
   * bottom middle: a burrito cut in half showing rice, beans and meat inside
   * bottom right: three golden triangle samosas with a small bowl of green chutney

5. food-5.png
   * top left: two scoops of ice cream in a waffle cone
   * top middle: a cupcake with swirled pink frosting in a paper case
   * top right: a slice of cheesecake with a biscuit base and berry topping
   * bottom left: a neat row of colourful French macarons
   * bottom middle: an apple pie with a golden lattice crust, one slice cut out
   * bottom right: a slice of layered chocolate cake with glossy chocolate icing

6. landmarks-1.png
   * top left: the Eiffel Tower in Paris against a blue sky
   * top middle: the Big Ben clock tower in London beside the Houses of Parliament
   * top right: the white Leaning Tower of Pisa on green grass
   * bottom left: the very tall Burj Khalifa skyscraper rising above Dubai
   * bottom middle: the red-orange Golden Gate Bridge over the bay
   * bottom right: Tower Bridge in London with its two stone towers over the River Thames

7. landmarks-2.png
   * top left: the Colosseum in Rome, its arches in warm sunlight
   * top middle: the Pyramids of Giza in the desert
   * top right: the ring of standing stones at Stonehenge on a grassy plain
   * bottom left: the Parthenon temple with its columns on the Acropolis hill
   * bottom middle: the Treasury of Petra carved into a pink rock cliff
   * bottom right: the ruins of Machu Picchu on a green mountain ridge

8. landmarks-3.png
   * top left: Victoria Falls, a wide curtain of water with spray and a rainbow
   * top middle: the horseshoe curve of Niagara Falls with mist rising
   * top right: snow-capped Mount Kilimanjaro above the savanna with acacia trees
   * bottom left: flat-topped Table Mountain behind Cape Town
   * bottom middle: snow-capped Mount Fuji with cherry blossoms in front
   * bottom right: the Great Wall of China winding over green hills

9. landmarks-4.png
   * top left: the green Statue of Liberty holding up her torch
   * top middle: the Christ the Redeemer statue with open arms above Rio
   * top right: the white marble Taj Mahal reflected in its long pool
   * bottom left: the towers of Angkor Wat temple at sunrise over a pond
   * bottom middle: the tall spires of the Sagrada Família church
   * bottom right: the Sydney Opera House with its white sail roofs by the harbour

10. objects-1.png
   * top left: a shiny electric kettle
   * top middle: a two-slot toaster with two slices of toast popping up
   * top right: a black frying pan with a long handle
   * bottom left: a metal balloon whisk
   * bottom middle: a white china teapot
   * bottom right: a kitchen blender jug with fruit inside

11. objects-2.png
   * top left: a pair of scissors with blue handles
   * top middle: a black office stapler
   * top right: a pocket calculator with grey buttons
   * bottom left: a small metal pencil sharpener with pencil shavings
   * bottom middle: a classroom globe on a stand
   * bottom right: a red school backpack

12. objects-3.png
   * top left: a claw hammer with a wooden handle
   * top middle: a screwdriver with a yellow handle
   * top right: a shiny metal spanner wrench
   * bottom left: a yellow tape measure with the tape pulled out
   * bottom middle: a brass padlock, closed
   * bottom right: a black torch flashlight, switched on

13. objects-4.png
   * top left: an open red umbrella
   * top middle: a classic twin-bell alarm clock
   * top right: a clear glowing light bulb
   * bottom left: a lit white candle on a holder
   * bottom middle: a bunch of metal house keys on a ring
   * bottom right: a black TV remote control

14. objects-5.png
   * top left: a pair of over-ear headphones
   * top middle: a classic camera with a lens
   * top right: a pair of black sunglasses
   * bottom left: a wristwatch with a leather strap
   * bottom middle: a toothbrush with toothpaste on the bristles
   * bottom right: a pink hairdryer

15. sports-1.png
   * top left: a football player kicking the ball on a grass pitch
   * top middle: a basketball player jumping to dunk the ball into the hoop
   * top right: two volleyball players jumping at the net to block a ball
   * bottom left: a rugby player running with the oval ball under the arm
   * bottom middle: a netball player shooting at a tall hoop without a backboard
   * bottom right: a field hockey player hitting the ball with a curved stick on blue turf

16. sports-2.png
   * top left: a tennis player hitting a yellow ball with a racket on a court
   * top middle: a badminton player smashing a white shuttlecock
   * top right: a table tennis player hitting a small ball over a table net
   * bottom left: a cricket batter in white swinging a flat bat in front of the wicket
   * bottom middle: a baseball batter in a helmet swinging a round bat
   * bottom right: a golfer swinging a club on a green golf course

17. sports-3.png
   * top left: a swimmer doing front crawl in a pool lane
   * top middle: a surfer riding a big blue wave
   * top right: a rowing crew in a long narrow boat on a lake
   * bottom left: a boxer with red gloves punching in a ring
   * bottom middle: racing cyclists on road bikes with helmets
   * bottom right: a gymnast doing a leap on a balance beam

18. vehicles-1.png
   * top left: a red family car on a road
   * top middle: a red double-decker bus
   * top right: a big lorry truck with a long trailer on a highway
   * bottom left: a motorbike motorcycle parked on a street
   * bottom middle: a yellow taxi cab with a taxi sign on the roof (no writing)
   * bottom right: a green tractor in a farm field

19. vehicles-2.png
   * top left: a red fire engine with ladders on top
   * top middle: a white and yellow ambulance with blue lights (no readable writing)
   * top right: a police car with blue lights on the roof (no readable writing)
   * bottom left: a yellow digger excavator scooping earth
   * bottom middle: a yellow forklift lifting a wooden pallet in a warehouse
   * bottom right: a cement mixer truck with its striped drum

20. vehicles-3.png
   * top left: a white passenger aeroplane flying in a blue sky
   * top middle: a helicopter flying
   * top right: a colourful hot air balloon over green hills
   * bottom left: a space rocket lifting off with flames and smoke
   * bottom middle: a sailing boat with white sails on the sea
   * bottom right: a huge cargo ship stacked with colourful containers

21. vehicles-4.png
   * top left: a red canoe with a paddler on a calm river
   * top middle: a dark submarine on the sea surface
   * top right: a black steam train puffing smoke
   * bottom left: a white high-speed bullet train with a long pointed nose
   * bottom middle: a modern tram on rails in a city street
   * bottom right: a cable car gondola hanging from wires above mountains

22. jobs-1.png
   * top left: a doctor in a white coat with a stethoscope
   * top middle: a nurse in scrubs taking a patient’s blood pressure
   * top right: a dentist with a mask and mirror tool examining a smiling patient’s teeth
   * bottom left: a vet checking a dog on an examination table
   * bottom middle: a pharmacist in a white coat holding a box of medicine in front of shelves
   * bottom right: a paramedic in a green uniform with a medical bag beside an ambulance

23. jobs-2.png
   * top left: a chef in a white hat and jacket cooking with a flaming pan
   * top middle: a baker pulling fresh loaves out of an oven
   * top right: a waiter in a black apron carrying plates in a restaurant
   * bottom left: a farmer in a hat holding a basket of vegetables in a field
   * bottom middle: a fisherman pulling a net into a small boat
   * bottom right: a butcher in an apron cutting meat at a counter

24. jobs-3.png
   * top left: a builder in a hard hat laying bricks
   * top middle: an electrician fixing wires in a wall switch box
   * top right: a plumber fixing pipes under a sink with a wrench
   * bottom left: a mechanic working on a car engine with the bonnet open
   * bottom middle: a carpenter sawing a plank of wood in a workshop
   * bottom right: a painter in overalls painting a wall with a roller

25. jobs-4.png
   * top left: an airline pilot in uniform in the cockpit
   * top middle: a firefighter in a helmet spraying water from a hose
   * top right: a police officer in uniform and cap (no readable badges)
   * bottom left: an astronaut in a white spacesuit floating in space
   * bottom middle: a teacher pointing at a chalkboard in front of a class
   * bottom right: a hairdresser cutting a customer’s hair with scissors and comb

26. instruments-1.png
   * top left: a violin and its bow
   * top middle: a cello standing upright with its bow
   * top right: an acoustic guitar
   * bottom left: a small four-string ukulele
   * bottom middle: a tall golden concert harp
   * bottom right: a banjo with a round white drum body

27. instruments-2.png
   * top left: a shiny brass trumpet
   * top middle: a golden saxophone
   * top right: a brass trombone with its slide
   * bottom left: a silver flute lying on dark cloth
   * bottom middle: a black clarinet with silver keys
   * bottom right: a coiled brass French horn

28. instruments-3.png
   * top left: a drum kit with cymbals
   * top middle: a carved wooden djembe drum with a goatskin top
   * top right: a xylophone with wooden bars and two mallets
   * bottom left: a tambourine with metal jingles
   * bottom middle: a pair of colourful maracas
   * bottom right: an mbira thumb piano with metal keys on a wooden board

29. instruments-4.png
   * top left: a black grand piano with its lid open
   * top middle: a red accordion with its bellows open
   * top right: a silver harmonica
   * bottom left: a set of tartan bagpipes
   * bottom middle: a wooden recorder
   * bottom right: a sitar with a long neck and round gourd body

WORKFLOW

* Make each sheet with a single request (one image holding all six tiles, not six images pasted together afterwards).
* After each sheet, look at it closely. Regenerate it if: there are not exactly six square tiles in a 3 x 2 grid with white gutters; anything crosses a gutter; any tile shows the wrong thing or the things are in the wrong cells; there is any text, letters, numbers or logos; or a tile is a cartoon or drawing instead of a photo.
* Verify every file exists and is a valid image. At the end, list all 29 file names and say which ones you regenerated.
```

---

## Redo (one sheet)

```
Regenerate assets/playmona_assets/guess-it/sheets/<SHEET FILE>.png using the same Guess It! photo sheet rules (1536 x 1024, 3 x 2 square photo tiles with pure white gutters, realistic photos, no text or logos anywhere) and the same six things in the same cells, and fix this: <WHAT TO FIX>. Overwrite the same file.
```

## Redo (cover)

```
Regenerate assets/playmona_assets/guess-it/cover.png using the same Guess It! cover brief, and fix this: <WHAT TO FIX>.
Keep the glowing viewfinder frame with the flying topic objects in the middle 40 percent of the height, no text or numerals anywhere, no real national flags and no people. Overwrite the same file.
```
