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

test('wordShift rules: checkMove allows a word used before, marked as repeated', function () {
  const res = rules().checkMove('sang', 'sing', ['sing', 'sang'], isWord);
  assertEqual(res.ok, true);
  assertEqual(res.repeat, true);
  assertEqual(rules().checkMove('sing', 'sang', ['sing'], isWord).repeat, false);
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
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 0 }), 15);
  assertEqual(R.score({ finished: true, moves: 8, shortest: 6, invalid: 0 }), 13);
  assertEqual(R.score({ finished: true, moves: 20, shortest: 6, invalid: 0 }), 10);
});

test('wordShift rules: score adds time left and takes off refused words', function () {
  const R = rules();
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 0, timed: true, secondsLeft: 30 }), 18);
  assertEqual(R.score({ finished: true, moves: 6, shortest: 6, invalid: 3 }), 12);
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

/* ---------- typing (js/wordshift/board.js) ---------- */

let boardFF = null;
const B = () => (boardFF || (boardFF = loadFF(['js/core.js', 'js/wordshift/rules.js', 'js/wordshift/board.js']))).WordShiftBoard;

test('wordShift board: key filter keeps letters and the arrow keys only', function () {
  const k = B().keyFilter;
  assertEqual(k({ key: 'A' }), 'a');
  assertEqual(k({ key: 'r', ctrlKey: true }), null);
  assertEqual(k({ key: 'r', metaKey: true }), null);
  assertEqual(k({ key: 'x', altKey: true }), null);
  assertEqual(k({ key: 'Enter' }), null, 'no Enter: every letter is checked at once');
  assertEqual(k({ key: 'ArrowLeft' }), 'left');
  assertEqual(k({ key: 'ArrowRight' }), 'right');
  assertEqual(k({ key: '1' }), null);
  assertEqual(k({ key: 'é' }), null);
});

test('wordShift board: a letter in the selected tile gives the word to check, without changing the board', function () {
  const b = B().create('sing');
  b.select(1);
  assertEqual(b.candidate('a'), 'sang');
  assertEqual(b.word(), 'sing', 'the board waits for the check');
  assertEqual(b.candidate('i'), null, 'the same letter is not a move');
});

test('wordShift board: nothing is chosen for the player at the start', function () {
  const b = B().create('sing');
  assertEqual(b.selected(), -1, 'no tile is picked for them');
  assertEqual(b.candidate('a'), null, 'no tile, no move');
  assertEqual(Object.keys(b).filter((k) => /hint|suggest|solve|next/i.test(k)).length, 0, 'no helpers');
});

test('wordShift board: an accepted word keeps the selected tile; arrows move the selection', function () {
  const b = B().create('sing');
  b.select(1);
  b.reset('sang', true);
  assertEqual(b.word(), 'sang');
  assertEqual(b.selected(), 1);
  b.reset('bear');
  assertEqual(b.selected(), -1, 'a new puzzle starts with nothing selected');
  b.select(0);
  b.move(1); assertEqual(b.selected(), 1);
  b.move(5); assertEqual(b.selected(), 3, 'stays on the word');
  b.move(-9); assertEqual(b.selected(), 0);
});

/* ---------- moves that count ---------- */

test('wordShift rules: contractions without the apostrophe are words (dont, didnt, isnt…)', function () {
  const R = rules();
  ['dont', 'didnt', 'isnt', 'doesnt', 'wasnt', 'youre', 'theyre', 'thats'].forEach(function (w) { assert(R.isExtraWord(w), w); });
  assertEqual(R.isExtraWord('dnot'), false);
  assert(R.EXTRA_WORDS.every((w) => /^[a-z]{3,8}$/.test(w)), 'plain a-z, 3-8 letters');
});

test('wordShift: the phone accepts went and dont; the server list has them too', function () {
  const FF = loadFF(['js/core.js', 'js/data/words.js', 'js/data/wordlist.js', 'js/words.js', 'js/data/lexicon.js', 'js/wordshift/rules.js']);
  FF.Words.ready();
  ['went', 'dont', 'want', 'wont'].forEach(function (w) { assert(FF.WordShiftRules.isWord(w, FF.Words), w + ' on the phone'); });
  const server = new Set(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'api/data/wordshift-words.txt'), 'utf8').split(/\r?\n/));
  ['went', 'dont', 'didnt', 'isnt'].forEach(function (w) { assert(server.has(w), w + ' on the server'); });
});

