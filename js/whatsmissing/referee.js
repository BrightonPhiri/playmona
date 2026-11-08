/* ============================================================
   PLAYMONA — whatsmissing/referee.js
   The one authority for an online What's Missing? match. It runs on
   the server (inside the Node crew runner), never on a player's
   phone except in dev rooms.

   It picks the match seed with the server's random and keeps it
   secret. Each round it publishes the study board, then (once the
   study time is up) hides it and publishes the changed board, so
   nobody can keep the first board on screen. The answer stays on
   the server until the reveal. It takes one answer per player per
   round, checks it with the shared rules (FF.WhatsMissingRules.check
   and .points, the same code the phones use), times it by the
   database's own clock, and shows everyone's results together after
   the round. Phones only see rooms/<code>/wm and answer through
   rooms/<code>/wmInbox/<uid>/<cmdId>.

   Phases: starting -> study -> change -> open -> reveal -> ... -> ended.

     var ref = FF.WhatsMissingReferee.create({
       run,        // { matchId, roomCode, seats, settings, startAt, seed? }
       room,       // transport scoped to rooms/<code>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Answers are plain strings, so the dev transport's field-by-field
   delivery can never split one: picks 'id,id', text 'Name|Name',
   slots '3,7'. Empty board slots are '' in the view (the database
   drops nulls from lists).

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WhatsMissingRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var CHANGE_MS = 1200;            // the tiles flip and the board changes
  var REVEAL_MS = 4500;            // everyone's results, then the next board
  var GRACE_MS = 600;              // an answer sent this soon after the clock still counts
  var MAX_TEXT = 40;

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  function board(cells) { return cells.map(function (id) { return id || ''; }); }

  /* The shape of a name for the letter slots, without its letters: _ is a letter. */
  function shapeOf(cells) {
    return cells.map(function (c) { return c.letter ? '_' : c.ch; }).join('');
  }

  /* An answer from the inbox, cut to what the round can use. */
  function parse(rd, cmd) {
    var a = {};
    if (typeof cmd.slots === 'string') {
      a.slots = cmd.slots.split(',').slice(0, 2).map(function (s) { return s === '' ? NaN : Number(s); });
    } else if (typeof cmd.text === 'string') {
      a.text = cmd.text.split('|').slice(0, rd.gaps).map(function (s) { return s.slice(0, MAX_TEXT); });
    } else if (typeof cmd.picks === 'string') {
      a.picks = cmd.picks.split(',').slice(0, rd.gaps).map(function (s) { return s.slice(0, MAX_TEXT); });
    }
    return a;
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
    var rounds = {};       // k -> round, dealt once (not saved: the seed deals it again)

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function roundOf(k) {
      if (!rounds[k]) {
        var rd = R.deal(state.settings, state.seed, k);
        if (rd.spell && FF.SpellTiles) {
          // The same tiles for everyone in the room, from the seed (the normal tile count).
          rd.tiles = rd.answer.ids.map(function (id, gap) {
            var set = FF.SpellTiles.deal(R.cardOf(id).name, R.rng(R.hash('spell|' + state.seed + '|' + k + '|' + gap)), {});
            return { shape: shapeOf(set.cells), tiles: set.tiles.join('') };
          });
        }
        rounds[k] = rd;
      }
      return rounds[k];
    }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }
    function blank() { return { score: 0, streak: 0, best: 0, right: 0, ms: 0, last: null }; }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error("What's Missing? takes 1 to " + R.MAX_PLAYERS + ' players.');
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: R.sanitizeRoom(run.settings), seed: run.seed || makeSeed(), seats: seats, players: {},
        phase: 'starting', k: -1, studyAt: (run.startAt || 0) + BRIEF_MS, changeAt: 0, openAt: 0, closeAt: 0, nextAt: 0,
        answers: {}, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = blank(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.players = s.players || {};
      s.answers = s.answers || {};
      s.settings = R.sanitizeRoom(s.settings);
      s.seats.forEach(function (uid) { if (!s.players[uid]) s.players[uid] = blank(); });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.matchId === run.matchId) {
          state = revive(saved);
          log('resuming ' + run.matchId + ' at ' + state.phase + ' ' + state.k);
          // Phones may have missed part of the study board while the referee was away: study it again.
          if (state.phase === 'study') timeRound(now());
        } else {
          fresh();
          later(function () { return room.set('wmInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'open') checkAllIn(); }));
        offs.push(room.watch('wmInbox', onInbox));
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
        case 'starting': return state.studyAt;
        case 'study': return state.changeAt;
        case 'change': return state.openAt;
        case 'open': return state.closeAt + GRACE_MS;
        default: return state.nextAt;
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
        case 'starting': nextRound(state.studyAt); return;
        case 'study': move('change'); return;
        case 'change': move('open'); return;
        case 'open': reveal(); return;
        case 'reveal':
          if (state.k + 1 >= state.settings.rounds) finish('done');
          else nextRound(state.nextAt);
      }
    }

    function move(phase) {
      state.phase = phase;
      save();
      publish();
      schedule();
    }

    function nextRound(at) {
      state.k++;
      state.answers = {};
      timeRound(at);
      move('study');
    }

    /* The round's clock. Never from the past: a referee that starts late or comes back
       after a crash still gives everyone the whole study time (the study is the round). */
    function timeRound(at) {
      var rd = roundOf(state.k);
      at = Math.max(at, now());
      state.studyAt = at;
      state.changeAt = at + state.settings.seconds * 1000;
      state.openAt = state.changeAt + CHANGE_MS;
      state.closeAt = state.openAt + rd.secs * 1000;
      state.nextAt = 0;
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
        typeof cmd.t === 'number' && (typeof cmd.picks === 'string' || typeof cmd.text === 'string' || typeof cmd.slots === 'string');
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
      if (Object.keys(clear).length) later(function () { return room.update('wmInbox', clear); });
      if (changed) {
        save();
        publishAnswered();
        if (state.phase === 'open') checkAllIn();
      }
    }

    /* One answer per player per round, sent while answers were open. */
    function take(uid, cmd) {
      var p = state.players[uid];
      if (!p || cmd.matchId !== state.matchId) return false;
      if (cmd.k !== state.k || state.answers[uid] || state.phase !== 'open') return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt || sentAt > state.closeAt + GRACE_MS) return false;
      var rd = roundOf(state.k);
      var ans = parse(rd, cmd);
      var res = R.check(rd, ans);
      var ms = Math.max(0, Math.min(rd.secs * 1000, sentAt - state.openAt));
      var streak = res.ok ? p.streak + 1 : 0;
      var pts = R.points({ round: rd, res: res, ms: ms, secs: rd.secs, streak: streak });
      var a = {
        k: state.k, ok: !!res.ok, right: res.right, rightGaps: res.rightGaps, ms: ms, pts: pts.total,
        base: pts.base, speed: pts.speed, bonus: pts.bonus, mult: pts.mult, streak: streak
      };
      // What they said, for the results (picks and text as lists, slots as numbers).
      if (ans.slots) a.slots = ans.slots.map(function (s) { return isNaN(s) ? -1 : s; });
      if (ans.text) a.text = ans.text;
      if (ans.picks) a.picks = ans.picks;
      state.answers[uid] = a;
      return true;
    }

    /* ---------- the reveal ---------- */

    function reveal() {
      if (state.phase !== 'open') return;
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        var a = state.answers[uid] || { k: state.k, ok: false, right: [], rightGaps: 0, ms: 0, pts: 0, base: 0, speed: 0, bonus: 0, mult: 1, streak: 0, none: true };
        p.streak = a.ok ? a.streak : 0;
        p.best = Math.max(p.best, p.streak);
        if (a.ok) { p.right++; p.ms += a.ms; }
        p.score += a.pts;
        p.last = a;
      });
      state.revealAt = now();
      state.nextAt = state.revealAt + REVEAL_MS;
      move('reveal');
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
      state.endedAt = t;
      var platform = rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.right };
      });
      later(function () {
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'whatsMissing', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      move('ended');
      Promise.resolve(report('whatsmissing', {
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

    /* What a phone may see of a round in this phase. */
    function roundView(rd) {
      var v = { k: state.k, n: rd.n, cols: rd.cols, rows: rd.rows, slots: rd.slots };
      var ph = state.phase;
      if (ph === 'study') v.before = board(rd.before);
      if (ph === 'open' || ph === 'reveal' || ph === 'ended') {
        v.after = board(rd.after);
        v.twist = rd.twist;
        v.gaps = rd.gaps;
        v.spell = !!rd.spell;
        v.secs = rd.secs;
        // Where the gaps are: they are empty on the board anyway, and the answer is what was in them.
        if (rd.twist === 'gone' || rd.twist === 'several') v.holes = rd.answer.slots;
        if (rd.choices) v.choices = rd.choices;
        if (rd.tiles) v.tiles = rd.tiles;
      }
      if (ph === 'reveal' || ph === 'ended') {
        v.before = board(rd.before);
        v.answer = { slots: rd.answer.slots, ids: rd.answer.ids };
      }
      return v;
    }

    /* The public view: the seed, the coming boards and the answer before the reveal are never in it. */
    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: state.settings.rounds, settings: state.settings,
        order: state.seats, startAt: state.startAt, studyAt: state.studyAt, changeAt: state.changeAt, openAt: state.openAt,
        closeAt: state.closeAt, nextAt: state.nextAt, p: {}
      };
      if (state.k >= 0) v.round = roundView(roundOf(state.k));
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) { v.p[uid] = rowOf(uid); });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('wm', copy); });
    }

    /* Who has answered (not what): just the ticks. */
    function publishAnswered() {
      var u = {};
      state.seats.forEach(function (uid) { u['p/' + uid + '/inK'] = state.answers[uid] ? state.k : -1; });
      return later(function () { return room.update('wm', u); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.WhatsMissingReferee = {
    create: create, parse: parse,
    BRIEF_MS: BRIEF_MS, CHANGE_MS: CHANGE_MS, REVEAL_MS: REVEAL_MS, GRACE_MS: GRACE_MS
  };
})();
