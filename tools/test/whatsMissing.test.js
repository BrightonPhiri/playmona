'use strict';
/* What's Missing? (js/whatsmissing/rules.js): settings, the seeded boards, the
   twist plan, answer choices, checks, points and Expert names; and that the game
   is registered everywhere it must be. The referee has its own file. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/data/memoryDecks.js', 'js/answerMatch.js', 'js/data/memoryAliases.js', 'js/whatsmissing/rules.js'];
let cached = null;
const app = () => cached || (cached = loadFF(RULES));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const LEVELS = ['easy', 'normal', 'hard', 'expert'];
function filled(board) { return board.filter((x) => x != null); }
function unique(list) { return new Set(list).size === list.length; }

/* ---------- settings and the board shape ---------- */

test('wm settings: sanitize falls back to the standard; only rounds stay standard', function () {
  const R = app().WhatsMissingRules;
  assertEqual(JSON.stringify(R.sanitize({ level: 'x', theme: 'mars', seconds: 7 })), JSON.stringify(R.STANDARD));
  assertEqual(JSON.stringify(R.STANDARD), JSON.stringify({ level: 'normal', theme: 'mix', seconds: 5, choices: 6, twists: 'mix', rounds: 8 }));
  assert(R.isStandard({ rounds: 5 }), 'rounds are the game length');
  assert(!R.isStandard({ choices: 4 }));
  assert(!R.isStandard({ level: 'endless' }));
  assert(!R.isStandard({ theme: 'sea' }));
  assertEqual(R.sanitize({ seconds: '12', choices: '8' }).seconds, 12);
});

test('wm grid: slots by picture count, always room for one more', function () {
  const R = app().WhatsMissingRules;
  const want = { 3: '3x2', 4: '3x2', 6: '3x3', 8: '4x3', 12: '4x4', 16: '5x4', 20: '5x5', 24: '6x5' };
  Object.keys(want).forEach((n) => {
    const g = R.grid(Number(n));
    assertEqual(g.cols + 'x' + g.rows, want[n], 'n=' + n);
    assert(g.cols * g.rows > Number(n), 'room for Added at n=' + n);
  });
});

test('wm pictures: 4, 6, 8 by level; Expert starts at 10 and grows to 16', function () {
  const R = app().WhatsMissingRules;
  assertEqual([R.picturesAt('easy', 0), R.picturesAt('normal', 5), R.picturesAt('hard', 2)].join(), '4,6,8');
  assertEqual([R.picturesAt('expert', 0), R.picturesAt('expert', 3), R.picturesAt('expert', 9)].join(), '10,13,16');
});

/* ---------- the deal ---------- */

test('wm deal: the same seed deals the same rounds; another seed differs', function () {
  const R = app().WhatsMissingRules;
  const S = R.sanitize({});
  let differs = false;
  for (let k = 0; k < 8; k++) {
    assertEqual(JSON.stringify(R.deal(S, 'abc', k)), JSON.stringify(R.deal(S, 'abc', k)), 'k=' + k);
    if (JSON.stringify(R.deal(S, 'abc', k)) !== JSON.stringify(R.deal(S, 'abd', k))) differs = true;
  }
  assert(differs, 'another seed deals other boards');
});

function checkBoard(R, r, label) {
  assertEqual(r.slots, r.cols * r.rows, label + ' slots');
  assertEqual(r.before.length, r.slots, label + ' before length');
  assertEqual(r.after.length, r.slots, label + ' after length');
  const b = filled(r.before);
  assertEqual(b.length, r.n, label + ' pictures');
  assert(unique(b), label + ' unique pictures');
  const a = filled(r.after);
  if (r.twist === 'gone') {
    assertEqual(a.length, r.n - 1, label);
    assertEqual(r.after[r.answer.slots[0]], null, label + ' gap');
    assertEqual(r.before[r.answer.slots[0]], r.answer.ids[0], label + ' gap held the answer');
    assertEqual(r.gaps, 1, label);
  } else if (r.twist === 'added') {
    assertEqual(a.length, r.n + 1, label);
    const s = r.answer.slots[0];
    assertEqual(r.before[s], null, label + ' newcomer slot was empty');
    assertEqual(r.after[s], r.answer.ids[0], label);
    assert(b.indexOf(r.answer.ids[0]) === -1, label + ' newcomer is new');
  } else if (r.twist === 'swapped') {
    const [x, y] = r.answer.slots;
    assert(x < y, label + ' slots ascending');
    const diff = [];
    for (let i = 0; i < r.slots; i++) if (r.before[i] !== r.after[i]) diff.push(i);
    assertEqual(diff.join(), x + ',' + y, label + ' only the two differ');
    assertEqual(r.after[x], r.before[y], label);
    assertEqual(r.after[y], r.before[x], label);
  } else if (r.twist === 'several') {
    assert(r.gaps >= 2 && r.gaps <= 3, label + ' gaps');
    assertEqual(a.length, r.n - r.gaps, label);
    assertEqual(r.answer.slots.length, r.gaps, label);
    assertEqual(r.answer.slots.slice().sort((p, q) => p - q).join(), r.answer.slots.join(), label + ' ascending');
    r.answer.slots.forEach((s, i) => { assertEqual(r.after[s], null, label); assertEqual(r.before[s], r.answer.ids[i], label); });
  } else {
    assert(false, label + ' unknown twist ' + r.twist);
  }
}

