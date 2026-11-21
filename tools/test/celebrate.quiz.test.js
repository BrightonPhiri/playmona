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

test('quiz: the server offers the same settings', function () {
  const R = loadFF(RULES).QuizRules;
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/CelebrationGames.php'), 'utf8');
  assert(php.indexOf("QUIZ = ['kind' => ['" + R.KINDS.join("', '") + "'], 'seconds' => [" + R.SECONDS.join(', ') + ']]') !== -1, 'kinds and seconds');
  const d = R.DEFAULTS;
  assert(php.indexOf("QUIZ_DEFAULTS = ['kind' => '" + d.kind + "', 'seconds' => " + d.seconds + ", 'points' => " + d.points + ']') !== -1, 'standards');
  ['QUIZ_MAX_QUESTIONS = ' + R.MAX_QUESTIONS, 'QUIZ_MAX_TEXT = ' + R.MAX_TEXT, 'QUIZ_MAX_ANSWER = ' + R.MAX_ANSWER, 'QUIZ_MAX_WRONG = ' + R.MAX_WRONG,
    'QUIZ_POINTS_MIN = ' + R.POINTS_MIN, 'QUIZ_POINTS_MAX = ' + R.POINTS_MAX]
    .forEach((s) => assert(php.indexOf(s + ';') !== -1, s));
});

/* ---------- the referee ---------- */

const FILES = RULES.concat(['js/net/transport.js', 'js/celebrate/quiz/referee.js']);

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
}

function makeBus() {
  const store = {};
  const listeners = [];
  return {
    store,
    read: (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))),
    write: (k, v) => { if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); listeners.slice().forEach((fn) => fn(k)); },
    subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; }
  };
}

function makeClock(start) {
  const c = { now: start, jobs: [], n: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.n; c.jobs.push({ id, at: c.now + ms, fn }); return id; };
  c.clearTimeout = (id) => { c.jobs = c.jobs.filter((j) => j.id !== id); };
  c.advance = async (ms) => {
    const end = c.now + ms;
    for (;;) {
      await flush();
      c.jobs.sort((a, b) => a.at - b.at);
      const j = c.jobs[0];
      if (!j || j.at > end) break;
      c.now = j.at;
      c.jobs.shift();
      j.fn();
    }
    c.now = end;
    await flush();
  };
  return c;
}
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

const CID = 'cel_' + 'q'.repeat(24);
const QUESTIONS = [
  { id: 'a', text: 'What was her first job?', right: 'Waitress', wrong: ['Nurse', 'Teacher', 'Pilot'] },
  { id: 'b', text: 'Favourite colour?', right: 'Green', wrong: ['Blue'] },
  { id: 'c', text: 'First car?', right: 'Beetle', wrong: ['Mini', 'Golf'] }
];

