/* ============================================================
   PLAYMONA — wordshift/rules.js
   WordShift's rules, pure and shared by the screen
   (js/games/wordShift.js), the online referee
   (js/wordshift/referee.js), the crew brain and the tests. No DOM.
   The server's checker (api/lib/WordShift.php) mirrors checkMove
   and SCORING; a test compares the numbers.

   A move changes exactly one letter, in place, to a real word not
   used yet in this puzzle (the start word counts as used).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var MODES = ['classic', 'timed'];
  var CLOCKS = [60, 90, 120, 180];
  var DEFAULT_CLOCK = 120;
  var ROOM_ROUNDS = [1, 3, 5];
  var ROOM_CLOCKS = [90, 120, 180];

  // Points. PHP keeps the same numbers (WordShift::SCORING).
  var SCORING = {
    finish: 100,       // reaching the target
    efficiency: 100,   // most for matching the shortest path...
    perExtra: 15,      // ...less this for each move over it
    perSecond: 2,      // Time Challenge: per second left
    perInvalid: 5,     // taken off for each refused word
    race: [100, 70, 50, 30]  // online: by finishing place (30 for 4th and later)
  };
  var STANDARD = { mode: 'classic', level: 'normal', seconds: DEFAULT_CLOCK };

  function clean(w) { return String(w == null ? '' : w).toLowerCase().replace(/[^a-z]/g, ''); }

  /* prev -> next: { ok: true } or { ok: false, reason: length | same | many | word | used }. */
  function checkMove(prev, next, used, isWord) {
    prev = clean(prev);
    next = clean(next);
    if (next.length !== prev.length) return { ok: false, reason: 'length' };
    var diff = 0;
    for (var i = 0; i < next.length; i++) if (next.charAt(i) !== prev.charAt(i)) diff++;
    if (diff === 0) return { ok: false, reason: 'same' };
    if (diff > 1) return { ok: false, reason: 'many' };
    if (!isWord(next)) return { ok: false, reason: 'word' };
    if ((used || []).indexOf(next) !== -1) return { ok: false, reason: 'used' };
    return { ok: true };
  }

  function greens(word, target) {
    word = clean(word);
    target = clean(target);
    var out = [];
    for (var i = 0; i < target.length; i++) out.push(word.charAt(i) === target.charAt(i));
    return out;
  }

  function greenCount(word, target) {
    return greens(word, target).filter(Boolean).length;
  }

  /* { finished, moves, shortest, invalid, timed, secondsLeft } -> whole points, never below 0. */
  function score(r) {
    if (!r || !r.finished) return 0;
    var extra = Math.max(0, (r.moves | 0) - (r.shortest | 0));
    var pts = SCORING.finish + Math.max(0, SCORING.efficiency - SCORING.perExtra * extra);
    if (r.timed) pts += SCORING.perSecond * Math.max(0, Math.floor(r.secondsLeft || 0));
    pts -= SCORING.perInvalid * Math.max(0, r.invalid | 0);
    return Math.max(0, Math.round(pts));
  }

  function racePoints(place) {
    var list = SCORING.race;
    return place < 1 ? 0 : list[Math.min(place, list.length) - 1];
  }

  // FNV-1a, 32 bit: the same as Leaderboards::fnv in PHP.
  function fnv(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function ofLevel(puzzles, level) {
    return (puzzles || []).filter(function (p) { return p.lv === level; });
  }

  // WordShift's own daily puzzle: a Normal one, the same for everyone on that (UTC) day.
  function dailyPuzzle(day, puzzles) {
    var list = ofLevel(puzzles, 'normal');
    return list.length ? list[fnv('wordshift|' + day) % list.length] : null;
  }

  // A puzzle of the level, unseen ones first. rand() -> [0, 1).
  function pick(puzzles, level, seen, rand) {
    var all = ofLevel(puzzles, level);
    if (!all.length) return null;
    var fresh = all.filter(function (p) { return (seen || []).indexOf(p.id) === -1; });
    var pool = fresh.length ? fresh : all;
    return pool[Math.min(pool.length - 1, Math.floor((rand || Math.random)() * pool.length))];
  }

  function byId(puzzles, id) {
    for (var i = 0; i < (puzzles || []).length; i++) if (puzzles[i].id === id) return puzzles[i];
    return null;
  }

  function oneOf(v, list, d) { return list.indexOf(v) !== -1 ? v : d; }

  function sanitize(raw) {
    raw = raw || {};
    return {
      mode: oneOf(raw.mode, MODES, 'classic'),
      level: oneOf(raw.level, LEVELS, 'normal'),
      seconds: oneOf(Number(raw.seconds), CLOCKS, DEFAULT_CLOCK)
    };
  }

  function sanitizeRoom(raw) {
    raw = raw || {};
    return {
      level: oneOf(raw.level, LEVELS, 'normal'),
      rounds: oneOf(Number(raw.rounds), ROOM_ROUNDS, 3),
      clock: oneOf(Number(raw.clock), ROOM_CLOCKS, 120)
    };
  }

  function isStandard(s) {
    s = sanitize(s);
    return s.mode === STANDARD.mode && s.level === STANDARD.level;
  }

  FF.WordShiftRules = {
    LEVELS: LEVELS, MODES: MODES, CLOCKS: CLOCKS, DEFAULT_CLOCK: DEFAULT_CLOCK,
    ROOM_ROUNDS: ROOM_ROUNDS, ROOM_CLOCKS: ROOM_CLOCKS, SCORING: SCORING, STANDARD: STANDARD,
    MIN_PLAYERS: 2, MAX_PLAYERS: 8, MAX_MOVES: 200,
    clean: clean, checkMove: checkMove, greens: greens, greenCount: greenCount,
    score: score, racePoints: racePoints, fnv: fnv, dailyPuzzle: dailyPuzzle,
    pick: pick, byId: byId, sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard
  };
})();
