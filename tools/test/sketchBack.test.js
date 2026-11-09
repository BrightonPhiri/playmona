'use strict';
/* SketchBack: the object library (js/data/sketches.js), the pure rules
   (js/sketchback/rules.js), the art wiring, the drawing pad's stroke model
   (js/sketchback/pad.js) and the game's registration. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RULES = ['js/core.js', 'js/answerMatch.js', 'js/data/sketches.js', 'js/sketchback/rules.js'];
let cached = null;
const ff = () => cached || (cached = loadFF(RULES));
const R = () => ff().SketchBackRules;
const CATS = ['animals', 'food', 'nature', 'transport', 'household', 'everyday'];

/* ---------- library ---------- */

test('sketchBack library: 120+ objects, unique ids and names, every category and tier well stocked', function () {
  const D = ff().SketchData;
  assertEqual(D.CATS.join(','), CATS.join(','));
  assert(D.LIST.length >= 120, 'only ' + D.LIST.length + ' objects');
  const ids = {}, names = {};
  D.LIST.forEach((o) => {
    assert(/^[a-z][A-Za-z0-9]*$/.test(o.id), 'bad id ' + o.id);
    assert(!ids[o.id], 'duplicate id ' + o.id);
    ids[o.id] = true;
    const n = o.name.toLowerCase();
    assert(!names[n], 'duplicate name ' + o.name);
    names[n] = true;
    assert(CATS.indexOf(o.cat) !== -1, o.id + ' category ' + o.cat);
    assert(['e', 'n', 'h'].indexOf(o.tier) !== -1, o.id + ' tier ' + o.tier);
    assert(Array.isArray(o.alts), o.id + ' alts');
  });
  CATS.forEach((c) => assert(D.LIST.filter((o) => o.cat === c).length >= 18, c + ' is thin'));
  ['e', 'n', 'h'].forEach((t) => assert(D.LIST.filter((o) => o.tier === t).length >= 30, 'tier ' + t + ' is thin'));
});

test('sketchBack library: no other name equals another object\'s name or a vague word', function () {
  const D = ff().SketchData;
  const N = ff().AnswerMatch.normalise;
  const owner = {};
  D.LIST.forEach((o) => { owner[N(o.name)] = o.id; });
  const vague = {};
  D.VAGUE.forEach((v) => { vague[N(v)] = true; });
  D.LIST.forEach((o) => {
    assert(!vague[N(o.name)], o.id + ' name is vague');
    o.alts.forEach((a) => {
      assert(!owner[N(a)] || owner[N(a)] === o.id, o.id + ' alt "' + a + '" is ' + owner[N(a)]);
      assert(!vague[N(a)], o.id + ' alt "' + a + '" is vague');
    });
  });
});

/* ---------- settings and deal ---------- */

test('sketchBack sanitize: the lists, the standard setup and fallbacks', function () {
  const r = R();
  assertEqual(r.COUNTS.join(','), '5,10,15');
  assertEqual(r.LEVELS.join(','), 'easy,normal,hard');
  assertEqual(JSON.stringify(r.SECONDS), JSON.stringify({ easy: 7, normal: 5, hard: 4 }));
  assertEqual(JSON.stringify(r.STANDARD), JSON.stringify({ count: 10, level: 'normal' }));
  assertEqual(r.RECALL_MS, 180000);
  assertEqual(r.POINTS, 100);
  assertEqual(JSON.stringify(r.sanitize({ count: 7, level: 'mega' })), JSON.stringify({ count: 10, level: 'normal' }));
  assertEqual(r.sanitize({ count: '15', level: 'hard' }).count, 15);
  assertEqual(JSON.stringify(r.sanitizeRoom(null)), JSON.stringify(r.STANDARD));
  assert(r.isStandard({ count: 10, level: 'normal' }) && !r.isStandard({ count: 5, level: 'normal' }), 'isStandard');
});

