/* ============================================================
   PLAYMONA — net/race.js
   The only multiplayer surface a game touches. When no room is
   active every call is inert and games fall through to their
   normal single-device behaviour.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // How far in the future a round is scheduled to open. Every device waits
  // for this shared instant before revealing the question, so nobody can
  // answer early. Without it the host answers first every time: Firebase
  // applies a device's own write optimistically, so the host's watcher
  // fires immediately while everyone else waits a network round trip.
  var LEAD_MS = 1200;

  var session = null;         // { gameId, rounds, timerMs, pointsFor, index, settled }
  // Kept after end() so the final results screen can still derive scores;
  // scoring needs the game's pointsFor, and the session is gone by then.
  var lastSession = null;
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

    var node = currentRound();
    var verdict = FF.RaceRules.settle(
      node,
      FF.Room.racePlayers(),
      session.timerMs,
      r.transport.serverNow(),
      session.mode
    );
    if (!verdict.settled) return;

    // A winner already recorded in the room is a shared fact - settle on it.
    if (node && node.winner && node.winner !== FF.RaceRules.NOBODY) {
      finalise(node.winner, 'winner');
      return;
    }
    // In 'first' mode the verdict's winner IS the stored slot.
    if (session.mode === 'first' && verdict.winnerId) {
      finalise(verdict.winnerId, 'winner');
      return;
    }

    // Publish this device's conclusion so every device ends the round the
    // same way. Devices judge timeouts from their own clock, and in
    // 'fastest' mode each derives the winner from the recorded times, so
    // the first write wins and everyone else defers to it.
    session.claiming = true;
    var n = session.index;
    var localReason = verdict.reason;
    var proposal = verdict.winnerId || FF.RaceRules.NOBODY;
    r.transport.transaction('rounds/' + n + '/winner', function (current) {
      return current == null ? proposal : undefined;
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
        // 'first'    - first correct answer claims the winner slot
        // 'fastest'  - quickest correct answer wins once everyone has gone
        // 'parallel' - everyone plays the same challenge and keeps their
        //              own score; the winner is only for the headline
        mode: (opts.mode === 'fastest' || opts.mode === 'parallel') ? opts.mode : 'first',
        index: 0,
        settled: false,
        claiming: false
      };
      lastSession = null;
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

      // The first device here schedules when the round OPENS - a moment in
      // the near future, not now - and everyone else reads that same
      // instant. This is what keeps the reveal simultaneous.
      return r.transport.transaction('rounds/' + n + '/startedAt', function (current) {
        return current == null ? (r.transport.serverNow() + LEAD_MS) : undefined;
      }).then(function () {
        startPoll();
        evaluate();
      }).catch(function () { /* a lost race for startedAt is harmless */ });
    },

    /* The server-aligned instant this round opens for answers, or null. */
    opensAt: function () {
      var node = currentRound();
      return (node && node.startedAt != null) ? node.startedAt : null;
    },

    /* Milliseconds until the round opens; 0 once it is open. */
    msUntilOpen: function () {
      var r = room();
      var at = this.opensAt();
      if (!r || at == null) return 0;
      var left = at - r.transport.serverNow();
      return left > 0 ? left : 0;
    },

    /* Time since the round opened, measured from the SHARED instant rather
       than from when this device happened to render. That makes the
       recorded answer time comparable across devices. */
    msSinceOpen: function () {
      var r = room();
      var at = this.opensAt();
      if (!r || at == null) return null;
      var since = r.transport.serverNow() - at;
      return since > 0 ? Math.round(since) : 0;
    },

    /* Run cb at the shared open instant (immediately if already open).
       Returns a cancel function. */
    whenOpen: function (cb) {
      var self = this;
      var cancelled = false;
      var timer = null;
      function tick() {
        if (cancelled) return;
        var left = self.msUntilOpen();
        // Re-check rather than trusting one reading: startedAt may not have
        // arrived from the server yet when this is first called.
        if (left <= 0 && self.opensAt() != null) { cb(); return; }
        timer = setTimeout(tick, left > 0 ? Math.min(left, 120) : 60);
      }
      tick();
      return function () { cancelled = true; if (timer) clearTimeout(timer); };
    },

    lockedOut: function () {
      var r = room();
      if (!r || !session) return false;
      return FF.RaceRules.lockedOut(currentRound(), r.uid);
    },

    /* Record an answer. A correct one contests the winner slot.
       `extra` carries game-specific fields onto the stored answer - for
       example Guess Who, where the points depend on how many clues were
       revealed and so cannot be derived from the answer time. */
    submit: function (choice, correct, ms, extra) {
      var r = room();
      if (!r || !session) return Promise.resolve();
      var n = session.index;

      // Write the answer BEFORE claiming the winner slot, so a recorded
      // winner always has a readable answer behind it and the points are
      // never reported as zero. The window this opens - everyone has
      // answered but no winner is recorded yet - is handled in
      // FF.RaceRules.settle, which does not treat a round holding a
      // correct answer as exhausted.
      var record = {
        choice: choice == null ? null : choice,
        correct: !!correct,
        ms: ms == null ? null : Math.round(ms)
      };
      if (extra) {
        Object.keys(extra).forEach(function (k) {
          if (extra[k] !== undefined) record[k] = extra[k];
        });
      }

      return r.transport.set('rounds/' + n + '/answers/' + r.uid, record).then(function () {
        // In 'fastest' mode nobody claims on answering - the winner is
        // derived from the recorded times once the round closes.
        if (!correct || session.mode === 'fastest' || session.mode === 'parallel') return null;
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

    scores: function (rounds) {
      var r = room();
      var s = session || lastSession;
      if (!r || !s) return {};
      return FF.RaceRules.scores(rounds || r.rounds || {}, FF.Room.racePlayers(), s.pointsFor, s.mode);
    },

    /* Push the derived scores into FF.Scoring so the shell's header
       scoreboard shows the race standings instead of local zeroes. */
    /* One helper any game file can use to join the race, so the wiring is
       written once rather than per engine. Returns null offline, letting
       each game keep its single-device path untouched:

         var race = FF.Race.forGame(api, { rounds: 6, optionSelector: '.x' });
         if (race) race.beginRound(n);   ... race.submit(i, correct, ms)

       opts: { rounds, optionSelector, mode, pointsFor, timerMs } */
    forGame: function (api, opts) {
      if (!this.active()) return null;
      opts = opts || {};
      var self = this;
      var sel = opts.optionSelector || 'button';

      this.begin(api.def.id, {
        rounds: opts.rounds || 8,
        mode: opts.mode,
        timerMs: opts.timerMs != null ? opts.timerMs : (api.config.timer || 0) * 1000,
        pointsFor: opts.pointsFor || function (answer) {
          if (answer.value != null) return answer.value;
          return (answer.ms != null && answer.ms <= 2500) ? 150 : 100;
        }
      });

      return {
        beginRound: function (n) { return self.beginRound(n); },

        /* Hold the options until the round's shared open instant. */
        gate: function (onOpen) {
          return FF.RaceUI.gate(api.shell.root, sel, onOpen);
        },

        /* Times are measured from the shared instant so they compare
           across devices, not from when each one rendered. */
        submit: function (choice, correct, fallbackMs, extra) {
          var shared = self.msSinceOpen();
          var p = self.submit(choice, correct, shared != null ? shared : fallbackMs, extra);
          if (!correct && opts.mode !== 'parallel') FF.RaceUI.lockOut(api.shell.root, sel);
          return p;
        },

        onSettle: function (cb) { return self.onSettle(cb); },

        /* The shared result screen every racing game uses. */
        showResult: function (payload, o) {
          o = o || {};
          self.syncScoring();
          api.shell.updateScores();
          FF.RaceUI.result(api.shell.root, {
            payload: payload,
            answerText: o.answerText != null ? o.answerText : null,
            isLast: !!o.isLast,
            onNext: o.onNext || function () {}
          });
        },

        end: function () { self.end(); }
      };
    },

    syncScoring: function () {
      var s = session || lastSession;
      var r = room();
      if (!s || !r) return;
      var scores = this.scores();
      if (r.meta && r.meta.mode === 'teams') {
        FF.Room.scorers().forEach(function (team) {
          scores[team.id] = (team.players || []).reduce(function (total, uid) {
            return total + (scores[uid] || 0);
          }, 0);
        });
      }
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
      lastSession = session;
      session = null;
      settleHandlers.length = 0;
      FF.Random.unseed();
    }
  };
})();
