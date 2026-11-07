/* ============================================================
   PLAYMONA — ballswap/referee.js
   The one authority for a Ball Swap match. It runs on the server
   (inside the Node crew runner), never on a player's phone except
   in dev rooms.

   It deals one puzzle with the server's random (so every player
   gets exactly the same board), opens the round for everyone at
   the same instant, checks every swap against the instructions,
   counts mistakes, knocks players out, records who finished and
   when, and decides the official result. Phones only ever see
   rooms/<code>/bs (the public view) and talk back through
   rooms/<code>/bsInbox/<uid>/<cmdId>.

     var ref = FF.BallSwapReferee.create({
       run,        // { matchId, roomCode, seats, settings, startAt }
       room,       // transport scoped to rooms/<code> (js/net/transport.js interface)
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Each swap carries n, the sender's own move number. A command
   with an n already handled is a replay or a double tap and is
   dropped, so one swap can never land twice. Commands for one
   player run in order of n, one at a time, and the whole swap is
   checked before anything moves: both balls trade places, or
   neither does. Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.BallSwapRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var CHECK_MS = 5000;             // while playing, look this often for everyone being done or gone
  var LOST_MS = 4000;              // a gap in a player's move numbers this old is skipped
  var BRIEF_MS = 6000;             // after the room's countdown: read the instructions, then 3-2-1

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }

  function create(opts) {
    var run = opts.run;
    var room = opts.room;
    var store = opts.store || { load: function () { return Promise.resolve(null); }, save: function () { return Promise.resolve(); } };
    var randomInt = opts.randomInt;
    // Wrapped: browsers refuse window.setTimeout called as another object's method.
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
    var dirty = {};       // uids whose public row changed since the last write

    function now() { return room.serverNow(); }
    function later(fn) {
      // Every database write goes through one queue, so they land in order.
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('Ball Swap takes 1 to ' + R.MAX_PLAYERS + ' players.');
      var settings = R.sanitize(run.settings);
      var puzzle = R.deal(settings, randomInt);
      var ps = {};
      seats.forEach(function (uid) {
        ps[uid] = { a: puzzle.a.slice(), b: puzzle.b.slice(), n: 0, swaps: 0, mistakes: 0, done: false, out: false, doneAt: 0, used: 0, at: 0 };
      });
      return {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0, openAt: (run.startAt || 0) + BRIEF_MS,
        settings: settings, seats: seats, puzzle: puzzle, players: ps,
        phase: 'starting', deadline: 0, closeAt: 0, first: '', result: null, waiting: {}
      };
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.puzzle.colours = list(s.puzzle.colours);
      s.puzzle.balls = list(s.puzzle.balls);
      s.puzzle.a = list(s.puzzle.a);
      s.puzzle.b = list(s.puzzle.b);
      s.players = s.players || {};
      s.waiting = s.waiting || {};
      if (!s.openAt) s.openAt = (s.startAt || 0) + BRIEF_MS;
      s.seats.forEach(function (uid) {
        var p = s.players[uid] || {};
        p.a = list(p.a);
        p.b = list(p.b);
        s.players[uid] = p;
      });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.matchId === run.matchId) {
          state = revive(saved);
          log('resuming ' + run.matchId + ' at ' + state.phase);
        } else {
          state = fresh();
          later(function () { return room.set('bsInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'playing') checkAllDone(); }));
        offs.push(room.watch('bsInbox', onInbox));
        save();
        publishAll();
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

    function closesAt() { return state.closeAt ? Math.min(state.closeAt, state.deadline) : state.deadline; }

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      var due = state.phase === 'starting' ? state.openAt : Math.min(closesAt(), now() + CHECK_MS);
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, due - now()));
    }

    function onClock() {
      var t = now();
      if (state.phase === 'starting') {
        if (t < state.openAt) { schedule(); return; }
        state.phase = 'playing';
        state.deadline = state.openAt + state.settings.seconds * 1000;
        save();
        publishMeta();
        schedule();
        return;
      }
      if (state.phase === 'playing') {
        drainWaiting(true);
        if (state.phase !== 'playing') return;
        if (t >= closesAt()) { finish(state.closeAt && t >= state.closeAt && state.closeAt < state.deadline ? 'lastCall' : 'time'); return; }
        if (!checkAllDone()) schedule();
      }
    }

    /* Everyone finished, knocked out or gone: no reason to keep the others waiting. */
    function checkAllDone() {
      var t = now();
      var known = Object.keys(players).length > 0;
      var still = state.seats.some(function (uid) {
        var p = state.players[uid];
        if (p.done || p.out) return false;
        return !known || online(players[uid], t);
      });
      if (!still) { finish('done'); return true; }
      return false;
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      return !!cmd && cmd.type === 'swap' && typeof cmd.matchId === 'string' && typeof cmd.n === 'number' &&
        typeof cmd.a === 'number' && typeof cmd.b === 'number' && cmd.t != null;
    }

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).forEach(function (id) {
          var cmd = cmds[id];
          // The database rules only let a whole command in, but the dev transport delivers one
          // field at a time: wait for all of it, or the first piece would use up the command.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          if (cmd.matchId !== state.matchId || !state.players[uid]) return;
          var q = state.waiting[uid] = state.waiting[uid] || {};
          if (!q[cmd.n]) q[cmd.n] = { a: cmd.a, b: cmd.b, t: typeof cmd.t === 'number' ? cmd.t : now(), got: now() };
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('bsInbox', clear); });
      drainWaiting(false);
    }

    /* Run each player's waiting swaps in order of their move number. */
    function drainWaiting(lateOk) {
      var t = now();
      Object.keys(state.waiting).forEach(function (uid) {
        var q = state.waiting[uid];
        var p = state.players[uid];
        for (;;) {
          var keys = Object.keys(q).map(Number).sort(function (x, y) { return x - y; });
          if (!keys.length) break;
          var k = keys[0];
          if (k < p.n) { delete q[k]; continue; }                    // a replay or a double tap
          // A gap (a command that never came): wait a moment, then carry on without it.
          if (k > p.n && !(lateOk || t - q[k].got >= LOST_MS)) break;
          var cmd = q[k];
          delete q[k];
          handle(uid, k, cmd);
          if (state.phase === 'ended') return;
        }
        if (!Object.keys(q).length) delete state.waiting[uid];
      });
      flushDirty();
    }

    function handle(uid, n, cmd) {
      var p = state.players[uid];
      p.n = n + 1;
      dirty[uid] = true;
      if (state.phase !== 'playing' || p.done || p.out) return;
      // Sent in time counts, even if it reached us a moment after the clock.
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt) return;
      if (sentAt > closesAt()) return;
      var verdict = R.check(state.puzzle, p, cmd.a, cmd.b);
      p.at = sentAt;
      if (verdict === 'stale') { p.last = 'stale'; return; }     // the phone was behind: it resyncs, no mistake
      if (verdict === 'wrong') {
        p.mistakes++;
        p.last = 'wrong';
        if (R.knockedOut(state.settings, p.mistakes)) { p.out = true; p.outAt = sentAt; log(uid + ' is out'); }
      } else {
        var next = R.apply(p, cmd.a, cmd.b);
        p.a = next.a;
        p.b = next.b;
        p.swaps++;
        p.last = 'ok';
        if (R.solved(state.puzzle, p)) {
          p.done = true;
          p.doneAt = sentAt;
          p.used = sentAt - state.openAt;
          if (!state.first) {
            state.first = uid;
            // The first finisher wins; the others get a last call to place.
            state.closeAt = Math.min(state.deadline, sentAt + R.LAST_CALL_MS);
            schedule();
          }
        }
      }
      if (state.phase === 'playing') checkAllDone();
    }

    /* ---------- the end ---------- */

    function statsOf(uid) {
      var p = state.players[uid];
      return { swaps: p.swaps, mistakes: p.mistakes, done: p.done, doneAt: p.doneAt, used: p.used, out: p.out };
    }

    function finish(why) {
      if (state.phase === 'ended') return;
      var stats = {};
      state.seats.forEach(function (uid) { stats[uid] = statsOf(uid); });
      var rows = R.ranked(stats, state.seats, state.puzzle.need, state.settings);
      var top = R.winners(rows);
      state.result = {
        why: why, need: state.puzzle.need, winners: top, draw: top.length > 1,
        rows: rows.map(function (r) {
          return { uid: r.uid, place: r.place, points: r.points, swaps: r.swaps, mistakes: r.mistakes, done: r.done, out: r.out, used: r.used, accuracy: r.accuracy };
        })
      };
      var t = now();
      state.phase = 'ended';
      state.endedAt = t;
      var ranked = rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.swaps };
      });
      later(function () {
        return room.update('meta', {
          status: 'ended', endedAt: t,
          results: { gameId: 'ballSwap', startAt: state.startAt, createdAt: t, ranked: ranked }
        });
      });
      save();
      publishAll();
      schedule();
      Promise.resolve(report('ballswap', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, need: state.puzzle.need, why: why,
        seats: rows.map(function (r) {
          return { uid: r.uid, place: r.place, points: r.points, swaps: r.swaps, mistakes: r.mistakes, done: r.done, out: r.out, used: r.used, won: top.indexOf(r.uid) !== -1 };
        })
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
      return {
        a: p.a, b: p.b, n: p.n, swaps: p.swaps, mistakes: p.mistakes,
        done: p.done, out: p.out, doneAt: p.doneAt, used: p.used, last: p.last || '', at: p.at || 0
      };
    }

    function metaView() {
      var pz = state.puzzle;
      return {
        v: 1, matchId: state.matchId, phase: state.phase, startAt: state.startAt, openAt: state.openAt,
        deadline: state.deadline, closeAt: state.closeAt, first: state.first, settings: state.settings,
        order: state.seats,
        puzzle: { n: pz.n, colours: pz.colours, target: pz.target, balls: pz.balls, a: pz.a, b: pz.b, need: pz.need }
      };
    }

    /* The whole public view: at the start, the end, and after a restart. */
    function publishAll() {
      var v = metaView();
      v.p = {};
      state.seats.forEach(function (uid) { v.p[uid] = rowOf(uid); });
      if (state.phase === 'ended') v.result = state.result;
      dirty = {};
      var copy = JSON.parse(JSON.stringify(v));
      return later(function () { return room.set('bs', copy); });
    }

    function publishMeta() {
      var u = { phase: state.phase, deadline: state.deadline, closeAt: state.closeAt, first: state.first };
      return later(function () { return room.update('bs', u); });
    }

    /* Only the players whose boards changed, plus the round's clock fields. */
    function flushDirty() {
      if (state.phase === 'ended') { dirty = {}; return; }
      var uids = Object.keys(dirty);
      if (!uids.length) return;
      dirty = {};
      var u = { closeAt: state.closeAt, first: state.first };
      uids.forEach(function (uid) { u['p/' + uid] = rowOf(uid); });
      var copy = JSON.parse(JSON.stringify(u));
      save();
      later(function () { return room.update('bs', copy); });
    }

    return {
      start: start,
      stop: stop,
      // For tests and the runner's status line.
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.BallSwapReferee = { create: create, LOST_MS: LOST_MS, BRIEF_MS: BRIEF_MS };
})();
