'use strict';
/* Accounts, per-account storage, the saved-player roster and levels. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const BASE = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js'];

function boot(extra) {
  const FF = loadFF(BASE.concat(extra || []));
  FF.Storage.init();
  return FF;
}

/* ---------- Storage scoping ---------- */
test('storage: account keys are kept apart per account', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  FF.Storage.set('favorites', ['quickTap']);
  FF.Storage.setScope('bob');
  assertEqual(FF.Storage.get('favorites', []), [], 'bob must not see alice\'s favourites');
  FF.Storage.setScope('alice');
  assertEqual(FF.Storage.get('favorites', []), ['quickTap']);
});

test('storage: device keys are shared by every account', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  FF.Storage.set('theme', 'dark');
  FF.Storage.setScope('bob');
  assertEqual(FF.Storage.get('theme', 'light'), 'dark');
});

test('storage: the first account to sign in adopts pre-account data, once', function () {
  const FF = boot();
  FF.Storage.set('stats', { gamesPlayed: 7 });            // saved before accounts
  assert(FF.Storage.claimLegacy('alice'), 'alice should adopt the old data');
  FF.Storage.setScope('alice');
  assertEqual(FF.Storage.get('stats', null).gamesPlayed, 7);
  assert(!FF.Storage.claimLegacy('bob'), 'a second account must not adopt it again');
  FF.Storage.setScope('bob');
  assertEqual(FF.Storage.get('stats', null), null);
});

test('storage: Family Fun data is copied to the PlayMora prefix', function () {
  const FF = loadFF(BASE);
  FF.__sandbox.localStorage.setItem('familyfun:favorites', JSON.stringify(['guessFlag']));
  FF.Storage.init();
  assertEqual(FF.Storage.get('favorites', []), ['guessFlag']);
});

test('storage: change listeners fire for account keys only', function () {
  const FF = boot();
  const seen = [];
  FF.Storage.onChange(function (k) { seen.push(k); });
  FF.Storage.setScope('alice');
  FF.Storage.set('favorites', []);
  FF.Storage.set('theme', 'dark');
  FF.Storage.set('stats', {}, { silent: true });
  assertEqual(seen, ['favorites']);
});

/* ---------- Avatars ---------- */
test('avatars: 48 characters, old emoji map to a stable character', function () {
  const FF = boot();
  assertEqual(FF.Avatars.all().length, 48);
  assert(FF.Avatars.has('fox'));
  const a = FF.Avatars.normalize('😀', 'p1');
  assert(FF.Avatars.has(a), 'emoji becomes a known character');
  assertEqual(FF.Avatars.normalize('😀', 'p1'), a, 'same seed, same character');
  assertEqual(FF.Avatars.normalize('panda', 'x'), 'panda');
});

/* ---------- Saved players ---------- */
function roster(FF, n) {
  FF.Storage.setScope('alice');
  FF.Players.syncMe({ displayName: 'Alice', avatar: 'nia' });
  for (let i = 1; i < n; i++) FF.Players.add('P' + i);
  return FF.Players.all();
}

test('players: "just me" keeps everyone else saved', function () {
  const FF = boot();
  roster(FF, 5);
  FF.Players.only('me');
  assertEqual(FF.Players.all().length, 5, 'nobody deleted');
  assertEqual(FF.Players.get().map(function (p) { return p.id; }), ['me']);
});

test('players: at least one player always stays in', function () {
  const FF = boot();
  roster(FF, 2);
  FF.Players.only('me');
  FF.Players.setActive('me', false);
  assertEqual(FF.Players.get().length, 1);
});

test('players: ensureCount switches saved players back on before adding new ones', function () {
  const FF = boot();
  roster(FF, 4);
  FF.Players.only('me');
  FF.Players.ensureCount(3);
  assertEqual(FF.Players.all().length, 4, 'no new players while saved ones are available');
  assertEqual(FF.Players.get().length, 3);
  FF.Players.ensureCount(1);
  assertEqual(FF.Players.all().length, 4, 'extra players switched off, not deleted');
  assertEqual(FF.Players.get().map(function (p) { return p.id; }), ['me']);
});

test('players: temporary (demo) players never touch the saved roster', function () {
  const FF = boot();
  roster(FF, 3);
  FF.Players.useTemporary([{ id: 't1', name: 'Demo 1' }, { id: 't2', name: 'Demo 2' }]);
  assertEqual(FF.Players.get().length, 2);
  FF.Players.clearTemporary();
  assertEqual(FF.Players.all().map(function (p) { return p.name; }), ['Alice', 'P1', 'P2']);
});

test('players: the account owner cannot be removed, others can', function () {
  const FF = boot();
  const list = roster(FF, 3);
  FF.Players.remove('me');
  assertEqual(FF.Players.all().length, 3);
  FF.Players.remove(list[1].id);
  assertEqual(FF.Players.all().length, 2);
});

