'use strict';
/* Number Challenge crew players (js/crew/brains/numberChallenge.js): they work each sum out the way
   a person would (R.solveText for sums and Sprint, a running total of the chain steps they saw,
   R.solveTarget for Make the target), miss on purpose by their accuracy, answer inside the clock,
   and send through ncInbox like a phone. Plus the wiring that names the game online: the inbox
   rule, the online and crew game lists, the runner and the crew controller. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/numberchallenge/rules.js', 'js/crew/levels.js', 'js/crew/brains/numberChallenge.js'];
let cached = null;
const app = () => cached || (cached = loadFF(FILES));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
/* An item as the phones see it in rooms/<code>/nc (see roundView in js/numberchallenge/referee.js). */
function asSeen(it, mode) {
  if (mode === 'target') return { k: it.k, tiles: it.tiles.join(','), ops: it.ops.join(''), target: it.target, seconds: 60 };
  const choices = it.choices ? it.choices.join('|') : null;
  if (mode === 'chain') {
    let v = it.start;
    it.steps.forEach((st) => { v = app().NumberChallengeRules.applyStep(v, st); });
    return { k: it.k, start: it.start, steps: it.steps.length, shown: it.steps.length, choices, seconds: 10, total: v };
  }
  return { k: it.k, text: it.text, tier: it.tier, choices, seconds: 20 };
}
function items(FF, mode, level, n) {
  const R = FF.NumberChallengeRules;
  const out = [];
  for (let s = 0; out.length < n; s++) R.deal({ mode, level, rounds: R.ROUNDS[mode] ? R.ROUNDS[mode][0] : 1 }, 'b' + s, 0).items.forEach((it) => { if (out.length < n) out.push(it); });
  return out;
}
const SETTINGS = (mode, level) => ({ mode, level, time: 'normal', rounds: mode === 'sprint' ? 1 : ({ quick: 10, chain: 5, target: 3 })[mode], sprint: 60, speed: 'steady' });

test('nc crew: accuracy 1 is always right in every mode', function () {
  const FF = app();
  const R = FF.NumberChallengeRules;
  const S = FF.CrewNumberChallenge.strategy;
  const rand = seeded(3);
  ['easy', 'normal', 'hard', 'expert'].forEach((level) => {
    ['quick', 'sprint', 'chain', 'target'].forEach((mode) => {
      items(FF, mode, level, mode === 'target' ? 4 : 12).forEach((it) => {
        const seen = Object.assign(asSeen(it, mode), { level });   // create() adds the room's level
        const text = S.answer(seen, mode, 1, rand);
        const verdict = R.judge(SETTINGS(mode, level), it, text, 2000);
        assert(verdict.ok, mode + ' ' + level + ' ' + (it.text || it.target) + ' got ' + text);
        if (seen.choices) assert(seen.choices.split('|').indexOf(text) !== -1, 'a choice on screen: ' + text);
        if (mode === 'target' && level === 'expert') assert(verdict.usedAll, 'Expert uses every tile when it can: ' + text);
      });
    });
  });
});

test('nc crew: accuracy 0 is never right', function () {
  const FF = app();
  const R = FF.NumberChallengeRules;
  const S = FF.CrewNumberChallenge.strategy;
  const rand = seeded(4);
  ['normal', 'expert'].forEach((level) => {
    ['quick', 'sprint', 'chain', 'target'].forEach((mode) => {
      items(FF, mode, level, mode === 'target' ? 4 : 12).forEach((it) => {
        const seen = asSeen(it, mode);
        const text = S.answer(seen, mode, 0, rand);
        assert(typeof text === 'string' && text, mode + ' ' + level + ' sends something');
        assert(!R.judge(SETTINGS(mode, level), it, text, 2000).ok, mode + ' ' + level + ' ' + (it.text || it.target) + ' got ' + text);
        if (seen.choices) assert(seen.choices.split('|').indexOf(text) !== -1, 'a wrong choice on screen: ' + text);
        else if (mode !== 'target') assert(/^\d+$/.test(text), 'a number on the pad: ' + text);
        if (mode === 'target') assert(R.targetResult(it, text).ok, 'a real attempt from the tiles: ' + text);
      });
    });
  });
  // A chain whose steps it lost track of: a guess, never null.
  const lost = Object.assign(asSeen(items(FF, 'chain', 'normal', 1)[0], 'chain'), { total: null });
  assert(lost.choices.split('|').indexOf(S.answer(lost, 'chain', 1, rand)) !== -1, 'lost the chain: picks a choice');
});

