/* ============================================================
   PLAYMONA — data/charadesDecks.js
   Charades cards in 12 themed decks (FF.data.charadesDecks).
   Each deck lists its cards by level: e = easy (a 6-year-old can
   act it), n = normal, h = hard. Title decks (films, songs, books,
   TV, Bible) carry the charades signal for their category.
   Family-safe, no real living people.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.data = FF.data || {};

  var DECKS = [
    { id: 'animals', name: 'Animals', glyph: 'paw', kind: 'word',
      e: 'Elephant|Monkey|Snake|Penguin|Kangaroo|Lion|Frog|Chicken|Dog|Cat|Fish|Rabbit|Duck|Cow|Horse|Bird|Bee|Butterfly|Shark',
      n: 'Giraffe|Crocodile|Octopus|Gorilla|Turtle|Owl|Bat|Crab|Spider|Snail|Pig|Sheep|Bear|Tiger|Zebra|Hippo|Squirrel|Dolphin',
      h: 'Chameleon|Peacock|Flamingo|Jellyfish|Porcupine|Sloth|Seahorse|Woodpecker|Ostrich|Scorpion|Hedgehog|Lobster|Eagle catching a fish|Camel in the desert' },

    { id: 'actions', name: 'Actions', glyph: 'run', kind: 'word',
      e: 'Brushing teeth|Sleeping|Eating|Jumping|Clapping|Crying|Laughing|Waving goodbye|Running|Sneezing|Yawning|Kicking a ball|Climbing a tree|Blowing bubbles|Taking a bath|Combing hair|Drinking water|Walking a dog',
      n: 'Changing a tyre|Riding a bike|Fishing|Painting a wall|Taking a selfie|Juggling|Skipping rope|Tying shoelaces|Making the bed|Building a sandcastle|Catching a bus|Flying a kite|Shaving|Typing on a computer|Blowing out candles|Rowing a boat|Surfing|Ironing clothes',
      h: 'Parallel parking|Walking a tightrope|Changing a baby’s nappy|Doing a magic trick|Sleepwalking|Threading a needle|Opening a stuck jar|Defusing a bomb|Hiccuping|Milking a cow|Bungee jumping|Stepping on a plug|Getting stung by a bee|Walking against the wind' },

    { id: 'jobs', name: 'Jobs', glyph: 'briefcase', kind: 'word',
      e: 'Doctor|Teacher|Chef|Firefighter|Police officer|Farmer|Pilot|Builder|Singer|Dancer|Painter|Driver|Nurse|Fisherman|Baker|Clown|King|Queen',
      n: 'Dentist|Astronaut|Hairdresser|Plumber|Waiter|Scientist|Librarian|Photographer|Postman|Mechanic|Lifeguard|Pirate|Magician|Soldier|Judge|Taxi driver|Cleaner|Carpenter',
      h: 'Air-traffic controller|Beekeeper|Lion tamer|Window cleaner|Zookeeper|Surgeon|Orchestra conductor|Weather reporter|Tailor|Mime artist|Archaeologist|Football referee|Shop cashier|Barber' },

    { id: 'sports', name: 'Sports & games', glyph: 'ball', kind: 'word',
      e: 'Football|Swimming|Basketball|Tennis|Boxing|Skipping|Hide and seek|Running a race|Karate|Dancing|Throwing a ball|Cycling|Skating|Hopscotch|Tug of war|Bowling|Golf|Horse riding',
      n: 'Netball|Cricket|Volleyball|Weightlifting|Hula hoop|Table tennis|Skiing|Rugby|Diving|Baseball|Archery|Wrestling|Gymnastics|Badminton|Rock climbing|Sack race|Musical chairs|Darts',
      h: 'Synchronised swimming|Pole vault|Fencing|Ice hockey|Curling|Javelin|Snooker|Hurdles|Water polo|Triple jump|Sumo wrestling|Egg and spoon race|Long jump|Marathon finish' },

    { id: 'food', name: 'Food & cooking', glyph: 'fork', kind: 'word',
      e: 'Banana|Ice cream|Pizza|Eating spaghetti|Apple|Popcorn|Sandwich|Cake|Soup|Corn on the cob|Lollipop|Egg|Bread|Orange|Chips|Milk|Rice|Watermelon',
      n: 'Flipping pancakes|Making tea|Peeling a potato|Cracking an egg|Chewing gum|Hot chilli|Burger|Coconut|Pouring cereal|Making nshima|Baking a cake|Sour lemon|Hot dog|Chopping onions|Grilling meat|Mango|Doughnut|Candyfloss',
      h: 'Sushi chef|Eating with chopsticks|Tossing a pizza|Whisking cream|Spilling a drink|Pineapple|Sticky toffee|Kneading dough|Sizzling sausages|Too-hot soup|Melting chocolate|Barbecue|Jelly wobbling|Cutting a birthday cake' },

    { id: 'home', name: 'Around the house', glyph: 'house', kind: 'word',
      e: 'Watering plants|Washing dishes|Sweeping|Reading a book|Watching TV|Opening a door|Phone call|Turning on a light|Brushing hair|Putting on shoes|Feeding the cat|Washing hands|Closing a window|Going upstairs|Sitting on a chair|Knocking on a door|Pillow fight|Getting dressed',
      n: 'Vacuuming|Hanging washing|Taking out the rubbish|Mopping the floor|Folding clothes|Setting the table|Locking the door|Changing a light bulb|Doing homework|Mowing the lawn|Washing the car|Making toast|Looking for keys|Hammering a nail|Painting nails|Wrapping a present|Unpacking shopping|Charging a phone',
      h: 'Assembling furniture|Fixing a leaky tap|Untangling headphones|Sneaking a midnight snack|Hanging a picture straight|Killing a mosquito|Catching a fly|Losing the TV remote|Power cut|Stuck in the bathroom|Burnt toast|Alarm clock not working|Tidying in a hurry|Moving house' },

    { id: 'feelings', name: 'Feelings & faces', glyph: 'smile', kind: 'word',
      e: 'Happy|Sad|Angry|Scared|Tired|Surprised|Hungry|Cold|Hot|Sleepy|Excited|Shy|Sick|Bored|Silly|Proud|Worried|Thirsty',
      n: 'Embarrassed|Confused|Nervous|Grumpy|Brave|Lonely|Disgusted|In love|Dizzy|Relieved|Impatient|Ticklish|Cheeky|Shocked|Sneaky|Calm|Giggly|Stubborn',
      h: 'Jealous|Guilty|Suspicious|Exhausted|Overjoyed|Heartbroken|Disappointed|Nostalgic|Thankful|Curious|Determined|Frustrated|Amazed|Shy but happy' },

    { id: 'films', name: 'Films', glyph: 'film', kind: 'title', signal: 'film',
      e: 'The Lion King|Frozen|Toy Story|Finding Nemo|Shrek|Cars|Madagascar|Up|Moana|Kung Fu Panda|Minions|The Little Mermaid|Aladdin|Beauty and the Beast|Ice Age|Coco|Encanto|Home Alone|Inside Out',
      n: 'Jurassic Park|Black Panther|Spider-Man|Superman|Batman|Star Wars|Jaws|Titanic|The Incredibles|Despicable Me|Zootopia|Ratatouille|Monsters Inc|Jumanji|Mary Poppins|The Wizard of Oz|Ghostbusters|King Kong',
      h: 'Back to the Future|Pirates of the Caribbean|Night at the Museum|The Sound of Music|Chicken Run|The Karate Kid|Planet of the Apes|Mission Impossible|Avatar|Transformers|Wall-E|The Lego Movie|Godzilla|ET' },

    { id: 'songs', name: 'Songs', glyph: 'music', kind: 'title', signal: 'song',
      e: 'Happy Birthday|Twinkle Twinkle Little Star|Old MacDonald Had a Farm|Baby Shark|Let It Go|Jingle Bells|Row Row Row Your Boat|Wheels on the Bus|Head Shoulders Knees and Toes|If You’re Happy and You Know It|Hakuna Matata|Under the Sea|Itsy Bitsy Spider|London Bridge Is Falling Down|Humpty Dumpty Sat on a Wall|Rain Rain Go Away|Hokey Cokey|Baa Baa Black Sheep',
      n: 'We Will Rock You|Waka Waka|Jerusalema|Who Let the Dogs Out|Shake It Off|Yellow Submarine|Dancing Queen|Thriller|Rudolph the Red-Nosed Reindeer|Silent Night|Amazing Grace|Bohemian Rhapsody|Let It Be|Macarena|The Lion Sleeps Tonight|Count on Me|Walking on Sunshine|Don’t Worry Be Happy',
      h: 'Somewhere over the Rainbow|My Heart Will Go On|Eye of the Tiger|Stayin’ Alive|I Will Survive|Bridge over Troubled Water|We Are the Champions|Under Pressure|Hallelujah|What a Wonderful World|Livin’ on a Prayer|Rolling in the Deep|Umbrella|Imagine' },

    { id: 'books', name: 'Books & stories', glyph: 'book', kind: 'title', signal: 'book',
      e: 'Cinderella|Snow White|Goldilocks and the Three Bears|Little Red Riding Hood|Jack and the Beanstalk|The Three Little Pigs|Peter Pan|Pinocchio|The Gingerbread Man|The Very Hungry Caterpillar|The Gruffalo|The Tortoise and the Hare|Sleeping Beauty|Rapunzel|The Ugly Duckling|Winnie the Pooh|Paddington Bear|The Cat in the Hat',
      n: 'Harry Potter|The Jungle Book|Alice in Wonderland|Charlie and the Chocolate Factory|Hansel and Gretel|Matilda|Robin Hood|Treasure Island|The Boy Who Cried Wolf|The Emperor’s New Clothes|The Princess and the Pea|Anansi the Spider|Charlotte’s Web|James and the Giant Peach|The BFG|Where’s Wally|Diary of a Wimpy Kid|Black Beauty',
      h: 'Robinson Crusoe|Romeo and Juliet|Oliver Twist|Frankenstein|Gulliver’s Travels|Around the World in Eighty Days|Things Fall Apart|The Little Prince|Moby Dick|The Hobbit|Sherlock Holmes|The Pied Piper|Thumbelina|King Arthur' },

    { id: 'tv', name: 'TV & characters', glyph: 'tv', kind: 'title', signal: 'tv',
      e: 'Peppa Pig|SpongeBob SquarePants|Paw Patrol|Tom and Jerry|Mickey Mouse|Scooby-Doo|Mr Bean|Bluey|Teletubbies|Dora the Explorer|Bob the Builder|Thomas the Tank Engine|Pingu|Shaun the Sheep|Sesame Street|Barney|Hey Duggee|Fireman Sam',
      n: 'The Simpsons|Pokémon|Power Rangers|Ben 10|The Flintstones|Bugs Bunny|Pink Panther|Teenage Mutant Ninja Turtles|The Muppets|Garfield|Popeye|The Smurfs|Wallace and Gromit|Sonic the Hedgehog|Postman Pat|Mr Men|Doc McStuffins|Octonauts',
      h: 'Doctor Who|MasterChef|Who Wants to Be a Millionaire|The Voice|Strictly Come Dancing|Wheel of Fortune|Inspector Gadget|Road Runner|Woody Woodpecker|Gladiators|Captain Planet|Avatar the Last Airbender|Got Talent|Survivor' },

    { id: 'bible', name: 'Bible', glyph: 'dove', kind: 'title', signal: 'book',
      e: 'Noah’s Ark|David and Goliath|Jonah and the Whale|Adam and Eve|Baby Moses in a Basket|Daniel in the Lions’ Den|Jesus Walks on Water|The Lost Sheep|The Nativity|The Wise Men|Zacchaeus up a Tree|Jesus Calms the Storm|Creation|The Good Shepherd|Feeding the Five Thousand|The Shepherds and the Angels|Joseph’s Coloured Coat|The Ten Commandments',
      n: 'Moses Parts the Sea|The Good Samaritan|The Prodigal Son|The Tower of Babel|Samson|The Walls of Jericho|The Burning Bush|Water into Wine|The Last Supper|Lazarus Rises|Peter’s Big Catch of Fish|Elijah and the Ravens|Queen Esther|The Wise and Foolish Builders|Manna from Heaven|Jesus Heals the Blind Man|The Lost Coin|Jacob’s Ladder',
      h: 'Balaam’s Talking Donkey|The Fiery Furnace|Paul’s Shipwreck|Elijah’s Chariot of Fire|Naaman Washes in the Jordan|The Plagues of Egypt|Gideon’s Trumpets|Solomon’s Wise Judgement|The Mustard Seed|The Widow’s Offering|Nehemiah Builds the Wall|Pentecost|Saul on the Road to Damascus|Ruth Gathers Grain' }
  ];

  function cardsOf(d) {
    var out = [];
    ['e', 'n', 'h'].forEach(function (l) {
      String(d[l] || '').split('|').forEach(function (t) { if (t) out.push({ t: t, l: l }); });
    });
    return out;
  }

  FF.data.charadesDecks = DECKS.map(function (d) {
    var deck = { id: d.id, name: d.name, glyph: d.glyph, kind: d.kind, cards: cardsOf(d) };
    if (d.signal) deck.signal = d.signal;
    return deck;
  });
})();
