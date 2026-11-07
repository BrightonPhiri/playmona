/* ============================================================
   PLAYMONA — sortrush/dev.js
   Dev rooms only (FF.Storage.set('devRooms', true)): there is no
   server, so the host's tab does what the API and the crew runner
   do on the live site. It checks the room and runs the same
   referee (js/sortrush/referee.js) on the dev transport. Loaded on
   demand by sortrush/client.js, never by play.html.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SortRushRules;
  var running = null;

  function randomInt(n) {
    var c = window.crypto;
    if (c && c.getRandomValues) {
      var max = Math.floor(4294967296 / n) * n;
      var buf = new Uint32Array(1);
      do { c.getRandomValues(buf); } while (buf[0] >= max);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function start(room, pick) {
    var present = FF.Room.presentPlayers();
    if (present.length < R.MIN_PLAYERS) return Promise.reject(new Error(FF.t('srNeedTwo', 'SortRush online needs at least 2 players.')));
    if (present.length > R.MAX_PLAYERS) return Promise.reject(new Error(FF.t('srTooMany', 'SortRush takes at most 8 players.')));
    var settings = R.sanitize(pick.settings);
    var T = room.transport;
    var now = T.serverNow();
    var matchId = 's_dev' + randomInt(1e9).toString(36);
    var startAt = now + 10000;
    var run = {
      matchId: matchId, roomCode: room.code, hostUid: room.uid,
      seats: present.map(function (p) { return p.uid; }), settings: settings, startAt: startAt
    };
    if (running) running.stop();
    return Promise.all([T.set('rounds', null), T.set('sr', null), T.set('srInbox', null)]).then(function () {
      return T.update('meta', {
        seed: FF.Random.newSeed(), gameId: 'sortRush', status: 'playing', startAt: startAt,
        endedAt: null, results: null, pick: null, settings: settings, srMatch: matchId
      });
    }).then(function () {
      var saved = null;
      running = FF.SortRushReferee.create({
        run: run, room: T,
        store: { load: function () { return Promise.resolve(saved); }, save: function (s) { saved = s; return Promise.resolve(); } },
        randomInt: randomInt,
        log: function (m) { if (window.console) console.log('[SortRush dev referee] ' + m); },
        onEnd: function () { running = null; }
      });
      return running.start().then(function () { return { matchId: matchId, startAt: startAt }; });
    });
  }

  FF.SortRushDev = { start: start, running: function () { return running; } };
})();
