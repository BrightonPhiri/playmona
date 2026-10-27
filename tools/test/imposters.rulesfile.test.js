'use strict';
/* database.rules.json for Imposters. There is no rules emulator on this PC (no Java), so this
   checks the shape: the secret and server paths have no client write, a secret is readable only
   by its owner, and commands and chat can only be written once, by their sender, server-stamped. */
const fs = require('fs');
const path = require('path');
const { test, assert, assertEqual, ROOT } = require('./harness');

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
const room = rules.rooms.$code;

/* Every ".write" anywhere under a node. */
function writes(node, at, out) {
  out = out || [];
  if (!node || typeof node !== 'object') return out;
  Object.keys(node).forEach((k) => {
    if (k === '.write') out.push(at);
    else if (k[0] !== '.') writes(node[k], at + '/' + k, out);
  });
  return out;
}

test('rules: the public Imposters view has no client write rule', function () {
  assertEqual(room.imp, undefined, 'rooms/$code/imp is server-only');
  assert(!/\.write/.test(JSON.stringify(rules.rooms['.write'] || '')), 'no write at the rooms level');
  assertEqual(room['.write'], undefined, 'no write at the room level (it would cascade)');
});

test('rules: secrets are readable only by their owner and written only by the server', function () {
  const s = rules.imposterSecrets;
  assertEqual(Object.keys(s).join(','), '$code');
  assertEqual(s.$code['.read'], undefined, 'nobody reads a whole room of secrets');
  assertEqual(s.$code.$uid['.read'], 'auth != null && auth.uid === $uid');
  assertEqual(JSON.stringify(writes(s, '')), '[]');
  assertEqual(s['.read'], undefined);
});

test('rules: the referee\'s runs and state are server-only', function () {
  assertEqual(rules.imposterRuns, undefined);
  assertEqual(rules.imposterState, undefined);
});

test('rules: a command is written once, by its sender, for this match, server-stamped', function () {
  const cmd = room.impInbox.$uid.$id;
  assert(cmd['.write'].indexOf('$uid === auth.uid') !== -1, 'own inbox only');
  assert(cmd['.write'].indexOf('!data.exists()') !== -1, 'written once');
  assert(cmd['.write'].indexOf("child('imp').child('seats').child(auth.uid).exists()") !== -1, 'seated players only');
  assertEqual(cmd.t['.validate'], 'newData.isNumber() && newData.val() === now');
  assert(cmd.matchId['.validate'].indexOf("child('imp').child('matchId').val()") !== -1, 'the current match only');
  assert(cmd.type['.validate'].indexOf('^(ready|clue|callVote|vote|stop)$') !== -1);
  assertEqual(cmd.$other['.validate'], false);
  assertEqual(room.impInbox['.write'], undefined);
  assertEqual(room.impInbox.$uid['.write'], undefined);
});

test('rules: chat is one message per write, by its sender, never by the eliminated', function () {
  const msg = room.chat.$id;
  assert(msg['.write'].indexOf("newData.child('uid').val() === auth.uid") !== -1);
  assert(msg['.write'].indexOf('!data.exists()') !== -1);
  assert(msg['.write'].indexOf("child('alive').val() !== false") !== -1);
  assert(msg.text['.validate'].indexOf('<= 120') !== -1);
  assertEqual(msg.$other['.validate'], false);
  assert(room.chat['.write'].indexOf('!newData.exists()') !== -1, 'the host can only clear the whole chat');
});
