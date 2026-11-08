'use strict';
/* Expert (spelled) levels of the Bible games: the shared letter tiles
   (js/spellTiles.js), the Bible name list (js/data/bibleAliases.js) and
   the checks in Who Am I?, Books of the Bible, Verse Rush and Bible Quiz.
   Other names count, small slips pass, another person or book never does. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/bible.js', 'js/data/bibleQuiz.js', 'js/data/bibleAliases.js']);
FF.registerGame = function () {};
['js/games/bibleGames.js', 'js/games/bibleQuiz.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), FF.__sandbox, { filename: f });
});
const S = FF.SpellTiles;
const M = FF.AnswerMatch;
const G = FF.BibleGames;
const B = FF.BibleQuiz;
const N = FF.BibleNames;
const WHO = FF.data.bible.whoAmI;
const BOOKS = FF.data.bible.books;
const QUIZ = FF.data.bibleQuiz.items;

function count(list) { const m = {}; list.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); return m; }
function holds(tiles, letters) {
  const have = count(tiles); const want = count(letters);
  return Object.keys(want).every(function (k) { return (have[k] || 0) >= want[k]; });
}
function spellFromTiles(name, seed) {
  const set = S.deal(name, G.rng(seed || 1), { difficulty: 'hard' });
  assert(holds(set.tiles, set.letters), name + ': every letter is a tile');
  return S.spelled(set.cells, set.letters);
}

/* ---- shared tiles ---- */

test('spell tiles: numbers are tiles too, with another number as a decoy', function () {
  const set = S.deal('1 Kings', G.rng(3), { difficulty: 'easy' });
  assertEqual(set.letters.join(''), '1KINGS');
  assert(set.tiles.indexOf('1') !== -1, 'the 1 is a tile');
  assert(set.tiles.some(function (x) { return x === '2' || x === '3'; }), 'and 2 or 3 is a decoy');
  assertEqual(S.spelled(set.cells, set.letters), '1 KINGS');
  assertEqual(S.tileCount(6, 'easy'), 9);
  assertEqual(S.tileCount(6, 'hard'), 12);
});

test('spell tiles: feedback says how a spelling was read', function () {
  assertEqual(S.feedbackText('Abram', { ok: true, exact: true, matched: 'Abram' }, 'Abraham'), '');
  assert(/spelt Abraham/.test(S.feedbackText('Abrahm', { ok: true, exact: false, matched: 'Abraham' }, 'Abraham')));
  assert(/different answer/.test(S.feedbackText('Saul', { ok: false, near: 'Saul' }, 'Paul')));
  assert(/You spelled/.test(S.feedbackText('Xyz', { ok: false }, 'Paul')));
});

/* ---- names ---- */

test('bible names: every alias is for a real person or book, and no name is two answers', function () {
  const people = WHO.map(function (x) { return x.answer; });
  Object.keys(FF.data.bibleAliases.people).forEach(function (k) { assert(people.indexOf(k) !== -1, k + ' is a Who Am I person'); });
  const books = BOOKS.map(function (b) { return b.name; });
  Object.keys(FF.data.bibleAliases.books).forEach(function (k) { assert(books.indexOf(k) !== -1, k + ' is a book'); });
  [[people, N.person], [books, N.book]].forEach(function (pair) {
    const seen = {};
    pair[0].forEach(function (name) {
      pair[1](name).forEach(function (n) {
        const k = M.normalise(n);
        assert(!seen[k] || seen[k] === name, n + ' is not also ' + seen[k]);
        seen[k] = name;
      });
    });
  });
});

test('bible names: books get First, I and 1st forms', function () {
  assertEqual(N.book('1 Kings').join('|'), '1 Kings|First Kings|I Kings|1st Kings');
  assertEqual(N.book('3 John').join('|'), '3 John|Third John|III John|3rd John');
  assert(N.book('Psalms').indexOf('Psalm') !== -1);
  assertEqual(N.person('Pilate')[0], 'Pontius Pilate', 'a person is found by another name too');
  assertEqual(N.person('Nobody').join(''), 'Nobody');
});

/* ---- Who Am I ---- */

function who(guess, answer) { return G.whoCheck(guess, answer, WHO); }

