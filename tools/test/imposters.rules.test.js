'use strict';
/* Imposters rules (js/imposters/rules.js): the imposter count, settings, clue checks, votes,
   win conditions, Number Imposter timing, fair dealing, and the server-only word pairs. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FF = loadFF(['js/core.js', 'js/imposters/rules.js']);
const R = FF.ImpostersRules;

/* The pairs live in PHP (never shipped to phones); read them straight from the file. */
function wordPairs() {
  const src = fs.readFileSync(path.join(ROOT, 'api/lib/ImposterWords.php'), 'utf8');
  const out = {};
  let level = null;
  src.split(/\r?\n/).forEach((line) => {
    const head = line.match(/^\s*'(easy|normal|hard)' => \[/);
    if (head) { level = head[1]; out[level] = []; return; }
    const m = line.match(/^\s*\['([^']+)', '([^']+)', '([^']*)', '([^']*)', '([^']*)'\],?\s*$/);
    if (m && level) out[level].push({ a: m[1], b: m[2], hintsA: m[3].split(' '), hintsB: m[4].split(' '), shared: m[5].split(' ') });
  });
  return out;
}

test('imposters: 3 to 5 players always get exactly one imposter', function () {
  [3, 4, 5].forEach(function (n) {
    assertEqual(R.imposterCount(n, 1), 1);
    assertEqual(R.imposterCount(n, 2), 1, n + ' players asked for 2');
    assertEqual(R.canChoose(n), false);
  });
});

test('imposters: 6 or more players may choose one or two, never more', function () {
  [6, 8, 12].forEach(function (n) {
    assertEqual(R.canChoose(n), true);
    assertEqual(R.imposterCount(n, 1), 1);
    assertEqual(R.imposterCount(n, 2), 2);
    assertEqual(R.imposterCount(n, 3), 1, 'three is not a choice');
    assertEqual(R.imposterCount(n, '2'), 2);
  });
});

test('imposters: fewer than 3 or more than 12 players cannot start', function () {
  assertEqual(R.imposterCount(2, 1), 0);
  assertEqual(R.imposterCount(0, 1), 0);
  assertEqual(R.imposterCount(13, 1), 0);
});

test('imposters: settings drop back to one imposter when the room falls to five', function () {
  const six = R.sanitizeSettings({ imposters: 2, mode: 'number', rounds: 5 }, 6);
  assertEqual(six.imposters, 2);
  const five = R.sanitizeSettings(six, 5);
  assertEqual(five.imposters, 1);
  assertEqual(five.mode, 'number');
  assertEqual(five.rounds, 5);
});

test('imposters: unknown setting values fall back to the defaults', function () {
  const s = R.sanitizeSettings({ mode: 'hack', difficulty: 'insane', rounds: 99, clueSeconds: 1, discussSeconds: 'x', extra: true }, 7);
  assertEqual(JSON.stringify(s), JSON.stringify({ mode: 'word', imposters: 1, difficulty: 'normal', rounds: 4, clueSeconds: 45, discussSeconds: 90 }));
});

test('imposters: a clue is one word of letters', function () {
  assertEqual(R.validateClue('wet').value, 'Wet');
  assertEqual(R.validateClue('  OCEAN ').value, 'Ocean');
  assertEqual(R.validateClue("rock'n'roll").ok, true);
  assertEqual(R.validateClue('sci-fi').ok, true);
  assertEqual(R.validateClue('').error, 'empty');
  assertEqual(R.validateClue('   ').error, 'empty');
  assertEqual(R.validateClue('very wet').error, 'spaces');
  assertEqual(R.validateClue('wet\tdrink').error, 'spaces');
  assertEqual(R.validateClue('h2o').error, 'letters');
  assertEqual(R.validateClue('-wet').error, 'letters');
  assertEqual(R.validateClue('wet!').error, 'letters');
  assertEqual(R.validateClue('a'.repeat(21)).error, 'long');
  assertEqual(R.validateClue('café').ok, true);
});

test('imposters: a clue may not give away the player\'s own word', function () {
  ['water', 'Waters', 'watery', 'saltwater'].forEach(function (c) {
    assertEqual(R.validateClue(c, { secret: 'Water' }).error, 'secret', c);
  });
  assertEqual(R.validateClue('swim', { secret: 'Swimming Pool' }).error, 'secret');
  assertEqual(R.validateClue('pools', { secret: 'Swimming Pool' }).error, 'secret');
  assertEqual(R.validateClue('teapot', { secret: 'Tea' }).error, 'secret');
  assertEqual(R.validateClue('steam', { secret: 'Tea' }).ok, true);
  assertEqual(R.validateClue('wet', { secret: 'Water' }).ok, true);
});

test('imposters: a player cannot repeat a clue, and rude words are refused', function () {
  assertEqual(R.validateClue('Wet', { used: ['wet'] }).error, 'repeat');
  assertEqual(R.validateClue('nasty', { isQuiet: (w) => w === 'nasty' }).error, 'rude');
});

test('imposters: a clear vote, a tie, and nobody voting', function () {
  const c = ['a', 'b', 'c', 'd'];
  assertEqual(JSON.stringify(R.tally({ a: 'b', c: 'b', d: 'a' }, c).top), '["b"]');
  assertEqual(JSON.stringify(R.tally({ a: 'b', b: 'a' }, c).top), '["a","b"]');
  assertEqual(R.tally({}, c).top.length, 0);
});

test('imposters: self votes and votes for someone not standing are not counted', function () {
  const t = R.tally({ a: 'a', b: 'zz', c: 'd' }, ['a', 'b', 'c', 'd']);
  assertEqual(t.votes, 1);
  assertEqual(JSON.stringify(t.top), '["d"]');
  // In a revote only the tied players stand.
  assertEqual(R.tally({ a: 'c', b: 'd' }, ['d']).votes, 1);
});

test('imposters: more than half of the players still in starts a vote', function () {
  assertEqual(R.votesNeeded(3), 2);
  assertEqual(R.votesNeeded(4), 3);
  assertEqual(R.votesNeeded(5), 3);
  assertEqual(R.votesNeeded(12), 7);
});

test('imposters: win conditions with one imposter', function () {
  const min = ['e'];
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, d: 1, e: 0 }, false), 'majority');
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, d: 0, e: 1 }, false), null);
  assertEqual(R.winner(min, { a: 1, b: 0, c: 0, e: 1 }, false), 'minority', 'one against one');
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, e: 1 }, true), 'minority', 'survived the final vote');
  assertEqual(R.winner(min, { a: 1, b: 1, e: 0 }, true), 'majority', 'caught in the final vote');
});

