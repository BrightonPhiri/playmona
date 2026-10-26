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

test('players with stale presence do not block exhaustion', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 0, correct: false, ms: 900 } }),
    [
      { uid: 'u1', online: true, lastSeen: 49000 },
      { uid: 'u2', online: true, lastSeen: 10000 }
    ],
    0,
    50000
  );
  assertEqual(r.settled, true, 'u2 has not been seen for 40 seconds');
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

test('scores are not ready while a winner answer is missing', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  assertEqual(FF.RaceRules.scoresReady({
    0: round({}, 'u1')
  }), false);
  assertEqual(FF.RaceRules.scoresReady({
    0: round({ u1: { correct: true, ms: 700 } }, 'u1'),
    1: round({}, FF.RaceRules.NOBODY)
  }), true);
});

test('a correct answer awaiting the winner slot is not exhaustion', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  // Every player has answered and one of them is CORRECT, but the winner
  // transaction has not landed yet. This window is real: the answer write
  // and the winner claim are two separate operations.
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 3, correct: true, ms: 5000 }
    }, null),
    players(2), 20000, 6000);
  assertEqual(r.settled, false,
    'must wait for the winner slot rather than declaring a dead round');
});

test('all answered and all wrong is still exhaustion', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: 0, correct: false, ms: 900 },
      u2: { choice: 3, correct: false, ms: 1000 }
    }, null),
    players(2), 20000, 2000);
  assertEqual(r.settled, true);
  assertEqual(r.reason, 'exhausted');
});

test('the NOBODY sentinel settles a round with no winner and no score', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 0, correct: false, ms: 900 } }, FF.RaceRules.NOBODY),
    players(3), 20000, 2000);
  assertEqual(r.settled, true, 'a published no-winner outcome settles everywhere');
  assertEqual(r.winnerId, null);

  const scores = FF.RaceRules.scores(
    { 0: round({ u1: { choice: 0, correct: false, ms: 900 } }, FF.RaceRules.NOBODY) },
    players(2), function () { return 100; });
  assertEqual(scores.u1, 0, 'the sentinel must never be scored as a win');
  assertEqual(scores[FF.RaceRules.NOBODY], undefined, 'and must not become a player');
});

test('fastest mode picks the quickest correct answer, not the first written', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: null, correct: true, ms: 410 },
      u2: { choice: null, correct: true, ms: 260 },   // quickest
      u3: { choice: null, correct: false, ms: null }  // false start
    }, null),
    players(3), 0, 5000, 'fastest');
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, 'u2', 'the quickest valid tap must win');
});

test('fastest mode waits until everyone has had their go', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: null, correct: true, ms: 410 } }, null),
    players(3), 0, 5000, 'fastest');
  assertEqual(r.settled, false, 'u2 and u3 have not tapped yet');
});

test('fastest mode ends on the timer with whoever managed a tap', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: null, correct: true, ms: 900 } }, null, 1000),
    players(3), 4000, 5000, 'fastest');
  assertEqual(r.settled, true);
  assertEqual(r.reason, 'timeout');
  assertEqual(r.winnerId, 'u1');
});

test('fastest mode with only false starts has no winner', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({
      u1: { choice: null, correct: false, ms: null },
      u2: { choice: null, correct: false, ms: null }
    }, null),
    players(2), 0, 5000, 'fastest');
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, null, 'nobody tapped validly');
});

test('fastest mode ignores an answer with no recorded time', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  assertEqual(FF.RaceRules.fastestOf(round({
    u1: { choice: null, correct: true, ms: null },
    u2: { choice: null, correct: true, ms: 700 }
  })), 'u2');
});

test('default mode still requires a claimed winner slot', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { choice: 1, correct: true, ms: 500 } }, null),
    players(2), 20000, 1500);
  assertEqual(r.settled, false, 'first-mode must wait for the winner slot');
});

test('parallel mode: everyone banks their own score, not just the winner', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = {
    0: round({
      u1: { correct: true, ms: 30000, value: 220 },
      u2: { correct: true, ms: 30000, value: 140 },
      u3: { correct: true, ms: 30000, value: 0 }
    }, null)
  };
  const scores = FF.RaceRules.scores(rounds, players(3), function () { return 0; }, 'parallel');
  assertEqual(scores.u1, 220, 'top scorer banks their own points');
  assertEqual(scores.u2, 140, 'so does everyone else - not winner-takes-all');
  assertEqual(scores.u3, 0);
});

test('parallel mode waits for everyone, then names the top scorer', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const partial = FF.RaceRules.settle(
    round({ u1: { correct: true, ms: 1000, value: 100 } }, null),
    players(2), 0, 5000, 'parallel');
  assertEqual(partial.settled, false, 'u2 is still playing');

  const done = FF.RaceRules.settle(
    round({
      u1: { correct: true, ms: 1000, value: 100 },
      u2: { correct: true, ms: 1000, value: 260 }
    }, null),
    players(2), 0, 5000, 'parallel');
  assertEqual(done.settled, true);
  assertEqual(done.winnerId, 'u2', 'highest score takes the headline');
});

test('parallel mode with nobody scoring has no headline winner', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const r = FF.RaceRules.settle(
    round({ u1: { correct: true, ms: 1, value: 0 }, u2: { correct: true, ms: 1, value: 0 } }, null),
    players(2), 0, 5000, 'parallel');
  assertEqual(r.settled, true);
  assertEqual(r.winnerId, null);
});

test('ranked: places by time, ties share a place and the next skips', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const places = FF.RaceRules.placesOf(round({
    u1: { correct: true, ms: 250 }, u2: { correct: true, ms: 210 },
    u3: { correct: true, ms: 250 }, u4: { correct: false, ms: null }, u5: { correct: true, ms: 300 }
  }));
  assertEqual(places.map(function (e) { return e.uid + ':' + e.place; }).join(','), 'u2:1,u1:2,u3:2,u5:4');
});

test('ranked: settles like fastest and every correct answer scores by place', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const answers = { u1: { correct: true, ms: 300 }, u2: { correct: true, ms: 200 }, u3: { correct: false, ms: null } };
  const half = FF.RaceRules.settle(round({ u1: answers.u1 }), players(3), 12000, 2000, 'ranked');
  assertEqual(half.settled, false, 'waits for everyone');
  const done = FF.RaceRules.settle(round(answers), players(3), 12000, 2000, 'ranked');
  assertEqual(done.settled, true);
  assertEqual(done.winnerId, 'u2');
  const pts = [300, 200, 150];
  const scores = FF.RaceRules.scores({ 0: round(answers), 1: round({ u1: { correct: true, ms: 150 }, u2: { correct: true, ms: 190 } }) },
    players(3), function (a, place) { return pts[place - 1] || 100; }, 'ranked');
  assertEqual(scores.u1, 200 + 300);
  assertEqual(scores.u2, 300 + 200);
  assertEqual(scores.u3, 0);
});
