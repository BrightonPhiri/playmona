/* ============================================================
   PLAYMONA — saywhat/rules.js
   Say What?'s rules, pure and shared by the screen
   (js/games/sayWhat.js), the online referee (js/saywhat/referee.js),
   the crew brain and the tests. No DOM.

   An item is one saying with one gap ("rome#Rome") or, on Hard, a
   pair of gaps hidden together ("rome#Rome+built").

   The no-repeat rule:
   - a saying shows at most once in a round, whatever its gap;
   - with a device's history (seen: { "id#gap": 1 }), every gap is
     played once before any comes back, so a one-gap saying never
     repeats until the pool is spent, and a saying with more gaps
     comes back with a gap not played yet;
   - when the pool has too few fresh sayings left, the history for it
     is dropped (reset) and the round is dealt from all of it;
   - a round is never longer than the pool has sayings (capped).
   Daily, challenge and online deals pass no history.

   Checking: FF.AnswerMatch over the gap word and its "also" words,
   with the row's decoys as other answers (so a decoy is never right).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var PACKS = ['everyday', 'african', 'bible', 'kids'];
  var LEVELS = ['easy', 'normal', 'hard'];
  var LEVEL_ROWS = { easy: ['easy'], normal: ['easy', 'normal'], hard: ['normal', 'hard'] };
  var WEIGHT = { easy: 1, normal: 2, hard: 3 };
  var ANSWERS = ['tiles', 'choice'];
  var TIMES = ['quick', 'normal', 'relaxed', 'none'];
  var SECONDS = { tiles: { quick: 15, normal: 25, relaxed: 40 }, choice: { quick: 8, normal: 12, relaxed: 18 } };
  var TWO_EXTRA = 10;
  var ROUNDS = [10, 15, 20];
  var STANDARD = { level: 'normal', packs: 'mixed', answer: 'tiles', time: 'normal', rounds: 10 };
  var TWO_SHARE = 0.25;     // on Hard, about 1 saying in 4 hides two words when it can

  function data() { return (FF.data && FF.data.sayings) || { rows: [], gapsOf: function () { return []; } }; }

  /* ---------- seeded random (as js/logorush/rules.js) ---------- */

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
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* ---------- settings ---------- */

  function pick(v, list, d) { return list.indexOf(v) !== -1 ? v : d; }
  function sanitize(raw) {
    raw = raw || {};
    var packs = 'mixed';
    if (Array.isArray(raw.packs)) {
      var list = PACKS.filter(function (p) { return raw.packs.indexOf(p) !== -1; });
      if (list.length && list.length < PACKS.length) packs = list;
    }
    return {
      level: pick(raw.level, LEVELS, STANDARD.level),
      packs: packs,
      answer: pick(raw.answer, ANSWERS, STANDARD.answer),
      time: pick(raw.time, TIMES, STANDARD.time),
      rounds: pick(Number(raw.rounds), ROUNDS, STANDARD.rounds)
    };
  }
  /* Rooms: Mixed packs only, Normal or Hard, always a clock. */
  function sanitizeRoom(raw) {
    var s = sanitize(raw);
    s.packs = 'mixed';
    if (s.level === 'easy') s.level = 'normal';
    if (s.time === 'none') s.time = 'normal';
    return s;
  }
  function isStandard(s) {
    s = sanitize(s);
    return s.level === STANDARD.level && s.packs === 'mixed' && s.answer === STANDARD.answer &&
      s.time === STANDARD.time && s.rounds === STANDARD.rounds;
  }

  /* ---------- the pool ---------- */

  var byIdCache = null;
  function rowById(id) {
    if (!byIdCache) { byIdCache = {}; data().rows.forEach(function (r) { byIdCache[r.id] = r; }); }
    return byIdCache[id] || null;
  }

  /* The rows a game draws from. Kids is all easy, so on its own it plays at every level. */
  function rows(settings) {
    var s = sanitize(settings);
    var packs = s.packs === 'mixed' ? PACKS : s.packs;
    var kidsOnly = packs.length === 1 && packs[0] === 'kids';
    var levels = LEVEL_ROWS[s.level];
    return data().rows.filter(function (r) {
      return packs.indexOf(r.pack) !== -1 && (kidsOnly || levels.indexOf(r.level) !== -1);
    });
  }

  function items(settings) {
    var s = sanitize(settings);
    var out = [];
    rows(s).forEach(function (r) {
      var gaps = data().gapsOf(r.text);
      gaps.forEach(function (g) { out.push({ key: r.id + '#' + g, id: r.id, gaps: [g], level: r.level }); });
      if (s.level === 'hard' && r.two) {
        var pair = gaps.filter(function (g) { return r.two.indexOf(g) !== -1; });
        out.push({ key: r.id + '#' + pair[0] + '+' + pair[1], id: r.id, gaps: pair, level: r.level });
      }
    });
    return out;
  }

  /* How many sayings the packs have at each level (for the setup buttons). */
  function levelCounts(packs) {
    var out = {};
    LEVELS.forEach(function (l) { out[l] = rows({ packs: packs, level: l }).length; });
    return out;
  }

  function keysOf(item) { return item.gaps.map(function (g) { return item.id + '#' + g; }); }
  function fresh(item, seen) { return keysOf(item).every(function (k) { return !seen[k]; }); }
  function distinctIds(list) {
    var ids = {}, n = 0;
    list.forEach(function (it) { if (!ids[it.id]) { ids[it.id] = true; n++; } });
    return n;
  }

  /* count items, one per saying, from a seed (and, for Solo/Turns, the device's history). */
  function deal(settings, seed, count, seen) {
    var rand = rng(hash('deal|' + seed));
    var pool = items(settings);
    var n = Math.min(Math.max(0, count | 0), distinctIds(pool));
    var list = seen ? pool.filter(function (it) { return fresh(it, seen); }) : pool;
    var reset = false;
    if (seen && distinctIds(list) < n) { reset = true; list = pool; }
    list = shuffle(list, rand);
    var singles = list.filter(function (it) { return it.gaps.length === 1; });
    var twos = list.filter(function (it) { return it.gaps.length > 1; });
    var out = [], taken = {}, si = 0, ti = 0;
    while (out.length < n && (si < singles.length || ti < twos.length)) {
      var useTwo = ti < twos.length && (si >= singles.length || rand() < TWO_SHARE);
      var it = useTwo ? twos[ti++] : singles[si++];
      if (taken[it.id]) continue;
      taken[it.id] = true;
      out.push(it);
    }
    return { items: out, reset: reset, capped: n < count };
  }

  function markSeen(seen, list) {
    var out = {};
    Object.keys(seen || {}).forEach(function (k) { out[k] = seen[k]; });
    (list || []).forEach(function (it) { keysOf(it).forEach(function (k) { out[k] = 1; }); });
    return out;
  }

  /* ---------- one round ---------- */

  function letterCount(w) { return String(w).replace(/[^A-Za-z0-9]/g, '').length; }

  /* The saying as pieces: shown text (strings) and hidden gaps ({ gap: index, len }). */
  function wordsOf(row, gaps) {
    var out = [];
    String(row.text).split(/(\{[^}]*\})/).forEach(function (part) {
      if (!part) return;
      var m = /^\{([^}]*)\}$/.exec(part);
      if (m && gaps.indexOf(m[1]) !== -1) { out.push({ gap: gaps.indexOf(m[1]), len: letterCount(m[1]) }); return; }
      var text = m ? m[1] : part;
      if (out.length && typeof out[out.length - 1] === 'string') out[out.length - 1] += text;
      else out.push(text);
    });
    return out;
  }

  function same(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

  function choicesFor(row, gaps, rand) {
    var dA = shuffle(row.decoys[gaps[0]] || [], rand);
    if (gaps.length === 1) return shuffle([gaps[0]].concat(dA.slice(0, 3)), rand);
    var dB = shuffle(row.decoys[gaps[1]] || [], rand);
    var right = gaps[0] + ' ' + gaps[1];
    return shuffle([right, dA[0] + ' ' + gaps[1], gaps[0] + ' ' + dB[0], dA[1] + ' ' + dB[1]], rand);
  }

  function secondsFor(settings, round) {
    var s = sanitize(settings);
    if (s.time === 'none') return null;
    return SECONDS[s.answer][s.time] + (round && round.gaps && round.gaps.length > 1 ? TWO_EXTRA : 0);
  }

  function roundAt(settings, seed, k, item) {
    var s = sanitize(settings);
    var row = rowById(item.id);
    var gaps = item.gaps.slice();
    var target = gaps.join(' ');
    var related = [];
    gaps.forEach(function (g) { related = related.concat(row.decoys[g] || []); });
    var set = FF.SpellTiles.deal(target, rng(hash('tiles|' + seed + '|' + k)), { difficulty: 'hard', related: related });
    var round = {
      k: k, id: row.id, key: item.key, pack: row.pack, level: row.level, gaps: gaps, two: gaps.length > 1,
      words: wordsOf(row, gaps), target: target, cells: set.cells, letters: set.letters, tiles: set.tiles,
      choices: choicesFor(row, gaps, rng(hash('choice|' + seed + '|' + k))),
      meaning: row.meaning, text: data().plain ? data().plain(row.text) : row.text
    };
    round.seconds = secondsFor(s, round);
    return round;
  }

  /* ---------- checking ---------- */

  var checkers = {};
  function checker(row, gap) {
    var key = row.id + '#' + gap;
    if (!checkers[key]) {
      var answers = [{ id: 'ok', names: [gap].concat((row.also && row.also[gap]) || []) }];
      (row.decoys[gap] || []).forEach(function (d, i) { answers.push({ id: 'd' + i, names: [d] }); });
      checkers[key] = FF.AnswerMatch.create({ answers: answers });
    }
    return checkers[key];
  }

  /* text: the spelled word, or for two gaps both words with a space ("Rome built"). */
  function check(round, text) {
    var row = rowById(round.id);
    var raw = String(text == null ? '' : text).trim();
    if (!row || !raw) return { ok: false, near: null };
    var words = round.gaps.length === 1 ? [raw] : raw.split(/\s+/);
    if (words.length !== round.gaps.length) return { ok: false, near: null };
    var ok = true, near = null;
    round.gaps.forEach(function (g, i) {
      var res = checker(row, g).check(words[i], 'ok');
      if (!res.ok) { ok = false; if (!near && res.near) near = res.near; }
    });
    return { ok: ok, near: near };
  }

  /* ---------- solving (crew) ---------- */

  /* The saying behind a masked view, as a person who knows it would recognise it: the shown
     words and each gap's length. Returns { id, gaps } or null. Used by the crew brain, which
     never sees the referee's seed. */
  var solveIndex = null;
  function signature(words) {
    return words.map(function (w) { return typeof w === 'string' ? w : '{' + w.gap + ':' + w.len + '}'; }).join('\u0001');
  }
  function solve(words) {
    if (words && !Array.isArray(words) && typeof words === 'object') {
      words = Object.keys(words).sort(function (a, b) { return a - b; }).map(function (k) { return words[k]; });
    }
    if (!Array.isArray(words) || !words.length) return null;
    if (!solveIndex) {
      solveIndex = {};
      data().rows.forEach(function (r) {
        var gaps = data().gapsOf(r.text);
        var sets = gaps.map(function (g) { return [g]; });
        if (r.two) sets.push(gaps.filter(function (g) { return r.two.indexOf(g) !== -1; }));
        sets.forEach(function (set) { solveIndex[signature(wordsOf(r, set))] = { id: r.id, gaps: set }; });
      });
    }
    var hit = solveIndex[signature(words.map(function (w) {
      return typeof w === 'string' ? w : { gap: Number(w && w.gap), len: Number(w && w.len) };
    }))];
    return hit ? { id: hit.id, gaps: hit.gaps.slice() } : null;
  }

  /* ---------- points ---------- */

  /* streak: right answers in a row, this one included. */
  function points(o) {
    var out = { base: 0, speed: 0, two: 0, streak: 0, total: 0 };
    if (!o || !o.ok) return out;
    out.base = 100 * (WEIGHT[o.level] || 1);
    if (o.secs) out.speed = Math.round(50 * Math.max(0, 1 - (o.ms || 0) / (o.secs * 1000)));
    if (o.two) out.two = 50;
    var n = o.streak || 0;
    out.streak = n < 3 ? 0 : Math.min(100, 25 * (n - 2));
    out.total = out.base + out.speed + out.two + out.streak;
    return out;
  }

  FF.SayWhatRules = {
    PACKS: PACKS, LEVELS: LEVELS, WEIGHT: WEIGHT, ANSWERS: ANSWERS, TIMES: TIMES, SECONDS: SECONDS,
    TWO_EXTRA: TWO_EXTRA, ROUNDS: ROUNDS, STANDARD: STANDARD, MIN_PLAYERS: 2, MAX_PLAYERS: 8,
    REVEAL_MS: 5000, MAX_TILES: 30,
    hash: hash, rng: rng, shuffle: shuffle,
    sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard,
    row: rowById, rows: rows, items: items, levelCounts: levelCounts,
    deal: deal, markSeen: markSeen, roundAt: roundAt, check: check, same: same,
    secondsFor: secondsFor, points: points, solve: solve
  };
})();
