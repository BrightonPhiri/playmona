'use strict';
/* Shared deals: the daily challenge, rooms and friend challenges must deal the same
   content on every phone from the seed alone, whatever that phone played before.

   Audit (2026-11-03) of every game in api/lib/Leaderboards.php GAMES:
   - memoryMatch: the surprise deck read the last deck from storage and used Math.random,
     and recent cards were dealt last. Fixed: a shared deal picks the deck from the seed.
   - familyQuiz (Quiz Mix): a seen-questions list and the saved topics changed the pool.
     Fixed: a shared deal plays Everything and leaves the seen list alone.
   - quickTap: stores a personal best only (shown, not dealt). Fine.
   - Every other game deals only through FF.Random / FF.util with no saved history.
   - letterRush, quickTap/colorReaction, wordGames, worldGames shuffle the player order when
     the randomOrder setting is on; GameFlow turns it off for shared solo runs. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function loadMemory() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/i18n.js', 'js/data/memoryDecks.js']);
  FF.registerGame = function () {};
  const src = fs.readFileSync(path.join(ROOT, 'js/games/memoryGames.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'FF.__boardDeck = mmBoardDeck;\nFF.__deal = mmDeal;\n})();');
  vm.runInContext(src, FF.__sandbox, { filename: 'memoryGames.js' });
  FF.Storage.init();
  return FF;
}

function memoryBoard(FF, shared) {
  FF.Random.seed('ch|k3y9x2p1|memoryMatch|init');
  const deck = FF.__boardDeck(shared);
  const cards = FF.__deal(deck, 10, shared).map(function (c) { return c.id; });
  FF.Random.unseed();
  return { deck: deck, cards: cards };
}

test('shared deal: Memory Match deals the same board whatever this phone played before', function () {
  const played = loadMemory();
  played.Storage.set('memoryMatch:deck', 'animals');
  played.__boardDeck(false);
  played.__deal('', 10, false);
  played.__deal('', 10, false);
  const fresh = loadMemory();
  assertEqual(JSON.stringify(memoryBoard(played, true)), JSON.stringify(memoryBoard(fresh, true)));
});

test('shared deal: Memory Match does not save the board deck', function () {
  const FF = loadMemory();
  FF.Storage.set('memoryMatch:deck', 'animals');
  memoryBoard(FF, true);
  assertEqual(FF.Storage.get('memoryMatch:deck', null), 'animals');
});

function loadQuiz() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/i18n.js', 'js/registry.js', 'js/gameLength.js', 'js/data/quiz.js']);
  const src = fs.readFileSync(path.join(ROOT, 'js/games/quizMix.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'FF.__qmDealer = qmDealer;\n})();');
  vm.runInContext(src, FF.__sandbox, { filename: 'quizMix.js' });
  FF.Storage.init();
  return FF;
}

function firstTen(FF, shared) {
  FF.Random.seed('ch|k3y9x2p1|familyQuiz|init');
  const basePool = FF.QuizBank.pool([], 'normal');
  const deal = FF.__qmDealer(basePool, 10, { shared: shared, random: FF.Random });
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(deal().id);
  FF.Random.unseed();
  return ids;
}

test('shared deal: Quiz Mix deals the same 10 questions whatever this phone has seen', function () {
  const seenA = loadQuiz();
  const pool = seenA.QuizBank.pool([], 'normal');
  seenA.Storage.set('quizSeen', pool.slice(0, Math.floor(pool.length / 2)).map(function (q) { return q.id; }));
  const fresh = loadQuiz();
  assertEqual(JSON.stringify(firstTen(seenA, true)), JSON.stringify(firstTen(fresh, true)));
});

test('shared deal: Quiz Mix leaves the seen list alone', function () {
  const FF = loadQuiz();
  FF.Storage.set('quizSeen', ['x1']);
  firstTen(FF, true);
  assertEqual(JSON.stringify(FF.Storage.get('quizSeen', [])), JSON.stringify(['x1']));
});

test('shared deal: GameFlow marks daily runs as shared and turns off random order', function () {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js', 'js/registry.js']);
  FF.Storage.init();
  FF.registerGame({ id: 'solo1', name: 'Solo', category: 'quiz', modes: ['solo', 'turn'], players: [1, 8], start: function () {} });
  const def = FF.Games.get('solo1');
  FF.Settings.set && FF.Settings.set('randomOrder', true);
  const daily = FF.GameFlow.buildConfig(def, { daily: '2026-11-03' });
  assertEqual([daily.sharedDeal, daily.randomOrder], [true, false]);
  const plain = FF.GameFlow.buildConfig(def, {});
  assertEqual(plain.sharedDeal, false);
});
