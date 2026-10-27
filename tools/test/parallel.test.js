'use strict';
/* Parallel challenges in a room (js/net/parallel.js): everyone plays the
   same puzzle at once and keeps their own score. These check the shared
   helpers, each game's points, and that two phones given the same round
   seed build exactly the same puzzle. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

const GAMES = {
  memoryMatch: 'memoryGames.js',
  pictureMemory: 'memoryGames.js',
  rememberSequence: 'memoryGames.js',
  picturePuzzle: 'puzzleGames.js',
  spotDifference: 'puzzleGames.js',
  hiddenObject: 'puzzleGames.js',
  wordBuilder: 'wordGames.js',
  bibleBooks: 'bibleGames.js'
};

/* Private scoring functions, exposed for this test only. */
const EXPOSE = {
  'memoryGames.js': ['matchPoints', 'sequencePoints', 'rsLength', 'rsSeconds'],
  'puzzleGames.js': ['puzzlePoints', 'spotPoints', 'hiddenPoints'],
  'wordGames.js': ['longestWord'],
  'bibleGames.js': ['booksPoints']
};

/* One phone: the game files plus what their room rounds draw on. Online is
   switched on, and FF.Parallel.run hands back the game's round options. */
function phone() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/i18n.js', 'js/ui-kit.js', 'js/icons.js', 'js/gameUI.js',
    'js/net/parallel.js', 'js/data/memoryDecks.js', 'js/data/visual.js', 'js/data/visual2.js',
    'js/data/words.js', 'js/data/bible.js']);
  const sb = FF.__sandbox;
  sb.getComputedStyle = function () {
    return { paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', rowGap: '0' };
  };
  FF.Storage.init();
  FF.Players = { avatarEl: function () { return FF.ui.span('ava'); } };
  FF.Room = { current: function () { return { uid: 'u1', meta: { seed: 'abc123' } }; } };
  FF.defs = {};
  FF.registerGame = function (def) { FF.defs[def.id] = def; };
  FF.Parallel.active = function () { return true; };
  FF.Parallel.run = function (api, opts) { FF.lastRun = opts; };
  const seen = {};
  Object.keys(GAMES).forEach(function (id) {
    const file = GAMES[id];
    if (seen[file]) return;
    seen[file] = true;
    const names = EXPOSE[file];
    const src = fs.readFileSync(path.join(ROOT, 'js/games', file), 'utf8')
      .replace(/\}\)\(\);\s*$/, names.map(function (n) { return 'FF.__' + n + ' = ' + n + ';'; }).join('\n') + '\n})();');
    vm.runInContext(src, sb, { filename: file });
  });
  return FF;
}

function makeApi(FF, id, difficulty) {
  const root = FF.ui.div('game-root');
  FF.__sandbox.document.body.appendChild(root);
  const noop = function () {};
  const me = { id: 'u1', name: 'Ana' };
  return {
    def: { id: id },
    config: { difficulty: difficulty || 'normal', scorers: [me], players: [me], timer: 0, mode: 'solo' },
    shell: { root: root, updateScores: noop, hideTimer: noop, setTimer: noop, toast: noop, setTitle: noop, setOnTick: noop },
    ui: FF.ui,
    util: FF.util,
    random: FF.Random,
    audio: { play: noop },
    scoring: { add: noop, subtract: noop, markAnswer: noop, resetStreak: noop, record: noop, results: function () { return { results: [] }; } },
    assets: {
      illustration: function (svg, cls, name) { return FF.ui.div('pic', name); },
      svgUri: function (svg) { return 'svg:' + String(svg).length; }
    }
  };
}

/* What a player sees: tags, classes, text and where things sit. */
function snapshot(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent;
  const st = node.style || {};
  const where = [st.left, st.top, st.backgroundColor, st.backgroundPosition, st.background].filter(Boolean).join(',');
  const label = node.attributes ? (node.attributes['aria-label'] || '') : '';
  return '<' + node.tagName + ' ' + node.className + ' ' + where + ' ' + label + '>' + (node.textContent || '') +
    (node.children || []).map(snapshot).join('') + '</>';
}