test('sketchBack deal: the right count, no repeats, the same seed deals the same', function () {
  const r = R();
  [5, 10, 15].forEach((count) => {
    const d = r.deal({ count: count, level: 'normal' }, 'seed-' + count);
    assertEqual(d.length, count);
    assertEqual(new Set(d).size, count, 'repeats in ' + d.join(','));
    d.forEach((id) => assert(ff().SketchData.LIST.some((o) => o.id === id), 'unknown ' + id));
  });
  assertEqual(r.deal({ count: 10, level: 'hard' }, 'abc').join(','), r.deal({ count: 10, level: 'hard' }, 'abc').join(','));
  assert(r.deal({ count: 10, level: 'hard' }, 'abc').join(',') !== r.deal({ count: 10, level: 'hard' }, 'abd').join(','), 'seeds differ');
});

test('sketchBack deal: easy is mostly simple objects, hard mostly detailed ones', function () {
  const r = R();
  const tier = {};
  ff().SketchData.LIST.forEach((o) => { tier[o.id] = o.tier; });
  let easyE = 0, hardH = 0, n = 0;
  for (let i = 0; i < 40; i++) {
    r.deal({ count: 10, level: 'easy' }, 'e' + i).forEach((id) => { if (tier[id] === 'e') easyE++; });
    r.deal({ count: 10, level: 'hard' }, 'h' + i).forEach((id) => { if (tier[id] === 'h') hardH++; });
    n += 10;
  }
  assert(easyE / n >= 0.5, 'easy tier-e share ' + easyE / n);
  assert(hardH / n >= 0.4, 'hard tier-h share ' + hardH / n);
});

/* ---------- answers ---------- */

test('sketchBack check accepts other names, plurals, case, spaces and small typos', function () {
  const r = R();
  [['Bike', 'bicycle'], ['airplane', 'aeroplane'], ['plane', 'aeroplane'], ['TV', 'television'], ['automobile', 'car'],
    ['Cats', 'cat'], ['butterfy', 'butterfly'], ['  DONUT ', 'donut'], ['doughnut', 'donut'], ['strawberries', 'strawberry'],
    ['a cat', 'cat'], ['an umbrella', 'umbrella']].forEach(([guess, id]) => {
    assert(r.check(guess, id).ok, '"' + guess + '" should be ' + id);
  });
});

test('sketchBack check refuses vague words and other objects', function () {
  const r = R();
  [['animal', 'cat'], ['thing', 'key'], ['food', 'pizza'], ['dog', 'cat'], ['car', 'bus'], ['object', 'lamp']].forEach(([guess, id]) => {
    assert(!r.check(guess, id).ok, '"' + guess + '" should not be ' + id);
  });
  assert(r.check('', 'cat').empty, 'empty');
  assert(!r.check('   ', 'cat').ok, 'blank');
});

test('sketchBack score: 100 a right answer, accuracy as a whole percent', function () {
  const r = R();
  const s = r.score([true, true, false, true, true, false, true, true, false, true]);
  assertEqual(JSON.stringify(s), JSON.stringify({ correct: 7, wrong: 3, total: 10, accuracy: 70, points: 700 }));
  assertEqual(r.score([]).accuracy, 0);
  assertEqual(r.score([true, false, false]).accuracy, 33);
});

/* ---------- strokes ---------- */

test('sketchBack encode/decode: a round trip within a unit, empty drawings stay empty', function () {
  const r = R();
  const strokes = [[10.4, 20.6, 100, 200, 300.2, 400.9], [999, 0, 500, 500]];
  const back = r.decode(r.encode(strokes));
  assertEqual(back.length, 2);
  for (let s = 0; s < 2; s++) {
    back[s].forEach((v, i) => assert(Math.abs(v - strokes[s][i]) <= 1, 'point ' + s + '/' + i + ' ' + v));
  }
  assertEqual(r.encode([]), '');
  assertEqual(r.decode('').length, 0);
  assertEqual(r.decode(null).length, 0);
  assert(!/[|]/.test(r.encode(strokes)), 'no | in an encoded drawing');
});

