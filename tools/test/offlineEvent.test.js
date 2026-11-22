'use strict';
/* Offline Event Mode (js/offline/logic.js): coordinates, Picture Rush on one board,
   the quiz text format, Word by Word turns, Memory scores and the MC's clock. */
const path = require('path');
const { test, assert, assertEqual, ROOT } = require('./harness');
const L = require(path.join(ROOT, 'js/offline/logic.js'));

function sum(o) { return Object.keys(o).reduce(function (n, k) { return n + o[k]; }, 0); }

test('offline: coordinates read both ways and stay on the board', function () {
  assertEqual(L.parseCoord('A1', 4), 0);
  assertEqual(L.parseCoord('b4', 4), 13);
  assertEqual(L.parseCoord('4B', 4), 13);
  assertEqual(L.parseCoord('E1', 4), -1, 'column E is off a 4×4 board');
  assertEqual(L.parseCoord('A7', 6), -1);
  assertEqual(L.coord(35, 6), 'F6');
  assertEqual(JSON.stringify(L.parseMove('A1 to B4', 4)), '[0,13]');
  assertEqual(JSON.stringify(L.parseMove('a1b4', 4)), '[0,13]');
  assertEqual(JSON.stringify(L.parseMove('A1-B4', 4)), '[0,13]');
  assertEqual(L.parseMove('A1', 4), null);
});

test('offline: Picture Rush wrong moves change nothing, right moves lock and score once', function () {
  const s = L.fresh();
  L.prStart(s, { photoId: 'p', size: 3 });
  L.prGo(s);
  const g = s.pr;
  assertEqual(L.prPlaced(g), 0, 'no tile starts in place');
  const before = g.tiles.join();
  const wrongTo = [1, 2, 3, 4, 5, 6, 7, 8].find(function (x) { return x !== g.tiles[0]; });
  const r = L.prMove(s, 0, wrongTo);
  assertEqual(r.ok, false);
  assertEqual(g.tiles.join(), before, 'a wrong move leaves the board alone');
  assertEqual(g.turn, 1, 'the turn passes after a try');
  let guard = 0;
  while (!g.done && guard++ < 20) {
    const f = g.tiles.findIndex(function (p, i) { return p !== i; });
    assert(L.prMove(s, f, g.tiles[f]).ok, 'the right square is accepted');
  }
  assert(g.done, 'the round ends when every tile is in place');
  assertEqual(sum(L.totals(s)), 9, 'one point per tile, never twice');
  assertEqual(L.prMove(s, 0, 1).error, 'over');
  L.prRestart(s);
  assertEqual(sum(L.totals(s)), 0, 'restarting takes the round\'s points back');
  assertEqual(L.prMove(s, 0, 0).error, 'same');
});

test('offline: quiz lines with options, open answers and unfinished questions', function () {
  const qs = L.parseQuiz('Q1 | a | *b | c | d\nQ2 | = Paris\nQ3 | ? | ? | ? | ?\n# a comment\n');
  assertEqual(qs.length, 3);
  assertEqual(qs[0].answer, 1);
  assert(qs[0].ready && qs[1].ready && !qs[2].ready);
  assertEqual(qs[1].answerText, 'Paris');
  assertEqual(L.quizQuestions(L.fresh()).length, 20, 'twenty questions ready to fill in');
  const s = L.fresh();
  L.quizStart(s, 'turns');
  L.quizMark(s, 't1', true); L.quizMark(s, 't1', true);
  assertEqual(L.totals(s).t1, 1, 'marking twice still gives the points once');
  L.quizMark(s, 't1', false);
  assertEqual(L.totals(s).t1, 0);
});

test('offline: Word by Word turns, undo and the MC clock passing a turn', function () {
  const s = L.fresh();
  L.wbwStart(s);
  L.wbwGo(s);
  L.wbwAdd(s, 'You'); L.wbwAdd(s, 'are');
  assertEqual(L.wbwText(s.wbw), 'Dear Vicky, You are');
  L.wbwUndo(s);
  assertEqual(s.wbw.turn, 1, 'undo hands the turn back');
  s.wbw.tm.endsAt = Date.now() - 1;
  assert(L.tick(s));
  assertEqual(s.wbw.turn, 2, 'time up passes the turn');
});

test('offline: Memory hides by itself and records one score per team', function () {
  const s = L.fresh();
  L.memStart(s, [1, 2, 3, 4, 5], 3);
  assertEqual(s.memory.items.length, 3);
  L.memPhase(s, 'show');
  s.memory.tm.endsAt = Date.now() - 1;
  L.tick(s);
  assertEqual(s.memory.phase, 'hidden');
  L.memScore(s, 't2', 7); L.memScore(s, 't2', 8);
  assertEqual(L.memGot(s, 't2'), 8);
  assertEqual(L.totals(s).t2, 8);
});

test('offline: teams can be added, benched and removed with their points', function () {
  const s = L.fresh();
  assertEqual(s.teams.length, 5);
  const t = L.addTeam(s, 'Team Ivory');
  L.award(s, t.id, 3, 'mc');
  L.setActive(s, 't2', false);
  assertEqual(L.activeTeams(s).length, 5);
  L.setActive(s, 't2', true);
  assertEqual(s.active[1], 't2', 'a team comes back in its own place');
  L.removeTeam(s, t.id);
  assertEqual(s.awards.length, 0);
});