async function game(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const Ref = app.CelebrateReferees.quiz;
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(5000000);
  const room = app.Transport.dev({ bus, root: 'celebrations/' + CID });
  await room.connect();
  room.serverNow = () => clock.now;
  const teams = opts.teams || {
    t_gold: { name: 'Gold', color: '#D4A017', members: [{ uid: 'g1', name: 'Ann' }, { uid: 'g2', name: 'Ben' }] },
    t_ruby: { name: 'Ruby', color: '#C0392B', members: [{ uid: 'r1', name: 'Cat' }] },
    t_jade: { name: 'Jade', color: '#1E8449', members: [] }
  };
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = {
    runId: 'r_1', cid: CID, gameId: 'g_1', template: 'quiz', name: 'Who Knows Vicky Best?', instructions: 'Pick together',
    startAt: clock.now + 10000, teams, celebrant: 'Vicky Banda',
    config: Object.assign({ kind: 'whoKnows', seconds: 20, points: 500, questions: QUESTIONS }, opts.config || {}),
    waitReady: !!opts.waitReady
  };
  const ref = Ref.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: opts.randomInt || seeded(42), timers: clock,
    report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const next = {};
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const g = {
    app, Ref, bus, clock, room, ref, saved, reports, run,
    tree: () => bus.read('celebrations/' + CID) || {},
    view: () => g.tree().run || null,
    staff: () => g.tree().staff || null,
    right: () => g.staff().right,
    wrongOne: () => (g.right() + 1) % g.view().question.choices.length,
    pickOf: (tid) => ((g.view().picks || {})[tid]) || null,
    said: (uid) => (g.view().said || {})[uid] || {},
    points: (tid) => ((g.view().totals || {})[tid] || {}).points || 0,
    async toPlay() { await clock.advance(10000); },
    async send(uid, cmd, over) {
      if (next[uid] == null) next[uid] = 0;
      const q = g.view() ? g.view().q : 0;
      const full = Object.assign({ runId: run.runId, n: next[uid], t: clock.now, q }, cmd, over || {});
      if (!over || over.n == null) next[uid]++;
      await room.set('inbox/' + uid + '/c' + tag + (++seq), full);
      await flush();
    },
    async pick(uid, choice, over) { await g.send(uid, { type: 'pick', choice }, over); },
    async sure(uid, over) { await g.send(uid, { type: 'sure' }, over); },
    async control(action) { await room.set('control', { runId: run.runId, id: 'k' + (++seq), action }); await flush(); }
  };
  return g;
}

test('quiz referee: the answer is hidden until the reveal', async function () {
  const g = await game();
  assertEqual(g.view().phase, 'starting');
  assertEqual(g.view().q, -1);
  await g.toPlay();
  const v = g.view();
  assertEqual(v.phase, 'question');
  assertEqual(v.q, 0);
  assertEqual(v.total, 3);
  assertEqual(v.question.text, 'What was her first job?');
  assert(!('right' in v) && !('got' in v), 'no answer in the run during the question');
  assertEqual(JSON.stringify(v).indexOf('"right"'), -1);
  assertEqual(typeof g.right(), 'number');
  assertEqual(v.question.choices[g.right()], 'Waitress');
  assertEqual(g.staff().q, 0);
  await g.clock.advance(20000);
  assertEqual(g.view().phase, 'reveal');
  assertEqual(g.view().right, g.right());
});

test('quiz referee: one shared pick, the last one counts', async function () {
  const g = await game();
  await g.toPlay();
  await g.pick('g1', g.right());
  assertEqual(JSON.stringify(g.pickOf('t_gold')), JSON.stringify({ choice: g.right(), by: 'Ann', sure: false }));
  await g.pick('g2', g.wrongOne());
  assertEqual(JSON.stringify(g.pickOf('t_gold')), JSON.stringify({ choice: g.wrongOne(), by: 'Ben', sure: false }), 'a teammate changes it');
  await g.pick('r1', g.right());
  assertEqual(g.pickOf('t_jade'), null);
  await g.clock.advance(20000);
  const v = g.view();
  assertEqual(v.phase, 'reveal');
  assertEqual(v.got.t_ruby, true);
  assertEqual(v.got.t_gold, false);
  assertEqual(g.points('t_ruby'), 500);
  assertEqual(g.points('t_gold'), 0);
});

test('quiz referee: sure locks the pick; late picks are refused', async function () {
  const g = await game();
  await g.toPlay();
  await g.sure('g1');
  assertEqual(g.said('g1').error, 'noPick');
  await g.pick('g1', g.right());
  await g.sure('g2');
  assertEqual(g.pickOf('t_gold').sure, true);
  await g.pick('g1', g.wrongOne());
  assertEqual(g.said('g1').error, 'locked');
  assertEqual(g.pickOf('t_gold').choice, g.right(), 'the pick is unchanged');
  await g.pick('r1', 0, { q: 1 });
  assertEqual(g.said('r1').error, 'late', 'a pick for another question');
  await g.clock.advance(20000);
  await g.pick('r1', 0);
  assertEqual(g.said('r1').error, 'late', 'a pick during the reveal');
  await g.clock.advance(6000);
  assertEqual(g.view().q, 1);
  await g.pick('r1', 3);
  assertEqual(g.said('r1').error, 'badChoice', 'question 2 has two choices');
});

