'use strict';
/* Leaving a room game and joining back: the player catches up to the round
   everyone else is on, and the host cannot start another game while one is
   still being played. Two "phones" share one in-memory bus. */
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
  FF.Players = { AVATARS: ['fox'], COLORS: ['#8b5cf6'], get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; } };
  FF.t = function (k, f, v) { let s = f || k; Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); }); return s; };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  return FF;
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }

async function playRound(A, B, n) {
  await A.Race.beginRound(n);
  await B.Race.beginRound(n);
  await tick(1300);                       // the round opens
  await A.Race.submit(0, true, 500);      // Ana wins it
  await tick(80);
}

test('rejoin: a player who comes back skips the finished rounds and joins the one being played', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('familyQuiz', { questions: 5 });
  await tick(20);
  A.Race.begin('familyQuiz', { rounds: 5 });
  B.Race.begin('familyQuiz', { rounds: 5 });
  await playRound(A, B, 0);
  await playRound(A, B, 1);
  await A.Race.beginRound(2);              // round 3 is open, nobody has won it yet
  await tick(20);

  // Ben left the game earlier and now comes back.
  B.Race.end();
  await B.Room.markLeftGame(B.Room.current().meta.startAt);
  await B.Room.rejoinGame();
  assert(!('leftGame' in (await A.Room.current().transport.get('players/' + B.Room.current().uid))), 'Ben counts as playing again');
  B.Race.rejoinNext();
  B.Race.begin('familyQuiz', { rounds: 5 });
  await B.Race.beginRound(0);
  assertEqual(B.Race.catchingUp(), true, 'round 1 is already over: skip it');
  await B.Race.beginRound(1);
  assertEqual(B.Race.catchingUp(), true, 'round 2 too');
  await B.Race.beginRound(2);
  assertEqual(B.Race.catchingUp(), false, 'round 3 is live: play it');
  A.Race.end(); B.Race.end(); A.Room.leave(); B.Room.leave();
});

test('rejoin: a normal start never skips rounds', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana');
  await A.Room.create({ dev: true });
  await A.Room.startGame('familyQuiz', {});
  await tick(20);
  A.Race.begin('familyQuiz', { rounds: 3 });
  await A.Race.beginRound(0);
  assertEqual(A.Race.catchingUp(), false);
  A.Race.end(); A.Room.leave();
});

test('rejoin: the host cannot start another game while others are still playing', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('familyQuiz', {});
  await tick(20);
  const startAt = A.Room.current().meta.startAt;
  await A.Room.markLeftGame(startAt);       // the host leaves the game, Ben plays on
  await tick(20);
  assertEqual(A.Room.gameRunningWithoutMe(), true, 'the host sees the game is still on');
  let err = null;
  try { await A.Room.startGame('trueOrFalse', {}); } catch (e) { err = e; }
  assert(err && /still being played/.test(err.message), 'refused');
  assertEqual(A.Room.current().meta.gameId, 'familyQuiz', 'the running game is untouched');

  await B.Room.markLeftGame(startAt);       // now Ben leaves it too
  await tick(20);
  assertEqual(A.Room.gameRunningWithoutMe(), false, 'nobody is playing it any more');
  await A.Room.startGame('trueOrFalse', {});
  assertEqual(A.Room.current().meta.gameId, 'trueOrFalse', 'a new game can start');
  A.Room.leave(); B.Room.leave();
});

test('rejoin: the results screen is skipped for rounds being caught up on', async function () {
  const FF = loadFF(['js/core.js', 'js/net/raceUI.js']);
  const doc = FF.__sandbox.document;
  FF.Race = { catchingUp: function () { return true; }, scores: function () { return {}; } };
  const root = doc.createElement('div');
  let next = 0;
  FF.RaceUI.result(root, { payload: { reason: 'winner', winnerName: 'Ana' }, onNext: function () { next++; } });
  await tick(10);
  assertEqual(next, 1, 'went straight on to the next round');
  assertEqual(root.children.length, 0, 'nothing drawn');
});
