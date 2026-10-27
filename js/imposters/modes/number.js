/* ============================================================
   PLAYMONA — imposters/modes/number.js
   Number Imposter: each round everyone gets a secret target time,
   the minority a different one, and everyone stops a shared clock
   as close to their own target as they can. The times are shown;
   the targets stay secret until the end.

   Timing is the server's: a stop command is stamped by the database
   when it arrives, and the phone's own measurement is only trusted
   within a second before that (FF.ImpostersRules.clampStop).
   Same interface as modes/word.js. Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;
  FF.ImpostersModes = FF.ImpostersModes || {};

  var GET_READY_MS = 3000;     // from the round opening to the clock starting
  var SLACK_MS = 5000;         // after the longer target, the round times out

  function side(state, uid) {
    return state.minority.indexOf(uid) !== -1 ? 'minority' : 'majority';
  }

  FF.ImpostersModes.number = {
    id: 'number',
    roundPhase: 'challenge',
    revealEachRound: true,
    GET_READY_MS: GET_READY_MS,

    deal: function (state) {
      state.targets = {};
    },

    // New targets every round, for the same two groups.
    secretsFor: function (state, round, ctx) {
      var t = R.makeTargets(state.settings.difficulty, ctx.randomInt);
      state.targets['r' + round] = t;
      var out = {};
      state.seats.forEach(function (uid) { out[uid] = { round: round, target: t[side(state, uid)] }; });
      return out;
    },

    crewSecret: function () { return {}; },

    open: function (state, now) {
      var t = state.targets['r' + state.round];
      state.goAt = now + GET_READY_MS;
      return { deadline: state.goAt + Math.max(t.majority, t.minority) + SLACK_MS, goAt: state.goAt };
    },

    accept: function (state, uid, cmd, ctx) {
      if (cmd.type !== 'stop') return { error: 'phase' };
      var arrived = ctx.arrivedAt;
      if (arrived < state.goAt) return { error: 'early' };
      return { value: R.clampStop(cmd.ms, arrived - state.goAt) };
    },

    // -1: did not stop before the round timed out.
    close: function (state, subs) {
      var board = {};
      state.seats.forEach(function (uid) {
        if (!state.alive[uid]) return;
        board[uid] = Object.prototype.hasOwnProperty.call(subs, uid) ? subs[uid] : -1;
      });
      return board;
    },

    reveal: function (state) {
      var assignments = {};
      var last = state.targets['r' + state.round] || null;
      state.seats.forEach(function (uid) { assignments[uid] = side(state, uid); });
      return { targets: state.targets, lastTargets: last, assignments: assignments };
    }
  };
})();
