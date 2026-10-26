/* ============================================================
   PLAYMONA — memoryDecks.js
   Picture decks for Memory Match. Each card is [id, name, emoji].
   The picture is assets/images/games/memoryMatch/<id>.webp, made from
   the sheets in tools/art/memoryMatch.json (docs/art/memoryMatch-prompts.md)
   by tools/cut-art-sheets.py. Until a picture exists the card shows
   its emoji, so ids must stay unique across all decks.
   Each board deals a surprise deck (or a mix); name heads the board
   and colour (a decoration token) tints the card faces.
   ============================================================ */
window.FF = window.FF || {};

FF.MemoryDecks = [
  { id: 'animals', name: 'Animals', colour: '--brand-green', cards: [
    ['lion', 'Lion', '🦁'], ['elephant', 'Elephant', '🐘'], ['giraffe', 'Giraffe', '🦒'], ['zebra', 'Zebra', '🦓'],
    ['monkey', 'Monkey', '🐒'], ['panda', 'Panda', '🐼'], ['koala', 'Koala', '🐨'], ['tiger', 'Tiger', '🐯'],
    ['hippo', 'Hippo', '🦛'], ['kangaroo', 'Kangaroo', '🦘'], ['fox', 'Fox', '🦊'], ['bear', 'Bear', '🐻'],
    ['cat', 'Cat', '🐱'], ['dog', 'Dog', '🐶'], ['rabbit', 'Rabbit', '🐰'], ['pig', 'Pig', '🐷'],
    ['cow', 'Cow', '🐮'], ['horse', 'Horse', '🐴'], ['sheep', 'Sheep', '🐑'], ['chicken', 'Chicken', '🐔'],
    ['duck', 'Duck', '🦆'], ['frog', 'Frog', '🐸'], ['owl', 'Owl', '🦉'], ['penguin', 'Penguin', '🐧']
  ] },
  { id: 'sea', name: 'Sea life', colour: '--brand-cyan', cards: [
    ['octopus', 'Octopus', '🐙'], ['whale', 'Whale', '🐳'], ['dolphin', 'Dolphin', '🐬'], ['shark', 'Shark', '🦈'],
    ['clownfish', 'Clownfish', '🐠'], ['pufferfish', 'Pufferfish', '🐡'], ['seahorse', 'Seahorse', '🌊'], ['jellyfish', 'Jellyfish', '🪼'],
    ['crab', 'Crab', '🦀'], ['turtle', 'Turtle', '🐢'], ['starfish', 'Starfish', '⭐'], ['blue-tang', 'Blue tang', '🐟'],
    ['seal', 'Seal', '🦭'], ['squid', 'Squid', '🦑'], ['shrimp', 'Shrimp', '🦐'], ['oyster', 'Oyster', '🦪'],
    ['seashell', 'Seashell', '🐚'], ['coral', 'Coral', '🪸'], ['stingray', 'Stingray', '🐟'], ['narwhal', 'Narwhal', '🐋'],
    ['orca', 'Orca', '🐋'], ['sea-otter', 'Sea otter', '🦦'], ['anglerfish', 'Anglerfish', '🐟'], ['sea-urchin', 'Sea urchin', '🌰']
  ] },
  { id: 'food', name: 'Food & treats', colour: '--brand-orange', cards: [
    ['pizza', 'Pizza', '🍕'], ['burger', 'Burger', '🍔'], ['fries', 'Fries', '🍟'], ['hot-dog', 'Hot dog', '🌭'],
    ['taco', 'Taco', '🌮'], ['sushi', 'Sushi', '🍣'], ['ramen', 'Ramen', '🍜'], ['spaghetti', 'Spaghetti', '🍝'],
    ['sandwich', 'Sandwich', '🥪'], ['pancakes', 'Pancakes', '🥞'], ['fried-egg', 'Fried egg', '🍳'], ['popcorn', 'Popcorn', '🍿'],
    ['cupcake', 'Cupcake', '🧁'], ['donut', 'Donut', '🍩'], ['ice-cream', 'Ice cream', '🍦'], ['cake', 'Cake', '🍰'],
    ['cookie', 'Cookie', '🍪'], ['lollipop', 'Lollipop', '🍭'], ['candy-cane', 'Candy cane', '🍬'], ['croissant', 'Croissant', '🥐'],
    ['gummy-bear', 'Gummy bear', '🐻'], ['jelly', 'Jelly', '🍮'], ['cheese', 'Cheese', '🧀'], ['hot-cocoa', 'Hot cocoa', '☕']
  ] },
  { id: 'fruit', name: 'Fruit & veg', colour: '--cat-party', cards: [
    ['apple', 'Apple', '🍎'], ['banana', 'Banana', '🍌'], ['strawberry', 'Strawberry', '🍓'], ['grapes', 'Grapes', '🍇'],
    ['watermelon', 'Watermelon', '🍉'], ['pineapple', 'Pineapple', '🍍'], ['orange', 'Orange', '🍊'], ['cherries', 'Cherries', '🍒'],
    ['lemon', 'Lemon', '🍋'], ['peach', 'Peach', '🍑'], ['pear', 'Pear', '🍐'], ['kiwi', 'Kiwi', '🥝'],
    ['carrot', 'Carrot', '🥕'], ['broccoli', 'Broccoli', '🥦'], ['corn', 'Corn', '🌽'], ['tomato', 'Tomato', '🍅'],
    ['avocado', 'Avocado', '🥑'], ['eggplant', 'Eggplant', '🍆'], ['mushroom', 'Mushroom', '🍄'], ['pepper', 'Pepper', '🫑'],
    ['potato', 'Potato', '🥔'], ['pumpkin', 'Pumpkin', '🎃'], ['coconut', 'Coconut', '🥥'], ['mango', 'Mango', '🥭']
  ] },
  { id: 'characters', name: 'Characters', colour: '--brand-purple', cards: [
    ['wizard', 'Wizard', '🧙'], ['knight', 'Knight', '🛡️'], ['princess', 'Princess', '👸'], ['pirate', 'Pirate', '🏴‍☠️'],
    ['astronaut', 'Astronaut', '🧑‍🚀'], ['robot', 'Robot', '🤖'], ['alien', 'Alien', '👽'], ['superhero', 'Superhero', '🦸'],
    ['ninja', 'Ninja', '🥷'], ['mermaid', 'Mermaid', '🧜‍♀️'], ['fairy', 'Fairy', '🧚'], ['genie', 'Genie', '🧞'],
    ['dragon', 'Dragon', '🐉'], ['unicorn', 'Unicorn', '🦄'], ['ghost', 'Ghost', '👻'], ['monster', 'Monster', '👾'],
    ['witch', 'Witch', '🧹'], ['viking', 'Viking', '⚔️'], ['cowboy', 'Cowboy', '🤠'], ['chef', 'Chef', '🧑‍🍳'],
    ['king', 'King', '🤴'], ['vampire', 'Vampire', '🧛'], ['mummy', 'Mummy', '🧟'], ['elf', 'Elf', '🧝']
  ] },
  { id: 'toys', name: 'Toys & things', colour: '--brand-pink', cards: [
    ['teddy', 'Teddy bear', '🧸'], ['balloon', 'Balloon', '🎈'], ['yo-yo', 'Yo-yo', '🪀'], ['kite', 'Kite', '🪁'],
    ['dice', 'Dice', '🎲'], ['puzzle', 'Puzzle piece', '🧩'], ['controller', 'Game controller', '🎮'], ['magic-wand', 'Magic wand', '🪄'],
    ['nesting-doll', 'Nesting doll', '🪆'], ['pinata', 'Piñata', '🪅'], ['gift', 'Gift', '🎁'], ['blocks', 'Toy blocks', '🧱'],
    ['palette', 'Paint palette', '🎨'], ['crayons', 'Crayons', '🖍️'], ['top-hat', 'Top hat', '🎩'], ['crystal-ball', 'Crystal ball', '🔮'],
    ['magnet', 'Magnet', '🧲'], ['umbrella', 'Umbrella', '☂️'], ['alarm-clock', 'Alarm clock', '⏰'], ['camera', 'Camera', '📷'],
    ['backpack', 'Backpack', '🎒'], ['sunglasses', 'Sunglasses', '🕶️'], ['telescope', 'Telescope', '🔭'], ['light-bulb', 'Light bulb', '💡']
  ] },
  { id: 'sports', name: 'Sport & music', colour: '--cat-quiz', cards: [
    ['soccer-ball', 'Soccer ball', '⚽'], ['basketball', 'Basketball', '🏀'], ['tennis', 'Tennis', '🎾'], ['baseball', 'Baseball', '⚾'],
    ['rugby-ball', 'Rugby ball', '🏈'], ['volleyball', 'Volleyball', '🏐'], ['bowling', 'Bowling', '🎳'], ['ping-pong', 'Ping-pong', '🏓'],
    ['boxing-glove', 'Boxing glove', '🥊'], ['skateboard', 'Skateboard', '🛹'], ['medal', 'Medal', '🏅'], ['trophy', 'Trophy', '🏆'],
    ['guitar', 'Guitar', '🎸'], ['drum', 'Drum', '🥁'], ['trumpet', 'Trumpet', '🎺'], ['violin', 'Violin', '🎻'],
    ['piano', 'Piano', '🎹'], ['saxophone', 'Saxophone', '🎷'], ['microphone', 'Microphone', '🎤'], ['headphones', 'Headphones', '🎧'],
    ['maracas', 'Maracas', '🪇'], ['accordion', 'Accordion', '🪗'], ['banjo', 'Banjo', '🪕'], ['xylophone', 'Xylophone', '🎼']
  ] },
  { id: 'vehicles', name: 'Things that go', colour: '--brand-yellow', cards: [
    ['car', 'Car', '🚗'], ['bus', 'Bus', '🚌'], ['fire-truck', 'Fire truck', '🚒'], ['police-car', 'Police car', '🚓'],
    ['ambulance', 'Ambulance', '🚑'], ['tractor', 'Tractor', '🚜'], ['train', 'Train', '🚂'], ['airplane', 'Airplane', '✈️'],
    ['helicopter', 'Helicopter', '🚁'], ['rocket', 'Rocket', '🚀'], ['sailboat', 'Sailboat', '⛵'], ['bicycle', 'Bicycle', '🚲'],
    ['motorbike', 'Motorbike', '🏍️'], ['scooter', 'Scooter', '🛴'], ['taxi', 'Taxi', '🚕'], ['race-car', 'Race car', '🏎️'],
    ['ship', 'Ship', '🛳️'], ['speedboat', 'Speedboat', '🚤'], ['cable-car', 'Cable car', '🚡'], ['ufo', 'Flying saucer', '🛸'],
    ['tram', 'Tram', '🚋'], ['van', 'Van', '🚚'], ['canoe', 'Canoe', '🛶'], ['hot-air-balloon', 'Hot-air balloon', '🪂']
  ] }
];