test('who am i expert: names, other names and small slips pass', function () {
  [['Abraham', 'Abraham'], ['Abram', 'Abraham'], ['Simon Peter', 'Peter'], ['Cephas', 'Peter'], ['Pilate', 'Pontius Pilate'],
   ['Herod', 'King Herod'], ['Tabitha', 'Dorcas'], ['Elizabeth', 'Elisabeth'], ['Nebuchadnezer', 'Nebuchadnezzar'],
   ['Zaccheus', 'Zacchaeus'], ['Zachaeus', 'Zacchaeus'], ['Mosses', 'Moses'], ['Goliiath', 'Goliath'], ['john the baptist', 'John the Baptist'],
   ['JOHN THE BAPTISER', 'John the Baptist'], ['Mary Magdalen', 'Mary Magdalene'], ['Levi', 'Matthew']].forEach(function (p) {
    assert(who(p[0], p[1]).ok, p[0] + ' passes for ' + p[1]);
  });
  assert(!who('Abram', 'Abraham').exact === false, 'another accepted name is exact');
});

test('who am i expert: another person, or a name as close to one, never passes', function () {
  [['Saul', 'Paul'], ['Paul', 'Saul'], ['Mary', 'Mary Magdalene'], ['Mary Magdalene', 'Mary'], ['John', 'John the Baptist'],
   ['Simeon', 'Peter'], ['Simon', 'Simeon'], ['Elijah', 'Elisha'], ['Elisha', 'Elijah'], ['Eve', 'Adam'], ['Moses', 'Aaron'],
   ['Jacob', 'Isaac'], ['Martha', 'Mary'], ['Elish', 'Elijah'], ['Lot', 'Job'], ['Job', 'Lot']].forEach(function (p) {
    assert(!who(p[0], p[1]).ok, p[0] + ' does not pass for ' + p[1]);
  });
  assertEqual(who('Elisha', 'Elijah').near, 'Elisha');
  assert(!who('Jb', 'Job').ok, 'three letters must be exact');
  assert(who('   ', 'Job').empty);
});

test('who am i expert: every person can be spelled from the tiles', function () {
  WHO.forEach(function (x, i) {
    const r = who(spellFromTiles(x.answer, i + 1), x.answer);
    assert(r.ok && r.exact, x.answer + ' spelled from tiles passes');
  });
});

/* ---- books ---- */

function book(guess, name) { return G.bookCheck(guess, name, BOOKS); }

test('books expert: book names, numbered forms and small slips pass', function () {
  [['1 Kings', '1 Kings'], ['First Kings', '1 Kings'], ['I Kings', '1 Kings'], ['1st Kings', '1 Kings'], ['II Corinthians', '2 Corinthians'],
   ['Song of Songs', 'Song of Solomon'], ['Psalm', 'Psalms'], ['Revelations', 'Revelation'], ['Philipians', 'Philippians'],
   ['Deuteronomy', 'Deuteronomy'], ['Duteronomy', 'Deuteronomy'], ['Ecclesiates', 'Ecclesiastes'], ['Habbakuk', 'Habakkuk'],
   ['Acts of the Apostles', 'Acts'], ['3 john', '3 John']].forEach(function (p) {
    assert(book(p[0], p[1]).ok, p[0] + ' passes for ' + p[1]);
  });
});

test('books expert: another book, or one as close, never passes', function () {
  [['2 Kings', '1 Kings'], ['1 Kings', '2 Kings'], ['John', '1 John'], ['1 John', 'John'], ['2 John', '3 John'], ['Philemon', 'Philippians'],
   ['Philippians', 'Philemon'], ['Jude', 'Joel'], ['Joel', 'Jude'], ['Amos', 'Acts'], ['Mark', 'Micah'], ['Luke', 'Jude'],
   ['Ezra', 'Esther'], ['Second Kings', '1 Kings'], ['Kings', '1 Kings']].forEach(function (p) {
    assert(!book(p[0], p[1]).ok, p[0] + ' does not pass for ' + p[1]);
  });
});

test('books expert: every book can be spelled from the tiles', function () {
  BOOKS.forEach(function (b, i) {
    const r = book(spellFromTiles(b.name, i + 7), b.name);
    assert(r.ok && r.exact, b.name + ' spelled from tiles passes');
  });
});

