'use strict';
/* What's Missing? crew players (js/crew/brains/whatsMissing.js): they work the answer out
   from the study board they saw and the changed board, miss on purpose by their accuracy,
   and answer inside the round's clock. The referee test file plays one in a whole match. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/data/memoryDecks.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/memoryAliases.js',
  'js/whatsmissing/rules.js', 'js/crew/levels.js', 'js/crew/brains/whatsMissing.js'];
let cached = null;
const app = () => cached || (cached = loadFF(FILES));

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
/* A round as a phone sees it while answering: no answer, the gaps as holes. */
function asSeen(rd) {
  const v = Object.assign({}, rd);
  delete v.answer;
  delete v.before;
  if (rd.twist === 'gone' || rd.twist === 'several') v.holes = rd.answer.slots;
  return v;
}
function roundsOf(R, level, twist) {
  const out = [];
  for (let s = 0; out.length < 6 && s < 400; s++) {
    for (let k = 0; k < 8; k++) {
      const rd = R.deal({ level, twists: 'mix' }, 'b' + s, k);
      if (rd.twist === twist) { out.push(rd); break; }
    }
  }
  return out;
}

test('wm crew: with accuracy 1 the answer is right for every twist', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  const S = FF.CrewWhatsMissing.strategy;
  [['normal', 'gone'], ['normal', 'added'], ['normal', 'swapped'], ['hard', 'several'], ['expert', 'gone'], ['expert', 'several']].forEach(([level, twist]) => {
    const list = roundsOf(R, level, twist);
    assert(list.length > 0, 'found ' + level + ' ' + twist + ' rounds');
    list.forEach((rd) => {
      const a = S.answer(asSeen(rd), rd.before, 1, seeded(3));
      assert(a, 'an answer');
      assert(R.check(rd, a).ok, level + ' ' + twist + ' right: ' + JSON.stringify(a));
      if (rd.spell) assert(Array.isArray(a.text), 'Expert gone answers are spelled');
    });
  });
});

test('wm crew: with accuracy 0 the answer is never right', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  const S = FF.CrewWhatsMissing.strategy;
  ['gone', 'added', 'swapped'].forEach((twist) => {
    roundsOf(R, 'normal', twist).forEach((rd, i) => {
      const a = S.answer(asSeen(rd), rd.before, 0, seeded(10 + i));
      assert(a && !R.check(rd, a).ok, twist + ' wrong on purpose');
    });
  });
  roundsOf(R, 'hard', 'several').forEach((rd) => {
    assertEqual(R.check(rd, S.answer(asSeen(rd), rd.before, 0, seeded(5))).rightGaps, 0, 'no gap right');
  });
  roundsOf(R, 'expert', 'gone').forEach((rd) => {
    assert(!R.check(rd, S.answer(asSeen(rd), rd.before, 0, seeded(6))).ok, 'Expert spelled wrong');
  });
});

test('wm crew: no study board seen means no answer', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  const rd = R.deal({ level: 'normal' }, 'x', 0);
  assertEqual(FF.CrewWhatsMissing.strategy.answer(asSeen(rd), null, 1, seeded(1)), null);
});

test('wm crew: delays fall within the round clock', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  const S = FF.CrewWhatsMissing.strategy;
  const rand = seeded(9);
  ['easy', 'normal', 'hard', 'expert'].forEach((level) => {
    for (let k = 0; k < 8; k++) {
      const rd = R.deal({ level }, 'd', k);
      ['easy', 'medium', 'hard'].forEach((lv) => {
        const ms = S.delay(rd, { level: lv, persona: { reaction: 50, consistency: 50 } }, rand);
        assert(ms >= 900 && ms <= rd.secs * 1000 - 1500, level + ' ' + lv + ' delay ' + ms + ' within ' + rd.secs + 's');
      });
    }
  });
  const p = S.accuracy({ level: 'hard', skill: { skill: 90 }, persona: { accuracy: 80 } }, 'normal');
  assert(p > 0.6 && p <= 0.97, 'a strong player is usually right: ' + p);
  assert(S.accuracy({ level: 'easy', skill: { skill: 10 }, persona: { accuracy: 10 } }, 'expert') < p, 'a weak one less so');
});
