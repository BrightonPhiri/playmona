/* ============================================================
   PLAYMONA — whatsmissing/client.js
   A phone's side of an online What's Missing? match: follows the
   public view (rooms/<code>/wm) and sends this player's answer for
   the round to the referee through rooms/<code>/wmInbox/<uid>/<id>.
   The referee decides everything that counts: whether the answer
   is right, how fast it was, the points and the winner.

     var c = FF.WhatsMissingClient.create({ room: FF.Room.current(), onChange });
     c.view()        -> { wm, uid, seated, me }
     c.send(answer)  -> true if sent (one answer per round), false if not now
                        answer: { picks: [ids] } | { text: [names] } | { slots: [n, n] }
     c.stop()

   Also FF.WhatsMissingApi.start(room, pick) / nudge(code): the server
   (POST /api/whatsmissing/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WhatsMissingRules;

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

  function cells(v, n) {
    var a = [];
    for (var i = 0; i < n; i++) { var x = v && v[i]; a.push(x ? x : null); }
    return a;
  }

  /* Firebase turns arrays into objects and drops empty ones: put them back. Empty board
     slots come as '' and go back to null, as the rules deal them. */
  function tidy(wm) {
    if (!wm || !wm.settings) return null;
    wm.order = list(wm.order);
    wm.p = wm.p || {};
    wm.settings = R.sanitizeRoom(wm.settings);
    if (wm.result) wm.result.rows = list(wm.result.rows);
    if (typeof wm.k !== 'number') wm.k = -1;
    var rd = wm.round;
    if (rd) {
      if (rd.before) rd.before = cells(rd.before, rd.slots);
      if (rd.after) rd.after = cells(rd.after, rd.slots);
      if (rd.choices) rd.choices = list(rd.choices);
      if (rd.tiles) rd.tiles = list(rd.tiles);
      if (rd.answer) rd.answer = { slots: list(rd.answer.slots), ids: list(rd.answer.ids) };
      rd.gaps = rd.gaps || 1;
    }
    Object.keys(wm.p).forEach(function (uid) {
      var l = wm.p[uid] && wm.p[uid].last;
      if (!l) return;
      l.right = list(l.right);
      if (l.picks) l.picks = list(l.picks);
      if (l.text) l.text = list(l.text);
      if (l.slots) l.slots = list(l.slots);
    });
    return wm;
  }

  /* An answer as the inbox carries it: one string, so it can never arrive in pieces. */
  function encode(answer) {
    var a = answer || {};
    var clean = function (s) { return String(s == null ? '' : s).replace(/[|,]/g, ' ').slice(0, 40); };
    if (Array.isArray(a.slots)) return { slots: a.slots.slice(0, 2).map(function (n) { return typeof n === 'number' ? String(n) : ''; }).join(',') };
    if (Array.isArray(a.text)) return { text: a.text.map(clean).join('|') };
    if (Array.isArray(a.picks)) return { picks: a.picks.map(clean).join(',') };
    return { picks: '' };
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var wm = null, stopped = false, sent = {};
    var offs = [T.watch('wm', function (v) { wm = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function send(answer) {
      if (stopped || !wm || !wm.p[uid] || wm.phase !== 'open') return false;
      var key = wm.matchId + '|' + wm.k;
      if (sent[key] || wm.p[uid].inK === wm.k) return false;
      if (T.serverNow() > wm.closeAt + 500) return false;
      sent[key] = true;
      var cmd = Object.assign({ type: 'answer', matchId: wm.matchId, k: wm.k, t: stamp() }, encode(answer));
      T.set('wmInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the player try again while the round is open.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    return {
      uid: uid,
      view: function () { return { wm: wm, uid: uid, seated: !!(wm && wm.p[uid]), me: wm && wm.p[uid] || null }; },
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

  /* Dev rooms have no server: the host tab referees (js/whatsmissing/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.WhatsMissingDev) return Promise.resolve(FF.WhatsMissingDev);
    return ['js/whatsmissing/referee.js', 'js/whatsmissing/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.WhatsMissingDev; });
  }

  FF.WhatsMissingApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/whatsmissing/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/whatsmissing/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.WhatsMissingClient = { create: create, tidy: tidy, encode: encode };
})();
