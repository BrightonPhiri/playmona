/* ============================================================
   PLAYMONA — ballswap/rules.js
   Ball Swap's rules, pure and shared by the phone (solo play and
   prediction), the server's referee (js/ballswap/referee.js) and
   the tests. No DOM.

   Two containers, A and B, hold the same number of balls. Each
   colour belongs in one of them (the instructions). A move is
   always a swap: one ball from A and one from B trade places at
   once. A swap is right only when both balls are heading home:
   the A ball belongs in B and the B ball belongs in A. Anything
   else still swaps, but it is one mistake and the player has to
   swap them back, which costs time. The board is solved
   when every ball is in its own container.

   Swaps never change how many balls a container holds, so a
   container is always exactly full: capacity is built in.

   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  // Balls per container for each level (both ends included).
  var SIZES = { easy: [3, 5], medium: [6, 10], hard: [11, 15], expert: [16, 25] };
  var COLOURS = [2, 3, 4, 5];
  var SECONDS = [45, 60, 90, 120, 180];
  var MISTAKES = [0, 1, 3, 5, -1];          // mistakes allowed; -1 = no limit (nobody is knocked out)
  var SHOW = ['always', 'start'];           // instructions: on screen all game, or only before it starts
  var PALETTE = ['red', 'blue', 'green', 'yellow', 'purple'];
  var MAX_BALLS = 25;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var LAST_CALL_MS = 15000;                 // once someone finishes, the others get this long
  var POINTS = { swap: 20, finish: 300, speed: 300, clean: 100, mistake: 10 };

  var STANDARD = { level: 'medium', colours: 2, seconds: 90, mistakes: 3, show: 'always' };

  function pick(list, v, fallback) {
    if (typeof list[0] === 'number' && v != null && v !== '' && !isNaN(Number(v))) v = Number(v);
    return list.indexOf(v) !== -1 ? v : fallback;
  }

  /* Settings as the game uses them: only known values. */
  function sanitize(s) {
    s = s || {};
    return {
      level: pick(LEVELS, s.level, STANDARD.level),
      colours: pick(COLOURS, s.colours, STANDARD.colours),
      seconds: pick(SECONDS, s.seconds, STANDARD.seconds),
      mistakes: pick(MISTAKES, s.mistakes, STANDARD.mistakes),
      show: pick(SHOW, s.show, STANDARD.show)
    };
  }

  function isStandard(s) {
    var c = sanitize(s);
    return Object.keys(STANDARD).every(function (k) { return c[k] === STANDARD[k]; });
  }

  /* ---------- dealing ---------- */

  /* randomInt(n) -> 0..n-1. The server passes crypto.randomInt; solo play
     passes the seeded random, so a daily run deals the same for everyone. */
  function shuffle(a, randomInt) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* n balls shared by k colours, each colour at least one. */
  function split(n, k, randomInt) {
    var out = [];
    for (var i = 0; i < k; i++) out.push(1);
    for (var left = n - k; left > 0; left--) out[randomInt(k)]++;
    return out;
  }

  /* A fresh puzzle for these settings:
     { n, colours: [names], target: { name: 'A'|'B' }, balls: [name per id],
       a: [ids in A, slot order], b: [ids in B], need: swaps to solve } */
  function deal(settings, randomInt) {
    var s = sanitize(settings);
    var range = SIZES[s.level];
    var n = range[0] + randomInt(range[1] - range[0] + 1);
    var colours = shuffle(PALETTE, randomInt).slice(0, s.colours);
    var target = {};
    var balls = [];
    var a = [], b = [];
    var need;

    if (s.colours === 2) {
      // The classic: one colour fills A, the other fills B, and they trade completely.
      target[colours[0]] = 'B';
      target[colours[1]] = 'A';
      for (var i = 0; i < n; i++) { balls.push(colours[0]); a.push(balls.length - 1); }
      for (var j = 0; j < n; j++) { balls.push(colours[1]); b.push(balls.length - 1); }
      need = n;
    } else {
      // Some colours belong in A, the rest in B. Some balls start at home already:
      // picking one of those is a mistake, which is what makes it hard.
      var toA = Math.ceil(s.colours / 2);
      if (randomInt(2)) toA = s.colours - toA;
      var homeA = colours.slice(0, toA), homeB = colours.slice(toA);
      homeA.forEach(function (c) { target[c] = 'A'; });
      homeB.forEach(function (c) { target[c] = 'B'; });
      var lo = Math.max(1, Math.ceil(n / 2));
      need = lo + randomInt(n - lo + 1);
      var forA = [], forB = [];
      split(n, homeA.length, randomInt).forEach(function (count, k) { for (var x = 0; x < count; x++) forA.push(homeA[k]); });
      split(n, homeB.length, randomInt).forEach(function (count, k) { for (var x = 0; x < count; x++) forB.push(homeB[k]); });
      forA = shuffle(forA, randomInt);
      forB = shuffle(forB, randomInt);
      // need of the A balls start in B (and need of the B balls in A); the rest are home.
      forA.forEach(function (c, k) { balls.push(c); (k < need ? b : a).push(balls.length - 1); });
      forB.forEach(function (c, k) { balls.push(c); (k < need ? a : b).push(balls.length - 1); });
    }
    return { n: n, colours: colours, target: target, balls: balls, a: shuffle(a, randomInt), b: shuffle(b, randomInt), need: need };
  }

  /* What players are told, one line per colour, in the puzzle's colour order:
     { colour, to, from } where from is the other container ('move') or null ('stay'). */
  function instructions(puzzle) {
    return puzzle.colours.map(function (c) {
      var to = puzzle.target[c];
      var away = to === 'A' ? puzzle.b : puzzle.a;
      var moving = away.some(function (id) { return puzzle.balls[id] === c; });
      return { colour: c, to: to, from: moving ? (to === 'A' ? 'B' : 'A') : null };
    });
  }

  /* ---------- playing ---------- */

  function board(puzzle) { return { a: puzzle.a.slice(), b: puzzle.b.slice() }; }

  /* A swap of ball aId (now in A) with ball bId (now in B):
     'ok' (both go home), 'wrong' (a mistake; the balls still swap) or
     'stale' (a ball is not where the phone thought: not a mistake). */
  function check(puzzle, bd, aId, bId) {
    if (bd.a.indexOf(aId) === -1 || bd.b.indexOf(bId) === -1) return 'stale';
    return puzzle.target[puzzle.balls[aId]] === 'B' && puzzle.target[puzzle.balls[bId]] === 'A' ? 'ok' : 'wrong';
  }

  /* The two balls trade slots: aId takes bId's place in B and the other way round. */
  function apply(bd, aId, bId) {
    var i = bd.a.indexOf(aId), j = bd.b.indexOf(bId);
    var out = { a: bd.a.slice(), b: bd.b.slice() };
    out.a[i] = bId;
    out.b[j] = aId;
    return out;
  }

  /* Balls still in the wrong container, on one side (both sides always match). */
  function left(puzzle, bd) {
    return bd.a.filter(function (id) { return puzzle.target[puzzle.balls[id]] !== 'A'; }).length;
  }
  function solved(puzzle, bd) { return left(puzzle, bd) === 0; }

  /* Progress: how many of the starting pairs are home now. Undoing a wrong
     swap only wins back what it lost, so mistakes never earn points. */
  function placed(puzzle, bd) {
    if (!bd || !bd.a) return 0;
    return Math.max(0, (puzzle.need || 0) - left(puzzle, bd));
  }

  /* One more mistake than allowed and you are out (never, with no limit). */
  function knockedOut(settings, mistakes) {
    var m = sanitize(settings).mistakes;
    return m >= 0 && mistakes > m;
  }

  function accuracy(st) {
    var tries = (st.swaps || 0) + (st.mistakes || 0);
    return tries ? Math.round((st.swaps || 0) / tries * 100) : 100;
  }

  /* Points before placing: pairs home, finishing, speed, a clean run, minus mistakes. */
  function rawPoints(st, settings) {
    var s = sanitize(settings);
    var v = (st.placed || 0) * POINTS.swap - (st.mistakes || 0) * POINTS.mistake;
    if (st.done) {
      var share = Math.max(0, Math.min(1, 1 - (st.used || 0) / (s.seconds * 1000)));
      v += POINTS.finish + Math.round(POINTS.speed * share);
      if (!st.mistakes) v += POINTS.clean;
    }
    return Math.max(0, Math.round(v));
  }

  /* Which of two players did better: finished first (earlier wins), then
     still in over knocked out, then more of the board solved, then
     accuracy, then fewer mistakes. 0 is a real tie. */
  function compare(x, y, need) {
    if (!!x.done !== !!y.done) return x.done ? -1 : 1;
    if (x.done) return (x.doneAt || 0) - (y.doneAt || 0);
    if (!!x.out !== !!y.out) return x.out ? 1 : -1;
    var px = need ? (x.placed || 0) / need : 0, py = need ? (y.placed || 0) / need : 0;
    if (px !== py) return py - px;
    var ax = accuracy(x), ay = accuracy(y);
    if (ax !== ay) return ay - ax;
    return (x.mistakes || 0) - (y.mistakes || 0);
  }

  /* Everyone in order with a place (tied players share it) and points that
     never put anyone above someone placed higher, so the platform's
     results screen (it reads points) agrees with the official order.
     stats: { uid: { swaps, placed, mistakes, done, doneAt, used, out } } */
  function ranked(stats, uids, need, settings) {
    var rows = uids.map(function (uid) {
      var st = stats[uid] || {};
      return {
        uid: uid, swaps: st.swaps || 0, placed: st.done ? need : (st.placed || 0), mistakes: st.mistakes || 0, done: !!st.done, out: !!st.out,
        doneAt: st.doneAt || 0, used: st.used || 0, accuracy: accuracy(st), raw: rawPoints(st, settings)
      };
    });
    rows.sort(function (x, y) { return compare(x, y, need) || (x.uid < y.uid ? -1 : 1); });
    var prev = null;
    rows.forEach(function (r, i) {
      if (prev && compare(prev, r, need) === 0) {
        r.place = prev.place;
        r.points = prev.points;
      } else {
        r.place = i + 1;
        r.points = prev ? Math.max(0, Math.min(r.raw, prev.points - 1)) : r.raw;
      }
      prev = r;
    });
    return rows;
  }

  /* The winners: everyone in first place, unless nobody did anything at all. */
  function winners(rows) {
    if (!rows.length) return [];
    var top = rows.filter(function (r) { return r.place === 1; });
    if (!top[0].done && !top[0].placed && !top[0].swaps && !top[0].mistakes) return [];
    return top.map(function (r) { return r.uid; });
  }

  function clock(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function exactTime(ms) {
    ms = Math.max(0, ms || 0);
    var s = Math.floor(ms / 1000);
    return (s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : String(s)) + '.' + Math.floor((ms % 1000) / 100) + 's';
  }

  FF.BallSwapRules = {
    LEVELS: LEVELS, SIZES: SIZES, COLOURS: COLOURS, SECONDS: SECONDS, MISTAKES: MISTAKES, SHOW: SHOW,
    PALETTE: PALETTE, MAX_BALLS: MAX_BALLS, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS,
    LAST_CALL_MS: LAST_CALL_MS, POINTS: POINTS, STANDARD: STANDARD,
    sanitize: sanitize, isStandard: isStandard,
    deal: deal, instructions: instructions,
    board: board, check: check, apply: apply, left: left, solved: solved, placed: placed, knockedOut: knockedOut,
    accuracy: accuracy, rawPoints: rawPoints, compare: compare, ranked: ranked, winners: winners,
    clock: clock, exactTime: exactTime
  };
})();
