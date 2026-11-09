'use strict';
/* Logo Rush: the brand list (js/data/logos.js) — categories, tiers, aliases that never
   clash, facts — the logo files and their sources, the pure rules (js/logorush/rules.js)
   and the game's registration. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const DATA = ['js/core.js', 'js/answerMatch.js', 'js/data/logos.js'];
let cached = null;
const data = () => cached || (cached = loadFF(DATA));

const CATS = ['tech', 'social', 'food', 'fashion', 'cars', 'shops', 'fun', 'travel', 'money', 'football'];

/* ---------- data ---------- */

test('logos data: ids unique and lowercase a-z0-9', function () {
  const brands = data().data.logos.brands;
  const seen = {};
  brands.forEach((b) => {
    assert(/^[a-z0-9]+$/.test(b.id), 'bad id ' + b.id);
    assert(!seen[b.id], 'duplicate id ' + b.id);
    seen[b.id] = true;
  });
});

test('logos data: every brand has a known category and a tier of 1 to 3', function () {
  const L = data().data.logos;
  assertEqual(L.categories.map((c) => c.id).join(','), CATS.join(','));
  L.brands.forEach((b) => {
    assert(CATS.indexOf(b.cat) !== -1, b.id + ' has category ' + b.cat);
    assert(b.tier === 1 || b.tier === 2 || b.tier === 3, b.id + ' has tier ' + b.tier);
    assert(typeof b.name === 'string' && b.name.length > 0, b.id + ' has no name');
    assert(b.bg === 'light' || b.bg === 'dark', b.id + ' has backdrop ' + b.bg);
    assert(Array.isArray(b.aliases) && Array.isArray(b.alike), b.id + ' lists');
  });
});

test('logos data: coverage of categories, African brands and football clubs', function () {
  const brands = data().data.logos.brands;
  assert(brands.length >= 300, 'only ' + brands.length + ' brands');
  CATS.forEach((c) => {
    const inCat = brands.filter((b) => b.cat === c);
    assert(inCat.length >= 15, c + ' has ' + inCat.length);
    const easy = inCat.filter((b) => b.tier === 1).length;
    const need = c === 'football' || c === 'money' ? 4 : 6;
    assert(easy >= need, c + ' has ' + easy + ' tier-1 brands');
  });
  assert(brands.filter((b) => b.africa).length >= 40, 'African brands');
  assert(brands.filter((b) => b.cat === 'football').length >= 40, 'football clubs');
});

test('logos data: facts are one short line, end with a full stop, and are unique', function () {
  const brands = data().data.logos.brands;
  const seen = {};
  brands.forEach((b) => {
    assert(b.fact && b.fact.length <= 110, b.id + ' fact length ' + (b.fact || '').length);
    assert(/\.$/.test(b.fact), b.id + ' fact ends without a full stop');
    assert(!seen[b.fact], b.id + ' repeats a fact');
    seen[b.fact] = true;
  });
});

test('logos data: every name and alias identifies only its own brand', function () {
  const FF = data();
  const brands = FF.data.logos.brands;
  const m = FF.AnswerMatch.create({ answers: brands.map((b) => ({ id: b.id, names: [b.name].concat(b.aliases) })) });
  brands.forEach((b) => {
    [b.name].concat(b.aliases).forEach((n) => {
      assertEqual(m.identify(n), b.id, '"' + n + '" should identify ' + b.id);
    });
  });
});

test('logos data: alike ids exist and are never the brand itself', function () {
  const brands = data().data.logos.brands;
  const ids = {};
  brands.forEach((b) => { ids[b.id] = true; });
  brands.forEach((b) => b.alike.forEach((a) => {
    assert(ids[a], b.id + ' lists unknown alike ' + a);
    assert(a !== b.id, b.id + ' lists itself');
  }));
});

test('logos data: names with marks keep them', function () {
  const byId = {};
  data().data.logos.brands.forEach((b) => { byId[b.id] = b; });
  assertEqual(byId.cocacola.name, 'Coca-Cola');
  assertEqual(byId.mcdonalds.name, 'McDonald’s');
  assertEqual(byId.seven11.name, '7-Eleven');
  assertEqual(byId.hm.name, 'H&M');
  assertEqual(byId.nestle.name, 'Nestlé');
});

/* ---------- logo files ---------- */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'assets', 'images', 'games', 'logoRush');
const CAP = { symbol: 60 * 1024, full: 120 * 1024 };
const files = () => loadFF(DATA.concat(['js/data/logoFiles.js'])).data;

