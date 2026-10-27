'use strict';
/* Higher or Lower, Word Scramble, Who Am I? (Bible) and Verse Rush in a room:
   each game runs headless on two devices sharing a room seed, against a
   stand-in race layer, and both must deal exactly the same rounds. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

const BASE = ['js/core.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js', 'js/gameLength.js'];
const FILES = {
  higherOrLower: ['js/games/numberGames.js'],
  wordScramble: ['js/data/words.js', 'js/games/wordGames.js'],
  bibleWhoAmI: ['js/data/bible.js', 'js/games/bibleGames.js'],
  bibleVerseRush: ['js/data/bible.js', 'js/games/bibleGames.js']
};

/* One device in a room. `uid` plays; the room seed decides every deal. */
function device(gameId, uid, seed) {
  const FF = loadFF(BASE);
  const defs = {};
  FF.registerGame = function (def) { defs[def.id] = def; };
  FF.Games = { register: FF.registerGame };
  const sandbox = FF.__sandbox;
  FILES[gameId].forEach(function (rel) {
    require('vm').runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  });

  const log = { described: [], begun: [], submitted: [], opts: null };
  let settle = null;
  FF.Room = { current: function () { return { uid: uid, meta: { seed: seed } }; } };
  FF.Race = {
    active: function () { return true; },
    plan: function (fallback) { return fallback; },
    roundText: function (n, total) { return n + '/' + total; },
    msSinceOpen: function () { return 500; },
    submit: function (choice, correct, ms) { log.submitted.push({ choice: choice, correct: correct, ms: ms }); return Promise.resolve(); },
    forGame: function (api, opts) {
      log.opts = opts;
      return {
        beginRound: function (n) {
          log.begun.push(n);
          FF.Random.seed(FF.Random.roundSeed(seed, gameId, n));
          return Promise.resolve();
        },
        describe: function (screen, answer) { log.described.push({ screen: screen, answer: answer }); },
        gate: function (onOpen) { onOpen(); return function () {}; },
        submit: function (choice, correct, ms, extra) { log.submitted.push({ choice: choice, correct: correct, extra: extra || null }); return Promise.resolve(); },
        onSettle: function (cb) { settle = cb; return function () { settle = null; }; },
        // Between rounds the app draws other random things; unseeding here
        // makes any deal drawn before beginRound differ between devices.
        showResult: function (payload, o) { log.lastResult = o; FF.Random.unseed(); },
        isLastRound: function (n, total) { return n + 1 >= total; },
        over: function () { return false; },
        end: function () { log.ended = true; }
      };
    }
  };
  FF.Audio = { play: function () {} };
  FF.Nav = { focusFirst: function () {}, focus: function () {} };
  FF.Advance = { button: function (label, fn) { return FF.ui.button(label, { onClick: fn }); } };
  FF.GameFlow = { current: true };

  const root = FF.ui.div('root');
  let ended = null;
  const api = {
    def: defs[gameId],
    config: {
      players: [{ id: 'u1', name: 'Ann' }, { id: 'u2', name: 'Ben' }],
      scorers: [{ id: 'u1', name: 'Ann' }, { id: 'u2', name: 'Ben' }],
      mode: 'turn', difficulty: 'normal', timer: 0
    },
    shell: {
      root: root,
      setTimer: function () {}, hideTimer: function () {}, updateScores: function () {},
      setTitle: function () {}, toast: function () {}, setOnTick: function () {}
    },
    ui: FF.ui,
    util: FF.util,
    random: FF.Random,
    audio: FF.Audio,
    scoring: {
      add: function () {}, subtract: function () {}, markAnswer: function () {}, resetStreak: function () {},
      record: function () { return { streak: 0, bestStreak: 0 }; },
      ranked: function () { return []; },
      results: function () { return { results: [], winnerId: null }; }
    },
    end: function (res) { ended = res || {}; }
  };
  return {
    FF: FF, api: api, log: log,
    start: function () { defs[gameId].start(api); },
    // Settle the current round and go on to the next one.
    settleRound: function () {
      settle({ winnerId: null, reason: 'exhausted' });
      log.lastResult.onNext();
    },
    ended: function () { return ended; }
  };
}

