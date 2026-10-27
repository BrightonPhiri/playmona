/* ============================================================
   PLAYMONA — imposters/modes/word.js
   Word Imposter: most players get one word, the minority get the
   other word of the pair, and everyone gives one-word clues.

   Every Imposters mode implements the same interface (see
   js/imposters/referee.js), so new modes plug in without touching
   the lobby, voting or win rules:

     id, roundPhase ('clues' | 'challenge'), revealEachRound
     deal(state, run, ctx)              once, at the start
     secretsFor(state, round, ctx)      { uid: secret } or null
     crewSecret(state, uid)             extra private help for crew seats
     open(state, now, ctx)              { deadline } for the round phase
     accept(state, uid, cmd, ctx)       { value } or { error }
     close(state, subs)                 { uid: value } for the board
     reveal(state)                      what the results screen shows

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;
  FF.ImpostersModes = FF.ImpostersModes || {};

  function side(state, uid) {
    return state.minority.indexOf(uid) !== -1 ? 'minority' : 'majority';
  }

  FF.ImpostersModes.word = {
    id: 'word',
    roundPhase: 'clues',
    revealEachRound: false,

    deal: function (state, run, ctx) {
      var pair = run.pair;
      if (!pair || !pair.a || !pair.b || String(pair.a).toLowerCase() === String(pair.b).toLowerCase()) {
        throw new Error('This match has no word pair.');
      }
      var flip = ctx.randomInt(2) === 1;
      state.pairId = pair.id || null;
      state.words = flip ? { majority: pair.b, minority: pair.a } : { majority: pair.a, minority: pair.b };
      state.hints = flip
        ? { majority: pair.hintsB || [], minority: pair.hintsA || [] }
        : { majority: pair.hintsA || [], minority: pair.hintsB || [] };
      state.shared = pair.shared || [];
      state.used = {};
    },

    // One word for the whole match, dealt before round 1.
    secretsFor: function (state, round) {
      if (round !== 1) return null;
      var out = {};
      state.seats.forEach(function (uid) { out[uid] = { word: state.words[side(state, uid)] }; });
      return out;
    },

    // A crew player knows the things its own word brings to mind, as a person would.
    crewSecret: function (state, uid) {
      return { hints: state.hints[side(state, uid)] || [], shared: state.shared || [] };
    },

    open: function (state, now) {
      return { deadline: now + state.settings.clueSeconds * 1000 };
    },

    accept: function (state, uid, cmd, ctx) {
      if (cmd.type !== 'clue') return { error: 'phase' };
      var used = state.used[uid] || [];
      var v = R.validateClue(cmd.clue, { secret: state.words[side(state, uid)], used: used, isQuiet: ctx.isQuiet });
      if (!v.ok) return { error: v.error };
      state.used[uid] = used.concat([v.value.toLowerCase()]);
      return { value: v.value };
    },

    // Nobody's clue is missing from the board: a player who ran out of time shows "".
    close: function (state, subs) {
      var board = {};
      state.seats.forEach(function (uid) {
        if (!state.alive[uid]) return;
        board[uid] = Object.prototype.hasOwnProperty.call(subs, uid) ? subs[uid] : '';
      });
      return board;
    },

    reveal: function (state) {
      var assignments = {};
      state.seats.forEach(function (uid) { assignments[uid] = state.words[side(state, uid)]; });
      return { words: { majority: state.words.majority, minority: state.words.minority }, assignments: assignments };
    }
  };
})();
