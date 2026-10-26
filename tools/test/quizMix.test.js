'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

function bank() {
  return loadFF(['js/core.js', 'js/i18n.js', 'js/registry.js', 'js/gameLength.js', 'js/data/quiz.js', 'js/games/quizMix.js', 'js/data/quizbank.js']);
}

test('Quiz Mix has thousands of questions across its topics', function () {
  const FF = bank();
  const all = FF.QuizBank.all();
  assert(all.length > 4500, 'expected 4,500+ questions, got ' + all.length);
  const counts = FF.QuizBank.counts();
  ['general', 'science', 'geography', 'history', 'sport', 'music', 'africa'].forEach(function (id) {
    assert(counts[id] > 20, id + ' has questions');
  });
});

test('every question is well formed', function () {
  const FF = bank();
  FF.QuizBank.all().forEach(function (q) {
    const n = q.tf ? 2 : 4;
    assertEqual(q.options.length, n, 'options for: ' + q.q);
    assert(q.answer >= 0 && q.answer < n, 'answer in range: ' + q.q);
    assert(q.q.length > 5 && !/%[0-9A-F]{2}|&quot;|&#039;/.test(q.q), 'decoded text: ' + q.q);
    assert(['easy', 'normal', 'hard'].indexOf(q.difficulty) !== -1, 'difficulty: ' + q.q);
  });
});

test('topics and difficulty narrow the pool', function () {
  const FF = bank();
  const geo = FF.QuizBank.pool(['geography'], 'normal');
  assert(geo.length > 100 && geo.every(function (q) { return q.topic === 'geography'; }), 'geography only');
  const easy = FF.QuizBank.pool([], 'easy');
  assert(easy.every(function (q) { return q.difficulty !== 'hard'; }), 'easy leaves out hard questions');
});

test('the built-in questions still play without the big bank', function () {
  const FF = loadFF(['js/core.js', 'js/i18n.js', 'js/registry.js', 'js/gameLength.js', 'js/data/quiz.js', 'js/games/quizMix.js']);
  assert(FF.QuizBank.all().length > 600, 'built-in multiple choice + true or false');
});
