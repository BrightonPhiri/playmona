'use strict';
/* Picture Rush (js/games/pictureRush.js): settings, the pictures it draws
   from, the shared deal, scoring, and its place in rooms and on
   leaderboards. Picture Puzzle, which it replaced, must be gone. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load(manifest) {
  const FF = loadFF(['js/core.js', 'js/data/visual.js', 'js/data/visual2.js', 'js/data/pictureRush.js', 'js/celebrate/pictureRush/rules.js']);
  if (manifest) FF.AssetManifest = manifest;
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/pictureRush.js'), 'utf8'), FF.__sandbox, { filename: 'pictureRush.js' });
  return FF;
}

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

/* A manifest that says every picture of these themes has its file. */
function withPhotos(FF, themes) {
  const m = {};
  FF.data.pictureRush.themes.forEach(function (th) {
    if (themes.indexOf(th.id) === -1) return;
    th.pictures.forEach(function (p) { m[p[0]] = 'abcd1234'; });
  });
  return { 'games/pictureRush': m };
}

test('picture rush: settings keep to the offered values', function () {
  const P = load().PictureRush;
  assertEqual(JSON.stringify(P.sanitize({})), JSON.stringify(P.STANDARD));
  assertEqual(P.STANDARD, { theme: 'mix', grid: 4, count: 3, peek: 3 });
  const s = P.sanitize({ grid: '6', count: 5, peek: 0, theme: 'food' });
  assertEqual(s.grid, 6, 'a string number is read');
  assertEqual(s.count, 5);
  assertEqual(s.peek, 0, 'no look is allowed');
  assertEqual(s.theme, 'food');
  assertEqual(P.sanitize({ grid: 7, count: 2, peek: 4, theme: 'space' }), { theme: 'mix', grid: 4, count: 3, peek: 3 }, 'anything else falls back');
  assertEqual(P.sanitize({ difficulty: 'easy' }).grid, 3);
  assertEqual(P.sanitize({ difficulty: 'hard' }).grid, 5);
  assert(P.isStandard({}), 'defaults are standard');
  assert(!P.isStandard({ grid: 5 }), 'a change is not standard');
  assertEqual([3, 4, 5, 6].map(P.secondsFor), [60, 120, 180, 300]);
});

test('picture rush: the picture list has 6 themes of 16 with unique ids', function () {
  const FF = load();
  const th = FF.data.pictureRush.themes;
  assertEqual(th.map(function (t) { return t.id; }), ['animals', 'nature', 'food', 'city', 'vehicles', 'home']);
  const ids = [];
  th.forEach(function (t) {
    assertEqual(t.pictures.length, 16, t.id);
    t.pictures.forEach(function (p) {
      assert(p[0].indexOf(t.id + '-') === 0, p[0] + ' starts with its theme');
      assert(/^[a-z0-9-]+$/.test(p[0]), p[0] + ' is a safe file name');
      assert(p[1], p[0] + ' has a name');
      ids.push(p[0]);
    });
  });
  assertEqual(new Set(ids).size, 96);
  const spec = JSON.parse(read('tools/art/pictureRush.json'));
  assertEqual(spec.ids, ids, 'the art config lists the same pictures');
  const pack = read('docs/art/pictureRush-prompts.md');
  ids.forEach(function (id) { assert(pack.indexOf(id + ':') !== -1, id + ' is in the prompt pack'); });
});

test('picture rush: without photos the drawings stand in, and no theme is offered', function () {
  const P = load().PictureRush;
  assertEqual(P.photos('mix').length, 0);
  assert(P.drawings().length > 100, 'the old drawings');
  assertEqual(P.pool('food', 3), P.drawings(), 'a theme with no photos uses the drawings');
  assertEqual(P.readyThemes().length, 0);
  assert(P.fields().every(function (f) { return f.key !== 'theme'; }), 'no theme picker yet');
  const d = P.deal(P.STANDARD, Math.random);
  assertEqual(d.length, 3);
  assert(d.every(function (p) { return p.svg && p.name; }), 'drawings carry their svg');
});

