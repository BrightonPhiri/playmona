'use strict';
/* Smaller points (docs/superpowers/specs/2026-11-27-points-rebalance-design.md): every game
   keeps its own way of scoring, but no single award is above 10 and costs are 1 to 3.
   Each block pins one game's numbers at the edges of the approved table. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const UI = ['js/core.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js', 'js/gameLength.js'];

/* Loads base scripts, then game files run with a stub registerGame (as the game tests do). */
function loadGame(base, gameFiles) {
  const FF = loadFF(base);
  FF.registerGame = function () {};
  (gameFiles || []).forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), FF.__sandbox, { filename: path.basename(f) });
  });
  return FF;
}

function within(label, n, max) {
  assert(typeof n === 'number' && n >= 0 && n <= max, label + ': ' + n + ' should be 0 to ' + max);
}

/* ---------------- Task 1: Bible Quiz and the Bible games ---------------- */

test('points: bible quiz scores 10 a right answer, speed up to 5, bonus question +5', function () {
  const B = loadGame(['js/core.js', 'js/data/bibleQuiz.js'], ['js/games/bibleQuiz.js']).BibleQuiz;
  assertEqual(B.points(true, 0, false), 15);
  assertEqual(B.points(true, 20000, false), 10);
  assertEqual(B.points(true, 0, true), 20);
  assertEqual(B.points(false, 0, true), 0);
  assertEqual(B.SPELL_BONUS, 5);
  assertEqual(B.STREAK_BONUS, 5);
});

test('points: bible games (who am I, verse rush, books) score in small points', function () {
  const G = loadGame(UI.concat(['js/data/bible.js']), ['js/games/bibleGames.js']).BibleGames;
  assertEqual([1, 2, 3, 4].map(G.who.points), [10, 8, 5, 3]);
  assertEqual(G.verse.buildPoints(0, 30000, 0, 0), 15);
  assertEqual(G.verse.buildPoints(30000, 30000, 9, 9), 3);
  assertEqual(G.verse.wherePoints(true, 0), 15);
  assertEqual(G.verse.wherePoints(true, 20000), 10);
  assertEqual([1, 2, 3, 4].map(G.verse.placePoints), [15, 13, 10, 10]);
  assertEqual(G.books.points('testament', 0), 6);
  assertEqual(G.books.points('order', 9), 15);
  assertEqual(G.SPELL_BONUS, 5);
});

/* ---------------- Task 2: Quiz Mix, Family Quiz, Guess Who, room defaults ---------------- */

test('points: quiz games score 6 / 8 / 10 by level, quick +3, streak +5, Guess Who 10 / 8 / 5 / 3', function () {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/registry.js', 'js/gameLength.js', 'js/data/quiz.js', 'js/games/quizMix.js', 'js/data/quizbank.js']);
  const Q = FF.QuizPoints;
  assert(Q, 'FF.QuizPoints exists');
  assertEqual(['easy', 'normal', 'hard', undefined].map(Q.levelBase), [6, 8, 10, 8]);
  assertEqual(Q.QUICK, 3);
  assertEqual(Q.STREAK, 5);
  assertEqual(Q.SPEED, 5);
  assertEqual(Q.BONUS_Q, 5);
  assertEqual(Q.CLUES, [10, 8, 5, 3]);
});

test('points: room defaults are 10 a right answer, 13 when quick', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/net/race.js'), 'utf8');
  assert(/pointsFor: opts\.pointsFor \|\| function \(\) \{ return 10; \}/.test(src), 'race default is 10');
  assert(/\(answer\.ms != null && answer\.ms <= 2500\) \? 13 : 10/.test(src), 'quick race default is 13');
});

/* ---------------- Task 3: Guess the Country, Guess It!, GeoSpin, Logo Rush ---------------- */