test('quiz referee: everyone sure reveals early', async function () {
  const g = await game();
  await g.toPlay();
  await g.clock.advance(5000);
  await g.pick('g1', 0);
  await g.sure('g1');
  assertEqual(g.view().phase, 'question', 'Ruby is still thinking');
  await g.pick('r1', 1);
  await g.sure('r1');
  assertEqual(g.view().phase, 'reveal');
  assertEqual(g.view().revealUntil, g.clock.now + 6000);
});

test('quiz referee: an empty team does not hold up the early reveal', async function () {
  const g = await game();
  await g.toPlay();
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_gold' } });
  await flush();
  await g.pick('g1', 0);
  await g.sure('g1');
  assertEqual(g.view().phase, 'reveal', 'Ruby has nobody left');
});

test('quiz referee: no pick scores nothing', async function () {
  const g = await game();
  await g.toPlay();
  await g.clock.advance(20000);
  const v = g.view();
  assertEqual(v.got.t_gold, false);
  assertEqual(v.got.t_ruby, false);
  assertEqual(g.points('t_gold') + g.points('t_ruby'), 0);
});

test('quiz referee: a guest who joins or moves team mid-game picks for their new team', async function () {
  const g = await game();
  await g.toPlay();
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_gold' }, r1: { name: 'Cat', team: 't_ruby' }, j1: { name: 'Jo', team: 't_ruby' } });
  await flush();
  await g.pick('j1', 1);
  assertEqual(JSON.stringify(g.pickOf('t_ruby')), JSON.stringify({ choice: 1, by: 'Jo', sure: false }));
  await g.pick('g1', 2);
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_ruby' }, r1: { name: 'Cat', team: 't_ruby' }, j1: { name: 'Jo', team: 't_ruby' } });
  await flush();
  await g.pick('g2', 3);
  assertEqual(g.pickOf('t_ruby').by, 'Ben');
  assertEqual(g.pickOf('t_gold').choice, 2, 'the old team keeps its pick');
});

test('quiz referee: next, pause and resume', async function () {
  const g = await game();
  await g.toPlay();
  await g.control('next');
  assertEqual(g.view().phase, 'reveal', 'next shows the answer');
  await g.control('next');
  assertEqual(g.view().phase, 'question');
  assertEqual(g.view().q, 1, 'next goes on from the reveal');
  await g.clock.advance(5000);
  await g.control('pause');
  assertEqual(g.view().paused, true);
  await g.pick('g1', 0);
  assertEqual(g.said('g1').error, 'paused');
  await g.clock.advance(60000);
  assertEqual(g.view().phase, 'question', 'the clock stands still');
  assertEqual(g.view().leftMs, 15000);
  await g.control('resume');
  assertEqual(g.view().deadline - g.clock.now, 15000);
});

test('quiz referee: the game ends after the last question and reports once', async function () {
  const g = await game();
  await g.toPlay();
  for (let i = 0; i < 3; i++) {
    await g.pick('r1', g.right());
    await g.clock.advance(26000);
  }
  const v = g.view();
  assertEqual(v.phase, 'ended');
  assertEqual(g.reports.length, 1);
  const p = g.reports[0].p;
  assertEqual(p.template, 'quiz');
  assertEqual(p.why, 'done');
  assertEqual(p.rounds.length, 3);
  p.rounds.forEach((r) => Object.keys(r.teams).forEach((tid) => assertEqual(r.teams[tid].usedMs, 0)));
  assertEqual(p.ranked[0].teamId, 't_ruby');
  assertEqual(p.ranked[0].points, 1500);
  assertEqual(JSON.stringify(v.result.winners), JSON.stringify(['t_ruby']));
  assertEqual(g.staff(), null, 'the staff copy is cleared');
  await g.clock.advance(60000);
  assertEqual(g.reports.length, 1);
});

