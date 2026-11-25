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

  /* ---------- sums ---------- */

  var MINUS = '−', TIMES_SIGN = '×', DIVIDE = '÷';
  var KINDS = {
    easy: ['add', 'sub', 'mul', 'missing', 'sequence'],
    normal: ['add', 'sub', 'mul', 'div', 'missing', 'sequence', 'double', 'half'],
    hard: ['add', 'sub', 'mul', 'div', 'missing', 'order', 'percent', 'fraction', 'square', 'sequence']
  };
  KINDS.expert = KINDS.hard;
  function band(level) { return level === 'expert' ? 'hard' : level; }

  /* Sizes by tier (1 to 5) inside each level. */
  var ADD_MAX = { easy: [6, 10, 14, 17, 20], normal: [20, 40, 60, 80, 100], hard: [100, 250, 500, 750, 1000] };
  var TABLE_MAX = { easy: [3, 5, 6, 8, 10], normal: [5, 6, 8, 9, 10], hard: [6, 8, 10, 12, 12] };
  var DOUBLE_MAX = [10, 20, 30, 40, 50];
  var PERCENT_MAX = [100, 200, 300, 400, 500];
  var FRACTION_MAX = [5, 8, 10, 15, 25];
  var SQUARE_MAX = [6, 9, 11, 13, 15];
  var FRACTIONS = [{ glyph: '½', num: 1, den: 2 }, { glyph: '⅓', num: 1, den: 3 }, { glyph: '¼', num: 1, den: 4 }, { glyph: '¾', num: 3, den: 4 }];
  var GLYPH = { '½': [1, 2], '⅓': [1, 3], '¼': [1, 4], '¾': [3, 4] };

  function swapDigits(n) {
    var s = String(n);
    if (s.length < 2) return null;
    var r = s.split('').reverse().join('');
    return r[0] === '0' || r === s ? null : Number(r);
  }
  /* Two numbers that add up to at most max, scaled so higher tiers use bigger numbers. */
  function addPair(rand, max) {
    var lo = Math.max(1, Math.floor(max / 5));
    var a = int(rand, lo, Math.max(lo, max - lo));
    var b = int(rand, 1, Math.max(1, max - a));
    return [a, b];
  }
  function tablePair(rand, lv, tier) {
    var top = TABLE_MAX[lv][tier - 1];
    if (lv === 'easy') {
      var t = pickOf(rand, [2, 5, 10]), o = int(rand, 2, top);
      return rand() < 0.5 ? [t, o] : [o, t];
    }
    return [int(rand, 2, top), int(rand, 2, top)];
  }
  function q(kind, tier, text, answer, traps) { return { kind: kind, tier: tier, text: text, answer: answer, traps: traps || [] }; }

  function sequence(lv, tier, rand) {
    var terms, answer, traps;
    var fam = lv === 'hard' ? pickOf(rand, ['step', 'step', 'double', 'square']) : 'step';
    if (fam === 'double') {
      var s0 = int(rand, 1, 2 + 2 * tier);
      terms = [s0, s0 * 2, s0 * 4, s0 * 8]; answer = s0 * 16; traps = [s0 * 12, s0 * 8 + s0 * 4, s0 * 10];
    } else if (fam === 'square') {
      var k = int(rand, 1, 2 + 2 * tier);
      terms = [k * k, (k + 1) * (k + 1), (k + 2) * (k + 2), (k + 3) * (k + 3)]; answer = (k + 4) * (k + 4);
      traps = [terms[3] + (terms[3] - terms[2]), answer + 1, answer - 1];
    } else {
      var step;
      if (lv === 'easy') step = pickOf(rand, tier <= 2 ? [1, 2] : [1, 2, 5, 10]);
      else if (lv === 'normal') step = int(rand, 2, 2 + 2 * tier);
      else step = int(rand, 3, 4 * tier);
      var down = lv !== 'easy' && rand() < 0.35;
      var start = down ? 5 * step + int(rand, 0, 5 * tier) : int(rand, 1, 4 + 3 * tier);
      var d = down ? -step : step;
      terms = [start, start + d, start + 2 * d, start + 3 * d]; answer = start + 4 * d;
      traps = [terms[3], answer + d, answer + 1, answer - 1];
    }
    return q('sequence', tier, terms.join(', ') + ', ?', answer, traps);
  }

  function missing(lv, tier, rand) {
    var ops = lv === 'easy' ? ['+', '-a', '-b'] : lv === 'normal' ? ['+', '-a', '-b', 'x'] : ['+', '-a', '-b', 'x', '/'];
    var op = pickOf(rand, ops), p, a, b;
    if (op === 'x' || op === '/') {
      p = tablePair(rand, lv, tier); a = p[0]; b = p[1];
      // Never a number already shown in the sum: that would give the answer away.
      if (op === 'x') return q('missing', tier, '? ' + TIMES_SIGN + ' ' + b + ' = ' + (a * b), a, [a + 1, a - 1, a + 2]);
      return q('missing', tier, '? ' + DIVIDE + ' ' + a + ' = ' + b, a * b, [a * (b + 1), a * (b - 1), a + b]);
    }
    p = addPair(rand, ADD_MAX[lv][tier - 1]); a = p[0]; b = p[1];
    if (op === '+') return q('missing', tier, a + ' + ? = ' + (a + b), b, [b + 1, b - 1, b + 10, b - 10]);
    var top = a + b;   // top - b = a
    if (op === '-a') return q('missing', tier, top + ' ' + MINUS + ' ? = ' + a, b, [b + 1, b - 1, b + 10, b - 10]);
    return q('missing', tier, '? ' + MINUS + ' ' + b + ' = ' + a, top, [top + 1, top - 1, top + 10, a - b]);
  }

  /* One sum for the level and tier. kind forces a kind (tests and Turns matching). */
  function question(level, tier, rand, kind) {
    var lv = band(level);
    tier = Math.max(1, Math.min(5, tier || 1));
    kind = kind || pickOf(rand, KINDS[lv]);
    var p, a, b, c;
    switch (kind) {
      case 'add':
        p = addPair(rand, ADD_MAX[lv][tier - 1]); a = p[0]; b = p[1];
        return q(kind, tier, a + ' + ' + b + ' = ?', a + b, [a + b + 1, a + b - 1, a + b + 10, a + b - 10, Math.abs(a - b), swapDigits(a + b)]);
      case 'sub':
        p = addPair(rand, ADD_MAX[lv][tier - 1]); a = p[0] + p[1]; b = p[1];
        return q(kind, tier, a + ' ' + MINUS + ' ' + b + ' = ?', a - b, [a - b + 1, a - b - 1, a - b + 10, a - b - 10, a + b, swapDigits(a - b)]);
      case 'mul':
        p = tablePair(rand, lv, tier); a = p[0]; b = p[1];
        return q(kind, tier, a + ' ' + TIMES_SIGN + ' ' + b + ' = ?', a * b, [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, a + b, swapDigits(a * b)]);
      case 'div':
        p = tablePair(rand, lv, tier); a = p[0]; b = p[1];
        return q(kind, tier, (a * b) + ' ' + DIVIDE + ' ' + a + ' = ?', b, [b + 1, b - 1, b + 2, a, a * b - a]);
      case 'missing':
        return missing(lv, tier, rand);
      case 'sequence':
        return sequence(lv, tier, rand);
      case 'double':
        a = int(rand, 3, DOUBLE_MAX[tier - 1]);
        return q(kind, tier, 'Double ' + a + ' = ?', a * 2, [a * 2 + 1, a * 2 - 2, a + 2, a * 2 + 10, a * 4]);
      case 'half':
        a = 2 * int(rand, 3, DOUBLE_MAX[tier - 1]);
        return q(kind, tier, 'Half of ' + a + ' = ?', a / 2, [a / 2 + 1, a / 2 - 1, a / 2 + 10, a * 2, a - 2]);
      case 'order':
        var top = 3 + 2 * tier;
        a = int(rand, 2, 4 * top); b = int(rand, 2, top); c = int(rand, 2, top);
        var form = int(rand, 0, 2);
        if (form === 0) return q(kind, tier, a + ' + ' + b + ' ' + TIMES_SIGN + ' ' + c + ' = ?', a + b * c, [(a + b) * c, a + b + c, a * b + c, a + b * c + 1]);
        if (form === 1) return q(kind, tier, b + ' ' + TIMES_SIGN + ' ' + c + ' + ' + a + ' = ?', b * c + a, [b * (c + a), b * c + a + 1, b + c + a, b * c + a - 10]);
        if (a >= b * c) a = int(rand, 1, b * c - 1);
        return q(kind, tier, b + ' ' + TIMES_SIGN + ' ' + c + ' ' + MINUS + ' ' + a + ' = ?', b * c - a, [b * (c - a), b * c - a + 1, b * c + a, b * c - a - 10]);
      case 'percent':
        var pc = pickOf(rand, tier <= 2 ? [10, 50] : [10, 20, 25, 50, 75]);
        var m = (pc === 25 || pc === 75) ? 20 : 10;
        a = m * int(rand, 1, PERCENT_MAX[tier - 1] / m);
        return q(kind, tier, pc + '% of ' + a + ' = ?', a * pc / 100, [a * pc / 100 + 5, a / 10, a - a * pc / 100, pc, a * pc / 10]);
      case 'fraction':
        var f = pickOf(rand, tier <= 2 ? FRACTIONS.slice(0, 3) : FRACTIONS);
        a = f.den * int(rand, 2, FRACTION_MAX[tier - 1]);
        var ans = a * f.num / f.den;
        return q(kind, tier, f.glyph + ' of ' + a + ' = ?', ans, [a / f.den, ans + 1, ans - 1, a - ans, ans * 2]);
      case 'square':
        a = int(rand, 2, SQUARE_MAX[tier - 1]);
        return q(kind, tier, a + '² = ?', a * a, [a * 2, (a + 1) * (a + 1), (a - 1) * (a - 1), a * a + 1, a * a - 10]);
    }
    return question(level, tier, rand, 'add');
  }

  /* 4 choices: the answer and 3 likely mistakes, all distinct, whole and 0 or more. */
  function choicesFor(item, rand) {
    var ans = item.answer, out = [], seen = {};
    seen[ans] = true;
    // A missing-number sum shows the other numbers; offering one would give the answer away.
    if (item.kind === 'missing') (String(item.text).match(/\d+/g) || []).forEach(function (n) { seen[Number(n)] = true; });
    seen[ans] = true;
    function add(v) {
      if (out.length >= 3 || v == null || typeof v !== 'number' || !isFinite(v) || v !== Math.floor(v) || v < 0 || v > 9999 || seen[v]) return;
      seen[v] = true; out.push(v);
    }
    shuffle(item.traps || [], rand).forEach(add);
    [1, -1, 2, -2, 10, -10, 3, -3, 5, -5, 4, -4, 6, 7, 8, 9, 11, 12, 20].forEach(function (o) { add(ans + o); });
    for (var n = 13; out.length < 3; n++) add(ans + n);
    return shuffle([ans].concat(out), rand);
  }

  /* The next terms that the families shown in the game predict (arithmetic, doubling, squares). */
  function seqNexts(terms) {
    var out = [];
    function put(v) { if (out.indexOf(v) === -1) out.push(v); }
    if (!terms || terms.length < 3) return out;
    var d = terms[1] - terms[0], arith = d !== 0, dbl = terms[0] > 0, sq = true, k = Math.round(Math.sqrt(terms[0]));
    for (var i = 1; i < terms.length; i++) {
      if (terms[i] - terms[i - 1] !== d) arith = false;
      if (terms[i] !== terms[i - 1] * 2) dbl = false;
    }
    for (var j = 0; j < terms.length; j++) if (terms[j] !== (k + j) * (k + j)) sq = false;
    if (arith) put(terms[terms.length - 1] + d);
    if (dbl) put(terms[terms.length - 1] * 2);
    if (sq && k >= 1) put((k + terms.length) * (k + terms.length));
    return out;
  }

  /* ---------- reading a sum back from its text (checks the deal, and the crew's eyes) ---------- */

  function whole(v) { return typeof v === 'number' && isFinite(v) && v === Math.floor(v) && v >= 0 ? v : null; }
  function opOf(ch) { return ch === '+' ? '+' : ch === MINUS || ch === '-' ? '-' : ch === TIMES_SIGN || ch === 'x' || ch === '*' ? '*' : ch === DIVIDE || ch === '/' ? '/' : null; }
  function apply(a, op, b) { return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? NaN : a / b; }
  function evalExpr(s) {
    var m;
    if ((m = /^Double (\d+)$/.exec(s))) return whole(2 * Number(m[1]));
    if ((m = /^Half of (\d+)$/.exec(s))) return whole(Number(m[1]) / 2);
    if ((m = /^(\d+)% of (\d+)$/.exec(s))) return whole(Number(m[1]) * Number(m[2]) / 100);
    if ((m = /^([½⅓¼¾]) of (\d+)$/.exec(s))) return whole(Number(m[2]) * GLYPH[m[1]][0] / GLYPH[m[1]][1]);
    if ((m = /^(\d+)²$/.exec(s))) return whole(Number(m[1]) * Number(m[1]));
    var parts = s.split(' ');
    if (parts.length % 2 !== 1) return null;
    var vals = [], ops = [];
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { if (!/^\d+$/.test(parts[i])) return null; vals.push(Number(parts[i])); }
      else { var op = opOf(parts[i]); if (!op) return null; ops.push(op); }
    }
    // × and ÷ first, then + and − from the left.
    for (var j = 0; j < ops.length;) {
      if (ops[j] === '*' || ops[j] === '/') { vals.splice(j, 2, apply(vals[j], ops[j], vals[j + 1])); ops.splice(j, 1); } else j++;
    }
    var v = vals[0];
    for (var k = 0; k < ops.length; k++) v = apply(v, ops[k], vals[k + 1]);
    return whole(v);
  }
  function solveText(text) {
    var s = String(text == null ? '' : text).trim(), m;
    if (/^\d+(, \d+){2,}, \?$/.test(s)) {
      var next = seqNexts(s.split(', ').slice(0, -1).map(Number));
      return next.length === 1 ? whole(next[0]) : null;
    }
    var sides = s.split(' = ');
    if (sides.length !== 2) return null;
    if (sides[1] === '?') return evalExpr(sides[0]);
    if (!/^\d+$/.test(sides[1]) || !(m = /^(\?|\d+) (\S) (\?|\d+)$/.exec(sides[0]))) return null;
    var c = Number(sides[1]), op = opOf(m[2]);
    if (!op || (m[1] === '?') === (m[3] === '?')) return null;
    if (m[1] === '?') {
      var b = Number(m[3]);
      return whole(op === '+' ? c - b : op === '-' ? c + b : op === '*' ? (b ? c / b : NaN) : c * b);
    }
    var a = Number(m[1]);
    return whole(op === '+' ? c - a : op === '-' ? a - c : op === '*' ? (a ? c / a : NaN) : (c ? a / c : NaN));
  }

  /* A typed or tapped answer: digits only ('007' is 7). */
  function check(item, text) {
    var s = String(text == null ? '' : text).trim();
    return /^\d{1,5}$/.test(s) && parseInt(s, 10) === item.answer;
  }

  /* ---------- chain ---------- */

  var CHAIN = {
    easy: { steps: 3, start: [1, 10], add: 10, ops: ['+', '-'] },
    normal: { steps: 5, start: [2, 20], add: 20, ops: ['+', '-', 'x', 'half'], mul: [2, 3] },
    hard: { steps: 7, start: [2, 30], add: 50, ops: ['+', '-', 'x', '/', 'double', 'half'], mul: [2, 5] }
  };
  function stepLabel(op, n) {
    return op === '+' ? '+ ' + n : op === '-' ? MINUS + ' ' + n : op === 'x' ? TIMES_SIGN + ' ' + n : op === '/' ? DIVIDE + ' ' + n : op === 'double' ? 'double it' : 'half it';
  }
  function stepShort(op, n) {
    return op === '+' ? '+' + n : op === '-' ? MINUS + n : op === 'x' ? TIMES_SIGN + n : op === '/' ? DIVIDE + n : op;
  }
  function applyStep(v, st) {
    return st.op === '+' ? v + st.n : st.op === '-' ? v - st.n : st.op === 'x' ? v * st.n : st.op === '/' ? v / st.n : st.op === 'double' ? v * 2 : v / 2;
  }
  /* A step that keeps the running total whole and within 0 to 999, or null. */
  function tryStep(cfg, v, op, rand) {
    var n = 0, k;
    if (op === '+') { n = int(rand, 1, cfg.add); if (v + n > 999) return null; }
    else if (op === '-') { if (v < 1) return null; n = int(rand, 1, Math.min(cfg.add, v)); }
    else if (op === 'x') { if (v < 1) return null; n = int(rand, cfg.mul[0], cfg.mul[1]); if (v * n > 999) return null; }
    else if (op === '/') {
      var ds = [];
      for (k = 2; k <= 5; k++) if (v >= k * 2 && v % k === 0) ds.push(k);
      if (!ds.length) return null;
      n = pickOf(rand, ds);
    } else if (op === 'double') { if (v < 1 || v * 2 > 999) return null; }
    else if (op === 'half') { if (v < 2 || v % 2) return null; }
    return { op: op, n: n, label: stepLabel(op, n) };
  }
  function chain(level, rand) {
    var cfg = CHAIN[band(level)];
    var start = int(rand, cfg.start[0], cfg.start[1]), v = start, steps = [], values = [], last = null;
    while (steps.length < cfg.steps) {
      var tries = shuffle(cfg.ops.filter(function (o) { return o !== last; }), rand).concat(['+', '-']);   // + or − always fits
      var st = null;
      for (var i = 0; i < tries.length && !st; i++) st = tryStep(cfg, v, tries[i], rand);
      v = applyStep(v, st);
      steps.push(st); values.push(v); last = st.op;
    }
    // Likely slips: one step skipped, the total before the last step, the last step's number the wrong way.
    var traps = [values[values.length - 2]];
    for (var s = 0; s < steps.length; s++) {
      var w = start;
      for (var j = 0; j < steps.length; j++) if (j !== s) w = applyStep(w, steps[j]);
      traps.push(w);
    }
    var lastStep = steps[steps.length - 1];
    if (lastStep.n) { traps.push(v + lastStep.n, v - lastStep.n); }
    traps.push(v + 1, v - 1, v + 10, v - 10);
    return { kind: 'chain', start: start, steps: steps, values: values, answer: v, traps: traps };
  }
  function chainText(item) {
    var out = [String(item.start)];
    item.steps.forEach(function (st, i) { out.push(stepShort(st.op, st.n), String(item.values[i])); });
    return out.join(' → ');
  }

  /* ---------- make the target ---------- */

  var TARGET = {
    easy: { small: 4, big: 0, bigs: [], range: [10, 30], ops: ['+', '-'], use: [2, 4] },
    normal: { small: 4, big: 1, bigs: [10, 20, 25], range: [20, 100], ops: ['+', '-', '*'], use: [3, 5] },
    hard: { small: 4, big: 2, bigs: [25, 50, 75, 100], range: [101, 500], ops: ['+', '-', '*', '/'], use: [3, 6] },
    expert: { small: 4, big: 2, bigs: [25, 50, 75, 100], range: [101, 500], ops: ['+', '-', '*', '/'], use: [6, 6] }
  };
  /* a op b under the merge rules (whole, above 0, ÷ exact), or null. */
  function merge(a, op, b) {
    var v = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? (b ? a / b : NaN) : NaN;
    return isFinite(v) && v === Math.floor(v) && v > 0 ? v : null;
  }
  function pairValues(tiles, ops) {
    var out = {};
    for (var i = 0; i < tiles.length; i++) for (var j = 0; j < tiles.length; j++) {
      if (i === j) continue;
      ops.forEach(function (op) { var v = merge(tiles[i], op, tiles[j]); if (v != null) out[v] = true; });
    }
    return out;
  }
  function dealTiles(cfg, rand) {
    var tiles = [];
    for (var i = 0; i < cfg.small; i++) tiles.push(int(rand, 1, 10));
    var bigs = shuffle(cfg.bigs, rand);
    for (var j = 0; j < cfg.big; j++) tiles.push(bigs[j]);
    return shuffle(tiles, rand);
  }
  /* Tiles and a target built from a random way through them, so it can always be reached. */
  function target(level, rand) {
    var cfg = TARGET[level] || TARGET.normal;
    for (var deal = 0; ; deal++) {
      var tiles = dealTiles(cfg, rand), pairs = pairValues(tiles, cfg.ops);
      for (var attempt = 0; attempt < 120; attempt++) {
        var use = int(rand, cfg.use[0], cfg.use[1]);
        var pool = shuffle(tiles, rand).slice(0, use), steps = [];
        while (pool.length > 1) {
          var a = pool.splice(Math.floor(rand() * pool.length), 1)[0];
          var b = pool.splice(Math.floor(rand() * pool.length), 1)[0];
          var op = pickOf(rand, cfg.ops), v = merge(a, op, b);
          if (v == null && (v = merge(b, op, a)) != null) { var x = a; a = b; b = x; }
          if (v == null) { op = '+'; v = a + b; }
          steps.push(a + op + b);
          pool.push(v);
        }
        var goal = pool[0];
        if (goal >= cfg.range[0] && goal <= cfg.range[1] && tiles.indexOf(goal) === -1 && !pairs[goal]) {
          return { kind: 'target', tiles: tiles, target: goal, ops: cfg.ops.slice(), solution: steps.join(',') };
        }
      }
      if (deal > 50) throw new Error('Make the target: no target found');
    }
  }

  /* Replays a player's merges ('25*4,100+7') on the dealt tiles. */
  function replay(tiles, ops, stepsText) {
    var left = (tiles || []).slice();
    var s = String(stepsText == null ? '' : stepsText).trim();
    if (!s) return { ok: true, left: left };
    var parts = s.split(',');
    for (var i = 0; i < parts.length; i++) {
      var m = /^(\d+)([+\-*\/])(\d+)$/.exec(parts[i]);
      if (!m || ops.indexOf(m[2]) === -1) return { ok: false, left: left, error: 'step' };
      var a = Number(m[1]), b = Number(m[3]);
      var ia = left.indexOf(a);
      if (ia === -1) return { ok: false, left: left, error: 'tile' };
      left.splice(ia, 1);
      var ib = left.indexOf(b);
      if (ib === -1) return { ok: false, left: left, error: 'tile' };
      left.splice(ib, 1);
      var v = merge(a, m[2], b);
      if (v == null) return { ok: false, left: left, error: 'value' };
      left.push(v);
    }
    return { ok: true, left: left };
  }
  function submitText(steps, value) { return String(steps || '') + ';' + (value == null ? '' : value); }
  function targetResult(item, text) {
    var bad = { ok: false, value: null, off: null, usedAll: false };
    var s = String(text == null ? '' : text), cut = s.lastIndexOf(';');
    if (cut === -1) return bad;
    var vs = s.slice(cut + 1).trim();
    if (!/^\d+$/.test(vs)) return bad;
    var r = replay(item.tiles, item.ops, s.slice(0, cut));
    var value = Number(vs);
    if (!r.ok || r.left.indexOf(value) === -1) return bad;
    return { ok: true, value: value, off: Math.abs(value - item.target), usedAll: r.left.length === 1 && item.tiles.length > 1 };
  }

  /* The best a person could do: an exact way if there is one (using every tile when asked), else the nearest tile. */
  function solveTarget(tiles, goal, ops, opts) {
    opts = opts || {};
    var best = null, seen = {};
    function better(cand) {
      if (!best) return true;
      if (cand.off !== best.off) return cand.off < best.off;
      if (opts.allTiles && cand.usedAll !== best.usedAll) return cand.usedAll;
      return cand.steps.length < best.steps.length;
    }
    function done() { return best && best.off === 0 && (!opts.allTiles || best.usedAll); }
    function walk(pool, steps) {
      if (done()) return;
      var key = pool.slice().sort(function (a, b) { return a - b; }).join(',');
      if (seen[key]) return;
      seen[key] = true;
      for (var i = 0; i < pool.length; i++) {
        var cand = { steps: steps.join(','), value: pool[i], off: Math.abs(pool[i] - goal), usedAll: pool.length === 1 && tiles.length > 1 };
        if (better(cand)) best = cand;
      }
      if (done() || pool.length < 2) return;
      for (var a = 0; a < pool.length; a++) for (var b = 0; b < pool.length; b++) {
        if (a === b) continue;
        for (var k = 0; k < ops.length; k++) {
          if ((ops[k] === '+' || ops[k] === '*') && b < a) continue;   // the same merge either way round
          var v = merge(pool[a], ops[k], pool[b]);
          if (v == null) continue;
          var rest = pool.filter(function (_, idx) { return idx !== a && idx !== b; });
          rest.push(v);
          walk(rest, steps.concat([pool[a] + ops[k] + pool[b]]));
          if (done()) return;
        }
      }
    }
    walk(tiles.slice(), []);
    return best;
  }

  /* ---------- points ---------- */

  /* The old game's speed bonus: +50 at 2 s or less, fading to 0 by 15 s. */
  function speedBonus(ms) {
    if (ms == null) return 0;
    var t = ms / 1000;
    if (t <= 2) return 50;
    return Math.max(0, Math.min(50, Math.round(50 * (1 - (t - 2) / 13))));
  }
  function tierAt(i) { return Math.min(5, 1 + Math.floor(i / 4)); }
  function penaltyMs(level) { return level === 'easy' ? 2000 : 3000; }
  function points(mode, o) {
    o = o || {};
    var w = WEIGHT[o.level] || WEIGHT.normal, expert = o.level === 'expert';
    if (mode === 'quick') return o.right ? Math.round((100 + speedBonus(o.ms)) * w) + (expert ? 50 : 0) : 0;
    if (mode === 'sprint') return o.right ? Math.round((10 + 10 * (o.tier || 1)) * w) + (expert ? 5 : 0) : 0;
    if (mode === 'chain') {
      if (!o.right) return 0;
      return Math.round((100 + 10 * (o.steps || 0) + linearSpeed(o.ms, o.limitMs)) * w) + (expert ? 50 : 0);
    }
    if (mode === 'target') {
      var off = o.off;
      if (typeof off !== 'number' || off < 0) return 0;
      if (off === 0) return Math.round((100 + linearSpeed(o.ms, o.limitMs)) * w) + (expert && o.usedAll ? 50 : 0);
      var near = o.level === 'easy' ? [2, 5] : [5, 10];
      if (off <= near[0]) return Math.round(50 * w);
      if (off <= near[1]) return Math.round(25 * w);
      return 0;
    }
    return 0;
  }
  /* Up to +50, falling evenly to 0 at the time limit; none without a limit. */
  function linearSpeed(ms, limitMs) {
    if (!limitMs || limitMs <= 0) return 0;
    return Math.round(50 * Math.max(0, 1 - (ms || 0) / limitMs));
  }
  /* ---------- deals ---------- */

  function keyOf(it) {
    return it.kind === 'chain' ? JSON.stringify([it.start, it.steps]) : it.kind === 'target' ? it.tiles.join(',') + '>' + it.target : it.text;
  }
  /* One item. base (player 0's item k) makes a matched item: same kind and tier, or the same shape. */
  function makeItem(s, seed, k, p, attempt, base) {
    var rand = rng(seed + '|' + s.mode + '|' + k + '|' + p + (attempt ? '|' + attempt : ''));
    var it;
    if (s.mode === 'target') it = target(s.level, rand);
    else if (s.mode === 'chain') it = chain(s.level, rand);
    else {
      var tier = base ? base.tier : s.mode === 'sprint' ? tierAt(k) : int(rand, 1, 5);
      it = question(s.level, tier, rand, base ? base.kind : null);
    }
    if (it.kind !== 'target') it.choices = s.level === 'expert' ? null : choicesFor(it, rand);
    it.k = k;
    return it;
  }
  var dealCache = {};
  /* Player p's whole deal (p = 0 unless Turns); every player p > 0 is matched to player 0. */
  function deal(settings, seed, p) {
    var s = sanitize(settings);
    p = p || 0;
    var ck = JSON.stringify(s) + '#' + seed + '#' + p;
    if (dealCache[ck]) return JSON.parse(dealCache[ck]);
    var base = p ? deal(s, seed, 0).items : null;
    var count = s.mode === 'sprint' ? SPRINT_LIST : s.rounds;
    var items = [], keys = {};
    for (var k = 0; k < count; k++) {
      var it = null;
      for (var attempt = 0; attempt < 40; attempt++) {
        it = makeItem(s, seed, k, p, attempt, base && base[k]);
        if (!keys[keyOf(it)]) break;
      }
      keys[keyOf(it)] = true;
      items.push(it);
    }
    var out = { items: items };
    var keysList = Object.keys(dealCache);
    if (keysList.length > 40) delete dealCache[keysList[0]];
    dealCache[ck] = JSON.stringify(out);
    return out;
  }
  function itemAt(settings, seed, k, p) { return deal(settings, seed, p).items[k] || null; }

  FF.NumberChallengeRules = {
    MODES: MODES, LEVELS: LEVELS, WEIGHT: WEIGHT, TIMES: TIMES, ROUNDS: ROUNDS, SPRINTS: SPRINTS, SPEEDS: SPEEDS,
    STEP_MS: STEP_MS, STANDARD: STANDARD, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, SPRINT_LIST: SPRINT_LIST,
    KINDS: KINDS,
    hash: hash, rng: rng, int: int, pick: pickOf, shuffle: shuffle,
    sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard, secondsFor: secondsFor,
    question: question, choicesFor: choicesFor, seqNexts: seqNexts, solveText: solveText, check: check,
    chain: chain, chainText: chainText, applyStep: applyStep,
    target: target, merge: merge, replay: replay, submitText: submitText, targetResult: targetResult, solveTarget: solveTarget,
    deal: deal, itemAt: itemAt, keyOf: keyOf,
    speedBonus: speedBonus, linearSpeed: linearSpeed, tierAt: tierAt, penaltyMs: penaltyMs, points: points
  };
})();
