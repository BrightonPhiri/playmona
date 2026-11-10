/* ============================================================
   PLAYMONA — saywhat/client.js
   A phone's side of an online Say What? Race: follows the public
   view (rooms/<code>/sw) and sends this player's answer for the
   saying to the referee through rooms/<code>/swInbox/<uid>/<id>.
   The referee decides everything that counts: whether the answer
   is right, how fast it was, the points and the winner.

     var c = FF.SayWhatClient.create({ room: FF.Room.current(), onChange });
     c.view()        -> { sw, uid, seated, me }
     c.send(text)    -> true if sent (one answer per saying), false if not now
     c.stop()
     FF.SayWhatClient.ready(sw)  -> has this phase arrived in full?

   Also FF.SayWhatApi.start(room, pick) / nudge(code): the server
   (POST /api/saywhat/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SayWhatRules;

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

  /* Firebase turns arrays into objects and drops empty ones: put them back. The referee sends
     choices and tiles as strings (they can never arrive in pieces); the screen wants lists. */
  function tidy(sw) {
    if (!sw || !sw.settings) return null;
    sw.order = list(sw.order);
    sw.p = sw.p || {};
    sw.settings = R.sanitizeRoom(sw.settings);
    if (sw.result) sw.result.rows = list(sw.result.rows);
    if (sw.last) { sw.last.gaps = list(sw.last.gaps); sw.last.results = sw.last.results || {}; }
    if (typeof sw.k !== 'number') sw.k = -1;
    var rd = sw.round;
    if (rd) {
      if (typeof rd.choices === 'string') rd.choices = rd.choices ? rd.choices.split('|') : [];
      rd.words = list(rd.words);
      if (typeof rd.tiles === 'string') rd.tiles = rd.tiles.split('');
    }
    return sw;
  }

  /* Has this phase's round fully arrived? A view can land in pieces (the dev transport
     delivers a write field by field), and a phase drawn from half a round cannot be redrawn. */
  function ready(sw) {
    if (!sw || !sw.settings || typeof sw.phase !== 'string') return false;
    if (sw.phase === 'starting') return true;
    if (sw.phase === 'ended') return !!sw.result;
    var rd = sw.round;
    if (!rd || rd.k !== sw.k || !rd.words || !rd.words.length || !rd.seconds) return false;
    if (sw.settings.answer === 'choice') { if (!rd.choices || !rd.choices.length) return false; }
    else if (!rd.cells || !rd.tiles || !rd.tiles.length) return false;
    if (sw.phase === 'reveal') return !!(sw.last && sw.last.k === sw.k && sw.last.target && sw.last.results);
    return true;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var sw = null, stopped = false, sent = {};
    var offs = [T.watch('sw', function (v) { sw = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function send(text) {
      if (stopped || !sw || !sw.p[uid] || sw.phase !== 'open') return false;
      var key = sw.matchId + '|' + sw.k;
      if (sent[key] || sw.p[uid].inK === sw.k) return false;
      if (T.serverNow() > sw.closeAt + 500) return false;
      sent[key] = true;
      var cmd = { matchId: sw.matchId, k: sw.k, text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60), t: stamp() };
      T.set('swInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the player try again while the saying is open.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    return {
      uid: uid,
      view: function () { return { sw: sw, uid: uid, seated: !!(sw && sw.p[uid]), me: sw && sw.p[uid] || null }; },
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

  /* Dev rooms have no server: the host tab referees (js/saywhat/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.SayWhatDev) return Promise.resolve(FF.SayWhatDev);
    return ['js/saywhat/referee.js', 'js/saywhat/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.SayWhatDev; });
  }

  FF.SayWhatApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/saywhat/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/saywhat/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.SayWhatClient = { create: create, tidy: tidy, ready: ready };
})();
