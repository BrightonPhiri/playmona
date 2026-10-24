'use strict';
/* Leaving rooms, saved rooms, presence that keeps rounds moving, and
   reading room codes from QR codes. Two "phones" share one in-memory bus. */
const { loadFF, test, assert, assertEqual } = require('./harness');

function makeBus() {
  const store = {};
  const listeners = [];
  return {
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

function phone(bus, name) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/net/transport.js', 'js/net/room.js', 'js/net/raceRules.js', 'js/net/race.js']);
  FF.Storage.init();
  FF.Players = { AVATARS: ['😀'], COLORS: ['#8b5cf6'], get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; } };
  FF.t = function (k, f, v) { let s = f || k; Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); }); return s; };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  return FF;
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }

test('rooms: the host can leave and the next player becomes host', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await tick();
  const aUid = A.Room.current().uid, bUid = B.Room.current().uid;

  await A.Room.leave();
  await tick(30);
  assertEqual(A.Room.current(), null, 'A is out');
  const meta = await B.Room.current().transport.get('meta');
  assertEqual(meta.hostUid, bUid, 'Ben is host');
  assert(B.Room.current().isHost, 'Ben sees himself as host');
  const players = await B.Room.current().transport.get('players');
  assert(!players[aUid], 'Ana is no longer listed');
  B.Room.leave();
});

test('rooms: reopening a saved room nobody is in starts on a fresh lobby', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true, name: 'Friday quiz' });
  await A.Room.startGame('familyQuiz', {});
  // Ana's phone drops off mid-game, leaving the room "playing".
  await A.Room.current().transport.update('players/' + A.Room.current().uid, { online: false });

  await B.Room.join(room.code, {}, { dev: true });
  const s = B.Room.current();
  assert(s.isHost, 'Ben takes over the empty room');
  assertEqual(s.meta.status, 'lobby', 'the old game is cleared');
  assertEqual(s.meta.name, 'Friday quiz', 'the name stays');
  assert(s.meta.expiresAt > Date.now() + 29 * 24 * 3600 * 1000, 'the room is renewed for 30 days');
  B.Room.leave();
});

test('rooms: the owner gets the host role back when they return', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  const aUid = A.Room.current().uid;
  await B.Room.join(room.code, {}, { dev: true });
  await tick();
  await A.Room.leave();
  await tick(30);
  assert(B.Room.current().isHost, 'Ben hosts while Ana is away');

  // Ana comes back on the same device (same uid).
  A.Transport.dev = (function (dev) {
    return function (o) {
      const t = dev(Object.assign({}, o, { bus: bus }));
      const connect = t.connect;
      t.connect = function () { return connect.call(t).then(function () { return { uid: aUid }; }); };
      const uidFn = t.uid; t.uid = function () { return aUid; };
      return t;
    };
  })(A.Transport.dev);
  await A.Room.join(room.code, {}, { dev: true });
  assert(A.Room.current().isHost, 'Ana is host again');
  A.Room.leave(); B.Room.leave();
});

test('rooms: a full room counts only the people there now', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  const room = await A.Room.create({ dev: true });
  const t = A.Room.current().transport;
  // Twelve old visitors who are long gone.
  for (let i = 0; i < 12; i++) {
    await t.set('players/old' + i, { name: 'Old ' + i, online: false, lastSeen: Date.now() - 86400000, joinedAt: 1 });
  }
  const B = phone(bus, 'Ben');
  await B.Room.join(room.code, {}, { dev: true });
  assert(B.Room.current(), 'Ben got in');
  assertEqual(B.Room.presentPlayers().map(function (p) { return p.name; }).sort(), ['Ana', 'Ben'], 'only people here are listed');
  A.Room.leave(); B.Room.leave();
});

