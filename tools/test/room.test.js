'use strict';
const { loadFF, test, assertEqual } = require('./harness');

test('room meta subscribers immediately receive the current state', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });

  let received = null;
  FF.Room.on('meta', function (meta) { received = meta; });
  await Promise.resolve();

  assertEqual(received && received.status, 'lobby');
  FF.Room.leave();
});

test('host can mark a playing room as ended', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });
  await FF.Room.startGame('familyQuiz', {});
  await FF.Room.endGame();

  const meta = await FF.Room.current().transport.get('meta');
  assertEqual(meta.status, 'ended');
  FF.Room.leave();
});

test('host publishes one shared results snapshot when the game ends', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });
  const snapshot = {
    gameId: 'familyQuiz',
    startAt: 123,
    ranked: [{ id: 'u1', name: 'A', points: 250 }]
  };
  await FF.Room.endGame(snapshot);

  const meta = await FF.Room.current().transport.get('meta');
  assertEqual(meta.results, snapshot);
  FF.Room.leave();
});

test('room presence records when the player was last seen', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });
  await Promise.resolve();

  const state = FF.Room.current();
  const me = state.players[state.uid];
  assertEqual(typeof (me && me.lastSeen), 'number');
  FF.Room.leave();
});

test('heartbeat-only player updates do not rerender room screens', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });
  await Promise.resolve();

  let renders = 0;
  FF.Room.on('players', function () { renders++; });
  await Promise.resolve();
  const state = FF.Room.current();
  await state.transport.update('players/' + state.uid, {
    lastSeen: state.transport.serverNow() + 1
  });

  assertEqual(renders, 1, 'the immediate replay is the only screen update');
  FF.Room.leave();
});

test('stale room members are exposed as offline to lobby and host migration', async function () {
  const FF = loadFF([
    'js/core.js',
    'js/storage.js',
    'js/net/transport.js',
    'js/net/room.js'
  ]);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['😀'],
    COLORS: ['#8b5cf6'],
    get: function () { return []; }
  };
  await FF.Room.create({ dev: true });
  await Promise.resolve();
  const state = FF.Room.current();
  state.players[state.uid].lastSeen = state.transport.serverNow() - 30000;

  assertEqual(FF.Room.racePlayers()[0].online, false);
  FF.Room.leave();
});
