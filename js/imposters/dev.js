/* ============================================================
   PLAYMONA — imposters/dev.js
   Dev rooms only (FF.Storage.set('devRooms', true)): there is no
   server, so the host's tab does what the API and the crew runner
   do on the live site. It checks the room, deals the secrets and
   runs the same referee (js/imposters/referee.js) on the dev
   transport. Secrets are NOT private here: every tab of this
   browser can read them. Loaded on demand by games/imposters.js,
   never by play.html.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;
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
    var n = present.length;
    if (n < R.MIN_PLAYERS) return Promise.reject(new Error(FF.t('impNeedThree', 'Imposters needs at least 3 players. The game will use 1 imposter.')));
    var settings = R.sanitizeSettings(pick.settings, n);
    var T = room.transport;
    var now = T.serverNow();
    var matchId = 'i_dev' + randomInt(1e9).toString(36);
    var startAt = now + 10000;
    var pairs = (FF.ImpostersDevPairs || {})[settings.difficulty] || [];
    var pair = settings.mode === 'word' ? pairs[randomInt(pairs.length)] : null;
    if (settings.mode === 'word' && !pair) return Promise.reject(new Error('No dev word pairs (tools/dev/imposterPairs.js).'));
    var run = {
      matchId: matchId, roomCode: room.code, hostUid: room.uid,
      seats: present.map(function (p) { return p.uid; }), crew: {},
      settings: settings, pair: pair, startAt: startAt
    };
    if (running) running.stop();
    return Promise.all([T.set('rounds', null), T.set('imp', null), T.set('impInbox', null), T.set('chat', null)]).then(function () {
      return T.update('meta', {
        seed: FF.Random.newSeed(), gameId: 'imposters', status: 'playing', startAt: startAt,
        endedAt: null, results: null, pick: null, settings: settings, impMatch: matchId
      });
    }).then(function () {
      return FF.Transport.open('imposterSecrets/' + room.code, true);
    }).then(function (sec) {
      var saved = null;
      running = FF.ImpostersReferee.create({
        run: run, room: T,
        secrets: {
          set: function (uid, v) { return sec.set(uid, v); },
          update: function (uid, v) { return sec.update(uid, v); },
          clear: function () { return sec.set('', null); }
        },
        store: { load: function () { return Promise.resolve(saved); }, save: function (s) { saved = s; return Promise.resolve(); } },
        randomInt: randomInt,
        isQuiet: FF.Words && FF.Words.isQuiet ? function (w) { return FF.Words.isQuiet(w); } : null,
        log: function (m) { if (window.console) console.log('[Imposters dev referee] ' + m); },
        onEnd: function () { running = null; }
      });
      return running.start().then(function () { return { matchId: matchId, startAt: startAt }; });
    });
  }

  FF.ImpostersDev = { start: start, running: function () { return running; } };
})();
