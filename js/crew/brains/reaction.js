/* ============================================================
   PLAYMONA — crew/brains/reaction.js
   Quick Tap. The signal time and any decoy flashes come from the
   room seed exactly as every phone draws them (FF.QuickTap.schedule
   right after the round is seeded), so the brain reacts to the same
   moment everyone else sees. Reaction times follow a human spread
   by skill and level; risk-takers sometimes jump the gun or tap a
   decoy, impatient players sometimes miss.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var U = FF.CrewBrains.util;
  var MISS_MS = 2500;

  // The round's public schedule: what every device in the room draws.
  FF.CrewBrains.registerView('quickTap', function (input) {
    if (!FF.QuickTap || !FF.Random) return {};
    FF.Random.seed(FF.Random.roundSeed(input.seed, 'quickTap', input.round | 0));
    var schedule = FF.QuickTap.schedule(input.difficulty || 'normal', FF._rand);
    FF.Random.unseed();
    return { schedule: schedule };
  });

  /* Median reaction in ms for this player: about 190 (sharp) to 340 (slow). */
  function median(ctx) {
    var lv = FF.CrewLevels.of(ctx.level);
    var m = lv.reactionMs + 60 - 1.1 * ctx.skill - 0.5 * (ctx.persona.reaction - 50);
    return U.clamp(m, 175, 360);
  }

  FF.CrewBrains.register('quickTap', {
    median: median,
    plan: function (ctx) {
      var schedule = ctx.view.schedule;
      if (!schedule) return null;
      var lv = FF.CrewLevels.of(ctx.level);
      var r = ctx.rng;
      var risk = ctx.persona.risk / 100;
      var steady = 1 - ctx.skill / 200;

      // Tapping a decoy (hard rooms only).
      for (var i = 0; i < schedule.decoys.length; i++) {
        if (r() < (0.06 + 0.22 * risk) * steady) {
          return { atMs: schedule.decoys[i].at + Math.round(U.lognormal(r, median(ctx), 0.2)),
                   answer: { choice: null, correct: false, ms: null, kind: 'decoy' } };
        }
      }
      // Jumping the gun.
      if (r() < lv.slip * (0.4 + risk)) {
        return { atMs: Math.round(schedule.signal * (0.55 + 0.4 * r())), answer: { choice: null, correct: false, ms: null, kind: 'early' } };
      }
      // Looking away.
      if (r() < 0.025 * (1 - ctx.persona.patience / 100)) {
        return { atMs: schedule.signal + MISS_MS + 50, answer: { choice: null, correct: false, ms: null, kind: 'miss' } };
      }
      var spread = 0.13 + 0.14 * (1 - ctx.persona.consistency / 100);
      var ms = Math.round(U.clamp(U.lognormal(r, median(ctx), spread), 150, MISS_MS));
      if (ms >= MISS_MS) return { atMs: schedule.signal + MISS_MS + 50, answer: { choice: null, correct: false, ms: null, kind: 'miss' } };
      return { atMs: schedule.signal + ms, answer: { choice: null, correct: true, ms: ms, kind: 'tap' } };
    }
  });
})();