test('nc crew: delays fit the clock; sprint pace follows reaction', function () {
  const FF = app();
  const S = FF.CrewNumberChallenge.strategy;
  const rand = seeded(5);
  const ctx = (reaction) => ({ level: 'medium', skill: { skill: 50 }, persona: { reaction } });
  let fast = 0, slow = 0, quick = 0, target = 0;
  for (let i = 0; i < 200; i++) {
    const q = S.delayMs({ seconds: 10, choices: '1|2|3|4' }, 'quick', ctx(50), rand);
    const pad = S.delayMs({ seconds: 20, choices: null }, 'quick', ctx(50), rand);
    const c = S.delayMs({ seconds: 10, choices: '1|2|3|4' }, 'chain', ctx(50), rand);
    const t = S.delayMs({ seconds: 45 }, 'target', ctx(50), rand);
    assert(q >= 700 && q <= 10000 - 1500, 'quick delay ' + q);
    assert(pad >= 700 && pad <= 20000 - 1500, 'pad delay ' + pad);
    assert(c >= 700 && c <= 10000 - 1500, 'chain delay ' + c);
    assert(t >= 700 && t <= 45000 - 1500, 'target delay ' + t);
    quick += q; target += t;
    const sf = S.delayMs({ tier: 2, choices: '1|2|3|4' }, 'sprint', ctx(90), rand);
    const ss = S.delayMs({ tier: 2, choices: '1|2|3|4' }, 'sprint', ctx(10), rand);
    assert(sf >= 500 && ss >= 500, 'sprint pace ' + sf + ' ' + ss);
    fast += sf; slow += ss;
  }
  assert(fast < slow, 'quick reactions sprint faster: ' + fast + ' < ' + slow);
  assert(quick < target, 'a target takes longer than a sum');
  const p = S.accuracy({ level: 'hard', skill: { skill: 90 }, persona: { accuracy: 90 } }, 'normal');
  const q = S.accuracy({ level: 'easy', skill: { skill: 10 }, persona: { accuracy: 10 } }, 'expert');
  assert(p > q && p <= 0.97 && q >= 0.04, 'accuracy by level and skill: ' + p + ' ' + q);
});

function fakeRoom(now) {
  const writes = [];
  const jobs = [];
  let watcher = null;
  const T = {
    serverNow: () => now.t,
    watch: (p, fn) => { assertEqual(p, 'nc'); watcher = fn; return () => { watcher = null; }; },
    set: (p, v) => { writes.push({ p, v }); return Promise.resolve(); }
  };
  return { T, writes, jobs, push: (v) => watcher && watcher(JSON.parse(JSON.stringify(v))), later: (fn, ms) => jobs.push({ fn, ms }) };
}

test('nc crew: seats answer an open round through ncInbox once each', async function () {
  const FF = app();
  const R = FF.NumberChallengeRules;
  const it = items(FF, 'quick', 'normal', 1)[0];
  const now = { t: 1000 };
  const room = fakeRoom(now);
  const seats = FF.CrewNumberChallenge.create({ transport: room.T, uids: ['crew1', 'crew2'], crew: {}, later: room.later, random: seeded(9) });
  seats.start();
  const view = { matchId: 'n_1', phase: 'open', k: 0, closeAt: 30000, settings: SETTINGS('quick', 'normal'),
    round: asSeen(it, 'quick'), p: { crew1: { inK: -1 }, crew2: { inK: 0 }, human: { inK: -1 } } };
  room.push(view);
  room.push(view);
  assertEqual(room.jobs.length, 1, 'only crew1: crew2 has answered, the human is not crew, no repeats');
  room.jobs[0].fn();
  await Promise.resolve();
  assertEqual(room.writes.length, 1);
  assert(/^ncInbox\/crew1\/c[0-9a-f]{22}$/.test(room.writes[0].p), room.writes[0].p);
  const cmd = room.writes[0].v;
  assertEqual(Object.keys(cmd).sort().join(), 'k,matchId,t,text');
  assertEqual([cmd.matchId, cmd.k], ['n_1', 0]);
  assert(/^\d+$/.test(cmd.text) && it.choices.indexOf(Number(cmd.text)) !== -1, 'one of the choices: ' + cmd.text);
  // The round closed before the job ran: nothing is sent.
  room.push(Object.assign({}, view, { k: 1, round: Object.assign(asSeen(it, 'quick'), { k: 1 }), p: { crew1: { inK: -1 }, crew2: { inK: -1 } } }));
  room.push(Object.assign({}, view, { k: 1, phase: 'reveal' }));
  room.jobs.slice(1).forEach((j) => j.fn());
  await Promise.resolve();
  assertEqual(room.writes.length, 1, 'too late: not sent');
  seats.stop();
});

test('nc crew: a chain is added up from the steps as they appear', async function () {
  const FF = app();
  const R = FF.NumberChallengeRules;
  const it = items(FF, 'chain', 'normal', 1)[0];
  const now = { t: 1000 };
  const room = fakeRoom(now);
  const sheet = { crew1: { skills: { numberChallenge: { skill: 100, level: 'hard' } }, persona: { accuracy: 100 } } };
  const seats = FF.CrewNumberChallenge.create({ transport: room.T, uids: ['crew1'], crew: sheet, later: room.later, random: () => 0 });
  seats.start();
  const base = { matchId: 'n_2', k: 0, closeAt: 60000, settings: SETTINGS('chain', 'normal'), p: { crew1: { inK: -1 } } };
  for (let shown = 0; shown <= it.steps.length; shown++) {
    const st = shown ? it.steps[shown - 1] : null;
    room.push(Object.assign({}, base, { phase: 'steps', round: { k: 0, start: it.start, steps: it.steps.length, shown, step: st ? { op: st.op, n: st.n == null ? null : st.n } : null, choices: null, seconds: 10 } }));
  }
  assertEqual(room.jobs.length, 0, 'no answer while the steps are showing');
  room.push(Object.assign({}, base, { phase: 'open', round: Object.assign(asSeen(it, 'chain'), { total: undefined }) }));
  assertEqual(room.jobs.length, 1);
  room.jobs[0].fn();
  await Promise.resolve();
  assertEqual(room.writes.length, 1);
  assertEqual(Number(room.writes[0].v.text), it.answer, 'the running total of the steps it saw');
  seats.stop();
});

