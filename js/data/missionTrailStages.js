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
     scene = { backdrop: scenes id, options: [object or character ids] }.
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
      shop: 'Shop'
    },

    objectNames: {
      'red-cap': 'Red cap', 'blue-cap': 'Blue cap', 'green-cap': 'Green cap', 'medical-bag': 'Medical bag',
      newspaper: 'Newspaper', keys: 'Keys', 'book-blue': 'Blue book', 'book-red': 'Red book',
      umbrella: 'Umbrella', 'teddy-bear': 'Teddy bear', 'water-bottle': 'Water bottle', watch: 'Watch'
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
          { do: 'collect', item: 'red-cap', scene: { backdrop: 'bedroom', options: ['red-cap', 'blue-cap', 'green-cap', 'teddy-bear', 'book-blue', 'watch'] } },
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
          { do: 'collect', item: 'medical-bag', scene: { backdrop: 'hallway', options: ['medical-bag', 'umbrella', 'keys', 'water-bottle', 'newspaper', 'book-red'] } },
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
          { do: 'collect', item: 'newspaper', scene: { backdrop: 'kitchen', options: ['newspaper', 'book-blue', 'keys', 'umbrella', 'water-bottle', 'watch'] } },
          { do: 'enter', target: 'carRed' },
          { do: 'give', target: 'b1', item: 'newspaper', to: 'postman', scene: { backdrop: 'post-office', options: ['postman', 'mechanic', 'shopkeeper', 'grandpa', 'boy'] } }
        ],
        scoring: null
      }
    ]
  };
})();
