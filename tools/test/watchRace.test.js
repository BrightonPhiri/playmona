'use strict';
/* The race layer records what each round shows (FF.Race.describe), so the
   host can publish it to viewers. The right answer stays hidden until the
   round settles. Two "phones" share one in-memory bus. */
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

const QUESTION = { kind: 'choice', text: 'Capital of Zimbabwe?', options: ['Harare', 'Lusaka', 'Gaborone', 'Maputo'] };

async function twoInARoom() {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('familyQuiz', {});
  await tick(20);
  A.Race.begin('familyQuiz', { rounds: 3 });
  B.Race.begin('familyQuiz', { rounds: 3 });
  await A.Race.beginRound(0);
  await B.Race.beginRound(0);
  return { A: A, B: B };
}
function done(A, B) { A.Race.end(); B.Race.end(); A.Room.leave(); B.Room.leave(); }

test('race screen: a described question shows without its answer until the round settles', async function () {
  const { A, B } = await twoInARoom();
  A.Race.describe(QUESTION, 0);
  const before = A.Race.screen();
  assertEqual(before.n, 0, 'round number');
  assertEqual(before.screen.text, 'Capital of Zimbabwe?');
  assertEqual(before.answer, null, 'hidden before settle');

  await tick(1300);                    // the round opens
  await B.Race.submit(0, true, 800);   // Ben answers first, correctly: the round settles
  await tick(80);
  assertEqual(A.Race.screen().answer, 0, 'revealed after settle');
  done(A, B);
});

test('race screen: onScreen fires on describe and on settle, and survives end()', async function () {
  const { A, B } = await twoInARoom();
  const seen = [];
  A.Race.onScreen(function (info) { seen.push(info && info.answer); });
  A.Race.describe(QUESTION, 0);
  assertEqual(seen.length, 1, 'fired on describe');
  assertEqual(seen[0], null, 'no answer yet');

  await tick(1300);
  await B.Race.submit(0, true, 800);
  await tick(80);
  assertEqual(seen.length, 2, 'fired on settle');
  assertEqual(seen[1], 0, 'with the answer');

  A.Race.end();
  A.Race.begin('familyQuiz', { rounds: 3 });
  await A.Race.beginRound(1);
  A.Race.describe(QUESTION, 2);
  assertEqual(seen.length, 3, 'still listening in the next game');
  done(A, B);
});

test('race screen: long text and extra options are trimmed', async function () {
  const { A, B } = await twoInARoom();
  const long = new Array(251).join('x');
  const opts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', new Array(101).join('y')];
  A.Race.describe({ kind: 'choice', text: long, options: opts }, 1);
  const s = A.Race.screen().screen;
  assertEqual(s.text.length, 200, 'text trimmed to 200');
  assertEqual(s.options.length, 6, 'at most 6 options');
  A.Race.describe({ kind: 'choice', text: 'q', options: ['a', new Array(101).join('y')] }, 1);
  assertEqual(A.Race.screen().screen.options[1].length, 80, 'option trimmed to 80');
  done(A, B);
});

test('race screen: describing offline does nothing', function () {
  const FF = phone(makeBus(), 'Solo');
  FF.Race.describe(QUESTION, 0);
  assertEqual(FF.Race.screen(), null);
});

test('race screen: only known picture kinds pass, and big drawings are dropped', async function () {
  const { A, B } = await twoInARoom();
  A.Race.describe({ kind: 'choice', text: 'q', options: ['a', 'b'], image: { flag: 'zw' } }, 0);
  assertEqual(JSON.stringify(A.Race.screen().screen.image), JSON.stringify({ flag: 'zw' }), 'flag kept');
  A.Race.describe({ kind: 'choice', text: 'q', options: ['a', 'b'], image: { svg: '<svg></svg>', onload: 'x' } }, 0);
  assertEqual(JSON.stringify(A.Race.screen().screen.image), JSON.stringify({ svg: '<svg></svg>' }), 'only the svg field');
  A.Race.describe({ kind: 'choice', text: 'q', options: ['a', 'b'], image: { svg: '<svg>' + new Array(30001).join('x') + '</svg>' } }, 0);
  assertEqual(A.Race.screen().screen.image, undefined, 'too big to send');
  A.Race.describe({ kind: 'choice', text: 'q', options: ['a', 'b'], image: { script: 'x' } }, 0);
  assertEqual(A.Race.screen().screen.image, undefined, 'unknown kind dropped');
  done(A, B);
});

test('race screen: a new game starts with no question from the last one', async function () {
  const { A, B } = await twoInARoom();
  A.Race.describe(QUESTION, 0);
  A.Race.end();
  A.Race.begin('trueOrFalse', { rounds: 3 });
  await A.Race.beginRound(0);
  assertEqual(A.Race.screen(), null, 'nothing shown until the new game says what round 1 is');
  done(A, B);
});

test('race screen: ending a game clears its question', async function () {
  const { A, B } = await twoInARoom();
  A.Race.describe(QUESTION, 0);
  A.Race.end();
  assertEqual(A.Race.screen(), null);
  done(A, B);
});