test('logo files: every brand has a symbol file or a crop, and the map matches the disk', function () {
  const d = files();
  d.logos.brands.forEach((b) => {
    const f = d.logoFiles[b.id];
    assert(f, b.id + ' is missing from logoFiles.js');
    assert(f[0] || (b.crop && f[1]), b.id + ' has no symbol and no crop');
    if (f[0]) assert(fs.existsSync(path.join(DIR, b.id + '.' + f[0])), b.id + '.' + f[0] + ' not on disk');
    if (f[1]) assert(fs.existsSync(path.join(DIR, b.id + '-full.' + f[1])), b.id + '-full.' + f[1] + ' not on disk');
  });
});

test('logo files: SVGs are clean, symbols hold no text, and sizes stay under the caps', function () {
  const d = files();
  d.logos.brands.forEach((b) => {
    const f = d.logoFiles[b.id];
    [[f[0], b.id, 'symbol'], [f[1], b.id + '-full', 'full']].forEach(([ext, name, kind]) => {
      if (!ext) return;
      const p = path.join(DIR, name + '.' + ext);
      const size = fs.statSync(p).size;
      assert(size <= CAP[kind], name + ' is ' + size + ' bytes');
      if (ext !== 'svg') return;
      const s = fs.readFileSync(p, 'utf8');
      assert(!/<script|<foreignObject|\son\w+\s*=|href\s*=\s*["']https?:/i.test(s), name + ' has unsafe markup');
      assert(/viewBox=/.test(s), name + ' has no viewBox');
      if (kind === 'symbol') assert(!/<text[\s>]/i.test(s), name + ' has text in the symbol');
    });
  });
});

test('logo files: sources.json names a source and licence for every file', function () {
  const d = files();
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'logos', 'sources.json'), 'utf8'));
  d.logos.brands.forEach((b) => {
    const f = d.logoFiles[b.id];
    if (f[0]) assert(src[b.id] && src[b.id].symbol && src[b.id].symbol.url && src[b.id].symbol.licence, b.id + ' symbol source');
    if (f[1]) assert(src[b.id] && src[b.id].full && src[b.id].full.url && src[b.id].full.licence, b.id + ' full source');
  });
});

test('logo cleaner: strips scripts, event handlers, foreignObject and outside links', function () {
  const { cleanSvg } = require('../logos/clean.js');
  const dirty = '<?xml version="1.0"?><!-- made in X --><svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="evil()">' +
    '<metadata>m</metadata><script>alert(1)</script><foreignObject><p>x</p></foreignObject>' +
    '<image href="https://example.com/x.png"/><a href="https://example.com"><path d="M0 0h10v10z"/></a></svg>';
  const out = cleanSvg(dirty);
  assert(!/script|onload|foreignObject|metadata|example\.com|<!--/i.test(out.svg), out.svg);
  assert(/viewBox="0 0 40 20"/.test(out.svg), 'viewBox added from width and height: ' + out.svg);
  assert(/<path d="M0 0h10v10z"\/>/.test(out.svg), 'keeps the drawing');
});

/* ---------- rules ---------- */

const RULES = DATA.concat(['js/spellTiles.js', 'js/logorush/rules.js']);
let rulesCached = null;
const rules = () => rulesCached || (rulesCached = loadFF(RULES));
const R = () => rules().LogoRushRules;

test('rules: sanitize falls back to the standard settings', function () {
  const r = R();
  const s = r.sanitize({ level: 'master', cats: ['cars', 'nope', 'cars'], mode: 'shout', time: 'forever', twist: 'spin', rounds: 7 });
  assertEqual(s.level, 'normal');
  assertEqual(JSON.stringify(s.cats), '["cars"]');
  assertEqual(s.mode, 'tiles');
  assertEqual(s.time, 'normal');
  assertEqual(s.twist, 'none');
  assertEqual(s.rounds, 10);
  assertEqual(r.sanitize({ cats: [] }).cats, 'mixed');
  assertEqual(r.sanitize({ cats: 'mixed' }).cats, 'mixed');
  assertEqual(JSON.stringify(r.sanitize({ cats: ['money', 'africa', 'cars'] }).cats), '["africa","cars","money"]');
  assert(r.isStandard(r.STANDARD), 'STANDARD is standard');
  assert(!r.isStandard({ mode: 'choice' }), 'choice is not standard');
  assert(r.isStandard(Object.assign({}, r.STANDARD, { rounds: 20 })), 'rounds do not matter');
});

test('rules: rooms never say it out loud and never run without a clock', function () {
  const s = R().sanitizeRoom({ mode: 'say', time: 'none' });
  assertEqual(s.mode, 'tiles');
  assertEqual(s.time, 'normal');
  assertEqual(R().sanitizeRoom({ mode: 'choice' }).mode, 'choice');
});

