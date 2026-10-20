/* PlayMora — headless load check.
   Loads every JS file in a Node vm with a minimal browser-like global,
   verifying: no load-time errors, all games register, data shapes valid.
   Run:  node tools/load-check.js
*/
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ORDER = [
  'js/install.js',
  'js/core.js',
  'js/ui-kit.js',
  'js/storage.js',
  'js/i18n.js',
  'js/theme.js',
  'js/audio.js',
  'js/timer.js',
  'js/confetti.js',
  'js/scoring.js',
  'js/data/avatars.js',
  'js/avatars.js',
  'js/players.js',
  'js/data/assetManifest.js',
  'js/assets.js',
  'js/flagrenderer.js',
  'js/icons.js',
  'js/icons-custom.js',
  'js/registry.js',
  'js/navigation.js',
  'js/gameUI.js',
  'js/auth.js',
  'js/sync.js',
  'js/authUI.js',
  'js/data/quiz.js',
  'js/data/words.js',
  'js/data/wordlist.js',
  'js/data/countries.js',
  'js/data/party.js',
  'js/data/visual.js',
  'js/data/visual2.js',
  'js/data/bible.js',
  'js/games/wordGames.js',
  'js/games/quizGames.js',
  'js/games/memoryGames.js',
  'js/games/reactionGames.js',
  'js/games/numberGames.js',
  'js/games/creativeGames.js',
  'js/games/partyGames.js',
  'js/games/visualGames.js',
  'js/games/puzzleGames.js',
  'js/games/worldGames.js',
  'js/games/bibleGames.js'
];

const sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  requestAnimationFrame: function () { return 0; },
  cancelAnimationFrame: function () {},
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
  localStorage: (function () {
    const m = {}; return {
      getItem: function (k) { return m[k] != null ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      key: function () { return null; }, get length() { return 0; }
    };
  })(),
  addEventListener: function () {},
  document: { readyState: 'complete', addEventListener: function () {}, createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, getContext: function () { return null; } }; } },
  AudioContext: undefined, webkitAudioContext: undefined
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let errors = 0, missing = 0, loaded = 0;
for (const rel of ORDER) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { missing++; console.log('MISSING  ' + rel); continue; }
  const code = fs.readFileSync(p, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: rel });
    loaded++;
    console.log('OK       ' + rel);
  } catch (e) {
    errors++;
    console.log('ERROR    ' + rel + '  ->  ' + e.message);
  }
}

// Verification
console.log('\n--- summary ---');
console.log('loaded ' + loaded + ', missing ' + missing + ', errors ' + errors);

try {
  if (sandbox.FF && sandbox.FF.Games) {
    const games = sandbox.FF.Games.all();
    console.log('games registered: ' + games.length);
    const ids = games.map(function (g) { return g.id; }).sort();
    console.log(ids.join(', '));
    const bad = games.filter(function (g) { return !g.id || !g.name || typeof g.start !== 'function' || !g.category || !g.icon; });
    if (bad.length) console.log('INCOMPLETE DEFS: ' + bad.map(function (g) { return g.id; }).join(', '));
    const dupes = ids.filter(function (v, i) { return ids.indexOf(v) !== i; });
    if (dupes.length) console.log('DUPLICATE IDS: ' + [...new Set(dupes)].join(', '));
    if (sandbox.FF.Icons && sandbox.FF.Icons.game) {
      const custom = sandbox.FF.Icons.custom || {};
      const missingIcons = games.filter(function (g) {
        const key = sandbox.FF.Icons.game[g.id];
        return !key || !(sandbox.FF.Icons.set[key] || custom[key]);
      }).map(function (g) { return g.id; });
      console.log('icons: set=' + Object.keys(sandbox.FF.Icons.set).length + ' nav=' + Object.keys(sandbox.FF.Icons.nav).length + ' category=' + Object.keys(sandbox.FF.Icons.category).length + ' game=' + Object.keys(sandbox.FF.Icons.game).length);
      if (missingIcons.length) console.log('MISSING ICONS: ' + missingIcons.join(', '));
    }
  }
  if (sandbox.FF && sandbox.FF.data) {
    console.log('data namespaces: ' + Object.keys(sandbox.FF.data).join(', '));
    const d = sandbox.FF.data;
    if (d.quiz) console.log('quiz: questions=' + (d.quiz.questions || []).length + ' trueFalse=' + (d.quiz.trueFalse || []).length + ' guessWho=' + (d.quiz.guessWho || []).length + ' pictureQuiz=' + (d.quiz.pictureQuiz || []).length);
    if (d.words) console.log('words: dictionary=' + (d.words.dictionary || []).length + ' scramble=' + (d.words.scramble || []).length + ' categories=' + (d.words.categories || []).length + ' missingLetters=' + (d.words.missingLetters || []).length + ' crosswords=' + (d.words.crosswords || []).length);
    if (d.countries) console.log('countries: ' + d.countries.length);
    if (d.visual) console.log('visual keys: ' + Object.keys(d.visual).map(function (k) { return k + '=' + (d.visual[k] || []).length; }).join(' '));
  }
} catch (e) {
  console.log('verify error: ' + e.message);
}
process.exitCode = (errors || missing) ? 1 : 0;