test('players: profile changes flow into the "me" player', function () {
  const FF = boot();
  roster(FF, 2);
  FF.Players.syncMe({ displayName: 'Ally', avatar: 'fox' });
  const me = FF.Players.me();
  assertEqual([me.name, me.avatar], ['Ally', 'fox']);
  assertEqual(FF.Players.all().length, 2);
});

/* ---------- Stats ---------- */
test('stats: levels need 100, then 150, then 200 XP', function () {
  const FF = boot();
  assertEqual(FF.Stats.level(0).level, 1);
  assertEqual(FF.Stats.level(99).level, 1);
  assertEqual(FF.Stats.level(100).level, 2);
  assertEqual(FF.Stats.level(249).level, 2);
  assertEqual(FF.Stats.level(250).level, 3);
  assertEqual(FF.Stats.level(250).need, 200);
});

test('stats: a game played counts today, its category and 10 XP', function () {
  const FF = boot();
  FF.Storage.setScope('alice');
  FF.Stats.recordGamePlayed('quickTap', 'Quick Tap', 'reaction');
  FF.Stats.recordGamePlayed('guessFlag', 'Guess the Flag', 'world');
  const s = FF.Stats.get();
  assertEqual(s.xp, 20);
  assertEqual(s.byCategory, { reaction: 1, world: 1 });
  assertEqual(FF.Stats.lastDays(7)[6].count, 2);
  assertEqual(FF.Stats.dayStreak(), 1);
});

/* ---------- Device-only accounts ---------- */
function bootAuth() {
  const FF = boot(['js/auth.js']);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.set('devAuth', true);
  return FF;
}

test('auth: username rules', function () {
  const FF = bootAuth();
  assertEqual(FF.Auth.normalizeUsername('  @Alice_1 '), 'alice_1');
  assert(FF.Auth.usernameError('ab'), 'too short');
  assert(FF.Auth.usernameError('has space'), 'no spaces');
  assert(!FF.Auth.usernameError('alice.b_9'), 'letters, numbers, dot, underscore');
  assert(FF.Auth.passwordError('short'), 'passwords need 8+');
  assert(FF.Auth.emailError('nope'), 'email needs an @ and a dot');
});

test('auth: sign up, sign out, sign in by username or email', async function () {
  const FF = bootAuth();
  await FF.Auth.init();
  assertEqual(FF.Auth.mode(), 'local');
  const s = await FF.Auth.signUp({ email: 'a@example.com', username: 'alice', password: 'correct-horse', displayName: 'Alice', avatar: 'nia' });
  assert(FF.Auth.signedIn());
  assertEqual(FF.Players.me().name, 'Alice');
  FF.Storage.set('favorites', ['quickTap']);
  await FF.Auth.signOut();
  assert(!FF.Auth.signedIn());

  let failed = false;
  try { await FF.Auth.signIn('alice', 'wrong-password'); } catch (e) { failed = true; }
  assert(failed, 'a wrong password must fail');

  await FF.Auth.signIn('ALICE', 'correct-horse');
  assertEqual(FF.Auth.user().uid, s.uid);
  assertEqual(FF.Storage.get('favorites', []), ['quickTap'], 'data comes back after signing in');
  await FF.Auth.signOut();
  await FF.Auth.signIn('a@example.com', 'correct-horse');
  assert(FF.Auth.signedIn());
});

test('auth: usernames and emails are unique', async function () {
  const FF = bootAuth();
  await FF.Auth.init();
  await FF.Auth.signUp({ email: 'a@example.com', username: 'alice', password: 'password1', displayName: 'Alice', avatar: 'nia' });
  await FF.Auth.signOut();
  let code = '';
  try { await FF.Auth.signUp({ email: 'b@example.com', username: 'alice', password: 'password1', displayName: 'B', avatar: 'fox' }); } catch (e) { code = e.code; }
  assertEqual(code, 'auth/username-taken');
  code = '';
  try { await FF.Auth.signUp({ email: 'A@example.com', username: 'bob', password: 'password1', displayName: 'B', avatar: 'fox' }); } catch (e) { code = e.code; }
  assertEqual(code, 'auth/email-already-in-use');
});

test('auth: a signed-in session survives a reload', async function () {
  const FF = bootAuth();
  await FF.Auth.init();
  await FF.Auth.signUp({ email: 'a@example.com', username: 'alice', password: 'password1', displayName: 'Alice', avatar: 'nia' });
  FF.Auth._resetForTest && FF.Auth._resetForTest();
  const again = await FF.Auth.init();
  assert(again && again.username === 'alice', 'cached session restores');
});
