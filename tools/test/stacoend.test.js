'use strict';
/* Stacoend (js/games/stacoend.js): word checks, scoring, duplicate
   prevention, challenge generation (every challenge is playable and the
   same seed gives the same challenge), settings, and its place in rooms
   and on leaderboards. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

let cached = null;
function load(fresh) {
  if (cached && !fresh) return cached;
  const FF = loadFF(['js/core.js', 'js/data/words.js', 'js/data/wordlist.js', 'js/words.js', 'js/data/lexicon.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/stacoend.js'), 'utf8'), FF.__sandbox, { filename: 'stacoend.js' });
  if (!fresh) cached = FF;
  return FF;
}

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

const BR = { kind: 'start', a: 'br' };
const IGHT = { kind: 'contain', a: 'ight' };
const ING = { kind: 'end', a: 'ing' };
const B_T = { kind: 'both', a: 'b', b: 't' };

test('stacoend: words fit START, CONTAIN, END and START + END', function () {
  const S = load().Stacoend;
  ['bread', 'bridge', 'bright', 'brown'].forEach(function (w) { assert(S.fits(w, BR), w + ' starts with br'); });
  assert(!S.fits('abroad', BR), 'br in the middle is not a start');
  ['light', 'night', 'bright', 'frightened'].forEach(function (w) { assert(S.fits(w, IGHT), w + ' contains ight'); });
  assert(!S.fits('lighter', ING), 'ends with er, not ing');
  ['running', 'playing', 'singing'].forEach(function (w) { assert(S.fits(w, ING), w + ' ends with ing'); });
  assert(!S.fits('ingot', ING), 'ing at the start is not an end');
  assert(S.fits('boat', B_T) && S.fits('bright', B_T), 'starts with b and ends with t');
  assert(!S.fits('bat s'.replace(' ', ''), B_T), 'bats ends with s');
  assert(!S.fits('ing', ING) && !S.fits('br', BR), 'the letters alone never fit');
});

test('stacoend: submissions are cleaned and checked against the dictionary', function () {
  const S = load().Stacoend;
  assertEqual(S.normalize('  Bread  '), 'bread', 'trimmed and lower case');
  assertEqual(S.normalize('BRIGHT!'), 'bright', 'outer punctuation dropped');
  assertEqual(S.normalize('“bread.”'), 'bread', 'curly quotes too');
  assertEqual(S.check('', BR, {}).reason, 'empty');
  assertEqual(S.check('   ', BR, {}).reason, 'empty', 'only spaces is empty');
  assertEqual(S.check('?!', BR, {}).reason, 'empty', 'only punctuation is empty');
  assertEqual(S.check('bread box', BR, {}).reason, 'symbols', 'one word only');
  assertEqual(S.check("br'ad", BR, {}).reason, 'symbols');
  assertEqual(S.check('br3ad', BR, {}).reason, 'symbols', 'no digits');
  assertEqual(S.check('Brxyz', BR, {}).reason, 'word', 'fits the letters but is not a word');
  assertEqual(S.check('brzq', BR, {}).reason, 'word');
  assertEqual(S.check('br', BR, {}).reason, 'short');
  assertEqual(S.check('cat', BR, {}).reason, 'pattern', 'a real word that does not fit');
  assertEqual(S.check('ING', ING, {}).reason, 'bare', 'just the challenge letters');
  const ok = S.check('Bridge', BR, {});
  assert(ok.ok, 'a real word that fits');
  assertEqual(ok.word, 'bridge');
  assert(S.check('night', IGHT, {}).ok && S.check('playing', ING, {}).ok && S.check('basket', B_T, {}).ok);
  // A custom word list can replace the bank.
  assert(S.check('brzz', BR, {}, function (w) { return w === 'brzz'; }).ok, 'the dictionary check is pluggable');
});

test('stacoend: a word counts only once a round', function () {
  const S = load().Stacoend;
  const found = { bread: true };
  assertEqual(S.check('bread', BR, found).reason, 'dupe');
  assertEqual(S.check(' BREAD. ', BR, found).reason, 'dupe', 'case and punctuation do not make it new');
  const t = S.tally(['bread', 'bread', 'bridge'], 0, function () { return 1; });
  assertEqual(t.words, 2, 'repeats in the list are ignored');
  assertEqual(t.points, S.wordPoints('bread', 1).points + S.wordPoints('bridge', 1).points, 'and earn nothing');
});

test('stacoend: longer and rarer words score more, from the scoring table', function () {
  const S = load().Stacoend;
  const C = S.SCORING;
  assertEqual(S.wordPoints('cat', 1).points, C.base, 'a 3-letter word scores the base');
  assertEqual(S.wordPoints('bread', 1).points, C.base + 2 * C.perLetter);
  assert(S.wordPoints('bridges', 1).points > S.wordPoints('bridge', 1).points, 'each letter adds');
  const long = S.wordPoints('brightly'.length >= C.longAt ? 'brightly' : 'brightness', 1);
  assert(long.long, 'a long word');
  assertEqual(long.points, C.base + C.perLetter * (8 - C.minLength) + C.longBonus);
  const rare = S.wordPoints('brig', C.rareTier);
  assert(rare.rare && rare.points === C.base + C.perLetter + C.rareBonus, 'a rare word earns its bonus');
  assertEqual(S.wordPoints('ab', 1).points, 0, 'too short scores nothing');
  const t = S.tally(['bread', 'bright', 'breakfasts'], 3, function (w) { return w === 'bright' ? 4 : 1; });
  assertEqual(t.words, 3);
  assertEqual(t.rejected, 3);
  assertEqual(t.accuracy, 50, '3 of 6 tries were accepted');
  assertEqual(t.longest, 'breakfasts');
  assertEqual(t.rare, 1);
  assertEqual(S.tally([], 0).accuracy, 0, 'no tries, no accuracy');
  const g = S.gameTotals([t, S.tally(['night'], 1, function () { return 1; })]);
  assertEqual(g.points, t.points + S.wordPoints('night', 1).points, 'game total is the sum of rounds');
  assertEqual(g.words, 4);
  assertEqual(g.accuracy, Math.round(4 / 8 * 100));
});

test('stacoend: every challenge in the lists has enough real words', function () {
  const S = load().Stacoend;
  ['start', 'contain', 'end'].forEach(function (kind) {
    S.LEVELS.forEach(function (level) {
      S.FRAGMENTS[kind][level].forEach(function (a) {
        const ch = { kind: kind, a: a };
        assert(S.playable(ch, level), kind + ' ' + a + ' (' + level + ') has at least ' + S.ENOUGH[level] + ' common words');
        S.answers(ch, 30).forEach(function (w) { assert(S.fits(w, ch), w + ' fits ' + a); });
      });
    });
  });
  // Start + end pairs: most must be playable, and the generator only hands out playable ones.
  S.LEVELS.forEach(function (level) {
    S.FRAGMENTS.both[level].forEach(function (set) {
      let ok = 0, all = 0;
      set.a.forEach(function (a) { set.b.forEach(function (b) { all++; if (S.playable({ kind: 'both', a: a, b: b }, level)) ok++; }); });
      assert(ok / all >= 0.6, level + ' start + end group: ' + ok + ' of ' + all + ' pairs playable');
    });
    for (let k = 0; k < 40; k++) {
      const ch = S.challenge('both', level, Math.random);
      assertEqual(ch.kind, 'both');
      assert(S.playable(ch, level), 'start + end ' + ch.a + '…' + ch.b + ' (' + level + ') is playable');
    }
  });
});

test('stacoend: the same seed gives the same challenges on every phone', function () {
  [{}, { mode: 'start', level: 'hard' }, { mode: 'end', level: 'easy', rounds: 5 }].forEach(function (s) {
    function deal(FF) {
      const S = FF.Stacoend;
      return JSON.stringify(seeded(FF, 'room|stacoend|1', function (r) { return S.deal(S.sanitize(s), r); }));
    }
    assertEqual(deal(load(true)), deal(load(true)), JSON.stringify(s));
  });
  const FF = load();
  const S = FF.Stacoend;
  const a = seeded(FF, 'room|stacoend|1', function (r) { return JSON.stringify(S.challenge('start', 'medium', r)); });
  const b = seeded(FF, 'room|stacoend|2', function (r) { return JSON.stringify(S.challenge('start', 'medium', r)); });
  const c = seeded(FF, 'room|stacoend|3', function (r) { return JSON.stringify(S.challenge('start', 'medium', r)); });
  assert(a !== b || b !== c, 'other seeds, other challenges');
});

test('stacoend: a game never repeats a challenge, and Mixed uses every kind', function () {
  const S = load().Stacoend;
  for (let k = 0; k < 10; k++) {
    const plan = S.deal(S.sanitize({ mode: 'contain', level: 'hard', rounds: 5 }), Math.random);
    assertEqual(plan.length, 5);
    assertEqual(new Set(plan.map(function (c) { return c.a; })).size, 5, 'five different challenges');
    assert(plan.every(function (c) { return c.kind === 'contain'; }), 'one mode stays in its kind');
  }
  const mixed = S.deal(S.sanitize({ mode: 'mixed', rounds: 4 }), Math.random);
  assertEqual(mixed.map(function (c) { return c.kind; }).sort().join(), 'both,contain,end,start', 'four rounds, four kinds');
  assertEqual([0, 1, 2, 3].map(function (n) { return S.kindFor({ mode: 'mixed' }, n); }).join(), 'start,contain,end,both', 'rooms rotate kinds');
  assertEqual(S.kindFor({ mode: 'end' }, 2), 'end');
});

test('stacoend: settings keep to the offered values; the standard game is ranked', function () {
  const S = load().Stacoend;
  assertEqual(JSON.stringify(S.sanitize({})), JSON.stringify(S.STANDARD));
  assertEqual(S.STANDARD.mode, 'mixed');
  assertEqual(S.STANDARD.seconds, 60);
  assertEqual(S.STANDARD.rounds, 3);
  const s = S.sanitize({ mode: 'end', level: 'hard', rounds: '5', seconds: 7 });
  assertEqual([s.mode, s.level, s.rounds, s.seconds].join(), 'end,hard,5,60');
  assertEqual(S.sanitize({ mode: 'sideways' }).mode, 'mixed');
  assertEqual(S.sanitize({ difficulty: 'easy' }).level, 'easy');
  assertEqual(S.sanitize({ difficulty: 'easy' }).seconds, 90, 'easy gets more time');
  assertEqual(S.sanitize({ difficulty: 'hard' }).seconds, 45);
  assert(S.isStandard({}), 'defaults are standard');
  assert(!S.isStandard({ mode: 'start' }), 'a change is not standard');
  assertEqual(S.fields().map(function (f) { return f.key; }).join(), 'mode,level,rounds,seconds');
  assertEqual(S.ROOM.fields().map(function (f) { return f.key; }).join(), 'mode,level,seconds', 'rooms set their own round count');
  assertEqual(S.ROOM.sanitize({ rounds: 5 }).rounds, S.ROOM_ROUNDS);
  assertEqual(S.sentence(BR), 'Words that start with BR');
  assertEqual(S.sentence(B_T), 'Words that start with B and end with T');
  assertEqual(S.shortText(IGHT), '…IGHT…');
  ['symbols', 'dupe', 'tried', 'short', 'bare', 'pattern', 'word'].forEach(function (r) {
    assert(S.reasonText(r, BR).length > 5, r + ' has a message');
  });
  assertEqual(S.reasonText('pattern', BR), 'Doesn’t start with BR.');
});

test('stacoend: registers for solo, pass and play, rooms and leaderboards', function () {
  const FF = load();
  const def = FF.__defs.filter(function (d) { return d.id === 'stacoend'; })[0];
  assert(def, 'registered');
  assertEqual(def.name, 'Stacoend');
  assertEqual(def.category, 'words');
  assert(def.modes.indexOf('solo') !== -1 && def.modes.indexOf('turn') !== -1, 'solo and pass and play');
  assert(def.room && def.room.fields && def.room.sanitize && def.room.summary, 'lobby settings');
  assert(def.howToPlay.length >= 4, 'rules are explained before play');
  const read = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };
  assert(/'stacoend'/.test(read('js/net/roomUI.js')), 'listed in ONLINE_GAMES');
  assert(/'stacoend'/.test(read('api/lib/Crew.php')), 'listed online on the server');
  assert(/'stacoend'/.test(read('api/lib/Leaderboards.php')), 'on the leaderboards');
  assert(/"stacoend"/.test(read('js/icons.js')), 'has an icon');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach(function (f) {
    assert(read(f).indexOf('js/games/stacoend.js') !== -1, f + ' loads the game');
  });
  assert(/"stacoend"/.test(read('js/data/assetManifest.js')), 'has a cover');
});
