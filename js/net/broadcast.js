/* ============================================================
   PLAYMONA — net/broadcast.js
   Watching (phase 3). The room host's device publishes what people
   watching see: a small document at broadcasts/<watch code>. The
   watch code is separate from the room code, so a watch link can
   never be used to join and play. Every device in the room runs
   this; only the current host writes, so when the host changes the
   new host simply carries on.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var CODE_LENGTH = 8;
  var PUBLISH_MS = 500;        // at most one write per half second
  var HEARTBEAT_MS = 15000;    // rewrite while idle, so viewers know the room is alive
  var STALE_MS = 45000;        // after this long without a write a broadcast counts as ended
  var ONLINE_MS = 20000;       // same as the room's presence check

  var cur = null;              // { room, meta, players, rounds, voice, admin }
  var offs = [];
  var watchP = null;           // Promise<watch transport> (database root)
  var timer = null;
  var heartbeat = null;
  var lastPublish = 0;
  var lastJson = null;
  var lastCode = null;
  var removedFor = null;       // watch code whose broadcast was taken down (watching off)
  var codeP = null;
  var viewerCbs = [];
  var viewerCount = 0;
  var offViewers = null;
  var viewersFor = null;
  var offScreen = null;

  function isPhoto(v) {
    if (FF.Avatars && FF.Avatars.isPhoto) return FF.Avatars.isPhoto(v);
    return /^photo:/.test(String(v || ''));
  }
  function publicAvatar(p) {
    var a = p.avatar || null;
    if (p.hidePhoto && isPhoto(a)) return (FF.Avatars && FF.Avatars.fallback) ? FF.Avatars.fallback(a) : null;
    return a;
  }
  function isOnline(p, now) {
    if (!p || p.online === false) return false;
    return p.lastSeen == null || (now - p.lastSeen) <= ONLINE_MS;
  }
  function latestRound(rounds) {
    var keys = Object.keys(rounds || {}).map(Number).filter(function (n) { return n >= 0; });
    return keys.length ? Math.max.apply(null, keys) : 0;
  }

  /* What viewers see, from the room's data. Pure: no reads, no writes. */
  function build(input) {
    input = input || {};
    var meta = input.meta || {};
    var players = input.players || {};
    var rounds = input.rounds || {};
    var scores = input.scores || {};
    var voice = input.voice || {};
    var now = input.now || Date.now();
    var status = meta.status === 'playing' || meta.status === 'ended' ? meta.status : 'lobby';
    var screen = input.screen || null;

    var round = null;
    if (status === 'playing') {
      var n = screen ? screen.n : latestRound(rounds);
      var mine = !!(screen && screen.n === n);
      var node = rounds[n] || {};
      round = {
        n: n,
        total: (typeof input.total === 'number' && input.total > 0) ? input.total : null,
        opensAt: node.startedAt != null ? node.startedAt : null,
        timerMs: (meta.settings && Number(meta.settings.timer) > 0) ? Number(meta.settings.timer) * 1000 : null,
        screen: mine ? screen.screen : null,
        answer: mine && screen.answer != null ? screen.answer : null
      };
    }
    var revealed = !!(round && round.answer != null);
    var answers = round ? ((rounds[round.n] || {}).answers || {}) : {};

    var out = {
      v: 1,
      name: String(input.roomName || '').slice(0, 40),
      public: meta.public === true && !input.delisted,
      status: status,
      mode: meta.mode === 'teams' ? 'teams' : 'players',
      game: (status !== 'lobby' && input.game) ? input.game : null,
      startAt: status === 'playing' && meta.startAt ? meta.startAt : null,
      round: round,
      players: {},
      results: null,
      updatedAt: now
    };

    Object.keys(players).forEach(function (uid) {
      var p = players[uid] || {};
      if (!isOnline(p, now)) return;
      var a = answers[uid];
      out.players[uid] = {
        name: String(p.name || 'Player').slice(0, 40),
        avatar: publicAvatar(p),
        color: p.color || null,
        score: Number(scores[uid]) || 0,
        answered: !!a,
        correct: (revealed && a) ? !!a.correct : null,
        talking: !!(voice[uid] && voice[uid].speaking),
        online: true,
        teamId: p.teamId || null
      };
    });

    if (status === 'ended') {
      out.results = Object.keys(out.players).map(function (uid) {
        var p = out.players[uid];
        return { id: uid, name: p.name, avatar: p.avatar, score: p.score };
      }).sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : 1); });
    }
    return out;
  }

  /* ---------- Plumbing ---------- */
  function room() { return FF.Room ? FF.Room.current() : null; }
  function amHost() {
    var st = room();
    return !!(st && cur && cur.meta && cur.meta.hostUid === st.uid);
  }
  function watchTransport() {
    if (!watchP) {
      var st = room();
      watchP = FF.Transport.open('', !!(st && st.dev));
    }
    return watchP;
  }
  function newCode() {
    var abc = (FF.Room && FF.Room.CODE_ALPHABET) || 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < CODE_LENGTH; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return out;
  }
  function stamp(t) {
    return t.serverTimestamp ? t.serverTimestamp() : t.serverNow();
  }
  function gameInfo(id) {
    if (!id) return null;
    var def = FF.Games && FF.Games.get ? FF.Games.get(id) : null;
    return { id: id, name: (def && def.name) || id, category: (def && def.category) || null };
  }
  function plannedTotal() {
    var n = FF.Race && FF.Race.planned ? FF.Race.planned() : null;
    return (typeof n === 'number' && n > 0 && n < 200) ? n : null;
  }

  function schedule(force) {
    if (force) lastJson = null;
    if (timer) return;
    var wait = Math.max(0, PUBLISH_MS - (Date.now() - lastPublish));
    timer = setTimeout(function () { timer = null; publish(); }, wait);
  }

  function publish() {
    var st = room();
    if (!st || !cur || !amHost()) return;
    var meta = cur.meta || {};
    var code = meta.watchCode;
    if (!code) { FF.Broadcast.ensureCode().then(function () { schedule(true); }, function () {}); return; }

    watchTransport().then(function (t) {
      if (!cur || !amHost()) return;
      if (meta.watching === false) {
        if (removedFor !== code) {
          removedFor = code;
          lastJson = null;
          t.set('broadcasts/' + code, null).catch(function () {});
        }
        return;
      }
      removedFor = null;
      var doc = build({
        meta: meta,
        players: cur.players,
        rounds: cur.rounds,
        scores: FF.Race && FF.Race.scores ? FF.Race.scores(cur.rounds) : {},
        // Only the game this device is playing now (never one that just ended).
        screen: FF.Race && FF.Race.running && FF.Race.running() ? FF.Race.screen() : null,
        voice: cur.voice,
        delisted: FF.Broadcast.delisted(),
        roomName: FF.Room.displayName(meta, cur.players),
        game: gameInfo(meta.gameId),
        total: plannedTotal(),
        now: t.serverNow()
      });
      var json = JSON.stringify(Object.assign({}, doc, { updatedAt: 0 }));
      var due = Date.now() - lastPublish >= HEARTBEAT_MS - 50;
      if (json === lastJson && code === lastCode && !due) return;
      lastJson = json;
      lastCode = code;
      lastPublish = Date.now();
      doc.updatedAt = stamp(t);
      return t.set('broadcasts/' + code, doc);
    }).catch(function (e) { if (window.console) console.warn('[FF.Broadcast]', e && e.message); });
  }

  function watchViewers() {
    var code = cur && cur.meta ? cur.meta.watchCode : null;
    if (code === viewersFor) return;
    if (offViewers) { offViewers(); offViewers = null; }
    viewersFor = code;
    viewerCount = 0;
    notifyViewers();
    if (!code) return;
    watchTransport().then(function (t) {
      if (viewersFor !== code || !cur) return;
      offViewers = t.watch('watchers/' + code, function (v) {
        viewerCount = v && typeof v === 'object' ? Object.keys(v).length : 0;
        notifyViewers();
      });
    }).catch(function () {});
  }
  function notifyViewers() {
    viewerCbs.slice().forEach(function (fn) { try { fn(viewerCount); } catch (e) {} });
  }

  FF.Broadcast = {
    CODE_LENGTH: CODE_LENGTH,
    PUBLISH_MS: PUBLISH_MS,
    HEARTBEAT_MS: HEARTBEAT_MS,
    STALE_MS: STALE_MS,
    build: build,

    /* Called by FF.Room once this device is in a room. */
    start: function () {
      this.stop();
      var st = room();
      if (!st) return;
      cur = { room: st, meta: st.meta || {}, players: st.players || {}, rounds: st.rounds || {}, voice: {}, admin: {} };
      var t = st.transport;
      function follow(path, key) {
        offs.push(t.watch(path, function (v) {
          if (!cur) return;
          cur[key] = v || {};
          if (key === 'meta') watchViewers();
          schedule();
        }));
      }
      follow('meta', 'meta');
      follow('players', 'players');
      follow('rounds', 'rounds');
      follow('voice', 'voice');
      follow('admin', 'admin');
      if (FF.Race && FF.Race.onScreen) offScreen = FF.Race.onScreen(function () { schedule(); });
      heartbeat = setInterval(function () { schedule(); }, HEARTBEAT_MS);
      watchViewers();
      schedule();
    },

    /* Called when leaving. retire: this device was the last one here, so
       the broadcast comes down (viewers see that the game ended). */
    stop: function (opts) {
      var code = cur && cur.meta ? cur.meta.watchCode : null;
      var wasHost = amHost();
      offs.forEach(function (off) { try { off(); } catch (e) {} });
      offs = [];
      if (offScreen) { offScreen(); offScreen = null; }
      if (offViewers) { offViewers(); offViewers = null; }
      if (timer) { clearTimeout(timer); timer = null; }
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      var p = Promise.resolve();
      if (opts && opts.retire && wasHost && code && watchP) {
        p = watchP.then(function (t) { return t.set('broadcasts/' + code, null); }).catch(function () {});
      }
      cur = null; watchP = null; lastJson = null; lastCode = null; lastPublish = 0;
      removedFor = null; codeP = null; viewersFor = null; viewerCount = 0;
      notifyViewers();
      return p;
    },

    /* Host only: give the room a watch code if it has none (older saved rooms). */
    ensureCode: function () {
      var st = room();
      if (!st || !cur) return Promise.reject(new Error('Not in a room.'));
      if (cur.meta && cur.meta.watchCode) return Promise.resolve(cur.meta.watchCode);
      if (!amHost()) return Promise.reject(new Error('Only the room host can do that.'));
      if (codeP) return codeP;
      var code = newCode();
      codeP = watchTransport().then(function (t) {
        return t.set('watchRooms/' + code, st.code);
      }).then(function () {
        return st.transport.update('meta', { watchCode: code });
      }).then(function () {
        if (cur) cur.meta = Object.assign({}, cur.meta, { watchCode: code });
        codeP = null;
        return code;
      }, function (e) { codeP = null; throw e; });
      return codeP;
    },

    /* Host only: replace the watch code. Old watch links stop working. */
    newLink: function () {
      var st = room();
      if (!st || !cur || !amHost()) return Promise.reject(new Error('Only the room host can do that.'));
      var old = cur.meta && cur.meta.watchCode;
      var self = this;
      return watchTransport().then(function (t) {
        if (!old) return null;
        // Broadcast first, mapping second: the rules check the mapping on both writes.
        return t.set('broadcasts/' + old, null).then(function () { return t.set('watchRooms/' + old, null); });
      }).then(function () {
        cur.meta = Object.assign({}, cur.meta, { watchCode: null });
        lastJson = null;
        return self.ensureCode();
      }).then(function (code) {
        schedule(true);
        return code;
      });
    },

    setPublic: function (on) {
      var st = room();
      if (!st || !amHost()) return Promise.reject(new Error('Only the room host can do that.'));
      if (on && this.delisted()) return Promise.reject(new Error('DELISTED'));
      return st.transport.update('meta', { public: !!on });
    },

    setWatching: function (on) {
      var st = room();
      if (!st || !amHost()) return Promise.reject(new Error('Only the room host can do that.'));
      return st.transport.update('meta', { watching: !!on }).then(function () { schedule(true); });
    },

    delisted: function () { return !!(cur && cur.admin && cur.admin.delisted === true); },
    isPublic: function () { return !!(cur && cur.meta && cur.meta.public === true) && !this.delisted(); },
    isWatching: function () { return !(cur && cur.meta && cur.meta.watching === false); },
    code: function () { return cur && cur.meta ? cur.meta.watchCode || null : null; },

    watchUrl: function (code) {
      var origin = (typeof location !== 'undefined' && location.origin && /^https?:/.test(location.protocol)) ? location.origin : 'https://playmona.com';
      return origin + '/watch/' + code;
    },

    /* cb(count) now and whenever the number of people watching changes. */
    onViewers: function (cb) {
      viewerCbs.push(cb);
      Promise.resolve().then(function () { if (viewerCbs.indexOf(cb) !== -1) cb(viewerCount); });
      return function () {
        var i = viewerCbs.indexOf(cb);
        if (i !== -1) viewerCbs.splice(i, 1);
      };
    },
    viewers: function () { return viewerCount; }
  };
})();
