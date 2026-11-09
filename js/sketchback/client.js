/* ============================================================
   PLAYMONA — sketchback/client.js
   A phone's side of an online SketchBack match: follows the public
   view (rooms/<code>/skb) and sends this player's drawings (once,
   after the last sketch) and answers (once, while naming) to the
   referee through rooms/<code>/skbInbox/<uid>/<id>. The referee
   decides what counts.

     var c = FF.SketchBackClient.create({ room: FF.Room.current(), onChange });
     c.view()               -> { skb, uid, seated, me }
     c.sendDrawings([enc])  -> true if sent, false if not now or already sent
     c.sendAnswers([text])  -> true if sent, false if not now or already sent
     c.stop()

   Also FF.SketchBackApi.start(room, pick) / nudge(code): the server
   (POST /api/sketchback/*), or the host tab in dev rooms.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SketchBackRules;

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
  /* Lists of n, with the gaps the database drops ('' and false) put back. */
  function full(v, n, empty) {
    var out = [];
    for (var i = 0; i < n; i++) { var x = v && v[i]; out.push(x == null ? empty : x); }
    return out;
  }

  /* Firebase turns arrays into objects and drops empty ones: put them back. */
  function tidy(skb) {
    if (!skb || !skb.settings) return null;
    skb.order = list(skb.order);
    skb.p = skb.p || {};
    skb.settings = R.sanitizeRoom(skb.settings);
    if (typeof skb.k !== 'number') skb.k = -1;
    var res = skb.result;
    if (res) {
      res.rows = list(res.rows);
      if (res.deal) res.deal = list(res.deal);
      var n = res.deal ? res.deal.length : 0;
      res.answers = res.answers || {};
      res.ok = res.ok || {};
      res.art = res.art || {};
      Object.keys(res.answers).forEach(function (uid) { res.answers[uid] = full(res.answers[uid], n, ''); });
      Object.keys(res.ok).forEach(function (uid) { res.ok[uid] = full(res.ok[uid], n, false); });
    }
    return skb;
  }

  /* Has this phase fully arrived? A view can land in pieces (the dev transport
     delivers a write field by field), and a phase drawn from half a view cannot be redrawn. */
  function ready(skb) {
    if (!skb || !skb.settings || typeof skb.phase !== 'string' || !skb.matchId) return false;
    switch (skb.phase) {
      case 'starting': return !!skb.drawAt;
      case 'draw':
        return !!(skb.round && skb.round.k === skb.k && skb.round.id && skb.round.name && skb.drawAt && skb.closeAt);
      case 'gap': return !!(skb.drawAt || skb.recallAt);
      case 'recall': return !!(skb.recallAt && skb.recallEnd);
      case 'ended': return !!(skb.result && skb.result.rows && skb.result.rows.length && skb.result.deal && skb.result.deal.length);
      default: return false;
    }
  }

  function clean(s) { return String(s == null ? '' : s).replace(/\|/g, ' ').slice(0, 40); }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var skb = null, stopped = false, sent = {};
    var offs = [T.watch('skb', function (v) { skb = tidy(v || null); if (!stopped) onChange(); })];

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }
    function me() { return skb && skb.p[uid]; }

    function push(key, cmd) {
      sent[key] = true;
      T.set('skbInbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // Never reached the referee: let the screen try again.
        delete sent[key];
        if (!stopped) onChange();
      });
      return true;
    }

    function sendDrawings(drawings) {
      if (stopped || !skb || !me() || me().drew) return false;
      var afterLast = skb.phase === 'recall' || (skb.phase === 'gap' && skb.k + 1 >= skb.total);
      if (!afterLast) return false;
      var key = skb.matchId + '|art';
      if (sent[key]) return false;
      var art = full(drawings, skb.total, '').map(function (d) { return String(d || '').replace(/\|/g, ''); }).join('|');
      return push(key, { type: 'drawings', matchId: skb.matchId, art: art });
    }

    function sendAnswers(answers) {
      if (stopped || !skb || !me() || me().named || skb.phase !== 'recall') return false;
      if (T.serverNow() > skb.recallEnd + 1000) return false;
      var key = skb.matchId + '|names';
      if (sent[key]) return false;
      return push(key, { type: 'answers', matchId: skb.matchId, t: stamp(), text: full(answers, skb.total, '').map(clean).join('|') });
    }

    return {
      uid: uid,
      view: function () { return { skb: skb, uid: uid, seated: !!me(), me: me() || null }; },
      sendDrawings: sendDrawings,
      sendAnswers: sendAnswers,
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

  /* Dev rooms have no server: the host tab referees (js/sketchback/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.SketchBackDev) return Promise.resolve(FF.SketchBackDev);
    return ['js/sketchback/referee.js', 'js/sketchback/dev.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.SketchBackDev; });
  }

  FF.SketchBackApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/sketchback/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/sketchback/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.SketchBackClient = { create: create, tidy: tidy, ready: ready };
})();
