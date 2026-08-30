'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

test('loadFF loads core.js and exposes FF.util', function () {
  const FF = loadFF(['js/core.js']);
  assert(FF.util, 'FF.util should exist');
  assert(typeof FF.util.shuffle === 'function', 'FF.util.shuffle should be a function');
});

test('FF.util.normalize lowercases and trims', function () {
  const FF = loadFF(['js/core.js']);
  assertEqual(FF.util.normalize('  Hello World!  '), 'hello world');
});

test('each loadFF call is isolated', function () {
  const a = loadFF(['js/core.js']);
  const b = loadFF(['js/core.js']);
  a.util.__marker = 1;
  assert(b.util.__marker === undefined, 'sandboxes must not share state');
});
