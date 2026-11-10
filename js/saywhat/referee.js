/* ============================================================
   PLAYMONA — saywhat/referee.js
   The one authority for an online Say What? Race. It runs on the
   server (inside the Node crew runner), never on a player's phone
   except in dev rooms. Modelled on js/logorush/referee.js.

   It picks the match seed with the server's random and keeps it
   secret, so nobody can work out the coming sayings. Each round goes:
     ready   the saying is published with its gaps as placeholders
             ({ gap, len }), masked slots and tiles, or the choices
     open    answers are taken until the clock runs out or everyone
             seated has answered
     reveal  the whole saying, its meaning and everyone's results
   The gap words are never in the view before the reveal. It takes one
   answer per player per round, checks it with FF.SayWhatRules.check
   (the same checker the phones use), times it by the database's own
   clock, keeps each player's streak and scores it. Phones only see
   rooms/<code>/sw and answer through rooms/<code>/swInbox/<uid>/<cmdId>
   with { matchId, k, text, t }; two gaps are sent as 'A B'.

     var ref = FF.SayWhatReferee.create({
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

  var R = FF.SayWhatRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var READY_MS = 1000;             // the saying is drawn on every phone before the clock starts
  var GRACE_MS = 600;              // an answer sent this soon after the clock still counts
  var MAX_TEXT = 60;
  var SEP = '|';                   // between choices in the view (a two-word choice has a space)

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  /* The slots without the letters: '_' to spell, a space between words, marks as they are. */
  function masked(cells) {
    return cells.map(function (c) { return c.letter ? '_' : c.gap ? ' ' : c.ch; }).join('');
  }
  function newPlayer() { return { score: 0, streak: 0, best: 0, right: 0, ms: 0 }; }

  /* Points first, then right answers, then the faster total time; equal rows share a place. */
  function rank(rows) {
    rows = rows.slice().sort(function (a, b) { return b.points - a.points || b.right - a.right || a.ms - b.ms; });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.place = prev && prev.points === r.points && prev.right === r.right && prev.ms === r.ms ? prev.place : i + 1;
    });
    return rows;
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
    var items = null;      // the match's sayings, from the seed (not saved)
    var rounds = {};       // k -> round, dealt once

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function roundOf(k) {
      if (!items) items = R.deal(state.settings, state.seed, state.settings.rounds).items;
      if (!rounds[k]) rounds[k] = R.roundAt(state.settings, state.seed, k, items[k]);
      return rounds[k];
    }
    function total() {
      if (!items) items = R.deal(state.settings, state.seed, state.settings.rounds).items;
      return items.length;
    }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('Say What? takes 1 to ' + R.MAX_PLAYERS + ' players.');
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: R.sanitizeRoom(run.settings), seed: run.seed || makeSeed(), seats: seats, players: {},
        phase: 'starting', k: -1, readyAt: (run.startAt || 0) + BRIEF_MS, openAt: 0, closeAt: 0, nextAt: 0,
        answers: {}, last: null, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = newPlayer(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.players = s.players || {};
      s.answers = s.answers || {};
      s.settings = R.sanitizeRoom(s.settings);
      s.seats.forEach(function (uid) { if (!s.players[uid]) s.players[uid] = newPlayer(); });
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
          later(function () { return room.set('swInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'open') checkAllIn(); }));
        offs.push(room.watch('swInbox', onInbox));
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
      var due = state.phase === 'starting' ? state.readyAt
        : state.phase === 'ready' ? state.openAt
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
      if (state.phase === 'starting') { if (t >= state.readyAt) nextRound(state.readyAt); else schedule(); return; }
      if (state.phase === 'ready') {
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
        if (state.k + 1 >= total()) finish('done');
        else nextRound(state.nextAt);
      }
    }

    function nextRound(at) {
      state.k++;
      state.answers = {};
      state.last = null;
      var rd = roundOf(state.k);
      state.phase = 'ready';
      state.readyAt = at;
      state.openAt = at + READY_MS;
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
      return !!cmd && typeof cmd.matchId === 'string' && typeof cmd.k === 'number' &&
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
      if (Object.keys(clear).length) later(function () { return room.update('swInbox', clear); });
      if (changed) {
        save();
        publishAnswered();
        if (state.phase === 'open') checkAllIn();
      }
    }

    /* One answer per player per round, sent while the round was open. Scored at the reveal,
       where the streak is known. */
    function take(uid, cmd) {
      if (!state.players[uid] || cmd.matchId !== state.matchId) return false;
      if (cmd.k !== state.k || state.answers[uid] || state.phase !== 'open') return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt || sentAt > state.closeAt + GRACE_MS) return false;
      var rd = roundOf(state.k);
      var text = String(cmd.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      var res = text ? R.check(rd, text) : { ok: false };
      var ms = Math.max(0, Math.min(rd.seconds * 1000, sentAt - state.openAt));
      state.answers[uid] = { ok: !!res.ok, text: text, ms: ms };
      return true;
    }

    /* ---------- the reveal ---------- */

    function reveal() {
      if (state.phase !== 'open') return;
      var rd = roundOf(state.k);
      var results = {};
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        var a = state.answers[uid] || { ok: false, text: '', ms: 0 };
        p.streak = a.ok ? p.streak + 1 : 0;
        p.best = Math.max(p.best, p.streak);
        var pts = R.points({ level: rd.level, ok: a.ok, ms: a.ms, secs: rd.seconds, two: rd.two, streak: p.streak });
        if (a.ok) { p.right++; p.ms += a.ms; }
        p.score += pts.total;
        results[uid] = { ok: a.ok, text: a.text, ms: a.ms, points: pts.total, bonus: pts.streak, answered: !!state.answers[uid] };
      });
      state.phase = 'reveal';
      state.revealAt = now();
      state.nextAt = state.revealAt + R.REVEAL_MS;
      state.last = { k: state.k, text: rd.text, target: rd.target, gaps: rd.gaps, meaning: rd.meaning, pack: rd.pack, results: results };
      save();
      publish();
      schedule();
    }

    /* ---------- the end ---------- */

    function finish(why) {
      if (state.phase === 'ended') return;
      var rows = rank(state.seats.map(function (uid) {
        var p = state.players[uid];
        return { uid: uid, points: p.score, right: p.right, best: p.best, ms: p.ms };
      }));
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
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'sayWhat', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('saywhat', {
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

    /* The public view: the seed, future sayings and this saying's gap words are never in it
       before the reveal. */
    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: total(), settings: state.settings,
        order: state.seats, startAt: state.startAt, readyAt: state.readyAt, openAt: state.openAt, closeAt: state.closeAt,
        nextAt: state.nextAt, p: {}
      };
      if (state.k >= 0 && state.phase !== 'ended') {
        var rd = roundOf(state.k);
        var r = { k: state.k, words: rd.words, seconds: rd.seconds, two: rd.two, level: rd.level, pack: rd.pack };
        if (state.settings.answer === 'choice') r.choices = rd.choices.join(SEP);
        else { r.cells = masked(rd.cells); r.tiles = rd.tiles.join(''); }
        v.round = r;
      }
      if (state.phase === 'reveal' && state.last) v.last = state.last;
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        v.p[uid] = { score: p.score, streak: p.streak, best: p.best, right: p.right, inK: state.answers[uid] ? state.k : -1 };
      });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('sw', copy); });
    }

    /* Who has answered (not what): just the ticks. */
    function publishAnswered() {
      var u = {};
      state.seats.forEach(function (uid) { u['p/' + uid + '/inK'] = state.answers[uid] ? state.k : -1; });
      return later(function () { return room.update('sw', u); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.SayWhatReferee = { create: create, rank: rank, masked: masked, BRIEF_MS: BRIEF_MS, READY_MS: READY_MS, GRACE_MS: GRACE_MS, SEP: SEP };
})();
