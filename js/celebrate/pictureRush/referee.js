/* ============================================================
   PLAYMONA — celebrate/pictureRush/referee.js
   The one authority for a Picture Rush game at a celebration.
   It runs in the crew runner on the server (in dev, in the
   organiser's tab) and never trusts a phone's word for anything.

     var ref = FF.CelebrateReferees.pictureRush.create({
       run,        // { runId, cid, gameId, template, name, instructions, config, teams, startAt }
       room,       // transport scoped to celebrations/<cid>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Phones read celebrations/<cid>/run (written only here) and
   send commands to celebrations/<cid>/inbox/<uid>/<id>:
     pick {a}            hold the tile at position a
     drop                let go of it
     swap {a, b, pa, pb} swap positions a and b, which held pieces pa and pb
     hint                show the whole picture for a moment (counts against the team)
   Each team has one board that all its members share. Swaps land
   in the order they arrive, so the board is always a whole picture.
   A swap made from an out-of-date board (pa or pb moved) is refused,
   and a tile a teammate is holding can't be taken. Every command
   carries n, the sender's own count, so a replay lands once.
   The organiser (through the server) writes celebrations/<cid>/control:
   { runId, id, action: next | pause | resume | end }.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.PictureRushRules;
  var list = R.list;

  var LOST_MS = 4000;             // a gap in someone's command numbers this old is skipped
  var ROUND_BREAK_MS = 15000;     // the round table stays up this long before the next round
  var CHECK_MS = 5000;

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
    var offs = [];
    var timer = null;
    var stopped = false;
    var writes = Promise.resolve();
    var dirty = {};          // team ids whose boards changed since the last write
    var dirtyN = {};         // senders whose command count changed

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var config = R.sanitize(run.config);
      if (!config.photos.length) throw new Error('Picture Rush needs at least one photo.');
      var teams = {};
      var members = {};
      Object.keys(run.teams || {}).forEach(function (tid) {
        var t = run.teams[tid] || {};
        var players = {};
        list(t.members).forEach(function (m) {
          if (!m || typeof m.uid !== 'string') return;
          members[m.uid] = tid;
          players[m.uid] = String(m.name || '').slice(0, 24);
        });
        teams[tid] = { name: String(t.name || ''), color: String(t.color || ''), players: players };
      });
      if (!Object.keys(teams).length) throw new Error('No team has anyone in it.');
      var totals = {};
      Object.keys(teams).forEach(function (tid) { totals[tid] = { points: 0, usedMs: 0, lastFinish: 0, solvedRounds: 0 }; });
      return {
        v: 1, runId: run.runId, cid: run.cid, gameId: run.gameId || '', name: run.name || '', instructions: run.instructions || '',
        startAt: run.startAt || 0, config: config, size: R.grid(config), rounds: config.rounds,
        teams: teams, members: members,
        phase: 'starting', waitReady: !!run.waitReady, ready: {}, round: -1, playAt: 0, revealUntil: 0, deadline: 0, nextAt: 0,
        paused: false, pausedAt: 0, pausedMs: 0,
        start: [], startCorrect: 0, boards: {}, n: {}, waiting: {},
        results: [], totals: totals, result: null, control: ''
      };
    }

    function revive(s) {
      s.ready = s.ready || {};
      s.config.photos = list(s.config.photos);
      s.start = list(s.start);
      s.results = list(s.results);
      s.boards = s.boards || {};
      s.n = s.n || {};
      s.waiting = s.waiting || {};
      s.members = s.members || {};
      Object.keys(s.teams || {}).forEach(function (tid) { s.teams[tid].players = s.teams[tid].players || {}; });
      Object.keys(s.boards).forEach(function (tid) {
        var b = s.boards[tid];
        b.tiles = list(b.tiles);
        b.held = b.held || {};
      });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.runId === run.runId) {
          state = revive(saved);
          log('resuming ' + run.runId + ' at ' + state.phase + ' round ' + (state.round + 1));
        } else {
          state = fresh();
          later(function () { return room.set('inbox', null); });
        }
        offs.push(room.watch('members', onMembers));
        offs.push(room.watch('inbox', onInbox));
        offs.push(room.watch('control', onControl));
        offs.push(room.watch('ready', onReady));
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

    /* ---------- people ---------- */

    /* A guest who joins a team, or is moved, during the game plays for their team from then on. */
    function onMembers(tree) {
      if (!state || stopped || !tree) return;
      var changed = false;
      Object.keys(tree).forEach(function (uid) {
        var m = tree[uid];
        var tid = m && typeof m.team === 'string' && state.teams[m.team] ? m.team : '';
        var was = state.members[uid] || '';
        if (tid === was) return;
        if (was) {
          delete state.teams[was].players[uid];
          if (state.boards[was] && state.boards[was].held[uid]) { delete state.boards[was].held[uid]; dirty[was] = true; }
        }
        if (tid) {
          state.members[uid] = tid;
          state.teams[tid].players[uid] = String((m && m.name) || '').slice(0, 24);
        } else {
          delete state.members[uid];
        }
        changed = true;
      });
      if (changed) { save(); publishTeams(); flushDirty(); }
    }

    /* ---------- the clock ---------- */

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped || state.paused) return;
      // Waiting for the teams to press "We're ready": no clock yet.
      if (state.phase === 'starting' && state.waitReady) return;
      var due;
      if (state.phase === 'starting') due = state.startAt;
      else if (state.phase === 'reveal') due = state.revealUntil;
      else if (state.phase === 'playing') due = Math.min(state.deadline, now() + CHECK_MS);
      else if (state.phase === 'roundEnd') due = state.nextAt;
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, due - now()));
    }

    function onClock() {
      var t = now();
      if (state.paused) return;
      if (state.phase === 'starting') {
        if (state.waitReady || t < state.startAt) { schedule(); return; }
        beginRound(0, t);
      } else if (state.phase === 'reveal') {
        if (t < state.revealUntil) { schedule(); return; }
        state.phase = 'playing';
        save();
        publishMeta();
        schedule();
      } else if (state.phase === 'playing') {
        drainWaiting(true);
        if (state.phase !== 'playing') return;
        if (t >= state.deadline) { endRound(t); return; }
        schedule();
      } else if (state.phase === 'roundEnd') {
        if (t < state.nextAt) { schedule(); return; }
        next(t);
      }
    }

    function beginRound(i, t) {
      var cfg = state.config;
      var tiles = R.scramble(state.size, randomInt);
      state.round = i;
      state.start = tiles;
      state.startCorrect = R.correct(tiles);
      state.pausedMs = 0;
      state.boards = {};
      Object.keys(state.teams).forEach(function (tid) {
        state.boards[tid] = { tiles: tiles.slice(), held: {}, solved: false, solvedAt: 0, usedMs: 0, moves: 0, hints: 0, hintUntil: 0, correct: state.startCorrect };
      });
      // Everyone sees the picture whole first (if the organiser chose a reveal), then plays.
      state.revealUntil = t + cfg.reveal * 1000;
      state.playAt = state.revealUntil;
      state.deadline = state.playAt + cfg.seconds * 1000;
      state.phase = cfg.reveal > 0 ? 'reveal' : 'playing';
      state.nextAt = 0;
      dirty = {};
      save();
      publishAll();
      schedule();
    }

    function next(t) {
      if (state.round + 1 < state.rounds) beginRound(state.round + 1, t);
      else finish('done', t);
    }

    /* ---------- the organiser's controls ---------- */

    /* ---------- ready: each team presses "We're ready", then the countdown starts ---------- */

    var READY_COUNTDOWN_MS = 10000;

    /* Teams with someone in them that have not pressed yet. */
    function notReady() {
      var has = {};
      Object.keys(state.members).forEach(function (uid) { has[state.members[uid]] = true; });
      return Object.keys(state.teams).filter(function (tid) { return has[tid] && !state.ready[tid]; });
    }

    /* ready/<uid> holds the run a phone pressed "We're ready" for; one press readies the whole team. */
    function onReady(tree) {
      if (!state || stopped || !tree || state.phase !== 'starting' || !state.waitReady) return;
      var changed = false;
      Object.keys(tree).forEach(function (uid) {
        var tid = state.members[uid];
        if (tree[uid] === state.runId && tid && state.teams[tid] && !state.ready[tid]) { state.ready[tid] = true; changed = true; }
      });
      if (!changed) return;
      if (!notReady().length) { countdown(now()); return; }
      save();
      publishMeta();
    }

    /* Every team is ready, or the MC pressed Start now: the countdown begins. */
    function countdown(t) {
      state.waitReady = false;
      state.startAt = t + READY_COUNTDOWN_MS;
      save();
      publishMeta();
      schedule();
    }

    function onControl(c) {
      if (!state || stopped || !c || c.runId !== state.runId || !c.id || c.id === state.control) return;
      state.control = c.id;
      var t = now();
      var action = c.action;
      if (action === 'end') {
        if (state.paused) resumeAt(t);
        if (state.phase === 'reveal' || state.phase === 'playing') endRound(t, true);
        finish('stopped', t);
        return;
      }
      if (action === 'pause') {
        if (state.paused || state.phase === 'ended' || state.phase === 'starting') { save(); return; }
        state.paused = true;
        state.pausedAt = t;
        schedule();
      } else if (action === 'resume') {
        if (!state.paused) { save(); return; }
        resumeAt(t);
        schedule();
      } else if (action === 'next') {
        if (state.paused) resumeAt(t);
        // While teams are getting ready, Start now begins the countdown.
        if (state.phase === 'starting' && state.waitReady) { countdown(t); return; }
        if (state.phase === 'starting') { beginRound(0, t); return; }
        if (state.phase === 'reveal') {
          // Skip the rest of the reveal: the round's full time starts now.
          state.phase = 'playing';
          state.playAt = t;
          state.deadline = t + state.config.seconds * 1000;
        } else if (state.phase === 'playing') {
          endRound(t);
          return;
        } else if (state.phase === 'roundEnd') {
          next(t);
          return;
        }
        schedule();
      }
      save();
      publishMeta();
    }

    /* The clock stood still while paused: push every time still ahead on by the pause. */
    function resumeAt(t) {
      var gap = Math.max(0, t - state.pausedAt);
      state.paused = false;
      state.pausedAt = 0;
      if (state.phase === 'reveal') { state.revealUntil += gap; state.playAt += gap; state.deadline += gap; }
      if (state.phase === 'playing') { state.deadline += gap; state.pausedMs += gap; }
      if (state.phase === 'roundEnd') state.nextAt += gap;
      Object.keys(state.boards).forEach(function (tid) {
        var b = state.boards[tid];
        if (b.hintUntil > t - gap) b.hintUntil += gap;
        Object.keys(b.held).forEach(function (uid) { b.held[uid].at += gap; });
      });
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      if (!cmd || typeof cmd.type !== 'string' || typeof cmd.runId !== 'string' || typeof cmd.n !== 'number' || cmd.t == null) return false;
      if (cmd.type === 'pick') return typeof cmd.a === 'number';
      if (cmd.type === 'swap') return typeof cmd.a === 'number' && typeof cmd.b === 'number' && typeof cmd.pa === 'number' && typeof cmd.pb === 'number';
      return true;
    }

    function onInbox(tree) {
      // Once ended, the inbox belongs to the next game: the crew keeps this referee a minute longer.
      if (!state || stopped || !tree || state.phase === 'ended') return;
      var clear = {};
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).forEach(function (id) {
          var cmd = cmds[id];
          // The dev transport delivers one field at a time: wait for the whole command.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          if (cmd.runId !== state.runId) return;
          var q = state.waiting[uid] = state.waiting[uid] || {};
          if (!q[cmd.n]) {
            q[cmd.n] = { type: cmd.type, a: cmd.a, b: cmd.b, pa: cmd.pa, pb: cmd.pb, t: typeof cmd.t === 'number' ? cmd.t : now(), got: now() };
          }
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('inbox', clear); });
      drainWaiting(false);
    }

    /* Each sender's commands in the order they sent them. */
    function drainWaiting(lateOk) {
      var t = now();
      Object.keys(state.waiting).forEach(function (uid) {
        var q = state.waiting[uid];
        var expect = state.n[uid] || 0;
        for (;;) {
          var keys = Object.keys(q).map(Number).sort(function (x, y) { return x - y; });
          if (!keys.length) break;
          var k = keys[0];
          if (k < expect) { delete q[k]; continue; }                 // a replay or a double tap
          if (k > expect && !(lateOk || t - q[k].got >= LOST_MS)) break;   // wait a moment for a missing one
          var cmd = q[k];
          delete q[k];
          expect = k + 1;
          state.n[uid] = expect;
          dirtyN[uid] = true;
          handle(uid, cmd, t);
          if (state.phase === 'ended' || state.phase === 'roundEnd') break;
        }
        if (!Object.keys(q).length) delete state.waiting[uid];
      });
      flushDirty();
    }

    function holder(board, pos, uid, t) {
      var who = '';
      Object.keys(board.held).forEach(function (other) {
        var h = board.held[other];
        if (other === uid || h.pos !== pos) return;
        if (t - h.at > R.HOLD_MS) { delete board.held[other]; return; }    // held too long: free again
        who = other;
      });
      return who;
    }

    function handle(uid, cmd, t) {
      var tid = state.members[uid];
      var board = tid && state.boards[tid];
      if (!board || state.phase !== 'playing' || state.paused || board.solved) return;
      if (t >= state.deadline) return;
      var total = board.tiles.length;
      var inRange = function (x) { return typeof x === 'number' && x >= 0 && x < total && Math.floor(x) === x; };
      if (cmd.type === 'pick') {
        if (!inRange(cmd.a)) return;
        if (holder(board, cmd.a, uid, t)) return;              // a teammate has it
        board.held[uid] = { pos: cmd.a, at: t };
        dirty[tid] = true;
      } else if (cmd.type === 'drop') {
        if (board.held[uid]) { delete board.held[uid]; dirty[tid] = true; }
      } else if (cmd.type === 'swap') {
        var a = cmd.a, b = cmd.b;
        var mine = board.held[uid];
        delete board.held[uid];
        dirty[tid] = true;
        if (!inRange(a) || !inRange(b) || a === b) return;
        if (board.tiles[a] !== cmd.pa || board.tiles[b] !== cmd.pb) return;      // the phone was behind
        if (holder(board, a, uid, t) || holder(board, b, uid, t)) return;
        if (mine && mine.pos !== a && mine.pos !== b) { /* they let go of another tile: fine */ }
        board.tiles = R.swap(board.tiles, a, b);
        board.moves++;
        board.correct = R.correct(board.tiles);
        if (R.solved(board.tiles)) {
          board.solved = true;
          board.solvedAt = t;
          board.usedMs = Math.max(0, t - state.playAt - state.pausedMs);
          board.held = {};
          if (Object.keys(state.boards).every(function (id) { return state.boards[id].solved; })) endRound(t);
        }
      } else if (cmd.type === 'hint') {
        if (board.hints >= state.config.hints) return;
        board.hints++;
        board.hintUntil = t + R.HINT_SHOW_MS;
        dirty[tid] = true;
      }
    }

    /* ---------- rounds and the end ---------- */

    function endRound(t, early) {
      if (state.phase !== 'playing' && state.phase !== 'reveal') return;
      var roundMs = state.config.seconds * 1000;
      var row = { round: state.round, photo: state.config.photos[state.round].id, teams: {} };
      Object.keys(state.boards).forEach(function (tid) {
        var b = state.boards[tid];
        var used = b.solved ? b.usedMs : roundMs;
        var r = { solved: b.solved, usedMs: used, hints: b.hints, correct: b.correct, startCorrect: state.startCorrect, size: state.size };
        var points = R.roundPoints(state.config.scoring, r, roundMs);
        row.teams[tid] = { points: points, solved: b.solved, usedMs: used, moves: b.moves, hints: b.hints, correct: b.correct, total: b.tiles.length };
        var tot = state.totals[tid];
        tot.points += points;
        tot.usedMs += used;
        if (b.solved) { tot.solvedRounds++; tot.lastFinish = b.solvedAt; }
        b.held = {};
      });
      state.results.push(row);
      state.phase = 'roundEnd';
      state.nextAt = early ? t : t + ROUND_BREAK_MS;
      dirty = {};
      save();
      publishAll();
      schedule();
    }

    function finish(why, t) {
      if (state.phase === 'ended') return;
      var rows = R.ranked(state.totals);
      state.phase = 'ended';
      state.endedAt = t;
      state.paused = false;
      state.result = { why: why, rows: rows, winners: rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.teamId; }) };
      save();
      publishAll();
      schedule();
      Promise.resolve(report('celebration', {
        runId: state.runId, cid: state.cid, gameId: state.gameId, template: 'pictureRush', why: why,
        rounds: state.results.map(function (r) {
          var teams = {};
          Object.keys(r.teams).forEach(function (tid) {
            var x = r.teams[tid];
            teams[tid] = { points: x.points, solved: x.solved, usedMs: x.usedMs, moves: x.moves, hints: x.hints };
          });
          return { round: r.round, teams: teams };
        }),
        ranked: rows
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    function boardView(tid) {
      var b = state.boards[tid];
      var held = {};
      Object.keys(b.held).forEach(function (uid) { held[uid] = b.held[uid].pos; });
      return { tiles: b.tiles, held: held, solved: b.solved, solvedAt: b.solvedAt, usedMs: b.usedMs, moves: b.moves, hints: b.hints, hintUntil: b.hintUntil, correct: b.correct };
    }

    function photoView() {
      var p = state.config.photos[state.round];
      if (!p) return null;
      // The title is the answer to "what was it?": only once the round is over.
      var show = state.phase === 'roundEnd' || state.phase === 'ended';
      return { url: p.url || '', hint: p.hint || '', title: show ? (p.title || '') : '' };
    }

    function teamsView() {
      var out = {};
      Object.keys(state.teams).forEach(function (tid) {
        var t = state.teams[tid];
        out[tid] = { name: t.name, color: t.color, players: t.players };
      });
      return out;
    }

    function metaView() {
      var c = state.config;
      return {
        v: 1, runId: state.runId, gameId: state.gameId, template: 'pictureRush', name: state.name, instructions: state.instructions,
        phase: state.phase, round: state.round, rounds: state.rounds, startAt: state.startAt, waitReady: !!state.waitReady, ready: state.ready || {}, playAt: state.playAt,
        revealUntil: state.revealUntil, deadline: state.deadline, nextAt: state.nextAt,
        paused: state.paused, pausedAt: state.pausedAt, size: state.size,
        settings: { level: c.level, seconds: c.seconds, reveal: c.reveal, hints: c.hints },
        photo: photoView()
      };
    }

    /* The whole public view: at each phase change and after a restart. */
    function publishAll() {
      var v = metaView();
      v.teams = teamsView();
      v.boards = {};
      Object.keys(state.boards).forEach(function (tid) { v.boards[tid] = boardView(tid); });
      v.n = state.n;
      v.results = state.results;
      v.totals = state.totals;
      v.result = state.phase === 'ended' ? state.result : null;
      dirty = {};
      dirtyN = {};
      var copy = JSON.parse(JSON.stringify(v));
      return later(function () { return room.set('run', copy); });
    }

    function publishMeta() {
      var u = metaView();
      return later(function () { return room.update('run', JSON.parse(JSON.stringify(u))); });
    }

    function publishTeams() {
      var u = { teams: teamsView() };
      return later(function () { return room.update('run', JSON.parse(JSON.stringify(u))); });
    }

    /* Only the boards that changed, and the senders' counts. */
    function flushDirty() {
      if (state.phase === 'ended') { dirty = {}; dirtyN = {}; return; }
      var tids = Object.keys(dirty);
      var uids = Object.keys(dirtyN);
      if (!tids.length && !uids.length) return;
      dirty = {};
      dirtyN = {};
      var u = {};
      tids.forEach(function (tid) { if (state.boards[tid]) u['boards/' + tid] = boardView(tid); });
      uids.forEach(function (uid) { u['n/' + uid] = state.n[uid]; });
      save();
      var copy = JSON.parse(JSON.stringify(u));
      later(function () { return room.update('run', copy); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.CelebrateReferees = FF.CelebrateReferees || {};
  FF.CelebrateReferees.pictureRush = { create: create, LOST_MS: LOST_MS, ROUND_BREAK_MS: ROUND_BREAK_MS };
})();