test('nc crew: a Sprint runs down the list in order until its clock ends', async function () {
  const FF = app();
  const R = FF.NumberChallengeRules;
  const list = R.deal(SETTINGS('sprint', 'normal'), 'sp', 0).items;
  const now = { t: 1000 };
  const room = fakeRoom(now);
  const seats = FF.CrewNumberChallenge.create({ transport: room.T, uids: ['crew1'], crew: {}, later: room.later, random: seeded(11) });
  seats.start();
  const view = { matchId: 'n_3', phase: 'open', k: 0, closeAt: 70000, settings: SETTINGS('sprint', 'normal'),
    round: { k: 0, seconds: 60, list: list.map((it) => ({ text: it.text, tier: it.tier, choices: it.choices.join('|') })) },
    p: { crew1: { inK: -1, at: 0, end: 61000, done: false } } };
  room.push(view);
  room.push(view);
  let guard = 0;
  while (room.jobs.length && guard++ < 400) {
    const j = room.jobs.shift();
    now.t += j.ms;
    j.fn();
  }
  await Promise.resolve();
  assert(room.writes.length > 5, 'many answers: ' + room.writes.length);
  room.writes.forEach((w, i) => {
    const m = /^(\d+):(\d+)$/.exec(w.v.text);
    assert(m && Number(m[1]) === i, 'in order: ' + w.v.text);
  });
  assert(room.writes.every((w) => w.v.t <= 61000), 'nothing after its clock ends');
  const ids = room.writes.map((w) => w.p);
  assertEqual(ids.slice().sort().join(), ids.join(), 'ids sort in send order');
  seats.stop();
});

test('numberChallenge: the inbox rule, the lists that name online and crew games, the runner and the controller know the game', function () {
  const room = JSON.parse(read('database.rules.json')).rules.rooms.$code;
  assertEqual(room.nc, undefined, 'rooms/$code/nc is server-only');
  const inbox = room.ncInbox.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('nc'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assert(/bans/.test(inbox['.write']), 'not banned');
  assert(/hasChildren\(\['matchId', 'k', 'text', 't'\]\)/.test(inbox['.validate']), 'all four fields');
  assert(/child\('nc'\)\.child\('matchId'\)/.test(inbox.matchId['.validate']), 'this match only');
  assert(/child\('nc'\)\.child\('k'\)/.test(inbox.k['.validate']), 'this round only');
  assertEqual(inbox.text['.validate'], 'newData.isString() && newData.val().length <= 80');
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  assert(/^\$id\.matches\(\/\^\[A-Za-z0-9_-\]\{6,40\}\$\/\)/.test(inbox['.validate']), 'command ids as the phones and crew make them');
  const keys = Object.keys(room);
  assertEqual(keys.indexOf('ncInbox'), keys.indexOf('swInbox') + 1, 'right after swInbox');
  assert(/'numberChallenge'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(read('js/net/roomUI.js'))[1]), 'roomUI ONLINE_GAMES');
  const crew = read('api/lib/Crew.php');
  assert(/'numberChallenge'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::ONLINE_GAMES');
  assert(/'numberChallenge'/.test(/const GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::GAMES: crew can sit in');
  assert(!/'numberChallenge'/.test(/var GAMES = \[([\s\S]*?)\];/.exec(read('js/crew/brains/quiz.js'))[1]), 'the quiz brain no longer plays it');
  const loader = read('api/crew/lib/loader.js');
  ['js/numberchallenge/rules.js', 'js/numberchallenge/referee.js', 'js/crew/brains/numberChallenge.js'].forEach((f) => assert(loader.indexOf("'" + f + "'") !== -1, 'the runner loads ' + f));
  const runner = read('api/crew/runner.js');
  assert(/numberchallengeRuns/.test(runner) && /NumberChallengeReferee/.test(runner) && /numberchallengeState/.test(runner) && /dropNumberchallenge/.test(runner), 'the runner referees numberchallengeRuns');
  const ctl = read('js/crew/controller.js');
  assert(/FF\.CrewNumberChallenge\.create/.test(ctl) && /ncMatch/.test(ctl), 'the controller seats crew in Number Challenge rooms');
  const FF = app();
  assert(FF.CrewLevels.answerMs.numberChallenge > 0, 'the crew timing table keeps numberChallenge');
});
