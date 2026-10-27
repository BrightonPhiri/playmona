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

test('room results list everyone who played, even with 0 points and a late heartbeat', function () {
  const FF = loadFF(['js/core.js', 'js/registry.js']);
  const rounds = { 0: { answers: { me: { correct: true }, crew1: { correct: false } } } };
  FF.Race = { scores: function () { return { me: 100, crew1: 0, oldVisitor: 0 }; } };
  FF.Room = {
    current: function () { return { uid: 'me', meta: { mode: 'players' }, rounds: rounds }; },
    racePlayers: function () {
      return [
        { uid: 'me', name: 'Me', online: true },
        { uid: 'crew1', name: 'Tariro', online: false },     // heartbeat looked late
        { uid: 'oldVisitor', name: 'Gone', online: false }   // in the saved room, not this game
      ];
    }
  };
  const ranked = FF.GameFlow._rankRoomScores(rounds);
  assertEqual(ranked.map(function (r) { return r.uid + ':' + r.points; }).join(','), 'me:100,crew1:0');
});
