'use strict';
/* Guess It! (js/games/guessIt.js, js/data/guessIt.js): every topic has its
   pictures and facts, settings keep to what is offered, deals are fair and
   repeatable from a seed, wrong answers come from the same topic and look
   alike on harder levels, Expert names are short enough to spell, and
   points match the design. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/animals.js', 'js/data/guessIt.js', 'js/answerMatch.js', 'js/spellTiles.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/guessIt.js'), 'utf8'), FF.__sandbox, { filename: 'guessIt.js' });
  return FF;
}

const FF = load();
const G = FF.GuessIt;
const DATA = FF.data.guessIt;
const COUNTS = { food: 30, landmarks: 24, objects: 30, sports: 18, vehicles: 24, jobs: 24, instruments: 24 };

function letters(s) { return String(s).normalize('NFD').replace(/[^A-Za-z]/g, '').length; }

test('guess it: one game, ten topics in order, Mix first', function () {
  assertEqual(FF.__defs.length, 1, 'registers one game');
  assertEqual(FF.__defs[0].id, 'guessIt');
  assertEqual(FF.__defs[0].name, 'Guess It!');
  assertEqual(G.TOPICS, ['mix', 'animals', 'flags', 'food', 'landmarks', 'objects', 'sports', 'vehicles', 'jobs', 'instruments']);
});

test('guess it data: every photo topic has its count, unique ids, a group and a fact', function () {
  Object.keys(COUNTS).forEach(function (topic) {
    const items = DATA.items[topic];
    assertEqual(items.length, COUNTS[topic], topic + ' count');
    const ids = new Set(items.map(function (i) { return i.id; }));
    assertEqual(ids.size, items.length, topic + ' ids are unique');
    const groups = {};
    items.forEach(function (i) { groups[i.group] = (groups[i.group] || 0) + 1; });
    items.forEach(function (i) {
      assert(/^[a-z0-9-]+$/.test(i.id), topic + '/' + i.id + ' is a file-safe id');
      assert(i.name && i.name.length > 1, i.id + ' has a name');
      assert(groups[i.group] >= 2, i.id + ' shares its group with a lookalike');
      assert(i.fact && i.fact.length >= 10, i.id + ' has a fact');
      assert(!/'/.test(i.name + i.fact), i.id + ' uses typographic apostrophes');
    });
  });
});

test('guess it data: the art sheets list exactly the data ids, six per sheet', function () {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/art/guessIt.json'), 'utf8'));
  const fromSheets = {};
  spec.sheets.forEach(function (s) {
    assertEqual(s.items.length, 6, s.file + ' has six photos');
    s.items.forEach(function (it) { (fromSheets[s.topic] = fromSheets[s.topic] || []).push(it[0]); });
  });
  Object.keys(COUNTS).forEach(function (topic) {
    assertEqual(fromSheets[topic].slice().sort(), DATA.items[topic].map(function (i) { return i.id; }).sort(), topic + ' sheets match the data');
  });
  assertEqual(spec.sheets.length, 29);
});

test('guess it: settings keep to what is offered', function () {
  assertEqual(G.sanitize({ topic: 'nope', level: 'x', time: 7, twist: 'spin' }), { topic: 'mix', level: 'normal', time: 8, twist: 'none' });
  assertEqual(G.sanitize({ topic: 'food', level: 'expert', time: 0, twist: 'zoom' }), { topic: 'food', level: 'expert', time: 0, twist: 'zoom' });
  assertEqual(G.sanitize({ topic: 'flags', twist: 'zoom' }).twist, 'none', 'Zoom out is for pictures only');
  assertEqual(G.sanitize(null), G.STANDARD);
});

test('guess it: standard is any topic at normal, 8 s, no twist', function () {
  assert(G.isStandard({ topic: 'food', level: 'normal', time: 8, twist: 'none' }), 'food standard');
  assert(G.isStandard({ topic: 'flags', level: 'normal', time: 8, twist: 'none' }), 'flags standard');
  assert(!G.isStandard({ topic: 'food', level: 'normal', time: 8, twist: 'flash' }), 'a twist is custom');
  assert(!G.isStandard({ topic: 'food', level: 'hard', time: 8, twist: 'none' }), 'a level is custom');
  assert(!G.isStandard({ topic: 'food', level: 'normal', time: 12, twist: 'none' }), 'a time is custom');
});

test('guess it: Mix holds every picture topic, not flags', function () {
  const mix = G.itemsFor('mix');
  const total = Object.keys(COUNTS).reduce(function (n, k) { return n + COUNTS[k]; }, 0) + FF.data.animals.length;
  assertEqual(mix.length, total);
  assert(mix.every(function (i) { return i.topic !== 'flags'; }), 'no flags');
  assertEqual(G.itemsFor('animals').length, FF.data.animals.length);
  assert(G.itemsFor('animals').every(function (i) { return i.topic === 'animals'; }));
});

test('guess it: the same seed deals the same rounds, with no repeats', function () {
  const cfg = { topic: 'mix', level: 'normal', time: 8, twist: 'none' };
  const a = G.deal(cfg, G.rng(42), 12);
  const b = G.deal(cfg, G.rng(42), 12);
  assertEqual(a.map(function (r) { return r.item.topic + '/' + r.item.id; }), b.map(function (r) { return r.item.topic + '/' + r.item.id; }));
  assertEqual(a.map(function (r) { return r.options; }), b.map(function (r) { return r.options; }));
  assertEqual(new Set(a.map(function (r) { return r.item.topic + '/' + r.item.id; })).size, 12);
  const c = G.deal(cfg, G.rng(43), 12);
  assert(JSON.stringify(c.map(function (r) { return r.item.id; })) !== JSON.stringify(a.map(function (r) { return r.item.id; })), 'another seed deals differently');
});

test('guess it: asking for more rounds than pictures caps the deal', function () {
  const d = G.deal({ topic: 'sports', level: 'easy', time: 8, twist: 'none' }, G.rng(1), 50);
  assertEqual(d.length, 18);
});

test('guess it: answers per level, the right one once, lookalikes on harder levels', function () {
  const counts = { easy: 4, normal: 4, hard: 6 };
  Object.keys(counts).forEach(function (level) {
    for (let s = 1; s <= 40; s++) {
      G.deal({ topic: 'mix', level: level, time: 8, twist: 'none' }, G.rng(s), 6).forEach(function (r) {
        assertEqual(r.options.length, counts[level], level + ' answers');
        assertEqual(r.options.filter(function (o) { return o === r.item.name; }).length, 1, 'the answer once');
        assertEqual(new Set(r.options).size, r.options.length, 'no repeated answer');
        const topicNames = G.itemsFor(r.item.topic).map(function (i) { return i.name; });
        assert(r.options.every(function (o) { return topicNames.indexOf(o) !== -1; }), r.item.id + ': every answer is from its own topic');
        const sameGroup = G.itemsFor(r.item.topic).filter(function (i) { return i.group === r.item.group && i.id !== r.item.id; }).map(function (i) { return i.name; });
        const alike = r.options.filter(function (o) { return sameGroup.indexOf(o) !== -1; }).length;
        if (level === 'easy') assertEqual(alike, 0, r.item.id + ': easy keeps lookalikes out');
        if (level === 'normal') assertEqual(alike, Math.min(2, sameGroup.length), r.item.id + ': normal has two lookalikes');
        if (level === 'hard') assert(alike >= Math.min(3, sameGroup.length), r.item.id + ': hard leans on lookalikes');
      });
    }
  });
});

test('guess it: Expert spells a name of at most 16 letters for every picture', function () {
  G.itemsFor('mix').forEach(function (item) {
    const name = G.spellName(item);
    assert(letters(name) >= 2 && letters(name) <= 16, item.id + ' spells "' + name + '"');
  });
  assertEqual(G.spellName(G.itemsFor('landmarks').find(function (i) { return i.id === 'leaning-tower-of-pisa'; })), 'Tower of Pisa');
  const d = G.deal({ topic: 'food', level: 'expert', time: 8, twist: 'none' }, G.rng(3), 4);
  d.forEach(function (r) { assertEqual(r.options, [], 'Expert has no answer list'); assert(r.spellName, 'Expert has a name to spell'); });
});

test('guess it: Expert accepts other names and small slips, never another picture', function () {
  const food = G.itemsFor('food');
  const donut = food.find(function (i) { return i.id === 'doughnut'; });
  const check = G.checker(food);
  assert(check('donut', donut).ok, 'another name counts');
  assert(check('dougnut', donut).ok, 'a small slip counts');
  assert(!check('bagel', donut).ok, 'another picture never counts');
});

test('guess it: points follow the design', function () {
  assertEqual(G.points({ level: 'normal', correct: true, msLeft: 4000, secs: 8, streak: 3 }), 225, '150 + 25 speed + 50 streak');
  assertEqual(G.points({ level: 'easy', correct: true, msLeft: 8000, secs: 8, streak: 1 }), 150);
  assertEqual(G.points({ level: 'hard', correct: true, msLeft: 0, secs: 8, streak: 2, flash: true }), 225, '200 + flash 25');
  assertEqual(G.points({ level: 'expert', correct: true, msLeft: 7000, secs: 14, streak: 1, typed: true }), 275, '200 + 25 + typed 50');
  assertEqual(G.points({ level: 'normal', correct: true, msLeft: 0, secs: 0, streak: 1 }), 150, 'no limit, no speed points');
  assertEqual(G.points({ level: 'hard', correct: false, msLeft: 8000, secs: 8, streak: 3 }), 0);
  assertEqual(G.roomPoints(2500, 'hard'), 250);
  assertEqual(G.roomPoints(4000, 'normal'), 150);
});

test('guess it: picture files and close-ups', function () {
  const lion = G.itemsFor('animals').find(function (i) { return i.id === 'lion'; });
  assertEqual(G.photoSrc(lion), 'assets/images/games/guessAnimal/lion.webp');
  assertEqual(G.closeupSrc(lion), 'assets/images/games/guessAnimal/lion-closeup.webp');
  const pizza = G.itemsFor('food').find(function (i) { return i.id === 'pizza'; });
  assertEqual(G.photoSrc(pizza), 'assets/images/games/guessIt/food/pizza.webp');
  assertEqual(G.closeupSrc(pizza), null, 'other topics zoom in the browser');
});

test('guess it: the old game ids open the matching topic', function () {
  assertEqual(G.legacyTopic('guessFood'), 'food');
  assertEqual(G.legacyTopic('guessAnimal'), 'animals');
  assertEqual(G.legacyTopic('guessCountry'), 'flags');
  assertEqual(G.legacyTopic('guessLandmark'), 'landmarks');
  assertEqual(G.legacyTopic('guessObject'), 'objects');
  assertEqual(G.legacyTopic('guessSport'), 'sports');
  assertEqual(G.legacyTopic('guessVehicle'), 'vehicles');
  assertEqual(G.legacyTopic('quickTap'), null);
});
