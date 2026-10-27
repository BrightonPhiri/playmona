'use strict';
/* The Imposters lobby settings (def.room in js/games/imposters.js, drawn by js/net/roomUI.js):
   the imposter choice only appears at 6+ players, 3-5 show a fixed-one note, a room that drops
   to five is put back to one imposter, and the host's phone never starts the game itself. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/imposters/rules.js', 'js/imposters/client.js']);
let def = null;
FF.registerGame = function (d) { def = d; };
FF.t = function (k, fallback, vars) { return String(fallback).replace(/\{(\w+)\}/g, function (m, n) { return vars && vars[n] != null ? vars[n] : m; }); };
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/imposters.js'), 'utf8'), FF.__sandbox, { filename: 'imposters.js' });
const room = def.room;

const keys = (n, gs) => room.fields(gs || { mode: 'word' }, { players: n }).map((f) => f.key || 'note');

test('imposters lobby: the game registers for 3 to 12 players with its own lobby settings', function () {
  assertEqual(def.id, 'imposters');
  assertEqual(JSON.stringify(def.players), '[3,12]');
  assertEqual(room.minPlayers, 3);
  assert(typeof room.start === 'function', 'the server starts it');
});

test('imposters lobby: the imposter choice shows only with 6 or more players', function () {
  [3, 4, 5].forEach((n) => {
    assert(keys(n).indexOf('imposters') === -1, n + ' players: no choice');
    assert(keys(n).indexOf('note') !== -1, n + ' players: says it uses 1 imposter');
  });
  [6, 9, 12].forEach((n) => assert(keys(n).indexOf('imposters') !== -1, n + ' players: choose 1 or 2'));
  const note = room.fields({ mode: 'word' }, { players: 5 }).filter((f) => f.note)[0].note;
  assert(/1 imposter/.test(note), note);
});

test('imposters lobby: clue time is a Word Imposter setting only', function () {
  assert(keys(6, { mode: 'word' }).indexOf('clueSeconds') !== -1);
  assert(keys(6, { mode: 'number' }).indexOf('clueSeconds') === -1);
});

test('imposters lobby: a room that drops to five goes back to one imposter', function () {
  const six = room.sanitize({ mode: 'word', imposters: 2, rounds: 5 }, 6);
  assertEqual(six.imposters, 2);
  const five = room.sanitize(six, 5);
  assertEqual(five.imposters, 1);
  assert(JSON.stringify(five) !== JSON.stringify(six), 'roomUI sees the change and re-picks for everyone');
  assert(/1 imposter/.test(room.refitText(five, 5)));
  // Back up to six keeps one: the host chooses again, nothing raises it by itself.
  assertEqual(room.sanitize(five, 6).imposters, 1);
});

test('imposters lobby: the summary names the mode, imposters and rounds', function () {
  const s = room.summary({ mode: 'number', imposters: 2, rounds: 3, discussSeconds: 60 }, 7);
  assert(/Number Imposter/.test(s) && /2 imposters/.test(s) && /3 rounds/.test(s), s);
  assert(!/for clues/.test(s), 'no clue time in Number Imposter');
});

test('imposters lobby: roomUI waits for the minimum and lets the game start itself', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/if \(shortOf\(pick\.gameId, FF\.Room\.presentPlayers\(\)\)\) return;/.test(src), 'no countdown below the minimum');
  assert(/gr && gr\.start \? gr\.start\(s, pick\)/.test(src), 'a server-started game is not started by the host phone');
  assert(/pickDef\.room\.sanitize\(pick\.settings/.test(src), 're-fits the pick when players come and go');
});

test('imposters lobby: settings read back with their keys in another order still count as the same', function () {
  // Firebase returns object keys sorted; comparing JSON text would re-pick for ever.
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8'), FF.__sandbox, { filename: 'roomUI.js' });
  const same = FF.RoomUI.sameSettings;
  const fitted = room.sanitize({ mode: 'word', imposters: 2, rounds: 4 }, 6);
  const sorted = {};
  Object.keys(fitted).sort().forEach((k) => { sorted[k] = fitted[k]; });
  assert(JSON.stringify(sorted) !== JSON.stringify(fitted), 'the test really reorders the keys');
  assertEqual(same(fitted, sorted), true);
  assertEqual(same(room.sanitize(sorted, 6), sorted), true, 'a fitted pick is left alone');
  assertEqual(same(room.sanitize(sorted, 5), sorted), false, 'dropping to five still re-picks');
  assertEqual(same({ a: 1 }, { a: 1, b: 2 }), false);
  assertEqual(same(null, {}), true);
});
