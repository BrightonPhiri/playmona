/* ============================================================
   PLAYMONA — wordflow/referee.js
   The one authority for a WordFlow match. It runs on the server
   (inside the Node crew runner), never on a player's phone except
   in dev rooms.

   It keeps the turn order and both clocks, checks every word,
   closes sentences on a full stop, has each finished sentence
   judged (AI through the API, or the built-in rules), throws away
   the unfinished sentence when time runs out, and counts the
   points. Phones only ever see rooms/<code>/wf (the public view)
   and talk back through rooms/<code>/wfInbox/<uid>/<cmdId>.

     var ref = FF.WordFlowReferee.create({
       run,        // { matchId, roomCode, seats, crew, settings, startAt }
       room,       // transport scoped to rooms/<code> (js/net/transport.js interface)
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       judge,      // ({ mode, sentence, story }) -> Promise<{ ok, reason } | null>
       randomInt, isWord, isQuiet, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Commands run one at a time in arrival order, and each carries
   the turnId it was sent for, so a late, replayed, duplicated or
   out-of-turn word can never land. Classic script, ES2017 or
   older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordFlowRules;

  var JUDGE_MS = 6000;             // one judgement may take this long; then the rules decide
  var WRAP_MS = 8000;              // after time is up, the last judgements get this long
  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var DONE_KEEP = 400;             // handled command ids remembered (replays are older than this)

  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj || {}, k); }

  function online(p, now) {
    return !!p && p.online !== false && !p.away && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }

  /* Firebase drops empty arrays and turns sparse ones into objects. */
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
    // Wrapped: browsers refuse window.setTimeout called as another object's method.
    var timers = opts.timers || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); }
    };
    var log = opts.log || function () {};
    var report = opts.report || function () { return Promise.resolve(); };
    var judge = opts.judge || function () { return Promise.resolve(null); };
    var judgeMs = opts.judgeMs || JUDGE_MS;
    var wrapMs = opts.wrapMs || WRAP_MS;

    var state = null;
    var players = {};
    var offs = [];
    var timer = null;
    var stopped = false;
    var judging = null;       // the sentence id being judged now
    var writes = Promise.resolve();

    function now() { return room.serverNow(); }
    function later(fn) {
      // Every database write goes through one queue, so they land in order.
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }

    /* ---------- the start ---------- */

    function shuffle(seats) {
      var a = seats.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < R.MIN_PLAYERS || seats.length > R.MAX_PLAYERS) throw new Error('WordFlow needs 2 to 12 players.');
      return {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: R.sanitizeSettings(run.settings), seats: shuffle(seats), crew: run.crew || {},
        phase: 'starting', gameDeadline: 0, wrapDeadline: 0,
        turnId: 0, turnIndex: -1, turnUid: '', turnDeadline: 0,
        sentences: [], current: [], unfinished: [], last: null, skips: {},
        feedback: {}, done: {}, doneOrder: [], result: null
      };
    }

    function revive(s) {
      ['crew', 'skips', 'feedback', 'done'].forEach(function (k) { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; });
      ['seats', 'current', 'unfinished', 'doneOrder'].forEach(function (k) { s[k] = list(s[k]); });
      s.sentences = list(s.sentences).map(function (x) { x.words = list(x.words); return x; });
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
          later(function () { return room.set('wfInbox', null); });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; }));
        offs.push(room.watch('wfInbox', onInbox));
        if (state.phase === 'ended') { publish(); return; }
        save();
        publish();
        schedule();
        pump();
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- the clocks ---------- */

    /* One timer: the next thing due (the start, a turn running out, the game
       running out, or the wrap-up running out). */
    function due() {
      if (state.phase === 'starting') return state.startAt;
      if (state.phase === 'playing') return Math.min(state.turnDeadline, state.gameDeadline);
      if (state.phase === 'judging') return state.wrapDeadline;
      return 0;
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
      }, Math.max(0, due() - now()));
    }

    function onClock() {
      var t = now();
      if (state.phase === 'starting') {
        if (t < state.startAt) { schedule(); return; }
        state.phase = 'playing';
        state.gameDeadline = state.startAt + state.settings.gameSeconds * 1000;
        nextTurn(true);
      } else if (state.phase === 'playing') {
        if (t >= state.gameDeadline) { timeUp(); return; }
        if (t >= state.turnDeadline) {
          // No word in time: the turn passes on.
          state.skips[state.turnUid] = (state.skips[state.turnUid] || 0) + 1;
          state.last = { kind: 'skip', uid: state.turnUid, turnId: state.turnId, at: t };
          nextTurn(false);
        } else {
          schedule();
        }
      } else if (state.phase === 'judging') {
        // The judge took too long for the last sentences: the rules decide them.
        state.sentences.forEach(function (s) { if (s.status === 'checking') decide(s, null, 'late'); });
        finish();
      }
    }

    /* The next connected seat after the current one (or the next seat at all
       when nobody is connected, so the game never stalls on a lookup). */
    function nextTurn(first) {
      var seats = state.seats;
      var t = now();
      var from = first ? -1 : state.turnIndex;
      var pickIndex = (from + 1) % seats.length;
      var known = Object.keys(players).length > 0;    // before the first players read, anyone may go
      for (var k = 1; k <= seats.length; k++) {
        var i = (from + k + seats.length) % seats.length;
        if (!known || online(players[seats[i]], t)) { pickIndex = i; break; }
      }
      state.turnIndex = pickIndex;
      state.turnUid = seats[pickIndex];
      state.turnId++;
      state.turnDeadline = Math.min(t + state.settings.turnSeconds * 1000, state.gameDeadline);
      save();
      publish();
      schedule();
    }

    /* The game clock ran out: the sentence being written does not count. */
    function timeUp() {
      if (state.phase !== 'playing') return;
      state.unfinished = state.current;
      state.current = [];
      state.turnUid = '';
      state.turnId++;
      state.last = { kind: 'time', at: now() };
      if (state.sentences.some(function (s) { return s.status === 'checking'; })) {
        state.phase = 'judging';
        state.wrapDeadline = now() + wrapMs;
        save();
        publish();
        schedule();
        pump();
      } else {
        finish();
      }
    }

    /* ---------- commands ---------- */

    function remember(key) {
      state.done[key] = 1;
      state.doneOrder.push(key);
      while (state.doneOrder.length > DONE_KEEP) delete state.done[state.doneOrder.shift()];
    }

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      var changed = false;
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).sort(function (a, b) {
          return ((cmds[a] && cmds[a].t) || 0) - ((cmds[b] && cmds[b].t) || 0) || (a < b ? -1 : 1);
        }).forEach(function (id) {
          // The database rules only let a whole command in, but the dev transport delivers one
          // field at a time: wait for all of it, or the first piece would use up the command.
          if (!complete(cmds[id])) return;
          clear[uid + '/' + id] = null;
          var key = uid + ':' + id;
          if (state.done[key]) return;
          remember(key);
          handle(uid, id, cmds[id] || {});
          changed = true;
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('wfInbox', clear); });
      if (changed) save();
    }

    function complete(cmd) {
      return !!cmd && typeof cmd.type === 'string' && typeof cmd.matchId === 'string' &&
        typeof cmd.turnId === 'number' && typeof cmd.word === 'string' && cmd.t != null;
    }

    function feedback(uid, id, code) {
      state.feedback[uid] = { id: id, code: code, at: now() };
      publish();
    }

    function handle(uid, id, cmd) {
      if (state.phase === 'ended' || state.seats.indexOf(uid) === -1) return;     // not in this match
      if (cmd.matchId !== state.matchId || cmd.type !== 'word') return;
      if (state.phase === 'playing' && now() >= state.gameDeadline) timeUp();   // the clock beat its timer
      if (state.phase !== 'playing') { feedback(uid, id, state.phase === 'starting' ? 'early' : 'time'); return; }
      if (uid !== state.turnUid) { feedback(uid, id, 'turn'); return; }
      if (cmd.turnId !== state.turnId) { feedback(uid, id, 'stale'); return; }
      // Sent in time counts, even if it reached us a moment after the turn clock.
      var sentAt = typeof cmd.t === 'number' ? Math.min(cmd.t, now()) : now();
      if (sentAt > state.turnDeadline) { feedback(uid, id, 'late'); return; }
      var res = R.parseWord(cmd.word, { isWord: opts.isWord, isQuiet: opts.isQuiet, position: state.current.length });
      // A bad word keeps the turn: the clock is still running, so try again.
      if (!res.ok) { feedback(uid, id, res.error); return; }
      var t = now();
      state.current.push({ w: res.text, uid: uid });
      delete state.feedback[uid];
      state.last = { kind: 'word', uid: uid, w: res.text, turnId: state.turnId, at: t };
      if (res.ends) closeSentence();
      nextTurn(false);
    }

    /* ---------- sentences and the judge ---------- */

    function closeSentence() {
      var n = state.sentences.length + 1;
      state.sentences.push({ id: 's' + n, words: state.current, status: 'checking', at: now() });
      state.current = [];
      pump();
    }

    /* The accepted story so far, before sentence index i (story mode only). */
    function storyBefore(i) {
      if (state.settings.mode !== 'story') return [];
      return state.sentences.slice(0, i).filter(function (s) { return s.status === 'accepted'; })
        .map(function (s) { return R.sentenceText(s.words); });
    }

    /* Judge the oldest unjudged sentence, one at a time, so a story is always
       judged against the sentences before it. */
    function pump() {
      if (stopped || judging || !state || state.phase === 'ended') return;
      var i = -1;
      for (var k = 0; k < state.sentences.length; k++) if (state.sentences[k].status === 'checking') { i = k; break; }
      if (i === -1) {
        if (state.phase === 'judging') finish();
        return;
      }
      var s = state.sentences[i];
      judging = s.id;
      var quick = R.fallbackJudge(s.words);
      if (!quick.ok) { settle(s, quick, 'rules'); return; }     // obvious junk never needs the AI
      var answered = false;
      var wait = timers.setTimeout(function () {
        if (answered) return;
        answered = true;
        settle(s, null, 'timeout');
      }, judgeMs);
      Promise.resolve().then(function () {
        return judge({ matchId: state.matchId, mode: state.settings.mode, sentence: R.sentenceText(s.words), story: storyBefore(i) });
      }).then(function (v) {
        if (answered) return;
        answered = true;
        timers.clearTimeout(wait);
        settle(s, v && typeof v.ok === 'boolean' ? v : null, 'judge');
      }, function (e) {
        if (answered) return;
        answered = true;
        timers.clearTimeout(wait);
        log('judge failed: ' + (e && e.message));
        settle(s, null, 'error');
      });
    }

    function settle(s, verdict, how) {
      judging = null;
      if (stopped || !state || state.phase === 'ended') return;
      if (s.status === 'checking') {
        decide(s, verdict, how);
        save();
        publish();
      }
      pump();
    }

    /* verdict: { ok, reason } from the judge, or null to use the rules. */
    function decide(s, verdict, how) {
      var v = verdict || R.fallbackJudge(s.words);
      s.status = v.ok ? 'accepted' : 'rejected';
      s.by = verdict ? 'judge' : 'rules';
      if (!v.ok) s.reason = String(v.reason || 'meaning').slice(0, 140);
      else delete s.reason;
      if (how === 'late') s.by = 'rules';
    }

    /* ---------- the end ---------- */

    function finish() {
      if (state.phase === 'ended') return;
      state.sentences.forEach(function (s) { if (s.status === 'checking') decide(s, null, 'late'); });
      var sc = R.score(state.sentences, state.seats);
      var order = R.ranked(sc, state.seats);
      var top = R.winners(sc, state.seats);
      var accepted = state.sentences.filter(function (s) { return s.status === 'accepted'; });
      var totalWords = 0;
      accepted.forEach(function (s) { totalWords += s.words.length; });
      state.result = {
        mode: state.settings.mode, totalWords: totalWords, accepted: accepted.length,
        rejected: state.sentences.length - accepted.length, unfinished: state.unfinished.length,
        score: sc, ranked: order.map(function (r) { return r.uid; }), winners: top
      };
      var ranked = order.map(function (r) {
        var p = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: p.name || 'Player', avatar: p.avatar || '', color: p.color || '', points: r.points };
      });
      var t = now();
      state.phase = 'ended';
      state.turnUid = '';
      later(function () {
        return room.update('meta', {
          status: 'ended', endedAt: t,
          results: { gameId: 'wordFlow', startAt: state.startAt, createdAt: t, ranked: ranked }
        });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('wordflow', {
        matchId: state.matchId, roomCode: state.roomCode, mode: state.settings.mode, settings: state.settings,
        accepted: accepted.length, rejected: state.result.rejected, totalWords: totalWords,
        seats: state.seats.map(function (uid) {
          return { uid: uid, crew: !!state.crew[uid], words: sc[uid].points, points: sc[uid].points, won: top.indexOf(uid) !== -1 };
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

    /* The public view: everything here is for everyone (WordFlow has no secrets). */
    function view() {
      var sc = R.score(state.sentences, state.seats);
      var seats = {};
      state.seats.forEach(function (uid) {
        seats[uid] = { points: sc[uid].points, skips: state.skips[uid] || 0 };
      });
      var v = {
        v: 1, matchId: state.matchId, mode: state.settings.mode, settings: state.settings,
        phase: state.phase, startAt: state.startAt, gameDeadline: state.gameDeadline, wrapDeadline: state.wrapDeadline,
        turnId: state.turnId, turnUid: state.turnUid, turnDeadline: state.turnDeadline,
        order: state.seats, seats: seats,
        sentences: state.sentences, current: state.current, unfinished: state.unfinished,
        last: state.last, feedback: state.feedback
      };
      if (state.phase === 'ended') v.result = state.result;
      return JSON.parse(JSON.stringify(v));
    }

    function publish() {
      var v = view();
      return later(function () { return room.set('wf', v); });
    }

    return {
      start: start,
      stop: stop,
      // For tests and the runner's status line.
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.WordFlowReferee = { JUDGE_MS: JUDGE_MS, WRAP_MS: WRAP_MS, create: create };
})();
