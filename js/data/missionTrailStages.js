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
     scoring (null = default weights).
   identityNames: the name shown once a place is revealed.
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
      fountain: 'Fountain'
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
      }
    ]
  };
})();