test('quiz referee: end stops with the points so far', async function () {
  const g = await game();
  await g.toPlay();
  await g.pick('g1', g.right());
  await g.clock.advance(26000);
  assertEqual(g.view().q, 1);
  await g.control('end');
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.reports[0].p.why, 'stopped');
  assertEqual(g.points('t_gold'), 500);
});

test('quiz referee: a restarted referee carries on with the same order', async function () {
  const bus = makeBus();
  const clock = makeClock(5000000);
  const saved = { value: null };
  const g = await game({ bus, clock, saved });
  await g.toPlay();
  await g.pick('g1', 2);
  await clock.advance(5000);
  const before = g.view();
  g.ref.stop();
  const g2 = await game({ bus, clock, saved, randomInt: seeded(999) });
  const v = g2.view();
  assertEqual(v.q, before.q);
  assertEqual(JSON.stringify(v.question), JSON.stringify(before.question));
  assertEqual(v.deadline, before.deadline);
  assertEqual(g2.pickOf('t_gold').choice, 2);
  assertEqual(JSON.stringify(v).indexOf('"right"'), -1, 'still hidden');
  assertEqual(v.n.g1, 1, 'old command numbers are still known');
});

test('quiz referee: a replayed command lands once', async function () {
  const g = await game();
  await g.toPlay();
  await g.pick('g1', 1);
  await g.pick('g1', 2, { n: 0 });
  assertEqual(g.pickOf('t_gold').choice, 1, 'an old number is a replay');
  assertEqual(g.view().n.g1, 1);
});

test('quiz: the runner loads it; the inbox rule takes q and choice', function () {
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(loader.indexOf("'js/celebrate/quiz/rules.js'") !== -1 && loader.indexOf("'js/celebrate/quiz/referee.js'") !== -1, 'loader');
  const panel = fs.readFileSync(path.join(ROOT, 'js/celebrate/livePanel.js'), 'utf8');
  assert(panel.indexOf("'js/celebrate/quiz/referee.js'") !== -1, 'the dev referee loads in the organiser tab');
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const inbox = rules.celebrations.$cid.inbox.$uid.$id;
  assert(inbox.q && /isNumber/.test(inbox.q['.validate']) && /<= 100/.test(inbox.q['.validate']), 'q');
  assert(inbox.choice && /isNumber/.test(inbox.choice['.validate']) && /<= 3/.test(inbox.choice['.validate']), 'choice');
});

test('ready: no countdown until every team with players presses ready; one press readies the team', async function () {
  const g = await game({ waitReady: true });
  assertEqual(g.view().waitReady, true);
  await g.clock.advance(60000);
  assertEqual(g.view().phase, 'starting', 'the clock waits for the teams');
  await g.room.set('ready/g1', 'r_1');
  await flush();
  assertEqual(g.view().ready.t_gold, true, "Ann's press readies Gold");
  assertEqual(g.view().waitReady, true, 'Ruby is not ready yet');
  await g.room.set('ready/zz', 'r_1');
  await g.room.set('ready/r1', 'r_old');
  await flush();
  assertEqual(!!(g.view().ready || {}).t_ruby, false, 'a stranger or an old run readies nobody');
  await g.room.set('ready/r1', 'r_1');
  await flush();
  assertEqual(g.view().waitReady, false, 'Jade has nobody, so every team is ready');
  assertEqual(g.view().startAt, g.clock.now + 10000, 'a 10 s countdown');
  await g.clock.advance(10000);
  assertEqual(g.view().phase, 'question');
});

test('ready: Start now begins the countdown while teams are getting ready', async function () {
  const g = await game({ waitReady: true });
  await g.control('next');
  assertEqual(g.view().waitReady, false);
  assertEqual(g.view().phase, 'starting', 'the countdown, not the first question');
  await g.clock.advance(10000);
  assertEqual(g.view().phase, 'question');
});
