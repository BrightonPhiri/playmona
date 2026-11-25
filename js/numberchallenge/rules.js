/* ============================================================
   PLAYMONA — numberchallenge/rules.js
   Number Challenge's rules, pure and shared by the screen
   (js/games/numberChallenge.js), the online referee
   (js/numberchallenge/referee.js, run by the crew runner), the crew
   brain and the tests. No DOM.

   Four ways to play:
     quick   one sum at a time against the clock (the standard)
     sprint  as many as you can before the clock runs out
     chain   keep a running total in your head
     target  merge number tiles to hit a target
   Levels Easy / Normal / Hard / Expert. Expert plays Hard's maths on
   a number pad (+6 s, +50); in Make the target it pays +50 for using
   every tile.

   Every answer is a whole number from 0 to 9999. Deals draw only from
   the seed passed in, never Math.random.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MODES = ['quick', 'sprint', 'chain', 'target'];
  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var WEIGHT = { easy: 1, normal: 1.5, hard: 2, expert: 2 };   // the old game's bonusMultiplier
  var TIMES = ['quick', 'normal', 'relaxed', 'none'];
  var ROUNDS = { quick: [10, 15, 20], chain: [5, 8, 10], target: [3, 5, 8] };
  var ROUNDS_DEFAULT = { quick: 10, chain: 5, target: 5, sprint: 1 };
  var SPRINTS = [30, 60, 90];
  var SPEEDS = ['steady', 'fast'];
  var STEP_MS = { steady: 2200, fast: 1400 };
  var STANDARD = { mode: 'quick', level: 'normal', time: 'normal', rounds: 10, sprint: 60, speed: 'steady' };
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var SPRINT_LIST = 150;

  var QUICK_SECONDS = { quick: 10, normal: 20, relaxed: 30 };
  var TARGET_BASE = { easy: 45, normal: 60, hard: 90, expert: 120 };
  var TARGET_SCALE = { quick: 0.75, normal: 1, relaxed: 1.5 };
  var CHAIN_SECONDS = 10;
  var EXPERT_EXTRA = 6;

  /* ---------- seeded random (as js/saywhat/rules.js) ---------- */

  function hash(s) {
    var str = String(s), h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* A whole number from lo to hi, both included. */
  function int(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }
  function pickOf(rand, list) { return list[Math.floor(rand() * list.length)]; }
  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* ---------- settings ---------- */

  function choose(v, list, d) { return list.indexOf(v) !== -1 ? v : d; }
  function sanitize(raw) {
    raw = raw || {};
    var mode = choose(raw.mode, MODES, STANDARD.mode);
    var rounds = ROUNDS[mode] ? choose(Number(raw.rounds), ROUNDS[mode], ROUNDS_DEFAULT[mode]) : ROUNDS_DEFAULT[mode];
    return {
      mode: mode,
      level: choose(raw.level, LEVELS, STANDARD.level),
      time: choose(raw.time, TIMES, STANDARD.time),
      rounds: rounds,
      sprint: choose(Number(raw.sprint), SPRINTS, STANDARD.sprint),
      speed: choose(raw.speed, SPEEDS, STANDARD.speed)
    };
  }
  /* Rooms: every mode and level, always a clock. */
  function sanitizeRoom(raw) {
    var s = sanitize(raw);
    if (s.time === 'none') s.time = 'normal';
    return s;
  }
  /* Leaderboards count Quick sums on Normal, 10 sums, Normal time only. */
  function isStandard(s) {
    s = sanitize(s);
    return s.mode === STANDARD.mode && s.level === STANDARD.level && s.time === STANDARD.time && s.rounds === STANDARD.rounds;
  }

  /* Seconds for one item; 0 means no limit. Sprint: the whole sprint. */
  function secondsFor(settings, item) {
    var s = sanitize(settings);
    var expert = s.level === 'expert';
    if (s.mode === 'sprint') return s.sprint;
    if (s.mode === 'chain') return CHAIN_SECONDS + (expert ? EXPERT_EXTRA : 0);
    if (s.time === 'none') return 0;
    if (s.mode === 'target') return Math.round(TARGET_BASE[s.level] * TARGET_SCALE[s.time]);
    return QUICK_SECONDS[s.time] + (expert ? EXPERT_EXTRA : 0);
  }

  FF.NumberChallengeRules = {
    MODES: MODES, LEVELS: LEVELS, WEIGHT: WEIGHT, TIMES: TIMES, ROUNDS: ROUNDS, SPRINTS: SPRINTS, SPEEDS: SPEEDS,
    STEP_MS: STEP_MS, STANDARD: STANDARD, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, SPRINT_LIST: SPRINT_LIST,
    hash: hash, rng: rng, int: int, pick: pickOf, shuffle: shuffle,
    sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard, secondsFor: secondsFor
  };
})();
