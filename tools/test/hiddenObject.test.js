'use strict';
/* Hidden Object (js/games/hiddenObject.js): settings, which scenes it
   uses, the shared deal, tap checks (decoys, found, misses), scoring and
   the zoom maths that turns a finger position into a picture position. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const ALL = { 'games/hiddenObject': { attic: 'aaaa1111' } };

function load(manifest) {
  const FF = loadFF(['js/core.js', 'js/data/hiddenObject.js']);
  FF.AssetManifest = manifest === undefined ? ALL : manifest;
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/hiddenObject.js'), 'utf8'), FF.__sandbox, { filename: 'hiddenObject.js' });
  return FF;
}

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

function near(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, (msg || 'value') + ': expected ' + b + ', got ' + a);
}

test('hidden object: settings keep to the offered values', function () {
  const H = load().HiddenObject;
  assertEqual(H.STANDARD, { count: 9, pictures: 1 });
  assertEqual(H.sanitize({}), H.STANDARD);
  assertEqual(H.sanitize({ count: '12', pictures: 3 }), { count: 12, pictures: 3 });
  assertEqual(H.sanitize({ count: 7, pictures: 2 }), { count: 9, pictures: 1 }, 'unknown values fall back');
  assertEqual(H.defaults('easy').count, 6);
  assertEqual(H.defaults('hard').count, 12);
  assertEqual([H.secondsFor(6), H.secondsFor(9), H.secondsFor(12)], [90, 120, 150]);
  assert(H.isStandard({ count: 9, pictures: 1 }) && !H.isStandard({ count: 6, pictures: 1 }));
});

test('hidden object: a scene is used only when its picture exists', function () {
  const FF = load();
  assertEqual(FF.HiddenObject.scenes().map(function (s) { return s.id; }), ['attic']);
  assertEqual(load({}).HiddenObject.scenes().length, 0);
  assertEqual(load({}).__defs[0].id, 'hiddenObject', 'still registered with no pictures');
  FF.data.hiddenObject.scenes.forEach(function (scene) {
    assertEqual(scene.objects.length, 12, scene.id + ' hides 12 objects');
    scene.objects.forEach(function (o) {
      assert(o.n && o.b.length === 4, 'a name and a box');
      assert(o.b[0] >= 0 && o.b[1] >= 0 && o.b[0] + o.b[2] <= 1 && o.b[1] + o.b[3] <= 1, o.n + ' inside the picture');
    });
  });
});

test('hidden object: the deal is shared and lists distinct objects', function () {
  const FF = load();
  const H = FF.HiddenObject;
  const a = seeded(FF, 'room-1', function (r) { return H.deal({ count: 9, pictures: 1 }, r); });
  const b = seeded(FF, 'room-1', function (r) { return H.deal({ count: 9, pictures: 1 }, r); });
  assertEqual(a, b, 'same seed, same scene and list');
  assertEqual(a.length, 1);
  assertEqual(a[0].id, 'attic');
  assertEqual(a[0].active.length, 9);
  assertEqual(new Set(a[0].active).size, 9, 'no object twice');
  a[0].active.forEach(function (i) { assert(i >= 0 && i < 12, 'a real object'); });
  const all = seeded(FF, 'x', function (r) { return H.deal({ count: 12, pictures: 3 }, r); });
  assertEqual(all.length, 1, 'never more pictures than there are scenes');
  assertEqual(all[0].active.slice().sort(function (x, y) { return x - y; }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const lists = ['s1', 's2', 's3', 's4'].map(function (s) {
    return seeded(FF, s, function (r) { return H.deal({ count: 6, pictures: 1 }, r)[0].active.join(); });
  });
  assert(new Set(lists).size > 1, 'different seeds pick different lists');
});

test('hidden object: a tap finds the nearest listed object', function () {
  const H = load().HiddenObject;
  const item = {
    id: 't', name: 'T', active: [0, 1],
    objects: [
      { n: 'umbrella', b: [0.5, 0.2, 0.1, 0.4] },
      { n: 'boat', b: [0.45, 0.45, 0.1, 0.1] },
      { n: 'cat', b: [0.1, 0.1, 0.1, 0.1] }
    ]
  };
  assertEqual(H.hit(item, {}, 0.55, 0.3), 0, 'inside one box');
  assertEqual(H.hit(item, {}, 0.5, 0.5), 1, 'two boxes: the nearer centre wins');
  assertEqual(H.hit(item, {}, 0.2 + H.MARGIN - 0.001, 0.15), -3, 'an object not on the list: a decoy');
  assertEqual(H.hit(item, { 0: true }, 0.55, 0.3), -2, 'already found: no penalty');
  assertEqual(H.hit(item, { 0: true }, 0.5, 0.5), 1, 'a found box does not hide a live one');
  assertEqual(H.hit(item, {}, 0.9, 0.9), -1, 'empty space: a miss');
  assertEqual(H.hit(item, {}, 0.6 + H.MARGIN - 0.001, 0.3), 0, 'finger room round the box');
  assertEqual(H.hit(item, {}, 0.6 + H.MARGIN + 0.01, 0.1), -1, 'but not beyond it');
});

test('hidden object: points for finds, speed and wrong taps', function () {
  const H = load().HiddenObject;
  assertEqual(H.points({ found: 3, total: 6, wrong: 0 }, 90000), 300);
  assertEqual(H.points({ found: 3, total: 9, wrong: 0 }, 120000), 450, 'Normal bonus 1.5');
  assertEqual(H.points({ found: 6, total: 6, wrong: 0, usedMs: 0 }, 90000), 800, 'all found at once: +200');
  assertEqual(H.points({ found: 6, total: 6, wrong: 0, usedMs: 45000 }, 90000), 700, 'half the clock: +100');
  assertEqual(H.points({ found: 12, total: 12, wrong: 0, usedMs: 150000 }, 150000), 2400, 'Hard bonus 2, no time left');
  assertEqual(H.points({ found: 1, total: 6, wrong: 2 }, 90000), 60, 'wrong taps cost 20');
  assertEqual(H.points({ found: 0, total: 6, wrong: 5 }, 90000), 0, 'never below 0');
});

test('hidden object: zoom keeps the picture under the finger', function () {
  const H = load().HiddenObject;
  assertEqual(H.clampView({ z: 5, x: 0, y: 0 }).z, H.MAX_ZOOM);
  assertEqual(H.clampView({ z: 0.5, x: 0.3, y: -0.3 }), { z: 1, x: 0, y: 0 }, 'never smaller than the frame');
  assertEqual(H.clampView({ z: 2, x: 0.2, y: -1.5 }), { z: 2, x: 0, y: -1 }, 'the picture always covers the frame');
  const p = H.toPicture({ z: 2, x: -0.5, y: -0.5 }, 0.5, 0.5);
  near(p[0], 0.5); near(p[1], 0.5);
  const v = H.zoomAt({ z: 1, x: 0, y: 0 }, 2, 0.25, 0.75);
  assertEqual(v.z, 2);
  const q = H.toPicture(v, 0.25, 0.75);
  near(q[0], 0.25, 'x stays put'); near(q[1], 0.75, 'y stays put');
  const w = H.zoomAt(v, 10, 0.25, 0.75);
  assertEqual(w.z, H.MAX_ZOOM, 'capped');
  assertEqual(H.zoomAt(w, 0.01, 0.5, 0.5), { z: 1, x: 0, y: 0 }, 'zooming right out resets');
  assert(H.isTap(3, 4) && !H.isTap(9, 0), 'a drag is not a tap');
});