async function playRounds(gameId, uid, seed, rounds) {
  const d = device(gameId, uid, seed);
  d.start();
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
    await Promise.resolve();
    if (i < rounds - 1) d.settleRound();
  }
  return d;
}

Object.keys(FILES).forEach(function (gameId) {
  test(gameId + ': every device in a room deals the same rounds', async function () {
    const a = await playRounds(gameId, 'u1', 'room42', 4);
    const b = await playRounds(gameId, 'u2', 'room42', 4);
    assertEqual(a.log.begun, [0, 1, 2, 3], 'each round begins before it is drawn');
    assertEqual(a.log.described.length, 4, 'every round is described for people watching');
    assertEqual(JSON.stringify(b.log.described), JSON.stringify(a.log.described), 'same screens on both devices');
    const c = await playRounds(gameId, 'u1', 'other7', 4);
    assert(JSON.stringify(c.log.described) !== JSON.stringify(a.log.described), 'another room deals differently');
  });
});

test('race modes: a typed or picked answer is first, a guess or a build is ranked', function () {
  assertEqual(device('wordScramble', 'u1', 's').log.opts, null, 'nothing joins the race before start');
  const modes = {};
  Object.keys(FILES).forEach(function (id) {
    const d = device(id, 'u1', 's');
    d.start();
    modes[id] = d.log.opts.mode || 'first';
  });
  assertEqual(modes, { higherOrLower: 'ranked', wordScramble: 'first', bibleWhoAmI: 'first', bibleVerseRush: 'ranked' });
});

test('higher or lower: a guess goes to the race and waits for the reveal', async function () {
  const d = await playRounds('higherOrLower', 'u1', 'room42', 1);
  const shown = d.log.described[0];
  // The DOM stub has no selectors: find the two buttons in its tree.
  const buttons = [];
  (function walk(n) { (n.children || []).forEach(function (c) { if (c && c.tagName === 'BUTTON') buttons.push(c); walk(c); }); })(d.api.shell.root);
  assertEqual(buttons.length, 2, 'higher and lower');
  buttons[0].dispatch('click');
  assertEqual(d.log.submitted.length, 1, 'one guess per round');
  assertEqual(d.log.submitted[0].choice, 'higher');
  assertEqual(d.log.submitted[0].correct, shown.answer === 0, 'judged against the shared card');
  assertEqual(d.log.submitted[0].ms, 500, 'timed from the shared open instant');
  buttons[1].dispatch('click');
  assertEqual(d.log.submitted.length, 1, 'a second tap changes nothing');
});

test('higher or lower: online points reward every right guess, fastest most', function () {
  const d = device('higherOrLower', 'u1', 's');
  d.start();
  const pts = d.log.opts.pointsFor;
  assertEqual([pts({}, 1), pts({}, 2), pts({}, 3), pts({}, 6)], [225, 188, 150, 150]);
});

test('verse rush: online points by finishing place', function () {
  const d = device('bibleVerseRush', 'u1', 's');
  d.start();
  const pts = d.log.opts.pointsFor;
  assertEqual([pts({}, 1), pts({}, 2), pts({}, 3)], [250, 200, 150]);
});

test('word scramble and who am I send what the answer was worth', function () {
  const ws = fs.readFileSync(path.join(ROOT, 'js/games/wordGames.js'), 'utf8');
  assert(/race\.submit\(correct \? word : null, correct, null, \{ value: correct \? /.test(ws), 'scramble sends its value (less a hint), and nothing for a skip');
  const bible = fs.readFileSync(path.join(ROOT, 'js/games/bibleGames.js'), 'utf8');
  assert(/race\.submit\(chosenName, isCorrect, null, \{ value: /.test(bible), 'who am I sends its clue value');
});

test('the four games are offered in online rooms', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  const list = /ONLINE_GAMES = \[([\s\S]*?)\];/.exec(src)[1];
  ['higherOrLower', 'wordScramble', 'bibleWhoAmI', 'bibleVerseRush'].forEach(function (id) {
    assert(list.indexOf("'" + id + "'") !== -1, id + ' is online');
  });
});