test('rules: the deal is seeded, varied and never repeats a brand before the pool runs out', function () {
  const r = R();
  const s = r.sanitize({});
  assertEqual(JSON.stringify(r.deal(s, 'seed-1', 10)), JSON.stringify(r.deal(s, 'seed-1', 10)));
  const firsts = {};
  for (let i = 0; i < 50; i++) firsts[r.deal(s, 'x' + i, 10)[0]] = 1;
  assert(Object.keys(firsts).length >= 20, 'only ' + Object.keys(firsts).length + ' different first brands');
  const ids = r.deal(s, 'seed-2', 20);
  assertEqual(new Set(ids).size, 20);
  r.pool(s).forEach((b) => assert(b.tier <= 2, b.id + ' is tier ' + b.tier + ' on Normal'));
});

test('rules: a small pool widens and still deals enough different answers', function () {
  const r = R();
  const s = r.sanitize({ cats: ['football'], level: 'easy', rounds: 20, mode: 'choice' });
  const pool = r.pool(s);
  assert(pool.length >= r.MIN_POOL * 2, 'pool of ' + pool.length);
  const ids = r.deal(s, 'small', 20);
  assertEqual(ids.length, 20);
  assertEqual(new Set(ids.slice(0, Math.min(20, pool.length))).size, Math.min(20, pool.length));
  for (let k = 0; k < 20; k++) {
    const round = r.roundAt(s, 'small', k, ids);
    assertEqual(round.choices.length, r.CHOICES.easy);
    const names = round.choices.map((id) => r.brand(id).name);
    assertEqual(new Set(names).size, names.length);
    assertEqual(round.choices.filter((id) => id === round.id).length, 1);
  }
});

test('rules: African brands filter and categories mix', function () {
  const r = R();
  const af = r.pool(r.sanitize({ cats: ['africa'], level: 'hard' }));
  assert(af.length >= 1 && af.every((b) => b.africa), 'africa pool (few until name logos get crops)');
  const two = r.pool(r.sanitize({ cats: ['cars', 'food'], level: 'hard' }));
  assert(two.every((b) => b.cat === 'cars' || b.cat === 'food'), 'two categories');
  const ids = r.deal(r.sanitize({ cats: ['cars', 'food'], level: 'hard' }), 'mix', 10);
  const cats = ids.map((id) => r.brand(id).cat);
  assert(cats.indexOf('cars') !== -1 && cats.indexOf('food') !== -1, 'both categories dealt: ' + cats.join(','));
});

test('rules: the same seed gives the same round on two devices', function () {
  const a = loadFF(RULES).LogoRushRules;
  const b = loadFF(RULES).LogoRushRules;
  ['tiles', 'choice'].forEach((mode) => {
    const s = { mode, twist: 'zoom' };
    assertEqual(JSON.stringify(a.roundAt(s, 'abc', 3)), JSON.stringify(b.roundAt(s, 'abc', 3)));
  });
});

test('rules: every brand can be spelled from its own tiles, with marks laid out', function () {
  const r = R();
  rules().data.logos.brands.forEach((b, i) => {
    const t = r.tilesFor(b.id, 'hard', r.rng('t' + i));
    const have = {};
    t.tiles.forEach((ch) => { have[ch] = (have[ch] || 0) + 1; });
    t.letters.forEach((ch) => { assert(have[ch] > 0, b.id + ' is missing a ' + ch); have[ch]--; });
    assert(t.letters.length >= 1, b.id + ' has nothing to spell');
  });
  const cc = r.tilesFor('cocacola', 'normal', r.rng(1));
  assert(cc.cells.some((c) => c.fixed && c.ch === '-'), 'Coca-Cola keeps its hyphen');
  const hm = r.tilesFor('hm', 'normal', r.rng(1));
  assert(hm.cells.some((c) => c.fixed && c.ch === '&'), 'H&M keeps its ampersand');
  const s7 = r.tilesFor('seven11', 'normal', r.rng(1));
  assertEqual(s7.letters.join(''), '7ELEVEN');
});

test('rules: very long names are spelled by a shorter accepted name', function () {
  const r = R();
  assertEqual(r.target('saa'), 'South African Airways');   // 19 letters, no 5-14 letter alias
  assertEqual(r.target('cocacola'), 'Coca-Cola');
  assertEqual(r.target('manutd'), 'Manchester United');     // 16 letters: not over the limit
});

