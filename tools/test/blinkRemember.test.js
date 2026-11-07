'use strict';
/* Blink & Remember (js/games/blinkRemember.js): settings, the shared deal,
   the picker's choices, scoring, and its place in rooms and on
   leaderboards. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/memoryDecks.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/blinkRemember.js'), 'utf8'), FF.__sandbox, { filename: 'blinkRemember.js' });
  return FF;
}

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

function ids(list) { return list.map(function (c) { return c.id; }); }

test('blink & remember: settings keep to the offered values', function () {
  const B = load().BlinkRemember;
  assertEqual(JSON.stringify(B.sanitize({})), JSON.stringify(B.STANDARD));
  assertEqual(B.STANDARD.boxes, 6);
  assertEqual(B.STANDARD.seconds, 2, 'two seconds a box by default');
  const s = B.sanitize({ boxes: '12', seconds: 9, deck: 'mix' });
  assertEqual(s.boxes, 12, 'a string number is read');
  assertEqual(s.seconds, 2, 'more than 6 s falls back');
  assertEqual(s.deck, 'mix');
  assertEqual(B.sanitize({ seconds: 1 }).seconds, 1, 'one second is allowed');
  assertEqual(B.sanitize({ seconds: 6 }).seconds, 6, 'six seconds is allowed');
  assertEqual(B.sanitize({ boxes: 5 }).boxes, 6, 'only 3, 6, 9 or 12 boxes');
  assertEqual(B.sanitize({ difficulty: 'easy' }).boxes, 3);
  assertEqual(B.sanitize({ difficulty: 'hard' }).boxes, 9);
  assert(B.isStandard({}), 'defaults are standard');
  assert(!B.isStandard({ seconds: 4 }), 'a change is not standard');
});

test('blink & remember: every box picture is in the picker, with decoys', function () {
  const FF = load();
  const B = FF.BlinkRemember;
  B.BOXES.forEach(function (n) {
    B.DECKS.forEach(function (deck) {
      for (let k = 0; k < 20; k++) {
        const d = B.deal(B.sanitize({ boxes: n, deck: deck }), Math.random);
        assertEqual(d.boxes.length, n, n + ' boxes');
        assertEqual(d.choices.length, B.choicesFor(n), 'choices for ' + n);
        assertEqual(new Set(ids(d.boxes)).size, n, 'box pictures differ');
        assertEqual(new Set(ids(d.choices)).size, d.choices.length, 'choices differ');
        d.boxes.forEach(function (c) { assert(ids(d.choices).indexOf(c.id) !== -1, c.id + ' can be picked'); });
        assert(d.choices.every(function (c) { return c.name; }), 'every picture has a name');
      }
    });
  });
  assertEqual(B.choicesFor(3), 6);
  assertEqual(B.choicesFor(6), 12);
  assertEqual(B.choicesFor(9), 12);
  assertEqual(B.choicesFor(12), 16);
  const one = B.deal(B.sanitize({ boxes: 12, deck: 'surprise' }), Math.random);
  const deck = FF.MemoryDecks.filter(function (dk) { return dk.cards.some(function (c) { return c[0] === one.choices[0].id; }); })[0];
  assert(one.choices.every(function (c) { return deck.cards.some(function (r) { return r[0] === c.id; }); }), 'a surprise deck keeps to one deck');
});

test('blink & remember: the same seed deals the same boxes on every phone', function () {
  [{}, { boxes: 12, deck: 'mix' }, { boxes: 3, seconds: 1 }].forEach(function (s) {
    function deal(FF) {
      const B = FF.BlinkRemember;
      return JSON.stringify(seeded(FF, 'room|blinkRemember|1', function (r) {
        const d = B.deal(B.sanitize(s), r);
        return { boxes: ids(d.boxes), choices: ids(d.choices) };
      }));
    }
    assertEqual(deal(load()), deal(load()), JSON.stringify(s));
  });
  const FF = load();
  const a = seeded(FF, 'room|blinkRemember|1', function (r) { return ids(FF.BlinkRemember.deal(FF.BlinkRemember.STANDARD, r).boxes).join(); });
  const b = seeded(FF, 'room|blinkRemember|2', function (r) { return ids(FF.BlinkRemember.deal(FF.BlinkRemember.STANDARD, r).boxes).join(); });
  assert(a !== b, 'another round, other boxes');
});

test('blink & remember: more right scores more, and all right earns a bonus', function () {
  const B = load().BlinkRemember;
  assertEqual(B.points(0, 6, 1000, 1), 0, 'nothing right, nothing scored');
  assert(B.points(4, 6, 20000, 1) > B.points(3, 6, 20000, 1), 'more right');
  assert(B.points(6, 6, 20000, 1) - B.points(5, 6, 20000, 1) > 100, 'all-right bonus');
  assert(B.points(6, 6, 2000, 1) > B.points(6, 6, 25000, 1), 'quicker answers');
  assertEqual(B.points(6, 6, 999999, 1), 900, '6 x 100 + 300 bonus, no speed bonus');
  assertEqual(B.points(6, 6, 999999, 2), 1800, 'difficulty bonus');
  const boxes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assertEqual(B.score(boxes, ['a', 'c', 'b']), 1);
  assertEqual(B.score(boxes, ['a', 'b', null]), 2, 'an empty box is wrong');
  assert(B.roomSeconds(B.sanitize({ boxes: 12, seconds: 6 })) > 12 * 6 + 12 * 4, 'a room round has time to watch and answer');
});

test('blink & remember: registers for solo, pass and play, rooms and leaderboards', function () {
  const FF = load();
  const def = FF.__defs.filter(function (d) { return d.id === 'blinkRemember'; })[0];
  assert(def, 'registered');
  assertEqual(def.name, 'Blink & Remember');
  assertEqual(def.category, 'memory');
  assert(def.modes.indexOf('solo') !== -1 && def.modes.indexOf('turn') !== -1, 'solo and pass and play');
  assert(def.room && def.room.fields && def.room.sanitize && def.room.summary, 'lobby settings');
  assertEqual(def.room.fields({}).map(function (f) { return f.key; }).join(','), 'boxes,seconds,deck');
  const read = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };
  assert(/'blinkRemember'/.test(read('js/net/roomUI.js')), 'listed in ONLINE_GAMES');
  assert(/'blinkRemember'/.test(read('api/lib/Crew.php')), 'the crew can play it');
  assert(/'blinkRemember'/.test(read('api/lib/Leaderboards.php')), 'on the leaderboards');
  assert(/"blinkRemember"/.test(read('js/icons.js')), 'has an icon');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach(function (f) {
    assert(read(f).indexOf('js/games/blinkRemember.js') !== -1, f + ' loads the game');
  });
  assert(/"blinkRemember"/.test(read('js/data/assetManifest.js')), 'has a cover');
});
