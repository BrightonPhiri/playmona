/* ============================================================
   PLAYMONA — ballswap/client.js
   A phone's side of an online Ball Swap match: follows the public
   view (rooms/<code>/bs) and sends swaps to the referee through
   rooms/<code>/bsInbox/<uid>/<id>. The referee decides everything
   that counts: whether a swap was right, mistakes, knock-outs,
   finishing times and the winner.

   So that a swap feels instant, the phone runs the same rules
   (FF.BallSwapRules) on its own copy of the board and shows the
   result straight away. The referee's answer always wins: when
   it has handled every swap this phone sent, the phone's board
   becomes the referee's board again.

     var c = FF.BallSwapClient.create({ room: FF.Room.current(), onChange });
     c.view()  -> { bs, uid, seated, me (the referee's row), board, mistakes, swaps, pending }
     c.swap(aId, bId) -> 'ok' | 'wrong' | 'stale' | null (not now)
     c.stop()

   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.BallSwapRules;

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

  /* Firebase turns arrays into objects and drops empty ones: put them back. */
  function tidy(bs) {
    if (!bs || !bs.puzzle) return null;
    var pz = bs.puzzle;
    pz.colours = list(pz.colours);
    pz.balls = list(pz.balls);
    pz.a = list(pz.a);
    pz.b = list(pz.b);
    pz.target = pz.target || {};
    bs.order = list(bs.order);
    bs.p = bs.p || {};
    Object.keys(bs.p).forEach(function (uid) {
      var r = bs.p[uid] || {};
      r.a = list(r.a);
      r.b = list(r.b);
      bs.p[uid] = r;
    });
    bs.settings = R.sanitize(bs.settings);
    return bs;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var bs = null;
    var offs = [];
    var stopped = false;
    // The phone's guess, ahead of the referee: its board and counts after the swaps still on their way.
    var mine = null;      // { matchId, board, n (next move number), swaps, mistakes }

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function resync(force) {
      if (!bs) { mine = null; return; }
      var row = bs.p[uid];
      if (!row) { mine = null; return; }
      if (!mine || mine.matchId !== bs.matchId) {
        mine = { matchId: bs.matchId, board: { a: row.a.slice(), b: row.b.slice() }, n: row.n || 0, swaps: row.swaps || 0, mistakes: row.mistakes || 0 };
        return;
      }
      // Every swap this phone sent has been handled: the referee's board is the board.
      if (force || (row.n || 0) >= mine.n) {
        mine.board = { a: row.a.slice(), b: row.b.slice() };
        mine.n = Math.max(mine.n, row.n || 0);
        mine.swaps = row.swaps || 0;
        mine.mistakes = row.mistakes || 0;
      }
    }

    offs.push(T.watch('bs', function (v) {
      bs = tidy(v || null);
      resync(false);
      if (!stopped) onChange();
    }));

    function canPlay() {
      if (!bs || !mine || bs.phase !== 'playing') return false;
      var row = bs.p[uid];
      if (!row || row.done || row.out) return false;
      var close = bs.closeAt ? Math.min(bs.closeAt, bs.deadline) : bs.deadline;
      return T.serverNow() < close + 500;
    }

    /* Check the swap on this phone (for the animation), and send it to the referee. */
    function swap(aId, bId) {
      if (stopped || !canPlay()) return null;
      var verdict = R.check(bs.puzzle, mine.board, aId, bId);
      if (verdict === 'stale') return 'stale';
      var n = mine.n++;
      if (verdict === 'ok') {
        mine.board = R.apply(mine.board, aId, bId);
        mine.swaps++;
      } else {
        mine.mistakes++;
      }
      var cmd = { type: 'swap', matchId: bs.matchId, n: n, a: aId, b: bId, t: stamp() };
      T.set('bsInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: take the referee's board back.
        resync(true);
        if (!stopped) onChange();
      });
      return verdict;
    }

    function view() {
      var row = bs && bs.p ? bs.p[uid] || null : null;
      return {
        bs: bs,
        uid: uid,
        seated: !!row,
        me: row,
        board: mine ? mine.board : null,
        swaps: mine ? mine.swaps : 0,
        mistakes: mine ? mine.mistakes : 0,
        pending: !!(mine && row && (row.n || 0) < mine.n)
      };
    }

    function stop() {
      stopped = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    return { view: view, swap: swap, stop: stop, canPlay: canPlay, serverNow: function () { return T.serverNow(); } };
  }

  /* ---------- the server (POST /api/ballswap/*) ---------- */

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function idToken() {
    if (!window.firebase || !firebase.auth) return Promise.reject(new Error(t('bsSignIn', 'Please sign in to play online.')));
    var u = firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error(t('bsSignIn', 'Please sign in to play online.')));
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
        if (!res.ok) throw new Error(data.message || t('bsServerDown', 'The game server is not answering. Please try again.'));
        return data;
      });
    });
  }

  function dev() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  /* Dev rooms have no server: the host tab referees (js/ballswap/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.BallSwapDev) return Promise.resolve(FF.BallSwapDev);
    var files = ['js/ballswap/referee.js', 'js/ballswap/dev.js'];
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
    }, Promise.resolve()).then(function () { return FF.BallSwapDev; });
  }

  FF.BallSwapApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/ballswap/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/ballswap/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.BallSwapClient = { create: create, tidy: tidy };
})();
