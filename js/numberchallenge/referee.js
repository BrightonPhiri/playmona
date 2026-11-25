/* ============================================================
   PLAYMONA — numberchallenge/referee.js
   The one authority for an online Number Challenge Race. It runs on
   the server (inside the Node crew runner), never on a player's phone
   except in dev rooms. Modelled on js/saywhat/referee.js.

   It picks the match seed with the server's random and keeps it
   secret. Everyone races the same items. Each item goes:
     ready   Quick sums and Make the target: the sum or the tiles and
             target are published a moment before the clock starts.
             Sprint: the whole list (sums and choices, no answers).
     steps   Chain only: the start number, then one step per STEP_MS,
             never ahead of the clock. Choices come with the open.
     open    answers are taken until the clock runs out or everyone
             seated has answered (Sprint: until every player's own end)
     reveal  the answer (or one way to the target) and everyone's results
   Answers are checked and scored with FF.NumberChallengeRules (the same
   rules the phones use), timed by the database's own clock. Phones only
   see rooms/<code>/nc and answer through rooms/<code>/ncInbox/<uid>/<cmdId>
   with { matchId, k, text, t }: a number; a target as 'steps;value'
   (R.submitText); Sprint answers as 'i:answer' joined by ',' in order.

     var ref = FF.NumberChallengeReferee.create({
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

  var R = FF.NumberChallengeRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var READY_MS = 1000;             // the item is drawn on every phone before the clock starts
  var GRACE_MS = 600;              // an answer sent this soon after the clock still counts
  var REVEAL_MS = { quick: 3500, chain: 5000, target: 7000, sprint: 7000 };
  var MAX_TEXT = 80;
  var SEP = '|';

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  function newPlayer() { return { score: 0, streak: 0, best: 0, right: 0, ms: 0 }; }
  function joinChoices(item) { return item.choices ? item.choices.join(SEP) : null; }

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
    var items = null;      // the match's items, from the seed (not saved)

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function mode() { return state.settings.mode; }
    function allItems() {
      if (!items) items = R.deal(state.settings, state.seed).items;
      return items;
    }
    function itemOf(k) { return allItems()[k]; }
    function total() { return mode() === 'sprint' ? 1 : allItems().length; }
    function secondsOf(item) { return R.secondsFor(state.settings, item); }
    function makeSeed() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
      for (var i = 0; i < 20; i++) s += chars[randomInt(chars.length)];
      return s;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('Number Challenge takes 1 to ' + R.MAX_PLAYERS + ' players.');
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: R.sanitizeRoom(run.settings), seed: run.seed || makeSeed(), seats: seats, players: {},
        phase: 'starting', k: -1, readyAt: (run.startAt || 0) + BRIEF_MS, stepsAt: 0, shown: 0,
        openAt: 0, closeAt: 0, nextAt: 0, answers: {}, sprint: {}, last: null, result: null
      };
      seats.forEach(function (uid) { state.players[uid] = newPlayer(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.players = s.players || {};
      s.answers = s.answers || {};
      s.sprint = s.sprint || {};
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
          later(function () { return room.set('ncInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.phase === 'open') checkAllIn(); }));
        offs.push(room.watch('ncInbox', onInbox));
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

    function stepCount() { var it = itemOf(state.k); return it && it.steps ? it.steps.length : 0; }
    function nextStepAt() { return Math.min(state.openAt, state.stepsAt + (state.shown + 1) * R.STEP_MS[state.settings.speed]); }

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      var due = state.phase === 'starting' ? state.readyAt
        : state.phase === 'ready' ? state.openAt
          : state.phase === 'steps' ? nextStepAt()
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
      if (state.phase === 'steps') {
        if (t >= state.openAt) { state.shown = stepCount(); openRound(); return; }
        var shown = Math.min(stepCount(), Math.floor((t - state.stepsAt) / R.STEP_MS[state.settings.speed]));
        if (shown !== state.shown) { state.shown = shown; save(); publish(); }
        schedule();
        return;
      }
      if (state.phase === 'ready') { if (t >= state.openAt) openRound(); else schedule(); return; }
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
      state.sprint = {};
      state.last = null;
      var item = itemOf(state.k);
      state.readyAt = at;
      state.shown = 0;
      if (mode() === 'chain') {
        state.phase = 'steps';
        state.stepsAt = at;
        state.openAt = at + (item.steps.length + 1) * R.STEP_MS[state.settings.speed];
      } else {
        state.phase = 'ready';
        state.stepsAt = 0;
        state.openAt = at + READY_MS;
      }
      state.closeAt = state.openAt + secondsOf(item) * 1000;
      state.nextAt = 0;
      save();
      publish();
      schedule();
    }

    function openRound() {
      state.phase = 'open';
      if (mode() === 'sprint') state.seats.forEach(function (uid) { state.sprint[uid] = R.sprintCreate(state.settings, state.openAt); });
      save();
      publish();
      schedule();
    }

    /* Everyone still here has answered (Sprint: has finished the list): no reason to wait. */
    function checkAllIn() {
      var t = now();
      var known = Object.keys(players).length > 0;
      var waiting = state.seats.some(function (uid) {
        if (mode() === 'sprint' ? state.sprint[uid] && state.sprint[uid].done : state.answers[uid]) return false;
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
        // Sprint batches must be taken in the order they were sent.
        Object.keys(cmds).sort(function (a, b) {
          var ca = cmds[a] || {}, cb = cmds[b] || {};
          return (ca.t || 0) - (cb.t || 0) || (a < b ? -1 : a > b ? 1 : 0);
        }).forEach(function (id) {
          var cmd = cmds[id];
          // The dev transport delivers a command one field at a time: wait for all of it.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          if (take(uid, cmd)) changed = true;
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('ncInbox', clear); });
      if (changed) {
        save();
        publishAnswered();
        if (state.phase === 'open') checkAllIn();
      }
    }

    function take(uid, cmd) {
      if (!state.players[uid] || cmd.matchId !== state.matchId) return false;
      if (cmd.k !== state.k || state.phase !== 'open') return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.openAt) return false;
      var text = String(cmd.text).replace(/\s+/g, '').slice(0, MAX_TEXT);
      if (mode() === 'sprint') return takeSprint(uid, text, sentAt);
      if (state.answers[uid] || sentAt > state.closeAt + GRACE_MS) return false;
      var item = itemOf(state.k);
      var ms = Math.max(0, Math.min(secondsOf(item) * 1000, sentAt - state.openAt));
      var res = R.judge(state.settings, item, text, ms);
      var a = { ok: !!res.ok, points: res.points || 0, text: text, ms: ms };
      if (mode() === 'target') { a.off = res.off; a.value = res.value; a.usedAll = !!res.usedAll; }
      state.answers[uid] = a;
      return true;
    }

    /* 'i:answer,i:answer' — only the player's next sum counts, only before their own end. */
    function takeSprint(uid, text, sentAt) {
      var st = state.sprint[uid];
      if (!st) return false;
      var took = false;
      var parts = text.split(',');
      for (var j = 0; j < parts.length; j++) {
        var m = /^(\d+):(\d*)$/.exec(parts[j]);
        if (!m || Number(m[1]) !== st.i) continue;
        var end = R.sprintEndAt(st);
        if (st.done || sentAt > end + GRACE_MS) break;
        var r = R.sprintAnswer(st, allItems(), m[2], Math.min(sentAt, end));
        if (r.ignored) break;
        took = true;
      }
      return took;
    }

    /* ---------- the reveal ---------- */

    function reveal() {
      if (state.phase !== 'open') return;
      var item = itemOf(state.k);
      var results = {};
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        if (mode() === 'sprint') {
          var st = state.sprint[uid] || R.sprintCreate(state.settings, state.openAt);
          p.score += st.score; p.right += st.right; p.streak = st.streak; p.best = Math.max(p.best, st.best);
          results[uid] = { right: st.right, wrong: st.wrong, points: st.score, at: st.i, best: st.best };
          return;
        }
        var a = state.answers[uid] || { ok: false, points: 0, text: '', ms: 0 };
        p.streak = a.ok ? p.streak + 1 : 0;
        p.best = Math.max(p.best, p.streak);
        if (a.ok) { p.right++; p.ms += a.ms; }
        p.score += a.points;
        var r = { right: a.ok, text: a.text, ms: a.ms, points: a.points, answered: !!state.answers[uid] };
        if (mode() === 'target') { r.off = a.off == null ? null : a.off; r.value = a.value == null ? null : a.value; r.usedAll = !!a.usedAll; }
        results[uid] = r;
      });
      state.phase = 'reveal';
      state.revealAt = now();
      state.nextAt = state.revealAt + REVEAL_MS[mode()];
      var last = { k: state.k, results: results };
      if (mode() === 'target') { last.solution = item.solution; last.target = item.target; }
      else if (mode() !== 'sprint') last.answer = item.answer;
      state.last = last;
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
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'numberChallenge', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('numberchallenge', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, mode: state.settings.mode, level: state.settings.level, why: why,
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

    /* The item as the phones may see it: never its answer, the running totals or the way to the target. */
    function roundView() {
      var item = itemOf(state.k);
      var r = { k: state.k, seconds: secondsOf(item) };
      var m = mode();
      if (m === 'sprint') {
        r.list = allItems().map(function (it) { return { text: it.text, choices: joinChoices(it), tier: it.tier }; });
      } else if (m === 'chain') {
        var shown = state.phase === 'steps' ? state.shown : item.steps.length;
        var st = shown > 0 ? item.steps[shown - 1] : null;
        r.start = item.start;
        r.steps = item.steps.length;
        r.shown = shown;
        r.step = st ? { op: st.op, n: st.n == null ? null : st.n } : null;
        r.choices = state.phase === 'steps' ? null : joinChoices(item);
      } else if (m === 'target') {
        r.tiles = item.tiles.join(',');
        r.ops = item.ops.join('');
        r.target = item.target;
      } else {
        r.text = item.text;
        r.tier = item.tier;
        r.choices = joinChoices(item);
      }
      return r;
    }

    function playerView(uid) {
      var p = state.players[uid];
      var v = { score: p.score, streak: p.streak, best: p.best, right: p.right, inK: state.answers[uid] ? state.k : -1 };
      var st = state.sprint[uid];
      if (st && state.phase === 'open') {
        v.score = p.score + st.score; v.right = p.right + st.right; v.streak = st.streak;
        v.wrong = st.wrong; v.at = st.i; v.end = R.sprintEndAt(st); v.done = !!st.done;
      }
      return v;
    }

    function view() {
      var v = {
        v: 1, matchId: state.matchId, phase: state.phase, k: state.k, total: total(), settings: state.settings,
        order: state.seats, startAt: state.startAt, readyAt: state.readyAt, stepsAt: state.stepsAt, openAt: state.openAt,
        closeAt: state.closeAt, nextAt: state.nextAt, p: {}
      };
      if (state.k >= 0 && state.phase !== 'ended') v.round = roundView();
      if (state.phase === 'reveal' && state.last) v.last = state.last;
      if (state.phase === 'ended') v.result = state.result;
      state.seats.forEach(function (uid) { v.p[uid] = playerView(uid); });
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('nc', copy); });
    }

    /* Who has answered (not what); in a Sprint, each player's live count and clock. */
    function publishAnswered() {
      var u = {};
      state.seats.forEach(function (uid) {
        var pv = playerView(uid);
        Object.keys(pv).forEach(function (key) { u['p/' + uid + '/' + key] = pv[key]; });
      });
      return later(function () { return room.update('nc', u); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.NumberChallengeReferee = { create: create, rank: rank, BRIEF_MS: BRIEF_MS, READY_MS: READY_MS, GRACE_MS: GRACE_MS, REVEAL_MS: REVEAL_MS, SEP: SEP };
})();
