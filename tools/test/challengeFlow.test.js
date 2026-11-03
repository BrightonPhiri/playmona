'use strict';
/* Challenge runs in FF.GameFlow: which finished runs can become a challenge, how a
   challenge launch is set up, and that the same challenge seed deals the same game. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/auth.js', 'js/cloud.js', 'js/gameConfig.js', 'js/leaderboards.js'];

function boot() {
  const FF = loadFF(FILES);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  FF.Games.register({ id: 'quickTap', name: 'Quick Tap', category: 'reaction', players: [1, 8], modes: ['solo', 'turn'] });
  FF.Games.register({ id: 'charades', name: 'Charades', category: 'creative', players: [2, 8], modes: ['turn'] });
  return FF;
}

function solo(FF, id, extra) {
  return Object.assign({ def: FF.Games.get(id), mode: 'solo', difficulty: 'normal', length: 'normal', timer: 20, clock: 0, variation: 'standard',
    room: false, tournament: false, daily: null, challenge: null, scorers: [{ id: 'me', isMe: true, name: 'Me' }] }, extra || {});
}

test('challenge flow: a standard solo run of an eligible game can be challenged, even as a guest', function () {
  const FF = boot();
  const LB = FF.Leaderboards;
  assertEqual(LB.challengeable(solo(FF, 'quickTap')), true, 'no account needed for the run itself');
  assertEqual(LB.challengeable(solo(FF, 'quickTap', { clock: 60 })), false, 'game clock');
  assertEqual(LB.challengeable(solo(FF, 'quickTap', { difficulty: 'hard' })), false, 'settings');
  assertEqual(LB.challengeable(solo(FF, 'quickTap', { room: true })), false, 'room');
  assertEqual(LB.challengeable(solo(FF, 'quickTap', { variation: 'display' })), false, 'TV mode');
  assertEqual(LB.challengeable(solo(FF, 'quickTap', { scorers: [{ id: 'a' }, { id: 'b' }] })), false, 'two players');
  assertEqual(LB.challengeable(solo(FF, 'charades')), false, 'creative game');
});

test('challenge flow: a candidate run gets its own 8-character seed', function () {
  const FF = boot();
  const config = solo(FF, 'quickTap');
  const seed = FF.GameFlow._seedFor(config.def, config);
  assert(/^[a-z0-9]{8}$/.test(config.challengeSeed), 'seed: ' + config.challengeSeed);
  assertEqual(seed, 'ch|' + config.challengeSeed + '|quickTap|init');
  assertEqual(config.sharedDeal, true);
  assertEqual(config.randomOrder, false);
});

test('challenge flow: a run that cannot be challenged is not seeded', function () {
  const FF = boot();
  const config = solo(FF, 'quickTap', { clock: 60 });
  assertEqual(FF.GameFlow._seedFor(config.def, config), null);
  assertEqual(config.challengeSeed || null, null);
});

test('challenge flow: a challenge launch plays standard settings from the challenge seed', function () {
  const FF = boot();
  FF.Settings.set('difficulty', 'hard');
  const def = FF.Games.get('quickTap');
  const config = FF.GameFlow.buildConfig(def, { challenge: { id: 'abcdefgh12', seed: 'k3y9x2p1' } });
  const std = FF.Leaderboards.standard();
  assertEqual([config.mode, config.difficulty, config.length, config.timer, config.clock], ['solo', std.difficulty, std.length, std.timer, 0]);
  assertEqual(config.sharedDeal, true);
  assertEqual(FF.GameFlow._seedFor(def, config), 'ch|k3y9x2p1|quickTap|init');
  assertEqual(config.challengeSeed, 'k3y9x2p1', 'a challenge run keeps its seed for "challenge them back"');
});

test('challenge flow: a received challenge unlocks its game once', function () {
  const FF = boot();
  assertEqual(FF.GameFlow._checksAccess({ challenge: { id: 'abcdefgh12', seed: 'k3y9x2p1' } }), false);
  assertEqual(FF.GameFlow._checksAccess({ daily: '2026-11-03' }), false);
  assertEqual(FF.GameFlow._checksAccess({ skipIntro: true }), true, 'play again checks as usual');
});

test('challenge flow: the same challenge seed deals the same numbers on two phones', function () {
  const draw = function () {
    const FF = boot();
    const config = FF.GameFlow.buildConfig(FF.Games.get('quickTap'), { challenge: { id: 'abcdefgh12', seed: 'k3y9x2p1' } });
    FF.Random.seed(FF.GameFlow._seedFor(config.def, config));
    const out = [];
    for (let i = 0; i < 20; i++) out.push(FF._rand());
    return out;
  };
  assertEqual(JSON.stringify(draw()), JSON.stringify(draw()));
});

test('review: a run that cannot be a challenge never keeps an earlier seed', function () {
  const FF = boot();
  FF.Random.seed('left|over');
  const config = solo(FF, 'quickTap', { scorers: [{ id: 'a' }, { id: 'b' }] });
  FF.GameFlow._applySeed(config.def, config);
  assertEqual(FF.Random.seeded(), false);
});

test('review: a friend\'s challenge is one go, so pausing offers no restart', function () {
  const FF = boot();
  assertEqual(FF.GameFlow._canRestart({ config: { challenge: { id: 'abcdefgh12', seed: 'k3y9x2p1' } } }), false);
  assertEqual(FF.GameFlow._canRestart({ config: {} }), true);
});

test('review: restarting a picker run keeps it challenge-ready', function () {
  const FF = boot();
  const config = FF.GameFlow.buildConfig(FF.Games.get('quickTap'), { standard: true });
  assertEqual(config.standard, true);
  assertEqual(FF.GameFlow._restartOverrides({ config: config }).standard, true);
});

test('review: game ids that are built-in object names are not games', function () {
  const FF = boot();
  assertEqual(FF.Games.get('constructor'), null);
  assertEqual(FF.Games.get('toString'), null);
});