test('picture rush: photos are used once their files exist, per theme', function () {
  let FF = load();
  FF = load(withPhotos(FF, ['animals', 'food']));
  const P = FF.PictureRush;
  assertEqual(P.photos('mix').length, 32);
  assertEqual(P.photos('food').length, 16);
  assertEqual(P.readyThemes().map(function (t) { return t.id; }), ['animals', 'food']);
  const theme = P.fields().filter(function (f) { return f.key === 'theme'; })[0];
  assertEqual(theme.options.map(function (o) { return o.value; }), ['mix', 'animals', 'food'], 'only themes with pictures');
  for (let k = 0; k < 20; k++) {
    const d = P.deal(P.sanitize({ theme: 'food', count: 5 }), Math.random);
    assertEqual(d.length, 5);
    assertEqual(new Set(d.map(function (p) { return p.id; })).size, 5, 'no picture twice');
    assert(d.every(function (p) { return p.theme === 'food' && !p.svg; }), 'food photos only');
  }
  assert(P.pool('nature', 3)[0].svg, 'a theme with no photos still falls back');
});

test('picture rush: every scramble is a full board with hardly a tile home', function () {
  const FF = load();
  const P = FF.PictureRush;
  const Rules = FF.PictureRushRules;
  [3, 4, 5, 6].forEach(function (g) {
    for (let k = 0; k < 20; k++) {
      P.deal(P.sanitize({ grid: g, count: 5 }), Math.random).forEach(function (p) {
        assertEqual(p.tiles.length, g * g);
        assertEqual(p.tiles.slice().sort(function (a, b) { return a - b; }), Array.from({ length: g * g }, function (_, i) { return i; }), 'each piece once');
        assert(!Rules.solved(p.tiles), 'never starts solved');
        assert(Rules.correct(p.tiles) <= (g <= 3 ? 1 : Math.floor(g / 2)), 'hardly any tile home');
      });
    }
  });
});

test('picture rush: the same seed deals the same pictures and scrambles', function () {
  const FF = load();
  const P = FF.PictureRush;
  const a = seeded(FF, 'daily|2026-11-25|pictureRush|init', function (r) { return JSON.stringify(P.deal(P.STANDARD, r)); });
  const b = seeded(FF, 'daily|2026-11-25|pictureRush|init', function (r) { return JSON.stringify(P.deal(P.STANDARD, r)); });
  const c = seeded(FF, 'daily|2026-11-26|pictureRush|init', function (r) { return JSON.stringify(P.deal(P.STANDARD, r)); });
  assertEqual(a, b);
  assert(a !== c, 'another day, another deal');
});

test('picture rush: points reward solving and speed, the same on every grid; peeks cost', function () {
  const P = load().PictureRush;
  const fast = P.points({ solved: true, usedMs: 20000, hints: 0 }, 4);
  const slow = P.points({ solved: true, usedMs: 100000, hints: 0 }, 4);
  const part = P.points({ solved: false, usedMs: 120000, correct: 10, startCorrect: 1 }, 4);
  assert(fast > slow && slow > part, 'fast > slow > unsolved');
  assertEqual(P.points({ solved: true, usedMs: 0 }, 4), 20, 'base 10 + all the speed bonus');
  assertEqual(P.points({ solved: true, usedMs: 120000 }, 4), 10, 'no time left: the base');
  assertEqual(P.points({ solved: true, usedMs: 0 }, 6), 20, '6×6 the same');
  assertEqual(P.points({ solved: true, usedMs: 0 }, 3), 20, '3×3 the same');
  assertEqual(P.points({ solved: true, usedMs: 0, hints: 2 }, 4), 16, 'each peek costs 2');
  assertEqual(P.points({ solved: true, usedMs: 0, hints: 2 }, 6), 16, 'peeks cost the same on every grid');
  assertEqual(P.points({ solved: false, correct: 1, startCorrect: 1, hints: 2 }, 4), 0, 'never below zero');
  assertEqual(P.points({ solved: false, correct: 8, startCorrect: 0 }, 4), 3, 'half the tiles home: half the partial points (2.5, rounded)');
  assertEqual(P.roomSeconds(P.STANDARD), 3 + 120 + 2, 'a room round has room for the look');
});

