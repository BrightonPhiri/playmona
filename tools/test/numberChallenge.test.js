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

/* ---------- make the target ---------- */

const TILES = { easy: 4, normal: 5, hard: 6, expert: 6 };
const RANGE = { easy: [10, 30], normal: [20, 100], hard: [101, 500], expert: [101, 500] };
function twoTileValues(tiles, ops) {
  const out = new Set();
  for (let i = 0; i < tiles.length; i++) for (let j = 0; j < tiles.length; j++) {
    if (i === j) continue;
    const a = tiles[i], b = tiles[j];
    if (ops.indexOf('+') !== -1) out.add(a + b);
    if (ops.indexOf('-') !== -1) out.add(a - b);
    if (ops.indexOf('*') !== -1) out.add(a * b);
    if (ops.indexOf('/') !== -1 && b && a % b === 0) out.add(a / b);
  }
  return out;
}

test('nc target: 500 seeds per level deal the right tiles, and the own solution replays to the target', () => {
  const R = Rof();
  const t0 = Date.now();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 500; s++) {
      const t = R.target(lv, R.rng('t' + lv + s));
      assertEqual(t.kind, 'target');
      assertEqual(t.tiles.length, TILES[lv], lv);
      assert(t.target >= RANGE[lv][0] && t.target <= RANGE[lv][1], lv + ' target ' + t.target);
      assertEqual(t.ops, { easy: ['+', '-'], normal: ['+', '-', '*'], hard: ['+', '-', '*', '/'], expert: ['+', '-', '*', '/'] }[lv]);
      const res = R.targetResult(t, R.submitText(t.solution, t.target));
      assert(res.ok && res.off === 0, lv + ' ' + JSON.stringify(t));
      if (lv === 'expert') assert(res.usedAll, 'expert solution uses every tile: ' + t.solution);
      assert(t.tiles.indexOf(t.target) === -1, 'target is a tile');
      assert(!twoTileValues(t.tiles, t.ops).has(t.target), 'two tiles make ' + t.target + ' from ' + t.tiles);
      const small = t.tiles.filter((x) => x <= 10).length;
      if (lv === 'normal') assert(small >= 4 && t.tiles.every((x) => x <= 10 || x === 20 || x === 25) && t.tiles.filter((x) => [10, 20, 25].indexOf(x) !== -1).length >= 1, t.tiles.join());
      if (lv === 'hard' || lv === 'expert') assert(t.tiles.filter((x) => [25, 50, 75, 100].indexOf(x) !== -1).length === 2);
      if (lv === 'easy') t.tiles.forEach((x) => assert(x >= 1 && x <= 10));
    }
  });
  assert(Date.now() - t0 < 10000, 'dealing took ' + (Date.now() - t0) + ' ms');
});

test('nc target: replay refuses missing or reused tiles, 0, negatives and inexact division', () => {
  const R = Rof();
  const T = [25, 4, 7, 3], ALL = ['+', '-', '*', '/'];
  assert(R.replay(T, ALL, '25*4,100+7').ok);
  assertEqual(R.replay(T, ALL, '25*4,100+7').left.slice().sort((a, b) => a - b), [3, 107]);
  assert(R.replay(T, ALL, '').ok);
  ['25*25', '25-25', '3-7', '7/3', '9+1', '25*4,25+1', '25+', 'abc', '25*4,,7+3', '4/0'].forEach((s) => assert(!R.replay(T, ALL, s).ok, s));
  assert(!R.replay(T, ['+', '-'], '25*4').ok, 'sign not allowed at this level');
  assertEqual(R.targetResult({ tiles: T, ops: ALL, target: 107 }, '25*4,100+7;107'), { ok: true, value: 107, off: 0, usedAll: false });
  assertEqual(R.targetResult({ tiles: T, ops: ALL, target: 107 }, '25*4,100+7,107*3,321/7;') .ok, false);
  assertEqual(R.targetResult({ tiles: [2, 3], ops: ALL, target: 6 }, '2*3;6'), { ok: true, value: 6, off: 0, usedAll: true });
  assertEqual(R.targetResult({ tiles: T, ops: ['+'], target: 30 }, ';25').off, 5);
  assert(!R.targetResult({ tiles: T, ops: ['+'], target: 30 }, ';99').ok);
  assert(!R.targetResult({ tiles: T, ops: ['+'], target: 30 }, '25').ok);
  assert(!R.targetResult({ tiles: T, ops: ['+'], target: 30 }, null).ok);
});

