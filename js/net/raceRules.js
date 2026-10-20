/* ============================================================
   FAMILY FUN — net/raceRules.js
   Pure race logic: when is a round over, who won it, and what
   is everyone's score. No DOM, no network, no clock of its own
   — every input is passed in, so this is fully testable and
   every device computes the same answer from the same data.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var PRESENCE_STALE_MS = 20000;

  function answersOf(round) {
    return (round && round.answers) ? round.answers : {};
  }

  FF.RaceRules = {
    /* Sentinel stored in the winner slot when a round ends unwon. */
    NOBODY: '-',
    PRESENCE_STALE_MS: PRESENCE_STALE_MS,

    /* The fastest correct answer in a round, or null. Used by reaction
       games, where the winner must be the quickest recorded tap rather
       than whoever's write reached the server first - otherwise network
       latency, not reflexes, decides the round. */
    fastestOf: function (round) {
      var answers = answersOf(round);
      var best = null;
      var bestMs = null;
      Object.keys(answers).forEach(function (uid) {
        var a = answers[uid];
        if (!a || a.correct !== true || a.ms == null) return;
        if (bestMs == null || a.ms < bestMs) { bestMs = a.ms; best = uid; }
      });
      return best;
    },

    /* The highest-scoring answer in a round, or null. Used by parallel
       games, where everyone plays the same challenge at the same time and
       keeps their own score rather than racing for one point. */
    bestOf: function (round) {
      var answers = answersOf(round);
      var best = null;
      var bestVal = null;
      Object.keys(answers).forEach(function (uid) {
        var a = answers[uid];
        if (!a || a.value == null) return;
        if (bestVal == null || a.value > bestVal) { bestVal = a.value; best = uid; }
      });
      return (bestVal != null && bestVal > 0) ? best : null;
    },

    /* Decide whether a round is over.
       round   : { startedAt, answers: {uid:{choice,correct,ms}}, winner }
       players : [{uid, online}]
       timerMs : round time limit; 0 or null means no limit
       now     : server-aligned timestamp
       mode    : 'first' (default) - the winner slot is claimed on answer;
                 'fastest' - nobody claims, the quickest correct answer
                 wins once everyone has answered or the clock runs out.
       returns : { settled, winnerId, reason } */
    settle: function (round, players, timerMs, now, mode) {
      round = round || {};
      players = players || [];

      if (round.winner) {
        // NOBODY is written when a round ends with no correct answer. It
        // makes 'nobody won' a shared fact instead of each device judging
        // it from its own clock, which could otherwise disagree.
        if (round.winner === FF.RaceRules.NOBODY) {
          return { settled: true, winnerId: null, reason: 'exhausted' };
        }
        return { settled: true, winnerId: round.winner, reason: 'winner' };
      }

      var answers = answersOf(round);
      var active = players.filter(function (p) {
        if (!p || p.online === false) return false;
        return p.lastSeen == null || (now - p.lastSeen) <= PRESENCE_STALE_MS;
      });
      var everyoneAnswered = active.length && active.every(function (p) {
        return Object.prototype.hasOwnProperty.call(answers, p.uid);
      });
      var timedOut = !!(timerMs && timerMs > 0 && round.startedAt != null &&
        (now - round.startedAt) >= timerMs);

      if (mode === 'parallel') {
        // Everyone plays the whole round; it ends when all have finished
        // or the clock runs out. The 'winner' is only for the headline -
        // in this mode every player keeps the points they earned.
        if (everyoneAnswered || timedOut) {
          return {
            settled: true,
            winnerId: this.bestOf(round),
            reason: everyoneAnswered ? 'exhausted' : 'timeout'
          };
        }
        return { settled: false, winnerId: null, reason: null };
      }

      if (mode === 'fastest') {
        // No slot is claimed on answer; the round ends when everyone has
        // had their go, and the quickest correct answer takes it.
        if (everyoneAnswered || timedOut) {
          return {
            settled: true,
            winnerId: this.fastestOf(round),
            reason: everyoneAnswered ? 'exhausted' : 'timeout'
          };
        }
        return { settled: false, winnerId: null, reason: null };
      }

      if (active.length) {
        var allAnswered = active.every(function (p) {
          return Object.prototype.hasOwnProperty.call(answers, p.uid);
        });
        // A correct answer that has not yet claimed the winner slot must
        // NOT count as exhaustion. An answer is written before the winner
        // transaction resolves, so treating 'everyone answered' as a dead
        // round would settle it wrongly in that window.
        var anyCorrect = Object.keys(answers).some(function (uid) {
          return answers[uid] && answers[uid].correct === true;
        });
        if (allAnswered && !anyCorrect) {
          return { settled: true, winnerId: null, reason: 'exhausted' };
        }
      }

      if (timerMs && timerMs > 0 && round.startedAt != null && (now - round.startedAt) >= timerMs) {
        return { settled: true, winnerId: null, reason: 'timeout' };
      }

      return { settled: false, winnerId: null, reason: null };
    },

    /* True once this player has answered wrongly this round. */
    lockedOut: function (round, uid) {
      var a = answersOf(round)[uid];
      return !!(a && a.correct === false);
    },

    /* A winner and its answer are written separately. Results are safe to
       publish only after every winner has its scoring answer available. */
    scoresReady: function (rounds) {
      return Object.keys(rounds || {}).every(function (key) {
        var round = rounds[key];
        if (!round || !round.winner || round.winner === FF.RaceRules.NOBODY) return true;
        return Object.prototype.hasOwnProperty.call(answersOf(round), round.winner);
      });
    },

    /* Scores are always derived, never stored, so devices cannot drift.
       pointsFor(answer) returns the points for a winning answer. */
    scores: function (rounds, players, pointsFor, mode) {
      var out = {};
      (players || []).forEach(function (p) { out[p.uid] = 0; });

      // Parallel games are not winner-takes-all: each player banks what
      // they scored in every round.
      if (mode === 'parallel') {
        Object.keys(rounds || {}).forEach(function (key) {
          var answers = answersOf(rounds[key]);
          Object.keys(answers).forEach(function (uid) {
            var a = answers[uid];
            if (!a) return;
            if (!Object.prototype.hasOwnProperty.call(out, uid)) out[uid] = 0;
            var v = (a.value != null) ? a.value : 0;
            out[uid] += (typeof v === 'number' && isFinite(v)) ? v : 0;
          });
        });
        return out;
      }

      Object.keys(rounds || {}).forEach(function (key) {
        var round = rounds[key];
        if (!round || !round.winner || round.winner === FF.RaceRules.NOBODY) return;
        var winner = round.winner;
        if (!Object.prototype.hasOwnProperty.call(out, winner)) out[winner] = 0;
        var answer = answersOf(round)[winner];
        if (!answer) return;                       // partial data: score nothing
        var pts = pointsFor(answer);
        out[winner] += (typeof pts === 'number' && isFinite(pts)) ? pts : 0;
      });

      return out;
    }
  };
})();
