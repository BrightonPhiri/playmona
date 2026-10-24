'use strict';
/* Database rules for watching (phase 3): broadcasts, watch codes, viewers,
   delisting and viewer limits. Read from the generated database.rules.json. */
const fs = require('fs');
const path = require('path');
const { test, assert, assertEqual } = require('./harness');

const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;

test('watch rules: broadcasts are read one at a time, never listed', function () {
  assert(RULES.broadcasts, 'broadcasts rules exist');
  assert(!RULES.broadcasts['.read'], 'no read on the whole list');
  assertEqual(RULES.broadcasts.$wc['.read'], 'auth != null');
  const write = RULES.broadcasts.$wc['.write'];
  assert(/watchRooms/.test(write) && /hostUid/.test(write), 'only the room host writes');
  assert(/delisted/.test(RULES.broadcasts.$wc['.validate']), 'public is refused while delisted');
  assert(/admins/.test(RULES.broadcasts.$wc.public['.write']), 'admins can switch public off');
});

test('watch rules: the room behind a watch code stays hidden', function () {
  assert(RULES.watchRooms, 'watchRooms rules exist');
  assert(/admins/.test(RULES.watchRooms['.read']), 'admin-only read');
  assert(!RULES.watchRooms.$wc['.read'], 'nobody else reads it');
  assert(/hostUid/.test(RULES.watchRooms.$wc['.write']), 'only the room host maps a code');
});

test('watch rules: viewers write only their own entry', function () {
  assert(RULES.watchers, 'watchers rules exist');
  assertEqual(RULES.watchers.$wc['.read'], 'auth != null');
  assert(/\$uid === auth\.uid|auth\.uid === \$uid/.test(RULES.watchers.$wc.$uid['.write']), 'own entry only');
});

test('watch rules: delisting is admin-only and blocks public', function () {
  assert(RULES.rooms.$code.admin && /admins/.test(RULES.rooms.$code.admin['.write']), 'admin-only delist');
  assert(RULES.rooms.$code.meta.public && /delisted/.test(RULES.rooms.$code.meta.public['.validate']), 'public refused while delisted');
});

test('watch rules: limits and the watchers counter', function () {
  const w = RULES.config.site.watch;
  assert(w && w.room && w.site && w.$other['.validate'] === false, 'room and site limits only');
  assert(RULES.stats.totals.$counter['.validate'].indexOf('watchers') !== -1, 'total counter');
  assert(RULES.stats.days.$day.$counter['.validate'].indexOf('watchers') !== -1, 'day counter');
});
