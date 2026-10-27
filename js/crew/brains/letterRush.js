/* ============================================================
   PLAYMONA — crew/brains/letterRush.js
   Letter Rush is played for real: the brain deals the same letters
   every phone deals from the room seed, searches the word bank for
   words those letters make, keeps the ones this player would know
   (word tiers by level and skill), finds as many as their speed
   allows in the time, and scores them with the game's own points.
   Every word is a real FF.Words word that fits the rack.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var U = FF.CrewBrains.util;

  // The public set of letters: the same seed path as startRace in letterRush.js.
  FF.CrewBrains.registerView('letterRush', function (input) {
    if (!FF.LetterRush || !FF.Words || !FF.Words.ready()) return {};
    FF.Random.seed(FF.Random.roundSeed(input.seed, 'letterRush', 'rack'));
    var rack = FF.LetterRush.deal(input.difficulty || 'normal');
    FF.Random.unseed();
    if (!rack) return {};
    var lv = FF.LetterRush.LEVELS[input.difficulty] || FF.LetterRush.LEVELS.normal;
    var seconds = FF.LetterRush.roundSeconds(input.config || {}) || 120;
    return { letters: rack.letters.join(''), min: lv.min, seconds: seconds };
  });

  // How hard a word is to spot: longer and rarer words come later.
  function effort(word, tier, size) {
    return word.length * 1.4 + tier * 2.5 + (word.length === size ? 6 : 0);
  }

  FF.CrewBrains.register('letterRush', {
    plan: function (ctx) {
      var v = ctx.view;
      if (!v.letters) return null;
      var r = ctx.rng;
      var lv = FF.CrewLevels.of(ctx.level);
      var size = v.letters.length;
      var depth = Math.min(4, lv.depth + (ctx.skill >= 80 ? 1 : 0));
      var known = FF.Words.wordsFrom(v.letters, { min: v.min, maxTier: depth });

      // Order them roughly the way a person finds them, with some luck.
      var spread = 4 + 6 * (1 - ctx.persona.strategy / 100);
      var ranked = known.map(function (w) {
        return { w: w, e: effort(w, FF.Words.tier(w) || depth, size) + (r() - 0.5) * spread };
      }).sort(function (a, b) { return a.e - b.e; });

      var wpm = FF.CrewLevels.wordsPerMinute;
      var perMinute = wpm[0] + (wpm[1] - wpm[0]) * (0.7 * ctx.skill / 100 + 0.3 * ctx.persona.reaction / 100);
      perMinute *= ({ easy: 1.05, normal: 1, hard: 0.85 })[ctx.difficulty] || 1;
      var cap = Math.max(1, Math.round(perMinute * v.seconds / 60 * (0.85 + 0.3 * r())));
      // Sharper players also spot more of what they know.
      var spot = U.clamp(0.45 + 0.5 * ctx.skill / 100, 0.3, 0.95);

      var words = [];
      for (var i = 0; i < ranked.length && words.length < cap; i++) {
        if (r() < spot) words.push(ranked[i].w);
      }
      var score = words.reduce(function (s, w) { return s + FF.LetterRush.points(w, size); }, 0);
      // Phones bank their score when their own turn clock ends, then a moment later.
      var atMs = Math.round(v.seconds * 1000 + 600 + r() * 2400);
      return { atMs: atMs, answer: { choice: null, correct: true, ms: atMs, value: score }, detail: { words: words } };
    }
  });
})();
