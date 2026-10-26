'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function bank() {
  return loadFF(['js/core.js', 'js/data/words.js', 'js/data/wordlist.js', 'js/words.js', 'js/data/lexicon.js']);
}

test('the word bank holds over 100,000 words', function () {
  const FF = bank();
  assert(FF.Words.ready(), 'lexicon should attach when it loads');
  assert(FF.Words.count() > 100000, 'expected 100k+ words, got ' + FF.Words.count());
});

test('everyday, British and American words are accepted', function () {
  const FF = bank();
  ['family', 'zebra', 'colour', 'color', 'quixotic', 'jumped', 'boxes', 'lego'].forEach(function (w) {
    assert(FF.Words.isWord(w), w + ' should be a word');
  });
  ['xyzzy', 'qqq', 'ab', ''].forEach(function (w) {
    assertEqual(FF.Words.isWord(w), false, w + ' should not be a word');
  });
});

test('tiers rank everyday words below rare ones', function () {
  const FF = bank();
  assertEqual(FF.Words.tier('house'), 1);
  assert(FF.Words.tier('quixotic') > 1, 'quixotic is not everyday');
  assertEqual(FF.Words.tier('notaword'), 0);
});

test('rude words are refused, words with an innocent meaning are quiet', function () {
  const FF = bank();
  assertEqual(FF.Words.isWord('shit'), false);
  assert(FF.Words.isWord('cock'), 'a rooster is still a word');
  assert(FF.Words.isQuiet('cock'), 'but never shown');
  assertEqual(FF.Words.tier('cock'), 0, 'quiet words have no tier, so games never deal them');
  assert(FF.Words.isWord('butter') && !FF.Words.isQuiet('butter'), 'butter is not caught by butt');
});

test('wordsFrom only uses the letters given', function () {
  const FF = bank();
  const found = FF.Words.wordsFrom('planet', { maxTier: 2 });
  assert(found.indexOf('plane') !== -1 && found.indexOf('plant') !== -1, 'plane and plant come from PLANET');
  assertEqual(found.indexOf('apple'), -1, 'apple needs two Ps');
  assertEqual(found[0], 'planet', 'longest first');
  found.forEach(function (w) { assert(w.length >= 3, w + ' too short'); });
});

test('a rack is built from one key word and has words to find', function () {
  const FF = bank();
  FF.Random.seed('rack-test');
  const r = FF.Words.rack({ length: 7, minWords: 12 });
  assertEqual(r.letters.length, 7);
  assertEqual(r.letters.slice().sort().join(''), r.key.split('').sort().join(''), 'letters are the key word');
  assert(r.words.indexOf(r.key) !== -1, 'the key word is an answer');
  assert(r.words.length >= 12, 'enough words to find');
});

test('the same room seed deals the same rack on every device', function () {
  const a = bank();
  const b = bank();
  a.Random.seed('room-1'); b.Random.seed('room-1');
  assertEqual(a.Words.rack({ length: 7 }).letters, b.Words.rack({ length: 7 }).letters);
});

test('the older dictionary check sees the full bank', function () {
  const FF = bank();
  assert(FF.data.words.isWord('quixotic'), 'Word Chain and Word Builder use FF.data.words.isWord');
});
