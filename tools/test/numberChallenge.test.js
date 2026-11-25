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
