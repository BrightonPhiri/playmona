'use strict';
/* The crew runner's Firebase stream cache (api/crew/lib/rtdb.js): put and patch events, and a
   multi-path update (what the Imposters start writes) reaching the room's watchers. */
const { test, assert, assertEqual } = require('./harness');
const { applyEvent, roomTransport } = require('../../api/crew/lib/rtdb.js');

test('rtdb stream: a put replaces the data at its path, null deletes it', function () {
  let tree = applyEvent(null, '/', { meta: { status: 'lobby' }, players: { a: { name: 'A' } } }, false);
  tree = applyEvent(tree, '/players/b', { name: 'B' }, false);
  assertEqual(tree.players.b.name, 'B');
  tree = applyEvent(tree, '/players/a', null, false);
  assertEqual(JSON.stringify(Object.keys(tree.players)), '["b"]');
  tree = applyEvent(tree, '/', null, false);
  assertEqual(tree, null);
});

test('rtdb stream: patch keys are paths, so a multi-path update lands where it belongs', function () {
  let tree = applyEvent(null, '/', { meta: { status: 'lobby', hostUid: 'h' }, imp: { phase: 'x' } }, false);
  tree = applyEvent(tree, '/', { 'meta/status': 'playing', 'meta/gameId': 'imposters', imp: null, 'impInbox': null }, true);
  assertEqual(tree.meta.status, 'playing');
  assertEqual(tree.meta.gameId, 'imposters');
  assertEqual(tree.meta.hostUid, 'h', 'siblings are kept');
  assertEqual(tree.imp, undefined);
  assert(!Object.prototype.hasOwnProperty.call(tree, 'meta/status'), 'no flat "meta/status" key');
  // A patch below the root, with plain and path keys.
  tree = applyEvent(tree, '/players', { 'c1/lastSeen': 5, c2: { name: 'C2' } }, true);
  assertEqual(tree.players.c1.lastSeen, 5);
  assertEqual(tree.players.c2.name, 'C2');
  tree = applyEvent(tree, '/players', { 'zz/name': null }, true);
  assertEqual(tree.players.zz, undefined, 'deleting under nothing adds nothing');
});

test('rtdb stream: a room watcher sees meta.status change when the server starts a game with a multi-path update', function () {
  let push = null;
  const fake = { stream: (path, onTree) => { push = onTree; return { close() {} }; } };
  const T = roomTransport(fake, 'ROOM01', () => 0, () => {});
  const seen = [];
  T.watch('meta', (m) => seen.push(m && m.status));
  let tree = applyEvent(null, '/', { meta: { status: 'lobby' } }, false);
  push(tree);
  tree = applyEvent(tree, '/', { 'meta/status': 'playing', 'meta/impMatch': 'i_1' }, true);
  push(tree);
  assertEqual(seen.join(','), 'lobby,playing');
});
