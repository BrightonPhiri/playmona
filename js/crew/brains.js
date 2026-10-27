/* ============================================================
   PLAYMONA — crew/brains.js
   The shared game-intelligence interface for PlayMona-run players.
   One registry for every game: a brain gets a frozen context with
   only what a participant could know (no answer key, no other
   players' answers) and returns when to answer and what to write,
   exactly as a phone would write it.

     FF.CrewBrains.register(['quickTap'], brain)
     FF.CrewBrains.plan(input) -> { atMs, answer, detail? } | null

   brain.plan(ctx) receives:
     gameId, mode, round, rounds, difficulty, timerMs, persona,
     skill, level, rng (seeded per player and round), view.
   Runs in the Node runner (via vm) and in the browser dev runner.
   Classic script, ES2017 or older, no DOM, no network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var TRAITS = ['competitiveness', 'friendliness', 'reaction', 'accuracy', 'risk', 'strategy', 'patience', 'consistency', 'social'];
  var brains = {};
  var views = {};

  // A private random stream, so brains never disturb FF._rand (the room's seeded stream).
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {
    var a = hash(String(seed));
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // A natural spread of human times: most near the median, a long slow tail.
  function lognormal(r, median, sigma) {
    var u = Math.max(1e-9, r());
    var v = r();
    var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(sigma * z);
  }

  function freeze(obj) {
    if (Object.freeze) Object.freeze(obj);
    return obj;
  }

  FF.CrewBrains = {
    TRAITS: TRAITS,

    register: function (ids, brain) {
      (Array.isArray(ids) ? ids : [ids]).forEach(function (id) { brains[id] = brain; });
    },

    forGame: function (id) { return brains[id] || null; },

    games: function () { return Object.keys(brains); },

    /* Public information some games deal from the room seed (the same on every phone). */
    registerView: function (id, build) { views[id] = build; },

    view: function (gameId, input) {
      return views[gameId] ? views[gameId](input || {}) : {};
    },

    /* The only things a brain may see. Everything else in input is dropped. */
    context: function (input) {
      input = input || {};
      var persona = {};
      TRAITS.forEach(function (t) {
        var v = input.persona && input.persona[t];
        persona[t] = typeof v === 'number' ? clamp(v, 0, 100) : 50;
      });
      var view = {};
      Object.keys(input.view || {}).forEach(function (k) { view[k] = input.view[k]; });
      var level = FF.CrewLevels && FF.CrewLevels[input.level] && FF.CrewLevels[input.level].accuracy != null ? input.level : 'medium';
      return freeze({
        gameId: String(input.gameId || ''),
        mode: input.mode || 'first',
        round: input.round | 0,
        rounds: input.rounds | 0,
        difficulty: ['easy', 'normal', 'hard'].indexOf(input.difficulty) >= 0 ? input.difficulty : 'normal',
        timerMs: input.timerMs > 0 ? input.timerMs : 0,
        persona: freeze(persona),
        skill: clamp(typeof input.skill === 'number' ? input.skill : 50, 0, 100),
        level: level,
        rng: rng([input.uid, input.seed, input.gameId, input.round, input.nonce || ''].join('|')),
        view: freeze(view)
      });
    },

    plan: function (input) {
      var brain = brains[input && input.gameId];
      if (!brain) return null;
      return brain.plan(this.context(input));
    },

    // Helpers for brains.
    util: { clamp: clamp, lognormal: lognormal, rng: rng }
  };
})();
