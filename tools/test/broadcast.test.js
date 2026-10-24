'use strict';
/* FF.Broadcast: the room host's device publishes what people watching see,
   under a separate watch code. Pure build() checks, then two "phones" on one
   in-memory bus. */
const { loadFF, test, assert, assertEqual } = require('./harness');

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
      return function () { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    }
  };
}

const PHOTO = 'photo:0123456789abcdef-01234567.webp';

function phone(bus, name) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/net/transport.js', 'js/net/room.js', 'js/net/raceRules.js', 'js/net/race.js', 'js/net/broadcast.js']);
  FF.Storage.init();
  FF.Players = { AVATARS: ['fox'], COLORS: ['#8b5cf6'], get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; } };
  FF.Avatars = {
    isPhoto: function (v) { return /^photo:/.test(String(v || '')); },
    fallback: function () { return 'owl'; }
  };
  FF.Games = { get: function (id) { return { id: id, name: 'World Flags', category: 'world' }; } };
  FF.t = function (k, f, v) { let s = f || k; Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); }); return s; };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  return FF;
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }
function watchDoc(bus) { return bus.read('') || {}; }
function onlyBroadcast(bus) {
  const all = watchDoc(bus).broadcasts || {};
  const codes = Object.keys(all);
  return codes.length === 1 ? { code: codes[0], doc: all[codes[0]] } : { code: null, doc: null, count: codes.length };
}

/* ---------- build(): pure ---------- */
function input(over) {
  const now = 1000000;
  return Object.assign({
    meta: { status: 'playing', mode: 'players', public: true, startAt: now - 20000, hostUid: 'u1' },
    players: {
      u1: { name: 'Ana', avatar: 'fox', online: true, lastSeen: now },
      u2: { name: 'Ben', avatar: 'cat', online: true, lastSeen: now }
    },
    rounds: { 2: { startedAt: now - 3000, answers: { u1: { correct: true, choice: 0 } } } },
    scores: { u1: 300, u2: 100 },
    screen: { n: 2, screen: { kind: 'choice', text: 'Capital of Zimbabwe?', options: ['Harare', 'Lusaka'] }, answer: null },
    voice: { u2: { speaking: true } },
    delisted: false,
    roomName: 'Friday quiz',
    game: { id: 'guessFlag', name: 'World Flags', category: 'world' },
    total: 10,
    now: now
  }, over || {});
}

test('broadcast: answer is never published before the round settles', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input());
  assertEqual(b.round.n, 2);
  assertEqual(b.round.answer, null, 'no answer yet');
  assertEqual(b.players.u1.correct, null, 'right or wrong stays hidden too');
  assertEqual(Object.keys(b.players.u1).sort().join(','), 'answered,avatar,color,correct,name,online,score,talking,teamId', 'player choices are never sent');
  const after = FF.Broadcast.build(input({ screen: { n: 2, screen: input().screen.screen, answer: 0 } }));
  assertEqual(after.round.answer, 0, 'shown after settle');
  assertEqual(after.players.u1.correct, true);
});

test('broadcast: a hidden photo is replaced by the character', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input({ players: { u1: { name: 'Tari', avatar: PHOTO, hidePhoto: true, online: true } } }));
  assertEqual(b.players.u1.avatar, 'owl');
  const shown = FF.Broadcast.build(input({ players: { u1: { name: 'Tari', avatar: PHOTO, online: true } } }));
  assertEqual(shown.players.u1.avatar, PHOTO, 'photos show when allowed');
});

test('broadcast: a delisted room is never public', function () {
  const FF = phone(makeBus(), 'Ana');
  assertEqual(FF.Broadcast.build(input({ delisted: true })).public, false);
  assertEqual(FF.Broadcast.build(input()).public, true);
  assertEqual(FF.Broadcast.build(input({ meta: { status: 'lobby' } })).public, false, 'private by default');
});

test('broadcast: scores, answered ticks and talking come from the room', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input());
  assertEqual(b.players.u1.score, 300);
  assertEqual(b.players.u1.answered, true);
  assertEqual(b.players.u2.answered, false);
  assertEqual(b.players.u2.talking, true);
  assertEqual(b.players.u1.talking, false);
  assertEqual(b.name, 'Friday quiz');
  assertEqual(b.game.name, 'World Flags');
  assertEqual(b.round.total, 10);
  assertEqual(b.round.opensAt, 1000000 - 3000);
});

test('broadcast: players who left are not shown, and clock-only games have no total', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input({
    players: { u1: { name: 'Ana', online: true, lastSeen: 1000000 }, u3: { name: 'Gone', online: false } },
    total: null
  }));
  assert(b.players.u1 && !b.players.u3, 'only people here now');
  assertEqual(b.round.total, null);
});

test('broadcast: the podium after the game is sorted by score', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input({ meta: { status: 'ended', public: true } }));
  assertEqual(b.round, null, 'no question after the game');
  assertEqual(b.results.map(function (r) { return r.id; }).join(','), 'u1,u2');
  assertEqual(b.results[0].score, 300);
});

test("broadcast: teams mode keeps each player's teamId", function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input({
    meta: { status: 'playing', mode: 'teams' },
    players: { u1: { name: 'Ana', online: true, teamId: 'team1' }, u2: { name: 'Ben', online: true, teamId: 'team2' } }
  }));
  assertEqual(b.mode, 'teams');
  assertEqual(b.players.u1.teamId, 'team1');
  assertEqual(b.players.u2.teamId, 'team2');
});

