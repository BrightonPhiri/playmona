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

  function answersOf(round) {
    return (round && round.answers) ? round.answers : {};
  }

  FF.RaceRules = {
    /* Sentinel stored in the winner slot when a round ends unwon. */
    NOBODY: '-',

    /* Decide whether a round is over.
       round   : { startedAt, answers: {uid:{choice,correct,ms}}, winner }
       players : [{uid, online}]
       timerMs : round time limit; 0 or null means no limit
       now     : server-aligned timestamp
       returns : { settled, winnerId, reason } */
    settle: function (round, players, timerMs, now) {
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
      var active = players.filter(function (p) { return p && p.online !== false; });

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

    /* Scores are always derived, never stored, so devices cannot drift.
       pointsFor(answer) returns the points for a winning answer. */
    scores: function (rounds, players, pointsFor) {
      var out = {};
      (players || []).forEach(function (p) { out[p.uid] = 0; });

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
