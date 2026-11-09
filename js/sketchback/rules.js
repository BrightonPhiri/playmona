/* ============================================================
   PLAYMONA — sketchback/rules.js
   SketchBack's pure rules, shared by the phone, the room referee
   (in the Node crew runner) and the tests. No DOM.

     sanitize(s) / sanitizeRoom(s)  -> { count, level }
     deal(settings, seed)           -> [id]   (no repeats, seeded)
     check(answer, id)              -> { ok, empty, matched, near }
     score([bool])                  -> { correct, wrong, total, accuracy, points }
     encode(strokes) / decode(str)  a drawing as one short string

   A drawing is a list of strokes, each a flat list of points
   [x, y, x, y, ...] in 0-1000 units of the paper, so it redraws at
   any size. Encoded: whole numbers in base 36, "," between numbers
   and ";" between strokes (never "|", which joins drawings).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var D = FF.SketchData;
  var COUNTS = [5, 10, 15];
  var LEVELS = ['easy', 'normal', 'hard'];
  var SECONDS = { easy: 7, normal: 5, hard: 4 };
  var STANDARD = { count: 10, level: 'normal' };
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var RECALL_MS = 180000;          // naming: 3 minutes, no clock on screen
  var RECALL_NOTE_MS = 150000;     // "30 seconds left"
  var POINTS = 100;
  var MAX_POINTS = 1200;           // per drawing, so it fits one write
  var MIN_STEP = 4;                // units between kept points
  var LIST_MIN = 60;               // the game is listed once this many sketches exist
  // Shares of simple / medium / detailed objects per difficulty.
  var MIX = { easy: [6, 3, 1], normal: [3, 5, 2], hard: [1, 4, 5] };
  var TIERS = ['e', 'n', 'h'];

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
  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- settings ---------- */

  function sanitize(s) {
    s = s || {};
    var count = Number(s.count);
    return {
      count: COUNTS.indexOf(count) !== -1 ? count : STANDARD.count,
      level: LEVELS.indexOf(s.level) !== -1 ? s.level : STANDARD.level
    };
  }
  function isStandard(s) {
    var c = sanitize(s);
    return c.count === STANDARD.count && c.level === STANDARD.level;
  }
  function secondsOf(s) { return SECONDS[sanitize(s).level]; }

  /* ---------- objects ---------- */

  var byId = {};
  D.LIST.forEach(function (x) { byId[x.id] = x; });

  function object(id) { return byId[id] || null; }

  /* Objects that can be dealt: those with a sketch, once the sketch list is loaded. */
  function pool() {
    var files = FF.SketchFiles && FF.SketchFiles.ids;
    if (!files || !files.length) return D.LIST.slice();
    var have = {};
    files.forEach(function (id) { have[id] = true; });
    return D.LIST.filter(function (x) { return have[x.id]; });
  }

  function deal(settings, seed) {
    var c = sanitize(settings);
    var rand = rng('skb|' + seed);
    var left = {};
    TIERS.forEach(function (t) { left[t] = shuffle(pool().filter(function (x) { return x.tier === t; }), rand); });
    var w = MIX[c.level];
    var sum = w[0] + w[1] + w[2];
    var out = [];
    while (out.length < c.count) {
      var r = rand() * sum, i = 0;
      while (i < 2 && r >= w[i]) { r -= w[i]; i++; }
      // The wanted tier, else the nearest one with objects left.
      var order = i === 0 ? [0, 1, 2] : i === 1 ? [1, 0, 2] : [2, 1, 0];
      var got = null;
      for (var k = 0; k < 3 && !got; k++) got = left[TIERS[order[k]]].pop() || null;
      if (!got) break;
      out.push(got.id);
    }
    return out;
  }

  /* Listed on the games pages: enough sketches, or the dev preview flag. */
  function listed(ids, preview) { return !!preview || (ids || []).length >= LIST_MIN; }

  /* The naming gallery's order: shuffled for each player, the same after a reload. */
  function recallOrder(n, seed, uid) {
    var list = [];
    for (var i = 0; i < n; i++) list.push(i);
    return shuffle(list, rng('recall|' + seed + '|' + uid));
  }

  /* ---------- answers ---------- */

  function plurals(name) {
    var n = String(name);
    var out = [n];
    if (/s$/i.test(n)) return out;
    out.push(n + 's');
    if (/(ch|sh|x|z|o)$/i.test(n)) out.push(n + 'es');
    if (/[^aeiou]y$/i.test(n)) out.push(n.slice(0, -1) + 'ies');
    if (/f$/i.test(n)) out.push(n.slice(0, -1) + 'ves');
    if (/fe$/i.test(n)) out.push(n.slice(0, -2) + 'ves');
    return out;
  }

  var matcher = null;
  var vague = null;
  function setup() {
    if (matcher) return;
    matcher = FF.AnswerMatch.create({
      answers: D.LIST.map(function (x) {
        var names = [];
        [x.name].concat(x.alts).forEach(function (n) { names = names.concat(plurals(n)); });
        return { id: x.id, names: names };
      })
    });
    vague = {};
    D.VAGUE.forEach(function (v) { vague[FF.AnswerMatch.normalise(v)] = true; });
  }

  function check(answer, id) {
    setup();
    var text = String(answer == null ? '' : answer).trim().replace(/^(a|an|my|some|the)\s+/i, '');
    var n = FF.AnswerMatch.normalise(text);
    if (!n) return { ok: false, empty: true, matched: null, near: null };
    if (vague[n]) return { ok: false, empty: false, vague: true, matched: null, near: null };
    var res = matcher.check(text, id);
    return { ok: !!res.ok, empty: false, matched: res.matched, near: res.near };
  }

  function score(results) {
    var list = results || [];
    var correct = list.filter(function (x) { return x === true; }).length;
    var total = list.length;
    return {
      correct: correct, wrong: total - correct, total: total,
      accuracy: total ? Math.round(correct * 100 / total) : 0,
      points: correct * POINTS
    };
  }

  /* ---------- drawings ---------- */

  function clamp(v) { return Math.max(0, Math.min(1000, Math.round(Number(v) || 0))); }

  function encode(strokes) {
    var list = (strokes || []).filter(function (s) { return s && s.length >= 2; });
    // Points closer than MIN_STEP to the last kept one add nothing.
    var kept = list.map(function (s) {
      var out = [clamp(s[0]), clamp(s[1])];
      for (var i = 2; i + 1 < s.length; i += 2) {
        var x = clamp(s[i]), y = clamp(s[i + 1]);
        var lx = out[out.length - 2], ly = out[out.length - 1];
        if (Math.abs(x - lx) + Math.abs(y - ly) >= MIN_STEP) out.push(x, y);
      }
      return out;
    });
    var total = kept.reduce(function (n, s) { return n + s.length / 2; }, 0);
    if (total > MAX_POINTS) {
      // Thin every stroke evenly, keeping its ends.
      var keep = MAX_POINTS / total;
      kept = kept.map(function (s) {
        var n = s.length / 2;
        var want = Math.max(1, Math.floor(n * keep));
        if (want >= n) return s;
        var out = [];
        for (var j = 0; j < want; j++) {
          var p = want === 1 ? 0 : Math.round(j * (n - 1) / (want - 1));
          out.push(s[p * 2], s[p * 2 + 1]);
        }
        return out;
      });
    }
    return kept.map(function (s) { return s.map(function (v) { return v.toString(36); }).join(','); }).join(';');
  }

  function decode(str) {
    if (typeof str !== 'string' || !str) return [];
    return str.split(';').map(function (part) {
      var nums = part.split(',').map(function (v) { return /^[0-9a-z]{1,2}$/.test(v) ? parseInt(v, 36) : NaN; });
      var out = [];
      for (var i = 0; i + 1 < nums.length; i += 2) {
        if (isFinite(nums[i]) && isFinite(nums[i + 1])) out.push(clamp(nums[i]), clamp(nums[i + 1]));
      }
      return out;
    }).filter(function (s) { return s.length >= 2; });
  }

  FF.SketchBackRules = {
    COUNTS: COUNTS, LEVELS: LEVELS, SECONDS: SECONDS, STANDARD: STANDARD,
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, RECALL_MS: RECALL_MS, RECALL_NOTE_MS: RECALL_NOTE_MS, POINTS: POINTS,
    sanitize: sanitize, sanitizeRoom: sanitize, isStandard: isStandard, secondsOf: secondsOf,
    LIST_MIN: LIST_MIN, listed: listed, recallOrder: recallOrder,
    object: object, pool: pool, deal: deal, check: check, score: score,
    encode: encode, decode: decode, hash: hash, rng: rng, shuffle: shuffle
  };
})();