test('rounds: players who left the game or stepped away are not waited for', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben'), C = phone(bus, 'Cy');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await C.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('familyQuiz', {});
  await tick(20);
  const startAt = A.Room.current().meta.startAt;
  assertEqual(A.Race.playersInGame().length, 3, 'everyone plays');

  await B.Room.markLeftGame(startAt);
  await C.Room.setAway(true);
  await tick(20);
  assertEqual(A.Race.playersInGame().map(function (p) { return p.name; }), ['Ana'], 'only Ana is waited for');

  await C.Room.setAway(false);
  await tick(20);
  assertEqual(A.Race.playersInGame().length, 2, 'Cy is back');
  A.Room.leave(); B.Room.leave(); C.Room.leave();
});

test('rooms: saved rooms are listed newest first and can be removed', function () {
  const A = phone(makeBus(), 'Ana');
  A.Room.saved.add('AAAAAA', { name: 'One' });
  A.Room.saved.add('BBBBBB', { name: 'Two' });
  A.Room.saved.touch('AAAAAA', { name: 'One renamed' });
  const list = A.Room.saved.list();
  assertEqual(list[0].code, 'AAAAAA');
  assertEqual(list[0].name, 'One renamed');
  assert(A.Room.saved.has('BBBBBB'));
  A.Room.saved.remove('BBBBBB');
  assertEqual(A.Room.saved.list().length, 1);
});

test('rooms: a room code is read from a QR link or a typed code', function () {
  const A = phone(makeBus(), 'Ana');
  assertEqual(A.Room.codeFromText('https://playmona.com/play#room=ab3xyz'), 'AB3XYZ');
  assertEqual(A.Room.codeFromText('https://playmona.com/play?x=1#room=QWE234&y'), 'QWE234');
  assertEqual(A.Room.codeFromText(' qwe 234 '), 'QWE234');
  assertEqual(A.Room.codeFromText('https://example.com/'), null);
  assertEqual(A.Room.codeFromText('hello world'), null);
});

test('game length: the number of questions and the clock come from the room', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  assertEqual(A.Race.plan(10, 50), 10, 'offline: the game keeps its own number');
  await A.Room.create({ dev: true });
  await A.Room.startGame('familyQuiz', { questions: 7 });
  await tick();
  assertEqual(A.Race.plan(10, 50), 7, 'host chose 7 questions');
  assertEqual(A.Race.plan(10, 5), 5, 'never more than the questions available');
  await A.Room.startGame('familyQuiz', { clock: 300 });
  await tick();
  assertEqual(A.Race.plan(10, 50), 50, 'clock only: questions keep coming until time is up');
  await A.Room.startGame('familyQuiz', {});
  await tick();
  assertEqual(A.Race.plan(10, 50), 10, 'neither: the game’s usual number');
  A.Room.leave();
});

test('game clock: every phone ends after the same round when time is up', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('familyQuiz', { clock: 60 });
  // Fast-forward: the game started over a minute ago.
  await A.Room.setMeta({ startAt: Date.now() - 61000 });
  await tick(20);

  const got = { A: null, B: null };
  [['A', A], ['B', B]].forEach(function (pair) {
    pair[1].Race.begin('familyQuiz', { rounds: 200 });
    pair[1].Race.onSettle(function (p) { got[pair[0]] = p; });
  });
  await A.Race.beginRound(0);
  await B.Race.beginRound(0);
  await tick(1300);                       // the round opens
  await A.Race.submit(1, true, 900);      // Ana answers first, correctly
  await tick(60);

  assert(got.A && got.B, 'both phones settled the round');
  assertEqual(got.A.timeUp, true, 'Ana: time is up');
  assertEqual(got.B.timeUp, true, 'Ben: the same answer');
  assert(A.Race.isLastRound(0, 200) && B.Race.isLastRound(0, 200), 'it was the last round on both');
  assert(A.Race.over(1) && B.Race.over(1), 'no round 2 for anyone');
  A.Race.end(); B.Race.end(); A.Room.leave(); B.Room.leave();
});
