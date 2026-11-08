'use strict';
/* Typed and spelled answers (js/answerMatch.js), the country aliases
   (js/data/countryAliases.js) and Guess the Country's Expert tiles:
   small spelling mistakes pass, other answers never do. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/answerMatch.js', 'js/data/worldFlags.js', 'js/data/countryAliases.js']);
FF.registerGame = function () {};
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/guessCountry.js'), 'utf8'), FF.__sandbox, { filename: 'guessCountry.js' });
const M = FF.AnswerMatch;
const G = FF.GuessCountry;
const ALL = FF.data.worldFlags.countries;
const ALIASES = FF.data.countryAliases;
function country(code) { return ALL.filter(function (c) { return c.code === code; })[0]; }
function typed(guess, code) { return G.checkTyped(guess, country(code), ALL); }
function names(c) { return [c.name].concat(ALIASES[c.code] || []); }

/* ---- the shared checker ---- */

test('answer match: case, accents, spaces, punctuation and "the" never matter', function () {
  assertEqual(M.normalise('  The Gambia '), 'gambia');
  assertEqual(M.normalise('São Tomé & Príncipe'), 'saotomeandprincipe');
  assertEqual(M.normalise('Saint Lucia'), M.normalise('St. Lucia'));
  assertEqual(M.normalise('Guinea-Bissau'), 'guineabissau');
  assertEqual(M.normalise('U.S.A.'), 'usa');
  assertEqual(M.normalise('Côte d’Ivoire'), 'cotedivoire');
});

test('answer match: a missing, extra, changed or swapped letter is one mistake', function () {
  assertEqual(M.distance('zimbabwe', 'zimbbwe'), 1, 'missing');
  assertEqual(M.distance('russia', 'russiaa'), 1, 'extra');
  assertEqual(M.distance('russia', 'rassia'), 1, 'changed');
  assertEqual(M.distance('kenya', 'keyna'), 1, 'swapped');
  assertEqual(M.distance('abc', 'abc'), 0);
  assertEqual(M.distance('', 'abc'), 3);
});

test('answer match: mistakes allowed grow with the length of the answer', function () {
  assertEqual(M.tolerance(3), 0); assertEqual(M.tolerance(4), 0);
  assertEqual(M.tolerance(5), 1); assertEqual(M.tolerance(8), 1);
  assertEqual(M.tolerance(9), 2); assertEqual(M.tolerance(12), 2);
  assertEqual(M.tolerance(13), 3); assertEqual(M.tolerance(30), 3);
  assertEqual(M.tolerance(6, [[10, 4]]), 4, 'a game can set its own table');
});

test('answer match: letters typed twice by accident are forgiven', function () {
  assert(M.check('Russsssia', ['Russia'], []).ok, 'a long run of one letter');
  assert(M.check('Zimbabbwee', ['Zimbabwe'], []).ok, 'two doubled letters still pass');
  assert(!M.check('Zimbabbwee', ['Zimbabwe'], [], { repeats: false }).ok, 'unless the game turns that off');
});

test('answer match: a list checker identifies only one answer', function () {
  const k = M.create({ answers: [{ id: 'a', names: ['Austria'] }, { id: 'b', names: ['Australia'] }, { id: 'c', names: ['Chile', 'Chilli'] }] });
  assertEqual(k.identify('austira'), 'a');
  assertEqual(k.identify('Australa'), 'b');
  assertEqual(k.identify('banana'), null);
  assertEqual(k.identify(''), null);
  assertEqual(k.names('c').join(','), 'Chile,Chilli');
  assert(k.check('Chilli', 'c').exact, 'any accepted name is exact');
  assert(!k.check('Austria', 'b').ok, 'another answer never passes');
});

