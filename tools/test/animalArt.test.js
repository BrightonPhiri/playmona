'use strict';
/* Guess the Animal: the roster, its photos, and the four choices each
   difficulty builds (js/data/animals.js, js/games/visualGames.js). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const WATCH_SRC = /^assets\/[A-Za-z0-9_\/.-]+\.(svg|png|jpe?g|webp)$/;   // js/watch/tv.js

function load() {
  const FF = loadFF(['js/core.js', 'js/data/animals.js']);
  const sb = FF.__sandbox;
  FF.registerGame = function () {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/visualGames.js'), 'utf8'), sb, { filename: 'visualGames.js' });
  return FF;
}

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
  FF.data.animals.forEach(function (a) {
    [false, true].forEach(function (closeup) {
      const src = FF.AnimalGame.src(a, closeup);
      assert(WATCH_SRC.test(src) && src.length <= 200, src);
    });
  });
});

test('every animal has its photo and close-up once the art is processed', function () {
  const FF = load();
  const dir = path.join(ROOT, 'assets/images/games/guessAnimal');
  if (!fs.existsSync(dir)) { console.log('    (skipped: no photos processed yet)'); return; }
  FF.data.animals.forEach(function (a) {
    [false, true].forEach(function (closeup) {
      const file = path.join(ROOT, FF.AnimalGame.src(a, closeup));
      assert(fs.existsSync(file), path.basename(file) + ' exists');
      assert(fs.statSync(file).size <= 150 * 1024, path.basename(file) + ' is under 150 KB');
    });
  });
});

test('each difficulty gives four different choices including the answer', function () {
  const FF = load();
  const animals = FF.data.animals;
  const byName = {};
  animals.forEach(function (a) { byName[a.name] = a; });
  ['easy', 'normal', 'hard'].forEach(function (d) {
    animals.forEach(function (a) {
      for (let i = 0; i < 5; i++) {
        const opts = FF.AnimalGame.options(a, animals, d);
        assertEqual(opts.length, 4, a.id + ' ' + d + ': four choices');
        assertEqual(new Set(opts).size, 4, a.id + ' ' + d + ': all different');
        assert(opts.indexOf(a.name) !== -1, a.id + ' ' + d + ': includes the answer');
        const near = FF.data.animalNearGroups[a.group];
        const alike = opts.filter(function (n) { return n !== a.name && (byName[n].group === a.group || near.indexOf(byName[n].group) !== -1); }).length;
        if (d === 'easy') assertEqual(alike, 0, a.id + ' easy: no lookalikes');
        if (d === 'hard') assertEqual(alike, 3, a.id + ' hard: all lookalikes');
        if (d === 'normal') assert(alike >= 2, a.id + ' normal: at least two lookalikes');
      }
    });
  });
});

test('hard mode shows the close-up and keeps the answer out of the alt text', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/visualGames.js'), 'utf8');
  const game = src.slice(src.indexOf("id: 'guessAnimal'"), src.indexOf('4. Guess the Food'));
  assert(/var closeup = difficulty === 'hard'/.test(game), 'hard uses the close-up');
  assert(/image: \{ src: animalSrc\(item, closeup\) \}/.test(game), 'watchers see the same picture');
  assert(!/alt: [^,]*item\.name/.test(src), 'alt text never names the animal');
});
