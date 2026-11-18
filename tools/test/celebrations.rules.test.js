/* PlayMona Celebrations: the hand-added Firebase rules (tools/gen-rules.js does not know them). */
'use strict';
const path = require('path');
const { test, assertEqual } = require('./harness');
const rules = require(path.join(__dirname, '../../database.rules.json')).rules;

test('celebrations: live summary is readable by signed-in phones and written only by the server', () => {
  const c = rules.celebrations.$cid;
  assertEqual(c.live['.read'], 'auth != null');
  assertEqual(c.live['.write'], undefined, 'no phone writes');
  assertEqual(c['.read'], undefined, 'the whole event tree is not readable');
  assertEqual(rules.celebrations['.read'], undefined, 'the list of events is not readable');
  assertEqual(c['.write'], undefined);
});

test('celebrations: a guest reads only their own membership', () => {
  const m = rules.celebrations.$cid.members;
  assertEqual(m['.read'], undefined);
  assertEqual(m.$uid['.read'], 'auth != null && auth.uid === $uid');
  assertEqual(m.$uid['.write'], undefined);
});

