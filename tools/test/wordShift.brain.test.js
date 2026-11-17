'use strict';
/* WordShift crew players (js/crew/brains/wordShift.js): they find their own way from the word
   they are on to the target (a search over real words, never the referee's answer), slip like
   people do (a longer way round, a non-word now and then), take human time per move, and send
   one move at a time through wordshiftInbox like a phone. Plus the wiring that names the game online. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/wordshift/rules.js', 'js/crew/levels.js', 'js/crew/brains/wordShift.js'];
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const WORDS = new Set(['cold', 'cord', 'card', 'ward', 'warm', 'word', 'worm', 'core', 'bold', 'bolt', 'colt', 'cola', 'wold', 'wild', 'mild']);
const isWord = (w) => WORDS.has(w);

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

test('ws crew: the search finds a shortest way through real words, or none', function () {
  const FF = loadFF(FILES);
  const S = FF.CrewWordShift.strategy;
  const p = S.route('cold', 'warm', [], isWord);
  assertEqual(p.length, 4);
  assertEqual(p[p.length - 1], 'warm');
  let prev = 'cold';
  p.forEach((w) => { assert(FF.WordShiftRules.checkMove(prev, w, [], isWord).ok, prev + ' -> ' + w); prev = w; });
  assertEqual(S.route('cold', 'cold', [], isWord).length, 0, 'already there');
  assertEqual(S.route('cold', 'zzzz', [], isWord), null, 'no way there');
  const blocked = S.route('cold', 'warm', ['cord'], isWord);
  assert(blocked === null || blocked.indexOf('cord') === -1, 'never through a used word');
});

test('ws crew: crew never play a word the puzzles leave out for a family game', async function () {
  const FF = loadFF(FILES);
  const R = FF.WordShiftRules;
  const gen = require('../gen-wordshift');
  assert(R.AVOID.indexOf('crap') !== -1 && R.AVOID.indexOf('fart') !== -1, 'the list lives in the rules');
  assertEqual(gen.AVOID.size, R.AVOID.length, 'the generator uses the same list');
  // chap > crap > wrap and chap > whap > wrap are as short as each other: crew take the clean one.
  const words = new Set(['coat', 'chat', 'chap', 'crap', 'wrap', 'cost', 'cast', 'case', 'cape', 'tape', 'tare', 'ware', 'wart', 'warp',
    'coap', 'colt', 'cart', 'carp', 'whap']);
  const isWord = (w) => words.has(w);
  const writes = [];
  let watcher = null;
  const jobs = [];
  const T = { serverNow: () => 1000, watch: (p, fn) => { watcher = fn; return () => {}; }, set: () => { throw new Error('crew never write the room'); } };
  const inbox = { set: (p, v) => { writes.push(v.word); return Promise.resolve(); } };
  let mine = { matchId: 'w_1', k: 0, word: 'coat', used: ['coat'], moves: 0, invalid: 0, done: false };
  const seats = FF.CrewWordShift.create({ transport: T, uids: ['crew1'], crew: { crew1: { skills: { wordShift: { skill: 100, level: 'hard' } }, persona: { accuracy: 100 } } },
    later: (fn) => jobs.push(fn), random: () => 0.99, isWord, inbox, mineOf: () => Promise.resolve(mine) });
  seats.start();
  for (let step = 0; step < 12 && mine.word !== 'wrap'; step++) {
    watcher({ matchId: 'w_1', phase: 'open', k: 0, closeAt: 1e9, settings: { level: 'normal' }, puzzle: { s: 'coat', t: 'wrap' }, p: { crew1: { moves: step, invalid: 0, done: false } } });
    jobs.shift()();
    await new Promise((r) => setImmediate(r));
    const w = writes[writes.length - 1];
    mine = Object.assign({}, mine, { word: w, used: mine.used.concat([w]), moves: step + 1 });
  }
  assertEqual(mine.word, 'wrap', 'got there: ' + writes.join('>'));
  writes.forEach((w) => assert(R.AVOID.indexOf(w) === -1, 'played ' + w));
});

test('ws crew: a sure player takes the shortest step; a shaky one slips now and then', function () {
  const FF = loadFF(FILES);
  const S = FF.CrewWordShift.strategy;
  const R = FF.WordShiftRules;
  const rand = seeded(3);
  for (let i = 0; i < 50; i++) {
    const m = S.move('cold', 'warm', ['cold'], 1, rand, isWord);
    assertEqual(S.route(m, 'warm', ['cold', m], isWord).length, 3, 'one step nearer: ' + m);
  }
  let slips = 0, typos = 0;
  for (let i = 0; i < 400; i++) {
    const m = S.move('cold', 'warm', ['cold'], 0.1, rand, isWord);
    assertEqual(m.length, 4);
    assert(m !== 'cold', 'always a change');
    const ok = R.checkMove('cold', m, ['cold'], isWord);
    if (!ok.ok) { typos++; assertEqual(ok.reason, 'word', 'a slip is a non-word, one letter off: ' + m); continue; }
    const left = S.route(m, 'warm', ['cold', m], isWord);
    if (!left || left.length >= 4) slips++;
  }
  assert(typos > 0 && slips > 0, 'typos ' + typos + ', detours ' + slips);
  assert(typos < 200, 'but mostly real words: ' + typos);
  assertEqual(S.move('zzzz', 'warm', ['zzzz'], 1, rand, isWord), null, 'stuck: nothing to send');
});

test('ws crew: move times are human and stay inside the clock; accuracy follows level and skill', function () {
  const FF = loadFF(FILES);
  const S = FF.CrewWordShift.strategy;
  const rand = seeded(5);
  const ctx = { level: 'medium', skill: { skill: 50 }, persona: { reaction: 50 } };
  let four = 0, seven = 0;
  for (let i = 0; i < 200; i++) {
    const a = S.delay(4, ctx, rand);
    const b = S.delay(7, ctx, rand);
    assert(a >= 1500 && a <= 30000, 'delay ' + a);
    four += a; seven += b;
  }
  assert(seven > four, 'longer words take longer');
  const p = S.accuracy({ level: 'hard', skill: { skill: 90 }, persona: { accuracy: 90 } }, 'normal');
  const q = S.accuracy({ level: 'easy', skill: { skill: 10 }, persona: { accuracy: 10 } }, 'expert');
  assert(p > q && p <= 0.97 && q >= 0.04, 'accuracy ' + p + ' ' + q);
});

test('ws crew: seats move through wordshiftInbox one step at a time, and stop at the target', async function () {
  const FF = loadFF(FILES);
  const writes = [];
  const watchers = {};
  const jobs = [];
  const asked = [];
  const T = {
    serverNow: () => 1000,
    watch: (p, fn) => { watchers[p] = fn; return () => { delete watchers[p]; }; },
    set: () => { throw new Error('crew never write the room'); }
  };
  const inbox = { set: (p, v) => { writes.push({ p, v }); return Promise.resolve(); } };
  const mine = { crew1: { matchId: 'w_1', k: 0, word: 'cold', used: ['cold'], moves: 0, invalid: 0, done: false } };
  const mineOf = (uid) => { asked.push(uid); return Promise.resolve(mine[uid] ? JSON.parse(JSON.stringify(mine[uid])) : null); };
  const seats = FF.CrewWordShift.create({ transport: T, uids: ['crew1', 'crew2'], crew: {}, later: (fn) => jobs.push(fn), random: seeded(9), isWord, mineOf, inbox });
  seats.start();
  assert(watchers.ws, 'watches the view');
  const ws = { matchId: 'w_1', phase: 'open', k: 0, closeAt: 120000, settings: { level: 'normal' }, puzzle: { id: 'x', s: 'cold', t: 'warm', lv: 'normal' },
    p: { crew1: { moves: 0, invalid: 0, done: false }, crew2: { moves: 4, invalid: 0, done: true }, human: { moves: 0, invalid: 0, done: false } } };
  const see = () => watchers.ws(JSON.parse(JSON.stringify(ws)));
  see();
  see();
  assertEqual(jobs.length, 1, 'only crew1: crew2 is done, the human is not crew, no repeats');
  jobs.shift()();
  await new Promise((r) => setImmediate(r));
  assertEqual(asked, ['crew1'], 'reads only its own words');
  assertEqual(writes.length, 1);
  assert(/^crew1\/c[0-9a-f]{24}$/.test(writes[0].p), writes[0].p);
  const cmd = writes[0].v;
  assertEqual(Object.keys(cmd).sort().join(), 'k,matchId,t,word');
  assertEqual([cmd.matchId, cmd.k], ['w_1', 0]);
  see();
  assertEqual(jobs.length, 0, 'waits for the referee before the next move');
  ws.p.crew1.moves = 1;
  mine.crew1 = { matchId: 'w_1', k: 0, word: cmd.word, used: ['cold', cmd.word], moves: 1, invalid: 0, done: false };
  see();
  assertEqual(jobs.length, 1, 'the next move once the referee has answered');
  ws.p.crew1.done = true;
  mine.crew1 = Object.assign({}, mine.crew1, { word: 'warm', done: true });
  jobs.shift()();
  await new Promise((r) => setImmediate(r));
  assertEqual(writes.length, 1, 'nothing once at the target');
  seats.stop();
  assert(!watchers.ws, 'stopped');
});

test('wordShift: the rules, the online and crew game lists, the runner and the controller know the game', function () {
  const rules = JSON.parse(read('database.rules.json')).rules;
  const room = rules.rooms.$code;
  assertEqual(room.ws, undefined, 'rooms/$code/ws is server-only (read with the room)');
  assertEqual(room.wsMine, undefined, 'no private words inside the room: any signed-in player can read a room');
  const mine = rules.wordshiftMine.$code.$uid;
  assertEqual(mine['.read'], 'auth != null && auth.uid === $uid', 'my words are mine alone');
  assertEqual(mine['.write'], undefined, 'no phone writes them');
  assertEqual(rules.wordshiftMine['.read'], undefined);
  assertEqual(rules.wordshiftMine.$code['.read'], undefined);
  assertEqual(room.wsInbox, undefined, 'no moves inside the room: any signed-in player can read a room');
  assertEqual(JSON.stringify(rules.wordshiftInbox).indexOf('.read'), -1, 'no phone reads the inbox');
  const inbox = rules.wordshiftInbox.$code.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('ws'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assert(/bans/.test(inbox['.write']), 'not banned');
  assert(/hasChildren\(\['matchId', 'k', 'word', 't'\]\)/.test(inbox['.validate']), 'all four fields');
  assert(/child\('ws'\)\.child\('matchId'\)/.test(inbox.matchId['.validate']), 'this match only');
  assert(/child\('ws'\)\.child\('k'\)/.test(inbox.k['.validate']), 'this round only');
  assertEqual(inbox.word['.validate'], "newData.isString() && newData.val().matches(/^[a-z]{3,8}$/)");
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  const keys = Object.keys(rules);
  assertEqual(keys.indexOf('wordshiftInbox'), keys.indexOf('wordshiftMine') + 1, 'right after wordshiftMine');
  assert(/'wordShift'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(read('js/net/roomUI.js'))[1]), 'roomUI ONLINE_GAMES');
  const crew = read('api/lib/Crew.php');
  assert(/'wordShift'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::ONLINE_GAMES');
  assert(/'wordShift'/.test(/const GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::GAMES: crew can sit in');
  const loader = read('api/crew/lib/loader.js');
  ['js/data/wordshiftPuzzles.js', 'js/wordshift/rules.js', 'js/wordshift/referee.js', 'js/crew/brains/wordShift.js'].forEach((f) => assert(loader.indexOf("'" + f + "'") !== -1, 'the runner loads ' + f));
  const runner = read('api/crew/runner.js');
  assert(/wordshiftRuns/.test(runner) && /WordShiftReferee/.test(runner) && /wordshiftState/.test(runner) && /dropWordshift/.test(runner), 'the runner referees wordshiftRuns');
  const ctl = read('js/crew/controller.js');
  assert(/FF\.CrewWordShift\.create/.test(ctl) && /wsMatch/.test(ctl), 'the controller seats crew in WordShift rooms');
});
