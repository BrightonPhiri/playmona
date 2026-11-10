'use strict';
/* Say What? crew players (js/crew/brains/sayWhat.js): like a person who knows the saying they
   work the gap out from the masked saying (R.solve), miss on purpose by their accuracy, answer
   inside the clock, and send through swInbox like a phone. Plus the wiring that names the game
   online: the inbox rule, the online and crew game lists, the runner and the crew controller. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/sayings.js', 'js/saywhat/rules.js',
  'js/crew/levels.js', 'js/crew/brains/sayWhat.js'];
let cached = null;
const app = () => cached || (cached = loadFF(FILES));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
/* A round as a phone sees it in the view: words with placeholders, the choices if any. */
function asSeen(rd, choice) {
  const v = { k: rd.k, words: JSON.parse(JSON.stringify(rd.words)), seconds: rd.seconds, two: rd.two, level: rd.level };
  if (choice) v.choices = rd.choices.slice();
  return v;
}
function dealt(FF, settings, n) {
  const R = FF.SayWhatRules;
  const out = [];
  for (let s = 0; s < n; s++) {
    const items = R.deal(settings, 'b' + s, 10).items;
    items.forEach((it, k) => out.push(R.roundAt(settings, 'b' + s, k, it)));
  }
  return out;
}

test('sw rules: solve finds the row and gaps for every round of 50 seeded deals', function () {
  const FF = app();
  const R = FF.SayWhatRules;
  let n = 0;
  ['normal', 'hard'].forEach((level) => {
    dealt(FF, { level, packs: 'mixed' }, 25).forEach((rd) => {
      const got = R.solve(asSeen(rd).words);
      assert(got, 'solved ' + rd.key);
      assertEqual(got.id, rd.id, rd.key);
      assertEqual(got.gaps.join('+'), rd.gaps.join('+'), rd.key);
      n++;
    });
  });
  assert(n >= 500, 'many rounds checked: ' + n);
  assertEqual(R.solve(['Nothing like this ', { gap: 0, len: 4 }, ' anywhere']), null);
  assertEqual(R.solve(null), null);
});

test('sw crew: with accuracy 1 the answer is right, tiles and choices', function () {
  const FF = app();
  const R = FF.SayWhatRules;
  const S = FF.CrewSayWhat.strategy;
  const rand = seeded(3);
  dealt(FF, { level: 'hard', packs: 'mixed' }, 5).forEach((rd) => {
    const t = S.answer(asSeen(rd), 1, rand);
    assert(R.check(rd, t).ok, 'tiles ' + rd.key + ' got ' + t);
    const c = S.answer(asSeen(rd, true), 1, rand);
    assert(rd.choices.indexOf(c) !== -1 && R.check(rd, c).ok, 'choice ' + rd.key + ' got ' + c);
  });
});

test('sw crew: with accuracy 0 the answer is never right', function () {
  const FF = app();
  const R = FF.SayWhatRules;
  const S = FF.CrewSayWhat.strategy;
  const rand = seeded(4);
  dealt(FF, { level: 'hard', packs: 'mixed' }, 5).forEach((rd) => {
    const t = S.answer(asSeen(rd), 0, rand);
    assert(typeof t === 'string' && t && !R.check(rd, t).ok, 'tiles ' + rd.key + ' got ' + t);
    if (rd.two) assertEqual(t.split(' ').length, 2, 'two words for two gaps');
    const c = S.answer(asSeen(rd, true), 0, rand);
    assert(rd.choices.indexOf(c) !== -1 && !R.check(rd, c).ok, 'choice ' + rd.key + ' got ' + c);
  });
  assertEqual(S.answer({ words: ['no such saying ', { gap: 0, len: 3 }] }, 1, rand), null, 'an unknown saying: no answer');
});

test('sw crew: delays fall within the round clock and choices are quicker than spelling', function () {
  const FF = app();
  const S = FF.CrewSayWhat.strategy;
  const rand = seeded(5);
  const ctx = { level: 'medium', skill: { skill: 50 }, persona: { reaction: 50 } };
  let tiles = 0, choice = 0;
  for (let i = 0; i < 200; i++) {
    const a = S.delay({ seconds: 25, two: false }, ctx, rand, 'tiles');
    const b = S.delay({ seconds: 12, two: false }, ctx, rand, 'choice');
    assert(a >= 900 && a <= 25000 - 1500, 'tiles delay ' + a);
    assert(b >= 900 && b <= 12000 - 1500, 'choice delay ' + b);
    tiles += a; choice += b;
  }
  assert(choice < tiles, 'picking is quicker than spelling');
  const p = S.accuracy({ level: 'hard', skill: { skill: 90 }, persona: { accuracy: 90 } }, 'normal');
  const q = S.accuracy({ level: 'easy', skill: { skill: 10 }, persona: { accuracy: 10 } }, 'hard');
  assert(p > q && p <= 0.97 && q >= 0.04, 'accuracy by level and skill: ' + p + ' ' + q);
});

