/* ============================================================
   PLAYMONA — wordflow/dev.js
   Dev rooms only (FF.Storage.set('devRooms', true)): there is no
   server, so the host's tab does what the API and the crew runner
   do on the live site. It checks the room and runs the same
   referee (js/wordflow/referee.js) on the dev transport. With no
   API there is no AI judge here: the built-in rules judge every
   sentence. Loaded on demand by wordflow/client.js, never by
   play.html.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordFlowRules;
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
    if (present.length < R.MIN_PLAYERS) return Promise.reject(new Error(FF.t('wfNeedTwo', 'WordFlow needs at least 2 players.')));
    var settings = R.sanitizeSettings(pick.settings);
    var T = room.transport;
    var now = T.serverNow();
    var matchId = 'w_dev' + randomInt(1e9).toString(36);
    var startAt = now + 10000;
    var run = {
      matchId: matchId, roomCode: room.code, hostUid: room.uid,
      seats: present.map(function (p) { return p.uid; }), crew: {}, settings: settings, startAt: startAt
    };
    if (running) running.stop();
    return Promise.all([T.set('rounds', null), T.set('wf', null), T.set('wfInbox', null)]).then(function () {
      return T.update('meta', {
        seed: FF.Random.newSeed(), gameId: 'wordFlow', status: 'playing', startAt: startAt,
        endedAt: null, results: null, pick: null, settings: settings, wfMatch: matchId
      });
    }).then(function () {
      var saved = null;
      var words = FF.Words;
      if (words && words.load) { try { words.load(); } catch (e) { /* the referee checks words once it loads */ } }
      running = FF.WordFlowReferee.create({
        run: run, room: T,
        store: { load: function () { return Promise.resolve(saved); }, save: function (s) { saved = s; return Promise.resolve(); } },
        judge: function () { return Promise.resolve(null); },
        randomInt: randomInt,
        isWord: words && words.isWord ? function (w) { return !words.ready() || words.isWord(w); } : null,
        isQuiet: words && words.isQuiet ? function (w) { return words.isQuiet(w); } : null,
        log: function (m) { if (window.console) console.log('[WordFlow dev referee] ' + m); },
        onEnd: function () { running = null; }
      });
      return running.start().then(function () { return { matchId: matchId, startAt: startAt }; });
    });
  }

  FF.WordFlowDev = { start: start, running: function () { return running; } };
})();
