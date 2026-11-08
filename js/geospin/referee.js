/* ============================================================
   PLAYMONA — geospin/referee.js
   The one authority for an online GeoSpin match. It runs on the
   server (inside the Node crew runner), never on a player's phone
   except in dev rooms.

   It picks the match seed with the server's random and keeps it
   secret, so nobody can work out the coming countries. For each
   round it publishes only that round's country, the name to spell
   and the letter bank, at the moment the globe starts to spin, so
   every phone spins in step. It takes one answer per player per
   round, checks it with the shared rules (FF.GeoSpinRules.check,
   the same checker the phones use), times it by the database's own
   clock, scores it, and shows everyone's results together after
   the round. Phones only see rooms/<code>/gs and answer through
   rooms/<code>/gsInbox/<uid>/<cmdId>.

     var ref = FF.GeoSpinReferee.create({
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

  var R = FF.GeoSpinRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var GRACE_MS = 600;              // an answer sent this soon after the clock still counts (it was on its way)
  var MAX_TEXT = 60;

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
    var codes = null;      // the match's countries, from the seed (not saved)
    var rounds = {};       // k -> round, dealt once

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function roundOf(k) {
      if (!codes) codes = R.deal(state.settings, state.seed, state.settings.rounds);
      if (!rounds[k]) rounds[k] = R.roundAt(state.settings, state.seed, k, codes);
      return rounds[k];
    }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('GeoSpin takes 1 to ' + R.MAX_PLAYERS + ' players.');
      var settings = R.sanitize(run.settings);
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: settings, seed: run.seed || makeSeed(), seats: seats, players: {},
        phase: 'starting', k: -1, spinAt: (run.startAt || 0) + BRIEF_MS, openAt: 0, closeAt: 0, nextAt: 0,
        answers: {}, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = { score: 0, streak: 0, best: 0, right: 0, ms: 0, last: null }; });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.players = s.players || {};
      s.answers = s.answers || {};
      s.settings = R.sanitize(s.settings);
      s.seats.forEach(function (uid) { if (!s.players[uid]) s.players[uid] = { score: 0, streak: 0, best: 0, right: 0, ms: 0, last: null }; });
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
          later(function () { return room.set('gsInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'open') checkAllIn(); }));
        offs.push(room.watch('gsInbox', onInbox));
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

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      var due = state.phase === 'starting' ? state.spinAt
        : state.phase === 'spin' ? state.openAt
        : state.phase === 'open' ? state.closeAt + GRACE_MS
        : state.nextAt;
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, due - now()));
    }

    function onClock() {
      var t = now();
      if (state.phase === 'starting') { if (t >= state.spinAt) nextRound(state.spinAt); else schedule(); return; }
      if (state.phase === 'spin') {
        if (t < state.openAt) { schedule(); return; }
        state.phase = 'open';
        save();
        publish();
        schedule();
        return;
      }
      if (state.phase === 'open') { if (t >= state.closeAt + GRACE_MS) reveal(); else schedule(); return; }
      if (state.phase === 'reveal') {
        if (t < state.nextAt) { schedule(); return; }
        if (state.k + 1 >= state.settings.rounds) finish('done');
        else nextRound(state.nextAt);
      }
    }

    function nextRound(at) {
      state.k++;
      state.answers = {};
      var rd = roundOf(state.k);
      state.phase = 'spin';
      state.spinAt = at;
      state.openAt = at + R.SPIN_MS;
      state.closeAt = state.openAt + rd.seconds * 1000;
      state.nextAt = 0;
      save();
      publish();
      schedule();
    }

    /* Everyone still here has answered: no reason to wait for the clock. */
    function checkAllIn() {
      var t = now();
      var known = Object.keys(players).length > 0;
      var waiting = state.seats.some(function (uid) {
        if (state.answers[uid]) return false;
        return !known || online(players[uid], t);
      });
      if (!waiting) { reveal(); return true; }
      return false;
    }

    /* ---------- answers ---------- */

    function complete(cmd) {
      return !!cmd && cmd.type === 'answer' && typeof cmd.matchId === 'string' && typeof cmd.k === 'number' &&
        typeof cmd.text === 'string' && typeof cmd.t === 'number';
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
      if (Object.keys(clear).length) later(function () { return room.update('gsInbox', clear); });
      if (changed) {
        save();
        publishAnswered();
        if (state.phase === 'open') checkAllIn();
      }
    }

    /* One answer per player per round, sent while the round was open. */
    function take(uid, cmd) {
      var p = state.players[uid];
      if (!p || cmd.matchId !== state.matchId) return false;
      if (cmd.k !== state.k || state.answers[uid]) return false;
      if (state.phase !== 'open' && state.phase !== 'spin') return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt || sentAt > state.closeAt + GRACE_MS) return false;
      var rd = roundOf(state.k);
      var text = String(cmd.text).slice(0, MAX_TEXT);
      var res = text ? R.check(text, rd.code) : { ok: false };
      var ms = Math.max(0, Math.min(rd.seconds * 1000, sentAt - state.openAt));
      var streak = res.ok ? p.streak + 1 : 0;
      var pts = R.points({ level: state.settings.level, ok: res.ok, ms: ms, secs: rd.seconds, streak: streak });
      state.answers[uid] = {
        k: state.k, ok: !!res.ok, text: text, near: res.near || '', ms: ms, pts: pts.total,
        base: pts.base, speed: pts.speed, mult: pts.mult, streak: streak
      };
      return true;
    }

    /* ---------- the reveal ---------- */

    function reveal() {
      if (state.phase !== 'open' && state.phase !== 'spin') return;
      var rd = roundOf(state.k);
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        var a = state.answers[uid] || { k: state.k, ok: false, text: '', near: '', ms: 0, pts: 0, base: 0, speed: 0, mult: 1, streak: 0 };
        p.streak = a.ok ? a.streak : 0;
        p.best = Math.max(p.best, p.streak);
        if (a.ok) { p.right++; p.ms += a.ms; }
        p.score += a.pts;
        p.last = a;
      });
      state.phase = 'reveal';
      state.revealAt = now();
      state.nextAt = state.revealAt + R.REVEAL_MS;
      state.reveal = { k: state.k, code: rd.code, name: rd.name };
      save();
      publish();
      schedule();
    }

    /* ---------- the end ---------- */

    function ranked() {
      var rows = state.seats.map(function (uid) {
        var p = state.players[uid];
        return { uid: uid, points: p.score, right: p.right, best: p.best, ms: p.ms };
      });
      rows.sort(function (a, b) { return b.points - a.points || b.right - a.right || a.ms - b.ms; });
      rows.forEach(function (r, i) {
        var prev = rows[i - 1];
        r.place = prev && prev.points === r.points && prev.right === r.right && prev.ms === r.ms ? prev.place : i + 1;
      });
      return rows;
    }

    function finish(why) {
      if (state.phase === 'ended') return;
      var rows = ranked();
      var top = rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.uid; });
      state.result = { why: why, winners: top, draw: top.length > 1, rows: rows };
      var t = now();
      state.phase = 'ended';
      state.endedAt = t;
      var platform = rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.right };
      });
      later(function () {
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'geoSpin', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('geospin', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, why: why,
        seats: rows.map(function (r) { return { uid: r.uid, place: r.place, points: r.points, correct: r.right, best: r.best, won: top.indexOf(r.uid) !== -1 }; })
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
      var row = { score: p.score, streak: p.streak, best: p.best, right: p.right, inK: state.answers[uid] ? state.k : -1 };
      // Results are shown together, after the round, never while others still answer.
      if (p.last && (state.phase === 'reveal' || state.phase === 'ended' || p.last.k < state.k)) row.last = p.last;
      return row;
    }

    /* The public view: the seed and future countries are never in it. */
    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: state.settings.rounds, settings: state.settings,
        order: state.seats, startAt: state.startAt, spinAt: state.spinAt, openAt: state.openAt, closeAt: state.closeAt,
        nextAt: state.nextAt, p: {}
      };
      if (state.k >= 0) {
        var rd = roundOf(state.k);
        v.round = { k: state.k, code: rd.code, target: rd.target, tiles: rd.tiles.join('') };
      }
      if (state.phase === 'reveal' && state.reveal) v.reveal = state.reveal;
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) { v.p[uid] = rowOf(uid); });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('gs', copy); });
    }

    /* Who has answered (not what): just the ticks. */
    function publishAnswered() {
      var u = {};
      state.seats.forEach(function (uid) { u['p/' + uid + '/inK'] = state.answers[uid] ? state.k : -1; });
      return later(function () { return room.update('gs', u); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.GeoSpinReferee = { create: create, BRIEF_MS: BRIEF_MS, GRACE_MS: GRACE_MS };
})();
