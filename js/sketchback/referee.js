/* ============================================================
   PLAYMONA — sketchback/referee.js
   The one authority for an online SketchBack match. It runs on the
   server (inside the Node crew runner), never on a player's phone
   except in dev rooms.

   It picks the match seed with the server's random and keeps it
   secret, so nobody knows the objects ahead. Each sketch it
   publishes only the object being drawn, with one clock for the
   whole room (the database's time). Phones keep their drawings to
   themselves until the last sketch closes, then send them all at
   once. While players name their drawings the view holds no object
   at all. Answers are checked with the shared rules
   (FF.SketchBackRules.check), and only at the end does the room see
   the objects, everyone's answers and everyone's drawings.

   Phones only see rooms/<code>/skb and write rooms/<code>/skbInbox/<uid>/<cmdId>:
     { type: 'drawings', matchId, art: 'enc|enc|...' }      once, after the last sketch
     { type: 'answers', matchId, t, text: 'a|b|...' }        once, while naming
   Commands are plain strings so the dev transport's field-by-field
   delivery can never split one; incomplete ones wait.

   Phases: starting -> draw -> gap -> draw -> ... -> gap -> recall -> ended.

     var ref = FF.SketchBackReferee.create({
       run,        // { matchId, roomCode, seats, settings, startAt, seed? }
       room,       // transport scoped to rooms/<code>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SketchBackRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var GAP_MS = 900;                // between sketches: the paper locks, the next one comes
  var GRACE_MS = 1500;             // answers sent this soon after the naming clock still count
  var MAX_TEXT = 40;
  var MAX_ART = 200000;

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  /* 'a|b|c' -> exactly n strings. */
  function split(s, n, max) {
    var parts = String(s || '').split('|');
    var out = [];
    for (var i = 0; i < n; i++) out.push(String(parts[i] || '').slice(0, max));
    return out;
  }

  function create(opts) {
    var run = opts.run;
    var room = opts.room;
    var store = opts.store || { load: function () { return Promise.resolve(null); }, save: function () { return Promise.resolve(); } };
    var randomInt = opts.randomInt;
    var timers = opts.timers || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); }
    };
    var log = opts.log || function () {};
    var report = opts.report || function () { return Promise.resolve(); };

    var state = null;
    var players = {};
    var offs = [];
    var timer = null;
    var stopped = false;
    var writes = Promise.resolve();

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }
    function blank() { return { drew: false, art: '', named: false, answers: null, ok: null, correct: 0, ms: 0 }; }
    function secs() { return R.SECONDS[state.settings.level] * 1000; }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('SketchBack takes 1 to ' + R.MAX_PLAYERS + ' players.');
      var settings = R.sanitizeRoom(run.settings);
      var seed = run.seed || makeSeed();
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: settings, seed: seed, deal: R.deal(settings, seed), seats: seats, players: {},
        phase: 'starting', k: -1, drawAt: (run.startAt || 0) + BRIEF_MS, closeAt: 0, recallAt: 0, recallEnd: 0, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = blank(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.deal = list(s.deal);
      s.players = s.players || {};
      s.settings = R.sanitizeRoom(s.settings);
      s.seats.forEach(function (uid) {
        var p = s.players[uid] = Object.assign(blank(), s.players[uid] || {});
        if (p.answers) p.answers = list(p.answers);
        if (p.ok) p.ok = list(p.ok);
      });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.matchId === run.matchId) {
          state = revive(saved);
          log('resuming ' + run.matchId + ' at ' + state.phase + ' ' + state.k);
        } else {
          fresh();
          later(function () { return room.set('skbInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'recall') checkAllIn(); }));
        offs.push(room.watch('skbInbox', onInbox));
        save();
        publish();
        schedule();
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- the clock ---------- */

    function dueAt() {
      switch (state.phase) {
        case 'starting': return state.drawAt;
        case 'draw': return state.closeAt;
        case 'gap': return state.drawAt || state.recallAt;
        case 'recall': return state.recallEnd + GRACE_MS;
        default: return Infinity;
      }
    }

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, dueAt() - now()));
    }

    function onClock() {
      if (now() < dueAt()) { schedule(); return; }
      switch (state.phase) {
        case 'starting': draw(Math.max(state.drawAt, now())); return;
        case 'draw': gap(); return;
        case 'gap':
          if (state.drawAt) draw(Math.max(state.drawAt, now()));
          else move('recall');
          return;
        case 'recall': finish('done');
      }
    }

    function move(phase) {
      state.phase = phase;
      save();
      publish();
      schedule();
    }

    /* The next object, with the whole time from now: a referee that starts late still gives it all. */
    function draw(at) {
      state.k++;
      state.drawAt = at;
      state.closeAt = at + secs();
      move('draw');
    }

    function gap() {
      var last = state.k + 1 >= state.deal.length;
      var next = state.closeAt + GAP_MS;
      if (last) {
        state.drawAt = 0;
        state.recallAt = next;
        state.recallEnd = next + R.RECALL_MS;
      } else {
        state.drawAt = next;
      }
      move('gap');
    }

    /* Everyone still here has named their drawings: no reason to wait for the clock. */
    function checkAllIn() {
      var t = now();
      var known = Object.keys(players).length > 0;
      var waiting = state.seats.some(function (uid) {
        if (state.players[uid].named) return false;
        return !known || online(players[uid], t);
      });
      if (!waiting) { finish('done'); return true; }
      return false;
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      if (!cmd || typeof cmd.matchId !== 'string') return false;
      if (cmd.type === 'drawings') return typeof cmd.art === 'string';
      if (cmd.type === 'answers') return typeof cmd.text === 'string' && typeof cmd.t === 'number';
      return false;
    }

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      var changed = false;
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).forEach(function (id) {
          var cmd = cmds[id];
          // The dev transport delivers a command one field at a time: wait for all of it.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          if (take(uid, cmd)) changed = true;
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('skbInbox', clear); });
      if (changed) {
        save();
        publishPlayers();
        if (state.phase === 'recall') checkAllIn();
      }
    }

    function take(uid, cmd) {
      var p = state.players[uid];
      if (!p || cmd.matchId !== state.matchId) return false;
      var n = state.deal.length;
      if (cmd.type === 'drawings') {
        // Only once the last sketch has closed, and only once.
        var afterLast = state.phase === 'recall' || (state.phase === 'gap' && state.k + 1 >= n);
        if (!afterLast || p.drew || cmd.art.length > MAX_ART) return false;
        p.drew = true;
        p.art = split(cmd.art, n, Math.floor(MAX_ART / n)).join('|');
        return true;
      }
      // Answers: once, while naming is open.
      if (state.phase !== 'recall' || p.named) return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.recallAt || sentAt > state.recallEnd + GRACE_MS) return false;
      var answers = split(cmd.text, n, MAX_TEXT);
      p.named = true;
      p.answers = answers;
      p.ok = state.deal.map(function (id, k) { return R.check(answers[k], id).ok; });
      p.correct = p.ok.filter(Boolean).length;
      p.ms = Math.max(0, Math.min(R.RECALL_MS, sentAt - state.recallAt));
      return true;
    }

    /* ---------- the end ---------- */

    function ranked() {
      var rows = state.seats.map(function (uid) {
        var p = state.players[uid];
        return { uid: uid, points: p.correct * R.POINTS, correct: p.correct, ms: p.named ? p.ms : R.RECALL_MS };
      });
      rows.sort(function (a, b) { return b.correct - a.correct || a.ms - b.ms; });
      rows.forEach(function (r, i) {
        var prev = rows[i - 1];
        r.place = prev && prev.correct === r.correct && prev.ms === r.ms ? prev.place : i + 1;
      });
      return rows;
    }

    function finish(why) {
      if (state.phase === 'ended') return;
      var rows = ranked();
      var top = rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.uid; });
      var answers = {}, ok = {}, art = {};
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        answers[uid] = p.answers || state.deal.map(function () { return ''; });
        ok[uid] = p.ok || state.deal.map(function () { return false; });
        if (p.art) art[uid] = p.art;
      });
      state.result = { why: why, winners: top, draw: top.length > 1, rows: rows, deal: state.deal.slice(), answers: answers, ok: ok, art: art };
      var t = now();
      state.endedAt = t;
      var platform = rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.correct };
      });
      later(function () {
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'sketchBack', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      move('ended');
      Promise.resolve(report('sketchback', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, why: why,
        seats: rows.map(function (r) { return { uid: r.uid, place: r.place, points: r.points, correct: r.correct, won: top.indexOf(r.uid) !== -1 }; })
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    function rowOf(uid) {
      var p = state.players[uid];
      return { drew: !!p.drew, named: !!p.named };
    }

    /* The public view: never the seed, never an object before it is drawn, never one while naming. */
    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: state.deal.length, settings: state.settings,
        order: state.seats, startAt: state.startAt, drawAt: state.drawAt, closeAt: state.closeAt,
        recallAt: state.recallAt, recallEnd: state.recallEnd, p: {}
      };
      if (state.phase === 'draw') {
        var id = state.deal[state.k];
        var o = R.object(id);
        v.round = { k: state.k, id: id, name: o ? o.name : id };
      }
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) { v.p[uid] = rowOf(uid); });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('skb', copy); });
    }

    /* Who has sent what (not what they sent): just the ticks. */
    function publishPlayers() {
      if (state.phase === 'ended') return publish();
      var u = {};
      state.seats.forEach(function (uid) { u['p/' + uid] = rowOf(uid); });
      return later(function () { return room.update('skb', u); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.SketchBackReferee = { create: create, BRIEF_MS: BRIEF_MS, GAP_MS: GAP_MS, GRACE_MS: GRACE_MS };
})();
