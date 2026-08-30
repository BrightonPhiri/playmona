'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function players(n, offline) {
  offline = offline || [];
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ uid: 'u' + i, online: offline.indexOf('u' + i) === -1 });
  }
  return out;
}

function round(answers, winner, startedAt) {
  return { startedAt: startedAt == null ? 1000 : startedAt, answers: answers || {}, winner: winner || null };
}

test('an untouched round is not settled', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(round(), players(3), 20000, 1000);
  assertEqual(r.settled, false);
  assertEqual(r.winnerId, null);
  assertEqual(r.reason, null);
});

test('a winner settles the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u2: { choice: 1, correct: true, ms: 1500 } }, 'u2'),
    players(3), 20000, 2500);
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, 'u2');
  assertEqual(r.reason, 'winner');
});

test('wrong answers alone do not settle while someone can still answer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 0, correct: false, ms: 900 } }),
    players(3), 20000, 2000);
  assertEqual(r.settled, false, 'u2 and u3 have not answered yet');
});

test('everyone answering wrong exhausts the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 2, correct: false, ms: 1200 },
      u3: { choice: 3, correct: false, ms: 1800 }
    }),
    players(3), 20000, 2000);
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, null);
  assertEqual(r.reason, 'exhausted');
});

test('offline players do not block exhaustion', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 2, correct: false, ms: 1200 }
    }),
    players(3, ['u3']), 20000, 2000);
  assertEqual(r.settled, true, 'u3 is offline, so u1 and u2 are everyone');
  assertEqual(r.reason, 'exhausted');
});

test('the timer expires the round', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const notYet = FF.RaceRules.settle(round({}, null, 1000), players(3), 20000, 20999);
  assertEqual(notYet.settled, false, '19999ms elapsed is not enough');

  const expired = FF.RaceRules.settle(round({}, null, 1000), players(3), 20000, 21000);
  assertEqual(expired.settled, true);
  assertEqual(expired.reason, 'timeout');
  assertEqual(expired.winnerId, null);
});

test('a timer of 0 means no time limit', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(round({}, null, 1000), players(3), 0, 9999999);
  assertEqual(r.settled, false, 'timer off must never expire the round');
});

test('a winner beats an expired timer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 1, correct: true, ms: 500 } }, 'u1', 1000),
    players(3), 20000, 99999);
  assertEqual(r.reason, 'winner', 'a settled winner takes precedence over timeout');
  assertEqual(r.winnerId, 'u1');
});

test('lockedOut is true only after a wrong answer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = round({
    u1: { choice: 0, correct: false, ms: 900 },
    u2: { choice: 1, correct: true, ms: 1000 }
  });
  assertEqual(FF.RaceRules.lockedOut(r, 'u1'), true);
  assertEqual(FF.RaceRules.lockedOut(r, 'u2'), false, 'a correct answer is not a lockout');
  assertEqual(FF.RaceRules.lockedOut(r, 'u3'), false, 'not answering is not a lockout');
});

test('scores are derived from round winners', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = {
    0: round({ u1: { choice: 1, correct: true, ms: 1000 } }, 'u1'),
    1: round({ u2: { choice: 0, correct: true, ms: 4000 } }, 'u2'),
    2: round({ u1: { choice: 2, correct: true, ms: 900 } }, 'u1'),
    3: round({ u1: { choice: 0, correct: false, ms: 800 } }, null)
  };
  const scores = FF.RaceRules.scores(rounds, players(3), function (a) {
    return a.ms <= 2500 ? 150 : 100;      // base 100, +50 speed bonus
  });
  assertEqual(scores.u1, 300, 'two fast wins');
  assertEqual(scores.u2, 100, 'one slow win');
  assertEqual(scores.u3, 0, 'no wins');
});

test('scores recompute identically from the same data', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = { 0: round({ u1: { choice: 1, correct: true, ms: 1000 } }, 'u1') };
  const pts = function () { return 100; };
  assertEqual(
    FF.RaceRules.scores(rounds, players(2), pts),
    FF.RaceRules.scores(rounds, players(2), pts),
    'derivation must be a pure function'
  );
});

test('a winner with no recorded answer scores zero, not NaN', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = { 0: round({}, 'u1') };   // corrupt/partial data
  const scores = FF.RaceRules.scores(rounds, players(2), function (a) { return 100; });
  assertEqual(scores.u1, 0, 'missing answer data must not produce NaN');
});
