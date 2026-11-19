'use strict';
/* Word by Word (Celebrations): the shared rules (js/celebrate/wordByWord/rules.js) and whole games
   refereed by js/celebrate/wordByWord/referee.js over the dev transport with a hand-moved clock:
   strict turns, late and wrong-team words, refused words, timeouts, points per letter, ending early,
   the MC's strike, blind mode, pause / next / end, people moving team, and a restarted referee. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/wordflow/rules.js', 'js/celebrate/wordByWord/rules.js'];

/* ---------- rules ---------- */

test('word by word rules: settings keep to the offered values', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify({ mode: 'open', rounds: 3, minUnit: 'rounds', minCount: 2, seconds: 20, opening: '', names: [] }));
  const many = ['Vics', '', 'a b', 'x'.repeat(30)];
  for (let i = 0; i < 25; i++) many.push('Name' + i);
  const s = R.sanitize({ mode: 'x', rounds: 50, seconds: 7, minUnit: 'words', minCount: 500, opening: 'Dear Vicky,' + 'x'.repeat(80), names: many });
  assertEqual(s.mode, 'open');
  assertEqual(s.rounds, 10);
  assertEqual(s.seconds, 20);
  assertEqual(s.minUnit, 'words');
  assertEqual(s.minCount, 100);
  assertEqual(s.opening.length, 60);
  assert(s.names.length <= 20, 'at most 20 names');
  assertEqual(s.names[0], 'Vics');
  s.names.forEach((n) => assert(n && n.indexOf(' ') === -1 && n.length <= 24, 'name ' + n));
  assertEqual(R.sanitize({ rounds: 3, minCount: 5 }).minCount, 3, 'never more rounds than the game has');
  assertEqual(R.sanitize({ seconds: '15', rounds: '4', mode: 'blind' }).seconds, 15, 'numbers arrive as strings from forms');
  assertEqual(R.sanitize({ seconds: '15', rounds: '4' }).rounds, 4);
  assertEqual(R.sanitize({ opening: 'Dear\u0000   Vicky ' }).opening, 'Dear Vicky');
});

test('word by word rules: letters and points', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(R.letters("Vicky's"), 6);
  assertEqual(R.letters('well-done!'), 8);
  assertEqual(R.letters('40'), 0);
  const k = R.known(['Vics'], 'Vicky Banda');
  assertEqual(R.points({ text: 'Vicky', name: true }, k), 5);
  assertEqual(R.points({ text: "Vicky's", name: true }, k), 6);
  assertEqual(R.points({ text: 'Banda.', name: true }, k), 5);
  assertEqual(R.points({ text: 'Vics', name: true }, k), 4);
  assertEqual(R.points({ text: 'Zzzzzzzzzz', name: true }, k), 1);
  assertEqual(R.points({ text: 'love', name: false }, k), 4);
  assertEqual(R.points({ text: '40', name: false }, k), 0);
});

test('word by word rules: parse allows ! and has no sentence limit', function () {
  const R = loadFF(RULES).WordByWordRules;
  const o = { isWord: (w) => w !== 'zzz', isQuiet: (w) => w === 'rudeword' };
  assertEqual(R.parse('amazing!', o).text, 'amazing!');
  assertEqual(R.parse('LOVE', o).text, 'love');
  const forced = R.parse('love', Object.assign({ capital: true }, o));
  assertEqual(forced.text, 'Love');
  assertEqual(forced.name, false, 'a forced capital is not a name');
  assertEqual(R.parse('Harare', o).name, true);
  assertEqual(R.parse('Harare', Object.assign({ capital: true }, o)).name, true, 'typed with a capital where one is due');
  assertEqual(R.parse('two words', o).error, 'spaces');
  assert(R.parse("Vicky's!", o).ok);
  assert(R.parse('40', o).ok);
  assert(R.parse('well-done', o).ok);
  assertEqual(R.parse('rudeword', o).error, 'rude');
  assertEqual(R.parse('zzz', o).error, 'unknown');
  assertEqual(R.parse('wow?', o).error, 'punct');
});

test('wordflow rules: parseWord keeps its old endings and sentence limit', function () {
  const W = loadFF(['js/core.js', 'js/wordflow/rules.js']).WordFlowRules;
  assertEqual(W.parseWord('wow!').error, 'punct');
  assertEqual(W.parseWord('cat', { position: 29 }).error, 'tooLong');
  assertEqual(W.parseWord('cat.', { position: 29 }).text, 'cat.');
});

test('word by word rules: minimum and final text', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(R.minReached({ minUnit: 'rounds', minCount: 2 }, 9, 5), false);
  assertEqual(R.minReached({ minUnit: 'rounds', minCount: 2 }, 10, 5), true);
  assertEqual(R.minReached({ minUnit: 'words', minCount: 0 }, 0, 3), true);
  assertEqual(R.minReached({ minUnit: 'words', minCount: 4 }, 3, 3), false);
  assertEqual(R.finalText('Dear Vicky,', [{ w: 'we' }, { w: 'love' }, { w: 'you' }]), 'Dear Vicky, we love you.');
  assertEqual(R.finalText('', [{ w: 'We' }, { w: 'love' }, { w: 'you!' }]), 'We love you!');
  assertEqual(R.finalText('', [{ w: 'Happy' }, { w: 'birthday,' }]), 'Happy birthday.');
});

module.exports = { RULES };