test('imposters: win conditions with two imposters', function () {
  const min = ['e', 'f'];
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 0 }, false), null, 'one of two caught');
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, d: 1, e: 0, f: 0 }, false), 'majority');
  assertEqual(R.winner(min, { a: 1, b: 1, c: 0, d: 0, e: 1, f: 1 }, false), 'minority', 'two against two');
  assertEqual(R.winner(min, { a: 1, b: 1, c: 1, d: 0, e: 1, f: 0 }, true), 'minority');
});

test('imposters: a stop time is trusted only inside what the server saw', function () {
  assertEqual(R.clampStop(5000, 5200), 5000);
  assertEqual(R.clampStop(9000, 5200), 5200, 'cannot claim later than it arrived');
  assertEqual(R.clampStop(1000, 5200), 4200, 'cannot claim more than a second of delay');
  assertEqual(R.clampStop('x', 5200), 4200);
  assertEqual(R.clampStop(-50, 300), 0);
});

test('imposters: targets are half seconds, in range, and the gap follows the difficulty', function () {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  ['easy', 'normal', 'hard'].forEach(function (d) {
    for (let i = 0; i < 200; i++) {
      const t = R.makeTargets(d, rnd);
      assertEqual(Math.abs(t.majority - t.minority), R.GAP_MS[d]);
      [t.majority, t.minority].forEach(function (v) {
        assert(v >= 3000 && v <= 10000 && v % 500 === 0, d + ' target ' + v);
      });
    }
  });
});

test('imposters: the other word goes to random players, not by seat or join order', function () {
  const crypto = require('crypto');
  const seats = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const hits = {};
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const m = R.chooseMinority(seats, 2, (n) => crypto.randomInt(n));
    assertEqual(m.length, 2);
    assert(m[0] !== m[1], 'two different players');
    m.forEach((u) => { hits[u] = (hits[u] || 0) + 1; });
  }
  // Each seat should be picked about a third of the time (2 of 6).
  seats.forEach(function (u) {
    const rate = hits[u] / N;
    assert(rate > 0.28 && rate < 0.39, u + ' picked at ' + rate.toFixed(3));
  });
});

test('imposters: points reward the winning side, correct votes and surviving', function () {
  assertEqual(R.points({ won: true, correctVotes: 2 }), 150);
  assertEqual(R.points({ won: true, minority: true, survived: true }), 150);
  assertEqual(R.points({ won: false, correctVotes: 1 }), 25);
});

test('imposters: every word pair is valid, and no hint gives its own word away', function () {
  const pairs = wordPairs();
  const ids = {};
  ['easy', 'normal', 'hard'].forEach(function (level) {
    assert(pairs[level] && pairs[level].length >= 30, level + ' has ' + (pairs[level] || []).length + ' pairs');
    pairs[level].forEach(function (p) {
      const id = (p.a + '-' + p.b).toLowerCase();
      assert(p.a.toLowerCase() !== p.b.toLowerCase(), 'identical words ' + id);
      assert(!ids[id], 'pair listed twice: ' + id);
      ids[id] = true;
      assert(p.hintsA.length >= 5 && p.hintsB.length >= 5 && p.shared.length >= 1, 'hints for ' + id);
      p.hintsA.concat(p.shared).forEach(function (h) {
        assertEqual(R.validateClue(h, { secret: p.a }).ok, true, p.a + ' hint "' + h + '"');
      });
      p.hintsB.concat(p.shared).forEach(function (h) {
        assertEqual(R.validateClue(h, { secret: p.b }).ok, true, p.b + ' hint "' + h + '"');
      });
    });
  });
});