test('answer match: works on the server, through the crew runner', function () {
  const loader = require(path.join(ROOT, 'api/crew/lib/loader.js'));
  assert(loader.FILES.indexOf('js/answerMatch.js') >= 0, 'the runner loads the checker');
  assert(loader.FILES.indexOf('js/data/countryAliases.js') >= 0, 'and the aliases');
  const S = loader.load();
  const k = S.AnswerMatch.create({ answers: S.data.worldFlags.countries.map(function (c) { return { id: c.code, names: [c.name].concat(S.data.countryAliases[c.code] || []) }; }) });
  assert(k.check('Holand', 'nl').ok, 'the server reads Holand as Holland');
  assertEqual(k.identify('USA'), 'us');
  assert(!k.check('Iraq', 'ir').ok, 'and never accepts another country');
});

/* ---- countries ---- */

test('expert: small spelling mistakes pass', function () {
  [['zimbbwe', 'zw'], ['RuSia', 'ru'], ['Keyna', 'ke'], ['Phillipines', 'ph'], ['Columbia', 'co'],
   ['Argentinia', 'ar'], ['Madagaskar', 'mg'], ['Kazakstan', 'kz'], ['Switzerlnd', 'ch'], ['Portugul', 'pt'],
   ['Saudi Arbia', 'sa'], ['new zeland', 'nz'], ['Lichtenstein', 'li'], ['Azerbajan', 'az'],
   ['Holand', 'nl'], ['Amercia', 'us'], ['Britian', 'gb']].forEach(function (p) {
    assert(typed(p[0], p[1]).ok, p[0] + ' is accepted for ' + country(p[1]).name);
  });
  const r = typed('zimbbwe', 'zw');
  assert(!r.exact, 'and marked as not quite spelt right');
  assertEqual(r.matched, 'Zimbabwe');
  assert(typed('Zimbabwe', 'zw').exact, 'the right spelling is exact');
});

test('expert: other names people use pass', function () {
  [['USA', 'us'], ['America', 'us'], ['UK', 'gb'], ['Britain', 'gb'], ['Great Britain', 'gb'], ['Holland', 'nl'],
   ['Burma', 'mm'], ['Ivory coast', 'ci'], ['Cote d Ivoire', 'ci'], ['Czech Republic', 'cz'], ['DRC', 'cd'],
   ['Swaziland', 'sz'], ['East Timor', 'tl'], ['Cape Verde', 'cv'], ['UAE', 'ae'], ['St Kitts and Nevis', 'kn'],
   ['Turkiye', 'tr'], ['Sao Tome and Principe', 'st'], ['the bahamas', 'bs'], ['U.S.A.', 'us']].forEach(function (p) {
    assert(typed(p[0], p[1]).ok, p[0] + ' is accepted for ' + country(p[1]).name);
  });
  assertEqual(typed('Holland', 'nl').matched, 'Holland', 'says which name it read');
});

test('expert: another country, or a guess as close to one, never passes', function () {
  [['Iraq', 'ir'], ['Iran', 'iq'], ['Niger', 'ng'], ['Nigeria', 'ne'], ['Austria', 'au'], ['Australia', 'at'],
   ['Slovenia', 'sk'], ['Slovakia', 'si'], ['Gambia', 'zm'], ['Zambia', 'gm'], ['Mali', 'mw'], ['Malawi', 'ml'],
   ['Guinea', 'gw'], ['Guyana', 'gn'], ['Dominica', 'do'], ['Korea', 'kp'], ['Congo', 'cd'], ['Sudan', 'ss'],
   ['Iram', 'ir'], ['Romania', 'td'], ['Monaco', 'id'], ['Latvia', 'lt'], ['USA', 'gb'], ['Holland', 'be']].forEach(function (p) {
    assert(!typed(p[0], p[1]).ok, p[0] + ' is not accepted for ' + country(p[1]).name);
  });
  assertEqual(typed('Nigeria', 'ne').near, 'Nigeria', 'and says which country it was closer to');
});

