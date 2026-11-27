/* ============================================================
   PLAYMONA — data/missionTrailStages.js
   Mission Trail stages and stage groups. A stage is data only: the
   engine (js/missiontrail/engine.js) runs its steps on its map.

   Stage fields:
     id, title, map (a map id in missionTrailMaps), letter ('letter' |
     'note' | 'scroll' | 'official'), time (seconds), fog (bool),
     radius (fog cells, default 3), start (null = the map's start),
     controls ('arrows'), tip (show the first-time controls tip),
     identities { thingKey: identityId }, briefing { title, from,
     message, arrive }, route (the letter's directions: { go: n },
     { turn: 'left'|'right' }, { go: 'until', at: thingKey },
     { go: 'junction', n }, { take: streetName, turn }), steps ([{ do, ... }]),
     vehicles ([{ key, look: 'car-green', x, y, facing }] parked on the map
     for this stage only),
     scoring (null = default weights).
   Step types (FF.MissionTrail.Engine.STEPS):
     { do: 'reach', target }                         check the right place
     { do: 'collect', item, scene, at? }             pick the thing from a scene,
                                                     at the start or inside `at`
     { do: 'give', target, item, to, scene }         hand it to the right person there
     { do: 'meet', target, to, scene }               find the right person there
     { do: 'enter', target }                         get into the right car, then drive
     scene = { backdrop: scenes id, options: [object or character ids] }, or for a
     pick-up, { room: rooms id }: a busy room to search, whose things are listed in
     js/data/missionTrailRooms.js (a room can keep backdrop + options to fall back on).
     collect and give take item, or items: [..] for several things.
   identityNames: the name shown once a place is revealed.
   objectNames / peopleNames: names for the bag and for screen readers.
   Check every stage with: node tools/missiontrail-check.js
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.data = FF.data || {};

  FF.data.missionTrail = {
    groups: [
      { from: 1, name: 'Beginner missions' },
      { from: 11, name: 'Getting around' },
      { from: 21, name: 'Exploring town' },
      { from: 31, name: 'Street navigator' },
      { from: 41, name: 'The delivery challenge' },
      { from: 51, name: 'Vehicle missions' },
      { from: 61, name: 'Advanced navigation' },
      { from: 71, name: 'Complex missions' },
      { from: 81, name: 'Expert missions' },
      { from: 91, name: 'Master navigator' }
    ],

    identityNames: {
      busStop: 'Bus stop',
      bakery: 'Bakery',
      school: 'School',
      supermarket: 'Supermarket',
      fountain: 'Fountain',
      library: 'Library',
      hospital: 'Hospital',
      postOffice: 'Post office',
      garage: 'Garage',
      house: 'Your house',
      shop: 'Shop',
      pharmacy: 'Pharmacy',
      toyShop: 'Toy shop',
      grandmaHouse: 'Grandma\u2019s house',
      friendHouse: 'Your friend\u2019s house'
    },

    objectNames: {
      'red-cap': 'Red cap', 'blue-cap': 'Blue cap', 'green-cap': 'Green cap', 'medical-bag': 'Medical bag',
      newspaper: 'Newspaper', keys: 'Keys', 'book-blue': 'Blue book', 'book-red': 'Red book',
      umbrella: 'Umbrella', 'teddy-bear': 'Teddy bear', 'water-bottle': 'Water bottle', watch: 'Watch',
      'reading-glasses': 'Reading glasses', 'red-scarf': 'Red scarf', 'yellow-mug': 'Yellow mug', 'toy-car': 'Toy car',
      football: 'Football', 'pink-slippers': 'Pink slippers', phone: 'Phone', wallet: 'Wallet', torch: 'Torch',
      sunglasses: 'Sunglasses', 'green-apple': 'Green apple', lunchbox: 'Lunchbox'
    },

    peopleNames: {
      librarian: 'Librarian', teacher: 'Teacher', doctor: 'Doctor', nurse: 'Nurse', mechanic: 'Mechanic',
      postman: 'Postman', shopkeeper: 'Shopkeeper', gardener: 'Gardener', grandma: 'Grandma',
      grandpa: 'Grandpa', boy: 'Boy', girl: 'Girl'
    },

    stages: [
      {
        id: 1,
        title: 'The bus stop',
        map: 'village-1',
        letter: 'letter',
        time: 20,
        fog: false,
        start: null,
        controls: 'arrows',
        tip: true,
        identities: { stopA: 'busStop', stopB: 'busStop', stopC: 'busStop' },
        briefing: {
          title: 'A trip to the bus stop',
          from: 'Grandma',
          message: 'I am coming to visit you today! Please meet me at the bus stop, I will be waiting there.',
          arrive: 'You will reach the bus stop.'
        },
        route: [{ go: 5 }, { turn: 'right' }, { go: 3 }],
        steps: [{ do: 'reach', target: 'stopB' }],
        scoring: null
      },
      {
        id: 2,
        title: 'The bakery',
        map: 'town-1',
        letter: 'note',
        time: 15,
        fog: false,
        start: { x: 9, y: 12, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { a2: 'bakery', b1: 'bakery' },
        briefing: {
          title: 'Fresh bread',
          from: 'Mum',
          message: 'We have run out of bread. Please go to the bakery for me.',
          arrive: 'You will reach the bakery.'
        },
        route: [{ go: 3 }, { turn: 'left' }, { go: 4 }],
        steps: [{ do: 'reach', target: 'a2' }],
        scoring: null
      },
      {
        id: 3,
        title: 'The school',
        map: 'town-1',
        letter: 'letter',
        time: 15,
        fog: false,
        start: { x: 13, y: 13, facing: 'left' },
        controls: 'arrows',
        tip: false,
        identities: { b3: 'school', c2: 'school' },
        briefing: {
          title: 'Off to school',
          from: 'Your teacher',
          message: 'Class starts soon and you are new in town. Here is the way to the school.',
          arrive: 'You will reach the school.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 2 }],
        steps: [{ do: 'reach', target: 'b3' }],
        scoring: null
      },
      {
        id: 4,
        title: 'The fountain',
        map: 'town-1',
        letter: 'official',
        time: 20,
        fog: false,
        start: { x: 5, y: 12, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { fountain1: 'fountain', a1: 'supermarket', c1: 'supermarket' },
        briefing: {
          title: 'The shopping list',
          from: 'Dad',
          message: 'I need milk and eggs. Use the fountain to find your way to the supermarket.',
          arrive: 'You will reach the supermarket.'
        },
        route: [{ go: 'until', at: 'fountain1' }, { turn: 'left' }, { go: 3 }],
        steps: [{ do: 'reach', target: 'a1' }],
        scoring: null
      },
      {
        id: 5,
        title: 'The street corner',
        map: 'town-1',
        letter: 'scroll',
        time: 25,
        fog: true,
        radius: 3,
        start: { x: 5, y: 13, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { b1: 'bakery', a2: 'bakery' },
        briefing: {
          title: 'A foggy morning',
          from: 'Grandpa',
          message: 'The fog is thick today, so you will only see the street close to you. Count the corners and meet me at the bakery.',
          arrive: 'You will reach the bakery.'
        },
        route: [{ take: 'Dave Street', turn: 'left' }, { go: 'junction', n: 2 }, { turn: 'right' }, { go: 2 }],
        steps: [{ do: 'reach', target: 'b1' }],
        scoring: null
      },
      {
        id: 6,
        title: 'The red cap',
        map: 'town-1',
        letter: 'letter',
        time: 28,
        fog: false,
        start: { x: 1, y: 12, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { c2: 'library' },
        briefing: {
          title: 'A delivery to the library',
          from: 'Grandma',
          message: 'Please collect my red cap and take it to the librarian at the library. She has grey hair and carries a pile of books.',
          arrive: 'You will reach the library.'
        },
        route: [{ go: 3 }, { turn: 'right' }, { go: 8 }],
        steps: [
          { do: 'collect', item: 'red-cap', scene: { room: 'bedroom', backdrop: 'bedroom', options: ['red-cap', 'blue-cap', 'green-cap', 'teddy-bear', 'book-blue', 'watch'] } },
          { do: 'give', target: 'c2', item: 'red-cap', to: 'librarian', scene: { backdrop: 'library', options: ['librarian', 'teacher', 'gardener', 'grandpa', 'girl'] } }
        ],
        scoring: null
      },
      {
        id: 7,
        title: 'The teacher',
        map: 'town-1',
        letter: 'note',
        time: 24,
        fog: false,
        start: { x: 9, y: 1, facing: 'down' },
        controls: 'arrows',
        tip: false,
        identities: { b3: 'school' },
        briefing: {
          title: 'A message for my teacher',
          from: 'Your friend',
          message: 'I am sick today. Please find my teacher at the school and tell her. She wears glasses and a yellow cardigan.',
          arrive: 'You will reach the school.'
        },
        route: [{ go: 'junction', n: 2 }, { go: 2 }],
        steps: [
          { do: 'meet', target: 'b3', to: 'teacher', scene: { backdrop: 'classroom', options: ['teacher', 'librarian', 'nurse', 'shopkeeper', 'boy', 'girl'] } }
        ],
        scoring: null
      },
      {
        id: 8,
        title: "The doctor's bag",
        map: 'town-1',
        letter: 'official',
        time: 30,
        fog: false,
        start: { x: 5, y: 5, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { c3: 'hospital' },
        briefing: {
          title: 'A forgotten bag',
          from: 'Mum',
          message: 'The doctor left his medical bag at our house. Please collect it and take it to the doctor at the hospital. He wears a white coat.',
          arrive: 'You will reach the hospital.'
        },
        route: [{ go: 'junction', n: 2 }, { turn: 'right' }, { go: 6 }],
        steps: [
          { do: 'collect', item: 'medical-bag', scene: { room: 'hallway', backdrop: 'hallway', options: ['medical-bag', 'umbrella', 'keys', 'water-bottle', 'newspaper', 'book-red'] } },
          { do: 'give', target: 'c3', item: 'medical-bag', to: 'doctor', scene: { backdrop: 'hospital', options: ['doctor', 'nurse', 'grandpa', 'mechanic', 'boy'] } }
        ],
        scoring: null
      },
      {
        id: 9,
        title: 'The green car',
        map: 'town-1',
        letter: 'scroll',
        time: 24,
        fog: false,
        start: { x: 7, y: 1, facing: 'left' },
        controls: 'arrows',
        tip: false,
        identities: { a2: 'garage' },
        vehicles: [
          { key: 'carBlue', look: 'car-blue', x: 6, y: 0, facing: 'right' },
          { key: 'carRed', look: 'car-red', x: 7, y: 0, facing: 'right' },
          { key: 'carGreen', look: 'car-green', x: 8, y: 0, facing: 'right' }
        ],
        briefing: {
          title: 'Time for a check-up',
          from: 'Dad',
          message: 'My green car needs a check-up. Please get into the green car and drive it to the garage.',
          arrive: 'You will reach the garage.'
        },
        route: [{ go: 2 }, { turn: 'left' }, { go: 'junction', n: 2 }, { turn: 'right' }, { go: 3 }],
        steps: [{ do: 'enter', target: 'carGreen' }, { do: 'reach', target: 'a2' }],
        scoring: null
      },
      {
        id: 10,
        title: 'The newspaper',
        map: 'town-1',
        letter: 'letter',
        time: 28,
        fog: false,
        start: { x: 9, y: 13, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { b1: 'postOffice' },
        vehicles: [
          { key: 'carRed', look: 'car-red', x: 8, y: 14, facing: 'right' },
          { key: 'carBlue', look: 'car-blue', x: 10, y: 14, facing: 'right' }
        ],
        briefing: {
          title: 'Read all about it',
          from: 'Grandpa',
          message: 'Please take today\u2019s newspaper to John the postman at the post office. He wears a blue uniform and a cap. Go in my red car, it is faster!',
          arrive: 'You will reach the post office.'
        },
        route: [{ go: 'junction', n: 2 }, { turn: 'left' }, { go: 2 }],
        steps: [
          { do: 'collect', item: 'newspaper', scene: { room: 'kitchen', backdrop: 'kitchen', options: ['newspaper', 'book-blue', 'keys', 'umbrella', 'water-bottle', 'watch'] } },
          { do: 'enter', target: 'carRed' },
          { do: 'give', target: 'b1', item: 'newspaper', to: 'postman', scene: { backdrop: 'post-office', options: ['postman', 'mechanic', 'shopkeeper', 'grandpa', 'boy'] } }
        ],
        scoring: null
      },

      /* ---------- Getting around (Riverside, town-2): more turns, look-alike buildings,
         busy rooms to search. ---------- */
      {
        id: 11,
        title: 'The pharmacy',
        map: 'town-2',
        letter: 'note',
        time: 26,
        fog: false,
        start: { x: 1, y: 15, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { n2: 'pharmacy' },
        briefing: {
          title: 'Welcome to Riverside',
          from: 'Mum',
          message: 'We have moved to Riverside! Please find the pharmacy and ask when my medicine will be ready. It is the blue shop near the bus stop.',
          arrive: 'You will reach the pharmacy.'
        },
        route: [{ go: 4 }, { turn: 'left' }, { go: 'junction', n: 2 }, { turn: 'right' }, { go: 4 }, { turn: 'left' }, { go: 1 }],
        steps: [{ do: 'reach', target: 'n2' }],
        scoring: null
      },
      {
        id: 12,
        title: 'Grandpa forgot',
        map: 'town-2',
        letter: 'letter',
        time: 30,
        fog: false,
        start: { x: 9, y: 15, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { n3: 'library' },
        briefing: {
          title: 'Keys and a drink',
          from: 'Grandma',
          message: 'Grandpa is reading at the library and left his keys and his water bottle in our hallway. Please take them to him. He wears a brown flat cap and a brown waistcoat.',
          arrive: 'You will reach the library.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 4 }, { turn: 'left' }, { go: 7 }],
        steps: [
          { do: 'collect', items: ['keys', 'water-bottle'], scene: { room: 'hallway' } },
          { do: 'give', target: 'n3', items: ['keys', 'water-bottle'], to: 'grandpa', scene: { backdrop: 'library', options: ['grandpa', 'librarian', 'gardener', 'postman', 'boy'] } }
        ],
        scoring: null
      },
      {
        id: 13,
        title: 'The middle house',
        map: 'town-2',
        letter: 'scroll',
        time: 22,
        fog: false,
        start: { x: 1, y: 1, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { m2: 'grandmaHouse' },
        briefing: {
          title: 'Come for tea',
          from: 'Grandma',
          message: 'Come and have tea with me! I live in the middle one of the three green houses. I have white curly hair and a walking stick.',
          arrive: 'You will reach Grandma\u2019s house.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 'junction', n: 1 }, { go: 2 }],
        steps: [
          { do: 'meet', target: 'm2', to: 'grandma', scene: { backdrop: 'hallway', options: ['grandma', 'librarian', 'shopkeeper', 'nurse', 'girl'] } }
        ],
        scoring: null
      },
      {
        id: 14,
        title: 'Wrong way!',
        map: 'town-2',
        letter: 'note',
        time: 20,
        fog: false,
        start: { x: 13, y: 13, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { d2: 'bakery' },
        briefing: {
          title: 'Fresh bread',
          from: 'Dad',
          message: 'You are facing the wrong way! Turn around first, then go to the bakery for some fresh bread.',
          arrive: 'You will reach the bakery.'
        },
        route: [{ turn: 'around' }, { go: 2 }, { turn: 'right' }, { go: 4 }, { turn: 'right' }, { go: 2 }],
        steps: [{ do: 'reach', target: 'd2' }],
        scoring: null
      },
      {
        id: 15,
        title: 'Through the park',
        map: 'town-2',
        letter: 'letter',
        time: 28,
        fog: 4,
        start: { x: 1, y: 11, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { fountain1: 'fountain', d3: 'friendHouse' },
        briefing: {
          title: 'Come and play',
          from: 'Your friend',
          message: 'Come to my house to play! It is a little misty today, so follow my directions carefully. We go through the park by the fountain.',
          arrive: 'You will reach your friend\u2019s house.'
        },
        route: [{ go: 'until', at: 'fountain1' }, { turn: 'right' }, { go: 2 }, { turn: 'left' }, { go: 2 }, { turn: 'right' }, { go: 2 }, { turn: 'left' }, { go: 2 }],
        steps: [{ do: 'reach', target: 'd3' }],
        scoring: null
      },
      {
        id: 16,
        title: 'Two books',
        map: 'town-2',
        letter: 'official',
        time: 34,
        fog: false,
        start: { x: 12, y: 5, facing: 'left' },
        controls: 'arrows',
        tip: false,
        identities: { n3: 'library', s1: 'school' },
        briefing: {
          title: 'Books for the class',
          from: 'The librarian',
          message: 'The teacher has asked for a blue book and a red book. You are outside the library: please come in, find them, and take them to the teacher at the school. She wears glasses and a yellow cardigan.',
          arrive: 'You will reach the school.'
        },
        route: [{ go: 7 }, { turn: 'left' }, { go: 6 }, { turn: 'right' }, { go: 2 }],
        steps: [
          { do: 'collect', at: 'n3', items: ['book-blue', 'book-red'], scene: { room: 'library' } },
          { do: 'give', target: 's1', items: ['book-blue', 'book-red'], to: 'teacher', scene: { backdrop: 'classroom', options: ['teacher', 'librarian', 'nurse', 'shopkeeper', 'girl'] } }
        ],
        scoring: null
      },
      {
        id: 17,
        title: 'The toy shop',
        map: 'town-2',
        letter: 'scroll',
        time: 24,
        fog: 4,
        start: { x: 17, y: 15, facing: 'left' },
        controls: 'arrows',
        tip: false,
        identities: { s2: 'toyShop' },
        briefing: {
          title: 'A birthday present',
          from: 'Your aunt',
          message: 'Please buy a present for your cousin at the toy shop. There are two red shops in Riverside: the toy shop is the one next to the river.',
          arrive: 'You will reach the toy shop.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 4 }, { turn: 'left' }, { go: 5 }],
        steps: [{ do: 'reach', target: 's2' }],
        scoring: null
      },
      {
        id: 18,
        title: 'Over the bridge',
        map: 'town-2',
        letter: 'letter',
        time: 36,
        fog: false,
        start: { x: 9, y: 15, facing: 'up' },
        controls: 'arrows',
        tip: false,
        identities: { m4: 'garage' },
        vehicles: [
          { key: 'carRed', look: 'car-red', x: 8, y: 16, facing: 'right' },
          { key: 'carBlue', look: 'car-blue', x: 10, y: 16, facing: 'right' },
          { key: 'carGreen', look: 'car-green', x: 12, y: 16, facing: 'right' }
        ],
        briefing: {
          title: 'Spare keys',
          from: 'Dad',
          message: 'The mechanic at the garage needs the spare keys for my blue car. Please find my keys in the living room, then drive the blue car over the bridge and give the keys to the mechanic. He wears orange overalls.',
          arrive: 'You will reach the garage.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 4 }, { turn: 'left' }, { go: 6 }, { turn: 'right' }, { go: 3 }],
        steps: [
          { do: 'collect', item: 'keys', scene: { room: 'living-room' } },
          { do: 'enter', target: 'carBlue' },
          { do: 'give', target: 'm4', item: 'keys', to: 'mechanic', scene: { backdrop: 'garage', options: ['mechanic', 'postman', 'gardener', 'grandpa', 'boy'] } }
        ],
        scoring: null
      },
      {
        id: 19,
        title: 'Three things',
        map: 'town-2',
        letter: 'note',
        time: 36,
        fog: false,
        start: { x: 13, y: 5, facing: 'down' },
        controls: 'arrows',
        tip: false,
        identities: { d1: 'grandmaHouse' },
        briefing: {
          title: 'A sleepover at Grandma\u2019s',
          from: 'Mum',
          message: 'Grandma has moved to the brown house by the park. Please take her three things from your bedroom for your sleepover: the umbrella, your teddy bear and the red book.',
          arrive: 'You will reach Grandma\u2019s house.'
        },
        route: [{ go: 6 }, { take: 'Park Lane', turn: 'right' }, { go: 'junction', n: 2 }, { turn: 'left' }, { go: 'junction', n: 2 }, { turn: 'right' }, { go: 6 }],
        steps: [
          { do: 'collect', items: ['umbrella', 'teddy-bear', 'book-red'], scene: { room: 'bedroom' } },
          { do: 'give', target: 'd1', items: ['umbrella', 'teddy-bear', 'book-red'], to: 'grandma', scene: { backdrop: 'hallway', options: ['grandma', 'grandpa', 'librarian', 'nurse', 'girl'] } }
        ],
        scoring: null
      },
      {
        id: 20,
        title: 'Lunch for the doctor',
        map: 'town-2',
        letter: 'official',
        time: 40,
        fog: 4,
        start: { x: 1, y: 1, facing: 'right' },
        controls: 'arrows',
        tip: false,
        identities: { s4: 'hospital' },
        briefing: {
          title: 'A busy day',
          from: 'Mum',
          message: 'Dr Ade is working late and left his lunchbox and his water bottle in our kitchen. Please take them to him at the hospital. He wears a white coat. It is misty, so read carefully!',
          arrive: 'You will reach the hospital.'
        },
        route: [{ go: 4 }, { turn: 'right' }, { go: 4 }, { turn: 'left' }, { go: 'junction', n: 2 }, { turn: 'right' }, { go: 6 }, { turn: 'left' }, { go: 2 }],
        steps: [
          { do: 'collect', items: ['lunchbox', 'water-bottle'], scene: { room: 'kitchen' } },
          { do: 'give', target: 's4', items: ['lunchbox', 'water-bottle'], to: 'doctor', scene: { backdrop: 'hospital', options: ['doctor', 'nurse', 'mechanic', 'grandpa', 'boy'] } }
        ],
        scoring: null
      }
    ]
  };
})();
