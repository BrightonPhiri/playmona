/* ============================================================
   PLAYMONA — crew/brains/quiz.js
   Choice games (quizzes, guess-the-picture, maths, Color Reaction).
   The brain never sees the question or the answer key: it plays
   from a skill model. How likely a right answer is comes from the
   player's skill at this game, their level, their accuracy and
   consistency, and the room's difficulty; how fast they answer
   comes from the game's typical time and their reaction speed.
   A wrong answer locks them out of the round, as it does a phone.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var GAMES = [
    'bibleQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz', 'familyQuiz', 'whatsMissing',
    'numberChallenge', 'visualRiddle', 'colorReaction',
    'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood', 'guessObject', 'guessSport', 'guessVehicle',
    'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag'
  ];

  var U = FF.CrewBrains.util;

  /* Chance of a right answer, 0.04 to 0.97. Exposed for the tests. */
  function accuracy(ctx) {
    var lv = FF.CrewLevels.of(ctx.level);
    var room = FF.CrewLevels.room[ctx.difficulty] || FF.CrewLevels.room.normal;
    var p = 0.45 * lv.accuracy + 0.4 * (ctx.skill / 100) + 0.15 * (ctx.persona.accuracy / 100) + room.accuracy;
    // Inconsistent players have good and bad rounds.
    p += (ctx.rng() - 0.5) * (1 - ctx.persona.consistency / 100) * 0.3;
    if (ctx.gameId === 'trueOrFalse') p = 0.5 + (p - 0.5) * 0.9;   // a coin flip is never far away
    return U.clamp(p, 0.04, 0.97);
  }

  function answerMs(ctx, correct) {
    var lv = FF.CrewLevels.of(ctx.level);
    var room = FF.CrewLevels.room[ctx.difficulty] || FF.CrewLevels.room.normal;
    var base = FF.CrewLevels.answerMs[ctx.gameId] || FF.CrewLevels.answerMs._default;
    var quick = 1.35 - 0.7 * (ctx.persona.reaction / 100);         // 0.65 to 1.35
    var sure = 1.15 - 0.3 * (ctx.skill / 100);                     // people who know answer sooner
    var median = base * lv.speed * room.speed * quick * sure;
    // Risk-takers blurt out wrong answers; careful players take longer to be wrong.
    if (!correct) median *= 1.1 - 0.35 * (ctx.persona.risk / 100);
    var spread = lv.spread * (1.3 - 0.6 * (ctx.persona.consistency / 100));
    var ms = U.lognormal(ctx.rng, median, spread);
    var cap = ctx.timerMs ? ctx.timerMs - 400 : 25000;
    var floor = ctx.gameId === 'colorReaction' ? 420 : 700;
    return Math.round(U.clamp(ms, floor, Math.max(floor, cap)));
  }

  FF.CrewBrains.register(GAMES, {
    accuracy: accuracy,
    plan: function (ctx) {
      // Now and then an impatient player lets a round go by.
      var skip = FF.CrewLevels.skipMax * (1 - ctx.persona.patience / 100);
      if (ctx.rng() < skip) return null;
      var correct = ctx.rng() < accuracy(ctx);
      var ms = answerMs(ctx, correct);
      var answer = { choice: null, correct: correct, ms: ms };
      // Bible Quiz scores a round by the answer's own value, as the phone works it out.
      if (ctx.gameId === 'bibleQuiz') answer.value = correct ? 100 + Math.max(0, Math.round((20 - ms / 1000) * 3)) : 0;
      return { atMs: ms, answer: answer };
    }
  });

  FF.CrewBrains.QUIZ_GAMES = GAMES;
})();
