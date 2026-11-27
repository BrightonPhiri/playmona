'use strict';
/* Spot the Difference (js/games/spotDifference.js): settings, which pairs
   it uses, the shared deal, tap checks, scoring and painting spots back. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const ALL = { 'games/spotDifference': { 'market-day-a': 'aaaa1111', 'market-day-b': 'bbbb2222' } };

function load(manifest) {
  const FF = loadFF(['js/core.js', 'js/data/spotDifference.js']);
  FF.AssetManifest = manifest === undefined ? ALL : manifest;
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/spotDifference.js'), 'utf8'), FF.__sandbox, { filename: 'spotDifference.js' });
  return FF;
}

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

test('spot difference: settings keep to the offered values', function () {
  const S = load().SpotDifference;
  assertEqual(S.STANDARD, { count: 7, pictures: 1 });
  assertEqual(S.sanitize({}), S.STANDARD);
  assertEqual(S.sanitize({ count: '10', pictures: 3 }), { count: 10, pictures: 3 });
  assertEqual(S.sanitize({ count: 6, pictures: 9 }), { count: 7, pictures: 1 }, 'unknown values fall back');
  assertEqual(S.defaults('easy').count, 5);
  assertEqual(S.defaults('hard').count, 10);
  assert(S.isStandard({ count: 7, pictures: 1 }) && !S.isStandard({ count: 5, pictures: 1 }));
});

test('spot difference: a pair is used only when both pictures exist', function () {
  assertEqual(load().SpotDifference.pairs().map(function (p) { return p.id; }), ['market-day']);
  assertEqual(load({ 'games/spotDifference': { 'market-day-a': 'x' } }).SpotDifference.pairs().length, 0);
  assertEqual(load({}).SpotDifference.pairs().length, 0);
  assertEqual(load({}).__defs[0].id, 'spotDifference', 'still registered with no pictures');
});

test('spot difference: the deal is shared and picks distinct live spots', function () {
  const FF = load();
  const S = FF.SpotDifference;
  const a = seeded(FF, 'room-1', function (r) { return S.deal({ count: 7, pictures: 1 }, r); });
  const b = seeded(FF, 'room-1', function (r) { return S.deal({ count: 7, pictures: 1 }, r); });
  assertEqual(a, b, 'same seed, same pictures and spots');
  assertEqual(a.length, 1);
  assertEqual(a[0].id, 'market-day');
  assertEqual(a[0].active.length, 7);
  assertEqual(new Set(a[0].active).size, 7, 'no spot twice');
  a[0].active.forEach(function (i) { assert(i >= 0 && i < 10, 'a real spot'); });
  const all = seeded(FF, 'x', function (r) { return S.deal({ count: 10, pictures: 3 }, r); });
  assertEqual(all.length, 1, 'never more pictures than there are pairs');
  assertEqual(all[0].active, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const others = ['s1', 's2', 's3', 's4'].map(function (s) {
    return seeded(FF, s, function (r) { return S.deal({ count: 5, pictures: 1 }, r)[0].active.join(); });
  });
  assert(new Set(others).size > 1, 'different seeds pick different spots');
});

test('spot difference: linked spots are live together or painted back together', function () {
  const FF = load();
  const S = FF.SpotDifference;
  const box = { b: [0, 0, 0.1, 0.1], p: [0, 0, 0.2, 0.2] };
  const spots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () { return Object.assign({}, box); });
  spots[1].g = 1; spots[2].g = 1;          // e.g. a canoe and the rod lying across it
  spots[4].g = 2; spots[5].g = 2; spots[6].g = 2;
  const pair = { id: 'p', name: 'P', spots: spots };
  [5, 7, 10].forEach(function (count) {
    for (let n = 0; n < 60; n++) {
      const a = seeded(FF, 'g' + count + '-' + n, function (r) { return S.dealPair(pair, count, r).active; });
      assertEqual(a.length, count, 'always exactly ' + count + ' live');
      assertEqual(new Set(a).size, count, 'no spot twice');
      assert(a.indexOf(1) !== -1 === (a.indexOf(2) !== -1), 'group 1 together: ' + a);
      const g2 = [4, 5, 6].filter(function (i) { return a.indexOf(i) !== -1; }).length;
      assert(g2 === 0 || g2 === 3, 'group 2 together: ' + a);
    }
  });
  const shared = seeded(FF, 'room', function (r) { return S.dealPair(pair, 5, r).active; });
  assertEqual(seeded(FF, 'room', function (r) { return S.dealPair(pair, 5, r).active; }), shared, 'same seed, same spots');
});

test('spot difference: taps count inside a live spot, with a finger margin', function () {
  const S = load().SpotDifference;
  const item = { spots: [{ b: [0.1, 0.1, 0.1, 0.1] }, { b: [0.6, 0.6, 0.1, 0.1] }, { b: [0.4, 0.1, 0.05, 0.05] }], active: [0, 1] };
  assertEqual(S.hit(item, {}, 0.15, 0.15), 0, 'in the middle');
  assertEqual(S.hit(item, {}, 0.1 - S.MARGIN + 0.005, 0.15), 0, 'just outside the box still counts');
  assertEqual(S.hit(item, {}, 0.1 - S.MARGIN - 0.01, 0.15), -1, 'further out is a miss');
  assertEqual(S.hit(item, {}, 0.42, 0.12), -1, 'a painted-back spot is a miss');
  assertEqual(S.hit(item, { 0: true }, 0.15, 0.15), -2, 'a found spot: no penalty');
  assertEqual(S.hit(item, {}, 0.9, 0.9), -1);
});

test('spot difference: points', function () {
  const S = load().SpotDifference;
  const limit = S.secondsFor(7) * 1000;
  assertEqual(S.points({ found: 3, total: 7, wrong: 0, usedMs: 1000 }, limit), 15, '5 each, on every level');
  assertEqual(S.points({ found: 3, total: 5, wrong: 2, usedMs: 1000 }, limit), 13, 'wrong taps cost 1');
  assertEqual(S.points({ found: 0, total: 10, wrong: 9, usedMs: 1000 }, limit), 0, 'never below zero');
  const fast = S.points({ found: 7, total: 7, wrong: 0, usedMs: 0 }, limit);
  const slow = S.points({ found: 7, total: 7, wrong: 0, usedMs: limit }, limit);
  assertEqual(slow, 35);
  assertEqual(fast, 35 + 10, 'all found at once: +10 speed');
  assert(S.secondsFor(5) < S.secondsFor(7) && S.secondsFor(7) < S.secondsFor(10), 'more differences, more time');
});

test('spot difference: a painted-back patch shows picture A in place', function () {
  const S = load().SpotDifference;
  const st = S.patchStyle({ b: [0.4, 0.4, 0.1, 0.1], p: [0.35, 0.35, 0.2, 0.2] }, 'a.webp');
  assertEqual([st.left, st.top, st.width, st.height], ['35%', '35%', '20%', '20%']);
  assertEqual(st.backgroundSize, '500% 500%');
  assertEqual(st.backgroundPosition, '43.75% 43.75%', 'x / (1 - w)');
  assert(/transparent 0%/.test(st.maskImage) && /#000 25%/.test(st.maskImage), 'soft edges up to the spot');
  const edge = S.patchStyle({ b: [0, 0.4, 0.1, 0.1], p: [0, 0.35, 0.15, 0.2] }, 'a.webp');
  assert(/to right, #000 0%/.test(edge.maskImage), 'no fade against the picture edge');
});

/* ---------------- One end screen, one settings screen ---------------- */

