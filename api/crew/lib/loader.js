'use strict';
/* Loads the game code the crew runner shares with the app (classic `window.FF` scripts)
   into one vm context: the seeded random, race rules, the word bank, the two games whose
   rules the brains reuse, and the brains. No DOM: these files only touch it lazily. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const FILES = [
  'js/core.js',
  'js/net/raceRules.js',
  'js/words.js',
  'js/data/lexicon.js',
  'js/games/reactionGames.js',
  'js/games/letterRush.js',
  'js/crew/levels.js',
  'js/crew/brains.js',
  'js/crew/brains/quiz.js',
  'js/crew/brains/reaction.js',
  'js/crew/brains/letterRush.js',
  'js/crew/controller.js',
  // Imposters: the referee the runner hosts, and how crew seats play it.
  'js/imposters/rules.js',
  'js/imposters/client.js',
  'js/imposters/modes/word.js',
  'js/imposters/modes/number.js',
  'js/imposters/referee.js',
  'js/crew/brains/imposters.js'
];

function stubElement() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { return c; }, removeChild(c) { return c; }, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
}

function load(root) {
  root = root || ROOT;
  const store = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Promise,
    navigator: { userAgent: 'playmona-crew-runner', maxTouchPoints: 0 },
    location: { protocol: 'https:', hostname: 'localhost', search: '', hash: '', pathname: '/' },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    document: {
      createElement: stubElement, body: stubElement(), head: stubElement(), documentElement: stubElement(),
      addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      getElementById() { return null; }, hidden: true
    },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const file of FILES) {
    if (file === 'js/games/reactionGames.js') {
      // Game files register themselves; the runner only needs their rules.
      vm.runInContext('FF.registerGame = function () {}; FF.Games = FF.Games || { register: function () {} };', sandbox);
    }
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const FF = sandbox.FF;
  if (!FF.Words.ready()) throw new Error('The word bank did not load.');
  return FF;
}

module.exports = { load, FILES };
