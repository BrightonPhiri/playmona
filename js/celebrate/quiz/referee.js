/* ============================================================
   PLAYMONA — celebrate/quiz/referee.js
   The one authority for a quiz at a celebration. It runs in the
   crew runner on the server (in dev, in the organiser's or MC's
   tab) and never trusts a phone for anything.

     var ref = FF.CelebrateReferees.quiz.create({
       run,        // { runId, cid, gameId, template, name, instructions, config, teams, startAt, celebrant }
       room,       // transport scoped to celebrations/<cid>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Each question's choices are shuffled once at the start, the same
   for everyone. During a question every team has one shared pick:
   any member can set or change it until the time runs out or the
   team is sure. When every team still in the game is sure, the
   answer shows at once. Every right answer scores the same points.

   The right answer never goes to celebrations/<cid>/run before the
   reveal. The MC and the organiser read it from
   celebrations/<cid>/staff ({ runId, q, right }).

   Phones send commands to celebrations/<cid>/inbox/<uid>/<id>:
     pick {q, choice}   set the team's pick for question q
     sure {q}           lock the team's pick in
   Every command carries n, the sender's own count, so a replay
   lands once.

   The organiser or MC (through the server) writes
   celebrations/<cid>/control: { runId, id, action },
   action: next (show the answer / next question) | pause | resume | end.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.QuizRules;
  var list = R.list;

  var LOST_MS = 4000;              // a gap in someone's command numbers this old is skipped

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
    var gapTimer = null;
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
      var deck = R.playable(config).map(function (q) {
        var d = R.deal(q, randomInt);
        return { text: q.text, choices: d.choices, right: d.right };
      });
      if (!deck.length) throw new Error('The quiz has no questions.');
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
      var totals = {};
      Object.keys(teams).forEach(function (tid) { totals[tid] = { points: 0 }; });
      return {
        v: 1, runId: run.runId, cid: run.cid, gameId: run.gameId || '', name: run.name || '', instructions: run.instructions || '',
        startAt: run.startAt || 0, config: { kind: config.kind, seconds: config.seconds, points: config.points },
        deck: deck, teams: teams, members: members, order: order,
        phase: 'starting', q: -1, deadline: 0, revealUntil: 0, paused: false, pausedAt: 0,
        picks: {}, totals: totals, results: [], n: {}, said: {}, waiting: {}, why: '', result: null, control: ''
      };
    }

    function revive(s) {
      s.deck = list(s.deck).map(function (d) { d.choices = list(d.choices); return d; });
      s.order = list(s.order);
      s.results = list(s.results);
      s.members = s.members || {};
      s.picks = s.picks || {};
      s.totals = s.totals || {};
      s.n = s.n || {};
      s.said = s.said || {};
      // The database keeps an object with number keys as a list, with nulls in the gaps: back to an object.
      var waiting = {};
      Object.keys(s.waiting || {}).forEach(function (uid) {
        var q = s.waiting[uid] || {};
        var out = {};
        Object.keys(q).forEach(function (k) { if (q[k] && typeof q[k] === 'object') out[k] = q[k]; });
        if (Object.keys(out).length) waiting[uid] = out;
      });
      s.waiting = waiting;
      Object.keys(s.teams || {}).forEach(function (tid) { s.teams[tid].players = s.teams[tid].players || {}; });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.runId === run.runId) {
          state = revive(saved);
          log('resuming ' + run.runId + ' at ' + state.phase + ' question ' + (state.q + 1));
        } else {
          state = fresh();
          later(function () { return room.set('inbox', null); });
        }
        offs.push(room.watch('members', onMembers));
        offs.push(room.watch('inbox', onInbox));
        offs.push(room.watch('control', onControl));
        save();
        publish();
        schedule();
        if (state.phase === 'question') drainWaiting(false);
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (gapTimer != null) timers.clearTimeout(gapTimer);
      gapTimer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- questions ---------- */

    function hasPlayers(tid) { return !!(state.teams[tid] && Object.keys(state.teams[tid].players).length); }
    function questionMs() { return state.config.seconds * 1000; }

    function beginQuestion(i, t) {
      if (i >= state.deck.length) { finish('done', t); return; }
      state.q = i;
      state.picks = {};
      state.phase = 'question';
      state.deadline = t + questionMs();
      state.revealUntil = 0;
      save();
      publish();
      schedule();
    }

    /* Every team that still has someone in it is sure (and there is at least one). */
    function allSure() {
      var playing = state.order.filter(hasPlayers);
      return playing.length > 0 && playing.every(function (tid) { return state.picks[tid] && state.picks[tid].sure; });
    }

    function reveal(t) {
      var d = state.deck[state.q];
      var row = { round: state.q, teams: {} };
      state.order.forEach(function (tid) {
        var p = state.picks[tid];
        var got = !!(p && p.choice === d.right);
        var pts = got ? state.config.points : 0;
        state.totals[tid] = state.totals[tid] || { points: 0 };
        state.totals[tid].points += pts;
        row.teams[tid] = { points: pts, solved: got, usedMs: 0 };
      });
      state.results.push(row);
      state.phase = 'reveal';
      state.deadline = 0;
      state.revealUntil = t + R.REVEAL_MS;
      save();
      publish();
      schedule();
    }

    /* ---------- people ---------- */

    /* A guest who joins a team, or is moved, during the game picks for their team from then on.
       A guest removed from the event (their entry deleted) leaves their team. */
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
          // A team that was empty at the start plays from now on.
          if (state.order.indexOf(tid) === -1) { state.order.push(tid); state.order.sort(); }
        } else {
          delete state.members[uid];
        }
        changed = true;
      });
      if (!changed) return;
      // The teams still waiting may all have left: everyone left is sure.
      if (state.phase === 'question' && !state.paused && allSure()) { reveal(now()); return; }
      save();
      publish();
    }

    /* ---------- the clock ---------- */

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped || state.paused) return;
      var due;
      if (state.phase === 'starting') due = state.startAt;
      else if (state.phase === 'question') due = state.deadline;
      else if (state.phase === 'reveal') due = state.revealUntil;
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
        if (t < state.startAt) { schedule(); return; }
        beginQuestion(0, t);
      } else if (state.phase === 'question') {
        drainWaiting(true);
        if (state.phase !== 'question') return;
        if (t >= state.deadline) { reveal(t); return; }
        schedule();
      } else if (state.phase === 'reveal') {
        if (t < state.revealUntil) { schedule(); return; }
        beginQuestion(state.q + 1, t);
      }
    }

    /* ---------- the organiser's and MC's controls ---------- */

    function onControl(c) {
      if (!state || stopped || !c || c.runId !== state.runId || !c.id || c.id === state.control) return;
      state.control = c.id;
      var t = now();
      var action = c.action;
      if (state.phase === 'ended') { save(); return; }
      if (action === 'end') {
        if (state.paused) resumeAt(t);
        finish('stopped', t);
        return;
      }
      if (action === 'pause') {
        if (state.paused || state.phase === 'starting') { save(); return; }
        state.paused = true;
        state.pausedAt = t;
        schedule();
      } else if (action === 'resume') {
        if (!state.paused) { save(); return; }
        resumeAt(t);
        if (state.phase === 'question' && allSure()) { reveal(t); return; }
        schedule();
      } else if (action === 'next') {
        if (state.paused) resumeAt(t);
        if (state.phase === 'starting') { beginQuestion(0, t); return; }
        if (state.phase === 'question') { reveal(t); return; }
        if (state.phase === 'reveal') { beginQuestion(state.q + 1, t); return; }
      }
      save();
      publish();
    }

    /* The clock stood still while paused: push the times still ahead on by the pause. */
    function resumeAt(t) {
      var gap = Math.max(0, t - state.pausedAt);
      state.paused = false;
      state.pausedAt = 0;
      if (state.phase === 'question') state.deadline += gap;
      if (state.phase === 'reveal') state.revealUntil += gap;
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      if (!cmd || typeof cmd.type !== 'string' || typeof cmd.runId !== 'string' || typeof cmd.n !== 'number' || cmd.t == null) return false;
      if (cmd.type === 'pick') return typeof cmd.q === 'number' && typeof cmd.choice === 'number';
      if (cmd.type === 'sure') return typeof cmd.q === 'number';
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
          if (!q[cmd.n]) q[cmd.n] = { type: cmd.type, q: cmd.q, choice: cmd.choice, t: typeof cmd.t === 'number' ? cmd.t : null, got: now() };
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('inbox', clear); });
      drainWaiting(false, Object.keys(clear).length > 0);
    }

    /* Each sender's commands in the order they sent them, and across senders in the order they were
       sent (two teammates at once: the later tap is the pick that stands). A command after a missing
       number waits LOST_MS for it, then goes ahead. */
    function drainWaiting(lateOk, dirty) {
      var t = now();
      var changed = false;
      var wake = 0;
      for (;;) {
        var best = null;
        wake = 0;
        Object.keys(state.waiting).sort().forEach(function (uid) {
          var q = state.waiting[uid];
          var expect = state.n[uid] || 0;
          var keys = Object.keys(q).map(Number).sort(function (x, y) { return x - y; });
          while (keys.length && (keys[0] < expect || !q[keys[0]])) { delete q[keys[0]]; keys.shift(); }
          if (!keys.length) { delete state.waiting[uid]; return; }
          var k = keys[0];
          var cmd = q[k];
          if (k > expect && !(lateOk || t - cmd.got >= LOST_MS)) {
            if (!wake || cmd.got + LOST_MS < wake) wake = cmd.got + LOST_MS;
            return;
          }
          if (!best || sentAt(cmd) < sentAt(best.cmd)) best = { uid: uid, k: k, cmd: cmd };
        });
        if (!best) break;
        delete state.waiting[best.uid][best.k];
        state.n[best.uid] = best.k + 1;
        changed = true;
        handle(best.uid, best.k, best.cmd, t);
      }
      wakeFor(wake);
      if (changed && state.phase !== 'ended') { save(); publish(); }
      else if (dirty) save();
    }

    function sentAt(cmd) { return typeof cmd.t === 'number' ? cmd.t : cmd.got; }

    function wakeFor(due) {
      if (gapTimer != null) timers.clearTimeout(gapTimer);
      gapTimer = null;
      if (!due || stopped || state.phase === 'ended') return;
      gapTimer = timers.setTimeout(function () {
        gapTimer = null;
        if (!stopped && state && state.phase !== 'ended') drainWaiting(false);
      }, Math.max(0, due - now()));
    }

    function said(uid, n, error) { state.said[uid] = { n: n, error: error || '' }; }

    function handle(uid, n, cmd, t) {
      if (cmd.type !== 'pick' && cmd.type !== 'sure') return;
      if (state.phase !== 'question') { said(uid, n, 'late'); return; }
      if (state.paused) { said(uid, n, 'paused'); return; }
      if (cmd.q !== state.q) { said(uid, n, 'late'); return; }
      var tid = state.members[uid];
      if (!tid || !state.teams[tid]) { said(uid, n, 'noTeam'); return; }
      if (t >= state.deadline) { said(uid, n, 'late'); reveal(t); return; }
      var cur = state.picks[tid];
      if (cmd.type === 'pick') {
        var choices = state.deck[state.q].choices.length;
        if (Math.floor(cmd.choice) !== cmd.choice || cmd.choice < 0 || cmd.choice >= choices) { said(uid, n, 'badChoice'); return; }
        if (cur && cur.sure) { said(uid, n, 'locked'); return; }
        state.picks[tid] = { choice: cmd.choice, by: state.teams[tid].players[uid] || '', sure: false };
        said(uid, n, '');
        return;
      }
      if (!cur) { said(uid, n, 'noPick'); return; }
      cur.sure = true;
      said(uid, n, '');
      if (allSure()) reveal(t);
    }

    /* ---------- the end ---------- */

    function finish(why, t) {
      if (state.phase === 'ended') return;
      var rows = R.ranked(state.totals, state.order);
      state.phase = 'ended';
      state.endedAt = t;
      state.paused = false;
      state.deadline = 0;
      state.revealUntil = 0;
      state.result = { why: why, rows: rows, winners: rows.filter(function (r) { return r.place === 1 && r.points > 0; }).map(function (r) { return r.teamId; }) };
      save();
      publish();
      schedule();
      Promise.resolve(report('celebration', {
        runId: state.runId, cid: state.cid, gameId: state.gameId, template: 'quiz', why: why,
        rounds: state.results,
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
      var totals = {};
      Object.keys(state.totals).forEach(function (tid) { totals[tid] = { points: state.totals[tid].points }; });
      var c = state.config;
      var v = {
        v: 1, runId: state.runId, gameId: state.gameId, template: 'quiz', kind: c.kind, name: state.name, instructions: state.instructions,
        phase: state.phase, startAt: state.startAt, paused: state.paused, q: state.q, total: state.deck.length,
        seconds: c.seconds, points: c.points, question: null, deadline: state.deadline, revealUntil: state.revealUntil,
        teams: teams, order: state.order, picks: null, totals: totals, said: state.said, n: state.n,
        result: state.phase === 'ended' ? state.result : null
      };
      if (state.phase === 'question' || state.phase === 'reveal') {
        var d = state.deck[state.q];
        v.question = { text: d.text, choices: d.choices };
        v.picks = state.picks;
        if (state.phase === 'question' && state.paused) v.leftMs = Math.max(0, state.deadline - state.pausedAt);
        // The answer reaches the phones and the TV only now.
        if (state.phase === 'reveal') {
          v.right = d.right;
          v.got = {};
          state.order.forEach(function (tid) { var p = state.picks[tid]; v.got[tid] = !!(p && p.choice === d.right); });
        }
      }
      return v;
    }

    function publish() {
      if (!state) return;
      var v = JSON.parse(JSON.stringify(view()));
      later(function () { return room.set('run', v); });
      var live = state.phase === 'question' || state.phase === 'reveal';
      var staff = live ? { runId: state.runId, q: state.q, right: state.deck[state.q].right } : null;
      later(function () { return room.set('staff', staff); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.CelebrateReferees = FF.CelebrateReferees || {};
  FF.CelebrateReferees.quiz = { create: create, REVEAL_MS: R.REVEAL_MS, LOST_MS: LOST_MS };
})();