test('verse rush expert: every verse is in a book that can be spelled', function () {
  const names = BOOKS.map(function (b) { return b.name; });
  FF.data.bible.verses.forEach(function (v) {
    const b = G.bookNameOfRef(v.reference, BOOKS);
    assert(names.indexOf(b) !== -1, v.reference + ' is in ' + b);
    assert(book(spellFromTiles(b, 5), b).ok, b + ' spelled from tiles passes');
  });
  assertEqual(G.bookNameOfRef('Psalm 23:1', BOOKS), 'Psalms');
  assertEqual(G.bookNameOfRef('1 Corinthians 13:4', BOOKS), '1 Corinthians');
  assert(book('Psalm', 'Psalms').ok, 'Psalm is read as Psalms');
});

/* ---- levels ---- */

test('bible games: Expert plays the Family pool and is never the standard', function () {
  assert(G.LEVELS.indexOf('expert') !== -1);
  assertEqual(G.who.pool(WHO, { level: 'expert' }).length, G.who.pool(WHO, { level: 'family' }).length, 'Who Am I');
  assertEqual(G.verse.pool(FF.data.bible.verses, { level: 'expert' }).length, G.verse.pool(FF.data.bible.verses, { level: 'family' }).length, 'Verse Rush');
  assertEqual(G.books.pool(BOOKS, 'expert').length, G.books.pool(BOOKS, 'family').length, 'Books');
  assertEqual(G.who.sanitize({ level: 'expert' }).level, 'expert', 'kept by the setup');
  assert(!G.who.isStandard({ level: 'expert' }) && !G.verse.isStandard({ level: 'expert' }) && !G.books.isStandard({ level: 'expert' }));
  assert(G.isSpelled({ level: 'expert' }) && !G.isSpelled({ level: 'scholar' }));
  assertEqual(G.spellPoints(300, true), 300 + G.SPELL_BONUS);
  assertEqual(G.spellPoints(300, false), 0);
  const deck = G.books.deal(BOOKS, FF.data.bible.divisions, { level: 'expert' }, G.rng(4), 24);
  assert(deck.some(function (q) { return q.kind === 'next'; }), 'Expert still asks what comes next');
});

/* ---- Bible Quiz ---- */

function prepared() { return QUIZ.map(function (item) { return B.prepare(item, B.rng(9)); }); }

test('bible quiz expert: only short names and words are spelled', function () {
  const qs = prepared();
  const spell = qs.filter(B.spellable);
  assert(spell.length >= 60, spell.length + ' questions can be spelled');
  spell.forEach(function (q) { assert(q.type === 'said' || q.type === 'finish', q.id + ' is said or finish'); });
  qs.forEach(function (q) {
    const a = q.options[q.answer];
    if (/[,()0-9]/.test(a || '')) assert(!B.spellable(q), a + ' stays a choice');
  });
  assert(!qs.filter(function (q) { return q.type === 'choice' || q.type === 'tf' || q.type === 'order'; }).some(B.spellable), 'other kinds stay as they are');
  assert(!B.isStandard({ level: 'expert' }));
  assertEqual(B.pool(QUIZ, { level: 'expert' }).length, B.pool(QUIZ, { level: 'family' }).length, 'the Family questions');
});

test('bible quiz expert: right answers and other names pass, the other choices never do', function () {
  const qs = prepared().filter(B.spellable);
  qs.forEach(function (q) {
    const right = q.options[q.answer];
    assert(B.checkSpelled(right, q).exact, right + ' passes for ' + q.id);
    const set = S.deal(right, B.rng(2), { difficulty: 'normal', related: q.options });
    assert(B.checkSpelled(S.spelled(set.cells, set.letters), q).ok, right + ' spelled from tiles passes');
    q.options.forEach(function (o, i) {
      if (i !== q.answer && M.normalise(o) !== M.normalise(right)) assert(!B.checkSpelled(o, q).ok, o + ' is not ' + right);
    });
  });
  const pilate = qs.filter(function (q) { return q.options[q.answer] === 'Pilate'; })[0];
  if (pilate) assert(B.checkSpelled('Pontius Pilate', pilate).ok, 'Pontius Pilate counts for Pilate');
  const peter = qs.filter(function (q) { return q.options[q.answer] === 'Peter'; })[0];
  if (peter) assert(B.checkSpelled('Simon Peter', peter).ok, 'Simon Peter counts for Peter');
  const light = qs.filter(function (q) { return q.options[q.answer] === 'light'; })[0];
  assert(light && B.checkSpelled('LIGHT', light).ok && !B.checkSpelled('fire', light).ok, 'finish the verse: light, not fire');
});
