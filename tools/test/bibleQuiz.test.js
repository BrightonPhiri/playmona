'use strict';
/* Bible Quiz (js/games/bibleQuiz.js, js/data/bibleQuiz.js): the question
   bank is well formed, settings keep to what is offered, deals are fair
   and repeatable from a seed, and room points match the crew brain. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/bibleQuiz.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/bibleQuiz.js'), 'utf8'), FF.__sandbox, { filename: 'bibleQuiz.js' });
  return FF;
}

const FF = load();
const B = FF.BibleQuiz;
const DATA = FF.data.bibleQuiz;
const ITEMS = DATA.items;

test('bible quiz: the bank is big, varied and every question has a reference', function () {
  assert(ITEMS.length >= 300, 'about 300 questions or more (' + ITEMS.length + ')');
  const ids = new Set(ITEMS.map(function (q) { return q.id; }));
  assertEqual(ids.size, ITEMS.length, 'every id is unique');
  const topics = new Set(DATA.topics.map(function (t) { return t.id; }));
  const byType = {};
  const kidsByTopic = {};
  ITEMS.forEach(function (q) {
    assert(topics.has(q.topic), q.id + ' has a known topic');
    assert(B.TYPES.indexOf(q.type) !== -1, q.id + ' has a known type');
    assert(B.LEVELS.indexOf(q.level) !== -1, q.id + ' has a known level');
    assert(q.q && q.q.trim().length > 3, q.id + ' has a question');
    assert(/[A-Za-z]/.test(q.ref), q.id + ' names its Bible reference');
    assert(!/'/.test(q.q + q.options.join('') + q.note + q.ref), q.id + ' uses typographic apostrophes');
    byType[q.type] = (byType[q.type] || 0) + 1;
    if (q.level === 'kids') kidsByTopic[q.topic] = (kidsByTopic[q.topic] || 0) + 1;
    if (q.type === 'tf') {
      assertEqual(q.options.length, 2, q.id + ' is true or false');
      assert(q.answer === 0 || q.answer === 1, q.id + ' answer is True or False');
    } else if (q.type === 'order') {
      assert(q.options.length >= 3 && q.options.length <= 4, q.id + ' orders 3 or 4 events');
      assertEqual(new Set(q.options).size, q.options.length, q.id + ' events differ');
    } else {
      assertEqual(q.options.length, 4, q.id + ' has four choices');
      assertEqual(new Set(q.options).size, 4, q.id + ' choices differ');
      assertEqual(q.answer, 0, q.id + ' right answer is written first');
    }
    if (q.type === 'finish') {
      assert(q.q.indexOf('…') !== -1, q.id + ' shows where the verse stops');
      assert(q.verse && q.verse.indexOf('…') === -1, q.id + ' builds the whole verse');
    }
  });
  B.TYPES.forEach(function (k) { assert(byType[k] >= 15, 'plenty of ' + k + ' questions (' + byType[k] + ')'); });
  topics.forEach(function (id) {
    assert(ITEMS.filter(function (q) { return q.topic === id; }).length >= 25, id + ' has 25+ questions');
    assert(kidsByTopic[id] >= 3, id + ' has kids questions');
  });
});

test('bible quiz: settings keep to the offered values', function () {
  assertEqual(JSON.stringify(B.sanitize({})), JSON.stringify(B.STANDARD));
  assert(B.isStandard({}), 'nothing chosen is standard');
  const s = B.sanitize({ topics: ['women', 'nope', 'creation'], types: ['tf', 'x'], level: 'scholar' });
  assertEqual(s.topics, ['creation', 'women'], 'known topics, in their own order');
  assertEqual(s.types, ['tf']);
  assertEqual(s.level, 'scholar');
  assertEqual(B.sanitize({ level: 'master' }).level, 'family', 'an unknown level falls back');
  assertEqual(B.sanitize({ topics: DATA.topics.map(function (t) { return t.id; }) }).topics, [], 'every topic is the same as all');
  assertEqual(B.sanitize({ types: B.TYPES.slice() }).types, [], 'every type is the same as all');
  assert(!B.isStandard({ level: 'kids' }), 'a level change is not standard');
  assert(!B.isStandard({ topics: ['jesus'] }), 'a topic choice is not standard');
});

test('bible quiz: levels and filters pick the right questions', function () {
  const kids = B.pool(ITEMS, { level: 'kids' });
  assert(kids.length >= 12 && kids.every(function (q) { return q.level === 'kids'; }), 'kids plays kids questions');
  assert(B.pool(ITEMS, {}).every(function (q) { return q.level !== 'scholar'; }), 'family leaves out scholar');
  assert(B.pool(ITEMS, { level: 'scholar' }).every(function (q) { return q.level !== 'kids'; }), 'scholar leaves out kids');
  const tiny = B.pool(ITEMS, { level: 'kids', topics: ['letters'], types: ['said'] });
  assert(tiny.every(function (q) { return q.topic === 'letters' && q.type === 'said'; }), 'a tiny mix still keeps topic and type');
  const said = B.pool(ITEMS, { types: ['said'], topics: ['church'] });
  assert(said.length && said.every(function (q) { return q.type === 'said' && q.topic === 'church'; }), 'filters by type and topic');
});

test('bible quiz: a seed always deals the same questions in the same order', function () {
  const a = B.deal(ITEMS, B.STANDARD, B.rng(1234), 10);
  const b = B.deal(ITEMS, B.STANDARD, B.rng(1234), 10);
  const c = B.deal(ITEMS, B.STANDARD, B.rng(98765), 10);
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'same seed, same deal');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'another seed deals differently');
  assertEqual(a.length, 10);
  assertEqual(new Set(a.map(function (q) { return q.id; })).size, 10, 'no repeats in a game');
  assert(new Set(a.map(function (q) { return q.topic; })).size >= 8, 'topics take turns');
});

test('bible quiz: choices are shuffled and the answer follows them', function () {
  let moved = 0;
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    B.deal(ITEMS, B.STANDARD, B.rng(seed), 10).forEach(function (q) {
      const src = ITEMS.filter(function (x) { return x.id === q.id; })[0];
      if (q.type === 'tf') { assertEqual(q.answer, src.answer, 'true or false keeps its answer'); return; }
      if (q.type === 'order') {
        assert(!B.isRightOrder(q, q.options.map(function (o, i) { return i; })), 'events never start in order');
        const right = q.correct.map(function (c) { return q.options.indexOf(c); });
        assert(B.isRightOrder(q, right), 'tapping the true order is right');
        return;
      }
      checked++;
      assertEqual(q.options[q.answer], src.options[0], 'the answer index points at the right answer');
      if (q.answer !== 0) moved++;
    });
  }
  assert(checked > 100 && moved / checked > 0.6, 'the right answer is not always first (' + moved + '/' + checked + ')');
});

test('bible quiz: what this phone has seen is skipped while enough are fresh', function () {
  const all = B.pool(ITEMS, B.STANDARD);
  const seen = {};
  all.slice(0, all.length - 15).forEach(function (q) { seen[q.id] = true; });
  const dealt = B.deal(ITEMS, B.STANDARD, B.rng(7), 10, seen);
  assert(dealt.every(function (q) { return !seen[q.id]; }), 'only fresh questions');
  const almostAll = {};
  all.slice(0, all.length - 3).forEach(function (q) { almostAll[q.id] = true; });
  assertEqual(B.deal(ITEMS, B.STANDARD, B.rng(7), 10, almostAll).length, 10, 'too few fresh: play the whole pool');
});

test('bible quiz: points match the crew brain and double rounds are local', function () {
  [0, 1500, 7000, 19999, 25000].forEach(function (ms) {
    const crew = 100 + Math.max(0, Math.round((20 - ms / 1000) * 3));
    assertEqual(B.points(true, ms, false), crew, 'same as the crew brain at ' + ms + ' ms');
    assertEqual(B.points(true, ms, true), crew * 2, 'double round');
    assertEqual(B.points(false, ms, true), 0);
  });
  assertEqual([0, 1, 2, 3, 4, 9].map(function (r) { return B.isDouble(r, false); }), [false, false, false, false, true, true]);
  assert(!B.isDouble(4, true), 'no double rounds in a room');
  const brain = fs.readFileSync(path.join(ROOT, 'js/crew/brains/quiz.js'), 'utf8');
  assert(/bibleQuiz'\) answer\.value = correct \? 100 \+ Math\.max\(0, Math\.round\(\(20 - ms \/ 1000\) \* 3\)\) : 0/.test(brain), 'the crew brain still scores Bible Quiz this way');
});

test('bible quiz: registered once, with the daily and challenge on standard rules', function () {
  assertEqual(FF.__defs.length, 1);
  const def = FF.__defs[0];
  assertEqual(def.id, 'bibleQuiz');
  assertEqual(def.category, 'bible');
  const src = fs.readFileSync(path.join(ROOT, 'js/games/bibleQuiz.js'), 'utf8');
  assert(/api\.config\.daily \|\| api\.config\.challenge\) \{ play\(api, STANDARD, seed\)/.test(src), 'daily and challenge skip setup');
  assert(/config\.sharedDeal/.test(src), 'a shared deal ignores the seen list');
  const games = fs.readFileSync(path.join(ROOT, 'js/games/bibleGames.js'), 'utf8');
  assert(!/id: 'bibleQuiz'/.test(games), 'the old Bible Quiz is gone from bibleGames.js');
});
