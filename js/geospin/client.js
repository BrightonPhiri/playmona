/* ============================================================
   PLAYMONA — geospin/client.js
   A phone's side of an online GeoSpin match: follows the public
   view (rooms/<code>/gs) and sends this player's answer for the
   round to the referee through rooms/<code>/gsInbox/<uid>/<id>.
   The referee decides everything that counts: whether the answer
   is right, how fast it was, the points and the winner.

     var c = FF.GeoSpinClient.create({ room: FF.Room.current(), onChange });
     c.view()        -> { gs, uid, seated, me }
     c.send(text)    -> true if sent (one answer per round), false if not now
     c.stop()

   Also FF.GeoSpinApi.start(room, pick) / nudge(code): the server
   (POST /api/geospin/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.GeoSpinRules;

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
  function tidy(gs) {
    if (!gs || !gs.settings) return null;
    gs.order = list(gs.order);
    gs.p = gs.p || {};
    gs.settings = R.sanitize(gs.settings);
    if (gs.result) gs.result.rows = list(gs.result.rows);
    if (typeof gs.k !== 'number') gs.k = -1;
    return gs;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var gs = null, stopped = false, sent = {};
    var offs = [T.watch('gs', function (v) { gs = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function send(text) {
      if (stopped || !gs || !gs.p[uid] || gs.phase !== 'open') return false;
      var key = gs.matchId + '|' + gs.k;
      if (sent[key] || gs.p[uid].inK === gs.k) return false;
      if (T.serverNow() > gs.closeAt + 500) return false;
      sent[key] = true;
      var cmd = { type: 'answer', matchId: gs.matchId, k: gs.k, text: String(text || '').slice(0, 60), t: stamp() };
      T.set('gsInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the player try again while the round is open.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    return {
      uid: uid,
      view: function () { return { gs: gs, uid: uid, seated: !!(gs && gs.p[uid]), me: gs && gs.p[uid] || null }; },
      send: send,
      serverNow: function () { return T.serverNow(); },
      stop: function () {
        stopped = true;
        offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
        offs = [];
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

  /* Dev rooms have no server: the host tab referees (js/geospin/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.GeoSpinDev) return Promise.resolve(FF.GeoSpinDev);
    return ['js/geospin/referee.js', 'js/geospin/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.GeoSpinDev; });
  }

  FF.GeoSpinApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/geospin/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/geospin/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.GeoSpinClient = { create: create, tidy: tidy };
})();
