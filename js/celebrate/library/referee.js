/* ============================================================
   PLAYMONA — celebrate/library/referee.js
   The one authority for a library game at a celebration. It runs
   in the crew runner on the server (in dev, in the organiser's or
   MC's tab).

     var ref = FF.CelebrateReferees.library.create({
       run,        // { runId, cid, gameId, template, name, instructions, config, teams, startAt, waitReady }
       room,       // transport scoped to celebrations/<cid>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   After the ready gate and countdown it makes one seed for the run;
   every phone plays the game from it on the game page, so every
   group gets the same questions. Each phone sends its score once:
     celebrations/<cid>/inbox/<uid>/<id>: score { score, ms }
   The first score from a phone counts; a team keeps its best. The
   game ends when every team has a score, when the time to play
   runs out, or when the MC presses End. Scores are the phones' own
   reports: this referee cannot check them.

   The organiser or MC (through the server) writes
   celebrations/<cid>/control: { runId, id, action },
   action: next (start now) | end. Pause does nothing here.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.LibraryRules;
  var READY_COUNTDOWN_MS = 10000;
  var SEED_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
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
    var offs = [];
    var timer = null;
    var stopped = false;
    var writes = Promise.resolve();

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var config = R.sanitize(run.config);
      if (!config.game) throw new Error('No game was chosen.');
      var teams = {};
      var members = {};
      Object.keys(run.teams || {}).sort().forEach(function (tid) {
        var t = run.teams[tid] || {};
        var players = {};
        list(t.members).forEach(function (m) {
          if (!m || typeof m.uid !== 'string') return;
          members[m.uid] = tid;
          players[m.uid] = String(m.name || '').slice(0, 24);
        });
        teams[tid] = { name: String(t.name || ''), color: String(t.color || ''), players: players };
      });
      var order = Object.keys(teams).filter(function (tid) { return Object.keys(teams[tid].players).length > 0; });
      if (!order.length) throw new Error('No team has anyone in it.');
      return {
        v: 1, runId: run.runId, cid: run.cid, gameId: run.gameId || '', name: run.name || '', instructions: run.instructions || '',
        game: config.game, minutes: config.minutes, prize: config.prize, seed: '',
        startAt: run.startAt || 0, waitReady: !!run.waitReady, ready: {}, phase: 'starting', endsAt: 0,
        teams: teams, members: members, order: order, mine: {}, best: {}, control: '', result: null
      };
    }

    function revive(s) {
      s.ready = s.ready || {};
      s.order = list(s.order);
      s.members = s.members || {};
      s.mine = s.mine || {};
      s.best = s.best || {};
      Object.keys(s.teams || {}).forEach(function (tid) { s.teams[tid].players = s.teams[tid].players || {}; });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.runId === run.runId) {
          state = revive(saved);
          log('resuming ' + run.runId + ' at ' + state.phase);
        } else {
          state = fresh();
          later(function () { return room.set('inbox', null); });
        }
        offs.push(room.watch('members', onMembers));
        offs.push(room.watch('inbox', onInbox));
        offs.push(room.watch('control', onControl));
        offs.push(room.watch('ready', onReady));
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

    function newSeed() {
      var s = '';
      for (var i = 0; i < 12; i++) s += SEED_CHARS[randomInt(SEED_CHARS.length)];
      return s;
    }

    function beginPlaying(t) {
      state.phase = 'playing';
      state.seed = state.seed || newSeed();
      state.endsAt = t + state.minutes * 60000;
      save();
      publish();
      schedule();
    }

    /* ---------- people ---------- */

    function hasPlayers(tid) { return !!(state.teams[tid] && Object.keys(state.teams[tid].players).length); }

    /* Every team that still has someone in it has a score (and there is at least one). */
    function allIn() {
      var playing = state.order.filter(hasPlayers);
      return playing.length > 0 && playing.every(function (tid) { return !!state.best[tid]; });
    }

    /* A guest who joins a team, or is moved, during the game plays for their team from then on. */
    function onMembers(tree) {
      if (!state || stopped || !tree || state.phase === 'ended') return;
      var changed = false;
      var uids = Object.keys(tree);
      Object.keys(state.members).forEach(function (uid) { if (!Object.prototype.hasOwnProperty.call(tree, uid)) uids.push(uid); });
      uids.forEach(function (uid) {
        var m = tree[uid];
        var tid = m && typeof m.team === 'string' && state.teams[m.team] ? m.team : '';
        var was = state.members[uid] || '';
        if (tid === was) return;
        if (was && state.teams[was]) delete state.teams[was].players[uid];
        if (tid) {
          state.members[uid] = tid;
          state.teams[tid].players[uid] = String((m && m.name) || '').slice(0, 24);
          if (state.order.indexOf(tid) === -1) { state.order.push(tid); state.order.sort(); }
        } else {
          delete state.members[uid];
        }
        changed = true;
      });
      if (!changed) return;
      if (state.phase === 'playing' && allIn()) { finish('done', now()); return; }
      save();
      publish();
    }

    /* ---------- the clock ---------- */

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      if (state.phase === 'starting' && state.waitReady) return;
      var due = state.phase === 'starting' ? state.startAt : state.endsAt;
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, due - now()));
    }

    function onClock() {
      var t = now();
      if (state.phase === 'starting') {
        if (state.waitReady || t < state.startAt) { schedule(); return; }
        beginPlaying(t);
      } else if (state.phase === 'playing') {
        if (t >= state.endsAt) { finish('time', t); return; }
        schedule();
      }
    }

    /* ---------- ready: each team presses "We're ready", then the countdown starts ---------- */

    function notReady() {
      var has = {};
      Object.keys(state.members).forEach(function (uid) { has[state.members[uid]] = true; });
      return Object.keys(state.teams).filter(function (tid) { return has[tid] && !state.ready[tid]; });
    }

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
      publish();
    }

    function countdown(t) {
      state.waitReady = false;
      state.startAt = t + READY_COUNTDOWN_MS;
      save();
      publish();
      schedule();
    }

    function onControl(c) {
      if (!state || stopped || !c || c.runId !== state.runId || !c.id || c.id === state.control) return;
      state.control = c.id;
      var t = now();
      if (state.phase === 'ended') { save(); return; }
      if (c.action === 'end') { finish('stopped', t); return; }
      if (c.action === 'next' && state.phase === 'starting') {
        if (state.waitReady) { countdown(t); return; }
        beginPlaying(t);
        return;
      }
      save();
    }

    /* ---------- scores ---------- */

    function complete(cmd) {
      return !!cmd && typeof cmd.type === 'string' && typeof cmd.runId === 'string' && typeof cmd.n === 'number' && cmd.t != null &&
        (cmd.type !== 'score' || (typeof cmd.score === 'number' && typeof cmd.ms === 'number'));
    }

    function onInbox(tree) {
      // Once ended, the inbox belongs to the next game: the crew keeps this referee a minute longer.
      if (!state || stopped || !tree || state.phase === 'ended') return;
      var clear = {};
      var changed = false;
      var t = now();
      Object.keys(tree).sort().forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).sort().forEach(function (id) {
          var cmd = cmds[id];
          // The dev transport delivers one field at a time: wait for the whole command.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          if (take(uid, cmd, t)) changed = true;
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('inbox', clear); });
      if (!changed) return;
      if (allIn()) { finish('done', t); return; }
      save();
      publish();
    }

    /* One phone's score: the first one counts, and the team keeps its best. */
    function take(uid, cmd, t) {
      if (cmd.type !== 'score' || cmd.runId !== state.runId || state.phase !== 'playing') return false;
      if (Object.prototype.hasOwnProperty.call(state.mine, uid)) return false;
      var tid = state.members[uid];
      if (!tid || !state.teams[tid] || !R.validScore(cmd.score)) return false;
      var score = Math.round(cmd.score);
      state.mine[uid] = score;
      var cur = state.best[tid];
      if (!cur || score > cur.score) state.best[tid] = { score: score, at: t, by: state.teams[tid].players[uid] || '' };
      return true;
    }

    /* ---------- the end ---------- */

    function finish(why, t) {
      if (state.phase === 'ended') return;
      var rows = R.ranked(state.best, state.order.concat(Object.keys(state.teams).filter(function (tid) { return state.order.indexOf(tid) === -1; })), state.prize);
      state.phase = 'ended';
      state.endedAt = t;
      state.result = { why: why, rows: rows, winners: rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.teamId; }) };
      var round = { round: 0, teams: {} };
      rows.forEach(function (r) { round.teams[r.teamId] = { points: r.points, solved: r.place > 0, usedMs: 0 }; });
      save();
      publish();
      schedule();
      Promise.resolve(report('celebration', {
        runId: state.runId, cid: state.cid, gameId: state.gameId, template: 'library', why: why,
        rounds: [round],
        ranked: rows.map(function (r) { return { teamId: r.teamId, place: r.place, points: r.points }; })
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    function view() {
      var teams = {};
      Object.keys(state.teams).forEach(function (tid) {
        var t = state.teams[tid];
        teams[tid] = { name: t.name, color: t.color, players: t.players };
      });
      var finished = {};
      Object.keys(state.best).forEach(function (tid) { finished[tid] = { score: state.best[tid].score, by: state.best[tid].by }; });
      return {
        v: 1, runId: state.runId, gameId: state.gameId, template: 'library', game: state.game, name: state.name, instructions: state.instructions,
        phase: state.phase, startAt: state.startAt, waitReady: !!state.waitReady, ready: state.ready || {},
        // The seed reaches the phones only once the game is on.
        seed: state.phase === 'starting' ? '' : state.seed,
        minutes: state.minutes, prize: state.prize, endsAt: state.endsAt,
        teams: teams, order: state.order, finished: finished, mine: state.mine, total: state.order.filter(hasPlayers).length,
        result: state.phase === 'ended' ? state.result : null
      };
    }

    function publish() {
      if (!state) return;
      var v = JSON.parse(JSON.stringify(view()));
      later(function () { return room.set('run', v); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.CelebrateReferees = FF.CelebrateReferees || {};
  FF.CelebrateReferees.library = { create: create };
})();
