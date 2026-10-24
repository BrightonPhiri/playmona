'use strict';
/* Every room game tells the race layer what its rounds show (FF.Race.describe),
   so people watching see the question. A source check: games need the full
   game shell to run headless. */
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

test('every room game describes its screen', function () {
  // Minimum number of describe calls per file (quizGames has four separate engines).
  const files = { bibleGames: 1, worldGames: 1, visualGames: 1, quizGames: 4, reactionGames: 1, wordGames: 1, memoryGames: 1, numberGames: 1, puzzleGames: 1 };
  Object.keys(files).forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'js/games/' + f + '.js'), 'utf8');
    const n = (src.match(/Race\.describe\(|race\.describe\(/g) || []).length;
    assert(n >= files[f], f + ' describes its rounds (' + n + ' of ' + files[f] + ')');
  });
});