test('sw crew: seats answer an open round through swInbox, once each', async function () {
  const FF = app();
  const R = FF.SayWhatRules;
  const rd = dealt(FF, { level: 'normal', packs: 'mixed' }, 1)[0];
  const writes = [];
  let watcher = null;
  const jobs = [];
  const T = {
    serverNow: () => 1000,
    watch: (p, fn) => { assertEqual(p, 'sw'); watcher = fn; return () => { watcher = null; }; },
    set: (p, v) => { writes.push({ p, v }); return Promise.resolve(); }
  };
  const seats = FF.CrewSayWhat.create({ transport: T, uids: ['crew1', 'crew2'], crew: {}, later: (fn) => jobs.push(fn), random: seeded(9) });
  seats.start();
  const view = { matchId: 'y_1', phase: 'open', k: 0, closeAt: 30000, settings: { level: 'normal', answer: 'tiles' },
    round: Object.assign(asSeen(rd), { cells: '____', tiles: 'ABCD' }), p: { crew1: { inK: -1 }, crew2: { inK: 0 }, human: { inK: -1 } } };
  watcher(view);
  watcher(view);
  assertEqual(jobs.length, 1, 'only crew1: crew2 has answered, the human is not crew, no repeats');
  jobs[0]();
  await Promise.resolve();
  assertEqual(writes.length, 1);
  assert(/^swInbox\/crew1\/c[0-9a-f]{24}$/.test(writes[0].p), writes[0].p);
  const cmd = writes[0].v;
  assertEqual(cmd.matchId, 'y_1');
  assertEqual(cmd.k, 0);
  assert(typeof cmd.text === 'string' && typeof cmd.t === 'number');
  assertEqual(Object.keys(cmd).sort().join(), 'k,matchId,t,text');
  assert(R.check(rd, cmd.text) !== null);
  seats.stop();
});

test('sayWhat: the inbox rule, the lists that name online and crew games, the runner and the controller know the game', function () {
  const room = JSON.parse(read('database.rules.json')).rules.rooms.$code;
  assertEqual(room.sw, undefined, 'rooms/$code/sw is server-only');
  const inbox = room.swInbox.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('sw'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assert(/bans/.test(inbox['.write']), 'not banned');
  assert(/hasChildren\(\['matchId', 'k', 'text', 't'\]\)/.test(inbox['.validate']), 'all four fields');
  assert(/child\('sw'\)\.child\('matchId'\)/.test(inbox.matchId['.validate']), 'this match only');
  assert(/child\('sw'\)\.child\('k'\)/.test(inbox.k['.validate']), 'this round only');
  assertEqual(inbox.text['.validate'], 'newData.isString() && newData.val().length <= 60');
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  const keys = Object.keys(room);
  assertEqual(keys.indexOf('swInbox'), keys.indexOf('skbInbox') + 1, 'right after skbInbox');
  assert(/'sayWhat'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(read('js/net/roomUI.js'))[1]), 'roomUI ONLINE_GAMES');
  const crew = read('api/lib/Crew.php');
  assert(/'sayWhat'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::ONLINE_GAMES');
  assert(/'sayWhat'/.test(/const GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::GAMES: crew can sit in');
  const loader = read('api/crew/lib/loader.js');
  ['js/data/sayings.js', 'js/saywhat/rules.js', 'js/saywhat/referee.js', 'js/crew/brains/sayWhat.js'].forEach((f) => assert(loader.indexOf("'" + f + "'") !== -1, 'the runner loads ' + f));
  const runner = read('api/crew/runner.js');
  assert(/saywhatRuns/.test(runner) && /SayWhatReferee/.test(runner) && /saywhatState/.test(runner) && /dropSaywhat/.test(runner), 'the runner referees saywhatRuns');
  const ctl = read('js/crew/controller.js');
  assert(/FF\.CrewSayWhat\.create/.test(ctl) && /swMatch/.test(ctl), 'the controller seats crew in Say What? rooms');
});
