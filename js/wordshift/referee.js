/* ============================================================
   PLAYMONA — wordshift/referee.js
   The one authority for an online WordShift Race. It runs on the
   server (inside the Node crew runner), never on a player's phone
   except in dev rooms. Modelled on js/saywhat/referee.js.

   It picks the match seed with the server's random and keeps it
   secret. Each round everyone gets the same puzzle:
     ready   the start and target words are published
     open    moves are taken until the clock runs out or everyone
             still here has reached the target
     reveal  each player's result and the shortest length
   Every move is checked here with FF.WordShiftRules.checkMove and the
   word list. A player's own words go only to wordshiftMine/<code>/<uid>
   (readable by that player alone, outside the room, which any signed-in
   player can read); the shared view rooms/<code>/ws
   shows other players as counts: moves, green letters, done.
   Phones move through wordshiftInbox/<code>/<uid>/<cmdId> (outside the
   room, which any signed-in player can read; phones may write it, never read it) with
   { matchId, k, word, t }.

     var ref = FF.WordShiftReferee.create({
       run,        // { matchId, roomCode, seats, settings, startAt, seed? }
       room,       // transport scoped to rooms/<code>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       mine,       // { set(uid, v), clear() } -> Promise: wordshiftMine/<code>
       inbox,      // transport rooted at wordshiftInbox/<code>: watch, set, update
       randomInt, timers, log, report(event, payload), onEnd,
       puzzles,    // defaults to FF.data.wordshift.puzzles
       isWord      // defaults to FF.Words (tiers 1-4)
     });
     ref.start(); ... ref.stop();

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordShiftRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var READY_MS = 1500;             // the puzzle is drawn on every phone before the clock starts
  var GRACE_MS = 600;              // a move sent this soon after the clock still counts

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  function newPlayer() { return { score: 0, wins: 0, ms: 0 }; }

  /* Points first, then rounds won, then the faster total time; equal rows share a place. */
  function rank(rows) {
    rows = rows.slice().sort(function (a, b) { return b.points - a.points || b.wins - a.wins || a.ms - b.ms; });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.place = prev && prev.points === r.points && prev.wins === r.wins && prev.ms === r.ms ? prev.place : i + 1;
    });
    return rows;
  }

  function defaultIsWord(w) { return !!(FF.Words && /^[a-z]+$/.test(w) && FF.Words.tier(w) > 0); }

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
    var puzzles = opts.puzzles || (FF.data && FF.data.wordshift && FF.data.wordshift.puzzles) || [];
    var isWord = opts.isWord || defaultIsWord;
    var mineStore = opts.mine;
    if (!mineStore) throw new Error('WordShift referee needs a mine store (wordshiftMine/<code>).');
    var inbox = opts.inbox;
    if (!inbox) throw new Error('WordShift referee needs its inbox (wordshiftInbox/<code>).');

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
    function puzzleAt(k) { return R.byId(puzzles, state.deal[k]); }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('WordShift takes 1 to ' + R.MAX_PLAYERS + ' players.');
      var settings = R.sanitizeRoom(run.settings);
      var seed = run.seed || makeSeed();
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: settings, seed: seed, deal: R.raceDeal(puzzles, settings.level, seed, settings.rounds),
        seats: seats, players: {}, phase: 'starting', k: -1,
        readyAt: (run.startAt || 0) + BRIEF_MS, openAt: 0, closeAt: 0, nextAt: 0,
        runs: {}, handled: {}, finished: 0, last: null, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = newPlayer(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.deal = list(s.deal);
      s.players = s.players || {};
      s.runs = s.runs || {};
      s.handled = s.handled || {};
      Object.keys(s.runs).forEach(function (uid) { s.runs[uid].used = list(s.runs[uid].used); });
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
          later(function () { return inbox.set('', null); });
          later(function () { return mineStore.clear(); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'open') checkAllIn(); }));
        offs.push(inbox.watch('', onInbox));
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
        if (state.k + 1 >= state.deal.length) finish('done');
        else nextRound(state.nextAt);
      }
    }

    function nextRound(at) {
      state.k++;
      var p = puzzleAt(state.k);
      state.runs = {};
      state.handled = {};   // the commands taken this round, by uid/id: an echo is never taken twice
      state.finished = 0;
      state.seats.forEach(function (uid) { state.runs[uid] = { word: p.s, used: [p.s], moves: 0, invalid: 0, done: false, ms: 0, place: 0 }; });
      state.last = null;
      state.phase = 'ready';
      state.readyAt = at;
      state.openAt = at + READY_MS;
      state.closeAt = state.openAt + state.settings.clock * 1000;
      state.nextAt = 0;
      save();
      publish();
      state.seats.forEach(function (uid) { publishMine(uid, null); });
      schedule();
    }

    /* Everyone still here has reached the target: no reason to wait for the clock. */
    function checkAllIn() {
      var t = now();
      var known = Object.keys(players).length > 0;
      var waiting = state.seats.some(function (uid) {
        if (state.runs[uid] && state.runs[uid].done) return false;
        return !known || online(players[uid], t);
      });
      if (!waiting) { reveal(); return true; }
      return false;
    }

    /* ---------- moves ---------- */

    function complete(cmd) {
      return !!cmd && typeof cmd.matchId === 'string' && typeof cmd.k === 'number' &&
        typeof cmd.word === 'string' && typeof cmd.t === 'number';
    }

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      var changed = false;
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        // In the order they were sent (ids are random), then by id for equal times.
        Object.keys(cmds).filter(function (id) { return complete(cmds[id]); }).sort(function (a, b) {
          return (cmds[a].t - cmds[b].t) || (a < b ? -1 : a > b ? 1 : 0);
        }).forEach(function (id) {
          var cmd = cmds[id];
          // (The dev transport delivers a command one field at a time: incomplete ones wait.)
          clear[uid + '/' + id] = null;
          // A command can come back before its clear lands (another write, a restart): take it once.
          var hk = uid + '/' + id;
          if (state.handled[hk]) return;
          state.handled[hk] = 1;
          changed = true;
          take(uid, cmd);
        });
      });
      if (Object.keys(clear).length) later(function () { return inbox.update('', clear); });
      if (changed) {
        save();
        publishProgress();
        if (state.phase === 'open') checkAllIn();
      }
    }

    function take(uid, cmd) {
      var r = state.runs[uid];
      if (!r || cmd.matchId !== state.matchId) return false;
      if (cmd.k !== state.k || state.phase !== 'open' || r.done) return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt || sentAt > state.closeAt + GRACE_MS) return false;
      if (r.moves + r.invalid >= R.MAX_MOVES) return false;
      var p = puzzleAt(state.k);
      var word = R.clean(cmd.word).slice(0, 12);
      var res = R.checkMove(r.word, word, r.used, isWord);
      if (!res.ok) {
        if (res.reason !== 'same') r.invalid++;
        publishMine(uid, { word: word, ok: false, reason: res.reason });
        return true;
      }
      r.word = word;
      r.used.push(word);
      r.moves++;
      if (word === p.t) {
        r.done = true;
        r.ms = Math.max(0, sentAt - state.openAt);
        state.finished++;
        r.place = state.finished;
      }
      publishMine(uid, { word: word, ok: true });
      return true;
    }

    /* ---------- the reveal ---------- */

    function roundPoints(r, p) {
      if (!r.done) return 0;
      var extra = Math.max(0, r.moves - p.n);
      var pts = R.racePoints(r.place) + Math.max(0, R.SCORING.efficiency - R.SCORING.perExtra * extra) - R.SCORING.perInvalid * r.invalid;
      return Math.max(0, pts);
    }

    function reveal() {
      if (state.phase !== 'open') return;
      var p = puzzleAt(state.k);
      var results = {};
      state.seats.forEach(function (uid) {
        var r = state.runs[uid];
        var pl = state.players[uid];
        var pts = roundPoints(r, p);
        pl.score += pts;
        if (r.done) { pl.ms += r.ms; if (r.place === 1) pl.wins++; }
        results[uid] = { done: r.done, moves: r.moves, invalid: r.invalid, place: r.place, ms: r.ms, points: pts };
      });
      state.phase = 'reveal';
      state.revealAt = now();
      state.nextAt = state.revealAt + R.REVEAL_MS;
      state.last = { k: state.k, s: p.s, t: p.t, n: p.n, results: results };
      save();
      publish();
      schedule();
    }

    /* ---------- the end ---------- */

    function finish(why) {
      if (state.phase === 'ended') return;
      var rows = rank(state.seats.map(function (uid) {
        var pl = state.players[uid];
        return { uid: uid, points: pl.score, wins: pl.wins, ms: pl.ms };
      }));
      var top = rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.uid; });
      state.result = { why: why, winners: top, draw: top.length > 1, rows: rows };
      var t = now();
      state.phase = 'ended';
      state.endedAt = t;
      var platform = rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.wins };
      });
      later(function () {
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'wordShift', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('wordshift', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, why: why,
        seats: rows.map(function (r) { return { uid: r.uid, place: r.place, points: r.points, wins: r.wins, won: top.indexOf(r.uid) !== -1 }; })
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    function progress(uid) {
      var r = state.runs[uid];
      var p = state.k >= 0 ? puzzleAt(state.k) : null;
      var pl = state.players[uid];
      if (!r || !p) return { score: pl.score, moves: 0, greens: 0, invalid: 0, done: false, place: 0 };
      return { score: pl.score, moves: r.moves, greens: R.greenCount(r.word, p.t), invalid: r.invalid, done: r.done, place: r.place };
    }

    /* The shared view: the seed, coming puzzles and every player's words are never in it. */
    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: state.deal.length, settings: state.settings,
        order: state.seats, startAt: state.startAt, readyAt: state.readyAt, openAt: state.openAt, closeAt: state.closeAt,
        nextAt: state.nextAt, p: {}
      };
      if (state.k >= 0 && state.phase !== 'ended') {
        var pz = puzzleAt(state.k);
        v.puzzle = { id: pz.id, s: pz.s, t: pz.t, lv: pz.lv };
      }
      if (state.phase === 'reveal' && state.last) v.last = state.last;
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) { v.p[uid] = progress(uid); });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('ws', copy); });
    }

    function publishProgress() {
      var u = {};
      state.seats.forEach(function (uid) { u['p/' + uid] = progress(uid); });
      return later(function () { return room.update('ws', u); });
    }

    /* The player's own words, for their phone only. */
    function publishMine(uid, last) {
      var r = state.runs[uid];
      var mine = { matchId: state.matchId, k: state.k, word: r.word, used: r.used.slice(), moves: r.moves, invalid: r.invalid, done: r.done };
      if (last) mine.last = last;
      return later(function () { return mineStore.set(uid, mine); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.WordShiftReferee = { create: create, rank: rank, BRIEF_MS: BRIEF_MS, READY_MS: READY_MS, GRACE_MS: GRACE_MS };
})();
