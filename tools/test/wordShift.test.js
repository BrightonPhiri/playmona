'use strict';
/* WordShift: the pure rules (js/wordshift/rules.js) and the game's registration. */
const { loadFF, test, assert, assertEqual } = require('./harness');

let cached = null;
const rules = () => (cached || (cached = loadFF(['js/core.js', 'js/wordshift/rules.js']))).WordShiftRules;
const WORDS = new Set(['sing', 'sang', 'bang', 'band', 'bend', 'bead', 'bear', 'beer']);
const isWord = (w) => WORDS.has(w);

/* ---------- moves ---------- */

test('wordShift rules: checkMove accepts one changed letter to a real word', function () {
  assertEqual(rules().checkMove('sing', 'sang', ['sing'], isWord).ok, true);
});

test('wordShift rules: checkMove refuses the same word', function () {
  assertEqual(rules().checkMove('sing', 'sing', ['sing'], isWord).reason, 'same');
});

test('wordShift rules: checkMove refuses two changed letters', function () {
  assertEqual(rules().checkMove('sing', 'bang', ['sing'], isWord).reason, 'many');
});

test('wordShift rules: checkMove refuses a word not in the list', function () {
  assertEqual(rules().checkMove('sing', 'sinx', ['sing'], isWord).reason, 'word');
});

test('wordShift rules: checkMove refuses a used word', function () {
  assertEqual(rules().checkMove('sang', 'sing', ['sing', 'sang'], isWord).reason, 'used');
});

test('wordShift rules: checkMove refuses another length and cleans case', function () {
  assertEqual(rules().checkMove('sing', 'sin', ['sing'], isWord).reason, 'length');
  assertEqual(rules().checkMove('sing', 'SANG', ['sing'], isWord).ok, true);
});

/* ---------- greens ---------- */

test('wordShift rules: greens follow the word', function () {
  const R = rules();
  assertEqual(R.greens('bead', 'bear').join(), 'true,true,true,false');
  assertEqual(R.greens('bear', 'bear').join(), 'true,true,true,true');
  assertEqual(R.greens('beer', 'bear').join(), 'true,true,false,true');
  assertEqual(R.greens('sing', 'bear').join(), 'false,false,false,false');
});

/* ---------- scoring ---------- */

test('wordShift rules: score rewards efficient finishes', function () {
  const R = rules();
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 0 }), 200);
  assertEqual(R.score({ finished: true, moves: 8, shortest: 6, invalid: 0 }), 170);
  assertEqual(R.score({ finished: true, moves: 20, shortest: 6, invalid: 0 }), 100);
});

test('wordShift rules: score adds time left and takes off refused words', function () {
  const R = rules();
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 0, timed: true, secondsLeft: 30 }), 260);
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 3 }), 185);
  assertEqual(R.score({ finished: true, moves: 30, shortest: 4, invalid: 40 }), 0);
  assertEqual(R.score({ finished: false, moves: 3, shortest: 6, invalid: 0 }), 0);
});

/* ---------- picking puzzles ---------- */

const BANK = [
  { id: 'n1', s: 'sing', t: 'bear', n: 6, lv: 'normal' },
  { id: 'n2', s: 'cold', t: 'warm', n: 4, lv: 'normal' },
  { id: 'n3', s: 'head', t: 'tail', n: 5, lv: 'normal' },
  { id: 'e1', s: 'cat', t: 'dog', n: 3, lv: 'easy' }
];

test('wordShift rules: dailyPuzzle is the same for everyone and Normal', function () {
  const R = rules();
  const p = R.dailyPuzzle('2026-11-17', BANK);
  const normals = BANK.filter((x) => x.lv === 'normal');
  assertEqual(p.id, normals[R.fnv('wordshift|2026-11-17') % normals.length].id);
  assertEqual(R.dailyPuzzle('2026-11-17', BANK).id, p.id);
});

test('wordShift rules: fnv matches the PHP FNV-1a', function () {
  assertEqual(rules().fnv(''), 2166136261);
  assertEqual(rules().fnv('a'), 0xe40c292c);
});

test('wordShift rules: pick prefers unseen puzzles of the level', function () {
  const R = rules();
  let i = 0;
  const rand = () => [0.0, 0.5, 0.99][i++ % 3];
  for (let k = 0; k < 6; k++) {
    const p = R.pick(BANK, 'normal', ['n1', 'n2'], rand);
    assertEqual(p.id, 'n3');
  }
  assertEqual(R.pick(BANK, 'normal', ['n1', 'n2', 'n3'], rand).lv, 'normal');
  assertEqual(R.pick(BANK, 'easy', [], rand).id, 'e1');
});

test('wordShift rules: sanitize keeps only known settings', function () {
  const R = rules();
  assertEqual(JSON.stringify(R.sanitize({ mode: 'timed', level: 'hard', seconds: 90 })), JSON.stringify({ mode: 'timed', level: 'hard', seconds: 90 }));
  assertEqual(JSON.stringify(R.sanitize({ mode: 'x', level: 'y', seconds: 7 })), JSON.stringify({ mode: 'classic', level: 'normal', seconds: 120 }));
  assertEqual(JSON.stringify(R.sanitizeRoom({ level: 'expert', rounds: 5, clock: 180 })), JSON.stringify({ level: 'expert', rounds: 5, clock: 180 }));
  assertEqual(JSON.stringify(R.sanitizeRoom({ rounds: 2, clock: 1 })), JSON.stringify({ level: 'normal', rounds: 3, clock: 120 }));
});
