/* ============================================================
   PLAYMONA — sortrush/rules.js
   SortRush's rules, pure and shared by the phone (solo play and
   prediction), the server's referee (js/sortrush/referee.js) and
   the tests. No DOM.

   A board is a list of holders. Each holder is a string, bottom
   first, one letter per object: 'a' is colour 0, 'b' colour 1 and
   so on, so 'aab' is two of colour 0 with one of colour 1 on top.
   Strings survive the database (empty arrays would not), and they
   make the solver fast.

   A move takes the top object (Single) or the top run of one
   colour (Group, as much of it as fits) from one holder to another
   that is empty or has the same colour on top, within capacity.
   A full holder of one colour is complete and locked: nothing can
   be taken from it again.

   Every puzzle is dealt from a seed and is proved solvable before
   anybody sees it: a shuffle checked by the solver, or, if the
   shuffles keep failing, a board built backwards from the solved
   one (solvable by construction).

   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MODES = ['race', 'score'];
  var STYLES = ['nuts', 'balls', 'rings', 'blocks'];
  var MOVES = ['single', 'group'];
  var LEVELS = ['easy', 'medium', 'hard', 'expert', 'custom'];
  var PRESETS = {
    easy: { colours: 4, size: 3, empty: 2 },
    medium: { colours: 6, size: 4, empty: 2 },
    hard: { colours: 8, size: 4, empty: 2 },
    expert: { colours: 10, size: 5, empty: 2 }
  };
  var COLOURS = [3, 4, 5, 6, 7, 8, 9, 10];
  var SIZES = [3, 4, 5, 6];
  var EMPTIES = [1, 2, 3];
  var SECONDS = [60, 90, 120, 180, 300];
  var LIMITS = ['off', 'relaxed', 'tight'];
  var LIMIT_FACTOR = { relaxed: 2, tight: 1.4 };
  var THEMES = ['workshop', 'candy', 'neon'];
  var MAX_HOLDERS = 12;
  var ONE_EMPTY_MAX = 24;                // objects on the board for a single empty holder
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var LAST_CALL_MS = 15000;            // race: once someone finishes, the others get this long
  var POINTS = { holder: 100, clear: 200, efficiency: 100, finish: 1000, speed: 500, sorted: 10 };
  var MAX_TRIES = 40;
  var NODE_CAP = 40000;
  var HIST_MAX = 200;                  // undo depth

  var STANDARD = { mode: 'race', style: 'balls', move: 'group', level: 'medium', colours: 6, size: 4, empty: 2, seconds: 120, limit: 'off' };

  function pick(list, v, fallback) {
    if (typeof list[0] === 'number' && v != null && v !== '' && !isNaN(Number(v))) v = Number(v);
    return list.indexOf(v) !== -1 ? v : fallback;
  }

  /* Settings as the game uses them: only known values. A level other than
     Custom decides colours, size and empty holders; and the board never has
     more holders than fit on a phone. */
  function sanitize(s) {
    s = s || {};
    var out = {
      mode: pick(MODES, s.mode, STANDARD.mode),
      style: pick(STYLES, s.style, STANDARD.style),
      move: pick(MOVES, s.move, STANDARD.move),
      level: pick(LEVELS, s.level, STANDARD.level),
      colours: pick(COLOURS, s.colours, STANDARD.colours),
      size: pick(SIZES, s.size, STANDARD.size),
      empty: pick(EMPTIES, s.empty, STANDARD.empty),
      seconds: pick(SECONDS, s.seconds, STANDARD.seconds),
      limit: pick(LIMITS, s.limit, STANDARD.limit)
    };
    if (out.level !== 'custom') {
      var p = PRESETS[out.level];
      out.colours = p.colours;
      out.size = p.size;
      out.empty = p.empty;
    }
    // One spare holder only works on small boards: bigger ones are mostly unsolvable.
    if (out.empty === 1 && out.colours * out.size > ONE_EMPTY_MAX) out.empty = 2;
    if (out.colours + out.empty > MAX_HOLDERS) out.empty = Math.max(1, MAX_HOLDERS - out.colours);
    return out;
  }

  /* What counts for leaderboards and personal bests: the style is only a look. */
  var RULE_KEYS = ['mode', 'move', 'level', 'colours', 'size', 'empty', 'seconds', 'limit'];
  function isStandard(s) {
    var c = sanitize(s), d = sanitize(STANDARD);
    return RULE_KEYS.every(function (k) { return c[k] === d[k]; });
  }
  function key(s) {
    var c = sanitize(s);
    return RULE_KEYS.map(function (k) { return c[k]; }).join('|');
  }

  /* ---------- the seeded random ---------- */

  /* A whole seed string to a 32-bit state (xmur3), then mulberry32. The
     same seed gives the same numbers on every phone, the server and the tests. */
  function rng(seed) {
    var str = String(seed), h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    var a = (h ^= h >>> 16) >>> 0;
    function next() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return function randomInt(n) { return Math.min(n - 1, Math.floor(next() * n)); };
  }

  /* ---------- holders ---------- */

  function letter(c) { return String.fromCharCode(97 + c); }
  function colourOf(ch) { return ch.charCodeAt(0) - 97; }
  function top(h) { return h.length ? h[h.length - 1] : ''; }
  function topRun(h) {
    if (!h.length) return 0;
    var c = h[h.length - 1], n = 0;
    for (var i = h.length - 1; i >= 0 && h[i] === c; i--) n++;
    return n;
  }
  function bottomRun(h) {
    if (!h.length) return 0;
    var c = h[0], n = 0;
    while (n < h.length && h[n] === c) n++;
    return n;
  }
  function complete(h, cap) { return h.length === cap && bottomRun(h) === cap; }
  function completedCount(board, cap) {
    var n = 0;
    for (var i = 0; i < board.length; i++) if (complete(board[i], cap)) n++;
    return n;
  }
  function solved(board, cap) {
    for (var i = 0; i < board.length; i++) {
      if (board[i].length && !complete(board[i], cap)) return false;
    }
    return true;
  }

  /* Objects already sorted: for each colour, its longest run sitting on the
     bottom of a holder. Undoing work lowers it, so it can never be farmed. */
  function sortedCount(board) {
    var best = {};
    for (var i = 0; i < board.length; i++) {
      var h = board[i];
      if (!h.length) continue;
      var r = bottomRun(h);
      if (!best[h[0]] || r > best[h[0]]) best[h[0]] = r;
    }
    var n = 0;
    Object.keys(best).forEach(function (c) { n += best[c]; });
    return n;
  }

  /* Can the move go? { ok: true, count, colour } or { ok: false, why } with
     why one of 'range', 'same', 'empty', 'locked', 'full', 'mismatch'. */
  function legal(board, cap, from, to, rule) {
    if (typeof from !== 'number' || typeof to !== 'number' || from < 0 || to < 0 || from >= board.length || to >= board.length || from % 1 || to % 1) return { ok: false, why: 'range' };
    if (from === to) return { ok: false, why: 'same' };
    var src = board[from], dst = board[to];
    if (!src.length) return { ok: false, why: 'empty' };
    if (complete(src, cap)) return { ok: false, why: 'locked' };
    var space = cap - dst.length;
    if (space <= 0) return { ok: false, why: 'full' };
    var c = top(src);
    if (dst.length && top(dst) !== c) return { ok: false, why: 'mismatch' };
    var count = rule === 'group' ? Math.min(topRun(src), space) : 1;
    return { ok: true, count: count, colour: colourOf(c) };
  }

  /* A new board with count objects moved from one holder to another (no checks). */
  function apply(board, from, to, count) {
    var out = board.slice();
    var src = board[from];
    out[from] = src.slice(0, src.length - count);
    out[to] = board[to] + src.slice(src.length - count);
    return out;
  }

  function hasAnyMove(board, cap, rule) {
    for (var f = 0; f < board.length; f++) {
      for (var t = 0; t < board.length; t++) {
        if (f !== t && legal(board, cap, f, t, rule).ok) return true;
      }
    }
    return false;
  }

  /* ---------- the solver ---------- */

  function stateKey(board) { return board.slice().sort().join('|'); }

  /* A lower guess of the moves still needed: everything sitting on a wrong
     colour has to move, and a colour split over several bottoms has to merge. */
  function estimate(board) {
    var h = 0, bottoms = {};
    for (var i = 0; i < board.length; i++) {
      var s = board[i];
      if (!s.length) continue;
      h += s.length - bottomRun(s);
      bottoms[s[0]] = (bottoms[s[0]] || 0) + 1;
    }
    Object.keys(bottoms).forEach(function (c) { h += bottoms[c] - 1; });
    return h;
  }

  /* The moves worth trying from a board: never out of a locked holder, only
     one of several empty holders, never a whole one-colour holder into an empty one. */
  function successors(board, cap, rule) {
    var out = [];
    for (var f = 0; f < board.length; f++) {
      var src = board[f];
      if (!src.length || complete(src, cap)) continue;
      var c = top(src), run = topRun(src), uniform = run === src.length;
      var emptyTried = false;
      for (var t = 0; t < board.length; t++) {
        if (t === f) continue;
        var dst = board[t];
        var space = cap - dst.length;
        if (space <= 0) continue;
        if (dst.length) {
          if (top(dst) !== c) continue;
        } else {
          if (emptyTried || uniform) continue;
          emptyTried = true;
        }
        out.push([f, t, rule === 'group' ? Math.min(run, space) : 1]);
      }
    }
    return out;
  }

  /* A binary heap of [priority, order, item], lowest first; order keeps it deterministic. */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (x) {
    var a = this.a; a.push(x);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (less(a[p], a[i])) break;
      var tmp = a[p]; a[p] = a[i]; a[i] = tmp; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, topItem = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        var tmp = a[m]; a[m] = a[i]; a[i] = tmp; i = m;
      }
    }
    return topItem;
  };
  function less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }

  /* A short solution as [[from, to, count], ...], or null when there is none
     within the node budget. Weighted A*: quick, and close to the shortest. */
  function solve(board, cap, rule, budget) {
    budget = budget || NODE_CAP;
    if (solved(board, cap)) return [];
    var seen = {};
    var heap = new Heap();
    var order = 0;
    var startKey = stateKey(board);
    seen[startKey] = 0;
    heap.push([2 * estimate(board), order++, { b: board, g: 0, path: null }]);
    var nodes = 0;
    while (heap.a.length) {
      var cur = heap.pop()[2];
      if (++nodes > budget) return null;
      var succ = successors(cur.b, cap, rule);
      for (var i = 0; i < succ.length; i++) {
        var m = succ[i];
        var nb = apply(cur.b, m[0], m[1], m[2]);
        var k = stateKey(nb);
        var g = cur.g + 1;
        if (seen[k] != null && seen[k] <= g) continue;
        seen[k] = g;
        var node = { b: nb, g: g, path: { m: m, prev: cur.path } };
        if (solved(nb, cap)) {
          var moves = [];
          for (var p = node.path; p; p = p.prev) moves.unshift(p.m);
          return moves;
        }
        heap.push([g + 2 * estimate(nb), order++, node]);
      }
    }
    return null;
  }

  /* ---------- dealing ---------- */

  function solvedBoard(colours, size, empty) {
    var b = [];
    for (var c = 0; c < colours; c++) {
      var s = '';
      for (var i = 0; i < size; i++) s += letter(c);
      b.push(s);
    }
    for (var e = 0; e < empty; e++) b.push('');
    return b;
  }

  function shuffled(colours, size, empty, randomInt) {
    var bag = [];
    for (var c = 0; c < colours; c++) for (var i = 0; i < size; i++) bag.push(letter(c));
    for (var j = bag.length - 1; j > 0; j--) {
      var x = randomInt(j + 1);
      var tmp = bag[j]; bag[j] = bag[x]; bag[x] = tmp;
    }
    var b = [];
    for (var h = 0; h < colours; h++) b.push(bag.slice(h * size, (h + 1) * size).join(''));
    for (var e = 0; e < empty; e++) b.push('');
    return b;
  }

  /* Too easy to count: solved, a holder already complete, or most objects already home. */
  function trivial(board, cap, total) {
    if (solved(board, cap) || completedCount(board, cap) > 0) return true;
    return sortedCount(board) > Math.ceil(total * 0.4);
  }

  function minPar(s) { return Math.max(4, Math.ceil(s.colours * s.size * 0.5)); }

  /* Built backwards from the solved board: each step is the exact reverse of a
     legal forward move, so playing the steps backwards always solves it. */
  function reverseBuilt(s, randomInt) {
    var cap = s.size, total = s.colours * s.size;
    for (var attempt = 0; attempt < 20; attempt++) {
      var b = solvedBoard(s.colours, s.size, s.empty);
      var steps = 0, target = total * 3;
      for (var guard = 0; guard < total * 40 && steps < target; guard++) {
        var x = randomInt(b.length), y = randomInt(b.length);
        if (x === y || !b[x].length || b[y].length >= cap) continue;
        var o = top(b[x]);
        var rest = b[x].slice(0, -1);
        // Forward (y -> x) must be legal: x is empty or has o's colour on top...
        if (rest.length && top(rest) !== o) continue;
        // ...and only o moves back, even under the Group rule.
        if (b[y].length && top(b[y]) === o) continue;
        // ...and y must not be locked once o sits on it.
        var ny = b[y] + o;
        if (complete(ny, cap)) continue;
        b = b.slice();
        b[x] = rest;
        b[y] = ny;
        steps++;
      }
      // A last resort: not solved and nothing complete is enough here.
      if (!solved(b, cap) && completedCount(b, cap) === 0) return { b: b, par: steps };
    }
    return null;
  }

  /* The puzzle for these settings, seed and index (Timed Score deals 0, 1, 2…):
     { b: [holders], cap, colours, size, empty, par, k } */
  function deal(settings, seed, k) {
    var s = sanitize(settings);
    k = k || 0;
    var randomInt = rng(String(seed) + '|' + key(s) + '|' + k);
    var cap = s.size, total = s.colours * s.size, floor = minPar(s);
    for (var a = 0; a < MAX_TRIES; a++) {
      var b = shuffled(s.colours, s.size, s.empty, randomInt);
      if (trivial(b, cap, total)) continue;
      var sol = solve(b, cap, s.move, NODE_CAP);
      if (sol && sol.length >= floor) return { b: b, cap: cap, colours: s.colours, size: s.size, empty: s.empty, par: sol.length, k: k, tries: a + 1 };
    }
    var built = reverseBuilt(s, randomInt);
    if (built) {
      var check = solve(built.b, cap, s.move, NODE_CAP * 2);
      return { b: built.b, cap: cap, colours: s.colours, size: s.size, empty: s.empty, par: check ? check.length : built.par, k: k, tries: -1 };
    }
    throw new Error('SortRush could not deal a puzzle for these settings.');
  }

  function moveLimit(settings, par) {
    var s = sanitize(settings);
    var f = LIMIT_FACTOR[s.limit];
    return f ? Math.max(par + 2, Math.ceil(par * f)) : 0;
  }

  /* ---------- a player ---------- */

  /* One player's whole state. The referee keeps one per seat; solo play keeps one. */
  function newPlayer(settings, puzzle) {
    var p = {
      k: 0, b: null, start: null, par: 0, limit: 0, pm: 0, hist: [],
      n: 0, moves: 0, best: 0, score: 0, cleared: 0,
      done: false, out: false, doneAt: 0, used: 0, at: 0, lastAt: 0,
      peakC: 0, peakS: 0, peakAt: 0
    };
    load(settings, p, puzzle);
    return p;
  }

  function load(settings, p, puzzle) {
    p.k = puzzle.k || 0;
    p.b = puzzle.b.slice();
    p.start = puzzle.b.slice();
    p.par = puzzle.par;
    p.limit = moveLimit(settings, puzzle.par);
    p.pm = 0;
    p.hist = [];
    p.best = 0;
    p.peakC = 0;
    p.peakS = sortedCount(p.b);
  }

  /* One command for one player, checked and applied:
       cmd: { type: 'move', from, to } | { type: 'undo' } | { type: 'restart' } | { type: 'skip' }, with k
       t:   when it was sent (the referee's clock), openAt: when play opened
       dealNext(k) -> the next puzzle (Timed Score)
     Returns { ok, why, count, colour, from, to, completed (a holder just locked),
     cleared (Timed Score: the puzzle was cleared and the next one dealt), finished,
     out, gained (points) }. Nothing changes when ok is false. */
  function step(settings, p, cmd, t, openAt, dealNext) {
    var s = sanitize(settings);
    var cap = s.size;
    if (p.done || p.out) return { ok: false, why: 'over' };
    if (!cmd || (cmd.k != null && cmd.k !== p.k)) return { ok: false, why: 'stale' };
    var res = { ok: true, why: '', count: 0, colour: -1, from: -1, to: -1, completed: false, cleared: false, finished: false, out: false, gained: 0 };
    if (cmd.type === 'move') {
      var L = legal(p.b, cap, cmd.from, cmd.to, s.move);
      if (!L.ok) return { ok: false, why: L.why };
      p.b = apply(p.b, cmd.from, cmd.to, L.count);
      p.hist.push([cmd.from, cmd.to, L.count]);
      if (p.hist.length > HIST_MAX) p.hist.shift();
      res.count = L.count; res.colour = L.colour; res.from = cmd.from; res.to = cmd.to;
      res.completed = complete(p.b[cmd.to], cap);
    } else if (cmd.type === 'undo') {
      var last = p.hist[p.hist.length - 1];
      if (!last) return { ok: false, why: 'nothing' };
      if (complete(p.b[last[1]], cap)) return { ok: false, why: 'locked' };
      p.hist.pop();
      p.b = apply(p.b, last[1], last[0], last[2]);
      res.count = last[2]; res.from = last[1]; res.to = last[0];
      res.colour = colourOf(top(p.b[last[0]]));
    } else if (cmd.type === 'restart') {
      if (!p.hist.length && p.b.join('|') === p.start.join('|')) return { ok: false, why: 'nothing' };
      p.b = p.start.slice();
      p.hist = [];
    } else if (cmd.type === 'skip') {
      if (s.mode !== 'score') return { ok: false, why: 'mode' };
    } else {
      return { ok: false, why: 'type' };
    }
    p.n++;
    p.pm++;
    p.moves++;
    p.at = t;

    // Holders completed for the first time on this puzzle earn points; restarting
    // and completing them again earns nothing.
    var c = completedCount(p.b, cap);
    if (c > p.best) {
      if (s.mode === 'score') { res.gained += (c - p.best) * POINTS.holder; p.lastAt = t; }
      p.best = c;
    }
    var srt = sortedCount(p.b);
    if (c > p.peakC || (c === p.peakC && srt > p.peakS)) { p.peakC = c; p.peakS = srt; p.peakAt = t; }

    var isSolved = cmd.type === 'move' && solved(p.b, cap);
    if (isSolved && s.mode === 'race') {
      p.done = true;
      p.doneAt = t;
      p.used = Math.max(0, t - (openAt || 0));
      res.finished = true;
    } else if (isSolved || cmd.type === 'skip' || (s.mode === 'score' && p.limit && p.pm >= p.limit)) {
      if (isSolved) {
        p.cleared++;
        res.gained += POINTS.clear + efficiency(p.par, p.pm);
        p.lastAt = t;
        res.cleared = true;
      }
      if (typeof dealNext === 'function') load(s, p, dealNext(p.k + 1));
      res.next = true;
    } else if (s.mode === 'race' && p.limit && p.pm >= p.limit) {
      p.out = true;
      res.out = true;
    }
    p.score += res.gained;
    return res;
  }

  function efficiency(par, moves) {
    if (!moves) return 0;
    return Math.round(POINTS.efficiency * Math.min(1, par / moves));
  }

  /* ---------- results ---------- */

  function rawPoints(st, settings) {
    var s = sanitize(settings);
    if (s.mode === 'score') return Math.max(0, Math.round(st.score || 0));
    if (st.done) {
      var share = Math.max(0, Math.min(1, 1 - (st.used || 0) / (s.seconds * 1000)));
      return POINTS.finish + Math.round(POINTS.speed * share);
    }
    return (st.peakC || 0) * POINTS.holder + (st.peakS || 0) * POINTS.sorted;
  }

  /* Which of two players did better. 0 is a real tie.
     Race: finished first (earlier wins), then still in over out of moves, then
     more holders complete, then more objects sorted, then fewer moves, then
     whoever got there first.
     Timed Score: more points, then more puzzles cleared, then fewer moves,
     then whoever scored last earlier. */
  function compare(x, y, settings) {
    var s = sanitize(settings);
    if (s.mode === 'score') {
      if ((x.score || 0) !== (y.score || 0)) return (y.score || 0) - (x.score || 0);
      if ((x.cleared || 0) !== (y.cleared || 0)) return (y.cleared || 0) - (x.cleared || 0);
      if ((x.moves || 0) !== (y.moves || 0)) return (x.moves || 0) - (y.moves || 0);
      return (x.lastAt || 0) - (y.lastAt || 0);
    }
    if (!!x.done !== !!y.done) return x.done ? -1 : 1;
    if (x.done) return (x.doneAt || 0) - (y.doneAt || 0);
    if (!!x.out !== !!y.out) return x.out ? 1 : -1;
    if ((x.peakC || 0) !== (y.peakC || 0)) return (y.peakC || 0) - (x.peakC || 0);
    if ((x.peakS || 0) !== (y.peakS || 0)) return (y.peakS || 0) - (x.peakS || 0);
    if ((x.moves || 0) !== (y.moves || 0)) return (x.moves || 0) - (y.moves || 0);
    return (x.peakAt || 0) - (y.peakAt || 0);
  }

  /* Everyone in order with a place (tied players share it) and points that
     never put anyone above someone placed higher, so the platform's results
     screen (it reads points) agrees with the official order.
     stats: { uid: player state or its summary } */
  function ranked(stats, uids, settings) {
    var rows = uids.map(function (uid) {
      var st = stats[uid] || {};
      return {
        uid: uid, moves: st.moves || 0, done: !!st.done, out: !!st.out, doneAt: st.doneAt || 0, used: st.used || 0,
        score: st.score || 0, cleared: st.cleared || 0, lastAt: st.lastAt || 0,
        peakC: st.peakC || 0, peakS: st.peakS || 0, peakAt: st.peakAt || 0,
        raw: rawPoints(st, settings)
      };
    });
    rows.sort(function (x, y) { return compare(x, y, settings) || (x.uid < y.uid ? -1 : 1); });
    var prev = null;
    rows.forEach(function (r, i) {
      if (prev && compare(prev, r, settings) === 0) {
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

  /* The winners: everyone in first place, unless nobody moved at all. */
  function winners(rows) {
    if (!rows.length) return [];
    var topRows = rows.filter(function (r) { return r.place === 1; });
    if (!topRows[0].moves) return [];
    return topRows.map(function (r) { return r.uid; });
  }

  function clock(ms) {
    var s = Math.max(0, Math.ceil((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function exactTime(ms) {
    ms = Math.max(0, ms || 0);
    var s = Math.floor(ms / 1000);
    return (s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : String(s)) + '.' + Math.floor((ms % 1000) / 100) + 's';
  }

  FF.SortRushRules = {
    MODES: MODES, STYLES: STYLES, MOVES: MOVES, LEVELS: LEVELS, PRESETS: PRESETS, COLOURS: COLOURS, SIZES: SIZES,
    EMPTIES: EMPTIES, ONE_EMPTY_MAX: ONE_EMPTY_MAX, SECONDS: SECONDS, LIMITS: LIMITS, THEMES: THEMES, MAX_HOLDERS: MAX_HOLDERS,
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, LAST_CALL_MS: LAST_CALL_MS, POINTS: POINTS,
    STANDARD: STANDARD, HIST_MAX: HIST_MAX,
    sanitize: sanitize, isStandard: isStandard, key: key, rng: rng,
    letter: letter, colourOf: colourOf, top: top, topRun: topRun, bottomRun: bottomRun,
    complete: complete, completedCount: completedCount, solved: solved, sortedCount: sortedCount,
    legal: legal, apply: apply, hasAnyMove: hasAnyMove,
    solve: solve, deal: deal, minPar: minPar, moveLimit: moveLimit, trivial: trivial, reverseBuilt: reverseBuilt,
    newPlayer: newPlayer, load: load, step: step, efficiency: efficiency,
    rawPoints: rawPoints, compare: compare, ranked: ranked, winners: winners,
    clock: clock, exactTime: exactTime
  };
})();
