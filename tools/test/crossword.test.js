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
