'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function words() {
  return loadFF(['js/data/words.js', 'js/data/wordlist.js']);
}

test('dictionary loads thousands of common words', function () {
  const FF = words();
  assert(FF.data.words.isWord, 'isWord should exist');
  const n = FF.data.words.all ? FF.data.words.all.length : Object.keys(FF.data.words._set || {}).length;
  assert(n > 8000, 'merged word set should be large');
});

test('everyday words are accepted', function () {
  const FF = words();
  ['family', 'games', 'player', 'score', 'house', 'apple', 'lego', 'ninja'].forEach(function (w) {
    assert(FF.data.words.isWord(w), w + ' should be in the dictionary');
  });
});

test('regular inflections of real words are accepted', function () {
  const FF = words();
  assert(FF.data.words.isWord('families'), 'families → family');
  assert(FF.data.words.isWord('cats'), 'cats → cat');
  assert(FF.data.words.isWord('playing'), 'playing → play');
  assert(FF.data.words.isWord('played'), 'played → play');
  assert(FF.data.words.isWord('boxes'), 'boxes → box');
});

test('nonsense is still rejected', function () {
  const FF = words();
  assertEqual(FF.data.words.isWord('xyzzy'), false);
  assertEqual(FF.data.words.isWord('qqq'), false);
  assertEqual(FF.data.words.isWord('ab'), false);
});