test('rules: typed names forgive small slips but never accept another brand', function () {
  const r = R();
  assert(r.check('mcdonalds', 'mcdonalds').ok, 'mcdonalds');
  assert(r.check('nestle', 'nestle').ok, 'nestle');
  assert(r.check('coca cola', 'cocacola').ok, 'coca cola');
  assert(r.check('Addidas', 'adidas').ok, 'one slip');
  const pepsi = r.check('Pepsi', 'koreanair');
  assert(!pepsi.ok && pepsi.near === 'Pepsi', JSON.stringify(pepsi));
  assert(!r.check('Man United', 'mancity').ok, 'Man United is not City');
  assert(!r.check('Intel', 'inter').ok, 'Intel is not Inter');
  assert(!r.check('', 'nike').ok, 'empty');
});

test('rules: choices hold the answer once, no repeated names, and Hard offers a look-alike', function () {
  const r = R();
  let alikeSeen = 0;
  for (let i = 0; i < 40; i++) {
    const c = r.choices('pepsi', 'hard', r.rng('c' + i));
    assertEqual(c.length, r.CHOICES.hard);
    assertEqual(c.filter((x) => x === 'pepsi').length, 1);
    if (c.indexOf('cocacola') !== -1 || c.indexOf('koreanair') !== -1) alikeSeen++;
  }
  assertEqual(alikeSeen, 40);
  const round = { id: 'pepsi', choices: ['pepsi', 'cocacola'] };
  assert(r.checkChoice(round, 'pepsi').ok, 'right pick');
  const wrong = r.checkChoice(round, 'cocacola');
  assert(!wrong.ok && wrong.near === 'Coca-Cola', JSON.stringify(wrong));
  assert(!r.checkChoice(round, 'nike').ok, 'not on the list');
});

test('rules: seconds follow the answer style and the time setting', function () {
  const r = R();
  assertEqual(r.secondsFor({ mode: 'choice', time: 'quick' }), 5);
  assertEqual(r.secondsFor({ mode: 'choice' }), 8);
  assertEqual(r.secondsFor({ mode: 'tiles' }), 20);
  assertEqual(r.secondsFor({ mode: 'type', time: 'relaxed' }), 36);
  assertEqual(r.secondsFor({ mode: 'say', time: 'quick' }), 5);
  assertEqual(r.secondsFor({ mode: 'tiles', time: 'none' }), null);
});

test('rules: points reward level, speed, typing and twists', function () {
  const r = R();
  const p = (o) => r.points(Object.assign({ ok: true, ms: 2000, secs: 20, mode: 'tiles', twist: 'none', level: 'normal' }, o)).total;
  assertEqual(r.points({ ok: false, level: 'hard', ms: 0, secs: 20 }).total, 0);
  assert(p({ level: 'hard' }) > p({ level: 'normal' }) && p({ level: 'normal' }) > p({ level: 'easy' }), 'level order');
  assertEqual(p({ ms: 0 }), 250);
  assertEqual(p({ ms: 20000 }), 200);
  assertEqual(p({ mode: 'type', ms: 20000 }) - p({ ms: 20000 }), 50);
  assertEqual(p({ twist: 'flash', ms: 20000 }) - p({ ms: 20000 }), 25);
  assertEqual(p({ twist: 'grey', ms: 20000 }) - p({ ms: 20000 }), 25);
  assertEqual(p({ twist: 'zoom', ms: 0 }), 300);
  assertEqual(r.points({ ok: true, level: 'normal', ms: 5000, secs: null }).speed, 0);
});

test('rules: nextUnused swaps in a brand nobody has seen this game', function () {
  const r = R();
  const s = r.sanitize({ cats: ['social'], level: 'easy' });
  const pool = r.pool(s).map((b) => b.id);
  const dealt = pool.slice(0, 3);
  const next = r.nextUnused(s, dealt, [pool[3]]);
  assert(next && dealt.indexOf(next) === -1 && next !== pool[3], 'got ' + next);
  assertEqual(r.nextUnused(s, pool, []), null);
});

test('rules: rounds carry what the twists need', function () {
  const r = R();
  const z = r.roundAt({ twist: 'zoom' }, 'z', 0);
  assert(z.zoom && z.zoom.x >= 25 && z.zoom.x <= 75 && z.zoom.y >= 25 && z.zoom.y <= 75, JSON.stringify(z.zoom));
  assertEqual(r.roundAt({ twist: 'flash' }, 'z', 0).flashMs, r.FLASH_MS);
  assertEqual(r.roundAt({}, 'z', 0).zoom, null);
  const t = r.roundAt({ mode: 'tiles' }, 'z', 0);
  assert(t.tiles.length >= t.letters.length && !t.choices, 'tiles round');
});