test('wordShift rules: a refused real try (not a word, or used) counts as a move', function () {
  const R = rules();
  assertEqual(R.counts({ ok: true }), true);
  assertEqual(R.counts({ ok: false, reason: 'word' }), true);
  assertEqual(R.counts({ ok: false, reason: 'used' }), true);
  assertEqual(R.counts({ ok: false, reason: 'same' }), false);
  assertEqual(R.counts({ ok: false, reason: 'many' }), false);
});

/* ---------- the keyboard ---------- */

const PZ = { id: 'n7', s: 'cold', t: 'warm', n: 4, lv: 'normal', p: ['cord', 'card', 'ward'] };

test('wordShift rules: the keys hold the target, the path and every vowel, ten more than the word', function () {
  const keys = rules().keyLetters(PZ);
  'warm'.split('').concat('cordcardward'.split(''), 'aeiou'.split('')).forEach(function (ch) { assert(keys.indexOf(ch) !== -1, ch + ' on the keys'); });
  assertEqual(keys.length, 14, '4 letters + 10');
  assertEqual(keys.join(''), keys.slice().sort().join(''), 'in a-z order');
  assertEqual(new Set(keys).size, keys.length, 'no repeats');
});

test('wordShift rules: the keys are the same for a puzzle every time, and differ between puzzles', function () {
  const R = rules();
  assertEqual(R.keyLetters(PZ).join(''), R.keyLetters(PZ).join(''));
  const other = Object.assign({}, PZ, { id: 'n8' });
  const sets = new Set();
  for (let i = 0; i < 20; i++) sets.add(R.keyLetters(Object.assign({}, PZ, { id: 'n' + i })).join(''));
  assert(sets.size > 5, 'the extra letters change with the puzzle');
  assert(R.keyLetters(other).length === 14);
});

test('wordShift rules: a long path never loses a letter it needs', function () {
  const big = { id: 'x1', s: 'planets', t: 'strings', n: 6, lv: 'expert', p: ['plantes', 'blaming', 'quizzed', 'jukebox', 'fyvhwer'] };
  const keys = rules().keyLetters(big);
  (big.t + big.p.join('') + 'aeiou').split('').forEach(function (ch) { assert(keys.indexOf(ch) !== -1, ch); });
  assert(keys.length >= 17);
});

test('wordShift rules: every puzzle in the bank can be solved on its own keys', function () {
  const FF = loadFF(['js/core.js', 'js/wordshift/rules.js', 'js/data/wordshiftPuzzles.js']);
  const R = FF.WordShiftRules;
  FF.data.wordshift.puzzles.forEach(function (p) {
    assert(Array.isArray(p.p) && p.p.length === p.n - 1, p.id + ' has its path');
    const keys = R.keyLetters(p);
    [p.s].concat(p.p, [p.t]).reduce(function (a, b) {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert(keys.indexOf(b[i]) !== -1, p.id + ' needs ' + b[i]);
      return b;
    });
  });
});

/* ---------- registration ---------- */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('wordShift registered: solo, on the leaderboards, server-scored, listed in every page', function () {
  const src = read('js/games/wordShift.js');
  assert(/id:\s*'wordShift'/.test(src), 'registered');
  assert(/leaderboard:\s*true/.test(src), 'on the leaderboards');
  assert(/serverScored:\s*true/.test(src), 'scored by the server');
  assert(/"wordShift"/.test(read('js/icons.js')), 'has an icon');
  assert(/'wordShift'/.test(read('api/lib/Leaderboards.php')), 'server leaderboard list');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const s = read(f);
    let at = -1;
    ['js/data/wordshiftPuzzles.js', 'js/wordshift/rules.js', 'js/wordshift/board.js', 'js/wordshift/api.js', 'js/games/wordShift.js'].forEach((js) => {
      const i = s.indexOf(js);
      assert(i !== -1, f + ' loads ' + js);
      assert(i > at, f + ': ' + js + ' in order');
      at = i;
    });
  });
});

test('wordShift: phones never write WordShift scores themselves', function () {
  assert(/serverScored/.test(read('js/leaderboards.js')), 'afterGame skips server-scored games');
  assert(/serverScored/.test(read('js/social.js')), 'the daily submit skips server-scored games');
});
