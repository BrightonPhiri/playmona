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

/* ---------- Challenges on any game (v2 links) ---------- */
const FILES2 = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/data/quiz.js', 'js/data/countries.js', 'js/quizRun.js', 'js/auth.js', 'js/cloud.js',
  'js/gameConfig.js', 'js/leaderboards.js', 'js/social.js'];

function boot2() {
  const FF = loadFF(FILES2);
  FF.__sandbox.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  FF.__sandbox.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Games.register({ id: 'memoryMatch', name: 'Memory Match', category: 'memory', players: [1, 8], modes: ['solo', 'turn'] });
  return FF;
}

function codeOf(link) { return /#challenge=([A-Za-z0-9_-]+)/.exec(link)[1]; }

test('challenge v2: a link for any game carries the game, seed, score and stats', function () {
  const FF = boot2();
  const rec = { id: 'abcdefgh12345678', v: 2, game: 'memoryMatch', seed: 'k3y9x2p1', role: 'sent',
    me: { score: 250000, ms: 48000, stats: [{ value: '0:48', label: 'Time' }, { value: '×6', label: 'Best streak' }] } };
  const c = FF.Challenge.decode(codeOf(FF.Challenge.link(rec)));
  assertEqual([c.v, c.id, c.seed, c.game, c.from.score], [2, 'abcdefgh12345678', 'k3y9x2p1', 'memoryMatch', 250000]);
  assertEqual(JSON.stringify(c.from.stats), JSON.stringify(rec.me.stats));
  assertEqual(FF.Challenge.playable(c), true);
  const sent = Date.UTC(2026, 10, 3, 9, 0, 0);
  const d = FF.Challenge.decode(codeOf(FF.Challenge.link(Object.assign({}, rec, { at: sent }))));
  assertEqual(d.at, sent, 'the day it was sent (to the hour)');
});

test('challenge v2: old quiz links still decode as a quiz topic', function () {
  const FF = boot2();
  const rec = { id: 'abcdefgh12345678', seed: 'k3y9x2p1', topic: 'world', role: 'sent', me: { score: 1234, correct: 8, ms: 40000 } };
  const c = FF.Challenge.decode(codeOf(FF.Challenge.link(rec)));
  assertEqual([c.v, c.topic, c.from.score, c.from.correct], [1, 'world', 1234, 8]);
  assertEqual(FF.Challenge.playable(c), true);
});

test('challenge v2: tampered scores clamp, and unknown games are not playable', function () {
  const FF = boot2();
  const raw = Buffer.from(JSON.stringify({ v: 2, i: 'abcdefgh', s: 'seed1234', g: 'notAGame', n: 'Kuda', sc: 5000000,
    st: [['1', '<b>x</b>'], ['2', 'b'], ['3', 'c'], ['4', 'd']] })).toString('base64').replace(/=+$/, '');
  const c = FF.Challenge.decode(raw);
  assertEqual(c.from.score, 1000000);
  assertEqual(c.from.stats.length, 3, 'three stats at most');
  assertEqual(FF.Challenge.playable(c), false);
  const bad = Buffer.from(JSON.stringify({ v: 2, i: 'abcdefgh', s: 'seed1234', g: 'mem<script>' })).toString('base64').replace(/=+$/, '');
  assertEqual(FF.Challenge.decode(bad), null, 'game ids are plain letters');
});

test('challenge v2: wording is the same for a challenge everywhere, and varies between challenges', function () {
  const FF = boot2();
  const a = FF.Challenge.wording('abcdefgh12');
  assertEqual(JSON.stringify(a), JSON.stringify(FF.Challenge.wording('abcdefgh12')));
  assert(FF.Challenge.TAGLINES.length >= 6, 'at least six taglines');
  FF.Challenge.TAGLINES.forEach(function (x) { assert(x[1].indexOf('{name}') !== -1, x[0] + ' names the sender'); });
  assertEqual(FF.Challenge.BUTTONS.map(function (b) { return b[1]; }), ['Accept the challenge', 'Take them on', 'I’m in']);
  const seen = {};
  for (let i = 0; i < 50; i++) seen[FF.Challenge.wording('chal' + i + 'xyz').tagline] = true;
  assert(Object.keys(seen).length >= 3, 'taglines vary: ' + Object.keys(seen).length);
});

test('challenge v2: stats come from the game results, three at most', function () {
  const FF = boot2();
  const s = FF.Challenge.stats({ bestStreak: 6, fastest: 0.42, mostWords: 12, quizCorrect: 8 });
  assertEqual(s.length, 3);
  assertEqual(s.map(function (x) { return x.value; }), ['8', '6', '0.42 s'], 'correct, streak, fastest');
  assertEqual(FF.Challenge.stats({}).length, 0);
});

test('challenge v2: a finished run becomes a sent challenge, and playing one saves the result', function () {
  const FF = boot2();
  const cur = { def: FF.Games.get('memoryMatch'), config: { challengeSeed: 'k3y9x2p1' } };
  const rec = FF.Challenge.fromRun(cur, { results: [{ id: 'me', isMe: true, points: 900 }], challengeSeed: 'k3y9x2p1', bestStreak: 4 });
  assertEqual([rec.v, rec.game, rec.seed, rec.role, rec.me.score], [2, 'memoryMatch', 'k3y9x2p1', 'sent', 900]);
  assertEqual(FF.Challenge.byId(rec.id).id, rec.id);
  const c = FF.Challenge.decode(codeOf(FF.Challenge.link(rec)));
  c.id = 'zzzzzzzz9999';
  FF.Challenge._incoming[c.id] = c;
  FF.Challenge.finishRun({ def: cur.def, config: { challenge: { id: c.id, seed: c.seed } } }, 1200, {});
  const got = FF.Challenge.byId(c.id);
  assertEqual([got.role, got.game, got.me.score, got.from.score], ['received', 'memoryMatch', 1200, 900]);
  assert(!FF.Challenge._incoming[c.id], 'no longer waiting to be played');
});

test('rules: challenge results take any game score up to a million, without a correct count', function () {
  const rules = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;
  const v = rules.challenges.$id.$uid['.validate'];
  assert(/val\(\) <= 1000000/.test(v), 'score cap');
  assert(!/hasChildren\(\['name', 'score', 'correct'/.test(v), 'correct is optional');
  assert(/newData\.child\('game'\)/.test(v), 'game is checked');
  assertEqual(JSON.stringify(require('../gen-rules.js').rules.challenges), JSON.stringify(rules.challenges), 'generator and file agree');
});

test('challenge v2: the sign-in screen can say who challenged you, and to what', function () {
  const FF = boot2();
  const rec = { id: 'abcdefgh12345678', v: 2, game: 'memoryMatch', seed: 'k3y9x2p1', role: 'sent', me: { score: 900, stats: [] } };
  const code = codeOf(FF.Challenge.link(rec));
  const line = FF.Challenge.inviteLine(code);
  assert(/Memory Match/.test(line) && /challenged you/.test(line), line);
  assertEqual(FF.Challenge.inviteLine('broken'), null);
});

test('review: links unlock at most 3 paid challenge runs a day on a phone', function () {
  const FF = boot2();
  FF.Access = { canPlay: function () { return false; } };
  ['aaaaaa1', 'aaaaaa2', 'aaaaaa3'].forEach(function (id) { assertEqual(FF.Challenge.unlock(id, 'memoryMatch'), true, id); });
  assertEqual(FF.Challenge.unlock('aaaaaa1', 'memoryMatch'), true, 'the same challenge again is not a new unlock');
  assertEqual(FF.Challenge.unlock('aaaaaa4', 'memoryMatch'), false, 'the fourth new one today needs normal access');
  FF.Access = { canPlay: function () { return true; } };
  assertEqual(FF.Challenge.unlock('aaaaaa5', 'memoryMatch'), true, 'games you can play anyway are not counted');
});

test('review: a challenge carries the game\'s own choices (Quiz Mix topics) to the friend', function () {
  const FF = boot2();
  const rec = { id: 'abcdefgh12345678', v: 2, game: 'memoryMatch', seed: 'k3y9x2p1', role: 'sent', opts: { topics: ['science', 'sport'] }, me: { score: 900, stats: [] } };
  const c = FF.Challenge.decode(codeOf(FF.Challenge.link(rec)));
  assertEqual(JSON.stringify(c.opts), JSON.stringify({ topics: ['science', 'sport'] }));
  const raw = Buffer.from(JSON.stringify({ v: 2, i: 'abcdefgh', s: 'seed1234', g: 'memoryMatch', o: { topics: ['<b>', 'ok', 5] } })).toString('base64').replace(/=+$/, '');
  assertEqual(JSON.stringify(FF.Challenge.decode(raw).opts), JSON.stringify({ topics: ['ok'] }));
});
