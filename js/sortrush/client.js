/* ============================================================
   PLAYMONA — sortrush/client.js
   A phone's side of an online SortRush match: follows the public
   view (rooms/<code>/sr) and sends commands to the referee through
   rooms/<code>/srInbox/<uid>/<id>. The referee decides everything
   that counts: which moves were legal, scores, finishing times
   and the winner.

   So that a move feels instant, the phone runs the same rules
   (FF.SortRushRules.step) on its own copy of its board and shows
   the result straight away. The referee's answer always wins:
   when it has handled every command this phone sent, the phone's
   board becomes the referee's board again.

     var c = FF.SortRushClient.create({ room: FF.Room.current(), onChange });
     c.view()  -> { sr, uid, seated, me (the referee's row), player (this phone's guess), pending }
     c.send({ type: 'move', from, to } | { type: 'undo' } | ...) -> step result, or null (not now)
     c.stop()

   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SortRushRules;

  /* Not FF.util.uid: in a room that draws from the room's seeded random,
     so every phone would make the same ids. */
  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(12)));
    else for (var i = 0; i < 12; i++) bytes.push(Math.floor(Math.random() * 256));
    return 'c' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function unpackBoard(s) { return typeof s === 'string' ? s.split(',') : list(s); }
  function unpackHist(s) {
    if (!s) return [];
    return String(s).split(';').map(function (m) { return m.split('.').map(Number); });
  }

  /* A referee row as a player state the rules can run on. */
  function playerOf(row) {
    return {
      k: row.k || 0, b: unpackBoard(row.b), start: unpackBoard(row.s), par: row.par || 0, limit: row.limit || 0,
      pm: row.pm || 0, hist: unpackHist(row.h), n: row.n || 0, moves: row.moves || 0, best: row.best || 0,
      score: row.score || 0, cleared: row.cleared || 0, done: !!row.done, out: !!row.out,
      doneAt: row.doneAt || 0, used: row.used || 0, at: row.at || 0, lastAt: 0,
      peakC: row.peakC || 0, peakS: row.peakS || 0, peakAt: 0
    };
  }

  /* Firebase turns arrays into objects and drops empty ones: put them back. */
  function tidy(sr) {
    if (!sr || !sr.settings) return null;
    sr.order = list(sr.order);
    sr.p = sr.p || {};
    sr.settings = R.sanitize(sr.settings);
    return sr;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var sr = null;
    var offs = [];
    var stopped = false;
    // The phone's guess, ahead of the referee: its player state after the commands still on their way.
    var mine = null;      // { matchId, p }
    var resets = 0;       // bumps whenever the referee's board replaced the guess

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function resync(force) {
      if (!sr) { mine = null; return; }
      var row = sr.p[uid];
      if (!row) { mine = null; return; }
      if (!mine || mine.matchId !== sr.matchId) {
        mine = { matchId: sr.matchId, p: playerOf(row) };
        resets++;
        return;
      }
      // Every command this phone sent has been handled: the referee's board is the board.
      if (force || (row.n || 0) >= mine.p.n) {
        var before = mine.p.k + '|' + mine.p.b.join(',');
        mine.p = playerOf(row);
        if (before !== mine.p.k + '|' + mine.p.b.join(',')) resets++;
      }
    }

    offs.push(T.watch('sr', function (v) {
      sr = tidy(v || null);
      resync(false);
      if (!stopped) onChange();
    }));

    function closeAt() { return sr.closeAt ? Math.min(sr.closeAt, sr.deadline) : sr.deadline; }

    function canPlay() {
      if (!sr || !mine || sr.phase !== 'playing') return false;
      var row = sr.p[uid];
      if (!row || row.done || row.out || mine.p.done || mine.p.out) return false;
      return T.serverNow() < closeAt();
    }

    /* Run the command on this phone (for the animation) and send it to the referee. */
    function send(cmd) {
      if (stopped || !canPlay()) return null;
      var n = mine.p.n;
      var k = mine.p.k;
      var t = T.serverNow();
      var res = R.step(sr.settings, mine.p, { type: cmd.type, from: cmd.from, to: cmd.to, k: k }, t, sr.openAt, function (next) {
        return R.deal(sr.settings, sr.seed, next);
      });
      if (!res.ok) return res;                 // refused here: nothing is sent, nothing changes
      var out = {
        type: cmd.type, matchId: sr.matchId, n: n, k: k,
        f: typeof cmd.from === 'number' ? cmd.from : -1, to: typeof cmd.to === 'number' ? cmd.to : -1, t: stamp()
      };
      T.set('srInbox/' + uid + '/' + cmdId(), out).catch(function () {
        // Never reached the referee: take the referee's board back.
        resync(true);
        if (!stopped) onChange();
      });
      return res;
    }

    function view() {
      var row = sr && sr.p ? sr.p[uid] || null : null;
      return {
        sr: sr,
        uid: uid,
        seated: !!row,
        me: row,
        player: mine ? mine.p : null,
        resets: resets,
        pending: !!(mine && row && (row.n || 0) < mine.p.n)
      };
    }

    function stop() {
      stopped = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    return { view: view, send: send, stop: stop, canPlay: canPlay, serverNow: function () { return T.serverNow(); } };
  }

  /* ---------- the server (POST /api/sortrush/*) ---------- */

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function idToken() {
    if (!window.firebase || !firebase.auth) return Promise.reject(new Error(t('srSignIn', 'Please sign in to play online.')));
    var u = firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error(t('srSignIn', 'Please sign in to play online.')));
    return u.getIdToken();
  }

  function api(path, body) {
    return idToken().then(function (tok) {
      return fetch('/api' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || t('srServerDown', 'The game server is not answering. Please try again.'));
        return data;
      });
    });
  }

  function dev() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  /* Dev rooms have no server: the host tab referees (js/sortrush/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.SortRushDev) return Promise.resolve(FF.SortRushDev);
    var files = ['js/sortrush/referee.js', 'js/sortrush/dev.js'];
    return files.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.SortRushDev; });
  }

  FF.SortRushApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/sortrush/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/sortrush/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.SortRushClient = { create: create, tidy: tidy, playerOf: playerOf };
})();
