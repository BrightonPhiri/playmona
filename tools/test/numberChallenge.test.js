'use strict';
/* Number Challenge: the pure rules (js/numberchallenge/rules.js) and the game's screen pieces. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const RULES = ['js/core.js', 'js/numberchallenge/rules.js'];
let cached = null;
const ff = () => cached || (cached = loadFF(RULES));
const Rof = () => ff().NumberChallengeRules;

/* ---------- settings ---------- */

test('nc rules: sanitize falls back to the standard and keeps every key', () => {
  const R = Rof();
  assertEqual(R.sanitize({}), R.STANDARD);
  assertEqual(R.sanitize({ mode: 'chain', rounds: 99 }).rounds, 5);   // chain's first option
  assertEqual(R.sanitize({ mode: 'target', level: 'expert' }).level, 'expert');
  assertEqual(R.sanitizeRoom({ time: 'none' }).time, 'normal');
  assert(R.isStandard(R.STANDARD) && !R.isStandard(R.sanitize({ level: 'hard' })));
  assertEqual(Object.keys(R.sanitize({ mode: 'sprint', sprint: 90, speed: 'fast' })), Object.keys(R.STANDARD));
  assertEqual(R.sanitize({ mode: 'sprint', sprint: 90 }).sprint, 90);
  assertEqual(R.sanitize({ sprint: 45, speed: 'zoom' }).sprint, 60);
  assertEqual(R.sanitize(null), R.STANDARD);
});

test('nc rules: seconds per item', () => {
  const R = Rof();
  const q = (o) => R.sanitize(Object.assign({ mode: 'quick' }, o));
  assertEqual(R.secondsFor(q({ time: 'quick' }), {}), 10);
  assertEqual(R.secondsFor(q({}), {}), 20);
  assertEqual(R.secondsFor(q({ time: 'relaxed', level: 'expert' }), {}), 36);
  assertEqual(R.secondsFor(q({ time: 'none' }), {}), 0);
  const c = (l) => R.sanitize({ mode: 'chain', level: l });
  assertEqual(R.secondsFor(c('hard'), {}), 10);
  assertEqual(R.secondsFor(c('expert'), {}), 16);
  const t = (l, time) => R.sanitize({ mode: 'target', level: l, time: time, rounds: 5 });
  assertEqual(R.secondsFor(t('easy', 'normal'), {}), 45);
  assertEqual(R.secondsFor(t('hard', 'quick'), {}), 68);
  assertEqual(R.secondsFor(t('expert', 'relaxed'), {}), 180);
  assertEqual(R.secondsFor(t('normal', 'none'), {}), 0);
  assertEqual(R.secondsFor(R.sanitize({ mode: 'sprint', sprint: 30 }), {}), 30);
});

test('nc rules: rng is repeatable per seed', () => {
  const R = Rof();
  const s = (r) => [r(), r(), r()].join();
  assertEqual(s(R.rng('x')), s(R.rng('x')));
  assert(s(R.rng('x')) !== s(R.rng('y')));
  const r = R.rng('ints');
  for (let i = 0; i < 500; i++) { const v = R.int(r, 3, 7); assert(v >= 3 && v <= 7 && Number.isInteger(v)); }
});

/* ---------- sums ---------- */

const nums = (text) => (String(text).match(/\d+/g) || []).map(Number);

test('nc sums: 2000 seeds per level give whole answers 0-9999 that the text proves', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 2000; s++) {
      const r = R.rng(lv + s), q = R.question(lv, 1 + (s % 5), r);
      assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 9999, lv + ' ' + q.text + ' = ' + q.answer);
      assertEqual(R.solveText(q.text), q.answer, lv + ' ' + q.text);
      assert(R.KINDS[lv].indexOf(q.kind) !== -1, lv + ' ' + q.kind);
      assertEqual(q.tier, 1 + (s % 5));
    }
  });
});

test('nc sums: every level shows all its kinds; Easy stays within 20 and its tables', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    const seen = {};
    for (let s = 0; s < 2000; s++) seen[R.question(lv, 1 + (s % 5), R.rng('k' + lv + s)).kind] = true;
    R.KINDS[lv].forEach((k) => assert(seen[k], lv + ' never shows ' + k));
  });
  assertEqual(R.KINDS.easy.slice().sort(), ['add', 'missing', 'mul', 'sequence', 'sub']);
  assert(R.KINDS.hard.indexOf('order') !== -1 && R.KINDS.hard.indexOf('percent') !== -1 && R.KINDS.normal.indexOf('order') === -1);
  assertEqual(R.KINDS.expert, R.KINDS.hard);
  for (let s = 0; s < 2000; s++) {
    const q = R.question('easy', 1 + (s % 5), R.rng('e' + s));
    if (q.kind === 'add' || q.kind === 'sub' || q.kind === 'missing') nums(q.text).concat([q.answer]).forEach((n) => assert(n <= 20, q.text));
    if (q.kind === 'mul') {
      const [a, b] = nums(q.text);
      assert([2, 5, 10].indexOf(a) !== -1 || [2, 5, 10].indexOf(b) !== -1, q.text);
      assert(a <= 10 && b <= 10, q.text);
    }
  }
  for (let s = 0; s < 2000; s++) {
    const q = R.question('normal', 1 + (s % 5), R.rng('n' + s));
    if (q.kind === 'add' || q.kind === 'sub') nums(q.text).concat([q.answer]).forEach((n) => assert(n <= 100, q.text));
    if (q.kind === 'mul') nums(q.text).forEach((n) => assert(n <= 10, q.text));
  }
});