test('picture rush: listed for rooms, leaderboards and icons; Picture Puzzle is gone', function () {
  const FF = load();
  const def = FF.__defs.filter(function (d) { return d.id === 'pictureRush'; })[0];
  assert(def, 'registered');
  assertEqual(def.name, 'Picture Rush');
  assertEqual(def.category, 'visual');
  assert(def.room && def.room.sanitize, 'has room settings');
  assert(/'pictureRush'/.test(read('js/net/roomUI.js')), 'listed in ONLINE_GAMES');
  assert(/'pictureRush'/.test(read('api/lib/Crew.php')), 'in the online list');
  assert(/'pictureRush'/.test(read('api/lib/Leaderboards.php')), 'on the leaderboards');
  assert(/"pictureRush"/.test(read('js/icons.js')), 'has an icon');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach(function (f) {
    assert(read(f).indexOf('js/games/pictureRush.js') !== -1, f + ' loads the game');
    assert(read(f).indexOf('js/data/pictureRush.js') !== -1, f + ' loads the pictures');
  });
  assert(read('tools/gen-asset-manifest.js').indexOf("'games/pictureRush'") !== -1, 'the manifest lists its pictures');
  ['js/net/roomUI.js', 'api/lib/Crew.php', 'api/lib/Leaderboards.php', 'js/icons.js',
    'tools/download-assets.js', 'tools/verify.ps1'].forEach(function (f) {
    assert(read(f).indexOf('picturePuzzle') === -1, f + ' no longer mentions picturePuzzle');
  });
});

/* ---------------- One end screen, one settings screen ---------------- */

function loadI18n() {
  const FF = loadFF(['js/core.js', 'js/i18n.js'].concat(['js/data/visual.js', 'js/data/visual2.js', 'js/data/pictureRush.js', 'js/celebrate/pictureRush/rules.js']));
  FF.AssetManifest = typeof ALL === 'undefined' ? null : ALL;
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/pictureRush.js'), 'utf8'), FF.__sandbox, { filename: 'pictureRush.js' });
  return FF;
}

test('pictureRush: endSummary carries what the old results screen showed', function () {
  const FF = loadI18n();
  const G = FF.PictureRush;
  const cfg = G.sanitize(G.STANDARD);
  const one = function (id, name, n, total, pts, place) { return Object.assign({ who: { id: id, name: name }, place: place, points: pts }, { solved: n, count: total }); };
  const s = G.endSummary(cfg, [one('me', 'Ben', 3, 5, 40, 1)]);
  assertEqual([s.kicker, s.headline], [G.summary(cfg), '3 of 5 rebuilt']);
  assertEqual(s.stats.map(function (x) { return x.label + '=' + x.value; }), ['Rebuilt=3/5']);
  assertEqual(G.endSummary(cfg, [one('me', 'Ben', 5, 5, 60, 1)]).headline, 'Every picture rebuilt!');
  const m = G.endSummary(cfg, [one('a', 'Amy', 5, 5, 60, 1), one('b', 'Ben', 3, 5, 40, 2)]);
  assertEqual([m.headline, m.lines.b], ['Amy wins!', '3 of 5 rebuilt']);
});

test('pictureRush: has its own setup and replays the saved one', function () {
  const FF = loadI18n();
  assertEqual(FF.__defs[0].setup, true);
  let seen = null;
  FF.GameUI = Object.assign({}, FF.GameUI || {}, { setupOrReplay: function (a, o) { seen = o; } });
  FF.__defs[0].start({ config: {}, shell: {} });
  assertEqual([seen && seen.key, seen && seen.sanitize === FF.PictureRush.sanitize], ['pictureRush:setup', true]);
});
