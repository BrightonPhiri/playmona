'use strict';
/* Number Rush (js/games/numberRush.js): settings, the shared board, ring
   motion, scoring, and its place in rooms and on leaderboards. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/numberRush.js'), 'utf8'), FF.__sandbox, { filename: 'numberRush.js' });
  return FF;
}

function board(FF, seed, s) {
  const NR = FF.NumberRush;
  const cfg = NR.sanitize(s || {});
  FF.Random.seed(seed);
  const seq = NR.sequence(cfg.range, cfg.order, FF._rand);
  const lay = NR.layout(Math.min(seq.length, NR.MAX_SLOTS), cfg.speed, FF._rand);
  const deal = NR.deal(seq.length, lay.slots.length, FF._rand);
  FF.Random.unseed();
  return { cfg: cfg, seq: seq, lay: lay, deal: deal };
}

test('number rush: settings keep to the offered values', function () {
  const NR = load().NumberRush;
  assertEqual(JSON.stringify(NR.sanitize({})), JSON.stringify(NR.STANDARD));
  const s = NR.sanitize({ range: 77, seconds: '90', mistakes: 'x', speed: 'warp', order: 'down', mode: 'score' });
  assertEqual(s.range, 30, 'unknown range falls back');
  assertEqual(s.seconds, 90, 'a string number is read');
  assertEqual(s.mistakes, 3);
  assertEqual(s.speed, 'normal');
  assertEqual(s.order, 'down');
  assertEqual(s.mode, 'score');
  assertEqual(NR.sanitize({ mode: 'survival', mistakes: 0 }).mistakes, 3, 'survival needs a mistake limit');
  assertEqual(NR.sanitize({ mode: 'race', mistakes: 0 }).mistakes, 0, 'unlimited elsewhere');
  assertEqual(NR.sanitize({ difficulty: 'easy' }).range, 20);
  assertEqual(NR.sanitize({ difficulty: 'hard' }).range, 50);
  assert(NR.isStandard({}), 'defaults are standard');
  assert(!NR.isStandard({ speed: 'fast' }), 'a change is not standard');
});

test('number rush: sequences count up, down or in a random order', function () {
  const FF = load();
  const NR = FF.NumberRush;
  assertEqual(NR.sequence(5, 'up', Math.random).join(','), '0,1,2,3,4,5');
  assertEqual(NR.sequence(5, 'down', Math.random).join(','), '5,4,3,2,1,0');
  const r = NR.sequence(50, 'random', Math.random);
  assertEqual(r.length, 51);
  assertEqual(r.slice().sort(function (a, b) { return a - b; }).join(','), NR.sequence(50, 'up', Math.random).join(','), 'every number once');
});

test('number rush: the same seed builds the same board on every phone', function () {
  const FF = load();
  [{}, { range: 100, speed: 'dynamic', order: 'random' }, { range: 20, speed: 'fast' }].forEach(function (s) {
    const a = JSON.stringify(board(FF, 'room|numberRush|0', s));
    const b = JSON.stringify(board(load(), 'room|numberRush|0', s));
    assertEqual(a, b, JSON.stringify(s));
  });
  assert(JSON.stringify(board(FF, 'room|numberRush|0')) !== JSON.stringify(board(FF, 'room|numberRush|1')), 'another seed, another board');
});

test('number rush: rings fit the numbers without overlap, and more numbers mean more rings', function () {
  const NR = load().NumberRush;
  let lastRings = 0;
  [21, 31, 50].forEach(function (n) {
    const lay = NR.layout(n, 'normal', Math.random);
    assertEqual(lay.slots.length, n, n + ' slots');
    assert(lay.rings.length >= lastRings, 'rings grow with the numbers');
    lastRings = lay.rings.length;
    lay.rings.forEach(function (ring, i) {
      // Neighbours on a ring sit at least a button apart (chord length).
      if (ring.count > 1) {
        const chord = 2 * ring.r * Math.sin(Math.PI / ring.count);
        assert(chord >= lay.d * 1.05, n + ': ring ' + i + ' chord ' + chord.toFixed(0) + ' vs ' + lay.d);
      }
      assert(ring.r + lay.d / 2 <= 500, 'inside the board');
      assert(ring.r - lay.d / 2 >= NR.HUB_R, 'clear of the centre');
      if (i > 0) assert(lay.rings[i - 1].r - ring.r >= lay.d, 'rings a button apart');
    });
    assert(lay.d >= 90, n + ' numbers: buttons stay big (' + lay.d + ')');
  });
  const big = NR.layout(Math.min(101, NR.MAX_SLOTS), 'normal', Math.random);
  assertEqual(big.slots.length, NR.MAX_SLOTS, 'Extreme shows a window of numbers');
});

test('number rush: rings turn both ways at different speeds, as a pure function of time', function () {
  const NR = load().NumberRush;
  const lay = NR.layout(31, 'normal', Math.random);
  const dirs = lay.rings.map(function (r) { return r.dir; });
  assert(dirs.indexOf(1) !== -1 && dirs.indexOf(-1) !== -1, 'clockwise and anticlockwise');
  const mults = lay.rings.map(function (r) { return r.mult; });
  assertEqual(new Set(mults).size, mults.length, 'each ring its own speed');
  const ring = lay.rings[0];
  assertEqual(NR.ringAngle(ring, 12345, 'normal', 60000), NR.ringAngle(ring, 12345, 'normal', 60000), 'same time, same angle');
  const a0 = NR.ringAngle(ring, 0, 'normal', 60000);
  assertEqual(Math.round(a0), ring.offset % 360, 'starts at its offset');
});

test('number rush: dynamic speeds up, and fast rings swing back on a steady beat', function () {
  const NR = load().NumberRush;
  const ring = { offset: 0, dir: 1, mult: 1, rev: false, period: 11 };
  function turned(g0, g1, speed) {
    let sum = 0;
    for (let g = g0; g < g1; g += 50) {
      let d = NR.ringAngle(ring, g + 50, speed, 60000) - NR.ringAngle(ring, g, speed, 60000);
      if (d < -180) d += 360;
      sum += d;
    }
    return sum;
  }
  assert(turned(55000, 60000, 'dynamic') > turned(0, 5000, 'dynamic') * 2, 'late is over twice as fast');
  assert(Math.abs(turned(55000, 60000, 'normal') - turned(0, 5000, 'normal')) < 0.5, 'normal keeps its speed');
  const rev = { offset: 0, dir: 1, mult: 1, rev: true, period: 11 };
  let backwards = 0;
  for (let g = 0; g < 22000; g += 100) {
    let d = NR.ringAngle(rev, g + 100, 'fast', 60000) - NR.ringAngle(rev, g, 'fast', 60000);
    if (d > 180) d -= 360;
    if (d < 0) backwards++;
  }
  assert(backwards > 5 && backwards < 80, 'turns back for a short part of each beat (' + backwards + ')');
  const lay = NR.layout(31, 'fast', Math.random);
  assert(lay.rings.some(function (r) { return r.rev; }) && lay.rings.some(function (r) { return !r.rev; }), 'only some rings swing back');
  assert(NR.layout(31, 'normal', Math.random).rings.every(function (r) { return !r.rev; }), 'normal rings never swing back');
});

test('number rush: the deal puts each early number on the board once', function () {
  const NR = load().NumberRush;
  const d = NR.deal(101, 50, Math.random);
  assertEqual(d.length, 50);
  assertEqual(d.slice().sort(function (a, b) { return a - b; }).join(','), Array.from({ length: 50 }, function (_, i) { return i; }).join(','));
  assertEqual(NR.deal(21, 21, Math.random).length, 21);
});

test('number rush: points rank finishers first, faster first, and survivors over the eliminated', function () {
  const NR = load().NumberRush;
  const race = NR.sanitize({ range: 100 });
  const slowFull = NR.points({ found: 101, total: 101, mistakes: 1, full: true, used: 59000 }, race);
  const fastFull = NR.points({ found: 101, total: 101, mistakes: 1, full: true, used: 30000 }, race);
  const almost = NR.points({ found: 100, total: 101, mistakes: 0, full: false, used: 60000 }, race);
  assert(fastFull > slowFull, 'faster finish scores more');
  assert(slowFull > almost, 'finishing beats nearly finishing');
  const clean = NR.points({ found: 101, total: 101, mistakes: 0, full: true, used: 30000 }, race);
  assertEqual(clean - fastFull, 100, 'a clean run earns 100');
  const surv = NR.sanitize({ mode: 'survival' });
  const standing = NR.points({ found: 5, total: 31, mistakes: 2, elim: false, used: 60000 }, surv);
  const out = NR.points({ found: 25, total: 31, mistakes: 3, elim: true, used: 50000 }, surv);
  assert(standing > out, 'still in beats further but out');
  const score = NR.sanitize({ mode: 'score' });
  assert(NR.points({ found: 10, combo: 50 }, score) > NR.points({ found: 10, combo: 0 }, score), 'combos count in Score mode');
  assertEqual(NR.comboBonus(500), 10);
  assertEqual(NR.comboBonus(1200), 5);
  assertEqual(NR.comboBonus(4000), 0);
  assertEqual(NR.points({ found: 0 }, race), 0);
});

test('number rush: registers for solo, pass and play and rooms', function () {
  const FF = load();
  const def = FF.__defs.filter(function (d) { return d.id === 'numberRush'; })[0];
  assert(def, 'registered');
  assertEqual(def.category, 'numbers');
  assert(def.modes.indexOf('solo') !== -1 && def.modes.indexOf('turn') !== -1, 'solo and pass and play');
  assert(def.room && def.room.fields && def.room.sanitize && def.room.summary, 'lobby settings');
  assert(!def.room.start, 'rooms start it like any shared game, no server referee');
  const keys = def.room.fields({ mode: 'race' }).map(function (f) { return f.key; });
  assertEqual(keys.join(','), 'mode,range,seconds,mistakes,speed,order');
  const survival = def.room.fields({ mode: 'survival', mistakes: 0 });
  const mist = survival.filter(function (f) { return f.key === 'mistakes'; })[0];
  assert(mist.options.every(function (o) { return o.value !== 0; }), 'survival offers no unlimited');
  assert(typeof def.room.summary({}) === 'string' && def.room.summary({}).length > 10);
  const ui = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/'numberRush'/.test(ui), 'listed in ONLINE_GAMES');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach(function (f) {
    assert(fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('js/games/numberRush.js') !== -1, f + ' loads the game');
  });
});

test('number rush: its own rules keep a run off the leaderboards', function () {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/registry.js', 'js/leaderboards.js']);
  const def = { id: 'numberRush', category: 'numbers', players: [1, 8], modes: ['solo', 'turn'] };
  const base = { def: def, difficulty: 'normal', length: 'normal', timer: 20, clock: 0, scorers: [{ id: 'me', isMe: true }] };
  const std = FF.Leaderboards.unrankedReason(base);
  assert(std === null || std === 'account', 'standard rules count (' + std + ')');
  assertEqual(FF.Leaderboards.unrankedReason(Object.assign({ customRules: true }, base)), 'settings');
});

test('number rush: players may only write their own live progress', function () {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'));
  const live = rules.rules.rooms.$code.rounds.$index.live;
  assert(live && live.$uid, 'rounds/<n>/live/<uid> rule');
  assert(/\$uid === auth\.uid/.test(live.$uid['.write']), 'own record only');
  const gen = fs.readFileSync(path.join(ROOT, 'tools/gen-rules.js'), 'utf8');
  assert(/live: \{/.test(gen), 'gen-rules.js writes the same rule');
});