test('expert: short answers must be spelled exactly', function () {
  assert(typed('Chad', 'td').ok, 'a short name spelled right passes');
  assert(typed('chad', 'td').exact, 'in any case');
  assert(!typed('Chda', 'td').ok, 'four letters allow no slip');
  assert(!typed('Pru', 'pe').ok, 'nor a missing letter');
  assert(typed('Peru', 'pe').ok);
  assert(typed('Cuba', 'cu').ok);
  assert(!typed('Cuab', 'cu').ok);
  assert(!typed('US', 'gb').ok);
  assert(typed('US', 'us').ok, 'a two-letter alias spelled exactly');
});

test('expert: nonsense and empty answers fail', function () {
  assert(!typed('xyz', 'zw').ok, 'nonsense');
  assert(!typed('Zim', 'zw').ok, 'too short to be the name');
  assert(!typed('Zimbabwe Republic', 'zw').ok, 'too much added');
  assert(typed('   ', 'zw').empty, 'blank is empty, not wrong');
  assert(typed('?!-', 'zw').empty, 'only punctuation is empty');
});

test('aliases: one central list, every code real, no name used by two countries', function () {
  Object.keys(ALIASES).forEach(function (code) { assert(country(code), code + ' is a country'); });
  ['us', 'gb', 'nl', 'cz'].forEach(function (code) { assert((ALIASES[code] || []).length, code + ' has other names'); });
  const seen = {};
  ALL.forEach(function (c) {
    names(c).forEach(function (n) {
      const k = M.normalise(n);
      assert(!seen[k] || seen[k] === c.code, n + ' is not also another country');
      seen[k] = c.code;
    });
  });
  assertEqual(country('us').aka, undefined, 'no second alias list in worldFlags');
});

test('expert: every country and every alias can be spelled exactly', function () {
  ALL.forEach(function (c) {
    names(c).forEach(function (n) { assert(typed(n, c.code).exact, n + ' passes for ' + c.name); });
  });
});

/* ---- letter tiles ---- */

function count(list) { const m = {}; list.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); return m; }
function holds(tiles, letters) {
  const have = count(tiles); const want = count(letters);
  return Object.keys(want).every(function (k) { return (have[k] || 0) >= want[k]; });
}

test('tiles: every letter of the name is there, plus decoys by difficulty', function () {
  const set = G.tileSet('Zimbabwe', G.rng(1), { difficulty: 'easy' });
  assertEqual(set.letters.join(''), 'ZIMBABWE');
  assertEqual(set.tiles.length, 12, 'Easy: 1.5 x 8');
  assert(holds(set.tiles, set.letters), 'all letters present');
  assertEqual(G.tileSet('Zimbabwe', G.rng(1), { difficulty: 'normal' }).tiles.length, 14, 'Normal: 1.75 x 8');
  assertEqual(G.tileSet('Zimbabwe', G.rng(1), { difficulty: 'hard' }).tiles.length, 16, 'Hard: 2 x 8');
  assertEqual(G.tileSet('Zimbabwe', G.rng(1), {}).tiles.length, 14, 'Normal when unset');
  assertEqual(G.tileSet('Chad', G.rng(1), { difficulty: 'easy' }).tiles.length, 6, 'short names still get decoys');
  assertEqual(G.tileSet('Central African Republic', G.rng(1), { difficulty: 'hard' }).tiles.length, G.MAX_TILES, 'at most 30');
});

test('tiles: spaces, hyphens and apostrophes are laid out for you', function () {
  const nz = G.layout('New Zealand');
  assertEqual(nz.filter(function (c) { return c.gap; }).length, 1, 'a gap between words');
  assertEqual(nz.filter(function (c) { return c.letter; }).length, 10);
  const gb = G.layout('Guinea-Bissau');
  assertEqual(gb.filter(function (c) { return c.fixed; }).map(function (c) { return c.ch; }).join(''), '-');
  assertEqual(G.layout('São Tomé').map(function (c) { return c.ch; }).join(''), 'SAO TOME', 'accents dropped');
  assertEqual(G.tileSet('Guinea-Bissau', G.rng(3)).tiles.indexOf('-'), -1, 'marks are never tiles');
});

