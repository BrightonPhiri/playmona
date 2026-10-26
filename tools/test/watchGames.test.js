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
  const files = { bibleGames: 1, worldGames: 1, visualGames: 1, quizGames: 3, quizMix: 1, reactionGames: 1, letterRush: 1, memoryGames: 1, numberGames: 1, puzzleGames: 1 };
  Object.keys(files).forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'js/games/' + f + '.js'), 'utf8');
    const n = (src.match(/Race\.describe\(|race\.describe\(/g) || []).length;
    assert(n >= files[f], f + ' describes its rounds (' + n + ' of ' + files[f] + ')');
  });
});

test('the "show my photo to people watching" setting follows the account', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8');
  const keys = /SYNC_KEYS = \[([\s\S]*?)\]/.exec(src)[1];
  assert(keys.indexOf("'hidePhotoPublic'") !== -1, 'synced with the account');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert(/hidePhotoPublic/.test(app) && /setHidePhoto/.test(app), 'Edit profile saves it and tells the room');
});

test('every flag question also sends its flag to people watching', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/worldGames.js'), 'utf8');
  const flags = (src.match(/flagNode: (\(type === 'flag'\) \? )?renderFlagNode\(/g) || []).length;
  const sent = (src.match(/flagImage: /g) || []).length;
  assert(flags > 0 && sent === flags, flags + ' flag questions, ' + sent + ' send the flag');
});

test('games that call race.describe get it from a helper that has it', function () {
  const dir = path.join(ROOT, 'js/games');
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/[^.]race\.describe\(|state\.race\.describe\(/.test(src)) return;
    const usesForGame = /FF\.Race\.forGame\(/.test(src);
    const helper = /function raceFor\(/.test(src);
    if (helper) assert(/describe: function \(screen, answer\) \{ (return )?FF\.Race\.describe\(/.test(src), f + ': its own race helper passes describe through');
    else assert(usesForGame, f + ': race comes from FF.Race.forGame, which has describe');
  });
  const race = fs.readFileSync(path.join(ROOT, 'js/net/race.js'), 'utf8');
  assert(/describe: function \(screen, answer\) \{ return self\.describe\(screen, answer\); \}/.test(race), 'forGame passes describe through');
});

test("What's Missing never shows viewers the whole set (it would give the answer away)", function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/memoryGames.js'), 'utf8');
  const call = /race\.describe\(([^;]*)\);/.exec(src);
  assert(call, 'describes its rounds');
  assert(!/\bshown\b|\.join\(|\{set\}/.test(call[1]), 'the description does not include the emoji');
});
