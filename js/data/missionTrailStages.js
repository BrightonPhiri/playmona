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
     message, arrive }, route (the letter's directions, as
     { go: n } / { turn: 'left'|'right' }), steps ([{ do, ... }]),
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
      busStop: 'Bus stop'
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
      }
    ]
  };
})();