test('points: guess the country scores 10, speed up to 5, Flash +3, typed +5, streak +5', function () {
  const C = loadGame(['js/core.js', 'js/data/worldFlags.js'], ['js/games/guessCountry.js']).GuessCountry;
  assertEqual(C.points(true, 0, 10, false, false), 15);
  assertEqual(C.points(true, 0, 10, true, true), 23);
  assertEqual(C.points(true, 10000, 10, false, false), 10);
  assertEqual(C.points(true, 1000, 0, false, false), 13, 'no clock: quick answer +3');
  assertEqual(C.points(false, 0, 10, true, true), 0);
  assertEqual(C.roomPoints(1000, 'hard'), 13);
  assertEqual(C.roomPoints(5000, 'easy'), 6);
  assertEqual([C.FLASH_BONUS, C.TYPE_BONUS, C.STREAK_BONUS], [3, 5, 5]);
});

test('points: guess it scores 6 / 8 / 10 by level plus small bonuses', function () {
  const I = loadGame(['js/core.js', 'js/i18n.js', 'js/data/animals.js', 'js/data/guessIt.js', 'js/answerMatch.js', 'js/spellTiles.js'], ['js/games/guessIt.js']).GuessIt;
  assertEqual(I.points({ correct: true, level: 'hard', secs: 10, msLeft: 10000, streak: 3, flash: true, typed: true }), 10 + 5 + 5 + 3 + 5);
  assertEqual(I.points({ correct: true, level: 'easy', secs: 10, msLeft: 0, streak: 1 }), 6);
  assertEqual(I.roomPoints(500, 'normal'), 11);
  assertEqual(I.roomPoints(9000, 'hard'), 10);
});

test('points: geospin scores 6 / 8 / 10, speed up to 5, a flat streak bonus up to 5, hints 1 to 3', function () {
  const GS = loadFF(['js/core.js', 'js/answerMatch.js', 'js/data/worldFlags.js', 'js/data/countryAliases.js', 'js/geospin/places.js', 'js/geospin/rules.js']).GeoSpinRules;
  const p = GS.points({ ok: true, level: 'expert', ms: 0, streak: 12 });
  assertEqual([p.base, p.speed, p.streak, p.cost, p.total], [10, 5, 5, 0, 20]);
  assertEqual(GS.points({ ok: true, level: 'easy', ms: 0, streak: 3 }).streak, 2);
  assertEqual(GS.points({ ok: true, level: 'normal', ms: 25000, streak: 5 }).total, 11);
  assertEqual(GS.points({ ok: true, level: 'easy', ms: 30000, hints: { letter: 5 } }).total, 0, 'never below zero');
  assertEqual([GS.streakBonus(2), GS.streakBonus(3), GS.streakBonus(5), GS.streakBonus(10)], [0, 2, 3, 5]);
  Object.keys(GS.HINTS).forEach(function (k) { assert(GS.HINTS[k] >= 1 && GS.HINTS[k] <= 3, 'hint ' + k + ' costs 1 to 3'); });
  assertEqual(GS.points({ ok: false, level: 'hard', ms: 0 }).total, 0);
});

test('points: logo rush scores 6 / 8 / 10, speed up to 5 (10 zoomed), bonuses up to 5', function () {
  const LR = loadFF(['js/core.js', 'js/answerMatch.js', 'js/data/logos.js', 'js/spellTiles.js', 'js/logorush/rules.js']).LogoRushRules;
  const z = LR.points({ ok: true, level: 'hard', secs: 10, ms: 0, twist: 'zoom', mode: 'type' });
  assertEqual([z.base, z.speed, z.bonus, z.total], [10, 10, 5, 25]);
  assertEqual(LR.points({ ok: true, level: 'easy', secs: 10, ms: 0, mode: 'tiles', twist: 'none' }).speed, 5);
  assertEqual(LR.points({ ok: true, level: 'normal', secs: 10, ms: 0, mode: 'tiles', twist: 'flash' }).total, 16);
  Object.keys(LR.BONUS).forEach(function (k) { within('logo bonus ' + k, LR.BONUS[k], 5); });
});

