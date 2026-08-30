/* ============================================================
   FAMILY FUN — net/race.js
   The only multiplayer surface a game touches. When no room is
   active every call is inert and games fall through to their
   normal single-device behaviour.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var session = null;         // { gameId, rounds, timerMs, pointsFor, index, settled }
  var settleHandlers = [];
  var offRounds = null;
  var timeoutPoll = null;

  function room() { return FF.Room ? FF.Room.current() : null; }

  function emitSettle(payload) {
    settleHandlers.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Race]', e); }
    });
  }

  function currentRound() {
    var r = room();
    if (!r || !session) return null;
    var node = (r.rounds || {})[session.index];
    return node || { startedAt: null, answers: {}, winner: null };
  }

  function nameOf(uid) {
    var r = room();
    var p = r && r.players ? r.players[uid] : null;
    return p ? p.name : 'Someone';
  }

  /* Re-evaluate the current round whenever round data changes, and
     on a slow poll so a pure timeout still settles with no writes. */
  function finalise(winnerId, reason) {
    if (!session || session.settled) return;
    var r = room();
    if (!r) return;
    session.settled = true;
    stopPoll();
    var n = session.index;
    var scoreFor = session.pointsFor;

    // Read the winning answer rather than trusting the local snapshot: the
    // winner slot is claimed before the answer is written, so the answer
    // may not have reached this device yet and the points would read zero.
    var answerP = winnerId
      ? r.transport.get('rounds/' + n + '/answers/' + winnerId)
      : Promise.resolve(null);

    answerP.catch(function () { return null; }).then(function (answer) {
      emitSettle({
        winnerId: winnerId || null,
        winnerName: winnerId ? nameOf(winnerId) : null,
        correct: winnerId === r.uid,
        points: answer ? scoreFor(answer) : 0,
        reason: reason
      });
    });
  }

  function evaluate() {
    if (!session || session.settled || session.claiming) return;
    var r = room();
    if (!r) return;

    var verdict = FF.RaceRules.settle(
      currentRound(),
      FF.Room.racePlayers(),
      session.timerMs,
      r.transport.serverNow()
    );
    if (!verdict.settled) return;

    // A recorded winner is already a shared fact - settle on it.
    if (verdict.winnerId) { finalise(verdict.winnerId, 'winner'); return; }

    // Nobody won as far as THIS device can tell. Devices judge timeouts
    // from their own clock, so publish the outcome instead of trusting it:
    // claim the winner slot for NOBODY. If a correct answer landed at the
    // same instant it will already hold the slot and we defer to it, so
    // every device ends the round the same way.
    session.claiming = true;
    var n = session.index;
    var localReason = verdict.reason;
    r.transport.transaction('rounds/' + n + '/winner', function (current) {
      return current == null ? FF.RaceRules.NOBODY : undefined;
    }).then(function () {
      return r.transport.get('rounds/' + n + '/winner');
    }).then(function (stored) {
      session.claiming = false;
      if (stored && stored !== FF.RaceRules.NOBODY) finalise(stored, 'winner');
      else finalise(null, localReason);
    }).catch(function () {
      session.claiming = false;
    });
  }

  function startPoll() {
    stopPoll();
    // A timeout produces no database write, so nothing would wake the
    // round watcher. Poll slowly to notice the clock running out.
    timeoutPoll = setInterval(evaluate, 250);
  }

  function stopPoll() {
    if (timeoutPoll != null) { clearInterval(timeoutPoll); timeoutPoll = null; }
  }

  FF.Race = {
    /* True whenever this device is playing inside a room. Games check
       this BEFORE calling begin(), so it must not depend on a session
       having been created - that would never become true. */
    active: function () { return !!room(); },

    /* True once begin() has opened a race session for a game. */
    running: function () { return !!(session && room()); },

    begin: function (gameId, opts) {
      opts = opts || {};
      var r = room();
      if (!r) return;
      session = {
        gameId: gameId,
        rounds: opts.rounds || 8,
        timerMs: opts.timerMs || 0,
        pointsFor: opts.pointsFor || function () { return 100; },
        index: 0,
        settled: false,
        claiming: false
      };
      if (offRounds) offRounds();
      offRounds = FF.Room.on('rounds', evaluate);
    },

    /* Seed this round's RNG and claim its start time.
       Resolves once the round is open on this device. */
    beginRound: function (n) {
      var r = room();
      if (!r || !session) return Promise.resolve();

      session.index = n;
      session.settled = false;
      session.claiming = false;

      FF.Random.seed(FF.Random.roundSeed(r.meta.seed, session.gameId, n));

      // First device here claims startedAt; the rest read it.
      return r.transport.transaction('rounds/' + n + '/startedAt', function (current) {
        return current == null ? r.transport.serverNow() : undefined;
      }).then(function () {
        startPoll();
        evaluate();
      }).catch(function () { /* a lost race for startedAt is harmless */ });
    },

    lockedOut: function () {
      var r = room();
      if (!r || !session) return false;
      return FF.RaceRules.lockedOut(currentRound(), r.uid);
    },

    /* Record an answer. A correct one contests the winner slot. */
    submit: function (choice, correct, ms) {
      var r = room();
      if (!r || !session) return Promise.resolve();
      var n = session.index;

      // Write the answer BEFORE claiming the winner slot, so a recorded
      // winner always has a readable answer behind it and the points are
      // never reported as zero. The window this opens - everyone has
      // answered but no winner is recorded yet - is handled in
      // FF.RaceRules.settle, which does not treat a round holding a
      // correct answer as exhausted.
      return r.transport.set('rounds/' + n + '/answers/' + r.uid, {
        choice: choice == null ? null : choice,
        correct: !!correct,
        ms: ms == null ? null : Math.round(ms)
      }).then(function () {
        if (!correct) return null;
        return r.transport.transaction('rounds/' + n + '/winner', function (current) {
          return current == null ? r.uid : undefined;   // first correct answer wins
        });
      }).then(function () {
        evaluate();
      });
    },

    onSettle: function (cb) {
      settleHandlers.push(cb);
      return function () {
        var i = settleHandlers.indexOf(cb);
        if (i !== -1) settleHandlers.splice(i, 1);
      };
    },

    scores: function () {
      var r = room();
      if (!r || !session) return {};
      return FF.RaceRules.scores(r.rounds || {}, FF.Room.racePlayers(), session.pointsFor);
    },

    /* Push the derived scores into FF.Scoring so the shell's header
       scoreboard shows the race standings instead of local zeroes. */
    syncScoring: function () {
      if (!session || !room()) return;
      var scores = this.scores();
      Object.keys(scores).forEach(function (id) {
        if (FF.Scoring && typeof FF.Scoring.set === 'function') {
          FF.Scoring.set(id, scores[id]);
        }
      });
    },

    roster: function () {
      return FF.Room ? FF.Room.scorers() : [];
    },

    end: function () {
      stopPoll();
      if (offRounds) { offRounds(); offRounds = null; }
      session = null;
      settleHandlers.length = 0;
      FF.Random.unseed();
    }
  };
})();
