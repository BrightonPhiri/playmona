'use strict';
/* Mini Crossword: the pure rules (js/crossword/rules.js) - standard numbering, the public
   shape with no letters, checking words and grids, settings, the seeded pick and scoring -
   and the cursor helpers the game screen uses (js/games/crossword.js). */
const { loadFF, test, assert, assertEqual } = require('./harness');

let cached = null;
const app = () => cached || (cached = loadFF(['js/core.js', 'js/crossword/rules.js']));

const P = {
  id: 'tst-e-001', level: 'easy', pack: 'animals', size: 5, kind: 'dense',
  rows: ['CAMEL', 'O#A#I', 'WHZEO', 'L#E#N', 'STARE'],
  clues: { '1A': 'Desert animal', '1D': 'Farm animals', '2D': 'A puzzle', '3D': 'Big cat', '4A': 'Odd row', '5A': 'Look hard' }
};

/* ---------- numbering ---------- */

test('crossword build numbers a 5x5 the standard way', function () {
  const R = app().CrosswordRules;
  const b = R.build(P);
  assertEqual(b.words.map((w) => w.id), ['1A', '1D', '2D', '3D', '4A', '5A']);
  assertEqual(b.size, 5);
  assertEqual(b.num[0][0], 1);
  assertEqual(b.num[0][2], 2);
  assertEqual(b.num[2][0], 4);
  assertEqual(b.num[1][0], 0);
  assert(b.block[1][1] && !b.block[0][1], 'blocks read from #');
  assertEqual(b.at['2,1'].across, '4A');
  assertEqual(b.at['2,1'].down, null);
  assertEqual(b.at['0,4'].down, '3D');
  const d1 = b.words.filter((w) => w.id === '1D')[0];
  assertEqual(d1.cells, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  assertEqual(d1.len, 5);
  assertEqual(d1.clue, 'Farm animals');
  assertEqual(R.answer(P, '1D'), 'COWLS');
});

test('crossword build skips one-letter runs (no number for a lone square)', function () {
  const R = app().CrosswordRules;
  const b = R.build({ size: 5, rows: ['CAT##', 'A####', 'TOP##', '#####', '#####'], clues: {} });
  assertEqual(b.words.map((w) => w.id), ['1A', '1D', '2A']);
});

/* ---------- shape ---------- */

test('crossword shape hides every letter', function () {
  const R = app().CrosswordRules;
  const s = R.shape(P);
  assert(/^[.#\/]+$/.test(s.blocks), 'blocks only dots and #: ' + s.blocks);
  assertEqual(s.blocks, '...../.#.#./...../.#.#./.....');
  assertEqual(s.clues, P.clues);
  assert(!('rows' in s), 'no rows');
  assertEqual(R.build(Object.assign({}, s, { rows: s.blocks.split('/') })).words.length, 6, 'shape still builds');
});

/* ---------- checking ---------- */

test('crossword checkWord ignores case and wrongCells finds the bad and empty squares', function () {
  const R = app().CrosswordRules;
  assert(R.checkWord(P, '1A', 'camel'));
  assert(!R.checkWord(P, '1A', 'CAMEO'));
  assert(!R.checkWord(P, '9A', 'CAMEL'), 'unknown word');
  assertEqual(R.wrongCells(P, P.rows.slice()), []);
  const g = P.rows.slice(); g[4] = 'STARX';
  assertEqual(R.wrongCells(P, g), [[4, 4]]);
  const e = P.rows.slice(); e[0] = 'CA.EL';
  assertEqual(R.wrongCells(P, e), [[0, 2]], 'empty counts as wrong');
});

/* ---------- settings ---------- */

test('crossword sanitize falls back to the standard settings', function () {
  const R = app().CrosswordRules;
  assertEqual(R.sanitize({ level: 'master', pack: 'cars', checking: 'x', play: 'y' }), R.STANDARD);
  assertEqual(R.sanitize(null), R.STANDARD);
  assertEqual(R.sanitize({ level: 'hard', pack: 'bible', checking: 'expert', play: 'coop' }),
    { level: 'hard', pack: 'bible', checking: 'expert', play: 'coop' });
  assertEqual(R.STANDARD, { level: 'normal', pack: 'mixed', checking: 'on', play: 'race' });
  assertEqual(R.PACKS, ['animals', 'food', 'home', 'sport', 'music', 'geography', 'bible', 'nature', 'mixed']);
});

/* ---------- pick ---------- */

function fixture() {
  const list = [];
  for (let i = 0; i < 20; i++) list.push({ id: 'p' + i, level: 'normal', pack: i % 2 ? 'food' : 'animals', size: 5, rows: P.rows, clues: P.clues });
  list.push({ id: 'h0', level: 'hard', pack: 'food', size: 7, rows: [], clues: {} });
  return list;
}

test('crossword pool filters by level and pack (mixed takes every pack)', function () {
  const R = app().CrosswordRules;
  const list = fixture();
  assertEqual(R.pool(list, { level: 'normal', pack: 'food' }).length, 10);
  assertEqual(R.pool(list, { level: 'normal', pack: 'mixed' }).length, 20);
  assertEqual(R.pool(list, { level: 'hard', pack: 'mixed' }).map((p) => p.id), ['h0']);
});

test('crossword pick is deterministic per seed and spreads over seeds', function () {
  const R = app().CrosswordRules;
  const list = fixture();
  const s = { level: 'normal', pack: 'mixed' };
  assertEqual(R.pick(list, s, 12345).id, R.pick(list, s, 12345).id);
  const seen = {};
  for (let i = 0; i < 50; i++) seen[R.pick(list, s, i * 7919 + 1).id] = 1;
  assert(Object.keys(seen).length >= 5, 'spread: ' + Object.keys(seen).length);
});

test('crossword pick avoids recent ids unless the deal is shared', function () {
  const R = app().CrosswordRules;
  const list = fixture();
  const avoid = list.slice(0, 19).map((p) => p.id);
  for (let i = 0; i < 10; i++) assertEqual(R.pick(list, { level: 'normal', pack: 'mixed' }, i, avoid).id, 'p19');
  const shared = { level: 'normal', pack: 'mixed', sharedDeal: true };
  assertEqual(R.pick(list, shared, 99, avoid).id, R.pick(list, shared, 99).id);
  const all = list.slice(0, 20).map((p) => p.id);
  assert(R.pick(list, { level: 'normal', pack: 'mixed' }, 3, all), 'everything avoided still picks one');
});

/* ---------- score ---------- */

test('crossword score rewards speed, no help and Expert', function () {
  const R = app().CrosswordRules;
  const none = { letter: 0, word: 0, check: 0 };
  const a = R.score({ level: 'normal', ms: 120000, help: none, expert: false });
  assertEqual(a, { points: 200 + 180, stars: 3 });
  const slow = R.score({ level: 'normal', ms: 400000, help: none, expert: false });
  assertEqual(slow.points, 200);
  const helped = R.score({ level: 'normal', ms: 120000, help: { letter: 1, word: 0, check: 0 }, expert: false });
  assert(helped.points < a.points, 'help costs');
  assertEqual(helped.stars, 2);
  assertEqual(R.score({ level: 'normal', ms: 120000, help: { letter: 0, word: 1, check: 0 }, expert: false }).stars, 2);
  assertEqual(R.score({ level: 'normal', ms: 120000, help: { letter: 1, word: 1, check: 0 }, expert: false }).stars, 1);
  assertEqual(R.score({ level: 'normal', ms: 120000, help: none, expert: true }).points, 300 + 180);
  assertEqual(R.score({ level: 'easy', ms: 999999, help: { letter: 0, word: 9, check: 0 }, expert: false }).points, 10, 'floor');
  assertEqual(R.score({ level: 'hard', ms: 0, help: none, expert: false }).points, 300 + 480);
});

/* ---------- cursor (js/crossword/cursor.js) ---------- */

let cur = null;
const curApp = () => cur || (cur = loadFF(['js/core.js', 'js/crossword/rules.js', 'js/crossword/cursor.js']));
function fillOf(map) { return Object.assign({}, map); }

test('crossword cursor: typing skips filled squares in the word', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  // 1A CAMEL: C typed at 0,0; A and M already there -> next empty is 0,3
  const filled = fillOf({ '0,0': 'C', '0,1': 'A', '0,2': 'M' });
  assertEqual(F.CrosswordCursor.next(b, filled, { r: 0, c: 0 }, 'across'), { r: 0, c: 3, dir: 'across' });
});

test('crossword cursor: an empty square earlier in the word comes before leaving it', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  const filled = fillOf({ '0,0': 'C', '0,2': 'M', '0,3': 'E', '0,4': 'L' });
  assertEqual(F.CrosswordCursor.next(b, filled, { r: 0, c: 4 }, 'across'), { r: 0, c: 1, dir: 'across' });
});

test('crossword cursor: a finished word jumps to the next unfinished clue (across first, then down)', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  // 1A full; 4A (row 2) is next across
  const filled = fillOf({ '0,0': 'C', '0,1': 'A', '0,2': 'M', '0,3': 'E', '0,4': 'L' });
  assertEqual(F.CrosswordCursor.next(b, filled, { r: 0, c: 4 }, 'across'), { r: 2, c: 0, dir: 'across' });
  // 4A and 5A also full -> first unfinished down (1D) at its first empty square
  ['2,0', '2,1', '2,2', '2,3', '2,4', '4,0', '4,1', '4,2', '4,3', '4,4'].forEach((k) => { filled[k] = 'X'; });
  assertEqual(F.CrosswordCursor.next(b, filled, { r: 4, c: 4 }, 'across'), { r: 1, c: 0, dir: 'down' });
});

