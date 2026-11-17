'use strict';
/* Guess It! animals: the roster, its photos, and the choices each level
   builds (js/data/animals.js, js/games/guessIt.js). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const WATCH_SRC = /^assets\/[A-Za-z0-9_\/.-]+\.(svg|png|jpe?g|webp)$/;   // js/watch/tv.js

function load() {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/data/animals.js', 'js/data/guessIt.js', 'js/answerMatch.js', 'js/spellTiles.js']);
  const sb = FF.__sandbox;
  FF.registerGame = function () {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/guessIt.js'), 'utf8'), sb, { filename: 'guessIt.js' });
  return FF;
}

function animalItems(FF) { return FF.GuessIt.itemsFor('animals'); }

test('every animal has an id, name, group, kind and fact', function () {
  const FF = load();
  const animals = FF.data.animals;
  assertEqual(animals.length, 64, '64 animals');
  const ids = {}, names = {};
  animals.forEach(function (a) {
    assert(/^[a-z]+(-[a-z]+)*$/.test(a.id), a.id + ' is lowercase kebab-case');
    assert(!ids[a.id] && !names[a.name], a.id + ' is listed once');
    ids[a.id] = names[a.name] = true;
    assert(a.name && a.name[0] === a.name[0].toUpperCase(), a.id + ' has a sentence-case name');
    assert(FF.data.animalNearGroups[a.group], a.id + ' has a known group');
    assert(['Mammal', 'Bird', 'Reptile', 'Amphibian', 'Fish', 'Insect', 'Invertebrate'].indexOf(a.kind) !== -1, a.id + ' kind');
    assert(a.fact && a.fact.length <= 90, a.id + ' has a short fact');
  });
});

test('the art spec lists exactly the roster', function () {
  const FF = load();
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/art/guessAnimal.json'), 'utf8'));
  assertEqual(spec.ids.slice().sort().join(','), FF.data.animals.map(function (a) { return a.id; }).sort().join(','), 'same ids');
});

test('photo paths are ones people watching can show', function () {
  const FF = load();
  animalItems(FF).forEach(function (a) {
    [FF.GuessIt.photoSrc(a), FF.GuessIt.closeupSrc(a)].forEach(function (src) {
      assert(WATCH_SRC.test(src) && src.length <= 200, src);
    });
  });
});

test('every animal has its photo and close-up once the art is processed', function () {
  const FF = load();
  const dir = path.join(ROOT, 'assets/images/games/guessAnimal');
  if (!fs.existsSync(dir)) { console.log('    (skipped: no photos processed yet)'); return; }
  animalItems(FF).forEach(function (a) {
    [FF.GuessIt.photoSrc(a), FF.GuessIt.closeupSrc(a)].forEach(function (src) {
      const file = path.join(ROOT, src);
      assert(fs.existsSync(file), path.basename(file) + ' exists');
      assert(fs.statSync(file).size <= 150 * 1024, path.basename(file) + ' is under 150 KB');
    });
  });
});

test('each level gives different choices including the answer, lookalikes only past Easy', function () {
  const FF = load();
  const animals = animalItems(FF);
  const byName = {};
  animals.forEach(function (a) { byName[a.name] = a; });
  const want = { easy: 4, normal: 4, hard: 6 };
  Object.keys(want).forEach(function (d) {
    animals.forEach(function (a) {
      for (let i = 0; i < 5; i++) {
        const opts = FF.GuessIt.options(a, animals, d, Math.random);
        assertEqual(opts.length, want[d], a.id + ' ' + d + ': choice count');
        assertEqual(new Set(opts).size, want[d], a.id + ' ' + d + ': all different');
        assert(opts.indexOf(a.name) !== -1, a.id + ' ' + d + ': includes the answer');
        const same = opts.filter(function (n) { return n !== a.name && byName[n].group === a.group; }).length;
        if (d === 'easy') assertEqual(same, 0, a.id + ' easy: no same-group lookalikes');
      }
    });
  });
});

test('the alt text keeps the answer out, and watchers see the photo the players see', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/guessIt.js'), 'utf8');
  assert(!/alt: [^,}]*\.name/.test(src), 'alt text never names the picture');
  assert(/image: \{ src: photo\.src \}/.test(src), 'watchers see the same picture');
});
