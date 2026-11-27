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

module.exports = { loadGame: loadGame, within: within, UI: UI };