test('nc target: the solver finds an exact way, and an all-tile way when asked', () => {
  const R = Rof();
  const t0 = Date.now();
  R.LEVELS.forEach((lv) => {
    for (let s = 0; s < 40; s++) {
      const t = R.target(lv, R.rng('sv' + lv + s));
      const best = R.solveTarget(t.tiles, t.target, t.ops, { allTiles: lv === 'expert' });
      assertEqual(best.off, 0, lv + ' ' + t.tiles + ' -> ' + t.target);
      const res = R.targetResult(t, R.submitText(best.steps, best.value));
      assert(res.ok && res.off === 0, best.steps);
      if (lv === 'expert') assert(res.usedAll, 'all tiles: ' + best.steps);
    }
  });
  const near = R.solveTarget([1, 2], 50, ['+', '-'], {});
  assertEqual(near.value, 3); assertEqual(near.off, 47);
  assert(Date.now() - t0 < 15000, 'solving took ' + (Date.now() - t0) + ' ms');
});

test('nc target: points bands', () => {
  const R = Rof();
  assertEqual(R.points('target', { level: 'normal', off: 0, usedAll: false, ms: 0, limitMs: 60000 }), 225);
  assertEqual(R.points('target', { level: 'easy', off: 2, ms: 0, limitMs: 45000 }), 50);
  assertEqual(R.points('target', { level: 'easy', off: 4, ms: 0, limitMs: 45000 }), 25);
  assertEqual(R.points('target', { level: 'easy', off: 6, ms: 0, limitMs: 45000 }), 0);
  assertEqual(R.points('target', { level: 'hard', off: 5, ms: 0, limitMs: 90000 }), 100);
  assertEqual(R.points('target', { level: 'hard', off: 7, ms: 0, limitMs: 90000 }), 50);
  assertEqual(R.points('target', { level: 'hard', off: 11, ms: 0, limitMs: 90000 }), 0);
  assertEqual(R.points('target', { level: 'expert', off: 0, usedAll: true, ms: 120000, limitMs: 120000 }), 250);
  assertEqual(R.points('target', { level: 'expert', off: 0, usedAll: false, ms: 120000, limitMs: 120000 }), 200);
  assertEqual(R.points('target', { level: 'expert', off: 3, usedAll: true, ms: 0, limitMs: 120000 }), 100);
  assertEqual(R.points('target', { level: 'normal', off: null }), 0);
});

/* ---------- deals ---------- */

const keyOf = (it) => it.kind === 'chain' ? JSON.stringify([it.start, it.steps]) : it.kind === 'target' ? it.tiles.join(',') + '>' + it.target : it.text;

test('nc deal: seeded and repeatable for every mode and level, with the right counts', () => {
  const R = Rof();
  R.MODES.forEach((mode) => R.LEVELS.forEach((level) => {
    const s = R.sanitize({ mode, level });
    const a = R.deal(s, 'seed-1'), b = R.deal(s, 'seed-1'), c = R.deal(s, 'seed-2');
    assertEqual(JSON.stringify(a), JSON.stringify(b), mode + ' ' + level);
    assert(JSON.stringify(a) !== JSON.stringify(c));
    assertEqual(a.items.length, mode === 'sprint' ? 150 : s.rounds, mode);
    assertEqual(new Set(a.items.map(keyOf)).size, a.items.length, mode + ' ' + level + ' repeats an item');
    assertEqual(JSON.stringify(R.itemAt(s, 'seed-1', 2)), JSON.stringify(a.items[2]));
  }));
  const sp = R.deal(R.sanitize({ mode: 'sprint' }), 'x').items;
  sp.forEach((it, i) => assertEqual(it.tier, R.tierAt(i)));
});

