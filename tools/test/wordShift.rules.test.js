'use strict';
/* database.rules.json for WordShift: scores are written by the server only (api/lib/WordShift.php),
   so no phone may write a WordShift board, daily row or ticket. Shape checks (no rules emulator here). */
const fs = require('fs');
const path = require('path');
const { test, assert, assertEqual, ROOT } = require('./harness');

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;

test('wordShift rules file: phones cannot write the WordShift game boards', function () {
  assert(/\$game !== 'wordShift'/.test(rules.leaderboards.$game['.validate']), rules.leaderboards.$game['.validate']);
});

test('wordShift rules file: phones cannot write a WordShift daily challenge row', function () {
  assert(/newData\.child\('game'\)\.val\(\) !== 'wordShift'/.test(rules.daily.$day.$uid['.validate']));
});

test('wordShift rules file: the WordShift daily board is read-only, tickets are server-only', function () {
  const d = rules.wordshiftDaily;
  assert(d && d.$day && d.$day['.read'], 'wordshiftDaily readable');
  assert(!/\.write/.test(JSON.stringify(d)), 'no write under wordshiftDaily');
  assertEqual(rules.wordshiftTickets, undefined);
});

test('wordShift rules file: the generator makes the same rules for the changed keys', function () {
  const gen = require('../gen-rules.js').rules;
  ['leaderboards', 'daily', 'wordshiftDaily'].forEach(function (k) {
    assertEqual(JSON.stringify(gen[k]), JSON.stringify(rules[k]), k);
  });
});
