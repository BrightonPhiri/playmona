'use strict';
/* Quiz (Celebrations): the shared rules (js/celebrate/quiz/rules.js), the ready-made ideas
   (js/celebrate/quiz/questions.js) and whole quizzes refereed by js/celebrate/quiz/referee.js over the
   dev transport with a hand-moved clock: one shared pick per team, We're sure, the right answer hidden
   until the reveal, flat points, pause / next / end, people moving team, and a restarted referee. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/celebrate/quiz/rules.js', 'js/celebrate/quiz/questions.js'];

/* ---------- rules ---------- */

test('quiz rules: settings keep to the offered values', function () {
  const R = loadFF(RULES).QuizRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify({ kind: 'whoKnows', seconds: 20, points: 500, questions: [] }));
  const s = R.sanitize({ kind: 'x', seconds: 7, points: 99999, questions: [
    { id: 'a1', text: '  What was\u0000 her first job? ', right: ' Waitress ', wrong: ['Nurse', '', 'Teacher', 'Pilot', 'Chef'] },
    { id: 'bad id!', text: 'x'.repeat(200), right: 'y'.repeat(90), wrong: [] }
  ] });
  assertEqual(s.kind, 'whoKnows');
  assertEqual(s.seconds, 20);
  assertEqual(s.points, 5000);
  assertEqual(s.questions[0].id, 'a1');
  assertEqual(s.questions[0].text, 'What was her first job?');
  assertEqual(s.questions[0].right, 'Waitress');
  assertEqual(JSON.stringify(s.questions[0].wrong), JSON.stringify(['Nurse', 'Teacher', 'Pilot']));
  assertEqual(s.questions[1].id, 'q1');
  assertEqual(s.questions[1].text.length, 140);
  assertEqual(s.questions[1].right.length, 60);
  assertEqual(R.sanitize({ points: '450', seconds: '15' }).points, 500, 'nearest 100, numbers arrive as strings');
  assertEqual(R.sanitize({ seconds: '15' }).seconds, 15);
  assertEqual(R.sanitize({ points: 10 }).points, 100);
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ text: 'Q' + i, right: 'a', wrong: ['b'] });
  assertEqual(R.sanitize({ questions: many }).questions.length, 30);
});

test('quiz rules: a question needs text, a right answer, a wrong one and no repeats', function () {
  const R = loadFF(RULES).QuizRules;
  assertEqual(R.problem({ text: '', right: 'a', wrong: ['b'] }), 'noText');
  assertEqual(R.problem({ text: 'Q', right: '', wrong: ['b'] }), 'noRight');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: [] }), 'noWrong');
  assertEqual(R.problem({ text: 'Q', right: 'Paris', wrong: [' paris '] }), 'same');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: ['b', 'B'] }), 'same');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: ['b'] }), '');
  const c = R.sanitize({ questions: [{ text: 'Q1', right: 'a', wrong: ['b'] }, { text: '', right: 'a', wrong: ['b'] }, { text: 'Q3', right: 'a', wrong: ['b', 'c'] }] });
  assertEqual(R.playable(c).map((q) => q.text).join(','), 'Q1,Q3');
});

test('quiz rules: deal shuffles the choices and knows where the right one went', function () {
  const R = loadFF(RULES).QuizRules;
  const q = { text: 'Q', right: 'Right', wrong: ['W1', 'W2', 'W3'] };
  const seen = {};
  for (let s = 1; s < 40; s++) {
    let x = s;
    const rnd = (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
    const d = R.deal(q, rnd);
    assertEqual(d.choices.length, 4);
    assertEqual(d.choices[d.right], 'Right');
    assertEqual(d.choices.slice().sort().join(','), 'Right,W1,W2,W3');
    seen[d.right] = true;
  }
  assert(seen[0] && seen[1] && seen[2] && seen[3], 'the right answer can land anywhere');
  assertEqual(R.deal({ text: 'Q', right: 'Yes', wrong: ['No'] }, () => 0).choices.length, 2, 'true or false works');
});

test('quiz rules: ranking shares places on equal points', function () {
  const R = loadFF(RULES).QuizRules;
  const rows = R.ranked({ t_a: { points: 500 }, t_b: { points: 1000 }, t_c: { points: 500 } }, ['t_a', 't_b', 't_c']);
  assertEqual(rows.map((r) => r.teamId + ':' + r.place).join(','), 't_b:1,t_a:2,t_c:2');
  rows.forEach((r) => assertEqual(r.usedMs, 0));
});

test('quiz ideas: about 30 questions about a person, with the name filled in', function () {
  const Q = loadFF(RULES).QuizQuestions;
  const ideas = Q.forKind('whoKnows', 'Vicky Banda');
  assert(ideas.length >= 25 && ideas.length <= 35, 'about 30, got ' + ideas.length);
  ideas.forEach((i) => {
    assert(/^[a-zA-Z0-9]+$/.test(i.key), 'key ' + i.key);
    assert(i.text.indexOf('{name}') === -1 && i.text.length <= 140, i.text);
  });
  assert(ideas.some((i) => i.text.indexOf('Vicky') !== -1) && !ideas.some((i) => i.text.indexOf('Banda') !== -1), 'the first name only');
  assertEqual(new Set(ideas.map((i) => i.key)).size, ideas.length, 'keys are unique');
  assertEqual(Q.forKind('nope', 'Vicky').length, 0);
});
