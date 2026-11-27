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

/* ---------------- One end screen (FF.EndScreen) ---------------- */

function endFlow() {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/storage.js', 'js/registry.js']);
  FF.Storage.init();
  const screen = FF.__sandbox.document.createElement('div');
  FF.ui.$ = function () { return screen; };
  FF.Audio = { play: function () {}, unlock: function () {} };
  FF.Nav = { focusFirst: function () {} };
  const seen = { data: null, places: null };
  FF.EndScreen = { render: function (el, data) { seen.data = data; return { setPlaces: function (p) { seen.places = p; } }; } };
  return { FF: FF, seen: seen };
}
function ids(list) { return list.map(function (a) { return a.id; }); }

test('end screen: normal actions with and without setup and challenge', function () {
  const { FF } = endFlow();
  const full = FF.GameFlow._endActions('normal', { hasSetup: true, canChallenge: true });
  assertEqual(ids(full), ['playAgain', 'changeSettings', 'challenge', 'otherGame', 'home']);
  assertEqual(ids(FF.GameFlow._endActions('normal', { hasSetup: false, canChallenge: false })), ['playAgain', 'otherGame', 'home']);
  assertEqual(full.filter(function (a) { return a.primary; }).map(function (a) { return a.id; }), ['playAgain']);
});

test('end screen: daily, challenge, celebration and room actions', function () {
  const { FF } = endFlow();
  assertEqual(ids(FF.GameFlow._endActions('daily', {})), ['dailyBoard', 'home']);
  assertEqual(ids(FF.GameFlow._endActions('challenge', {})), ['seeWhoWon', 'home']);
  assertEqual(ids(FF.GameFlow._endActions('celebration', {})), ['backToParty']);
  assertEqual(ids(FF.GameFlow._endActions('room', { isHost: true })), ['playAgain', 'backToRoom']);
  assertEqual(ids(FF.GameFlow._endActions('room', { isHost: false })), ['backToRoom']);
});

test('end screen: play again replays, change settings does not', function () {
  const { FF } = endFlow();
  const calls = [];
  FF.GameFlow.current = { def: { id: 'stacoend', setup: true }, config: {} };
  FF.GameFlow.launch = function (id, o) { calls.push([id, o]); };
  const acts = FF.GameFlow._endActions('normal', { hasSetup: true });
  acts.filter(function (a) { return a.id === 'playAgain'; })[0].onClick();
  acts.filter(function (a) { return a.id === 'changeSettings'; })[0].onClick();
  assertEqual(calls[0][0], 'stacoend');
  assertEqual([calls[0][1].skipIntro, calls[0][1].replay], [true, true]);
  assertEqual([calls[1][1].skipIntro, calls[1][1].replay === true], [true, false]);
});

test('end screen: buildConfig carries the replay flag', function () {
  const { FF } = endFlow();
  FF.Players = { get: function () { return [{ id: 'me', name: 'Me' }]; }, entities: function () { return [{ id: 'me', name: 'Me' }]; }, me: function () { return null; } };
  FF.Teams = { enabled: function () { return false; }, get: function () { return { teams: [] }; }, entities: function () { return []; } };
  const def = { id: 'x', modes: ['solo'] };
  assertEqual(FF.GameFlow.buildConfig(def, { replay: true }).replay, true);
  assertEqual(FF.GameFlow.buildConfig(def, {}).replay, false);
});

test('end screen: a room end keeps the room places and this phone summary', function () {
  const { FF, seen } = endFlow();
  FF.Room = { current: function () { return { isHost: true }; }, offAll: function () {}, on: function () {} };
  FF.GameFlow.current = { def: { id: 'sayWhat' }, config: { room: true } };
  const roomRanked = [{ id: 'u1', name: 'Amy', points: 30 }, { id: 'u2', name: 'Ben', points: 20 }];
  FF.GameFlow.showResults({ results: roomRanked, room: true, summary: { headline: 'Mine', stats: [{ label: 'Right', value: '3' }] } });
  assertEqual(seen.data.ranked, roomRanked);
  assertEqual(seen.data.summary.headline, 'Mine');
  assertEqual(seen.data.kind, 'room');
});

test('end screen: XP gained is the difference recordResult made', function () {
  const { FF, seen } = endFlow();
  let xp = 100;
  FF.Stats = {
    get: function () { return { xp: xp }; },
    recordGamePlayed: function () {},
    recordResult: function () { xp = 116; },
    unlock: function () {}
  };
  FF.Recents = { add: function () {} };
  FF.GameFlow.current = { def: { id: 'stacoend', name: 'Stacoend', category: 'words' }, config: { mode: 'solo' } };
  FF.GameFlow.end({ results: [{ id: 'me', name: 'Me', points: 32, isMe: true }] });
  assertEqual(seen.data.xp, { gained: 16, total: 116 });
});
