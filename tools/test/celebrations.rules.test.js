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


test('celebrations: phones write only game commands; the game view is for guests and organisers', () => {
  const c = rules.celebrations.$cid;
  const writes = [];
  (function walk(node, at) {
    Object.keys(node || {}).forEach((k) => {
      if (k === '.write') writes.push(at);
      else if (node[k] && typeof node[k] === 'object') walk(node[k], at + '/' + k);
    });
  })(c, '');
  assertEqual(writes.join(','), '/inbox/$uid/$id', 'the inbox is the only place a phone writes');
  assertEqual(c.control, undefined, 'the organiser\'s controls go through the server');
  assertEqual(c.run['.write'], undefined);
  assertEqual(/members'\)\.child\(auth\.uid\)\.exists\(\)/.test(c.run['.read']) && /viewers'\)\.child\(auth\.uid\)\.exists\(\)/.test(c.run['.read']), true, 'guests of the event and organisers watching');
  assertEqual(rules.celebrationRuns, undefined, 'runs are server-only');
  assertEqual(rules.celebrationState, undefined);
});
