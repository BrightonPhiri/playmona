/* ============================================================
   PLAYMONA — guessIt.js (data)
   Guess It! photo topics. Animals live in animals.js and Flags in
   worldFlags.js; these are the other seven.
     id     file name: assets/images/games/guessIt/<topic>/<id>.webp
            (cut from the sheets in docs/art/guessIt-prompts.md by
            tools/cut-art-sheets.py guessIt)
     group  pictures that look alike, used for harder wrong answers
     aka    other names that count when spelling, and a shorter name to
            spell when the real one is long
     fact   shown after answering
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  function p(id, name, group, aka, fact) {
    var o = { id: id, name: name, group: group, fact: fact };
    if (aka) o.aka = aka.split('|');
    return o;
  }

  FF.data.guessIt = {
    topics: [
      { id: 'food', name: 'Food', icon: 'fork-knife' },
      { id: 'landmarks', name: 'Landmarks', icon: 'buildings' },
      { id: 'objects', name: 'Objects', icon: 'cube' },
      { id: 'sports', name: 'Sports', icon: 'medal' },
      { id: 'vehicles', name: 'Vehicles', icon: 'car' },
      { id: 'jobs', name: 'Jobs', icon: 'users-three' },
      { id: 'instruments', name: 'Instruments', icon: 'speaker' }
    ],
    items: {
      food: [
        p('croissant', 'Croissant', 'bakery', null, 'A croissant’s flaky layers come from butter folded into the dough again and again.'),
        p('bagel', 'Bagel', 'bakery', null, 'Bagels are boiled before they are baked, which gives them their chewy crust.'),
        p('pretzel', 'Pretzel', 'bakery', null, 'The pretzel’s twisted knot shape has been around for over a thousand years.'),
        p('doughnut', 'Doughnut', 'bakery', 'donut', 'Ring doughnuts get their hole so the middle cooks as fast as the outside.'),
        p('pancakes', 'Pancakes', 'bakery', 'pancake', 'Pancakes are among the oldest foods people cook, made for thousands of years.'),
        p('waffles', 'Waffles', 'bakery', 'waffle', 'The grid on a waffle holds pools of syrup in its little squares.'),
        p('pizza', 'Pizza', 'pasta-noodles', null, 'Pizza was first made in Naples, Italy, and is now loved all over the world.'),
        p('spaghetti', 'Spaghetti', 'pasta-noodles', 'spaghetti bolognese', 'Spaghetti means “little strings” in Italian.'),
        p('lasagne', 'Lasagne', 'pasta-noodles', 'lasagna', 'Lasagne is built from flat sheets of pasta layered with sauce and cheese.'),
        p('ramen', 'Ramen', 'pasta-noodles', null, 'Ramen is a Japanese noodle soup, and Japan has museums all about it.'),
        p('pad-thai', 'Pad Thai', 'pasta-noodles', null, 'Pad Thai is Thailand’s famous stir-fried rice noodle dish.'),
        p('dumplings', 'Dumplings', 'pasta-noodles', 'dumpling', 'Dumplings are eaten in many countries, wrapped in a thin dough.'),
        p('sushi', 'Sushi', 'rice-grains', null, 'Sushi is made with vinegared rice, often with raw fish on top.'),
        p('paella', 'Paella', 'rice-grains', null, 'Paella comes from Valencia in Spain and is cooked in a wide flat pan.'),
        p('jollof-rice', 'Jollof rice', 'rice-grains', 'jollof', 'Jollof rice is cooked in a rich tomato sauce and loved across West Africa.'),
        p('biryani', 'Biryani', 'rice-grains', null, 'Biryani is a spiced rice dish layered with meat or vegetables.'),
        p('fried-rice', 'Fried rice', 'rice-grains', null, 'Fried rice is often made with yesterday’s rice, which fries better.'),
        p('nshima', 'Nshima', 'rice-grains', 'sadza', 'Nshima is a thick maize porridge eaten with relish across southern Africa.'),
        p('burger', 'Burger', 'street-food', 'hamburger', 'Burgers are named after the city of Hamburg in Germany.'),
        p('hot-dog', 'Hot dog', 'street-food', null, 'Hot dogs became a favourite at baseball games in the United States.'),
        p('tacos', 'Tacos', 'street-food', 'taco', 'Tacos come from Mexico and are eaten folded in a corn tortilla.'),
        p('chips', 'Chips', 'street-food', 'fries', 'Chips are called fries or French fries in many countries.'),
        p('burrito', 'Burrito', 'street-food', null, 'A burrito is a big flour tortilla rolled tight around its filling.'),
        p('samosa', 'Samosa', 'street-food', null, 'Samosas are crisp triangle pastries filled with spiced potato or meat.'),
        p('ice-cream', 'Ice cream', 'sweets', null, 'It can take about 50 licks to finish a single scoop of ice cream.'),
        p('cupcake', 'Cupcake', 'sweets', null, 'Cupcakes got their name from being baked in cups.'),
        p('cheesecake', 'Cheesecake', 'sweets', null, 'Cheesecake is made with soft cheese on a biscuit base.'),
        p('macarons', 'Macarons', 'sweets', 'macaron', 'Macarons are French sandwich biscuits made with almond flour.'),
        p('apple-pie', 'Apple pie', 'sweets', null, 'Apple pie has been baked in England since the 1300s.'),
        p('chocolate-cake', 'Chocolate cake', 'sweets', null, 'The first chocolate cakes were baked in the 1700s.')
      ],
      landmarks: [
        p('eiffel-tower', 'Eiffel Tower', 'towers', null, 'Paris, France. It was built for a world fair in 1889 and was meant to be temporary.'),
        p('big-ben', 'Big Ben', 'towers', 'elizabeth tower', 'London, England. Big Ben is really the name of the great bell inside the clock tower.'),
        p('leaning-tower-of-pisa', 'Leaning Tower of Pisa', 'towers', 'Tower of Pisa', 'Pisa, Italy. It began to lean while it was still being built, over 800 years ago.'),
        p('burj-khalifa', 'Burj Khalifa', 'towers', null, 'Dubai, United Arab Emirates. It is the tallest building in the world, at 828 metres.'),
        p('golden-gate-bridge', 'Golden Gate Bridge', 'bridges', 'golden gate', 'San Francisco, United States. Its famous colour is called International Orange.'),
        p('tower-bridge', 'Tower Bridge', 'bridges', null, 'London, England. Its middle road lifts up to let tall ships through.'),
        p('colosseum', 'Colosseum', 'ancient', 'coliseum', 'Rome, Italy. About 50,000 people once watched shows in this arena.'),
        p('pyramids-of-giza', 'Pyramids of Giza', 'ancient', 'pyramids', 'Giza, Egypt. The Great Pyramid was the tallest building on Earth for nearly 4,000 years.'),
        p('stonehenge', 'Stonehenge', 'ancient', null, 'Wiltshire, England. Some of its stones were carried about 240 km from Wales.'),
        p('parthenon', 'Parthenon', 'ancient', 'acropolis', 'Athens, Greece. This temple on the Acropolis is about 2,500 years old.'),
        p('petra', 'Petra', 'ancient', 'treasury', 'Jordan. Its buildings were carved straight into pink sandstone cliffs.'),
        p('machu-picchu', 'Machu Picchu', 'ancient', null, 'Peru. This Inca city sits high in the Andes mountains.'),
        p('victoria-falls', 'Victoria Falls', 'nature', 'mosi oa tunya', 'Zambia and Zimbabwe. Locals call it Mosi-oa-Tunya, the smoke that thunders.'),
        p('niagara-falls', 'Niagara Falls', 'nature', null, 'Canada and the United States. Its horseshoe-shaped falls are on the border.'),
        p('mount-kilimanjaro', 'Mount Kilimanjaro', 'nature', 'kilimanjaro', 'Tanzania. Africa’s highest mountain has snow on top near the equator.'),
        p('table-mountain', 'Table Mountain', 'nature', null, 'Cape Town, South Africa. Its flat top is often covered by a cloud called the tablecloth.'),
        p('mount-fuji', 'Mount Fuji', 'nature', 'fuji', 'Japan. This volcano is the highest mountain in Japan.'),
        p('great-wall-of-china', 'Great Wall of China', 'bridges', 'great wall', 'China. The wall and its branches stretch for thousands of kilometres.'),
        p('statue-of-liberty', 'Statue of Liberty', 'monuments', null, 'New York, United States. It was a gift from France in 1886.'),
        p('christ-the-redeemer', 'Christ the Redeemer', 'monuments', 'Cristo Redentor', 'Rio de Janeiro, Brazil. The statue stands 30 metres tall on a mountain top.'),
        p('taj-mahal', 'Taj Mahal', 'monuments', null, 'Agra, India. It was built from white marble by an emperor in memory of his wife.'),
        p('angkor-wat', 'Angkor Wat', 'monuments', null, 'Cambodia. It is the largest religious building in the world.'),
        p('sagrada-familia', 'Sagrada Família', 'monuments', 'sagrada familia', 'Barcelona, Spain. Building started in 1882 and it is still not finished.'),
        p('sydney-opera-house', 'Sydney Opera House', 'monuments', 'opera house', 'Sydney, Australia. Its roof is shaped like white sails.')
      ],
      objects: [
        p('kettle', 'Kettle', 'kitchen', null, 'Electric kettles switch off by themselves when the water boils.'),
        p('toaster', 'Toaster', 'kitchen', null, 'The pop-up toaster was invented about 100 years ago.'),
        p('frying-pan', 'Frying pan', 'kitchen', 'pan', 'A frying pan has low sloped sides so food is easy to flip.'),
        p('whisk', 'Whisk', 'kitchen', null, 'A whisk beats air into eggs and cream to make them fluffy.'),
        p('teapot', 'Teapot', 'kitchen', null, 'Teapots have a little hole in the lid so the tea pours smoothly.'),
        p('blender', 'Blender', 'kitchen', null, 'A blender’s fast spinning blades turn fruit into a smoothie.'),
        p('scissors', 'Scissors', 'school', null, 'Scissors are two blades joined in the middle so they cut like a mouth.'),
        p('stapler', 'Stapler', 'school', null, 'A stapler pushes a thin wire through paper and bends its ends flat.'),
        p('calculator', 'Calculator', 'school', null, 'The first pocket calculators appeared in the 1970s.'),
        p('pencil-sharpener', 'Pencil sharpener', 'school', 'sharpener', 'A sharpener’s small blade shaves the wood away in a spiral.'),
        p('globe', 'Globe', 'school', null, 'A globe is a map of the Earth shaped like the Earth itself.'),
        p('backpack', 'Backpack', 'school', 'school bag', 'Backpacks spread the weight across both shoulders.'),
        p('hammer', 'Hammer', 'tools', null, 'The claw on a hammer pulls nails back out.'),
        p('screwdriver', 'Screwdriver', 'tools', null, 'Screwdrivers come with flat or cross-shaped tips to match the screw.'),
        p('spanner', 'Spanner', 'tools', 'wrench', 'A spanner is called a wrench in the United States.'),
        p('tape-measure', 'Tape measure', 'tools', null, 'A tape measure’s metal tape curls slightly so it stays stiff.'),
        p('padlock', 'Padlock', 'tools', 'lock', 'A padlock’s curved bar is called a shackle.'),
        p('torch', 'Torch', 'tools', 'flashlight', 'A torch is called a flashlight in the United States.'),
        p('umbrella', 'Umbrella', 'home', null, 'Umbrellas were first used to keep off the sun, not the rain.'),
        p('alarm-clock', 'Alarm clock', 'home', 'clock', 'Old alarm clocks ring by hitting two bells with a tiny hammer.'),
        p('light-bulb', 'Light bulb', 'home', 'bulb', 'Thomas Edison made one of the first long-lasting light bulbs in 1879.'),
        p('candle', 'Candle', 'home', null, 'A candle burns its wax, not its wick.'),
        p('key', 'Key', 'home', 'keys', 'The bumps on a key lift tiny pins inside the lock.'),
        p('remote-control', 'Remote control', 'home', 'remote', 'A TV remote sends invisible light to the television.'),
        p('headphones', 'Headphones', 'personal', null, 'Headphones turn electric signals back into sound.'),
        p('camera', 'Camera', 'personal', null, 'Camera comes from a Latin word for a room.'),
        p('sunglasses', 'Sunglasses', 'personal', null, 'Good sunglasses block the sun’s ultraviolet rays.'),
        p('wristwatch', 'Wristwatch', 'personal', 'watch', 'Wristwatches became popular about 100 years ago.'),
        p('toothbrush', 'Toothbrush', 'personal', null, 'You should change your toothbrush about every three months.'),
        p('hairdryer', 'Hairdryer', 'personal', 'hair dryer', 'A hairdryer blows air over a hot wire.')
      ],
      sports: [
        p('football', 'Football', 'team-ball', 'soccer', 'Football is the most watched sport in the world.'),
        p('basketball', 'Basketball', 'team-ball', null, 'Basketball was first played with peach baskets as hoops.'),
        p('volleyball', 'Volleyball', 'team-ball', null, 'In volleyball, each team gets three touches to send the ball over the net.'),
        p('rugby', 'Rugby', 'team-ball', null, 'In rugby you may only pass the ball backwards.'),
        p('netball', 'Netball', 'team-ball', null, 'In netball, players may not run with the ball.'),
        p('hockey', 'Hockey', 'team-ball', 'field hockey', 'Hockey sticks are flat on one side only.'),
        p('tennis', 'Tennis', 'bat-racket', null, 'A tennis score of zero is called love.'),
        p('badminton', 'Badminton', 'bat-racket', null, 'A badminton shuttlecock can fly faster than 400 km/h.'),
        p('table-tennis', 'Table tennis', 'bat-racket', 'ping pong', 'Table tennis is also called ping-pong.'),
        p('cricket', 'Cricket', 'bat-racket', null, 'A cricket match can last up to five days.'),
        p('baseball', 'Baseball', 'bat-racket', null, 'A baseball has exactly 108 double stitches.'),
        p('golf', 'Golf', 'bat-racket', null, 'A golf ball has about 300 to 500 little dimples.'),
        p('swimming', 'Swimming', 'body-water', null, 'Front crawl is the fastest swimming stroke.'),
        p('surfing', 'Surfing', 'body-water', null, 'Surfing began in Polynesia and Hawaii hundreds of years ago.'),
        p('rowing', 'Rowing', 'body-water', null, 'Rowers sit facing backwards, away from where the boat is going.'),
        p('boxing', 'Boxing', 'body-water', null, 'Boxing matches are split into rounds of a few minutes each.'),
        p('cycling', 'Cycling', 'body-water', null, 'Racing cyclists ride close together to save energy.'),
        p('gymnastics', 'Gymnastics', 'body-water', null, 'A gymnastics balance beam is only 10 cm wide.')
      ],
      vehicles: [
        p('car', 'Car', 'road', null, 'There are more than a billion cars in the world.'),
        p('bus', 'Bus', 'road', null, 'Double-decker buses have two floors of seats.'),
        p('lorry', 'Lorry', 'road', 'truck', 'A lorry is called a truck in many countries.'),
        p('motorbike', 'Motorbike', 'road', 'motorcycle', 'Motorbikes lean into bends to turn.'),
        p('taxi', 'Taxi', 'road', 'cab', 'Taxi comes from taximeter, the machine that counts the fare.'),
        p('tractor', 'Tractor', 'road', null, 'Tractor back wheels are huge so they grip soft fields.'),
        p('fire-engine', 'Fire engine', 'work', 'fire truck', 'Fire engines carry ladders, hoses and their own water.'),
        p('ambulance', 'Ambulance', 'work', null, 'Ambulance is often written backwards on the front so drivers can read it in a mirror.'),
        p('police-car', 'Police car', 'work', null, 'Police cars have flashing lights and a siren to clear the road.'),
        p('digger', 'Digger', 'work', 'excavator', 'A digger is also called an excavator.'),
        p('forklift', 'Forklift', 'work', null, 'A forklift lifts heavy boxes on two long metal forks.'),
        p('cement-mixer', 'Cement mixer', 'work', 'concrete mixer', 'A cement mixer’s drum keeps turning so the concrete does not set.'),
        p('aeroplane', 'Aeroplane', 'air', 'airplane', 'Big passenger planes fly about 10 km above the ground.'),
        p('helicopter', 'Helicopter', 'air', null, 'Helicopters can fly straight up, backwards and stay still in the air.'),
        p('hot-air-balloon', 'Hot air balloon', 'air', 'balloon', 'Hot air balloons rise because hot air is lighter than cold air.'),
        p('rocket', 'Rocket', 'air', null, 'Rockets carry their own oxygen so their engines work in space.'),
        p('sailing-boat', 'Sailing boat', 'water', 'sailboat', 'A sailing boat can sail towards the wind by zig-zagging.'),
        p('cargo-ship', 'Cargo ship', 'water', 'ship', 'The biggest cargo ships carry over 20,000 containers.'),
        p('canoe', 'Canoe', 'water', 'kayak', 'Canoes have been used for thousands of years, some carved from one tree.'),
        p('submarine', 'Submarine', 'water', null, 'Submarines dive by filling tanks with water and rise by blowing it out.'),
        p('steam-train', 'Steam train', 'rail', 'train', 'Steam trains burn coal to boil water and the steam pushes the wheels.'),
        p('bullet-train', 'Bullet train', 'rail', 'high speed train', 'Bullet trains in Japan can go faster than 300 km/h.'),
        p('tram', 'Tram', 'rail', 'streetcar', 'Trams run on rails along city streets.'),
        p('cable-car', 'Cable car', 'rail', null, 'Cable cars hang from a moving wire high above the ground.')
      ],
      jobs: [
        p('doctor', 'Doctor', 'health', null, 'Doctors study for many years before they can treat patients alone.'),
        p('nurse', 'Nurse', 'health', null, 'Nurses are the largest group of health workers in the world.'),
        p('dentist', 'Dentist', 'health', null, 'Dentists look after teeth and gums.'),
        p('vet', 'Vet', 'health', 'veterinarian', 'A vet is a doctor for animals.'),
        p('pharmacist', 'Pharmacist', 'health', 'chemist', 'Pharmacists make sure your medicine is the right one.'),
        p('paramedic', 'Paramedic', 'health', null, 'Paramedics give emergency care before a patient reaches hospital.'),
        p('chef', 'Chef', 'food-farm', 'cook', 'A chef’s tall white hat is called a toque.'),
        p('baker', 'Baker', 'food-farm', null, 'Bakers often start work in the middle of the night.'),
        p('waiter', 'Waiter', 'food-farm', 'waitress', 'Good waiters can carry several plates on one arm.'),
        p('farmer', 'Farmer', 'food-farm', null, 'Farmers grow the food the whole world eats.'),
        p('fisherman', 'Fisherman', 'food-farm', 'fisher', 'Fishing is one of the oldest jobs in the world.'),
        p('butcher', 'Butcher', 'food-farm', null, 'A butcher cuts and prepares meat to sell.'),
        p('builder', 'Builder', 'build-fix', 'bricklayer', 'Builders read plans to know exactly where each wall goes.'),
        p('electrician', 'Electrician', 'build-fix', null, 'Electricians fit and fix the wires that carry electricity.'),
        p('plumber', 'Plumber', 'build-fix', null, 'Plumber comes from the Latin word for lead, once used for pipes.'),
        p('mechanic', 'Mechanic', 'build-fix', null, 'Mechanics find and fix problems in engines.'),
        p('carpenter', 'Carpenter', 'build-fix', null, 'Carpenters build things from wood.'),
        p('painter', 'Painter', 'build-fix', 'decorator', 'A painter and decorator paints walls with rollers and brushes.'),
        p('pilot', 'Pilot', 'more-jobs', null, 'Airline pilots and co-pilots often eat different meals, just in case.'),
        p('firefighter', 'Firefighter', 'more-jobs', 'fireman', 'Firefighters can get dressed in their gear in about a minute.'),
        p('police-officer', 'Police officer', 'more-jobs', 'police', 'Police officers keep people safe and uphold the law.'),
        p('astronaut', 'Astronaut', 'more-jobs', null, 'Astronauts grow a little taller in space.'),
        p('teacher', 'Teacher', 'more-jobs', null, 'Teachers help children learn to read, write and think.'),
        p('hairdresser', 'Hairdresser', 'more-jobs', 'barber', 'Hairdressers cut, style and colour hair.')
      ],
      instruments: [
        p('violin', 'Violin', 'strings', 'fiddle', 'A violin bow is strung with horse hair.'),
        p('cello', 'Cello', 'strings', null, 'The cello is played sitting down, held between the knees.'),
        p('guitar', 'Guitar', 'strings', null, 'Most guitars have six strings.'),
        p('ukulele', 'Ukulele', 'strings', null, 'The ukulele comes from Hawaii and has four strings.'),
        p('harp', 'Harp', 'strings', null, 'A concert harp has 47 strings.'),
        p('banjo', 'Banjo', 'strings', null, 'A banjo has a round drum-like body.'),
        p('trumpet', 'Trumpet', 'wind', null, 'A trumpet has three valves that change its notes.'),
        p('saxophone', 'Saxophone', 'wind', 'sax', 'The saxophone was invented by Adolphe Sax in the 1840s.'),
        p('trombone', 'Trombone', 'wind', null, 'A trombone changes its note by sliding a long tube.'),
        p('flute', 'Flute', 'wind', null, 'Flutes are played by blowing across a hole, not into it.'),
        p('clarinet', 'Clarinet', 'wind', null, 'A clarinet makes its sound with a thin wooden reed.'),
        p('french-horn', 'French horn', 'wind', 'horn', 'The French horn’s tube is about 4 metres long, coiled up.'),
        p('drum-kit', 'Drum kit', 'percussion', 'drums', 'A drum kit lets one person play many drums and cymbals.'),
        p('djembe', 'Djembe', 'percussion', null, 'The djembe is a goblet-shaped drum from West Africa, played with bare hands.'),
        p('xylophone', 'Xylophone', 'percussion', null, 'Xylophone means “wood sound” in Greek.'),
        p('tambourine', 'Tambourine', 'percussion', null, 'A tambourine’s little metal jingles are called zils.'),
        p('maracas', 'Maracas', 'percussion', 'maraca', 'Maracas are shaken, and seeds or beads inside make the sound.'),
        p('mbira', 'Mbira', 'percussion', 'kalimba', 'The mbira is a thumb piano from Zimbabwe with metal keys.'),
        p('piano', 'Piano', 'keys-more', null, 'A piano has 88 keys: 52 white and 36 black.'),
        p('accordion', 'Accordion', 'keys-more', null, 'An accordion is played by squeezing air through its bellows.'),
        p('harmonica', 'Harmonica', 'keys-more', 'mouth organ', 'A harmonica plays different notes when you blow and when you suck.'),
        p('bagpipes', 'Bagpipes', 'keys-more', null, 'Bagpipes store air in a bag, so the music never stops for a breath.'),
        p('recorder', 'Recorder', 'keys-more', null, 'The recorder is often the first instrument children learn at school.'),
        p('sitar', 'Sitar', 'keys-more', null, 'The sitar from India can have more than 20 strings.')
      ]
    }
  };
})();
