/* ============================================================
   PLAYMONA — numberchallenge/client.js
   A phone's side of an online Number Challenge Race: follows the
   public view (rooms/<code>/nc) and sends this player's answers to
   the referee through rooms/<code>/ncInbox/<uid>/<id>. The referee
   decides everything that counts: right or wrong, how fast, the
   points, a Sprint's clock and the winner.

     var c = FF.NumberChallengeClient.create({ room: FF.Room.current(), onChange });
     c.view()              -> { nc, uid, seated, me }
     c.send(text)          -> true if sent (one answer per item), false if not now
     c.sendSprint(i, text) -> true if queued (Sprint: answers to sum i, in order,
                              sent in batches at most every 500 ms)
     c.serverNow(), c.stop()
     FF.NumberChallengeClient.ready(nc)  -> has this phase arrived in full?

   Also FF.NumberChallengeApi.start(room, pick) / nudge(code): the server
   (POST /api/numberchallenge/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.NumberChallengeRules;
  var FLUSH_MS = 500;
  var MAX_TEXT = 80;

  /* Not FF.util.uid: in a room that draws from the room's seeded random. The counter keeps one
     phone's commands in the order they were sent (the referee sorts by time, then id). */
  var seq = 0;
  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(8)));
    else for (var i = 0; i < 8; i++) bytes.push(Math.floor(Math.random() * 256));
    seq++;
    return 'c' + ('00000' + seq).slice(-6) + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function splitChoices(s) { return typeof s === 'string' ? (s ? s.split('|').map(Number) : []) : s; }

  /* Firebase turns arrays into objects and drops empty ones: put them back. The referee sends
     choices, tiles and signs as strings (they can never arrive in pieces); the screen wants lists. */
  function tidy(nc) {
    if (!nc || !nc.settings) return null;
    nc.order = list(nc.order);
    nc.p = nc.p || {};
    nc.settings = R.sanitizeRoom(nc.settings);
    if (nc.result) nc.result.rows = list(nc.result.rows);
    if (nc.last) nc.last.results = nc.last.results || {};
    if (typeof nc.k !== 'number') nc.k = -1;
    var rd = nc.round;
    if (rd) {
      if (rd.choices != null) rd.choices = splitChoices(rd.choices);
      if (typeof rd.tiles === 'string') rd.tiles = rd.tiles ? rd.tiles.split(',').map(Number) : [];
      if (typeof rd.ops === 'string') rd.ops = rd.ops.split('');
      if (rd.list != null) rd.list = list(rd.list).map(function (x) { if (x && x.choices != null) x.choices = splitChoices(x.choices); return x; });
    }
    return nc;
  }

  /* Has this phase's round fully arrived? A view can land in pieces (the dev transport
     delivers a write field by field), and a phase drawn from half a round cannot be redrawn. */
  function ready(nc) {
    if (!nc || !nc.settings || typeof nc.phase !== 'string') return false;
    if (nc.phase === 'starting') return true;
    if (nc.phase === 'ended') return !!nc.result;
    var rd = nc.round;
    if (!rd || rd.k !== nc.k || !rd.seconds) return false;
    var s = nc.settings;
    var choices = s.level !== 'expert';
    var hasChoices = function (c) { return !choices || (Array.isArray(c) && c.length === 4); };
    if (s.mode === 'quick' && (!rd.text || !hasChoices(rd.choices))) return false;
    if (s.mode === 'chain') {
      if (rd.start == null || !rd.steps || typeof rd.shown !== 'number') return false;
      if (rd.shown > 0 && !rd.step) return false;
      if (nc.phase !== 'steps' && !hasChoices(rd.choices)) return false;
    }
    if (s.mode === 'target' && (!rd.tiles || !rd.tiles.length || !rd.ops || !rd.ops.length || !rd.target)) return false;
    if (s.mode === 'sprint') {
      if (!rd.list || rd.list.length !== R.SPRINT_LIST) return false;
      if (!rd.list.every(function (x) { return x && x.text && hasChoices(x.choices); })) return false;
    }
    if (nc.phase === 'reveal') return !!(nc.last && nc.last.k === nc.k && nc.last.results);
    return true;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var timers = opts.timers || { setTimeout: function (fn, ms) { return setTimeout(fn, ms); }, clearTimeout: function (id) { clearTimeout(id); } };
    var nc = null, stopped = false, sent = {};
    var queue = [], queued = -1, flushTimer = null, queueKey = '';
    var offs = [T.watch('nc', function (v) { nc = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }
    function open() { return !stopped && nc && nc.p[uid] && nc.phase === 'open'; }

    function post(text) {
      var cmd = { matchId: nc.matchId, k: nc.k, text: text, t: stamp() };
      return T.set('ncInbox/' + uid + '/' + cmdId(), cmd);
    }

    function send(text) {
      if (!open() || nc.settings.mode === 'sprint') return false;
      var key = nc.matchId + '|' + nc.k;
      if (sent[key] || nc.p[uid].inK === nc.k) return false;
      if (T.serverNow() > nc.closeAt + 500) return false;
      sent[key] = true;
      post(String(text == null ? '' : text).replace(/\s+/g, '').slice(0, MAX_TEXT)).catch(function () {
        // Never reached the referee: let the player try again while the item is open.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    /* Sprint: answers go in order, each sum once, batched. */
    function sendSprint(i, text) {
      if (!open() || nc.settings.mode !== 'sprint') return false;
      var key = nc.matchId + '|' + nc.k;
      if (queueKey !== key) { queueKey = key; queue = []; queued = -1; }
      var me = nc.p[uid] || {};
      var next = Math.max(queued + 1, typeof me.at === 'number' ? me.at : 0);
      if (i !== next || me.done) return false;
      queued = i;
      queue.push(i + ':' + String(text == null ? '' : text).replace(/\D/g, '').slice(0, 6));
      if (flushTimer == null) flushTimer = timers.setTimeout(flushSprint, FLUSH_MS);
      return true;
    }
    function flushSprint() {
      flushTimer = null;
      if (stopped || !queue.length || !nc) return;
      var batches = [], cur = '';
      queue.forEach(function (part) {
        if (cur && (cur + ',' + part).length > MAX_TEXT) { batches.push(cur); cur = part; }
        else cur = cur ? cur + ',' + part : part;
      });
      if (cur) batches.push(cur);
      queue = [];
      // One after another, so their ids and times stay in order.
      batches.reduce(function (p, text) { return p.then(function () { return post(text); }); }, Promise.resolve())
        .catch(function () { if (!stopped) onChange(); });
    }

    return {
      uid: uid,
      view: function () { return { nc: nc, uid: uid, seated: !!(nc && nc.p[uid]), me: nc && nc.p[uid] || null }; },
      send: send,
      sendSprint: sendSprint,
      flushSprint: function () { if (flushTimer != null) timers.clearTimeout(flushTimer); flushSprint(); },
      serverNow: function () { return T.serverNow(); },
      stop: function () {
        stopped = true;
        if (flushTimer != null) timers.clearTimeout(flushTimer);
        flushTimer = null;
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

  /* Dev rooms have no server: the host tab referees (js/numberchallenge/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.NumberChallengeDev) return Promise.resolve(FF.NumberChallengeDev);
    return ['js/numberchallenge/referee.js', 'js/numberchallenge/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.NumberChallengeDev; });
  }

  FF.NumberChallengeApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/numberchallenge/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/numberchallenge/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.NumberChallengeClient = { create: create, tidy: tidy, ready: ready };
})();
