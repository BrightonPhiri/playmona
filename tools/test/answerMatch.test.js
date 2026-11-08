'use strict';
/* Typed answers (js/answerMatch.js) and Guess the Country's Expert level:
   small spelling mistakes pass, other countries never do. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/answerMatch.js', 'js/data/worldFlags.js']);
FF.registerGame = function () {};
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/guessCountry.js'), 'utf8'), FF.__sandbox, { filename: 'guessCountry.js' });
const M = FF.AnswerMatch;
const G = FF.GuessCountry;
const ALL = FF.data.worldFlags.countries;
function country(code) { return ALL.filter(function (c) { return c.code === code; })[0]; }
function typed(guess, code) { return G.checkTyped(guess, country(code), ALL); }

test('answer match: case, accents, spaces, punctuation and "the" never matter', function () {
  assertEqual(M.normalise('  The Gambia '), 'gambia');
  assertEqual(M.normalise('São Tomé & Príncipe'), 'saotomeandprincipe');
  assertEqual(M.normalise('Saint Lucia'), M.normalise('St. Lucia'));
  assertEqual(M.normalise('Guinea-Bissau'), 'guineabissau');
});

test('answer match: edit distance counts swaps as one mistake', function () {
  assertEqual(M.distance('zimbabwe', 'zimbbwe'), 1);
  assertEqual(M.distance('russia', 'rusia'), 1);
  assertEqual(M.distance('kenya', 'keyna'), 1, 'two letters swapped');
  assertEqual(M.distance('abc', 'abc'), 0);
  assertEqual(M.distance('', 'abc'), 3);
});

test('expert: small spelling mistakes pass', function () {
  [['zimbbwe', 'zw'], ['RuSia', 'ru'], ['Keyna', 'ke'], ['Phillipines', 'ph'], ['Columbia', 'co'],
   ['Argentinia', 'ar'], ['Madagaskar', 'mg'], ['Kazakstan', 'kz'], ['Switzerlnd', 'ch'], ['Portugul', 'pt'],
   ['Saudi Arbia', 'sa'], ['new zeland', 'nz'], ['Lichtenstein', 'li'], ['Azerbajan', 'az']].forEach(function (p) {
    assert(typed(p[0], p[1]).ok, p[0] + ' is accepted for ' + country(p[1]).name);
  });
  const r = typed('zimbbwe', 'zw');
  assert(!r.exact, 'and marked as not quite spelt right');
  assert(typed('Zimbabwe', 'zw').exact, 'the right spelling is exact');
});

test('expert: other names people use pass', function () {
  [['USA', 'us'], ['America', 'us'], ['UK', 'gb'], ['Great Britain', 'gb'], ['Holland', 'nl'], ['Burma', 'mm'],
   ['Ivory coast', 'ci'], ['Cote d Ivoire', 'ci'], ['Czech Republic', 'cz'], ['DRC', 'cd'], ['Swaziland', 'sz'],
   ['East Timor', 'tl'], ['Cape Verde', 'cv'], ['UAE', 'ae'], ['St Kitts and Nevis', 'kn'], ['Turkiye', 'tr'],
   ['Sao Tome and Principe', 'st'], ['the bahamas', 'bs']].forEach(function (p) {
    assert(typed(p[0], p[1]).ok, p[0] + ' is accepted for ' + country(p[1]).name);
  });
});

test('expert: another country, or a guess as close to one, never passes', function () {
  [['Iraq', 'ir'], ['Iran', 'iq'], ['Niger', 'ng'], ['Nigeria', 'ne'], ['Austria', 'au'], ['Australia', 'at'],
   ['Slovenia', 'sk'], ['Slovakia', 'si'], ['Gambia', 'zm'], ['Zambia', 'gm'], ['Mali', 'mw'], ['Malawi', 'ml'],
   ['Guinea', 'gw'], ['Guyana', 'gn'], ['Dominica', 'do'], ['Korea', 'kp'], ['Congo', 'cd'], ['Sudan', 'ss'],
   ['Iram', 'ir'], ['Romania', 'td'], ['Monaco', 'id'], ['Latvia', 'lt']].forEach(function (p) {
    assert(!typed(p[0], p[1]).ok, p[0] + ' is not accepted for ' + country(p[1]).name);
  });
  assertEqual(typed('Nigeria', 'ne').near, 'Nigeria', 'and says which country it was closer to');
});

test('expert: nonsense and empty answers fail', function () {
  assert(!typed('xyz', 'zw').ok, 'nonsense');
  assert(!typed('Zim', 'zw').ok, 'too short to be the name');
  assert(typed('   ', 'zw').empty, 'blank is empty, not wrong');
  assert(typed('Chad', 'td').ok, 'a short name typed right passes');
  assert(typed('Chda', 'td').ok, 'a four-letter name forgives one slip when nothing else is as close');
  assert(typed('Cahd', 'td').ok, 'a swap is one slip');
  assert(!typed('Chhda', 'td').ok, 'two slips are too many for four letters');
  assert(typed('Pru', 'pe').ok, 'one missing letter is one slip');
  assert(!typed('Pr', 'pe').ok, 'two missing letters are too many');
});

test('expert: every country can be typed exactly, and no two names clash', function () {
  ALL.forEach(function (c) {
    assert(typed(c.name, c.code).ok, c.name + ' typed exactly passes');
    (c.aka || []).forEach(function (a) { assert(typed(a, c.code).ok, a + ' passes for ' + c.name); });
  });
  const seen = {};
  ALL.forEach(function (c) {
    [c.name].concat(c.aka || []).forEach(function (n) {
      const k = M.normalise(n);
      assert(!seen[k] || seen[k] === c.code, n + ' is not also another country');
      seen[k] = c.code;
    });
  });
});

test('expert: every flag, extra time to type and a bonus', function () {
  assertEqual(G.pool(ALL, { level: 'expert' }).length, ALL.length, 'every country');
  assertEqual(G.secondsFor({ level: 'expert', time: 8 }), 8 + G.TYPE_EXTRA_SECS);
  assertEqual(G.secondsFor({ level: 'normal', time: 8 }), 8);
  assertEqual(G.secondsFor({ level: 'expert', time: 0 }), 0, 'no limit stays no limit');
  assertEqual(G.points(true, 0, 14, false, true), 250, 'typed instantly');
  assert(!G.isStandard({ level: 'expert' }), 'Expert is not the ranked standard');
  const deck = G.deal(ALL, { level: 'expert' }, G.rng(5), 10);
  deck.forEach(function (q) { assertEqual(q.options[q.answer], q.name, q.code + ' keeps its answer'); });
});
