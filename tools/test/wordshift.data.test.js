'use strict';
/* WordShift: the puzzle bank (js/data/wordshiftPuzzles.js) and the server's word list,
   both made by tools/gen-wordshift.js. Every puzzle is re-solved here before it ships. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');
const gen = require('../gen-wordshift.js');

const ROOT = path.resolve(__dirname, '..', '..');
const RANGES = { easy: [3, 5], normal: [4, 6], hard: [4, 7], expert: [4, 8] };
const LENGTH = { easy: [3, 3], normal: [4, 4], hard: [5, 5], expert: [6, 8] };

let cached = null;
function world() {
  if (cached) return cached;
  const FF = loadFF(['js/core.js', 'js/data/words.js', 'js/data/wordlist.js', 'js/words.js', 'js/data/lexicon.js', 'js/data/wordshiftPuzzles.js']);
  FF.Words.ready();
  const graphs = {};
  [3, 4, 5, 6, 7, 8].forEach(function (n) { graphs[n] = gen.graphWords(FF.Words, n); });
  cached = { FF, graphs };
  return cached;
}

test('wordshift data: every puzzle is solvable within its level range', function () {
  const { FF, graphs } = world();
  const P = FF.data.wordshift.puzzles;
  const ids = {};
  const pairs = {};
  P.forEach(function (p) {
    assert(!ids[p.id], 'duplicate id ' + p.id); ids[p.id] = 1;
    assert(!pairs[p.s + '|' + p.t], 'duplicate pair ' + p.s + '|' + p.t); pairs[p.s + '|' + p.t] = 1;
    assertEqual(p.s.length, p.t.length, p.id + ' lengths');
    const len = LENGTH[p.lv];
    assert(len && p.s.length >= len[0] && p.s.length <= len[1], p.id + ' length for ' + p.lv);
    const r = RANGES[p.lv];
    assert(p.n >= r[0] && p.n <= r[1], p.id + ' shortest ' + p.n + ' out of range');
    const route = gen.bfs(p.s, p.t, graphs[p.s.length]);
    assert(route, p.id + ' has no path');
    assertEqual(route.length - 1, p.n, p.id + ' shortest');
    assert(FF.Words.tier(p.s) === 1 && FF.Words.tier(p.t) === 1, p.id + ' start/target not everyday words');
    assert(gen.plainEnd(p.s) && gen.plainEnd(p.t), p.id + ' start/target is a plural or -ed form');
    route.forEach(function (w) { assert(!gen.AVOID.has(w), p.id + ' route uses ' + w); });
  });
});

test('wordshift data: enough puzzles per level', function () {
  const P = world().FF.data.wordshift.puzzles;
  const count = (lv) => P.filter((p) => p.lv === lv).length;
  assert(count('easy') >= 300, 'easy ' + count('easy'));
  assert(count('normal') >= 1000, 'normal ' + count('normal'));
  assert(count('hard') >= 800, 'hard ' + count('hard'));
  assert(count('expert') >= 400, 'expert ' + count('expert'));
  assert(P.length >= 3000, 'total ' + P.length);
});

test('wordshift data: the server copies match the phone bank', function () {
  const P = world().FF.data.wordshift.puzzles;
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/data/wordshift-puzzles.json'), 'utf8'));
  assertEqual(json.puzzles.length, P.length);
  assertEqual(JSON.stringify(json.puzzles[7]), JSON.stringify(P[7]));
  const words = new Set(fs.readFileSync(path.join(ROOT, 'api/data/wordshift-words.txt'), 'utf8').split('\n'));
  P.forEach(function (p) { assert(words.has(p.s) && words.has(p.t), p.id + ' words missing on the server'); });
  const { FF } = world();
  assert(words.has('sing') && words.has('bear'), 'common words');
  // Accepted words are every real word except quiet ones.
  let quiet = 0;
  words.forEach(function (w) { if (w && FF.Words.isQuiet(w)) quiet++; });
  assertEqual(quiet, 0, 'quiet words on the server list');
});

test('wordshift data: easy and normal puzzles have more than one way through', function () {
  const { FF, graphs } = world();
  FF.data.wordshift.puzzles.filter((p) => p.lv === 'easy' || p.lv === 'normal').slice(0, 200).forEach(function (p) {
    assert(gen.pathsWithin(p.s, p.t, graphs[p.s.length], p.n + 1) >= 2, p.id + ' has only one route');
  });
});
