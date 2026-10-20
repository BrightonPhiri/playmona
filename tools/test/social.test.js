'use strict';
/* Daily challenge, Challenge a friend, the 10-question builder and the on-device cloud. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/data/quiz.js', 'js/data/countries.js', 'js/quizRun.js', 'js/auth.js', 'js/cloud.js', 'js/social.js'];

function boot() {
  const FF = loadFF(FILES);
  FF.__sandbox.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  FF.__sandbox.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  return FF;
}

test('quiz run: the same seed gives the same 10 questions', function () {
  const FF = boot();
  const a = FF.QuizRun.build('abc123', 'mixed');
  const b = FF.QuizRun.build('abc123', 'mixed');
  assertEqual(a.length, 10);
  assertEqual(JSON.stringify(a), JSON.stringify(b));
  assert(JSON.stringify(FF.QuizRun.build('zzz999', 'mixed')) !== JSON.stringify(a), 'another seed differs');
  assert(!FF.Random.seeded(), 'the shared RNG is put back afterwards');
});

test('quiz run: every topic builds 10 answerable questions', function () {
  const FF = boot();
  FF.QuizRun.TOPICS.forEach(function (tp) {
    const qs = FF.QuizRun.build('seed42', tp.id);
    assertEqual(qs.length, 10, tp.id);
    qs.forEach(function (q) {
      assert(q.prompt && q.options.length >= 2, tp.id + ' has options');
      assert(q.answer >= 0 && q.answer < q.options.length, tp.id + ' answer in range');
      assertEqual(new Set(q.options).size, q.options.length, tp.id + ' options are distinct: ' + q.options.join('|'));
    });
    const prompts = qs.map(function (q) { return q.prompt + (q.country || ''); });
    assertEqual(new Set(prompts).size, 10, tp.id + ' no repeats');
  });
});

test('challenge: a link carries everything needed to replay', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  const rec = { id: 'abcdefgh12345678', seed: 'k3y9x2p1', topic: 'world', role: 'sent', me: { score: 1234, correct: 8, ms: 40000 } };
  const link = FF.Challenge.link(rec);
  const code = /#challenge=([A-Za-z0-9_-]+)/.exec(link)[1];
  const c = FF.Challenge.decode(code);
  assertEqual([c.id, c.seed, c.topic, c.from.score, c.from.correct], ['abcdefgh12345678', 'k3y9x2p1', 'world', 1234, 8]);
});

test('challenge: broken or tampered links are refused or clamped', function () {
  const FF = boot();
  assertEqual(FF.Challenge.decode('not-a-real-code'), null);
  const raw = Buffer.from(JSON.stringify({ v: 1, i: 'abcdefgh', s: 'seed1234', k: 'nope', n: '<b>x</b>', a: 'x', sc: 999999, c: 50 })).toString('base64');
  const c = FF.Challenge.decode(raw.replace(/=+$/, ''));
  assertEqual(c.topic, 'mixed', 'unknown topic falls back');
  assertEqual(c.from.score, 1500, 'score capped');
  assertEqual(c.from.correct, 10, 'correct capped');
  assert(FF.Avatars.has(c.from.avatar), 'unknown avatar replaced');
  const bad = Buffer.from(JSON.stringify({ v: 1, i: '../../x', s: 'seed1234' })).toString('base64');
  assertEqual(FF.Challenge.decode(bad), null, 'ids must be plain');
});

test('daily: streak counts finished days in a row (UTC)', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  const day = function (n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const log = {};
  log[day(1)] = { done: true }; log[day(2)] = { done: true }; log[day(4)] = { done: true };
  FF.Storage.set('dailyLog', log);
  assertEqual(FF.Daily.streak(), 2, 'yesterday and the day before');
  log[day(0)] = { done: true };
  FF.Storage.set('dailyLog', log);
  assertEqual(FF.Daily.streak(), 3);
  assertEqual(FF.Daily.played(), true);
});

test('cloud: device-only accounts keep a shared leaderboard on this device', async function () {
  const FF = boot();
  FF.Storage.set('devAuth', true);
  await FF.Auth.init();
  assertEqual(FF.Cloud.mode(), null, 'no cloud before signing in');
  await FF.Auth.signUp({ email: 'a@example.com', username: 'alice', password: 'password1', displayName: 'Alice', avatar: 'nia' });
  assertEqual(FF.Cloud.mode(), 'local');
  await FF.Cloud.set('daily/2026-10-20/u1', { name: 'A', score: 500, correct: 4, t: 1 });
  await FF.Cloud.set('daily/2026-10-20/u2', { name: 'B', score: 900, correct: 7, t: 2 });
  const rows = await FF.Cloud.top('daily/2026-10-20', 'score', 10);
  assertEqual(rows.map(function (r) { return r.key; }), ['u2', 'u1']);
  await FF.Auth.signOut();
  await FF.Auth.playAsGuest();
  assertEqual(FF.Cloud.mode(), null, 'guests have no cloud');
});

test('stats: a challenge counts as a game with XP', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  FF.Stats.recordExtra({ xp: 60, category: 'quiz', quizCorrect: 8, quizAnswered: 10 });
  const s = FF.Stats.get();
  assertEqual([s.gamesPlayed, s.xp, s.quizCorrect, s.byCategory.quiz], [1, 60, 8, 1]);
});
