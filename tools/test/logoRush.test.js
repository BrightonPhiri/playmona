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
