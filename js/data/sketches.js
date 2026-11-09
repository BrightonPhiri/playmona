/* ============================================================
   PLAYMONA — data/sketches.js
   SketchBack's object library: every thing a player may be asked
   to copy. Each has one reference sketch (black line art,
   assets/images/sketchback/<id>.webp) and the names a player may
   use for it later.

     { id, name, cat, tier, alts }
       tier  'e' simple outline, 'n' a few details, 'h' detailed
       alts  other names that count (plurals are added by the rules)

   VAGUE lists answers too general to count for anything ("animal").
   No alt may be another object's name. Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function o(id, name, cat, tier, alts) { return { id: id, name: name, cat: cat, tier: tier, alts: alts || [] }; }

  var LIST = [
    /* animals */
    o('cat', 'Cat', 'animals', 'e', ['kitty', 'kitten']),
    o('dog', 'Dog', 'animals', 'e', ['puppy', 'doggy', 'pup']),
    o('fish', 'Fish', 'animals', 'e', ['goldfish']),
    o('bird', 'Bird', 'animals', 'e', ['birdie', 'sparrow']),
    o('snail', 'Snail', 'animals', 'e', []),
    o('snake', 'Snake', 'animals', 'e', ['serpent']),
    o('butterfly', 'Butterfly', 'animals', 'n', []),
    o('elephant', 'Elephant', 'animals', 'n', []),
    o('turtle', 'Turtle', 'animals', 'n', ['tortoise']),
    o('rabbit', 'Rabbit', 'animals', 'n', ['bunny', 'hare']),
    o('owl', 'Owl', 'animals', 'n', []),
    o('spider', 'Spider', 'animals', 'n', []),
    o('duck', 'Duck', 'animals', 'n', ['duckling']),
    o('bee', 'Bee', 'animals', 'n', ['bumblebee', 'honeybee']),
    o('whale', 'Whale', 'animals', 'n', []),
    o('giraffe', 'Giraffe', 'animals', 'h', []),
    o('octopus', 'Octopus', 'animals', 'h', []),
    o('frog', 'Frog', 'animals', 'h', ['toad']),
    o('crab', 'Crab', 'animals', 'h', []),
    o('horse', 'Horse', 'animals', 'h', ['pony']),
    o('lion', 'Lion', 'animals', 'h', []),

    /* food */
    o('apple', 'Apple', 'food', 'e', []),
    o('banana', 'Banana', 'food', 'e', []),
    o('pizza', 'Pizza', 'food', 'e', ['pizza slice', 'slice of pizza']),
    o('donut', 'Donut', 'food', 'e', ['doughnut']),
    o('iceCream', 'Ice cream', 'food', 'e', ['ice cream cone', 'icecream', 'cone']),
    o('cherry', 'Cherry', 'food', 'e', []),
    o('carrot', 'Carrot', 'food', 'e', []),
    o('lollipop', 'Lollipop', 'food', 'e', ['lolly']),
    o('egg', 'Egg', 'food', 'e', ['fried egg']),
    o('burger', 'Burger', 'food', 'n', ['hamburger', 'cheeseburger']),
    o('cake', 'Cake', 'food', 'n', ['birthday cake']),
    o('pear', 'Pear', 'food', 'n', []),
    o('strawberry', 'Strawberry', 'food', 'n', []),
    o('grapes', 'Grapes', 'food', 'n', ['grape', 'bunch of grapes']),
    o('cupcake', 'Cupcake', 'food', 'n', ['muffin', 'fairy cake']),
    o('watermelon', 'Watermelon', 'food', 'n', ['melon']),
    o('pineapple', 'Pineapple', 'food', 'h', []),
    o('hotDog', 'Hot dog', 'food', 'h', ['hotdog', 'sausage']),
    o('sandwich', 'Sandwich', 'food', 'h', ['sarnie']),
    o('croissant', 'Croissant', 'food', 'h', []),
    o('pretzel', 'Pretzel', 'food', 'h', []),

    /* nature */
    o('tree', 'Tree', 'nature', 'e', []),
    o('flower', 'Flower', 'nature', 'e', ['daisy']),
    o('mushroom', 'Mushroom', 'nature', 'e', ['toadstool']),
    o('sun', 'Sun', 'nature', 'e', []),
    o('cloud', 'Cloud', 'nature', 'e', []),
    o('moon', 'Moon', 'nature', 'e', ['crescent', 'crescent moon']),
    o('star', 'Star', 'nature', 'e', []),
    o('lightning', 'Lightning', 'nature', 'e', ['lightning bolt', 'thunderbolt', 'bolt']),
    o('raindrop', 'Raindrop', 'nature', 'e', ['drop', 'water drop', 'droplet']),
    o('mountain', 'Mountain', 'nature', 'n', ['hill']),
    o('leaf', 'Leaf', 'nature', 'n', ['leaves']),
    o('cactus', 'Cactus', 'nature', 'n', ['cacti']),
    o('rainbow', 'Rainbow', 'nature', 'n', []),
    o('wave', 'Wave', 'nature', 'n', []),
    o('acorn', 'Acorn', 'nature', 'n', []),
    o('feather', 'Feather', 'nature', 'n', []),
    o('shell', 'Shell', 'nature', 'n', ['seashell', 'sea shell']),
    o('palmTree', 'Palm tree', 'nature', 'h', ['palm']),
    o('volcano', 'Volcano', 'nature', 'h', []),
    o('snowflake', 'Snowflake', 'nature', 'h', []),
    o('island', 'Island', 'nature', 'h', []),
    o('pineCone', 'Pine cone', 'nature', 'h', ['pinecone', 'fir cone']),

    /* transport */
    o('car', 'Car', 'transport', 'e', ['automobile', 'motorcar']),
    o('boat', 'Boat', 'transport', 'e', ['ship', 'sailboat', 'sailing boat']),
    o('bicycle', 'Bicycle', 'transport', 'n', ['bike', 'cycle', 'push bike']),
    o('aeroplane', 'Aeroplane', 'transport', 'n', ['airplane', 'plane', 'jet', 'aircraft']),
    o('bus', 'Bus', 'transport', 'n', []),
    o('rocket', 'Rocket', 'transport', 'n', ['spaceship', 'rocket ship']),
    o('truck', 'Truck', 'transport', 'n', ['lorry']),
    o('scooter', 'Scooter', 'transport', 'n', []),
    o('skateboard', 'Skateboard', 'transport', 'n', []),
    o('parachute', 'Parachute', 'transport', 'n', []),
    o('trafficLight', 'Traffic light', 'transport', 'n', ['traffic lights', 'stoplight', 'robot']),
    o('anchor', 'Anchor', 'transport', 'n', []),
    o('train', 'Train', 'transport', 'h', ['locomotive', 'steam train']),
    o('helicopter', 'Helicopter', 'transport', 'h', ['chopper']),
    o('motorbike', 'Motorbike', 'transport', 'h', ['motorcycle']),
    o('tractor', 'Tractor', 'transport', 'h', []),
    o('submarine', 'Submarine', 'transport', 'h', []),
    o('hotAirBalloon', 'Hot air balloon', 'transport', 'h', ['air balloon']),
    o('fireEngine', 'Fire engine', 'transport', 'h', ['fire truck', 'firetruck']),
    o('rollerSkate', 'Roller skate', 'transport', 'h', ['skate', 'roller boot']),
    o('steeringWheel', 'Steering wheel', 'transport', 'h', ['wheel']),

    /* household */
    o('chair', 'Chair', 'household', 'e', ['seat', 'stool']),
    o('table', 'Table', 'household', 'e', ['desk']),
    o('clock', 'Clock', 'household', 'e', []),
    o('door', 'Door', 'household', 'e', []),
    o('window', 'Window', 'household', 'e', []),
    o('cup', 'Cup', 'household', 'e', ['mug', 'teacup']),
    o('fork', 'Fork', 'household', 'e', []),
    o('spoon', 'Spoon', 'household', 'e', []),
    o('candle', 'Candle', 'household', 'e', []),
    o('lamp', 'Lamp', 'household', 'n', ['table lamp']),
    o('television', 'Television', 'household', 'n', ['tv', 'telly', 'tv set']),
    o('bed', 'Bed', 'household', 'n', []),
    o('sofa', 'Sofa', 'household', 'n', ['couch', 'settee']),
    o('broom', 'Broom', 'household', 'n', ['broomstick']),
    o('bucket', 'Bucket', 'household', 'n', ['pail']),
    o('fryingPan', 'Frying pan', 'household', 'n', ['pan', 'skillet']),
    o('lightBulb', 'Light bulb', 'household', 'n', ['lightbulb', 'bulb']),
    o('teapot', 'Teapot', 'household', 'h', []),
    o('bathtub', 'Bathtub', 'household', 'h', ['bath', 'tub']),
    o('kettle', 'Kettle', 'household', 'h', []),
    o('toaster', 'Toaster', 'household', 'h', []),

    /* everyday */
    o('umbrella', 'Umbrella', 'everyday', 'e', ['brolly']),
    o('key', 'Key', 'everyday', 'e', []),
    o('book', 'Book', 'everyday', 'e', []),
    o('pencil', 'Pencil', 'everyday', 'e', []),
    o('hat', 'Hat', 'everyday', 'e', ['top hat']),
    o('sock', 'Sock', 'everyday', 'e', []),
    o('balloon', 'Balloon', 'everyday', 'e', []),
    o('envelope', 'Envelope', 'everyday', 'e', ['letter', 'mail']),
    o('shoe', 'Shoe', 'everyday', 'n', ['sneaker', 'trainer', 'takkie']),
    o('glasses', 'Glasses', 'everyday', 'n', ['spectacles', 'specs', 'sunglasses']),
    o('scissors', 'Scissors', 'everyday', 'n', ['scissor']),
    o('present', 'Present', 'everyday', 'n', ['gift', 'gift box']),
    o('crown', 'Crown', 'everyday', 'n', []),
    o('hammer', 'Hammer', 'everyday', 'n', []),
    o('ladder', 'Ladder', 'everyday', 'n', []),
    o('tShirt', 'T-shirt', 'everyday', 'n', ['shirt', 'tee']),
    o('telephone', 'Telephone', 'everyday', 'h', ['phone']),
    o('backpack', 'Backpack', 'everyday', 'h', ['rucksack', 'school bag', 'schoolbag', 'bag']),
    o('camera', 'Camera', 'everyday', 'h', []),
    o('guitar', 'Guitar', 'everyday', 'h', []),
    o('trophy', 'Trophy', 'everyday', 'h', []),
    o('headphones', 'Headphones', 'everyday', 'h', ['earphones', 'headset'])
  ];

  var VAGUE = [
    'animal', 'pet', 'creature', 'insect', 'bug', 'food', 'fruit', 'vegetable', 'veg', 'snack', 'sweet', 'sweets', 'dessert',
    'drink', 'meal', 'thing', 'things', 'object', 'stuff', 'something', 'item', 'plant', 'nature', 'weather', 'vehicle',
    'transport', 'furniture', 'tool', 'toy', 'clothes', 'clothing', 'shape', 'circle', 'square', 'line', 'lines',
    'drawing', 'picture', 'sketch', 'scribble', 'doodle', 'idk', 'dunno', 'nothing', 'none', 'no idea', 'not sure'
  ];

  FF.SketchData = {
    CATS: ['animals', 'food', 'nature', 'transport', 'household', 'everyday'],
    LIST: LIST,
    VAGUE: VAGUE
  };
})();