test('crossword cursor: when every clue is finished the cursor stays put', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  const filled = {};
  P.rows.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch !== '#') filled[r + ',' + c] = ch; }));
  assertEqual(F.CrosswordCursor.next(b, filled, { r: 2, c: 2 }, 'down'), { r: 2, c: 2, dir: 'down' });
});

test('crossword cursor: prev steps back, and from a word start into the previous clue', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  assertEqual(F.CrosswordCursor.prev(b, {}, { r: 0, c: 3 }, 'across'), { r: 0, c: 2, dir: 'across' });
  // 4A starts at 2,0; the clue before it is 1A, whose last square is 0,4
  assertEqual(F.CrosswordCursor.prev(b, {}, { r: 2, c: 0 }, 'across'), { r: 0, c: 4, dir: 'across' });
  // 1D starts at 0,0; the clue before it is the last across, 5A, ending at 4,4
  assertEqual(F.CrosswordCursor.prev(b, {}, { r: 0, c: 0 }, 'down'), { r: 4, c: 4, dir: 'across' });
});

test('crossword cursor: nextClue moves in clue-list order and wraps', function () {
  const F = curApp();
  const b = F.CrosswordRules.build(P);
  const C = F.CrosswordCursor;
  assertEqual(C.order(b), ['1A', '4A', '5A', '1D', '2D', '3D']);
  assertEqual(C.nextClue(b, {}, '1A', 1), { r: 2, c: 0, dir: 'across' });
  assertEqual(C.nextClue(b, {}, '1A', -1), { r: 0, c: 4, dir: 'down' });
  assertEqual(C.nextClue(b, {}, '3D', 1), { r: 0, c: 0, dir: 'across' });
  // a finished 4A is skipped while unfinished clues remain
  const filled = { '2,0': 'W', '2,1': 'H', '2,2': 'Z', '2,3': 'E', '2,4': 'O' };
  assertEqual(C.nextClue(b, filled, '1A', 1), { r: 4, c: 0, dir: 'across' });
});

/* ---------- take turns on one device ---------- */

test('crossword turns: a word scores for whoever solved it and passes the turn', function () {
  const T = curApp().CrosswordTurns;
  let s = { order: ['a', 'b', 'c'], cur: 0, points: {} };
  s = T.afterWord(s, '1A', 'a', 30);
  assertEqual(s, { order: ['a', 'b', 'c'], cur: 1, points: { a: 30 } });
  s = T.afterWrong(s);
  assertEqual(s.cur, 2);
  assertEqual(s.points, { a: 30 });
  s = T.afterWord(s, '4A', 'c', 20);
  assertEqual(s.cur, 0, 'wraps round');
  assertEqual(s.points, { a: 30, c: 20 });
});
