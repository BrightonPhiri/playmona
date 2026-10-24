'use strict';
/* The paywall (FF.Access in gameConfig.js): Plus games, free plays a day, and when it is switched on. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/auth.js', 'js/cloud.js', 'js/gameConfig.js'];

// owned: { plus: bool, games: { id: true } }, admin: bool
async function boot(opts) {
  opts = opts || {};
  const FF = loadFF(FILES);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  FF.Games.register({ id: 'pictionary', name: 'Pictionary', category: 'creative' });
  FF.Games.register({ id: 'spy', name: 'Who is the Spy', category: 'party' });
  FF.Games.register({ id: 'familyQuiz', name: 'Quiz Mix', category: 'quiz' });
  const owned = opts.owned || {};
  FF.Plus = {
    isAdmin: function () { return !!opts.admin; },
    ownsGame: function (id) { return !!owned.plus || !!(owned.games && owned.games[id]); }
  };
  await FF.Auth.init();
  if (opts.guest) await FF.Auth.playAsGuest();
  else await FF.Auth.signUp({ email: 'p@example.com', username: 'pat', password: 'password1', displayName: 'Pat', avatar: 'nia' });
  FF.GameConfig._set({
    games: {
      pictionary: { tier: 'limited', freePlays: 3 },
      spy: { tier: 'premium' },
      familyQuiz: { guest: true }
    },
    site: { payments: opts.payments !== false }
  });
  return FF;
}

test('paywall: a Plus game is locked for a player without Plus', async function () {
  const FF = await boot();
  assertEqual(FF.Access.lock('spy'), 'premium');
  assertEqual(FF.Access.canPlay('spy'), false);
  assertEqual(FF.Access.cardBadge('spy').kind, 'plus');
  assertEqual(FF.Access.canPlay('familyQuiz'), true, 'free games stay open');
  assertEqual(FF.Access.cardBadge('familyQuiz'), null);
});

test('paywall: Plus, or buying the game, opens it and drops the badge', async function () {
  let FF = await boot({ owned: { plus: true } });
  assertEqual(FF.Access.lock('spy'), null);
  assertEqual(FF.Access.lock('pictionary'), null);
  assertEqual(FF.Access.cardBadge('spy'), null);
  assertEqual(FF.Access.playsLeft('pictionary'), null, 'no limit with Plus');

  FF = await boot({ owned: { games: { spy: true } } });
  assertEqual(FF.Access.lock('spy'), null, 'bought on its own');
  assertEqual(FF.Access.tier('pictionary'), 'limited', 'other games still follow their tier');
});

test('paywall: a limited game gives its free plays, then asks for Plus', async function () {
  const FF = await boot();
  assertEqual(FF.Access.playsLeft('pictionary'), 3);
  assertEqual(FF.Access.cardBadge('pictionary').text, '3 free today');
  FF.Access.usePlay('pictionary');
  FF.Access.usePlay('pictionary');
  assertEqual(FF.Access.playsLeft('pictionary'), 1);
  assertEqual(FF.Access.canPlay('pictionary'), true);
  FF.Access.usePlay('pictionary');
  assertEqual(FF.Access.playsLeft('pictionary'), 0);
  assertEqual(FF.Access.lock('pictionary'), 'limit');
  assertEqual(FF.Access.cardBadge('pictionary').kind, 'plus');
  FF.Access.usePlay('familyQuiz');
  assertEqual(FF.Storage.get('freePlays', null).counts.familyQuiz, undefined, 'free games are not counted');
});

test('paywall: free plays come back the next day (UTC)', async function () {
  const FF = await boot();
  FF.Storage.set('freePlays', { day: '2000-01-01', counts: { pictionary: 3 } });
  assertEqual(FF.Access.playsLeft('pictionary'), 3);
  FF.Access.usePlay('pictionary');
  assertEqual(FF.Storage.get('freePlays', null).day, new Date().toISOString().slice(0, 10));
  assertEqual(FF.Storage.get('freePlays', null).counts.pictionary, 1, 'yesterday is forgotten');
});

test('paywall: a limited game with 0 free plays is Plus only', async function () {
  const FF = await boot();
  FF.GameConfig._set({ games: { pictionary: { tier: 'limited', freePlays: 0 } }, site: { payments: true } });
  assertEqual(FF.Access.lock('pictionary'), 'limit');
});

test('paywall: off until payments are switched on, except for admins', async function () {
  let FF = await boot({ payments: false });
  assertEqual(FF.Access.paywallOn(), false);
  assertEqual(FF.Access.canPlay('spy'), true, 'nobody meets a wall they cannot pay through');
  assertEqual(FF.Access.cardBadge('spy'), null);
  FF.Access.usePlay('pictionary');
  assertEqual(FF.Access.playsUsed('pictionary'), 0, 'nothing is counted while it is off');

  FF = await boot({ payments: false, admin: true });
  assertEqual(FF.Access.paywallOn(), true, 'admins see it early to test it');
  assertEqual(FF.Access.lock('spy'), 'premium');
});

test('paywall: guests get the sign-up invitation, not the paywall', async function () {
  const FF = await boot({ guest: true });
  assertEqual(FF.Access.paywallOn(), false);
  assertEqual(FF.Access.lock('spy'), 'guest');
  assertEqual(FF.Access.lock('familyQuiz'), null);
});

test('paywall: free plays belong to the account, not the device', async function () {
  const FF = await boot();
  FF.Access.usePlay('pictionary');
  FF.Access.usePlay('pictionary');
  await FF.Auth.signOut();
  await FF.Auth.signUp({ email: 'q@example.com', username: 'quinn', password: 'password1', displayName: 'Quinn', avatar: 'fox' });
  assertEqual(FF.Access.playsLeft('pictionary'), 3, 'a second account on the phone starts fresh');
  assert(true);
});
