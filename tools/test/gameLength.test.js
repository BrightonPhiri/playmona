'use strict';
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/gameLength.js']);
  FF.Race = { active: function () { return false; } };
  return FF;
}
function api(config) { return { config: config }; }

test('Normal keeps a game’s usual number of rounds; Quick and Long scale it', function () {
  const FF = load();
  assertEqual(FF.GameLength.rounds(api({ length: 'normal' }), 10, 0), 10);
  assertEqual(FF.GameLength.rounds(api({ length: 'quick' }), 10, 0), 6);
  assertEqual(FF.GameLength.rounds(api({ length: 'long' }), 10, 0), 15);
  assertEqual(FF.GameLength.rounds(api({ length: 'quick' }), 1, 0), 1, 'never below one round');
});

test('a game clock keeps rounds coming, capped by the questions available', function () {
  const FF = load();
  const timed = api({ length: 'normal', clock: 1200 });
  assertEqual(FF.GameLength.rounds(timed, 10, 0), FF.GameLength.UNBOUNDED);
  assertEqual(FF.GameLength.rounds(timed, 10, 40), 40);
  assertEqual(FF.GameLength.roundText(7, FF.GameLength.UNBOUNDED), 'Round 7');
  assertEqual(FF.GameLength.roundText(7, 10), 'Round 7 of 10');
});

test('rooms, Game Night and TV mode ignore the local game clock', function () {
  const FF = load();
  assertEqual(FF.GameLength.timed({ clock: 300, room: true }), false);
  assertEqual(FF.GameLength.timed({ clock: 300, tournament: true }), false);
  assertEqual(FF.GameLength.timed({ clock: 300, variation: 'display' }), false);
  assertEqual(FF.GameLength.timed({ clock: 300 }), true);
  assertEqual(FF.GameLength.timed({ clock: 0 }), false);
});

test('in a room the host’s room settings decide', function () {
  const FF = load();
  FF.Race = { active: function () { return true; }, plan: function (usual, avail) { return 42; } };
  assertEqual(FF.GameLength.rounds(api({ length: 'quick', clock: 600 }), 10, 0), 42);
});

test('no game hard-codes its round count offline any more', function () {
  const dir = path.join(__dirname, '..', '..', 'js', 'games');
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert(!/config\.length === 'quick'/.test(src) || f === 'letterRush.js', f + ' still reads Quick/Long itself');
    assert(!/FF\.Race \? FF\.Race\.plan\(/.test(src), f + ' still plans rounds only in rooms');
  });
});

test('gameLength: apply sets the config and starts the clock only when timed', function () {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/gameLength.js']);
  let starts = 0, stops = 0;
  FF.GameLength.start = function () { starts++; };
  FF.GameLength.stop = function () { stops++; };
  FF.GameFlow = { current: { config: {} } };
  const api = { config: { length: 'normal', clock: 0 } };
  FF.GameLength.apply(api, { length: 'long', clock: 0 });
  assertEqual([api.config.length, api.config.clock, starts], ['long', 0, 0]);
  FF.GameLength.apply(api, { clock: 600 });
  assertEqual([api.config.clock, starts, stops >= 2], [600, 1, true]);
});