test('nc deal: Expert items have no choices, others have 4 with the answer', () => {
  const R = Rof();
  ['quick', 'sprint', 'chain'].forEach((mode) => R.LEVELS.forEach((level) => {
    R.deal(R.sanitize({ mode, level }), 'ch').items.forEach((it) => {
      if (level === 'expert') assertEqual(it.choices, null);
      else { assertEqual(it.choices.length, 4); assert(it.choices.indexOf(it.answer) !== -1); }
    });
  }));
});

test('nc deal: player 2 is matched in kind and tier but has different numbers', () => {
  const R = Rof();
  let same = 0, total = 0;
  ['quick', 'sprint', 'chain', 'target'].forEach((mode) => {
    for (let s = 0; s < 30; s++) {
      const set = R.sanitize({ mode, level: 'hard' });
      const p0 = R.deal(set, 'm' + s).items, p1 = R.deal(set, 'm' + s, 1).items;
      p0.forEach((it, k) => {
        assertEqual(p1[k].kind, it.kind, mode);
        if (it.tier) assertEqual(p1[k].tier, it.tier);
        if (it.kind === 'chain') assertEqual(p1[k].steps.length, it.steps.length);
        if (it.kind === 'target') assertEqual(p1[k].tiles.length, it.tiles.length);
        if (R.itemAt(set, 'm' + s, k, 1) && keyOf(R.itemAt(set, 'm' + s, k, 1)) !== keyOf(p1[k])) throw new Error('itemAt and deal disagree');
        total++; if (keyOf(p1[k]) === keyOf(it)) same++;
      });
    }
  });
  assert(same / total < 0.1, same + ' of ' + total + ' matched items are identical');
});

/* ---------- judging an answer, and the Sprint clock (shared by the screen and the referee) ---------- */

test('nc judge: a standard run answered right at 1.5 s scores 10 x 225, as the old game', () => {
  const R = Rof();
  const items = R.deal(R.STANDARD, 'old-game').items;
  const total = items.reduce((sum, it) => sum + R.judge(R.STANDARD, it, String(it.answer), 1500).points, 0);
  assertEqual(total, 2250);
  assertEqual(R.judge(R.STANDARD, items[0], String(items[0].answer + 1), 1500), { ok: false, points: 0 });
  assertEqual(R.judge(R.STANDARD, items[0], null, 20000).ok, false);
});

test('nc judge: chain and target answers', () => {
  const R = Rof();
  const cs = R.sanitize({ mode: 'chain', level: 'normal' });
  const c = R.deal(cs, 'j').items[0];
  assertEqual(R.judge(cs, c, String(c.answer), 0).points, 300);
  const ts = R.sanitize({ mode: 'target', level: 'expert' });
  const tg = R.deal(ts, 'j').items[0];
  const exact = R.judge(ts, tg, R.submitText(tg.solution, tg.target), 120000);
  assertEqual(exact, { ok: true, points: 250, off: 0, usedAll: true, value: tg.target });
  const one = R.judge(ts, tg, R.submitText('', tg.tiles[0]), 0);
  assertEqual(one.ok, false, 'ok means the target was hit');
  assertEqual(one.points, R.points('target', { level: 'expert', off: one.off, usedAll: false, ms: 0, limitMs: 120000 }));
  assertEqual(R.judge(ts, tg, 'rubbish', 0), { ok: false, points: 0, off: null, usedAll: false, value: null });
});

