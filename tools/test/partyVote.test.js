'use strict';
/* Party votes online (Would You Rather?, This or That, Who Is Most Likely):
   the 'vote' race mode, its scoring, the shared prompt draw and the wiring
   in js/games/partyGames.js. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

function players(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ uid: 'u' + i, online: true });
  return out;
}

function loadParty() {
  const FF = loadFF(['js/core.js', 'js/net/raceRules.js']);
  FF.registerGame = function () {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/partyGames.js'), 'utf8'), FF.__sandbox, { filename: 'partyGames.js' });
  return FF;
}

test('party vote: the tally counts votes and lists every top choice', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const t = FF.RaceRules.tally({ answers: {
    u1: { choice: 'a' }, u2: { choice: 'b' }, u3: { choice: 'a' }, u4: { choice: null }
  } });
  assertEqual(t.counts.a, 2);
  assertEqual(t.counts.b, 1);
  assertEqual(t.max, 2);
  assertEqual(JSON.stringify(t.top), '["a"]');
  const tie = FF.RaceRules.tally({ answers: { u1: { choice: 'b' }, u2: { choice: 'a' } } });
  assertEqual(JSON.stringify(tie.top), '["a","b"]', 'a tie lists both, in the same order everywhere');
  const none = FF.RaceRules.tally({});
  assertEqual(none.max, 0);
  assertEqual(none.top.length, 0, 'no votes, no top pick');
});

test('party vote: a vote round waits for everyone (or the clock) and has no winner', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const half = FF.RaceRules.settle({ startedAt: 1000, answers: { u1: { choice: 'a' } } }, players(2), 30000, 5000, 'vote');
  assertEqual(half.settled, false, 'one vote still to come');
  const all = FF.RaceRules.settle({ startedAt: 1000, answers: { u1: { choice: 'a' }, u2: { choice: 'b' } } }, players(2), 30000, 5000, 'vote');
  assertEqual(all.settled, true);
  assertEqual(all.winnerId, null, 'nobody wins a vote');
  assertEqual(all.reason, 'exhausted');
  const late = FF.RaceRules.settle({ startedAt: 1000, answers: { u1: { choice: 'a' } } }, players(2), 30000, 31000, 'vote');
  assertEqual(late.settled, true, 'the clock closes the vote');
  assertEqual(late.reason, 'timeout');
});

test('party vote: scores come from settled rounds only, scored as a whole', function () {
  const FF = loadFF(['js/net/raceRules.js']);
  const rounds = {
    0: { winner: '-', answers: { u1: { choice: 'a' }, u2: { choice: 'a' }, u3: { choice: 'b' } } },
    1: { winner: '-', answers: { u1: { choice: 'u3' }, u2: { choice: 'u3' } } },
    2: { winner: null, answers: { u1: { choice: 'b' } } }   // still open: must not leak
  };
  const scores = FF.RaceRules.scores(rounds, players(3), function (answers, tally) {
    const out = {};
    Object.keys(answers).forEach(function (uid) { if (tally.top.indexOf(String(answers[uid].choice)) !== -1) out[uid] = 10; });
    tally.top.forEach(function (c) { if (/^u/.test(c)) out[c] = (out[c] || 0) + 5; });
    return out;
  }, 'vote');
  assertEqual(scores.u1, 20);
  assertEqual(scores.u2, 20);
  assertEqual(scores.u3, 5, 'picked by the room without voting with it');
});

test('party vote: majority and most-likely points', function () {
  const V = loadParty().PartyVote;
  const FF = loadFF(['js/net/raceRules.js']);
  const choice = { u1: { choice: 'a' }, u2: { choice: 'b' }, u3: { choice: 'a' } };
  const m = V.majorityPoints(choice, FF.RaceRules.tally({ answers: choice }), 50);
  assertEqual(JSON.stringify(m), '{"u1":50,"u3":50}');
  const tie = { u1: { choice: 'a' }, u2: { choice: 'b' } };
  const t = V.majorityPoints(tie, FF.RaceRules.tally({ answers: tie }), 40);
  assertEqual(t.u1 + t.u2, 80, 'a tie: everyone who voted scores');
  const likely = { u1: { choice: 'u3' }, u2: { choice: 'u3' }, u3: { choice: 'u1' } };
  const l = V.likelyPoints(likely, FF.RaceRules.tally({ answers: likely }), 50, 50);
  assertEqual(l.u1, 50);
  assertEqual(l.u2, 50);
  assertEqual(l.u3, 50, 'the one the room picked earns the crown');
});

test('party vote: the same seed draws the same prompts, without repeats', function () {
  const FF = loadParty();
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  function game() {
    const used = {};
    const out = [];
    for (let n = 0; n < list.length; n++) {
      FF.Random.seed('room|wouldYouRather|' + n);
      out.push(FF.PartyVote.draw(list, used, FF._rand));
    }
    return out;
  }
  const a = game();
  const b = game();
  assertEqual(a.join(), b.join(), 'two phones draw the same rounds');
  assertEqual(a.slice().sort().join(), list.join(), 'every prompt once');
  const used = {};
  list.forEach(function () { FF.PartyVote.draw(list, used, FF._rand); });
  assert(list.indexOf(FF.PartyVote.draw(list, used, FF._rand)) !== -1, 'a long game starts the deck again');
  FF.Random.unseed();
});

test('party vote: all three games play online with the vote race', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/partyGames.js'), 'utf8');
  const online = src.slice(src.indexOf('online rooms ====='), src.indexOf('registrations ====='));
  assert(/mode: 'vote'/.test(online), 'vote race mode');
  assert(/FF\.Race\.beginRound\(n\);\s*\/\/[^\n]*\n\s*item = VOTE\.draw\(cfg\.list, used, FF\._rand\)/.test(online), 'the prompt is drawn straight after the round is seeded');
  assert(/FF\.Race\.describe\(/.test(online), 'people watching see each round');
  assert(/FF\.Room\.on\('rounds'/.test(online), 'shows live who has voted');
  assert(/FF\.Advance\.button\([\s\S]*ms: VOTE\.REVEAL_MS/.test(online), 'the room moves on together');
  assert(!/#[0-9a-fA-F]{3,6}\b|<style|\.style\.(color|background)/.test(online), 'looks live in css/games.css');
  assertEqual((src.match(/runVoteOnline\(api, \{ kind: '(choice|likely)'/g) || []).length, 2, 'both engines hand over to the online runner');
  const ui = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  const list = /ONLINE_GAMES = \[([\s\S]*?)\];/.exec(ui)[1];
  ['wouldYouRather', 'thisOrThat', 'whoIsMostLikely'].forEach(function (id) {
    assert(list.indexOf("'" + id + "'") !== -1, id + ' is offered in rooms');
  });
});

/* Two phones on one in-memory bus vote through the real race layer. */
function makeBus() {
  const store = {};
  const listeners = [];
  return {
    read: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
    write: function (k, v) {
      if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v));
      listeners.slice().forEach(function (fn) { fn(k); });
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    }
  };
}
function phone(bus, name) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/net/transport.js', 'js/net/room.js', 'js/net/raceRules.js', 'js/net/race.js']);
  FF.Storage.init();
  FF.Players = { AVATARS: ['fox'], COLORS: ['#8b5cf6'], get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; } };
  FF.t = function (k, f) { return f || k; };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  return FF;
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }

