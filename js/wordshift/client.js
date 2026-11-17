/* ============================================================
   PLAYMONA — wordshift/client.js
   A phone's side of an online WordShift Race. It follows the
   shared view (rooms/<code>/ws: the puzzle and everyone's counts)
   and this player's own words (wordshiftMine/<code>/<uid>, readable
   by this player alone; the room itself is open to any signed-in player), and sends each move to the referee through
   rooms/<code>/wsInbox/<uid>/<id>. The referee decides what counts.

     var c = FF.WordShiftClient.create({ room: { transport, uid, code }, onChange, openMine? });
     c.view()      -> { ws, mine, uid, seated, me, pending }
     c.send(word)  -> true if sent; false if not now (one move at a time)
     c.stop()
     FF.WordShiftClient.ready(ws) -> has this phase arrived in full?

   Also FF.WordShiftOnlineApi.start(room, pick) / nudge(code): the
   server (POST /api/wordshift/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordShiftRules;
  var PENDING_MS = 6000;   // a move the referee never answered stops blocking the next one

  /* Not FF.util.uid: in a room that draws from the room's seeded random. */
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
  function tidy(ws) {
    if (!ws || !ws.settings) return null;
    ws.order = list(ws.order);
    ws.p = ws.p || {};
    ws.settings = R.sanitizeRoom(ws.settings);
    if (typeof ws.k !== 'number') ws.k = -1;
    if (ws.result) { ws.result.rows = list(ws.result.rows); ws.result.winners = list(ws.result.winners); }
    if (ws.last) ws.last.results = ws.last.results || {};
    return ws;
  }
  function tidyMine(m) {
    if (!m || typeof m.word !== 'string') return null;
    m.used = list(m.used);
    return m;
  }

  /* A view can land in pieces (the dev transport delivers a write field by field). */
  function ready(ws) {
    if (!ws || !ws.settings || typeof ws.phase !== 'string') return false;
    if (ws.phase === 'starting') return true;
    if (ws.phase === 'ended') return !!(ws.result && ws.result.rows);
    var pz = ws.puzzle;
    if (!pz || typeof pz.s !== 'string' || typeof pz.t !== 'string' || pz.s.length !== pz.t.length) return false;
    if (ws.phase === 'reveal') return !!(ws.last && ws.last.k === ws.k && ws.last.results);
    return ws.phase === 'ready' || ws.phase === 'open';
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var ws = null, mine = null, stopped = false;
    var pending = null;   // { word, k, at }

    function changed() { if (!stopped) onChange(); }
    function release() { pending = null; }
    function onMine(v) {
        var m = tidyMine(v || null);
        // The referee answered the move in flight (or moved on to another round).
        if (pending && m && (m.k !== pending.k || (m.last && m.last.word === pending.word))) release();
        mine = m;
        changed();
    }
    var offs = [
      T.watch('ws', function (v) {
        ws = tidy(v || null);
        if (pending && (!ws || ws.k !== pending.k || ws.phase !== 'open')) release();
        changed();
      })
    ];
    // Rooted at the room's private words but only ever reading this player's own key
    // (Firebase's rules refuse the rest; the dev transport keeps one document per root).
    var opener = opts.openMine || function () { return FF.Transport.open('wordshiftMine/' + room.code); };
    var mineT = null;
    Promise.resolve(opener()).then(function (mt) {
      if (stopped) { if (mt && mt.close) mt.close(); return; }
      mineT = mt;
      offs.push(mt.watch(uid, onMine));
    }).catch(function (e) { if (window.console) console.error('[WordShift] my words', e); });

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function send(raw) {
      if (stopped || !ws || !ws.p[uid] || ws.phase !== 'open' || !ready(ws)) return false;
      if (!mine || mine.matchId !== ws.matchId || mine.k !== ws.k || mine.done) return false;
      if (pending && T.serverNow() - pending.at < PENDING_MS) return false;
      if (T.serverNow() > ws.closeAt + 500) return false;
      var word = R.clean(raw);
      if (word.length !== mine.word.length || word === mine.word) return false;
      pending = { word: word, k: ws.k, at: T.serverNow() };
      var cmd = { matchId: ws.matchId, k: ws.k, word: word, t: stamp() };
      T.set('wsInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the player try again.
        if (pending && pending.word === word) release();
        changed();
      });
      return true;
    }

    return {
      uid: uid,
      view: function () {
        var me = ws && ws.p[uid] || null;
        var own = mine && ws && mine.matchId === ws.matchId && mine.k === ws.k ? mine : null;
        return { ws: ws, mine: own, uid: uid, seated: !!me, me: me, pending: pending ? pending.word : null };
      },
      send: send,
      serverNow: function () { return T.serverNow(); },
      stop: function () {
        stopped = true;
        offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
        offs = [];
        if (mineT && mineT.close && !opts.openMine) { try { mineT.close(); } catch (e) { /* gone */ } }
      }
    };
  }

  /* ---------- the server ---------- */

  function t(key, fallback) { return FF.t ? FF.t(key, fallback) : fallback; }

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

  /* Dev rooms have no server: the host tab referees (js/wordshift/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.WordShiftDev) return Promise.resolve(FF.WordShiftDev);
    return ['js/wordshift/referee.js', 'js/wordshift/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.WordShiftDev; });
  }

  FF.WordShiftOnlineApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/wordshift/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/wordshift/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.WordShiftClient = { create: create, tidy: tidy, ready: ready, PENDING_MS: PENDING_MS };
})();