test('nc sprint: a wrong answer takes the penalty off the end and moves on', () => {
  const R = Rof();
  const s = R.sanitize({ mode: 'sprint', level: 'normal', sprint: 60 });
  const items = R.deal(s, 'sp').items;
  const st = R.sprintCreate(s, 1000);
  assertEqual(R.sprintEndAt(st), 61000);
  const a = R.sprintAnswer(st, items, String(items[0].answer), 2000);
  assertEqual([a.right, a.points, a.penaltyMs, st.i, st.score], [true, 30, 0, 1, 30]);
  const b = R.sprintAnswer(st, items, '99999', 3000);
  assertEqual([b.right, b.points, b.penaltyMs, st.i, st.wrong], [false, 0, 3000, 2, 1]);
  assertEqual(R.sprintEndAt(st), 58000);
  assertEqual(st.streak, 0); assertEqual(st.best, 1);
});

test('nc sprint: answers after the end are ignored, Easy costs 2 s', () => {
  const R = Rof();
  const s = R.sanitize({ mode: 'sprint', level: 'easy', sprint: 30 });
  const items = R.deal(s, 'sp2').items;
  const st = R.sprintCreate(s, 0);
  R.sprintAnswer(st, items, 'x', 100);
  assertEqual(R.sprintEndAt(st), 28000);
  assertEqual(R.sprintAnswer(st, items, String(items[1].answer), 28001).ignored, true);
  assertEqual(st.i, 1);
  assert(st.done === false && R.sprintOver(st, 28001));
});

test('nc sprint: the list end finishes the sprint', () => {
  const R = Rof();
  const s = R.sanitize({ mode: 'sprint', level: 'hard', sprint: 90 });
  const items = R.deal(s, 'sp3').items;
  const st = R.sprintCreate(s, 0);
  items.forEach((it, i) => R.sprintAnswer(st, items, String(it.answer), 10 + i));
  assertEqual(st.done, true); assertEqual(st.right, 150); assertEqual(st.best, 150);
  assertEqual(R.sprintAnswer(st, items, '1', 2000).ignored, true);
  assert(R.sprintOver(st, 2000));
});

/* ---------- the game: registration, pages, looks, turns ---------- */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('numberChallenge registered: solo and turns, on the leaderboards, room play, listed in every page', () => {
  const src = read('js/games/numberChallenge.js');
  assert(/id:\s*'numberChallenge'/.test(src), 'registered');
  assert(/modes:\s*\['solo', 'turn'\]/.test(src), 'modes');
  assert(/leaderboard:\s*true/.test(src), 'on the leaderboards');
  assert(/room:\s*ROOM/.test(src), 'plays in rooms');
  assert(/"numberChallenge":\s*"hash"/.test(read('js/icons.js')), 'icon stays hash');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const s = read(f);
    assert(s.indexOf('numberGames.js') === -1, f + ' still loads numberGames.js');
    let at = -1;
    ['js/games/geoSpin.js', 'js/numberchallenge/rules.js', 'js/numberchallenge/client.js', 'js/games/numberChallenge.js'].forEach((js) => {
      const i = s.indexOf(js);
      assert(i !== -1, f + ' loads ' + js);
      assert(i > at, f + ': ' + js + ' in order');
      at = i;
    });
  });
  assert(!fs.existsSync(path.join(ROOT, 'js/games/numberGames.js')), 'the old file is gone');
});

