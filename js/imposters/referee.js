/* ============================================================
   PLAYMONA — imposters/referee.js
   The one authority for an Imposters match. It runs on the server
   (inside the Node crew runner, signed in as the service account),
   never on a player's phone except in dev rooms mode.

   It deals the secrets, runs every phase on its own clock, checks
   every command against the rules, counts the votes, eliminates,
   decides the winner and writes the results. Phones only ever see:
     rooms/<code>/imp                  the public view (no secrets)
     imposterSecrets/<code>/<uid>      their own secret, nobody else's
   and talk back through rooms/<code>/impInbox/<uid>/<cmdId>.

     var ref = FF.ImpostersReferee.create({
       run,        // { matchId, roomCode, seats, crew, settings, pair, startAt }
       room,       // transport scoped to rooms/<code> (js/net/transport.js interface)
       secrets,    // { set(uid, v), update(uid, v), clear() } -> Promise
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt,  // n -> 0..n-1, crypto on the server
       isQuiet, timers, log, report(event, payload)
     });
     ref.start(); ... ref.stop();

   Commands run one at a time in arrival order, and every command
   carries the phaseId it was sent for, so a late, replayed or
   duplicated command can never act twice or in the wrong phase.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;

  var REVEAL_MS = 20000;
  var VOTE_MS = 30000;
  var ELIMINATION_MS = 5000;
  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var TYPES = { ready: 'reveal', clue: 'clues', stop: 'challenge', callVote: 'discuss', vote: 'vote' };

  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj || {}, k); }

  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }

  function create(opts) {
    var run = opts.run;
    var room = opts.room;
    var secrets = opts.secrets;
    var store = opts.store || { load: function () { return Promise.resolve(null); }, save: function () { return Promise.resolve(); } };
    var randomInt = opts.randomInt;
    // Wrapped: browsers refuse window.setTimeout called as another object's method.
    var timers = opts.timers || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); }
    };
    var log = opts.log || function () {};
    var report = opts.report || function () { return Promise.resolve(); };
    var mode = FF.ImpostersModes[(run.settings && run.settings.mode) || 'word'];
    if (!mode) throw new Error('Unknown Imposters mode.');

    var state = null;
    var players = {};
    var offs = [];
    var timer = null;
    var stopped = false;
    var writes = Promise.resolve();

    function now() { return room.serverNow(); }
    function later(fn) {
      // Every database write goes through one queue, so they land in order.
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }

    /* ---------- the start ---------- */

    function fresh() {
      var seats = (run.seats || []).slice();
      var settings = R.sanitizeSettings(run.settings, seats.length);
      if (!R.imposterCount(seats.length, settings.imposters)) throw new Error('Imposters needs 3 to 12 players.');
      var alive = {};
      seats.forEach(function (uid) { alive[uid] = true; });
      var s = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: run.startAt || 0,
        settings: settings, seats: seats, crew: run.crew || {},
        minority: R.chooseMinority(seats, settings.imposters, randomInt),
        alive: alive, phase: 'starting', phaseId: 0, round: 0, deadline: 0, goAt: 0,
        ready: {}, subs: {}, wants: {}, board: {}, voteNo: 0, ballots: {}, allBallots: {},
        candidates: [], revote: false, votes: {}, eliminated: [], pending: null, done: {}, result: null
      };
      mode.deal(s, run, ctx());
      return s;
    }

    /* Firebase keeps no empty objects or arrays: put them back on a saved state. */
    function revive(s) {
      ['alive', 'ready', 'subs', 'wants', 'board', 'ballots', 'allBallots', 'votes', 'done', 'crew', 'used', 'targets'].forEach(function (k) {
        if (!s[k] || typeof s[k] !== 'object') s[k] = {};
      });
      ['seats', 'minority', 'candidates', 'eliminated'].forEach(function (k) {
        if (!Array.isArray(s[k])) s[k] = s[k] && typeof s[k] === 'object' ? Object.keys(s[k]).map(function (i) { return s[k][i]; }) : [];
      });
      Object.keys(s.used).forEach(function (u) { if (!Array.isArray(s.used[u])) s.used[u] = []; });
      return s;
    }

    function ctx(extra) {
      var c = { randomInt: randomInt, isQuiet: opts.isQuiet || null };
      if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
      return c;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.matchId === run.matchId) {
          state = revive(saved);
          log('resuming ' + run.matchId + ' at ' + state.phase);
        } else {
          state = fresh();
          later(function () {
            return Promise.all([room.set('impInbox', null), room.set('chat', null), secrets.clear()]);
          });
        }
        offs.push(room.watch('players', function (v) { players = v || {}; if (state) checkDone(); }));
        offs.push(room.watch('impInbox', onInbox));
        if (state.phase === 'starting') beginRound();
        else { publish(); schedule(); }
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- phases ---------- */

    function go(phase, deadline) {
      state.phase = phase;
      state.phaseId++;
      state.deadline = deadline;
      save();
      publish();
      schedule();
    }

    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.phase === 'ended' || stopped) return;
      var id = state.phaseId;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && state.phaseId === id) onDeadline();
      }, Math.max(0, state.deadline - now()));
    }

    function beginRound() {
      state.round++;
      state.wants = {};
      var secretsNow = mode.secretsFor(state, state.round, ctx());
      if (secretsNow) {
        writeSecrets(secretsNow);
        state.ready = {};
        // The first reveal waits for the room's countdown to finish.
        go('reveal', Math.max(now(), state.startAt || 0) + REVEAL_MS);
      } else {
        openRoundPhase();
      }
    }

    function openRoundPhase() {
      state.subs = {};
      var o = mode.open(state, now(), ctx());
      go(mode.roundPhase, o.deadline);
    }

    function closeRoundPhase() {
      state.board['r' + state.round] = mode.close(state, state.subs);
      state.subs = {};
      state.wants = {};
      go('discuss', now() + state.settings.discussSeconds * 1000);
    }

    function isFinal() { return state.round >= state.settings.rounds; }

    function openVote(candidates, revote) {
      state.voteNo++;
      state.ballots = {};
      state.candidates = candidates;
      state.revote = !!revote;
      go('vote', now() + VOTE_MS);
    }

    function aliveSeats() { return state.seats.filter(function (uid) { return state.alive[uid]; }); }

    function closeVote() {
      var key = 'v' + state.voteNo;
      if (has(state.votes, key)) return;        // already counted: never twice
      var t = R.tally(state.ballots, state.candidates);
      state.allBallots[key] = state.ballots;
      var record = { n: state.voteNo, round: state.round, counts: t.counts, tied: t.top.length > 1 ? t.top : [], revote: state.revote, out: '' };
      state.votes[key] = record;
      if (t.top.length > 1 && !state.revote) {
        openVote(t.top, true);                  // one revote among the tied players
        return;
      }
      var out = t.top.length === 1 ? t.top[0] : '';
      record.out = out;
      if (out) {
        state.alive[out] = false;
        state.eliminated.push({ uid: out, round: state.round, vote: state.voteNo });
      }
      state.revote = false;
      state.candidates = [];
      state.pending = R.winner(state.minority, state.alive, isFinal()) || '';
      go('elimination', now() + ELIMINATION_MS);
    }

    function onDeadline() {
      switch (state.phase) {
        case 'reveal': openRoundPhase(); break;
        case 'clues':
        case 'challenge': closeRoundPhase(); break;
        case 'discuss':
          if (isFinal()) openVote(aliveSeats(), false);
          else beginRound();
          break;
        case 'vote': closeVote(); break;
        case 'elimination':
          if (state.pending) finish(state.pending);
          else beginRound();
          break;
      }
    }

    /* Who the room is waiting for: players still in and connected. Nobody
       connected means waiting for the clock, never racing ahead. */
    function waitingOn() {
      var t = now();
      return aliveSeats().filter(function (uid) { return online(players[uid], t); });
    }

    function checkDone() {
      if (!state || stopped) return;
      var need = waitingOn();
      if (!need.length) return;
      var all = function (map) { return need.every(function (uid) { return has(map, uid); }); };
      if (state.phase === 'reveal' && all(state.ready)) openRoundPhase();
      else if ((state.phase === 'clues' || state.phase === 'challenge') && all(state.subs)) closeRoundPhase();
      else if (state.phase === 'vote' && all(state.ballots)) closeVote();
    }

    /* ---------- commands ---------- */

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).sort(function (a, b) {
          return ((cmds[a] && cmds[a].t) || 0) - ((cmds[b] && cmds[b].t) || 0) || (a < b ? -1 : 1);
        }).forEach(function (id) {
          clear[uid + '/' + id] = null;
          var key = uid + ':' + id;
          if (state.done[key]) return;
          state.done[key] = 1;
          handle(uid, id, cmds[id] || {});
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('impInbox', clear); });
      save();
    }

    function handle(uid, id, cmd) {
      var err = check(uid, cmd);
      if (!err) err = apply(uid, cmd);
      if (err) {
        if (err !== 'ignore' && has(state.alive, uid)) {
          later(function () { return secrets.update(uid, { feedback: { id: id, code: err, at: now() } }); });
        }
        return;
      }
      publish();
      checkDone();
    }

    function check(uid, cmd) {
      if (state.phase === 'ended') return 'ignore';
      if (!has(state.alive, uid)) return 'ignore';                    // not in this match
      if (cmd.matchId !== state.matchId) return 'stale';
      if (!state.alive[uid]) return 'out';
      if (!has(TYPES, cmd.type)) return 'bad';
      if (cmd.phaseId !== state.phaseId || TYPES[cmd.type] !== state.phase) return 'stale';
      return null;
    }

    function apply(uid, cmd) {
      switch (cmd.type) {
        case 'ready':
          state.ready[uid] = true;
          return null;
        case 'clue':
        case 'stop': {
          if (has(state.subs, uid)) return 'done';
          var arrived = typeof cmd.t === 'number' ? Math.min(cmd.t, now()) : now();
          var res = mode.accept(state, uid, cmd, ctx({ arrivedAt: arrived }));
          if (res.error) return res.error;
          state.subs[uid] = res.value;
          return null;
        }
        case 'callVote': {
          state.wants[uid] = true;
          var alive = aliveSeats();
          var n = alive.filter(function (u) { return state.wants[u]; }).length;
          if (n >= R.votesNeeded(alive.length)) openVote(alive, false);
          return null;
        }
        case 'vote': {
          if (has(state.ballots, uid)) return 'voted';
          var target = String(cmd.target || '');
          if (target === uid) return 'self';
          if (state.candidates.indexOf(target) === -1 || !state.alive[target]) return 'target';
          state.ballots[uid] = target;
          return null;
        }
      }
      return 'bad';
    }

    /* ---------- the end ---------- */

    function finish(winnerSide) {
      var shown = mode.reveal(state);
      var stats = {};
      var sides = {};
      var outRound = {};
      state.eliminated.forEach(function (e) { outRound[e.uid] = e.round; });
      state.seats.forEach(function (uid) {
        var minority = state.minority.indexOf(uid) !== -1;
        sides[uid] = minority ? 'minority' : 'majority';
        var correct = 0;
        Object.keys(state.allBallots).forEach(function (k) {
          var target = state.allBallots[k][uid];
          if (target && state.minority.indexOf(target) !== -1) correct++;
        });
        var clues = 0;
        Object.keys(state.board).forEach(function (k) {
          var v = state.board[k][uid];
          if (v !== undefined && v !== '' && v !== -1) clues++;
        });
        var won = (winnerSide === 'minority') === minority;
        stats[uid] = {
          won: won, correctVotes: minority ? 0 : correct, clues: clues,
          survived: !!state.alive[uid], out: outRound[uid] || 0,
          points: R.points({ won: won, correctVotes: minority ? 0 : correct, minority: minority, survived: !!state.alive[uid] })
        };
      });
      state.result = {
        winner: winnerSide, mode: mode.id, sides: sides, stats: stats, ballots: state.allBallots,
        words: shown.words || null, targets: shown.targets || null, assignments: shown.assignments
      };
      var ranked = state.seats.map(function (uid) {
        var p = players[uid] || {};
        return { id: uid, uid: uid, name: p.name || 'Player', avatar: p.avatar || '', color: p.color || '', points: stats[uid].points };
      }).sort(function (a, b) { return b.points - a.points; });
      var t = now();
      later(function () {
        return room.update('meta', {
          status: 'ended', endedAt: t,
          results: { gameId: 'imposters', startAt: state.startAt, createdAt: t, ranked: ranked }
        });
      });
      go('ended', t);
      Promise.resolve(report('imposters', {
        matchId: state.matchId, roomCode: state.roomCode, mode: mode.id, settings: state.settings,
        winner: winnerSide, rounds: state.round, words: state.result.words, targets: state.result.targets,
        seats: state.seats.map(function (uid) {
          var st = stats[uid];
          return { uid: uid, crew: !!state.crew[uid], side: sides[uid], out: st.out, correctVotes: st.correctVotes, clues: st.clues, points: st.points };
        })
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function writeSecrets(map) {
      Object.keys(map).forEach(function (uid) {
        var secret = map[uid];
        secret.matchId = state.matchId;
        if (state.crew[uid] && mode.crewSecret) {
          var extra = mode.crewSecret(state, uid) || {};
          Object.keys(extra).forEach(function (k) { secret[k] = extra[k]; });
        }
        later(function () { return secrets.set(uid, secret); });
      });
    }

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    /* The public view. Nothing secret goes in here before the end:
       no words, no targets, no ballots, no sides. */
    function view() {
      var seats = {};
      state.seats.forEach(function (uid) {
        seats[uid] = {
          alive: !!state.alive[uid],
          ready: !!state.ready[uid],
          submitted: has(state.subs, uid),
          voted: has(state.ballots, uid),
          wantsVote: !!state.wants[uid]
        };
      });
      var v = {
        v: 1, matchId: state.matchId, mode: mode.id, phase: state.phase, phaseId: state.phaseId,
        round: state.round, rounds: state.settings.rounds, deadline: state.deadline, goAt: state.goAt || 0,
        settings: state.settings, order: state.seats, seats: seats, board: state.board,
        voteNo: state.voteNo, revote: state.revote, candidates: state.candidates, final: isFinal(),
        votes: state.votes, eliminated: state.eliminated,
        wantCount: Object.keys(state.wants).length, need: R.votesNeeded(aliveSeats().length)
      };
      if (state.phase === 'ended') v.result = state.result;
      return JSON.parse(JSON.stringify(v));
    }

    function publish() {
      var v = view();
      return later(function () { return room.set('imp', v); });
    }

    return {
      start: start,
      stop: stop,
      // For tests and the runner's status line.
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.ImpostersReferee = {
    REVEAL_MS: REVEAL_MS, VOTE_MS: VOTE_MS, ELIMINATION_MS: ELIMINATION_MS,
    create: create
  };
})();
