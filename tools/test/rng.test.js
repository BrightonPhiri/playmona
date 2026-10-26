'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function seq(FF, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(FF._rand());
  return out;
}

test('the same seed produces the same sequence', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('abc123');
  const a = seq(FF, 20);
  FF.Random.seed('abc123');
  const b = seq(FF, 20);
  assertEqual(a, b, 'identical seeds must produce identical sequences');
});

test('different seeds produce different sequences', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('abc123');
  const a = seq(FF, 20);
  FF.Random.seed('abc124');
  const b = seq(FF, 20);
  assert(JSON.stringify(a) !== JSON.stringify(b), 'different seeds must diverge');
});

test('two independent sandboxes agree - this is the real device test', function () {
  const deviceA = loadFF(['js/core.js']);
  const deviceB = loadFF(['js/core.js']);
  deviceA.Random.seed('room-seed-xyz');
  deviceB.Random.seed('room-seed-xyz');
  assertEqual(seq(deviceA, 50), seq(deviceB, 50),
    'two separate devices with the same seed must generate the same numbers');
});

test('all values stay in [0, 1)', function () {
  const FF = loadFF(['js/core.js']);
  FF.Random.seed('range-check');
  seq(FF, 500).forEach(function (n) {
    assert(n >= 0 && n < 1, 'value out of range: ' + n);
  });
});

test('unseed restores Math.random', function () {
  const FF = loadFF(['js/core.js']);
  assertEqual(FF.Random.seeded(), false, 'starts unseeded');
  FF.Random.seed('x');
  assertEqual(FF.Random.seeded(), true);
  FF.Random.unseed();
  assertEqual(FF.Random.seeded(), false);

  FF.Random.seed('x');
  const seeded = seq(FF, 10);
  FF.Random.unseed();
  const free = seq(FF, 10);
  assert(JSON.stringify(seeded) !== JSON.stringify(free),
    'after unseed the sequence must not repeat the seeded one');
});

test('shuffle is deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  a.Random.seed('shuffle-seed');
  b.Random.seed('shuffle-seed');
  assertEqual(a.util.shuffle(items), b.util.shuffle(items));
});

test('pick and sample are deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  a.Random.seed('pick-seed');
  b.Random.seed('pick-seed');
  assertEqual(a.util.pick(items), b.util.pick(items));
  assertEqual(a.util.sample(items, 4), b.util.sample(items, 4));
  assertEqual(a.util.int(1, 100), b.util.int(1, 100));
});

test('Bag is deterministic under a seed', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  const items = ['w', 'x', 'y', 'z'];
  a.Random.seed('bag-seed');
  b.Random.seed('bag-seed');
  const bagA = a.Random.Bag(items);
  const bagB = b.Random.Bag(items);
  assertEqual(bagA.nextN(12), bagB.nextN(12), 'bags must deal the same order, including refills');
});

test('roundSeed depends on every input', function () {
  const FF = loadFF(['js/core.js']);
  const base = FF.Random.roundSeed('seed', 'guessFlag', 0);
  assert(base !== FF.Random.roundSeed('seed2', 'guessFlag', 0), 'room seed must matter');
  assert(base !== FF.Random.roundSeed('seed', 'mapChallenge', 0), 'game id must matter');
  assert(base !== FF.Random.roundSeed('seed', 'guessFlag', 1), 'round index must matter');
  assertEqual(base, FF.Random.roundSeed('seed', 'guessFlag', 0), 'and it must be stable');
});

test('round seeding makes round N independent of earlier rounds', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);

  // Device A plays rounds 0,1,2 then reseeds for round 3.
  [0, 1, 2].forEach(function (i) {
    a.Random.seed(a.Random.roundSeed('s', 'g', i));
    seq(a, 30);
  });
  a.Random.seed(a.Random.roundSeed('s', 'g', 3));
  const roundThreeOnA = seq(a, 10);

  // Device B joins late and goes straight to round 3.
  b.Random.seed(b.Random.roundSeed('s', 'g', 3));
  const roundThreeOnB = seq(b, 10);

  assertEqual(roundThreeOnA, roundThreeOnB,
    'a device that joins mid-game must still see the same round 3');
});

test('newSeed produces distinct 8-character seeds', function () {
  const FF = loadFF(['js/core.js']);
  const seen = {};
  for (let i = 0; i < 200; i++) {
    const s = FF.Random.newSeed();
    assertEqual(s.length, 8, 'seed length');
    seen[s] = true;
  }
  assert(Object.keys(seen).length > 190, 'seeds must be near-unique');
});

test('Bag deals every item once per pass, never sticking on the last one', function () {
  const FF = loadFF(['js/core.js']);
  const items = ['a', 'b', 'c', 'd'];
  const bag = FF.Random.Bag(items);
  const first = [bag.next(), bag.next(), bag.next(), bag.next()];
  assertEqual(first.slice().sort(), items, 'one full pass');
  const seen = {};
  for (let i = 0; i < 40; i++) seen[bag.next()] = (seen[bag.next()] || 0) + 1;
  assertEqual(Object.keys(seen).sort(), items, 'keeps cycling through everything');
});