test('nc sums: choices are 4 distinct whole numbers >= 0 with exactly one right', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 2000; s++) {
      const r = R.rng('c' + lv + s), q = R.question(lv, 1 + (s % 5), r), c = R.choicesFor(q, r);
      assertEqual(c.length, 4, q.text);
      assertEqual(new Set(c).size, 4, q.text + ' ' + c);
      assertEqual(c.filter((x) => x === q.answer).length, 1, q.text);
      c.forEach((x) => assert(Number.isInteger(x) && x >= 0, q.text + ' ' + c));
    }
  });
});

test('nc sums: no shown sequence fits two families', () => {
  const R = Rof();
  let n = 0;
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 3000; s++) {
      const q = R.question(lv, 1 + (s % 5), R.rng('q' + lv + s), 'sequence');
      assertEqual(q.kind, 'sequence');
      const terms = nums(q.text);
      assertEqual(terms.length, 4, q.text);
      assertEqual(R.seqNexts(terms), [q.answer], q.text);
      n++;
    }
  });
  assertEqual(R.seqNexts([2, 4, 6, 8]), [10]);
  assertEqual(R.seqNexts([3, 6, 12, 24]), [48]);
  assertEqual(R.seqNexts([4, 9, 16, 25]), [36]);
  assertEqual(R.seqNexts([20, 15, 10, 5]), [0]);
  assertEqual(R.seqNexts([1, 2, 4, 7]), []);
  assert(n > 0);
});

test('nc sums: solveText reads every shape the game shows', () => {
  const R = Rof();
  assertEqual(R.solveText('12 + 7 = ?'), 19);
  assertEqual(R.solveText('40 − 13 = ?'), 27);
  assertEqual(R.solveText('6 × 7 = ?'), 42);
  assertEqual(R.solveText('56 ÷ 8 = ?'), 7);
  assertEqual(R.solveText('7 + ? = 12'), 5);
  assertEqual(R.solveText('? − 4 = 9'), 13);
  assertEqual(R.solveText('20 − ? = 6'), 14);
  assertEqual(R.solveText('? × 6 = 42'), 7);
  assertEqual(R.solveText('? ÷ 3 = 9'), 27);
  assertEqual(R.solveText('4 + 3 × 5 = ?'), 19);
  assertEqual(R.solveText('25% of 80 = ?'), 20);
  assertEqual(R.solveText('¾ of 40 = ?'), 30);
  assertEqual(R.solveText('13² = ?'), 169);
  assertEqual(R.solveText('Double 34 = ?'), 68);
  assertEqual(R.solveText('Half of 46 = ?'), 23);
  assertEqual(R.solveText('3, 7, 11, 15, ?'), 19);
  assertEqual(R.solveText('nonsense'), null);
});

test('nc sums: check takes digits only', () => {
  const R = Rof();
  const q = { answer: 7 };
  assert(R.check(q, '7') && R.check(q, '007') && R.check(q, ' 7 ') && R.check(q, 7));
  assert(!R.check(q, '') && !R.check(q, '8') && !R.check(q, 'seven') && !R.check(q, null) && !R.check(q, '7.0') && !R.check(q, '-7'));
});

test('nc points: standard Quick sums score exactly as the old game; Sprint by tier', () => {
  const R = Rof();
  assertEqual(R.points('quick', { level: 'normal', ms: 1500, right: true }), 225);
  assertEqual(R.points('quick', { level: 'normal', ms: 8500, right: true }), 188);
  assertEqual(R.points('quick', { level: 'normal', ms: 20000, right: true }), 150);
  assertEqual(R.points('quick', { level: 'easy', ms: 2000, right: true }), 150);
  assertEqual(R.points('quick', { level: 'expert', ms: 20000, right: true }), 250);
  assertEqual(R.points('quick', { level: 'hard', ms: 0, right: false }), 0);
  assertEqual(R.points('sprint', { level: 'normal', tier: 3, right: true }), 60);
  assertEqual(R.points('sprint', { level: 'expert', tier: 5, right: true }), 125);
  assertEqual(R.points('sprint', { level: 'easy', tier: 1, right: false }), 0);
  assertEqual(R.tierAt(0), 1); assertEqual(R.tierAt(3), 1); assertEqual(R.tierAt(4), 2); assertEqual(R.tierAt(16), 5); assertEqual(R.tierAt(140), 5);
  assertEqual(R.penaltyMs('easy'), 2000); assertEqual(R.penaltyMs('expert'), 3000);
  assertEqual(R.speedBonus(null), 0); assertEqual(R.speedBonus(15000), 0); assertEqual(R.speedBonus(2000), 50);
});