/* ---------------- Task 4: Say What?, What's Missing?, Number Challenge ---------------- */

test('points: say what scores 6 / 8 / 10, speed up to 5, two gaps +5, streak up to 5', function () {
  const SW = loadFF(['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/sayings.js', 'js/saywhat/rules.js']).SayWhatRules;
  const p = SW.points({ ok: true, level: 'hard', secs: 10, ms: 0, two: true, streak: 12 });
  assertEqual([p.base, p.speed, p.two, p.streak, p.total], [10, 5, 5, 5, 25]);
  assertEqual(SW.points({ ok: true, level: 'easy', streak: 3 }).streak, 1);
  assertEqual(SW.points({ ok: true, level: 'normal', streak: 2 }).total, 8);
  assertEqual(SW.BASE, { easy: 6, normal: 8, hard: 10 });
  assertEqual(SW.TWO_POINTS, 5);
});

test('points: whats missing scores 10 a gap, speed up to 5, Expert +5 a gap, flat streak bonus', function () {
  const WM = loadFF(['js/core.js', 'js/data/memoryDecks.js', 'js/answerMatch.js', 'js/data/memoryAliases.js', 'js/whatsmissing/rules.js']).WhatsMissingRules;
  const p = WM.points({ round: { twist: 'several', spell: true, secs: 20 }, res: { ok: true, rightGaps: 3 }, ms: 0, streak: 6 });
  assertEqual([p.base, p.bonus, p.speed, p.streak, p.total], [30, 15, 5, 5, 55]);
  assertEqual(WM.points({ round: { twist: 'gone', secs: 20 }, res: { ok: true, rightGaps: 1 }, ms: 0, streak: 3 }).streak, 2);
  assertEqual(WM.points({ round: { twist: 'swapped', secs: 20 }, res: { ok: true, rightGaps: 2 }, ms: 20000, streak: 1 }).total, 10);
  assertEqual(WM.points({ round: { twist: 'several', secs: 20 }, res: { ok: false, rightGaps: 1 }, ms: 0, streak: 0 }).total, 10, 'a part-right Several still scores its gap');
  Object.keys(WM.BASE).forEach(function (k) { within('wm base ' + k, WM.BASE[k], 10); });
  assertEqual([WM.streakBonus(2), WM.streakBonus(3), WM.streakBonus(5)], [0, 2, 5]);
});

test('points: number challenge scores 10 plus small bonuses, sprint 1 to 5 by tier', function () {
  const NC = loadFF(['js/core.js', 'js/numberchallenge/rules.js']).NumberChallengeRules;
  assertEqual(NC.points('quick', { right: true, ms: 0, level: 'expert' }), 18);
  assertEqual(NC.points('quick', { right: true, ms: 20000, level: 'easy' }), 10);
  assertEqual([1, 2, 3, 4, 5].map(function (tier) { return NC.points('sprint', { right: true, tier: tier, level: 'hard' }); }), [1, 2, 3, 4, 5]);
  assertEqual(NC.points('chain', { right: true, ms: 0, limitMs: 30000, steps: 4, level: 'normal' }), 15);
  assertEqual(NC.points('chain', { right: true, ms: 0, limitMs: 30000, steps: 4, level: 'expert' }), 18);
  assertEqual(NC.points('target', { off: 0, level: 'normal' }), 10);
  assertEqual(NC.points('target', { off: 0, level: 'expert', usedAll: true }), 13);
  assertEqual(NC.points('target', { off: 3, level: 'normal' }), 5);
  assertEqual(NC.points('target', { off: 8, level: 'normal' }), 3);
  assertEqual(NC.points('target', { off: 30, level: 'normal' }), 0);
  assertEqual(NC.points('quick', { right: false, ms: 0, level: 'hard' }), 0);
});

module.exports = { loadGame: loadGame, within: within, UI: UI };
