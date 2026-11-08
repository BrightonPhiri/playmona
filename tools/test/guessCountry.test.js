'use strict';
/* Guess the Country (js/games/guessCountry.js, js/data/worldFlags.js):
   every country has a flag file and its facts, settings keep to what is
   offered, deals are fair and repeatable from a seed, wrong answers are
   sensible, and room points match what the crew brain expects. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/worldFlags.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/guessCountry.js'), 'utf8'), FF.__sandbox, { filename: 'guessCountry.js' });
  return FF;
}

const FF = load();
const G = FF.GuessCountry;
const DATA = FF.data.worldFlags;
const ALL = DATA.countries;

test('guess the country: every country in the world, each with its flag file and facts', function () {
  assertEqual(ALL.length, 194, '193 UN members and Vatican City');
  const codes = new Set(ALL.map(function (c) { return c.code; }));
  assertEqual(codes.size, ALL.length, 'every code is unique');
  const names = new Set(ALL.map(function (c) { return c.name; }));
  assertEqual(names.size, ALL.length, 'every name is unique');
  const regions = new Set(DATA.regions.map(function (r) { return r.id; }));
  ALL.forEach(function (c) {
    assert(/^[a-z]{2}$/.test(c.code), c.name + ' has a two-letter code');
    assert(regions.has(c.region), c.name + ' has a known region');
    assert([1, 2, 3].indexOf(c.tier) !== -1, c.name + ' has a tier');
    assert(c.capital && c.capital.length > 1, c.name + ' has a capital');
    assert(c.note && c.note.length > 10, c.name + ' says what is on its flag');
    assert(!/'/.test(c.name + c.capital + c.note), c.name + ' uses typographic apostrophes');
    const file = path.join(ROOT, 'assets/flags', c.code + '.svg');
    assert(fs.existsSync(file), c.name + ' has assets/flags/' + c.code + '.svg');
    const svg = fs.readFileSync(file, 'utf8');
    assert(/<svg[\s>]/.test(svg), c.code + '.svg is an SVG');
    assert(!/<script|javascript:|\son[a-z]+=/i.test(svg), c.code + '.svg has no script');
  });
  const easy = ALL.filter(function (c) { return c.tier === 1; }).length;
  assert(easy >= 30, 'enough famous flags for Easy (' + easy + ')');
});

test('guess the country: lookalike groups only name real countries', function () {
  const codes = new Set(ALL.map(function (c) { return c.code; }));
  DATA.alike.forEach(function (group) {
    assert(group.length >= 2, 'a group has at least two flags');
    group.forEach(function (code) { assert(codes.has(code), code + ' is a country'); });
  });
  assert(G.alikeOf('td').indexOf('ro') !== -1, 'Chad looks like Romania');
  assert(G.alikeOf('ro').indexOf('td') !== -1, 'and the other way round');
});

test('guess the country: settings keep to what is offered', function () {
  assertEqual(G.sanitize({}), { regions: [], level: 'normal', time: 8, flash: false }, 'empty is standard');
  assertEqual(G.sanitize({ regions: ['mars', 'europe'], level: 'insane', time: 7, flash: 1 }),
    { regions: ['europe'], level: 'normal', time: 8, flash: true }, 'unknowns fall back');
  assertEqual(G.sanitize({ regions: DATA.regions.map(function (r) { return r.id; }) }).regions, [], 'every region is the whole world');
  assertEqual(G.sanitize({ time: 0 }).time, 0, 'no limit is allowed');
  assert(G.isStandard(G.STANDARD), 'standard is standard');
  assert(!G.isStandard({ time: 3 }), 'a shorter time is not');
  assert(!G.isStandard({ flash: true }), 'Flash is not');
  assert(!G.isStandard({ regions: ['asia'] }), 'one region is not');
});

test('guess the country: levels pick the right flags and small regions widen', function () {
  const easy = G.pool(ALL, { level: 'easy' });
  assert(easy.every(function (c) { return c.tier === 1; }), 'Easy is famous flags only');
  const hard = G.pool(ALL, { level: 'hard' });
  assert(hard.every(function (c) { return c.tier >= 2; }), 'Hard leaves the famous ones out');
  const normal = G.pool(ALL, {});
  assert(normal.every(function (c) { return c.tier <= 2; }), 'Normal is tiers 1 and 2');
  const oceaniaEasy = G.pool(ALL, { level: 'easy', regions: ['oceania'] });
  assert(oceaniaEasy.length >= 8, 'Oceania on Easy widens to enough flags (' + oceaniaEasy.length + ')');
  assert(oceaniaEasy.every(function (c) { return c.region === 'oceania'; }), 'and stays in Oceania');
  DATA.regions.forEach(function (r) {
    ['easy', 'normal', 'hard'].forEach(function (l) {
      assert(G.pool(ALL, { level: l, regions: [r.id] }).length >= G.MIN_POOL, r.id + ' / ' + l + ' can be played');
    });
  });
});

test('guess the country: a deal is the same from the same seed, and fair', function () {
  const a = G.deal(ALL, {}, G.rng(42), 10);
  const b = G.deal(ALL, {}, G.rng(42), 10);
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'same seed, same deal');
  const c = G.deal(ALL, {}, G.rng(43), 10);
  assert(JSON.stringify(a) !== JSON.stringify(c), 'another seed deals differently');
  assertEqual(new Set(a.map(function (q) { return q.code; })).size, 10, 'no flag twice');
  const regions = new Set(a.map(function (q) { return q.region; }));
  assertEqual(regions.size, 5, 'regions take turns');
  a.forEach(function (q) {
    assertEqual(q.options.length, 4, q.code + ' has four answers');
    assertEqual(new Set(q.options).size, 4, q.code + ' answers are all different');
    assertEqual(q.options[q.answer], q.name, q.code + ' marks the right answer');
  });
  const seen = {};
  G.pool(ALL, {}).slice(0, 20).forEach(function (c) { seen[c.code] = true; });
  const fresh = G.deal(ALL, {}, G.rng(1), 10, seen);
  assert(fresh.every(function (q) { return !seen[q.code]; }), 'flags already seen wait their turn');
});

test('guess the country: harder levels offer flags that look alike', function () {
  const chad = ALL.filter(function (c) { return c.code === 'td'; })[0];
  let hits = 0;
  for (let s = 1; s <= 20; s++) {
    const q = G.prepare(chad, ALL, 'hard', G.rng(s));
    if (q.options.indexOf('Romania') !== -1) hits++;
  }
  assertEqual(hits, 20, 'Hard always offers Romania beside Chad');
  const france = ALL.filter(function (c) { return c.code === 'fr'; })[0];
  for (let s = 1; s <= 10; s++) {
    const q = G.prepare(france, ALL, 'easy', G.rng(s));
    const tiers = q.options.map(function (n) { return ALL.filter(function (c) { return c.name === n; })[0].tier; });
    assert(tiers.every(function (t) { return t <= 2; }), 'Easy offers well-known countries');
  }
});

test('guess the country: points', function () {
  assertEqual(G.points(false, 100, 8, false), 0, 'wrong scores nothing');
  assertEqual(G.points(true, 0, 8, false), 200, 'instant answer');
  assertEqual(G.points(true, 4000, 8, false), 150, 'half the time left');
  assertEqual(G.points(true, 8000, 8, false), 100, 'last moment');
  assertEqual(G.points(true, 4000, 8, true), 175, 'Flash adds 25');
  assertEqual(G.points(true, 2000, 0, false), 150, 'no limit: quick bonus');
  assertEqual(G.points(true, 5000, 0, false), 100, 'no limit: slow');
  // Rooms keep the old sums, which the crew brain plays from.
  assertEqual([G.roomPoints(1000, 'easy'), G.roomPoints(5000, 'normal'), G.roomPoints(2000, 'hard')], [150, 150, 250]);
});

test('guess the country: registered once, out of visualGames', function () {
  assertEqual(FF.__defs.length, 1);
  assertEqual(FF.__defs[0].id, 'guessCountry');
  const vis = fs.readFileSync(path.join(ROOT, 'js/games/visualGames.js'), 'utf8');
  assert(!/id: 'guessCountry'/.test(vis), 'visualGames no longer registers it');
  ['play.html', 'admin.html'].forEach(function (f) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(html.indexOf('js/data/worldFlags.js') !== -1 && html.indexOf('js/games/guessCountry.js') !== -1, f + ' loads it');
  });
});