test('tiles: the same seed deals the same tiles, and the name is never already spelled', function () {
  assertEqual(G.tileSet('Argentina', G.rng(9)).tiles.join(''), G.tileSet('Argentina', G.rng(9)).tiles.join(''));
  for (let s = 0; s < 200; s++) {
    const set = G.tileSet('Peru', G.rng(s), { difficulty: 'easy' });
    assert(set.tiles.slice(0, 4).join('') !== 'PERU', 'seed ' + s);
  }
});

test('tiles: decoys come from lookalike and nearby countries', function () {
  const rel = G.relatedNames(country('ro'), ALL, G.rng(2));
  assert(rel.indexOf('Chad') >= 0, 'Romania looks like Chad');
  assert(rel.length >= 3);
  const set = G.tileSet('Romania', G.rng(2), { difficulty: 'hard', related: rel });
  assertEqual(set.tiles.length, 14);
  assert(set.tiles.every(function (t) { return /^[A-Z]$/.test(t); }), 'only capital letters');
});

test('tiles: every country can be spelled from its tiles, and the spelling is accepted', function () {
  ALL.forEach(function (c) {
    const target = G.targetName(c);
    const set = G.tileSet(target, G.rng(c.code.charCodeAt(0)), { difficulty: 'normal', related: G.relatedNames(c, ALL, G.rng(4)) });
    assert(holds(set.tiles, set.letters), c.name + ' has its letters');
    assert(set.letters.length <= 22, c.name + ' fits the slots');
    assert(typed(G.spelled(set.cells, set.letters), c.code).exact, target + ' spelled from tiles passes for ' + c.name);
  });
  assertEqual(G.targetName(country('vc')), 'Saint Vincent', 'very long names use a shorter accepted name');
  assertEqual(G.targetName(country('ba')), 'Bosnia');
  assertEqual(G.targetName(country('zw')), 'Zimbabwe');
});

test('tiles: the slots spell the name with its gaps and marks', function () {
  const cells = G.layout('Saint Kitts');
  assertEqual(G.spelled(cells, 'SAINTKITTS'.split('')), 'SAINT KITTS');
  assertEqual(G.spelled(G.layout('Guinea-Bissau'), 'GUINEABISSAU'.split('')), 'GUINEA-BISSAU');
  assertEqual(G.spelled(G.layout('United States'), ['U', 'S', 'A']), 'USA', 'a shorter name in the first slots');
  assert(typed(G.spelled(cells, 'SAINTKITTS'.split('')), 'kn').exact);
});

test('tiles: a shorter accepted name can be built from the tiles too', function () {
  const set = G.tileSet('United States', G.rng(5));
  assert(holds(set.tiles, 'USA'.split('')), 'USA from the tiles of United States');
  assert(typed('USA', 'us').ok);
  const uk = G.tileSet('United Kingdom', G.rng(5));
  assert(holds(uk.tiles, 'UK'.split('')), 'UK from United Kingdom');
});

test('expert: every flag, extra time to spell and a bonus', function () {
  assertEqual(G.pool(ALL, { level: 'expert' }).length, ALL.length, 'every country');
  assertEqual(G.secondsFor({ level: 'expert', time: 8 }), 8 + G.TYPE_EXTRA_SECS);
  assertEqual(G.secondsFor({ level: 'normal', time: 8 }), 8);
  assertEqual(G.secondsFor({ level: 'expert', time: 0 }), 0, 'no limit stays no limit');
  assertEqual(G.points(true, 0, 14, false, true), 250, 'spelled instantly');
  assert(!G.isStandard({ level: 'expert' }), 'Expert is not the ranked standard');
  const deck = G.deal(ALL, { level: 'expert' }, G.rng(5), 10);
  deck.forEach(function (q) { assertEqual(q.options[q.answer], q.name, q.code + ' keeps its answer'); });
});