test('rules: brands whose symbol shows their name are never dealt until they have a crop', function () {
  const r = R();
  const brands = rules().data.logos.brands;
  const named = brands.filter((b) => b.named);
  assert(named.length > 0 && named.length < brands.length, named.length + ' hidden');
  ['mixed', ['food'], ['football'], ['africa']].forEach((cats) => ['easy', 'normal', 'hard'].forEach((level) => {
    const cfg = r.sanitize({ cats, level });
    r.pool(cfg).forEach((b) => assert(!b.named || b.crop, b.id + ' is dealt but shows its name'));
    r.deal(cfg, 'n' + level, 20).forEach((id) => assert(!r.brand(id).named, id + ' dealt'));
  }));
  assert(r.brand('cocacola') && r.check('coca cola', 'cocacola').ok, 'hidden brands stay known by name');
});

/* ---------- the screen ---------- */

test('logoPath: every playable brand has a symbol on disk, and the reveal a file too', function () {
  const FF = loadFF(RULES.concat(['js/data/logoFiles.js']));
  const r = FF.LogoRushRules;
  FF.data.logos.brands.filter((b) => !b.named || b.crop).forEach((b) => {
    const sym = r.logoPath(b.id, false);
    const full = r.logoPath(b.id, true);
    assert(sym && fs.existsSync(path.join(ROOT, sym)), b.id + ' symbol ' + sym);
    assert(full && fs.existsSync(path.join(ROOT, full)), b.id + ' reveal ' + full);
    assert(sym.indexOf('-full.') === -1 || b.crop, b.id + ' plays its full logo');
  });
  assertEqual(r.logoPath('nosuchbrand', false), '');
});

test('logoRush registered: solo, turns and everyone, on the leaderboards, listed everywhere', function () {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const src = read('js/games/logoRush.js');
  assert(/id:\s*'logoRush'/.test(src), 'registered');
  assert(/modes:\s*\['solo', 'turn', 'everyone'\]/.test(src), 'modes');
  assert(/leaderboard:\s*true/.test(src), 'on the leaderboards');
  assert(/'logoRush'/.test(read('api/lib/Leaderboards.php')), 'the server leaderboard list');
  assert(/'logoRush'/.test(read('js/net/roomUI.js')), 'listed in ONLINE_GAMES');
  assert(/"logoRush"/.test(read('js/icons.js')), 'has an icon');
  assert(/"logoRush"/.test(read('js/data/assetManifest.js')), 'has a cover');
  assert(/Brand logos/.test(read('js/app.js')), 'credits line');
  assert(/Logo Rush/.test(read('docs/expert-levels.md')), 'expert levels list');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const s = read(f);
    const order = ['js/spellTiles.js', 'js/games/geoSpin.js', 'js/data/logos.js', 'js/data/logoFiles.js', 'js/logorush/rules.js', 'js/logorush/client.js', 'js/games/logoRush.js'];
    let at = -1;
    order.forEach((js) => {
      const i = s.indexOf(js);
      assert(i !== -1, f + ' loads ' + js);
      assert(i > at, f + ': ' + js + ' in order');
      at = i;
    });
    assert(s.indexOf('js/logorush/dev.js') === -1, f + ' never loads the dev referee');
  });
});

test('geoSpin boards serve Logo Rush: brand names in the list, digits on tiles, answers shown online', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/geoSpin.js'), 'utf8');
  assert(/opts\.nameOf \? \{ name: opts\.nameOf\(code\) \}/.test(src), 'choiceBoard nameOf');
  assert(/\/\^\[a-z0-9\]\$\/i/.test(src), 'letter keys take digits');
  assert(/finish: function \(correct, wants\)/.test(src), 'finish takes the right letters');
  ['soundButtons', 'timerRing', 'glyph', 'chip', 'levelChip', 'countUp'].forEach((k) => assert(new RegExp(k + ': ' + k).test(src), 'exports ' + k));
});

test('logoRush screen: category buttons only show groups with enough logos, and cover every category', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/logoRush.js'), 'utf8');
  const groups = src.match(/var GROUPS = \[([\s\S]*?)\];/)[1];
  const cats = (groups.match(/cats: \[([^\]]*)\]/g) || []).join(',').match(/'([a-z]+)'/g).map((s) => s.replace(/'/g, ''));
  CATS.concat(['africa']).forEach((c) => assert(cats.indexOf(c) !== -1, c + ' has a button'));
  assertEqual(cats.length, CATS.length + 1, 'each category on one button');
});
