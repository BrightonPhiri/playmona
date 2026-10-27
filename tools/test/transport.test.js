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

test('dev transport: an empty root is the database root', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const t = FF.Transport.dev({ bus: bus, root: '' });
  await t.connect();
  await t.set('broadcasts/X', 1);
  assertEqual(JSON.stringify(bus.read('')), JSON.stringify({ broadcasts: { X: 1 } }));
});

test('Transport.open picks the dev transport in dev rooms mode', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  FF.Net = { devMode: function () { return true; }, configured: function () { return false; } };
  const t = await FF.Transport.open('rooms/ABC234');
  assert(t && typeof t.watch === 'function', 'a transport');
});

/* ---------- Signing in for rooms and watching ---------- */
function fakeAuth(opts) {
  return {
    currentUser: opts.current || null,
    anonCalls: 0,
    onAuthStateChanged: function (cb) {
      if (opts.restoreAfter != null) setTimeout(function () { cb(opts.restored || null); }, opts.restoreAfter);
      return function () {};
    },
    signInAnonymously: function () {
      this.anonCalls++;
      if (opts.anonError) return Promise.reject(Object.assign(new Error('nope'), { code: opts.anonError }));
      return Promise.resolve({ user: { uid: 'anon1', isAnonymous: true } });
    }
  };
}

test('sign-in: a signed-in account restored a moment after loading is used, not an anonymous one', async function () {
  const FF = loadFF(['js/core.js', 'js/net/firebaseTransport.js']);
  const auth = fakeAuth({ restoreAfter: 20, restored: { uid: 'brighton', isAnonymous: false } });
  const user = await FF.Net.signInForRoom(auth);
  assertEqual(user.uid, 'brighton');
  assertEqual(auth.anonCalls, 0, 'no anonymous sign-in');
});

test('sign-in: someone signed out gets a quiet anonymous sign-in', async function () {
  const FF = loadFF(['js/core.js', 'js/net/firebaseTransport.js']);
  const auth = fakeAuth({ restoreAfter: 5, restored: null });
  const user = await FF.Net.signInForRoom(auth);
  assertEqual(user.uid, 'anon1');
  assertEqual(auth.anonCalls, 1);
});

test('sign-in: an account already there is used straight away', async function () {
  const FF = loadFF(['js/core.js', 'js/net/firebaseTransport.js']);
  const auth = fakeAuth({ current: { uid: 'ana', isAnonymous: false } });
  assertEqual((await FF.Net.signInForRoom(auth)).uid, 'ana');
});

test('sign-in: anonymous sign-in switched off says so clearly', async function () {
  const FF = loadFF(['js/core.js', 'js/net/firebaseTransport.js']);
  const auth = fakeAuth({ restoreAfter: 5, restored: null, anonError: 'auth/admin-restricted-operation' });
  let err = null;
  try { await FF.Net.signInForRoom(auth); } catch (e) { err = e; }
  assertEqual(err && err.code, 'anon-disabled');
});

/* ---------- The browser bus with tabs that see each other late ----------
   Chromium passes one tab's localStorage writes to the others a moment
   later. Two fake storages model that: each tab writes to its own copy,
   and the other copy catches up only on flush(). */
function laggingStorages() {
  const copies = [new Map(), new Map()];
  const pending = [[], []];
  function storage(i) {
    const mine = copies[i];
    const theirs = pending[1 - i];
    return {
      get length() { return mine.size; },
      key: function (n) { const keys = Array.from(mine.keys()); return n < keys.length ? keys[n] : null; },
      getItem: function (k) { return mine.has(k) ? mine.get(k) : null; },
      setItem: function (k, v) { mine.set(k, String(v)); theirs.push([k, String(v)]); },
      removeItem: function (k) { mine.delete(k); theirs.push([k, null]); }
    };
  }
  return {
    a: storage(0),
    b: storage(1),
    flush: function () {
      [0, 1].forEach(function (i) {
        pending[i].splice(0).forEach(function (op) {
          if (op[1] === null) copies[i].delete(op[0]); else copies[i].set(op[0], op[1]);
        });
      });
    },
    // Deliver one of tab A's writes to tab B; false when none are left.
    flushOneToB: function () {
      const op = pending[1].shift();
      if (!op) return false;
      if (op[1] === null) copies[1].delete(op[0]); else copies[1].set(op[0], op[1]);
      return true;
    }
  };
}