/* ---------- Publishing ---------- */
test('broadcast: the host publishes under the watch code, not the room code', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  const room = await A.Room.create({ dev: true, name: 'Friday quiz' });
  await tick(80);
  const meta = await A.Room.current().transport.get('meta');
  assert(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(meta.watchCode || ''), 'an 8-character watch code');
  const b = onlyBroadcast(bus);
  assertEqual(b.code, meta.watchCode, 'published under it');
  assertEqual(b.doc.name, 'Friday quiz');
  assertEqual(b.doc.public, false, 'private by default');
  assert(JSON.stringify(b.doc).indexOf(room.code) === -1, 'the room code is not in the broadcast');
  assertEqual(watchDoc(bus).watchRooms[meta.watchCode], room.code, 'the code maps to the room (hidden by the rules)');
  A.Room.leave();
});

test('broadcast: the next host keeps publishing when the host leaves', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await tick(80);
  const code = onlyBroadcast(bus).code;
  await A.Room.leave();
  await tick(600);
  assert(B.Room.current().isHost, 'Ben hosts');
  await B.Room.rename('Ben runs it');
  await tick(600);
  const b = onlyBroadcast(bus);
  assertEqual(b.code, code, 'same watch code');
  assertEqual(b.doc.name, 'Ben runs it', 'Ben publishes');
  B.Room.leave();
});

test('broadcast: watching off removes the broadcast; on brings it back', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await tick(80);
  const code = onlyBroadcast(bus).code;
  await A.Broadcast.setWatching(false);
  await tick(600);
  assertEqual(onlyBroadcast(bus).count, 0, 'gone');
  await A.Broadcast.setWatching(true);
  await tick(600);
  assertEqual(onlyBroadcast(bus).code, code, 'back under the same code');
  A.Room.leave();
});

test('broadcast: a new watch link retires the old code', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await tick(80);
  const old = onlyBroadcast(bus).code;
  const fresh = await A.Broadcast.newLink();
  await tick(600);
  assert(fresh && fresh !== old, 'a different code');
  const doc = watchDoc(bus);
  assert(!(doc.broadcasts || {})[old], 'old broadcast removed');
  assert(!(doc.watchRooms || {})[old], 'old mapping removed');
  assert((doc.broadcasts || {})[fresh], 'new broadcast published');
  assertEqual((await A.Room.current().transport.get('meta')).watchCode, fresh);
  A.Room.leave();
});

test('broadcast: setHidePhoto takes effect on the next publish', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  A.Room.saveIdentity({ avatar: PHOTO });
  await A.Room.create({ dev: true });
  await tick(80);
  const uid = A.Room.current().uid;
  assertEqual(onlyBroadcast(bus).doc.players[uid].avatar, PHOTO, 'photo shown');
  await A.Room.setHidePhoto(true);
  await tick(600);
  assertEqual(onlyBroadcast(bus).doc.players[uid].avatar, 'owl', 'character now');
  A.Room.leave();
});

test('broadcast: public is refused for a delisted room', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await A.Room.current().transport.set('admin', { delisted: true });
  await tick(80);
  assert(A.Broadcast.delisted(), 'seen as delisted');
  let err = null;
  try { await A.Broadcast.setPublic(true); } catch (e) { err = e; }
  assertEqual(err && err.message, 'DELISTED');
  A.Room.leave();
});

test('broadcast: viewers are counted for everyone in the room', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await tick(80);
  const code = onlyBroadcast(bus).code;
  let seen = null;
  B.Broadcast.onViewers(function (n) { seen = n; });
  const doc = watchDoc(bus);
  doc.watchers = { [code]: { v1: Date.now(), v2: Date.now(), v3: Date.now() } };
  bus.write('', doc);
  await tick(30);
  assertEqual(seen, 3);
  A.Room.leave(); B.Room.leave();
});

test('broadcast: the last person leaving takes the broadcast down', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await tick(80);
  await A.Room.leave();
  await tick(30);
  assertEqual(onlyBroadcast(bus).count, 0);
});

test('broadcast: leaving the room tells listeners nobody is watching', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await tick(80);
  const code = onlyBroadcast(bus).code;
  let seen = null;
  A.Broadcast.onViewers(function (n) { seen = n; });
  const doc = watchDoc(bus);
  doc.watchers = { [code]: { v1: Date.now() } };
  bus.write('', doc);
  await tick(30);
  assertEqual(seen, 1);
  await A.Room.leave();
  await tick(10);
  assertEqual(seen, 0, 'back to zero');
});

test('broadcast: the round carries the answer time the host picked', function () {
  const FF = phone(makeBus(), 'Ana');
  const b = FF.Broadcast.build(input({ meta: { status: 'playing', settings: { timer: 20 } } }));
  assertEqual(b.round.timerMs, 20000);
  assertEqual(FF.Broadcast.build(input({ meta: { status: 'playing', settings: { timer: 0 } } })).round.timerMs, null, 'no limit');
});

test('broadcast: viewers who stopped checking in are not counted', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await tick(80);
  const code = onlyBroadcast(bus).code;
  let seen = null;
  A.Broadcast.onViewers(function (n) { seen = n; });
  const doc = watchDoc(bus);
  doc.watchers = { [code]: { here: Date.now() - 1000, gone: Date.now() - 120000, junk: 5 } };
  bus.write('', doc);
  await tick(30);
  assertEqual(seen, 1);
  A.Room.leave();
});
