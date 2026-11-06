'use strict';
/* WordFlow's lobby settings and the shape of its database rules (no rules emulator on this PC):
   the host picks the way to play and both clocks, the server starts the game, and a word can only
   be written once, by a seat of this match, for this match, server-stamped. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/wordflow/rules.js', 'js/wordflow/client.js']);
let def = null;
FF.registerGame = function (d) { def = d; };
FF.t = function (k, fallback, vars) { return String(fallback).replace(/\{(\w+)\}/g, function (m, n) { return vars && vars[n] != null ? vars[n] : m; }); };
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/wordFlow.js'), 'utf8'), FF.__sandbox, { filename: 'wordFlow.js' });
const room = def.room;

test('wordflow lobby: registers for 2 to 12 players, with both ways to play and both clocks', function () {
  assertEqual(def.id, 'wordFlow');
  assertEqual(def.category, 'words');
  assertEqual(JSON.stringify(def.players), '[2,12]');
  assertEqual(room.minPlayers, 2);
  assert(typeof room.start === 'function', 'the server starts it');
  const fields = room.fields({}, { players: 3 });
  assertEqual(fields.map((f) => f.key).join(','), 'mode,gameSeconds,turnSeconds');
  assertEqual(fields[0].options.map((o) => o.value).join(','), 'sentences,story');
  assertEqual(fields[1].options.map((o) => o.value).join(','), '120,180,300');
  assertEqual(fields[2].options.map((o) => o.value).join(','), '10,20,30');
  assertEqual(room.summary({ mode: 'story', gameSeconds: 300, turnSeconds: 10 }, 3), 'Make a story · 5 min · 10s per word');
  assertEqual(JSON.stringify(room.sanitize({ mode: 'x' })), JSON.stringify(FF.WordFlowRules.DEFAULTS));
});

test('wordflow lobby: the settings lists match the server\'s', function () {
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/WordFlow.php'), 'utf8');
  const list = (name) => php.match(new RegExp('const ' + name + ' = \\[([^\\]]*)\\]'))[1].replace(/['\s]/g, '');
  const R = FF.WordFlowRules;
  assertEqual(list('MODES'), R.MODES.join(','));
  assertEqual(list('GAME_SECONDS'), R.GAME_SECONDS.join(','));
  assertEqual(list('TURN_SECONDS'), R.TURN_SECONDS.join(','));
});

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
const roomRules = rules.rooms.$code;

test('wordflow rules: the public view and the server paths have no client write', function () {
  assertEqual(roomRules.wf, undefined, 'rooms/$code/wf is server-only');
  assertEqual(rules.wordflowRuns, undefined);
  assertEqual(rules.wordflowState, undefined);
});

test('wordflow rules: a word is written once, by its sender, a seat, for this match, server-stamped', function () {
  const cmd = roomRules.wfInbox.$uid.$id;
  assert(cmd['.write'].indexOf('$uid === auth.uid') !== -1, 'own inbox only');
  assert(cmd['.write'].indexOf('!data.exists()') !== -1, 'written once');
  assert(cmd['.write'].indexOf("child('wf').child('seats').child(auth.uid).exists()") !== -1, 'seats only');
  assert(cmd['.write'].indexOf("child('bans')") !== -1, 'not banned');
  assertEqual(cmd.t['.validate'], 'newData.isNumber() && newData.val() === now');
  assert(cmd.matchId['.validate'].indexOf("child('wf').child('matchId').val()") !== -1, 'this match only');
  assertEqual(cmd.type['.validate'], "newData.isString() && newData.val() === 'word'");
  assert(cmd.word['.validate'].indexOf('<= ' + FF.WordFlowRules.MAX_INPUT) !== -1, 'as long as the client may send');
  assertEqual(cmd.$other['.validate'], false);
  assertEqual(roomRules.wfInbox['.write'], undefined);
  assertEqual(roomRules.wfInbox.$uid['.write'], undefined);
});