test('numberChallenge looks: arcade and notebook tokens and rules, Patrick Hand for the notebook', () => {
  const tokens = read('css/tokens.css');
  ['--nc-ink-night', '--nc-cyan', '--nc-pink', '--nc-gold', '--nc-green', '--nc-paper', '--nc-grid', '--nc-margin', '--nc-pencil'].forEach((tk) => assert(tokens.indexOf(tk + ':') !== -1, 'token ' + tk));
  const css = read('css/games.css');
  assert(css.indexOf('[data-nc-look="notebook"]') !== -1, 'notebook rules');
  assert(/\.nc\[data-nc-look="notebook"\][^{]*\{[^}]*Patrick Hand/.test(css), 'notebook uses Patrick Hand');
  assert(/prefers-reduced-motion[\s\S]{0,80}\.nc /.test(css), 'reduced motion turns the animations off');
});

const GAME = ['js/core.js', 'js/storage.js', 'js/numberchallenge/rules.js', 'js/numberchallenge/client.js', 'js/registry.js', 'js/games/numberChallenge.js'];

test('nc turns: points and streak go to the player who answered, and next wraps', () => {
  const T = loadFF(GAME).NumberChallengeTurns;
  let s = T.create(['a', 'b', 'c']);
  s = T.award(s, 'a', 150, true);
  s = T.award(s, 'a', 200, true);
  assertEqual(s.points, { a: 350, b: 0, c: 0 });
  assertEqual(s.streak, { a: 2, b: 0, c: 0 });
  s = T.award(s, 'b', 0, false);
  assertEqual(s.streak.a, 2);
  s = T.award(s, 'a', 0, false);
  assertEqual([s.streak.a, s.best.a], [0, 2]);
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(s.order[s.cur]); s = T.next(s); }
  assertEqual(seen, ['a', 'b', 'c', 'a', 'b']);
});

test('nc turns: each turn plays player p item k, matched to player 0', () => {
  const FF = loadFF(GAME);
  const plan = FF.NumberChallengeGame.turnPlan(FF.NumberChallengeRules.sanitize({ mode: 'quick', rounds: 10 }), 3);
  assertEqual(plan.length, 30);
  assertEqual(plan.slice(0, 4), [{ p: 0, k: 0 }, { p: 1, k: 0 }, { p: 2, k: 0 }, { p: 0, k: 1 }]);
  assertEqual(FF.NumberChallengeGame.turnPlan(FF.NumberChallengeRules.sanitize({ mode: 'sprint' }), 2), [{ p: 0, k: 0 }, { p: 1, k: 0 }]);
});

test('nc daily and challenge play the standard settings, whatever was saved', () => {
  const FF = loadFF(GAME);
  const G = FF.NumberChallengeGame;
  assertEqual(JSON.stringify(G.settingsFor({ daily: '2026-11-25' }, { mode: 'chain', level: 'hard' })), JSON.stringify(FF.NumberChallengeRules.STANDARD));
  assertEqual(JSON.stringify(G.settingsFor({ challenge: { seed: 1 } }, { mode: 'target' })), JSON.stringify(FF.NumberChallengeRules.STANDARD));
  assertEqual(G.settingsFor({}, { mode: 'target', level: 'expert' }).mode, 'target');
});

/* ---------- screen parts in the harness DOM ---------- */

const txt = (n) => !n ? '' : (n.textContent || '') + (n.children || []).map(txt).join('');
const fakeApi = () => ({ audio: { play: function () {} } });
const byClass = (n, c) => (n.children || []).filter((x) => (x.className || '').split(' ').indexOf(c) !== -1)[0];
function board(FF, item, level) {
  const sent = [];
  const b = FF.NumberChallengeGame.targetBoard(fakeApi(), item, { level: level || 'normal' }, (text) => sent.push(text));
  b.open();
  const tiles = () => byClass(b.el, 'nc-tiles').children;
  const values = () => tiles().map(txt);
  const sign = (op) => byClass(b.el, 'nc-signs').children[item.ops.indexOf(op)];
  const tool = (i) => byClass(b.el, 'nc-ttools').children[i];
  const tap = (v) => tiles().filter((t) => txt(t) === String(v))[0].dispatch('click');
  return { b, sent, values, sign, tool, tap, log: () => byClass(b.el, 'nc-log').children.map(txt), msg: () => byClass(b.el, 'nc-tmsg') };
}
const ITEM = { kind: 'target', tiles: [3, 4, 7, 9], target: 50, ops: ['+', '-', '*', '/'], solution: '' };

