/* ============================================================
   PLAYMONA — logorush/client.js
   A phone's side of an online Logo Rush match: follows the public
   view (rooms/<code>/lr) and sends this player's answer for the
   logo to the referee through rooms/<code>/lrInbox/<uid>/<id>.
   The referee decides everything that counts: whether the answer
   is right, how fast it was, the points and the winner.

     var c = FF.LogoRushClient.create({ room: FF.Room.current(), onChange });
     c.view()        -> { lr, uid, seated, me }
     c.send(text)    -> true if sent (one answer per logo), false if not now
     c.stop()
     FF.LogoRushClient.ready(lr)  -> has this phase arrived in full?

   Also FF.LogoRushApi.start(room, pick) / nudge(code): the server
   (POST /api/logorush/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.LogoRushRules;

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
  function tidy(lr) {
    if (!lr || !lr.settings) return null;
    lr.order = list(lr.order);
    lr.p = lr.p || {};
    lr.settings = R.sanitizeRoom(lr.settings);
    if (lr.result) lr.result.rows = list(lr.result.rows);
    if (typeof lr.k !== 'number') lr.k = -1;
    var rd = lr.round;
    if (rd) {
      if (typeof rd.choices === 'string') rd.choices = rd.choices ? rd.choices.split(',') : [];
      if (typeof rd.tiles === 'string') rd.tiles = rd.tiles.split('');
    }
    return lr;
  }

  /* Has this phase's round fully arrived? A view can land in pieces (the dev transport
     delivers a write field by field), and a phase drawn from half a round cannot be redrawn. */
  function ready(lr) {
    if (!lr || !lr.settings || typeof lr.phase !== 'string') return false;
    if (lr.phase === 'starting') return true;
    if (lr.phase === 'ended') return !!lr.result;
    var rd = lr.round;
    if (!rd || rd.k !== lr.k || !rd.id || !rd.seconds) return false;
    if (lr.settings.mode === 'choice') { if (!rd.choices || !rd.choices.length) return false; }
    else if (!rd.cells || !rd.tiles || !rd.tiles.length) return false;
    if (lr.phase === 'reveal') return !!(lr.reveal && lr.reveal.k === lr.k && lr.reveal.name);
    return true;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var lr = null, stopped = false, sent = {};
    var offs = [T.watch('lr', function (v) { lr = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function send(text) {
      if (stopped || !lr || !lr.p[uid] || lr.phase !== 'open') return false;
      var key = lr.matchId + '|' + lr.k;
      if (sent[key] || lr.p[uid].inK === lr.k) return false;
      if (T.serverNow() > lr.closeAt + 500) return false;
      sent[key] = true;
      var cmd = { type: 'answer', matchId: lr.matchId, k: lr.k, text: String(text || '').slice(0, 60), t: stamp() };
      T.set('lrInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the player try again while the logo is open.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    return {
      uid: uid,
      view: function () { return { lr: lr, uid: uid, seated: !!(lr && lr.p[uid]), me: lr && lr.p[uid] || null }; },
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

  /* Dev rooms have no server: the host tab referees (js/logorush/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.LogoRushDev) return Promise.resolve(FF.LogoRushDev);
    return ['js/logorush/referee.js', 'js/logorush/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.LogoRushDev; });
  }

  FF.LogoRushApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/logorush/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/logorush/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.LogoRushClient = { create: create, tidy: tidy, ready: ready };
})();
