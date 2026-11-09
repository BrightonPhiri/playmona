/* ============================================================
   PLAYMONA — crossword/dev.js
   Dev rooms only (FF.Storage.set('devRooms', true)): there is no
   server, so the host's tab does what the API and the crew runner
   do on the live site and runs the same referee
   (js/crossword/referee.js) on the dev transport. Loaded on demand
   by crossword/client.js, never by play.html.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CrosswordRules;
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
    if (present.length < R.MIN_PLAYERS) return Promise.reject(new Error(FF.t('cwNeedTwo', 'Mini Crossword online needs at least 2 players.')));
    if (present.length > R.MAX_PLAYERS) return Promise.reject(new Error(FF.t('cwTooMany', 'Mini Crossword takes at most 8 players.')));
    var settings = R.sanitize(pick.settings);
    var T = room.transport;
    var startAt = T.serverNow() + 10000;
    var matchId = 'x_dev' + randomInt(1e9).toString(36);
    var run = { matchId: matchId, roomCode: room.code, hostUid: room.uid, seats: present.map(function (p) { return p.uid; }), settings: settings, startAt: startAt, seed: randomInt(2147483647) };
    if (running) running.stop();
    return Promise.all([T.set('rounds', null), T.set('cw', null), T.set('cwInbox', null)]).then(function () {
      return T.update('meta', {
        seed: FF.Random.newSeed(), gameId: 'miniCrossword', status: 'playing', startAt: startAt,
        endedAt: null, results: null, pick: null, settings: settings, cwMatch: matchId
      });
    }).then(function () {
      var saved = null;
      running = FF.CrosswordReferee.create({
        run: run, room: T,
        store: { load: function () { return Promise.resolve(saved); }, save: function (s) { saved = s; return Promise.resolve(); } },
        randomInt: randomInt,
        log: function (m) { if (window.console) console.log('[Crossword dev referee] ' + m); },
        onEnd: function () { running = null; }
      });
      return running.start().then(function () { return { matchId: matchId, startAt: startAt }; });
    });
  }

  FF.CrosswordDev = { start: start, running: function () { return running; } };
})();
