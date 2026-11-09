/* ============================================================
   PLAYMONA — crossword/client.js
   A phone's side of an online Mini Crossword match: follows the
   public view (rooms/<code>/cw) and sends this player's moves to
   the referee through rooms/<code>/cwInbox/<uid>/<id>. The referee
   decides everything that counts: which words are right, the
   times, the points and the winner. The answers never reach a
   phone until the match is over.

     var c = FF.CrosswordClient.create({ room: FF.Room.current(), onChange });
     c.view()             -> { cw, uid, seated, me }
     c.word(id, text)     race with letters checked: a finished word
     c.grid(rows)         race in Expert: the whole grid ('.' for empty)
     c.fill(r, c, ch)     co-op: one square ('' clears it)
     c.stop()

   Also FF.CrosswordApi.start(room, pick) / nudge(code): the server
   (POST /api/crossword/*), or the host tab in dev rooms.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CrosswordRules;

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
  function tidy(cw) {
    if (!cw || !cw.settings) return null;
    cw.order = list(cw.order);
    cw.p = cw.p || {};
    cw.settings = R.sanitize(cw.settings);
    cw.grid = cw.grid || {};
    cw.locked = cw.locked || {};
    cw.bad = cw.bad || {};
    Object.keys(cw.p).forEach(function (uid) { if (cw.p[uid]) cw.p[uid].solved = cw.p[uid].solved || {}; });
    if (cw.result) {
      cw.result.rows = list(cw.result.rows);
      cw.result.winners = list(cw.result.winners);
    }
    return cw;
  }

  /* Has the view fully arrived? The dev transport delivers a write field by field. */
  function ready(cw) {
    if (!cw || !cw.settings || typeof cw.status !== 'string' || !cw.matchId) return false;
    var s = cw.shape;
    if (!s || !s.size || typeof s.blocks !== 'string' || !s.clues) return false;
    if (s.blocks.split('/').length !== s.size) return false;
    if (Object.keys(s.clues).length !== cw.total) return false;
    if (!cw.order.length || cw.order.some(function (uid) { return !cw.p[uid]; })) return false;
    if (cw.status === 'over') return !!(cw.result && cw.result.rows.length && typeof cw.result.answers === 'string');
    return !!cw.playAt && !!cw.endsAt;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var cw = null, stopped = false;
    var offs = [T.watch('cw', function (v) { cw = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }
    function playing() {
      return !stopped && cw && cw.p[uid] && cw.status === 'play' && T.serverNow() <= cw.endsAt + 500;
    }
    function send(cmd) {
      if (!playing()) return false;
      var full = Object.assign({ matchId: cw.matchId, t: stamp() }, cmd);
      T.set('cwInbox/' + uid + '/' + cmdId(), full).catch(function () { if (!stopped) onChange(); });
      return true;
    }

    return {
      uid: uid,
      view: function () { return { cw: cw, uid: uid, seated: !!(cw && cw.p[uid]), me: (cw && cw.p[uid]) || null }; },
      word: function (id, text) {
        return send({ type: 'word', word: String(id).slice(0, 4), text: String(text || '').toUpperCase().slice(0, 12) });
      },
      grid: function (rows) {
        return send({ type: 'grid', text: (rows || []).map(function (r) { return String(r).toUpperCase(); }).join('/').slice(0, 120) });
      },
      fill: function (r, c, ch) {
        var x = String(ch || '').toUpperCase();
        if (x && !/^[A-Z]$/.test(x)) return false;
        return send({ type: 'fill', r: r, c: c, ch: x });
      },
      playing: playing,
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

  /* Dev rooms have no server: the host tab referees (js/crossword/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.CrosswordDev) return Promise.resolve(FF.CrosswordDev);
    return ['js/crossword/referee.js', 'js/crossword/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        if (src.indexOf('referee') >= 0 && FF.CrosswordReferee) return null;
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.CrosswordDev; });
  }

  FF.CrosswordApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/crossword/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/crossword/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.CrosswordClient = { create: create, tidy: tidy, ready: ready };
})();
