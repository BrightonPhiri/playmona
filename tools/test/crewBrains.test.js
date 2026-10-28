'use strict';
/* Players Engine brains (js/crew/*): every online game has one, answers look exactly like a
   phone's, the same seed gives the same plan, skill and level move play the right way, and
   brains only ever see what a participant could. Loaded the way the runner loads them. */
const fs = require('fs');
const path = require('path');
const { test, assert, assertEqual } = require('./harness');
const loader = require('../../api/crew/lib/loader.js');

const FF = loader.load();
const B = FF.CrewBrains;

function onlineGames() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js/net/roomUI.js'), 'utf8');
  const list = src.match(/var ONLINE_GAMES = \[([\s\S]*?)\];/)[1].replace(/\/\/.*$/gm, '');
  return list.match(/'([A-Za-z]+)'/g).map((s) => s.slice(1, -1));
}

function input(gameId, extra) {
  const base = { gameId, uid: 'crewUid1', seed: 'room7', round: 0, difficulty: 'normal', skill: 55, level: 'medium', timerMs: 20000,
    persona: { reaction: 50, accuracy: 50, consistency: 50, patience: 100, risk: 30 } };
  const out = Object.assign(base, extra || {});
  if (!out.view) out.view = B.view(gameId, out);
  return out;
}

function many(gameId, extra, n) {
  const out = [];
  for (let i = 0; i < (n || 400); i++) out.push(B.plan(input(gameId, Object.assign({ round: i, seed: 's' + i }, extra || {}))));
  return out;
}
const rate = (plans) => plans.filter((p) => p && p.answer.correct).length / plans.length;
const avgMs = (plans) => { const v = plans.filter((p) => p && p.answer.ms != null); return v.reduce((s, p) => s + p.answer.ms, 0) / v.length; };

/* The games crew may be seated in (Crew::GAMES). Newer online games join once they have a brain. */
function crewGames() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'api/lib/Crew.php'), 'utf8');
  return src.match(/public const GAMES = \[([\s\S]*?)\];/)[1].match(/'([A-Za-z]+)'/g).map((s) => s.slice(1, -1));
}

test('crew brains: every crew game is online and has a brain', function () {
  const online = onlineGames();
  const games = crewGames();
  assertEqual(games.length, 23);
  games.forEach((g) => {
    assert(online.indexOf(g) !== -1, g + ' is not an online game');
    assert(B.forGame(g), 'no brain for ' + g);
  });
});

test('crew brains: answers have exactly the fields a phone writes, and stay in time', function () {
  B.QUIZ_GAMES.forEach(function (g) {
    many(g, {}, 60).forEach(function (p) {
      if (!p) return;
      assertEqual(Object.keys(p.answer).join(','), g === 'bibleQuiz' ? 'choice,correct,ms,value' : 'choice,correct,ms', g);
      if (g === 'bibleQuiz') assertEqual(p.answer.value > 0, p.answer.correct, 'a right Bible Quiz answer scores, as on a phone');
      assertEqual(typeof p.answer.correct, 'boolean');
      assert(p.answer.ms > 0 && p.answer.ms <= 20000 - 400, g + ' ms ' + p.answer.ms);
      assertEqual(p.atMs, p.answer.ms, 'answers when its time says');
    });
  });
  many('quickTap', { difficulty: 'hard' }, 200).forEach(function (p) {
    assertEqual(Object.keys(p.answer).join(','), 'choice,correct,ms,kind');
    assert(['tap', 'early', 'decoy', 'miss'].indexOf(p.answer.kind) >= 0);
    if (p.answer.kind === 'tap') assert(p.answer.correct && p.answer.ms >= 150 && p.answer.ms < 2500);
    else assert(!p.answer.correct && p.answer.ms === null);
  });
  const lr = B.plan(input('letterRush'));
  assertEqual(Object.keys(lr.answer).join(','), 'choice,correct,ms,value', 'the word list stays off the room');
});

test('crew brains: the same seed and player give the same plan; another player differs', function () {
  ['familyQuiz', 'quickTap', 'letterRush'].forEach(function (g) {
    const a = JSON.stringify(B.plan(input(g, { round: 3 })));
    assertEqual(JSON.stringify(B.plan(input(g, { round: 3 }))), a, g);
  });
  const a = many('familyQuiz', {}, 40).map((p) => p && p.answer.ms).join();
  const b = many('familyQuiz', { uid: 'crewUid2' }, 40).map((p) => p && p.answer.ms).join();
  assert(a !== b, 'two crew players do not answer in lockstep');
});

test('crew brains: brains do not touch the room\'s seeded random stream', function () {
  FF.Random.seed('room|familyQuiz|0');
  const expected = [FF._rand(), FF._rand()];
  FF.Random.seed('room|familyQuiz|0');
  B.plan(input('familyQuiz'));
  assertEqual(JSON.stringify([FF._rand(), FF._rand()]), JSON.stringify(expected));
  FF.Random.unseed();
});