function loadI18n() {
  const FF = loadFF(['js/core.js', 'js/i18n.js'].concat(['js/data/spotDifference.js']));
  FF.AssetManifest = typeof ALL === 'undefined' ? null : ALL;
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/spotDifference.js'), 'utf8'), FF.__sandbox, { filename: 'spotDifference.js' });
  return FF;
}

test('spotDifference: endSummary carries what the old results screen showed', function () {
  const FF = loadI18n();
  const G = FF.SpotDifference;
  const cfg = G.sanitize(G.STANDARD);
  const one = function (id, name, n, total, pts, place) { return Object.assign({ who: { id: id, name: name }, place: place, points: pts }, { found: n, total: total }); };
  const s = G.endSummary(cfg, [one('me', 'Ben', 3, 5, 40, 1)]);
  assertEqual([s.kicker, s.headline], [G.summary(cfg), '3 of 5 spotted']);
  assertEqual(s.stats.map(function (x) { return x.label + '=' + x.value; }), ['Spotted=3/5']);
  assertEqual(G.endSummary(cfg, [one('me', 'Ben', 5, 5, 60, 1)]).headline, 'You spotted them all!');
  const m = G.endSummary(cfg, [one('a', 'Amy', 5, 5, 60, 1), one('b', 'Ben', 3, 5, 40, 2)]);
  assertEqual([m.headline, m.lines.b], ['Amy wins!', '3 of 5 spotted']);
});

test('spotDifference: has its own setup and replays the saved one', function () {
  const FF = loadI18n();
  assertEqual(FF.__defs[0].setup, true);
  let seen = null;
  FF.GameUI = Object.assign({}, FF.GameUI || {}, { setupOrReplay: function (a, o) { seen = o; } });
  FF.__defs[0].start({ config: {}, shell: {} });
  assertEqual([seen && seen.key, seen && seen.sanitize === FF.SpotDifference.sanitize], ['spotDifference:setup', true]);
});