test('wm deal: every level deals a fair board and a true change', function () {
  const R = app().WhatsMissingRules;
  LEVELS.forEach((level) => {
    const S = R.sanitize({ level });
    ['s1', 's2', 's3', 's4', 's5'].forEach((seed) => {
      for (let k = 0; k < 8; k++) {
        const r = R.deal(S, seed, k);
        assertEqual(r.n, R.picturesAt(level, k), level + ' n');
        checkBoard(R, r, level + ' ' + seed + ' k' + k);
      }
    });
  });
});

test('wm twists: round 1 is Gone, never three alike, only allowed ones, Gone only works', function () {
  const R = app().WhatsMissingRules;
  for (let i = 0; i < 200; i++) {
    LEVELS.forEach((level) => {
      const S = R.sanitize({ level });
      const plan = R.twistPlan(S, 'seed' + i, 12);
      assertEqual(plan[0], 'gone');
      for (let k = 2; k < plan.length; k++) assert(!(plan[k] === plan[k - 1] && plan[k] === plan[k - 2]), 'no triple at ' + k);
      plan.forEach((t, k) => assert(R.twistsAllowed(level, R.picturesAt(level, k)).indexOf(t) !== -1, level + ' allows ' + t));
    });
  }
  assertEqual(R.twistPlan(R.sanitize({ twists: 'gone', level: 'hard' }), 'x', 10).filter((t) => t !== 'gone').length, 0);
  assertEqual(R.twistsAllowed('easy', 4).join(), 'gone,added');
  assertEqual(R.twistsAllowed('normal', 6).join(), 'gone,added,swapped');
  assertEqual(R.twistsAllowed('hard', 8).join(), 'gone,added,swapped,several');
  const gapsHard = new Set(), gapsExpert = new Set();
  for (let i = 0; i < 60; i++) {
    for (let k = 0; k < 8; k++) {
      const h = R.deal(R.sanitize({ level: 'hard' }), 'g' + i, k);
      if (h.twist === 'several') gapsHard.add(h.gaps);
      const e = R.deal(R.sanitize({ level: 'expert' }), 'g' + i, k);
      if (e.twist === 'several') gapsExpert.add(e.gaps);
    }
  }
  assertEqual(Array.from(gapsHard).join(), '2');
  assertEqual(Array.from(gapsExpert).sort().join(), '2,3');
});

test('wm choices: the setting count, every answer in, nothing else from the board, same decks', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  [4, 6, 8].forEach((choices) => {
    LEVELS.filter((l) => l !== 'expert').forEach((level) => {
      for (let i = 0; i < 20; i++) {
        for (let k = 0; k < 8; k++) {
          const r = R.deal(R.sanitize({ level, choices }), 'c' + i, k);
          if (r.twist !== 'gone' && r.twist !== 'several') { assertEqual(r.choices, null); continue; }
          assertEqual(r.choices.length, choices, 'count');
          assert(unique(r.choices), 'no repeats');
          r.answer.ids.forEach((id) => assert(r.choices.indexOf(id) !== -1, 'answer listed'));
          r.choices.forEach((id) => {
            if (r.answer.ids.indexOf(id) !== -1) return;
            assert(r.before.indexOf(id) === -1, 'a decoy is never a board picture');
            const decks = filled(r.before).map((x) => R.cardOf(x).deck);
            assert(decks.indexOf(R.cardOf(id).deck) !== -1, 'decoys share a deck with the board');
          });
        }
      }
    });
  });
});

test('wm theme: one deck only, and a small theme still deals Expert and Endless boards', function () {
  const R = app().WhatsMissingRules;
  for (let k = 0; k < 8; k++) filled(R.deal(R.sanitize({ theme: 'sea' }), 't', k).before).forEach((id) => assertEqual(R.cardOf(id).deck, 'sea'));
  for (let k = 0; k <= 12; k++) {
    const r = R.deal(R.sanitize({ level: 'expert', theme: 'sea', choices: 8 }), 'tiny', k);
    checkBoard(R, r, 'expert sea k' + k);
    if (r.choices) { assertEqual(r.choices.length, 8); assert(unique(r.choices)); }
  }
  for (let k = 0; k < 10; k++) {
    const r = R.deal(R.sanitize({ level: 'endless', theme: 'sea', choices: 8 }), 'big', k, { n: 24, prev: [] });
    checkBoard(R, r, 'endless sea k' + k);
    if (r.choices) assertEqual(r.choices.length, 8);
  }
});

test('wm expert: only spellable pictures on the board, and gaps are spelled', function () {
  const R = app().WhatsMissingRules;
  for (let i = 0; i < 20; i++) {
    for (let k = 0; k < 8; k++) {
      const r = R.deal(R.sanitize({ level: 'expert' }), 'e' + i, k);
      filled(r.before).concat(filled(r.after)).forEach((id) => assert(R.spellable(R.cardOf(id).name), id + ' spellable'));
      assertEqual(r.spell, r.twist === 'gone' || r.twist === 'several', 'spell on gaps only');
      if (r.spell) assertEqual(r.choices, null);
    }
  }
  assert(R.spellable('Hot dog') && R.spellable('Sea-urchin') && !R.spellable('X') && !R.spellable('A very long picture name'));
});

test('wm secs: 20 seconds, +6 on Expert, +5 for each extra gap', function () {
  const R = app().WhatsMissingRules;
  for (let k = 0; k < 8; k++) {
    const r = R.deal(R.sanitize({ level: 'hard' }), 'z', k);
    assertEqual(r.secs, 20 + 5 * (r.gaps - 1));
    const e = R.deal(R.sanitize({ level: 'expert' }), 'z', k);
    assertEqual(e.secs, 26 + 5 * (e.gaps - 1));
  }
});
