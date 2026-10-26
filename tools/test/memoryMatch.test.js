'use strict';
/* Memory Match: the picture decks (js/data/memoryDecks.js) agree with the
   art sheets Codex draws (tools/art/memoryMatch.json), and the board size
   picked by js/games/memoryGames.js always fits the screen. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/memoryDecks.js']);
  const sb = FF.__sandbox;
  FF.registerGame = function () {};
  // fitGrid is private to the game file; expose it for this test only.
  const src = fs.readFileSync(path.join(ROOT, 'js/games/memoryGames.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'FF.__fitGrid = fitGrid;\n})();');
  vm.runInContext(src, sb, { filename: 'memoryGames.js' });
  return FF;
}

test('every deck has 24 unique cards with a name and an emoji', function () {
  const FF = load();
  const seen = {};
  assertEqual(FF.MemoryDecks.length, 8, '8 decks');
  FF.MemoryDecks.forEach(function (d) {
    assertEqual(d.cards.length, 24, d.id + ' has 24 cards');
    assert(/^--[a-z-]+$/.test(d.colour), d.id + ' has a colour token');
    d.cards.forEach(function (c) {
      assert(/^[a-z]+(-[a-z]+)*$/.test(c[0]), c[0] + ' is lowercase kebab-case');
      assert(!seen[c[0]], c[0] + ' is in one deck only (it names the picture file)');
      seen[c[0]] = true;
      assert(c[1] && c[2], c[0] + ' has a name and an emoji');
    });
  });
});

test('the art sheets list the same cards in the same order', function () {
  const FF = load();
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/art/memoryMatch.json'), 'utf8'));
  const fromSheets = [];
  spec.sheets.forEach(function (s) {
    assertEqual(s.items.length, spec.cards.cols * spec.cards.rows, s.file + ' fills its grid');
    s.items.forEach(function (it) { fromSheets.push(it[0]); });
  });
  const fromDecks = [];
  FF.MemoryDecks.forEach(function (d) { d.cards.forEach(function (c) { fromDecks.push(c[0]); }); });
  assertEqual(fromSheets.join(','), fromDecks.join(','), 'sheet order matches deck order');
});

test('hard mode can always deal 15 different-looking pairs from one deck', function () {
  const FF = load();
  FF.MemoryDecks.forEach(function (d) {
    const faces = {};
    d.cards.forEach(function (c) { faces[c[2]] = true; });
    assert(Object.keys(faces).length >= 15, d.id + ' has 15+ distinct emoji stand-ins');
  });
});

test('the board always fits the space it is given', function () {
  const FF = load();
  [[343, 595], [288, 470], [780, 230], [1233, 560], [1888, 880]].forEach(function (box) {
    [12, 20, 30].forEach(function (n) {
      [6, 10].forEach(function (gap) {
        const g = FF.__fitGrid(n, box[0], box[1], gap);
        const rows = Math.ceil(n / g.cols);
        assert(g.cols * g.size + (g.cols - 1) * gap <= box[0], n + ' cards fit across ' + box[0]);
        assert(rows * g.size + (rows - 1) * gap <= box[1], n + ' cards fit down ' + box[1]);
        assert(g.size <= 168, 'cards stop growing at 168px');
      });
    });
  });
});