test('crew brains: skill, level and room difficulty move accuracy and speed the right way', function () {
  const weak = many('guessFlag', { skill: 15, level: 'easy' });
  const strong = many('guessFlag', { skill: 90, level: 'hard' });
  assert(rate(strong) > rate(weak) + 0.3, 'accuracy ' + rate(weak) + ' vs ' + rate(strong));
  assert(avgMs(strong) < avgMs(weak), 'strong players answer sooner');
  assert(rate(many('guessFlag', { difficulty: 'hard' })) < rate(many('guessFlag', { difficulty: 'easy' })), 'hard rooms are harder');
  assert(rate(weak) > 0.15 && rate(strong) < 0.98, 'nobody is perfect or hopeless');
  const fast = many('quickTap', { skill: 90, level: 'hard' }).filter((p) => p.answer.kind === 'tap');
  const slow = many('quickTap', { skill: 10, level: 'easy' }).filter((p) => p.answer.kind === 'tap');
  assert(avgMs(fast) < 250 && avgMs(slow) > 300, 'reaction medians ' + avgMs(fast) + ' / ' + avgMs(slow));
});

test('crew brains: Quick Tap reacts to the signal every phone draws', function () {
  const view = B.view('quickTap', { seed: 'room7', round: 2, difficulty: 'hard' });
  FF.Random.seed(FF.Random.roundSeed('room7', 'quickTap', 2));
  const phone = FF.QuickTap.schedule('hard', FF._rand);
  FF.Random.unseed();
  assertEqual(JSON.stringify(view.schedule), JSON.stringify(phone));
  for (let i = 0; i < 50; i++) {
    const p = B.plan(input('quickTap', { seed: 'room7', round: 2, uid: 'c' + i, difficulty: 'hard', persona: { risk: 0, patience: 100 }, skill: 95 }));
    if (p.answer.kind === 'tap') assertEqual(p.atMs, phone.signal + p.answer.ms, 'taps land after the shared signal');
  }
  // Risk-takers fall for decoys more.
  const bold = many('quickTap', { difficulty: 'hard', persona: { risk: 100, patience: 100 }, skill: 20 }).filter((x) => x.answer.kind === 'decoy' || x.answer.kind === 'early').length;
  const calm = many('quickTap', { difficulty: 'hard', persona: { risk: 0, patience: 100 }, skill: 90 }).filter((x) => x.answer.kind === 'decoy' || x.answer.kind === 'early').length;
  assert(bold > calm, 'false starts ' + bold + ' vs ' + calm);
});

test('crew brains: Letter Rush deals the game\'s own letters and finds only real words', function () {
  const view = B.view('letterRush', { seed: 'room7', difficulty: 'hard' });
  FF.Random.seed(FF.Random.roundSeed('room7', 'letterRush', 'rack'));
  const phone = FF.LetterRush.deal('hard');
  FF.Random.unseed();
  assertEqual(view.letters, phone.letters.join(''), 'same rack as every phone');
  const letters = view.letters.split('');
  const p = B.plan(input('letterRush', { seed: 'room7', difficulty: 'hard', view }));
  assert(p.detail.words.length > 0, 'finds words');
  let score = 0;
  p.detail.words.forEach(function (w) {
    assert(FF.Words.isWord(w), w + ' is a word');
    assert(w.length >= view.min, w + ' long enough');
    const left = letters.slice();
    w.split('').forEach(function (ch) { const i = left.indexOf(ch); assert(i >= 0, w + ' fits the rack'); left.splice(i, 1); });
    score += FF.LetterRush.points(w, letters.length);
  });
  assertEqual(p.answer.value, score, 'scored with the game\'s points');
  assertEqual(new Set(p.detail.words).size, p.detail.words.length, 'no word twice');
  const expert = many('letterRush', { skill: 95, level: 'hard' }, 30).reduce((s, x) => s + x.answer.value, 0);
  const novice = many('letterRush', { skill: 10, level: 'easy' }, 30).reduce((s, x) => s + x.answer.value, 0);
  assert(expert > novice * 1.8, 'experts score far more: ' + expert + ' vs ' + novice);
  assert(p.atMs >= view.seconds * 1000, 'banks when the turn clock ends');
});

test('crew brains: the context is a frozen whitelist (no answers, no extras)', function () {
  const ctx = B.context({ gameId: 'familyQuiz', skill: 140, persona: { risk: 300, secret: 1 }, answers: { other: { correct: true } },
    answerKey: 2, view: { letters: 'abc' }, level: 'godlike', difficulty: 'nope' });
  assertEqual(Object.keys(ctx).sort().join(','), 'difficulty,gameId,level,mode,persona,rng,round,rounds,skill,timerMs,view');
  assertEqual(ctx.skill, 100);
  assertEqual(ctx.persona.risk, 100);
  assertEqual(ctx.persona.secret, undefined);
  assertEqual(ctx.level, 'medium');
  assertEqual(ctx.difficulty, 'normal');
  assert(Object.isFrozen(ctx) && Object.isFrozen(ctx.persona) && Object.isFrozen(ctx.view));
  assertEqual(B.plan({ gameId: 'memoryMatch' }), null, 'games without a brain get nothing');
});
