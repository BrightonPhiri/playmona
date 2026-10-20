'use strict';
const { loadFF, test, assertEqual } = require('./harness');

test('exiting a room game returns to the room lobby', function () {
  const FF = loadFF(['js/core.js', 'js/registry.js']);
  let destination = null;
  FF.Room = { current: function () { return {}; } };
  FF.GameFlow.current = { config: { room: true } };
  FF.GameFlow.close = function (view) { destination = view; };

  FF.GameFlow.exitToHome();

  assertEqual(destination, 'online');
});

test('exiting a local game still returns home', function () {
  const FF = loadFF(['js/core.js', 'js/registry.js']);
  let destination = null;
  FF.GameFlow.current = { config: { room: false } };
  FF.GameFlow.close = function (view) { destination = view; };

  FF.GameFlow.exitToHome();

  assertEqual(destination, 'home');
});

test('room results are matched to the game start that launched this client', function () {
  const FF = loadFF(['js/core.js', 'js/registry.js']);
  FF.Room = {
    current: function () { return { meta: { startAt: 200 } }; }
  };
  const oldGame = {
    def: { id: 'familyQuiz' },
    config: { room: true, roomStartAt: 100 }
  };

  assertEqual(FF.GameFlow._roomSnapshotMatches({
    gameId: 'familyQuiz',
    startAt: 100
  }, oldGame), true);
  assertEqual(FF.GameFlow._roomSnapshotMatches({
    gameId: 'familyQuiz',
    startAt: 200
  }, oldGame), false);
});
