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

test('watch rules: broadcasts have a known shape, cannot claim a future time, and are indexed by time', function () {
  const b = RULES.broadcasts;
  assertEqual(JSON.stringify(b['.indexOn']), JSON.stringify(['updatedAt']), 'fresh-only queries need the index');
  assert(/updatedAt'\)\.val\(\) <= now/.test(b.$wc['.validate']), 'no future updatedAt');
  assertEqual(b.$wc.$other['.validate'], false, 'no unknown fields');
  assertEqual(b.$wc.players.$uid.$other['.validate'], false, 'players have a known shape');
  assert(/length <= 40/.test(b.$wc.players.$uid.name['.validate']), 'names are short');
  assert(/length <= 30000/.test(b.$wc.round.screen.image.svg['.validate']), 'drawings are capped');
  assert(/length <= 200/.test(b.$wc.round.screen.text['.validate']), 'question text is capped');
});

test('watch rules: viewer entries belong to a real watch code and hold a recent time', function () {
  const v = RULES.watchers.$wc.$uid['.validate'];
  assert(/watchRooms/.test(v) && /exists\(\)/.test(v), 'only for watch codes that exist');
  assert(/<= now/.test(v), 'no future times');
});