/* Start a game online and play round n's setup from that round's seed. */
function deal(FF, id, n, difficulty) {
  const api = makeApi(FF, id, difficulty);
  FF.lastRun = null;
  FF.defs[id].start(api);
  const opts = FF.lastRun;
  assert(opts, id + ' runs as a parallel challenge online');
  FF.Random.seed(FF.Random.roundSeed('abc123', id, n));
  const ctx = {
    n: n, total: 3, me: { id: 'u1', name: 'Ana' }, live: FF.ui.div('pp-live'), roundText: 'Round ' + (n + 1) + ' of 3',
    elapsed: function () { return 1000; }, limitMs: 60000, done: function () {}
  };
  const handle = opts.play(n, ctx);
  FF.Random.unseed();
  return { opts: opts, handle: handle, shot: snapshot(api.shell.root) };
}

test('parallel: a speed bonus runs from all at the start to none at the limit', function () {
  const P = loadFF(['js/core.js', 'js/net/parallel.js']).Parallel;
  assertEqual(P.speedBonus(0, 60000, 150), 150);
  assertEqual(P.speedBonus(30000, 60000, 150), 75);
  assertEqual(P.speedBonus(90000, 60000, 150), 0, 'never negative');
  assertEqual(P.speedBonus(null, 60000, 150), 0, 'unfinished earns none');
  assertEqual(P.clock(83000), '1:23');
});

test('parallel: live progress lists finishers first, best score first', function () {
  const P = loadFF(['js/core.js', 'js/net/parallel.js']).Parallel;
  const players = [{ uid: 'a', name: 'Ana' }, { uid: 'b', name: 'Ben' }, { uid: 'c', name: 'Cy' }, { uid: 'd', name: 'Di' }];
  const rows = P.progress({ b: { value: 120, correct: true }, d: { value: 300, correct: true } }, players, 'c');
  assertEqual(rows.map(function (r) { return r.uid; }), ['d', 'b', 'c', 'a'], 'finished by score, then me, then the rest');
  assertEqual(rows.map(function (r) { return r.done; }), [true, true, false, false]);
  assertEqual(rows[0].value, 300);
  assertEqual(rows[2].value, null, 'no score while playing');
  assert(rows[2].me, 'marks this phone');
});