async function twoTabs() {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const s = laggingStorages();
  const a = FF.Transport.dev({ bus: FF.Transport.browserBus('t', s.a), root: 'rooms/T' });
  const b = FF.Transport.dev({ bus: FF.Transport.browserBus('t', s.b), root: 'rooms/T' });
  await a.connect();
  await b.connect();
  return { a: a, b: b, flush: s.flush, flushOneToB: s.flushOneToB };
}

test('dev bus: a write from a tab that is behind never erases another tab\'s write', async function () {
  const t = await twoTabs();
  await t.a.set('players/b', { name: 'Ben', lastSeen: 1 });
  t.flush();
  // Tab A claims the round; tab B has not seen it yet when its heartbeat runs.
  await t.a.transaction('rounds/0/winner', function (cur) { return cur == null ? 'ana' : undefined; });
  await t.b.update('players/b', { lastSeen: 2 });
  t.flush();
  assertEqual(await t.a.get('rounds/0/winner'), 'ana', 'tab A keeps its winner');
  assertEqual(await t.b.get('rounds/0/winner'), 'ana', 'tab B gets it too');
  assertEqual(await t.a.get('players/b'), { name: 'Ben', lastSeen: 2 }, 'and B\'s heartbeat lands');
});

test('dev bus: removing a branch drops only what that tab had seen', async function () {
  const t = await twoTabs();
  await t.a.set('rounds/0', { startedAt: 5, answers: { u1: { correct: true } } });
  t.flush();
  await t.a.set('rounds/1/startedAt', 9);
  await t.b.set('rounds/0', null);
  t.flush();
  assertEqual(await t.a.get('rounds'), { 1: { startedAt: 9 } }, 'round 0 gone, round 1 kept');
  assertEqual(await t.b.get('rounds'), { 1: { startedAt: 9 } });
});

test('dev bus: documents round-trip, arrays whole and empty objects dropped like Firebase', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const s = laggingStorages();
  const bus = FF.Transport.browserBus('t', s.a);
  const doc = { meta: { status: 'lobby', settings: { questions: 5 } }, list: [1, 'two', { three: 3 }], flag: false, zero: 0, empty: {} };
  bus.write('rooms/T', doc);
  assertEqual(bus.read('rooms/T'), { meta: { status: 'lobby', settings: { questions: 5 } }, list: [1, 'two', { three: 3 }], flag: false, zero: 0 });
  assertEqual(bus.read('rooms/OTHER'), null, 'documents are separate');
  bus.write('rooms/T', null);
  assertEqual(bus.read('rooms/T'), null, 'writing null clears it');
});

test('dev bus: an unchanged write tells nobody', async function () {
  const FF = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = FF.Transport.browserBus('t', laggingStorages().a);
  let calls = 0;
  bus.subscribe(function () { calls++; });
  bus.write('rooms/T', { a: 1 });
  bus.write('rooms/T', { a: 1 });
  assertEqual(calls, 1);
});

test('dev bus: another tab never sees half of an answer', async function () {
  const t = await twoTabs();
  await t.a.set('rounds/0/answers/ana', { choice: 'pyramid', correct: true, ms: 900, value: 150 });
  await t.a.transaction('rounds/0/winner', function (cur) { return cur == null ? 'ana' : undefined; });
  // Tab B catches up one key at a time, reading after each.
  do {
    const a = await t.b.get('rounds/0/answers/ana');
    assert(a === null || (a.correct === true && a.choice === 'pyramid'), 'whole or absent, never partial: ' + JSON.stringify(a));
  } while (t.flushOneToB());
  assertEqual(await t.b.get('rounds/0/winner'), 'ana');
});