test('sketchBack encode caps a huge scribble so it fits one write', function () {
  const r = R();
  const big = [];
  for (let i = 0; i < 5000; i++) big.push((i * 7) % 1000, (i * 13) % 1000);
  const enc = r.encode([big]);
  const pts = r.decode(enc).reduce((n, s) => n + s.length / 2, 0);
  assert(pts <= 1200, 'points ' + pts);
  assert(enc.length < 9000, 'length ' + enc.length);
  const dots = r.decode(r.encode([[5, 5, 5.5, 5.2]]));
  assertEqual(dots.length, 1, 'a dot survives');
  assert(dots[0].length >= 2, 'a dot has a point');
});

test('sketchBack decode ignores rubbish', function () {
  const r = R();
  assertEqual(r.decode('zz,??;;').filter((s) => s.length).length, 0);
  r.decode('a,b,c').forEach((s) => assertEqual(s.length % 2, 0, 'pairs'));
});

/* ---------- art ---------- */

test('sketchBack art: every object is on exactly one sheet of 12, and the cover is listed', function () {
  const spec = JSON.parse(read('tools/art/sketchBack.json'));
  assertEqual(spec.game, 'sketchBack');
  assertEqual(spec.cards.to, 'assets/images/sketchback/{id}.webp');
  assertEqual(spec.cover.to, 'assets/images/covers/sketchBack.webp');
  const seen = {};
  spec.sheets.forEach((sh) => {
    assert(sh.items.length <= 12 && sh.items.length > 0, sh.file + ' has ' + sh.items.length);
    sh.items.forEach(([id, desc]) => {
      assert(!seen[id], id + ' on two sheets');
      seen[id] = true;
      assert(typeof desc === 'string' && desc.length > 10, id + ' description');
    });
  });
  ff().SketchData.LIST.forEach((o) => assert(seen[o.id], o.id + ' is on no sheet'));
  assertEqual(Object.keys(seen).length, ff().SketchData.LIST.length, 'only library objects');
  const md = read('docs/art/sketchBack-prompts.md');
  spec.sheets.forEach((sh) => assert(md.indexOf(sh.file) !== -1, 'prompt pack names ' + sh.file));
});

test('sketchBack art: the sketch list names only files that exist', function () {
  const F = loadFF(['js/data/sketchFiles.js']).SketchFiles;
  assert(Array.isArray(F.ids), 'ids');
  F.ids.forEach((id) => assert(fs.existsSync(path.join(ROOT, 'assets/images/sketchback', id + '.webp')), id + ' missing'));
  const gen = require(path.join(ROOT, 'tools/sketchback/gen-files.js'));
  assertEqual(JSON.stringify(gen.list()), JSON.stringify(F.ids), 'sketchFiles.js is up to date');
});

/* ---------- drawing pad ---------- */

const pad = () => loadFF(['js/core.js', 'js/sketchback/pad.js']).SketchPad;

test('sketchBack pad: undo removes the last stroke, clear empties', function () {
  const m = pad()._model();
  m.start(10, 10); m.move(50, 50); m.end();
  m.start(100, 100); m.move(200, 200); m.end();
  assertEqual(m.strokes().length, 2);
  m.undo();
  assertEqual(m.strokes().length, 1);
  assertEqual(m.strokes()[0].join(','), '10,10,50,50');
  m.clear();
  assertEqual(m.strokes().length, 0);
  m.undo();
  assertEqual(m.strokes().length, 0, 'undo on empty is harmless');
});

test('sketchBack pad locks mid-stroke: the drawing stays as it stood', function () {
  const m = pad()._model();
  m.start(10, 10); m.move(20, 20);
  m.lock();
  m.move(300, 300); m.end();
  m.start(500, 500); m.move(600, 600); m.end();
  m.undo(); m.clear();
  assertEqual(JSON.stringify(m.strokes()), JSON.stringify([[10, 10, 20, 20]]));
  assert(m.locked(), 'locked');
});

