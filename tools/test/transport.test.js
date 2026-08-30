'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

/* An in-process shared bus standing in for BroadcastChannel + localStorage. */
function makeBus() {
  const store = {};
  const listeners = [];
  return {
    store: store,
    read: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
    write: function (k, v) {
      if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v));
      listeners.slice().forEach(function (fn) { fn(k); });
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    }
  };
}

function connect(FF, bus) {
  const t = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  return t.connect().then(function () { return t; });
}

test('set then get round-trips a value', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  await t.set('meta/gameId', 'guessFlag');
  assertEqual(await t.get('meta/gameId'), 'guessFlag');
});

test('get returns null for a missing path', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  assertEqual(await t.get('meta/nothing'), null);
});

test('update merges keys without clobbering siblings', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  await t.set('players/u1', { name: 'Ana', avatar: 'fox' });
  await t.update('players/u1', { online: false });
  assertEqual(await t.get('players/u1'), { name: 'Ana', avatar: 'fox', online: false });
});

test('two transports on one bus see each other - the two-device case', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  await a.set('meta/status', 'playing');
  assertEqual(await b.get('meta/status'), 'playing', 'device B must see device A writes');
});

test('each connection gets a distinct uid', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  const b = FF.Transport.dev({ bus: bus, root: 'rooms/TEST01' });
  const ra = await a.connect();
  const rb = await b.connect();
  assert(ra.uid && rb.uid, 'connect must return a uid');
  assert(ra.uid !== rb.uid, 'uids must be distinct');
});

test('watch fires on change and stops after unsubscribe', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  const seen = [];
  const off = b.watch('meta/status', function (v) { seen.push(v); });

  await a.set('meta/status', 'lobby');
  await a.set('meta/status', 'playing');
  assertEqual(seen[seen.length - 1], 'playing');

  off();
  await a.set('meta/status', 'ended');
  assertEqual(seen[seen.length - 1], 'playing', 'no callbacks after unsubscribe');
});

test('transaction commits when the slot is empty', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const t = await connect(FF, makeBus());
  const r = await t.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'u1' : undefined;
  });
  assertEqual(r.committed, true);
  assertEqual(r.value, 'u1');
  assertEqual(await t.get('rounds/0/winner'), 'u1');
});

test('the second racer loses the transaction - the buzzer test', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  const first = await a.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'ana' : undefined;
  });
  const second = await b.transaction('rounds/0/winner', function (cur) {
    return cur == null ? 'ben' : undefined;
  });

  assertEqual(first.committed, true, 'first writer wins');
  assertEqual(second.committed, false, 'second writer must be rejected');
  assertEqual(await b.get('rounds/0/winner'), 'ana', 'the winner must not be overwritten');
});

test('onDisconnectSet applies when the transport closes', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  const b = await connect(FF, bus);

  await a.set('players/u1/online', true);
  await a.onDisconnectSet('players/u1/online', false);
  assertEqual(await b.get('players/u1/online'), true, 'still online before closing');

  a.close();
  assertEqual(await b.get('players/u1/online'), false, 'closing must apply the disconnect write');
});

test('roomPath builds room-scoped paths', function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  assertEqual(FF.Transport.roomPath('ABC123', 'players/u1'), 'rooms/ABC123/players/u1');
  assertEqual(FF.Transport.roomPath('ABC123'), 'rooms/ABC123');
});

test('watch fires immediately with the current value, like Firebase', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const a = await connect(FF, bus);
  await a.set('players/u1', { name: 'Ana' });

  const seen = [];
  a.watch('players', function (v) { seen.push(v); });
  await new Promise(r => setTimeout(r, 10));

  assertEqual(seen.length, 1, 'subscribing must deliver the current value once');
  assertEqual(seen[0], { u1: { name: 'Ana' } },
    'a device that subscribes after writing must see its own write');
});