test('party vote: two phones settle a vote together and agree on the scores', async function () {
  const bus = makeBus();
  const A = phone(bus, 'Ana'), B = phone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('wouldYouRather', {});
  await tick(20);
  function points(answers, tally) {
    const out = {};
    Object.keys(answers).forEach(function (uid) { if (tally.top.indexOf(String(answers[uid].choice)) !== -1) out[uid] = 50; });
    return out;
  }
  const settled = { A: 0, B: 0 };
  [['A', A], ['B', B]].forEach(function (p) {
    p[1].Race.begin('wouldYouRather', { rounds: 2, mode: 'vote', timerMs: 30000, pointsFor: points });
    p[1].Race.onSettle(function () { settled[p[0]]++; });
  });
  await A.Race.beginRound(0);
  await B.Race.beginRound(0);
  await tick(1300);                          // the round opens
  await A.Race.submit('a', true, 400);
  await tick(40);
  assertEqual(settled.A + settled.B, 0, 'one vote is not enough');
  await B.Race.submit('a', true, 900);
  await tick(80);
  assertEqual(settled.A, 1, 'Ana sees the reveal');
  assertEqual(settled.B, 1, 'Ben sees it too');
  const a = A.Race.scores(), b = B.Race.scores();
  assertEqual(a[A.Room.current().uid], 50);
  assertEqual(a[B.Room.current().uid], 50, 'both sided with the room');
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'every phone derives the same scores');
  A.Race.end(); B.Race.end(); A.Room.leave(); B.Room.leave();
});