test('sketchBack pad: a tap makes a dot, points stay on the paper', function () {
  const m = pad()._model();
  m.start(40, 40); m.end();
  assertEqual(m.strokes().length, 1);
  assertEqual(m.strokes()[0].length, 2);
  m.start(-50, 2000); m.move(1200, -3); m.end();
  assertEqual(m.strokes()[1].join(','), '0,1000,1000,0');
});

test('sketchBack pad: strokes() is a copy, so saved drawings never change', function () {
  const m = pad()._model();
  m.start(1, 1); m.move(5, 5); m.end();
  const saved = m.strokes();
  m.start(9, 9); m.end();
  saved[0].push(99);
  assertEqual(m.strokes().length, 2);
  assertEqual(m.strokes()[0].length, 4);
});

/* ---------- the game ---------- */

test('sketchBack listing: only with 60 sketches, or the dev preview flag', function () {
  const r = R();
  assertEqual(r.LIST_MIN, 60);
  assert(!r.listed([], false), 'no art');
  assert(!r.listed(new Array(59).fill('x'), false), '59 sketches');
  assert(r.listed(new Array(60).fill('x'), false), '60 sketches');
  assert(r.listed([], true), 'preview flag');
  const src = read('js/games/sketchBack.js');
  assert(/R\.listed\(/.test(src) && src.indexOf('R.listed(') < src.lastIndexOf('FF.registerGame('), 'registration is guarded');
});

test('sketchBack registered: solo, a memory game on the leaderboards, with an icon', function () {
  const src = read('js/games/sketchBack.js');
  assert(/id:\s*'sketchBack'/.test(src), 'registered');
  assert(/category:\s*'memory'/.test(src), 'memory category');
  assert(/leaderboard:\s*true/.test(src), 'leaderboard');
  assert(/'sketchBack'/.test(read('api/lib/Leaderboards.php')), 'the server leaderboard list');
  assert(/"sketchBack"/.test(read('js/icons.js')), 'has an icon');
});

test('sketchBack pages load its scripts in order and never the dev referee', function () {
  const order = ['js/answerMatch.js', 'js/data/sketches.js', 'js/data/sketchFiles.js', 'js/sketchback/rules.js', 'js/sketchback/pad.js',
    'js/sketchback/client.js', 'js/games/sketchBack.js'];
  ['play.html', 'admin.html', 'tools/test-seed.html', 'tools/load-check.js'].forEach((f) => {
    const s = read(f);
    let last = -1;
    order.forEach((src) => {
      const i = s.indexOf(src);
      assert(i !== -1, f + ' loads ' + src);
      if (src !== 'js/answerMatch.js') assert(i > last, f + ' loads ' + src + ' in order');
      last = i;
    });
    assert(s.indexOf('js/sketchback/dev.js') === -1, f + ' never loads the dev referee');
  });
});

test('sketchBack never uses Math.random outside its fallbacks', function () {
  ['js/sketchback/rules.js', 'js/sketchback/pad.js', 'js/data/sketches.js'].forEach((f) => assert(!/Math\.random/.test(read(f)), f));
  const game = read('js/games/sketchBack.js').replace(/FF\._rand \? FF\._rand\(\) : Math\.random\(\)/g, '');
  assert(!/Math\.random/.test(game), 'the screen draws from the seed');
});

test('sketchBack recall order: shuffled per player, the same on a reload', function () {
  const r = R();
  const a = r.recallOrder(10, 'seed1', 'p1');
  assertEqual(a.slice().sort((x, y) => x - y).join(','), '0,1,2,3,4,5,6,7,8,9');
  assertEqual(a.join(','), r.recallOrder(10, 'seed1', 'p1').join(','));
  assert(a.join(',') !== r.recallOrder(10, 'seed1', 'p2').join(','), 'differs per player');
});