test('nc sums: a missing-number choice is never a number shown in the sum', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 1500; s++) {
      const r = R.rng('m' + lv + s), q = R.question(lv, 1 + (s % 5), r, 'missing'), shown = nums(q.text);
      R.choicesFor(q, r).forEach((c) => assert(c === q.answer || shown.indexOf(c) === -1, q.text + ' offers ' + c));
    }
  });
});

/* ---------- chain ---------- */

const STEPS = { easy: 3, normal: 5, hard: 7, expert: 7 };

test('nc chain: 2000 seeds per level keep every value whole within 0-999, the right step count, and answer = last value', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 2000; s++) {
      const c = R.chain(lv, R.rng('ch' + lv + s));
      assertEqual(c.kind, 'chain');
      assertEqual(c.steps.length, STEPS[lv], lv);
      assertEqual(c.values.length, STEPS[lv]);
      let v = c.start;
      assert(Number.isInteger(v) && v >= 0 && v <= 999);
      c.steps.forEach((st, i) => {
        v = st.op === '+' ? v + st.n : st.op === '-' ? v - st.n : st.op === 'x' ? v * st.n : st.op === '/' ? v / st.n : st.op === 'double' ? v * 2 : v / 2;
        assert(Number.isInteger(v) && v >= 0 && v <= 999, lv + ' step ' + i + ' gives ' + v);
        assertEqual(c.values[i], v);
        assert(typeof st.label === 'string' && st.label.length > 0);
      });
      assertEqual(c.answer, v);
    }
  });
});

test('nc chain: Easy uses only + and - up to 10, Normal never x4 or /', () => {
  const R = Rof();
  for (let s = 0; s < 2000; s++) {
    R.chain('easy', R.rng('ce' + s)).steps.forEach((st) => assert((st.op === '+' || st.op === '-') && st.n >= 1 && st.n <= 10, JSON.stringify(st)));
    assert(R.chain('easy', R.rng('cs' + s)).start <= 10);
    R.chain('normal', R.rng('cn' + s)).steps.forEach((st) => {
      assert(['+', '-', 'x', 'half'].indexOf(st.op) !== -1, st.op);
      if (st.op === 'x') assert(st.n === 2 || st.n === 3);
      if (st.op === '+' || st.op === '-') assert(st.n <= 20);
    });
  }
  const ops = {};
  for (let s = 0; s < 2000; s++) R.chain('hard', R.rng('ch' + s)).steps.forEach((st) => { ops[st.op] = true; });
  assertEqual(Object.keys(ops).sort(), ['+', '-', '/', 'double', 'half', 'x']);
});

test('nc chain: choices 4 distinct, one right, and chainText writes it out', () => {
  const R = Rof();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 1000; s++) {
      const r = R.rng('cc' + lv + s), c = R.chain(lv, r), ch = R.choicesFor(c, r);
      assertEqual(new Set(ch).size, 4); assertEqual(ch.filter((x) => x === c.answer).length, 1);
      ch.forEach((x) => assert(Number.isInteger(x) && x >= 0));
    }
  });
  const item = { start: 6, steps: [{ op: '+', n: 4 }, { op: 'x', n: 2 }, { op: '-', n: 5 }, { op: 'half', n: 0 }], values: [10, 20, 15, 7] };
  assertEqual(R.chainText({ start: 6, steps: item.steps.slice(0, 3), values: [10, 20, 15] }), '6 → +4 → 10 → ×2 → 20 → −5 → 15');
});

test('nc chain: points', () => {
  const R = Rof();
  assertEqual(R.points('chain', { level: 'normal', steps: 5, ms: 0, limitMs: 10000, right: true }), 300);
  assertEqual(R.points('chain', { level: 'expert', steps: 7, ms: 16000, limitMs: 16000, right: true }), 390);
  assertEqual(R.points('chain', { level: 'easy', steps: 3, ms: 5000, limitMs: 10000, right: true }), 155);
  assertEqual(R.points('chain', { level: 'hard', steps: 7, ms: 1000, limitMs: 10000, right: false }), 0);
  assertEqual(R.points('chain', { level: 'easy', steps: 3, ms: 1000, limitMs: 0, right: true }), 130);
});