test('nc target board: tile, sign, tile merges and logs the step', () => {
  const t = board(loadFF(GAME), ITEM);
  t.tap(3); t.sign('*').dispatch('click'); t.tap(4);
  assertEqual(t.values(), ['7', '9', '12']);
  assertEqual(t.log(), ['3 \u00d7 4 = 12']);
  assertEqual(t.sent, []);
});

test('nc target board: refused merges leave the tiles alone', () => {
  const t = board(loadFF(GAME), ITEM);
  t.tap(7); t.sign('/').dispatch('click'); t.tap(3);
  assertEqual(t.values(), ['3', '4', '7', '9'], '7 \u00f7 3 is not whole');
  assert(t.msg().classList.contains('is-bad'), 'says why');
  t.tap(7); t.tap(3); t.sign('-').dispatch('click'); t.tap(7);
  assertEqual(t.values(), ['3', '4', '7', '9'], '3 \u2212 7 is below 0');
  assertEqual(t.log(), []);
});

test('nc target board: a hit submits itself, except on Expert with tiles left', () => {
  const hit = Object.assign({}, ITEM, { target: 12 });
  const t = board(loadFF(GAME), hit);
  t.tap(3); t.sign('*').dispatch('click'); t.tap(4);
  assertEqual(t.sent, ['3*4;12']);
  const e = board(loadFF(GAME), hit, 'expert');
  e.tap(3); e.sign('*').dispatch('click'); e.tap(4);
  assertEqual(e.sent, [], 'Expert waits so every tile can be used');
  e.tool(2).dispatch('click');   // Done
  assertEqual(e.sent, ['3*4;12'], 'Done sends the tile nearest the target');
});

test('nc target board: Undo and Clear restore the tiles', () => {
  const t = board(loadFF(GAME), ITEM);
  t.tap(3); t.sign('+').dispatch('click'); t.tap(4);
  t.tap(7); t.sign('*').dispatch('click'); t.tap(9);
  assertEqual(t.values(), ['7', '63']);
  t.tool(0).dispatch('click');   // Undo
  assertEqual(t.values(), ['7', '9', '7']);
  t.tool(1).dispatch('click');   // Clear
  assertEqual(t.values(), ['3', '4', '7', '9']);
  assertEqual(t.log(), []);
});

test('nc chain screen: steps show one at a time and only the current step is in the card', () => {
  const FF = loadFF(GAME);
  const R = FF.NumberChallengeRules;
  const queue = [];
  FF.__sandbox.setTimeout = (fn, ms) => { queue.push(fn); return queue.length; };
  FF.__sandbox.clearTimeout = () => {};
  const item = R.chain('normal', R.rng('chain-screen'));
  const card = FF.NumberChallengeGame.chainCard(item, R.STEP_MS.steady);
  let asked = false;
  card.run(() => { asked = true; });
  const big = () => txt(card.el.children[1]);
  assertEqual(big(), String(item.start), 'starts on the start number');
  queue.shift()();
  const s1 = big();
  queue.shift()();
  const s2 = big();
  assert(s1 !== s2 && txt(card.el).indexOf(s1) === -1, 'step 1 is gone once step 2 shows: ' + s1 + ' / ' + s2);
  while (queue.length) queue.shift()();
  assert(asked && big() === '= ?', 'ends on = ? and opens the answers');
});

test('nc number pad: leading zeros drop, empty Enter does nothing, 4 digits at most', () => {
  const FF = loadFF(GAME);
  const sent = [];
  const pad = FF.NumberChallengeGame.numberPad(fakeApi(), (v) => sent.push(v));
  pad.open();
  const keys = byClass(pad.el, 'nc-pad').children;
  const key = (label) => keys.filter((k) => txt(k) === label)[0].dispatch('click');
  key('\u2713');
  assertEqual(sent, [], 'empty');
  key('0'); key('0'); key('7');
  assertEqual(pad.value(), '7');
  key('1'); key('2'); key('3'); key('4');
  assertEqual(pad.value(), '7123');
  key('\u232b');
  key('\u2713');
  assertEqual(sent, ['712']);
});
