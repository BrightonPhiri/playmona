/* ============================================================
   PLAYMONA — celebrate/wordByWord/referee.js
   The one authority for a Word by Word game at a celebration.
   It runs in the crew runner on the server (in dev, in the
   organiser's or MC's tab) and never trusts a phone's word for
   anything.

     var ref = FF.CelebrateReferees.wordByWord.create({
       run,        // { runId, cid, gameId, template, name, instructions, config, teams, startAt, celebrant }
       room,       // transport scoped to celebrations/<cid>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, isWord, isQuiet, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   The teams take turns in an order shuffled at the start, one
   word a turn, until every team has had its rounds, a team ends
   the message (once the organiser's minimum is reached) or the
   MC ends it. Then the whole message is revealed.

   Phones read celebrations/<cid>/run (written only here) and
   send commands to celebrations/<cid>/inbox/<uid>/<id>:
     word {word, end, turn}   the word for turn `turn`; end: make it the last word
   Only a member of the team on its turn can send, only for that
   turn and only before its time runs out. A refused word keeps
   the turn. Every command carries n, the sender's own count, so
   a replay lands once.

   Blind mode: the run shows only the last word and the count.
   The whole message goes to celebrations/<cid>/staff, which only
   the MC and the organiser can read, until the reveal.

   The organiser or MC (through the server) writes
   celebrations/<cid>/control: { runId, id, action, index? },
   action: next (skip this turn) | pause | resume | end | strike (remove word `index`).
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordByWordRules;
  var list = R.list;

  var LOST_MS = 4000;              // a gap in someone's command numbers this old is skipped
  var REVEAL_MS_PER_WORD = 600;    // the reveal shows a word this often
  var REVEAL_MIN_MS = 3000;

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
      for (var i = order.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var x = order[i]; order[i] = order[j]; order[j] = x;
      }
      var totals = {};
      Object.keys(teams).forEach(function (tid) { totals[tid] = { points: 0, usedMs: 0 }; });
      return {
        v: 1, runId: run.runId, cid: run.cid, gameId: run.gameId || '', name: run.name || '', instructions: run.instructions || '',
        startAt: run.startAt || 0, config: config, known: R.known(config.names, run.celebrant), teams: teams, members: members,
        order: order, phase: 'starting', turn: -1, endsAt: 0, paused: false, pausedAt: 0,
        words: [], totals: totals, n: {}, said: {}, waiting: {}, revealUntil: 0, why: '', result: null, control: ''
      };
    }

    function revive(s) {
      s.order = list(s.order);
      s.words = list(s.words);
      s.config.names = list(s.config.names);
      s.known = s.known || {};
      s.members = s.members || {};
      s.n = s.n || {};
      s.said = s.said || {};
      s.waiting = s.waiting || {};
      s.totals = s.totals || {};
      Object.keys(s.teams || {}).forEach(function (tid) { s.teams[tid].players = s.teams[tid].players || {}; });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.runId === run.runId) {
          state = revive(saved);
          log('resuming ' + run.runId + ' at ' + state.phase + ' turn ' + state.turn);
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
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- turns ---------- */

    function totalTurns() { return state.config.rounds * state.order.length; }
    function teamOf(k) { return state.order[k % state.order.length]; }
    function hasPlayers(tid) { return !!(state.teams[tid] && Object.keys(state.teams[tid].players).length); }
    function turnMs() { return state.config.seconds * 1000; }

    /* Turn k, or the first one after it whose team still has someone in it. */
    function beginTurn(k, t) {
      while (k < totalTurns() && !hasPlayers(teamOf(k))) k++;
      if (k >= totalTurns()) { endMessage('done', t); return; }
      state.turn = k;
      state.endsAt = t + turnMs();
      state.phase = 'playing';
      save();
      publish();
      schedule();
    }

    /* The team on its turn spent `used` of it and did not add a word. */
    function skipTurn(t, used) {
      var tid = teamOf(state.turn);
      if (state.totals[tid]) state.totals[tid].usedMs += Math.max(0, Math.min(turnMs(), used));
      beginTurn(state.turn + 1, t);
    }

    /* No more words: reveal the message, or (with no words at all) go straight to the end. */
    function endMessage(why, t) {
      state.why = why;
      if (!state.words.length) { finish(why, t); return; }
      var shown = state.words.length + (state.config.opening ? state.config.opening.split(' ').length : 0);
      state.phase = 'reveal';
      state.revealUntil = t + Math.max(REVEAL_MIN_MS, shown * REVEAL_MS_PER_WORD);
      state.endsAt = 0;
      save();
      publish();
      schedule();
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
        if (was) delete state.teams[was].players[uid];
        if (tid) {
          state.members[uid] = tid;
          state.teams[tid].players[uid] = String((m && m.name) || '').slice(0, 24);
        } else {
          delete state.members[uid];
        }
        changed = true;
      });
      if (!changed) return;
      // The team on its turn has nobody left: move on now.
      if (state.phase === 'playing' && !state.paused && !hasPlayers(teamOf(state.turn))) {
        var t = now();
        skipTurn(t, turnMs() - Math.max(0, state.endsAt - t));
        return;
      }
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
      else if (state.phase === 'playing') due = state.endsAt;
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
        beginTurn(0, t);
      } else if (state.phase === 'playing') {
        drainWaiting(true);
        if (state.phase !== 'playing') return;
        if (t >= state.endsAt) { skipTurn(t, turnMs()); return; }
        schedule();
      } else if (state.phase === 'reveal') {
        if (t < state.revealUntil) { schedule(); return; }
        finish(state.why || 'done', t);
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
        if (state.phase === 'reveal') finish(state.why || 'stopped', t);
        else endMessage('stopped', t);
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
        schedule();
      } else if (action === 'next') {
        if (state.paused) resumeAt(t);
        if (state.phase === 'starting') { beginTurn(0, t); return; }
        if (state.phase === 'playing') { skipTurn(t, turnMs() - Math.max(0, state.endsAt - t)); return; }
        if (state.phase === 'reveal') { finish(state.why || 'done', t); return; }
      } else if (action === 'strike') {
        strike(c.index);
      }
      save();
      publish();
    }

    /* The clock stood still while paused: push the times still ahead on by the pause. */
    function resumeAt(t) {
      var gap = Math.max(0, t - state.pausedAt);
      state.paused = false;
      state.pausedAt = 0;
      if (state.phase === 'playing') state.endsAt += gap;
      if (state.phase === 'reveal') state.revealUntil += gap;
    }

    /* The MC takes a word out of the message, and its points with it. The turn is not played again. */
    function strike(index) {
      if (state.phase !== 'playing' && state.phase !== 'reveal') return;
      if (typeof index !== 'number' || index < 0 || index >= state.words.length || Math.floor(index) !== index) return;
      var gone = state.words.splice(index, 1)[0];
      var tot = state.totals[gone.teamId];
      if (tot) tot.points = Math.max(0, tot.points - (gone.points || 0));
      log('struck word ' + index);
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      if (!cmd || typeof cmd.type !== 'string' || typeof cmd.runId !== 'string' || typeof cmd.n !== 'number' || cmd.t == null) return false;
      if (cmd.type === 'word') return typeof cmd.word === 'string' && typeof cmd.turn === 'number' && typeof cmd.end === 'boolean';
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
          if (!q[cmd.n]) q[cmd.n] = { type: cmd.type, word: cmd.word, end: cmd.end, turn: cmd.turn, got: now() };
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('inbox', clear); });
      drainWaiting(false);
    }

    /* Each sender's commands in the order they sent them. */
    function drainWaiting(lateOk) {
      var t = now();
      var changed = false;
      Object.keys(state.waiting).forEach(function (uid) {
        var q = state.waiting[uid];
        var expect = state.n[uid] || 0;
        for (;;) {
          var keys = Object.keys(q).map(Number).sort(function (x, y) { return x - y; });
          if (!keys.length) break;
          var k = keys[0];
          if (k < expect) { delete q[k]; continue; }                         // a replay or a double tap
          if (k > expect && !(lateOk || t - q[k].got >= LOST_MS)) break;     // wait a moment for a missing one
          var cmd = q[k];
          delete q[k];
          expect = k + 1;
          state.n[uid] = expect;
          changed = true;
          handle(uid, k, cmd, t);
        }
        if (!Object.keys(q).length) delete state.waiting[uid];
      });
      if (changed && state.phase !== 'ended') { save(); publish(); }
    }

    function said(uid, n, error) { state.said[uid] = { n: n, error: error || '' }; }

    function handle(uid, n, cmd, t) {
      if (cmd.type !== 'word') return;
      if (state.phase !== 'playing') { said(uid, n, 'late'); return; }
      if (state.paused) { said(uid, n, 'paused'); return; }
      if (cmd.turn !== state.turn) { said(uid, n, 'late'); return; }
      var tid = state.members[uid];
      if (!tid || tid !== teamOf(state.turn)) { said(uid, n, 'notYourTurn'); return; }
      if (t >= state.endsAt) {
        // It came after the time ran out: the turn is over, even if the clock hasn't said so yet.
        said(uid, n, 'late');
        skipTurn(t, turnMs());
        return;
      }
      var word = R.parse(cmd.word, {
        isWord: opts.isWord, isQuiet: opts.isQuiet, capital: R.startsSentence(state.config.opening, state.words)
      });
      if (!word.ok) { said(uid, n, word.error); return; }
      if (cmd.end && !R.minReached(state.config, state.words.length, state.order.length)) { said(uid, n, 'tooSoon'); return; }
      var points = R.points(word, state.known);
      state.words.push({ w: word.text, teamId: tid, uid: uid, points: points });
      var tot = state.totals[tid];
      tot.points += points;
      tot.usedMs += Math.max(0, turnMs() - Math.max(0, state.endsAt - t));
      said(uid, n, '');
      if (cmd.end) endMessage('ended', t);
      else beginTurn(state.turn + 1, t);
    }

    /* ---------- the end ---------- */

    function ranked() {
      var rows = state.order.map(function (tid) {
        var x = state.totals[tid] || { points: 0, usedMs: 0 };
        return { teamId: tid, points: x.points, usedMs: x.usedMs };
      });
      rows.sort(function (a, b) { return b.points - a.points || a.usedMs - b.usedMs || (a.teamId < b.teamId ? -1 : 1); });
      rows.forEach(function (r, i) {
        var prev = rows[i - 1];
        r.place = prev && prev.points === r.points && prev.usedMs === r.usedMs ? prev.place : i + 1;
      });
      return rows;
    }

    function finish(why, t) {
      if (state.phase === 'ended') return;
      var rows = ranked();
      var words = state.words.map(function (x) { return { w: x.w, teamId: x.teamId }; });
      var text = R.finalText(state.config.opening, words);
      state.phase = 'ended';
      state.endedAt = t;
      state.paused = false;
      state.endsAt = 0;
      state.result = { why: why, rows: rows, winners: rows.filter(function (r) { return r.place === 1 && r.points > 0; }).map(function (r) { return r.teamId; }), words: words, text: text };
      save();
      publish();
      schedule();
      var teams = {};
      state.order.forEach(function (tid) {
        var x = state.totals[tid] || {};
        teams[tid] = { points: x.points || 0, usedMs: x.usedMs || 0 };
      });
      Promise.resolve(report('celebration', {
        runId: state.runId, cid: state.cid, gameId: state.gameId, template: 'wordByWord', why: why,
        rounds: [{ round: 0, teams: teams }],
        ranked: rows.map(function (r) { return { teamId: r.teamId, place: r.place, points: r.points }; }),
        message: { text: text, words: words }
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
      var c = state.config;
      var blind = c.mode === 'blind';
      var teams = {};
      Object.keys(state.teams).forEach(function (tid) {
        var t = state.teams[tid];
        teams[tid] = { name: t.name, color: t.color, players: t.players };
      });
      var totals = {};
      Object.keys(state.totals).forEach(function (tid) { totals[tid] = { points: state.totals[tid].points }; });
      var v = {
        v: 1, runId: state.runId, gameId: state.gameId, template: 'wordByWord', name: state.name, instructions: state.instructions,
        mode: c.mode, phase: state.phase, startAt: state.startAt, order: state.order, teams: teams,
        rounds: c.rounds, round: state.turn >= 0 ? Math.floor(state.turn / state.order.length) : 0,
        seconds: c.seconds, opening: c.opening, minUnit: c.minUnit, minCount: c.minCount,
        minReached: R.minReached(c, state.words.length, state.order.length),
        paused: state.paused, count: state.words.length, totals: totals, said: state.said, n: state.n,
        turn: null, revealUntil: state.revealUntil, result: state.phase === 'ended' ? state.result : null
      };
      if (state.phase === 'playing') {
        v.turn = { id: state.turn, teamId: teamOf(state.turn), endsAt: state.endsAt };
        if (state.paused) v.turn.leftMs = Math.max(0, state.endsAt - state.pausedAt);
      }
      var words = state.words.map(function (x) { return { w: x.w, teamId: x.teamId }; });
      // Blind: nobody sees the message until the reveal, only the word before theirs.
      if (!blind || state.phase === 'reveal' || state.phase === 'ended') v.words = words;
      else v.last = words.length ? words[words.length - 1] : null;
      return v;
    }

    function publish() {
      if (!state) return;
      var v = JSON.parse(JSON.stringify(view()));
      later(function () { return room.set('run', v); });
      if (state.config.mode === 'blind') {
        var live = state.phase === 'playing' || state.phase === 'reveal';
        var staff = live ? { runId: state.runId, words: state.words.map(function (x) { return { w: x.w, teamId: x.teamId, points: x.points }; }) } : null;
        later(function () { return room.set('staff', staff); });
      }
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.CelebrateReferees = FF.CelebrateReferees || {};
  FF.CelebrateReferees.wordByWord = { create: create, LOST_MS: LOST_MS, REVEAL_MS_PER_WORD: REVEAL_MS_PER_WORD };
})();
