/* ============================================================
   PLAYMONA — crew/levels.js
   How the three play levels differ, as plain numbers. The brains
   read these; nothing about how well a level plays is written
   into a brain itself, so play can be tuned here alone.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.CrewLevels = {
    // accuracy: chance of a right answer before skill and traits;
    // speed: answer-time multiplier (above 1 is slower);
    // spread: how much answer times vary; depth: word tiers known;
    // reactionMs: median Quick Tap reaction; slip: false-start leaning.
    easy: { accuracy: 0.5, speed: 1.3, spread: 0.42, depth: 1, reactionMs: 320, slip: 0.08 },
    medium: { accuracy: 0.68, speed: 1.0, spread: 0.32, depth: 2, reactionMs: 260, slip: 0.05 },
    hard: { accuracy: 0.84, speed: 0.8, spread: 0.24, depth: 3, reactionMs: 215, slip: 0.03 },

    // The room's own difficulty: harder questions for everyone.
    room: {
      easy: { accuracy: 0.08, speed: 0.9 },
      normal: { accuracy: 0, speed: 1 },
      hard: { accuracy: -0.1, speed: 1.12 }
    },

    // Typical time to answer, in ms, for an average player (choice games).
    answerMs: {
      trueOrFalse: 2300,
      colorReaction: 1150,
      numberChallenge: 4800,
      visualRiddle: 5200,
      whatsMissing: 3600,
      guessWho: 5000,
      bibleQuiz: 4200,
      familyQuiz: 4000,
      capitalChallenge: 3600,
      mapChallenge: 4200,
      whereInWorld: 4200,
      _default: 3400
    },

    // Rounds a patient player never skips; impatient ones sometimes look away.
    skipMax: 0.08,

    // Letter Rush: words found per minute at skill 0 and 100.
    wordsPerMinute: [4, 15],

    of: function (level) { return this[level] && this[level].accuracy != null ? this[level] : this.medium; }
  };
})();
