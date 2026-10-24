'use strict';
/* Profile photos stored as avatar values ('photo:<file>') in avatars.js. */
const { loadFF, test, assert, assertEqual } = require('./harness');

function boot() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/data/avatars.js', 'js/avatars.js']);
  FF.Storage.init();
  return FF;
}

const PHOTO = 'photo:0123456789abcdef-a1b2c3d4.webp';

test('photo avatars: a photo value is kept and points at the uploads folder', function () {
  const FF = boot();
  assertEqual(FF.Avatars.isPhoto(PHOTO), true);
  assertEqual(FF.Avatars.has(PHOTO), true, 'counts as a real avatar, so rosters keep it');
  assertEqual(FF.Avatars.normalize(PHOTO, 'x'), PHOTO);
  assertEqual(FF.Avatars.url(PHOTO), '/uploads/avatars/0123456789abcdef-a1b2c3d4.webp');
  assertEqual(FF.Avatars.url('fox'), 'assets/avatars/fox.webp', 'characters are unchanged');
});

test('photo avatars: anything that only looks like a photo is not trusted', function () {
  const FF = boot();
  ['photo:../../api/config.php', 'photo:0123456789abcdef-a1b2c3d4.php', 'photo:https://evil.test/a.webp',
    'photo:0123456789ABCDEF-a1b2c3d4.webp', 'photo:'].forEach(function (bad) {
    assertEqual(FF.Avatars.isPhoto(bad), false, bad);
    assert(FF.Avatars.url(FF.Avatars.normalize(bad, 'x')).indexOf('assets/avatars/') === 0, 'falls back to a character: ' + bad);
  });
});

test('photo avatars: a missing photo always falls back to the same character', function () {
  const FF = boot();
  const a = FF.Avatars.fallback(PHOTO);
  assert(FF.Avatars.get(a), 'a real character');
  assertEqual(FF.Avatars.fallback(PHOTO), a);
});