test('parallel: a game\'s stats never replace the race\'s own answer fields', function () {
  const P = loadFF(['js/core.js', 'js/net/parallel.js']).Parallel;
  const r = P.cleanResult({ value: 12.6, correct: 4, ms: 5, choice: 'x', moves: 7.2, solved: true, best: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz', bad: {} }, true);
  assertEqual(r, { value: 13, moves: 7, solved: true, best: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn', out: true });
  assertEqual(P.cleanResult({ value: -5 }, false), { value: 0 }, 'never below zero');
  assertEqual(P.cleanResult(null, true), { value: 0, out: true });
});

test('parallel: points reward accuracy and speed in every game', function () {
  const FF = phone();
  const m = FF.__matchPoints;
  const perfect = m({ matched: 10, pairs: 10, moves: 10 }, 0, 120000, 1);
  const sloppy = m({ matched: 10, pairs: 10, moves: 30 }, 0, 120000, 1);
  const slow = m({ matched: 10, pairs: 10, moves: 10 }, 110000, 120000, 1);
  assertEqual(perfect, 700, '10 pairs + 150 for no wasted flips + 150 for speed');
  assert(sloppy < perfect && slow < perfect, 'fewer flips and a faster finish score more');
  assertEqual(m({ matched: 4, pairs: 10, moves: 20 }, null, 120000, 1), 160, 'an unfinished board keeps its pairs');
  assertEqual(m({ matched: 4, pairs: 10, moves: 20 }, null, 120000, 2), 320, 'difficulty bonus');

  const s = FF.__sequencePoints;
  assert(s(6, 6, 2000, 1) > s(6, 6, 8000, 1), 'a quicker repeat scores more');
  assert(s(7, 7, 8000, 1) > s(6, 6, 8000, 1), 'a longer sequence scores more');
  assertEqual(s(6, 3, null, 1), 15, 'a slip keeps 5 a right colour');
  assertEqual(FF.__rsLength(4, 20), 12, 'sequences stop growing at 12');
  assert(FF.__rsSeconds(12) >= 12 * 0.6 + 12 * 1.5, 'enough time to watch and repeat');

  const pz = FF.__puzzlePoints;
  assert(pz({ solved: true, moves: 40, size: 3, placed: 8 }, 0, 150000, 1) > pz({ solved: true, moves: 200, size: 3, placed: 8 }, 0, 150000, 1), 'fewer moves');
  assertEqual(pz({ solved: false, moves: 50, size: 3, placed: 4 }, null, 150000, 1), 50, 'half the tiles in place');

  const sp = FF.__spotPoints;
  assertEqual(sp({ found: 2, total: 5, wrong: 0 }, null, 80000, 1), 200);
  assertEqual(sp({ found: 2, total: 5, wrong: 3 }, null, 80000, 1), 140, 'wrong taps cost 20');
  assertEqual(sp({ found: 0, total: 5, wrong: 9 }, null, 80000, 1), 0, 'never below zero');
  assert(sp({ found: 5, total: 5, wrong: 0 }, 10000, 80000, 1) > 500, 'finding them all fast adds a bonus');

  const h = FF.__hiddenPoints;
  assertEqual(h({ found: false, wrong: 0 }, null, 20000, 1), 0);
  assertEqual(h({ found: true, wrong: 0 }, 0, 20000, 1), 150);
  assertEqual(h({ found: true, wrong: 2 }, 0, 20000, 1), 130, 'wrong taps cost 10');

  const b = FF.__booksPoints;
  assertEqual(b({ points: 300, right: 3, total: 6 }, 0, 30000), 350, 'speed bonus scaled by right answers');
  assertEqual(b({ points: 300, right: 3, total: 6 }, null, 30000), 300, 'out of time: no speed bonus');
  assertEqual(FF.__longestWord(['cat', 'planet', 'tan']), 'planet');
});

test('parallel: two phones with the same round seed get the same puzzle', function () {
  Object.keys(GAMES).forEach(function (id) {
    ['easy', 'hard'].forEach(function (d) {
      const a = deal(phone(), id, 1, d);
      const b = deal(phone(), id, 1, d);
      assert(a.shot.length > 200, id + ' draws a puzzle');
      assert(a.shot === b.shot, id + ' (' + d + '): both phones see the same puzzle');
      assert(a.handle && typeof a.handle.stop === 'function', id + ' can be stopped when the clock runs out');
    });
  });
});

test('parallel: each round deals a new puzzle', function () {
  Object.keys(GAMES).forEach(function (id) {
    const FF = phone();
    assert(deal(FF, id, 0).shot !== deal(FF, id, 2).shot, id + ': rounds differ');
  });
});

test('parallel: a room deal of Memory Match ignores this phone\'s recent boards', function () {
  const A = phone();
  const B = phone();
  deal(B, 'memoryMatch', 2);   // B has seen a board before this one
  assert(deal(A, 'memoryMatch', 0).shot === deal(B, 'memoryMatch', 0).shot, 'same board');
});

test('parallel: stopping a round banks what was done so far', function () {
  Object.keys(GAMES).forEach(function (id) {
    const r = deal(phone(), id, 0).handle.stop();
    assert(r && typeof r.value === 'number' && r.value >= 0, id + ' returns a score');
  });
});

/* ---------- The whole round flow, two phones on one in-memory room ---------- */

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

function roomPhone(bus, name) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js',
    'js/net/transport.js', 'js/net/room.js', 'js/net/raceRules.js', 'js/net/race.js', 'js/net/raceUI.js', 'js/net/parallel.js']);
  FF.Storage.init();
  FF.Players = {
    AVATARS: ['fox'], COLORS: ['#8b5cf6'],
    get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; },
    avatarEl: function () { return FF.ui.span('ava'); }
  };
  FF.GameLength = { roundText: function (n, total) { return 'Round ' + n + ' of ' + total; } };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  // Each screen's "next" button: the test presses them, as the room's timer would.
  FF.nexts = [];
  FF.Advance = { button: function (label, fn) { FF.nexts.push(fn); return FF.ui.el('button', { class: 'ff-adv' }, label); } };
  return FF;
}

