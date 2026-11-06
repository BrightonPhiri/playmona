'use strict';
/* The crew runner notices a deploy (api/crew/lib/stamp.js): its stamp covers every file it runs,
   changes when one changes, and it only restarts once the new code has settled. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, assert, assertEqual } = require('./harness');
const S = require('../../api/crew/lib/stamp.js');
const loader = require('../../api/crew/lib/loader.js');

test('crew stamp: covers the runner, its helpers and every game file it loads', function () {
  const list = S.files().map((f) => f.split(path.sep).join('/'));
  ['api/crew/runner.js', 'api/crew/lib/rtdb.js', 'js/wordflow/referee.js', 'js/imposters/referee.js'].forEach((f) => {
    assert(list.some((x) => x.endsWith(f)), f);
  });
  assertEqual(list.length, loader.FILES.length + 4);
  assert(/^[0-9a-f]{40}$/.test(S.stamp()), 'every file is there');
});

test('crew stamp: a changed file changes it; a missing file gives no stamp', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  const a = path.join(dir, 'a.js');
  const b = path.join(dir, 'b.js');
  fs.writeFileSync(a, 'one');
  fs.writeFileSync(b, 'two');
  const first = S.stamp([a, b]);
  assertEqual(S.stamp([a, b]), first, 'the same files, the same stamp');
  fs.writeFileSync(b, 'three');
  assert(S.stamp([a, b]) !== first);
  fs.unlinkSync(a);
  assertEqual(S.stamp([a, b]), null);
});

test('crew stamp: restarts only once the new code has stayed the same for two checks', function () {
  let now = 'old';
  const w = S.watcher('old', () => now);
  assertEqual(w.check(), false, 'nothing changed');
  now = null;
  assertEqual(w.check(), false, 'mid-upload');
  now = 'half';
  assertEqual(w.check(), false, 'changed, not settled');
  now = 'new';
  assertEqual(w.check(), false, 'still changing');
  assertEqual(w.check(), true, 'settled: restart');
  now = 'old';
  assertEqual(S.watcher('old', () => now).check(), false, 'back to the same code');
});
