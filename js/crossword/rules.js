/* ============================================================
   PLAYMONA — crossword/rules.js
   The pure rules of Mini Crossword, shared by the game screen,
   the online referee (in the crew runner) and the tests.

   A puzzle is { id, level, pack, size, kind, rows, clues }:
   rows are strings with A-Z for white squares and '#' for black
   ones; clues are keyed by the standard number and direction
   ('1A', '4D'). Numbering is the usual one: reading row by row,
   every white square that starts an Across word (two or more
   squares to the right) or a Down word (two or more below) gets
   the next number.

     R.build(p)    -> { size, block, num, words, at }
     R.shape(p)    -> the puzzle without any letters (for rooms)
     R.answer(p, '1A'), R.checkWord(p, '1A', text)
     R.wrongCells(p, rows)  -> [[r, c], ...]
     R.sanitize(settings), R.pool(list, s), R.pick(list, s, seed, avoid)
     R.score({ level, ms, help, expert }) -> { points, stars }

   Classic script, ES2017 or older, no DOM, no Math.random.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard'];
  var PACKS = ['animals', 'food', 'home', 'sport', 'music', 'geography', 'bible', 'nature', 'mixed'];
  var CHECKING = ['on', 'expert'];
  var PLAYS = ['coop', 'race'];
  var STANDARD = { level: 'normal', pack: 'mixed', checking: 'on', play: 'race' };
  var SIZES = { easy: [5], normal: [5, 7], hard: [7, 9] };
  var RACE_MS = { easy: 360000, normal: 480000, hard: 720000 };

  var BASE = { easy: 100, normal: 200, hard: 300 };
  var PAR_S = { easy: 180, normal: 300, hard: 480 };
  var COST = { letter: 10, word: 30, check: 15 };
  var WEIGHT = { letter: 1, word: 3, check: 1 };
  var FLOOR = 10;

  function rowsOf(p) {
    if (p.rows && p.rows.length) return p.rows;
    if (typeof p.blocks === 'string') return p.blocks.split('/');
    return [];
  }

  function build(p) {
    var rows = rowsOf(p);
    var size = p.size || rows.length;
    var block = [], num = [], words = [], at = {};
    var r, c;
    function white(rr, cc) { return rr >= 0 && cc >= 0 && rr < size && cc < size && !block[rr][cc]; }
    for (r = 0; r < size; r++) {
      block.push([]); num.push([]);
      for (c = 0; c < size; c++) {
        var ch = (rows[r] || '').charAt(c);
        block[r].push(!ch || ch === '#');
        num[r].push(0);
      }
    }
    var n = 0, across = [], down = [];
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (block[r][c]) continue;
        var startsA = !white(r, c - 1) && white(r, c + 1);
        var startsD = !white(r - 1, c) && white(r + 1, c);
        if (!startsA && !startsD) continue;
        n++;
        num[r][c] = n;
        if (startsA) across.push(word(n, 'across', r, c));
        if (startsD) down.push(word(n, 'down', r, c));
      }
    }
    function word(number, dir, r0, c0) {
      var cells = [], rr = r0, cc = c0;
      while (white(rr, cc)) { cells.push([rr, cc]); if (dir === 'across') cc++; else rr++; }
      var id = number + (dir === 'across' ? 'A' : 'D');
      return { id: id, num: number, dir: dir, r: r0, c: c0, len: cells.length, cells: cells, clue: (p.clues && p.clues[id]) || '' };
    }
    // Reading order: by number, Across before Down for the same number.
    across.concat(down).sort(function (a, b) { return a.num - b.num || (a.dir === 'across' ? -1 : 1); })
      .forEach(function (w) { words.push(w); });
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (!block[r][c]) at[r + ',' + c] = { across: null, down: null };
    words.forEach(function (w) { w.cells.forEach(function (rc) { at[rc[0] + ',' + rc[1]][w.dir] = w.id; }); });
    return { size: size, block: block, num: num, words: words, at: at };
  }

  function shape(p) {
    return {
      id: p.id, level: p.level, pack: p.pack, size: p.size, kind: p.kind,
      blocks: rowsOf(p).map(function (row) { return row.replace(/[^#]/g, '.'); }).join('/'),
      clues: p.clues
    };
  }

  function findWord(p, id) {
    var b = build(p);
    for (var i = 0; i < b.words.length; i++) if (b.words[i].id === id) return b.words[i];
    return null;
  }

  function answer(p, id) {
    var w = findWord(p, id);
    if (!w) return '';
    var rows = rowsOf(p);
    return w.cells.map(function (rc) { return rows[rc[0]].charAt(rc[1]); }).join('');
  }

  function checkWord(p, id, text) {
    var a = answer(p, id);
    return !!a && String(text || '').toUpperCase() === a;
  }

  function wrongCells(p, grid) {
    var rows = rowsOf(p), out = [];
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        var want = rows[r].charAt(c);
        if (want === '#') continue;
        var got = String((grid && grid[r]) || '').charAt(c).toUpperCase();
        if (got !== want) out.push([r, c]);
      }
    }
    return out;
  }

  function oneOf(v, list, dflt) { return list.indexOf(v) >= 0 ? v : dflt; }
  function sanitize(raw) {
    raw = raw || {};
    return {
      level: oneOf(raw.level, LEVELS, STANDARD.level),
      pack: oneOf(raw.pack, PACKS, STANDARD.pack),
      checking: oneOf(raw.checking, CHECKING, STANDARD.checking),
      play: oneOf(raw.play, PLAYS, STANDARD.play)
    };
  }

  function pool(list, s) {
    return (list || []).filter(function (p) {
      return p && p.level === s.level && (s.pack === 'mixed' || p.pack === s.pack);
    });
  }

  /* FNV-1a over a string, then a 32-bit mix with the seed. */
  function hash(str, seed) {
    var h = 2166136261 ^ (seed >>> 0);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
    return h >>> 0;
  }

  function pick(list, s, seed, avoid) {
    var all = pool(list, s);
    if (!all.length) return null;
    var choices = all;
    if (avoid && avoid.length && !s.sharedDeal) {
      var fresh = all.filter(function (p) { return avoid.indexOf(p.id) < 0; });
      if (fresh.length) choices = fresh;
    }
    return choices[hash(s.level + '|' + s.pack, Math.floor(Number(seed) || 0)) % choices.length];
  }

  function score(o) {
    var level = oneOf(o.level, LEVELS, 'normal');
    var help = o.help || {};
    var base = BASE[level] * (o.expert ? 1.5 : 1);
    var bonus = Math.max(0, PAR_S[level] - Math.floor((o.ms || 0) / 1000));
    var cost = 0, weight = 0;
    Object.keys(COST).forEach(function (k) { var n = help[k] || 0; cost += n * COST[k]; weight += n * WEIGHT[k]; });
    return {
      points: Math.max(FLOOR, Math.round(base + bonus - cost)),
      stars: weight === 0 ? 3 : (weight <= 3 ? 2 : 1)
    };
  }

  FF.CrosswordRules = {
    LEVELS: LEVELS, PACKS: PACKS, CHECKING: CHECKING, PLAYS: PLAYS, STANDARD: STANDARD,
    SIZES: SIZES, RACE_MS: RACE_MS, MIN_PLAYERS: 2, MAX_PLAYERS: 8,
    build: build, shape: shape, answer: answer, checkWord: checkWord, wrongCells: wrongCells,
    sanitize: sanitize, pool: pool, pick: pick, score: score, hash: hash
  };
})();