function roomApi(FF) {
  const root = FF.ui.div('game-root');
  root.insertBefore = function (c) { this.children.unshift(c); c.parentNode = this; return c; };
  FF.__sandbox.document.body.appendChild(root);
  let timer = null;
  FF.ended = 0;
  return {
    def: { id: 'memoryMatch' },
    config: {},
    shell: {
      root: root, updateScores: function () {}, toast: function () {},
      setTimer: function (s, fn) { clearTimeout(timer); timer = setTimeout(fn, s * 1000); },
      hideTimer: function () { clearTimeout(timer); }
    },
    audio: { play: function () {} },
    end: function () { FF.ended++; }
  };
}

function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 8000)) { if (fn()) return true; await tick(25); }
  return false;
}

test('parallel: a two-round room game banks every score, even when a phone runs out of time', async function () {
  const bus = makeBus();
  const A = roomPhone(bus, 'Ana');
  const B = roomPhone(bus, 'Ben');
  const room = await A.Room.create({ dev: true });
  await B.Room.join(room.code, {}, { dev: true });
  await A.Room.startGame('memoryMatch', { questions: 2 });
  await tick(20);

  // Ana finishes every round at once; Ben never finishes and runs out of time.
  function game(finishes, partial) {
    return {
      rounds: 5, seconds: 1,
      play: function (n, ctx) {
        return {
          start: function () { if (finishes) setTimeout(function () { ctx.done({ value: 10 + n, moves: 6 }); }, 50); },
          stop: function () { return { value: partial, moves: 2 }; }
        };
      },
      describe: function () { return { kind: 'card', text: 'Same board for everyone' }; },
      detail: function (a) { return a.moves + ' moves'; }
    };
  }
  A.Parallel.run(roomApi(A), game(true, 0));
  B.Parallel.run(roomApi(B), game(false, 3));
  assertEqual(A.Race.planned(), 2, 'the room settings decide the rounds');

  for (let n = 0; n < 2; n++) {
    assert(await until(function () { return A.nexts.length > n && B.nexts.length > n; }), 'round ' + (n + 1) + ' settles on both phones');
    const answers = A.Room.current().rounds[n].answers;
    const a = answers[A.Room.current().uid];
    const b = answers[B.Room.current().uid];
    assertEqual([a.value, a.moves, !!a.out], [10 + n, 6, false], 'Ana banks her score');
    assertEqual([b.value, b.moves, b.out], [3, 2, true], 'Ben banks what he had when time ran out');
    A.nexts[n]();
    B.nexts[n]();
  }
  // After round 2 comes the podium; its button ends the game.
  assert(await until(function () { return A.nexts.length === 3 && B.nexts.length === 3; }, 2000), 'both reach the podium');
  assertEqual(A.Race.scores()[A.Room.current().uid], 21);
  assertEqual(B.Race.scores()[B.Room.current().uid], 6);
  assertEqual(B.Race.running(), false, 'the race is over');
  A.nexts[2]();
  assertEqual(A.ended, 1, 'the shared results screen takes over');
  A.Room.leave();
  B.Room.leave();
});

test('parallel: the games are online, describe every round and load after the race UI', function () {
  const room = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  const list = room.slice(room.indexOf('var ONLINE_GAMES'), room.indexOf('];', room.indexOf('var ONLINE_GAMES')));
  Object.keys(GAMES).forEach(function (id) {
    assert(list.indexOf("'" + id + "'") !== -1, id + ' is in ONLINE_GAMES');
  });
  const helper = fs.readFileSync(path.join(ROOT, 'js/net/parallel.js'), 'utf8');
  assert(/mode: 'parallel'/.test(helper), 'uses the parallel race mode');
  assert(/FF\.Race\.describe\(opts\.describe\(n\)/.test(helper), 'people watching see each round');
  assert(/FF\.Room\.on\('rounds'/.test(helper), 'shows progress as players finish');
  assert(!/<style|\.style\.(color|background)/.test(helper), 'looks live in css/games.css');
  Object.keys(GAMES).forEach(function (id) {
    const FF = phone();
    assert(typeof deal(FF, id, 0).opts.describe === 'function', id + ' describes its rounds');
  });
  const html = fs.readFileSync(path.join(ROOT, 'play.html'), 'utf8');
  const ui = html.indexOf('js/net/raceUI.js');
  const par = html.indexOf('js/net/parallel.js');
  assert(ui !== -1 && par > ui && par < html.indexOf('js/games/'), 'parallel.js loads after raceUI.js and before the games');
});
