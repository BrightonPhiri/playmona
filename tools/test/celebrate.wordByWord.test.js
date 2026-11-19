'use strict';
/* Word by Word (Celebrations): the shared rules (js/celebrate/wordByWord/rules.js) and whole games
   refereed by js/celebrate/wordByWord/referee.js over the dev transport with a hand-moved clock:
   strict turns, late and wrong-team words, refused words, timeouts, points per letter, ending early,
   the MC's strike, blind mode, pause / next / end, people moving team, and a restarted referee. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/wordflow/rules.js', 'js/celebrate/wordByWord/rules.js'];

/* ---------- rules ---------- */

test('word by word rules: settings keep to the offered values', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify({ mode: 'open', rounds: 3, minUnit: 'rounds', minCount: 2, seconds: 20, opening: '', names: [] }));
  const many = ['Vics', '', 'a b', 'x'.repeat(30)];
  for (let i = 0; i < 25; i++) many.push('Name' + i);
  const s = R.sanitize({ mode: 'x', rounds: 50, seconds: 7, minUnit: 'words', minCount: 500, opening: 'Dear Vicky,' + 'x'.repeat(80), names: many });
  assertEqual(s.mode, 'open');
  assertEqual(s.rounds, 10);
  assertEqual(s.seconds, 20);
  assertEqual(s.minUnit, 'words');
  assertEqual(s.minCount, 100);
  assertEqual(s.opening.length, 60);
  assert(s.names.length <= 20, 'at most 20 names');
  assertEqual(s.names[0], 'Vics');
  s.names.forEach((n) => assert(n && n.indexOf(' ') === -1 && n.length <= 24, 'name ' + n));
  assertEqual(R.sanitize({ rounds: 3, minCount: 5 }).minCount, 3, 'never more rounds than the game has');
  assertEqual(R.sanitize({ seconds: '15', rounds: '4', mode: 'blind' }).seconds, 15, 'numbers arrive as strings from forms');
  assertEqual(R.sanitize({ seconds: '15', rounds: '4' }).rounds, 4);
  assertEqual(R.sanitize({ opening: 'Dear\u0000   Vicky ' }).opening, 'Dear Vicky');
});

test('word by word rules: letters and points', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(R.letters("Vicky's"), 6);
  assertEqual(R.letters('well-done!'), 8);
  assertEqual(R.letters('40'), 0);
  const k = R.known(['Vics'], 'Vicky Banda');
  assertEqual(R.points({ text: 'Vicky', name: true }, k), 5);
  assertEqual(R.points({ text: "Vicky's", name: true }, k), 6);
  assertEqual(R.points({ text: 'Banda.', name: true }, k), 5);
  assertEqual(R.points({ text: 'Vics', name: true }, k), 4);
  assertEqual(R.points({ text: 'Zzzzzzzzzz', name: true }, k), 1);
  assertEqual(R.points({ text: 'love', name: false }, k), 4);
  assertEqual(R.points({ text: '40', name: false }, k), 0);
});

test('word by word rules: parse allows ! and has no sentence limit', function () {
  const R = loadFF(RULES).WordByWordRules;
  // Harare is not in the bank, so its capital makes it a name.
  const o = { isWord: (w) => w !== 'zzz' && w !== 'harare', isQuiet: (w) => w === 'rudeword' };
  assertEqual(R.parse('amazing!', o).text, 'amazing!');
  assertEqual(R.parse('LOVE', o).text, 'love');
  const forced = R.parse('love', Object.assign({ capital: true }, o));
  assertEqual(forced.text, 'Love');
  assertEqual(forced.name, false, 'a forced capital is not a name');
  assertEqual(R.parse('Harare', o).name, true);
  assertEqual(R.parse('Harare', Object.assign({ capital: true }, o)).name, true, 'typed with a capital where one is due');
  assertEqual(R.parse('two words', o).error, 'spaces');
  assert(R.parse("Vicky's!", o).ok);
  assert(R.parse('40', o).ok);
  assert(R.parse('well-done', o).ok);
  assertEqual(R.parse('rudeword', o).error, 'rude');
  assertEqual(R.parse('zzz', o).error, 'unknown');
  assertEqual(R.parse('wow?', o).error, 'punct');
});

test('wordflow rules: parseWord keeps its old endings and sentence limit', function () {
  const W = loadFF(['js/core.js', 'js/wordflow/rules.js']).WordFlowRules;
  assertEqual(W.parseWord('wow!').error, 'punct');
  assertEqual(W.parseWord('cat', { position: 29 }).error, 'tooLong');
  assertEqual(W.parseWord('cat.', { position: 29 }).text, 'cat.');
});

test('word by word rules: minimum and final text', function () {
  const R = loadFF(RULES).WordByWordRules;
  assertEqual(R.minReached({ minUnit: 'rounds', minCount: 2 }, 9, 5), false);
  assertEqual(R.minReached({ minUnit: 'rounds', minCount: 2 }, 10, 5), true);
  assertEqual(R.minReached({ minUnit: 'words', minCount: 0 }, 0, 3), true);
  assertEqual(R.minReached({ minUnit: 'words', minCount: 4 }, 3, 3), false);
  assertEqual(R.finalText('Dear Vicky,', [{ w: 'we' }, { w: 'love' }, { w: 'you' }]), 'Dear Vicky, we love you.');
  assertEqual(R.finalText('', [{ w: 'We' }, { w: 'love' }, { w: 'you!' }]), 'We love you!');
  assertEqual(R.finalText('', [{ w: 'Happy' }, { w: 'birthday,' }]), 'Happy birthday.');
});

/* ---------- the referee ---------- */

const FILES = RULES.concat(['js/net/transport.js', 'js/celebrate/wordByWord/referee.js']);

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
  /* Move the clock without running the jobs that fall due (a command arriving first). */
  c.jump = (ms) => { c.now += ms; };
  return c;
}
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

const CID = 'cel_' + 'b'.repeat(24);
const FIRST = { t_gold: 'g1', t_ruby: 'r1' };

async function game(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const Ref = app.CelebrateReferees.wordByWord;
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
  const run = Object.assign({
    runId: 'r_1', cid: CID, gameId: 'g_1', template: 'wordByWord', name: 'For Vicky', instructions: 'One word each',
    startAt: clock.now + 10000, teams, celebrant: 'Vicky Banda',
    config: Object.assign({ mode: 'open', rounds: 2, minUnit: 'rounds', minCount: 1, seconds: 20 }, opts.config || {})
  }, opts.run || {});
  const ref = Ref.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: opts.randomInt || seeded(42),
    // Names are not in the bank: their capital makes them names.
    isWord: (w) => w !== 'zzz' && w !== 'zork' && w !== 'vicky' && w !== 'harare', isQuiet: (w) => w === 'rudeword',
    timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
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
    order: () => (g.view().order || []).slice(),
    current: () => g.view().turn.teamId,
    other: () => g.order().filter((tid) => tid !== g.current())[0],
    words: () => (g.view().words || []).map((x) => x.w),
    said: (uid) => (g.view().said || {})[uid] || {},
    points: (tid) => ((g.view().totals || {})[tid] || {}).points || 0,
    async toPlay() { await clock.advance(10000); },
    async send(uid, cmd, over) {
      if (next[uid] == null) next[uid] = 0;
      const turn = g.view() && g.view().turn ? g.view().turn.id : 0;
      const full = Object.assign({ type: 'word', runId: run.runId, n: next[uid], t: clock.now, end: false, turn }, cmd, over || {});
      if (!over || over.n == null) next[uid]++;
      await room.set('inbox/' + uid + '/c' + tag + (++seq), full);
      await flush();
    },
    /* The team on its turn says a word. */
    async say(word, over) { await g.send(FIRST[g.current()], { word }, over); },
    async control(action, extra) { await room.set('control', Object.assign({ runId: run.runId, id: 'k' + (++seq), action }, extra || {})); await flush(); }
  };
  return g;
}

test('word by word referee: the order is shuffled from teams with members, and seeded', async function () {
  const a = await game();
  await a.toPlay();
  assertEqual(a.view().phase, 'playing');
  assertEqual(a.order().slice().sort().join(','), 't_gold,t_ruby', 'Jade has nobody, so it is not in the order');
  assertEqual(a.current(), a.order()[0]);
  assertEqual(a.view().turn.id, 0);
  const b = await game();
  await b.toPlay();
  assertEqual(b.order().join(','), a.order().join(','), 'the same seed, the same order');
  const seen = {};
  for (let s = 1; s < 30; s++) { const c = await game({ randomInt: seeded(s) }); await c.toPlay(); seen[c.order()[0]] = true; c.ref.stop(); }
  assert(seen.t_gold && seen.t_ruby, 'either team can go first');
});

test('word by word referee: only the team on its turn can send, first word wins', async function () {
  const g = await game();
  await g.toPlay();
  const first = g.current();
  await g.send(FIRST[g.other()], { word: 'hello' });
  assertEqual(g.said(FIRST[g.other()]).error, 'notYourTurn');
  assertEqual(g.words().length, 0, 'nothing added');
  if (first === 't_gold') {
    await g.send('g1', { word: 'we' });
    await g.send('g2', { word: 'you' }, { turn: 0 });
    assertEqual(g.words().join(' '), 'We', 'one word for the turn');
  } else {
    await g.say('we');
    await g.send('g1', { word: 'love' });
    await g.send('g2', { word: 'you' }, { turn: 1 });
    assertEqual(g.words().join(' '), 'We love', 'Gold\'s first word lands, the second is too late');
  }
  assertEqual(g.said('g2').error, 'late');
  await g.send('zz', { word: 'hi' });
  assertEqual(g.said('zz').error, 'notYourTurn', 'someone in no team');
});

test('word by word referee: a late word for a past turn is refused', async function () {
  const g = await game({ config: { rounds: 3 } });
  await g.toPlay();
  await g.say('we');
  const turn = g.view().turn.id;
  await g.say('love', { turn: turn - 1 });
  assertEqual(g.said(FIRST[g.current()]).error, 'late');
  assertEqual(g.words().length, 1);
  const team = g.current();
  g.clock.jump(20000);
  await g.say('love');
  assertEqual(g.said(FIRST[team]).error, 'late', 'after the turn ran out, even before the timer fired');
  assertEqual(g.words().length, 1, 'not filled');
  assert(g.view().turn.id === turn + 1 && g.current() !== team, 'the turn was skipped');
});

test('word by word referee: a refused word keeps the turn', async function () {
  const g = await game();
  await g.toPlay();
  const team = g.current();
  await g.say('rudeword');
  assertEqual(g.said(FIRST[team]).error, 'rude');
  await g.say('two words');
  assertEqual(g.said(FIRST[team]).error, 'spaces');
  await g.say('zzz');
  assertEqual(g.said(FIRST[team]).error, 'unknown');
  assertEqual(g.current(), team);
  assertEqual(g.view().turn.id, 0);
  await g.say('love');
  assertEqual(g.words().join(' '), 'Love');
  assertEqual(g.said(FIRST[team]).error || '', '');
});

test('word by word referee: time running out skips the turn and scores nothing', async function () {
  const g = await game();
  await g.toPlay();
  const team = g.current();
  await g.clock.advance(20000);
  assert(g.current() !== team, 'the next team');
  assertEqual(g.view().turn.id, 1);
  assertEqual(g.points(team), 0);
  assertEqual(g.ref.state().totals[team].usedMs, 20000);
});

test('word by word referee: points are letters, names by the known list', async function () {
  const g = await game({ config: { rounds: 4, minCount: 4 } });
  await g.toPlay();
  const a = g.current();
  await g.say('Vicky');
  const b = g.current();
  await g.say('Zork');
  await g.say('love');
  await g.say('40.');
  await g.say('we');
  assertEqual(g.words().join(' '), 'Vicky Zork love 40. We', 'a capital after the full stop');
  assertEqual(g.points(a), 5 + 4 + 2, 'Vicky, love, We');
  assertEqual(g.points(b), 1 + 0, 'an unlisted name 1, digits 0');
});

test('word by word referee: ending early only after the minimum', async function () {
  const g = await game({ config: { rounds: 3, minCount: 1 } });
  await g.toPlay();
  const team = g.current();
  await g.say('we', { end: true });
  assertEqual(g.said(FIRST[team]).error, 'tooSoon');
  assertEqual(g.words().length, 0, 'nothing added, the turn kept');
  assertEqual(g.view().minReached, false);
  await g.say('we');
  await g.say('love');
  assertEqual(g.view().minReached, true, 'one round done');
  await g.say('you', { end: true });
  assertEqual(g.view().phase, 'reveal');
  assertEqual(g.view().words.length, 3, 'the reveal shows the message');
  await g.clock.advance(5000);
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.reports.length, 1);
  assertEqual(g.reports[0].p.message.text, 'We love you.');
  assertEqual(g.reports[0].p.why, 'ended');
});

test('word by word referee: the game ends after the last round and reports once', async function () {
  const g = await game();
  await g.toPlay();
  const first = g.current();
  await g.say('happy');
  await g.say('birthday');
  await g.say('dear');
  await g.say('Vicky!');
  assertEqual(g.view().phase, 'reveal');
  await g.clock.advance(60000);
  assertEqual(g.view().phase, 'ended');
  await g.clock.advance(60000);
  assertEqual(g.reports.length, 1, 'once');
  const p = g.reports[0].p;
  assertEqual(p.template, 'wordByWord');
  assertEqual(p.why, 'done');
  assertEqual(p.message.text, 'Happy birthday dear Vicky!');
  assertEqual(p.message.words.length, 4);
  const rows = p.rounds[0].teams;
  const second = first === 't_gold' ? 't_ruby' : 't_gold';
  assertEqual(rows[first].points, 5 + 4);
  assertEqual(rows[second].points, 8 + 5);
  assertEqual(p.ranked[0].teamId, second);
  assertEqual(g.view().result.text, 'Happy birthday dear Vicky!');
});

test('word by word referee: the MC strikes a word and its points go back', async function () {
  const g = await game({ config: { mode: 'blind', rounds: 3 } });
  await g.toPlay();
  const a = g.current();
  await g.say('we');
  const b = g.current();
  await g.say('love');
  await g.say('rubbish');
  assertEqual(g.view().last.w, 'rubbish');
  await g.control('strike', { index: 2, word: 'rubbish' });
  assertEqual(g.tree().staff.words.map((x) => x.w).join(' '), 'We love');
  assertEqual(g.view().last.w, 'love', 'the last word falls back');
  assertEqual(g.view().count, 2);
  assertEqual(g.points(a), 2);
  await g.control('strike', { index: 0, word: 'We' });
  assertEqual(g.points(a), 0);
  assertEqual(g.points(b), 4);
  await g.control('strike', { index: 7, word: 'love' });
  assertEqual(g.view().count, 1, 'a word that is not there changes nothing');
  // Two panels strike the same word: the second finds a different word at that place and leaves it.
  await g.control('strike', { index: 0, word: 'rubbish' });
  assertEqual(g.view().count, 1, 'a strike for a word that has moved changes nothing');
  assertEqual(g.points(b), 4, 'the other group keeps its points');
  await g.control('strike', { index: 0 });
  assertEqual(g.view().count, 1, 'a strike must name the word');
});

test('word by word referee: blind mode never shows earlier words', async function () {
  const g = await game({ config: { mode: 'blind', rounds: 2 } });
  await g.toPlay();
  await g.say('we');
  await g.say('love');
  await g.say('you');
  const v = g.view();
  assert(v.words == null, 'no words in the run');
  assertEqual(v.last.w, 'you');
  assertEqual(v.count, 3);
  assert(JSON.stringify(v).indexOf('love') === -1, 'not anywhere in the run');
  assertEqual(g.tree().staff.words.length, 3, 'the MC copy has them');
  await g.say('so');
  await g.clock.advance(60000);
  assertEqual(g.view().phase, 'ended');
  assert(g.tree().staff == null, 'the MC copy is cleared');
  assertEqual(g.view().result.words.length, 4);
});

test('word by word referee: open mode keeps the staff copy empty', async function () {
  const g = await game();
  await g.toPlay();
  await g.say('we');
  assert(g.tree().staff == null);
  assertEqual(g.view().words[0].teamId, g.order()[0]);
});

test('word by word referee: pause keeps the time left; next skips the turn', async function () {
  const g = await game();
  await g.toPlay();
  await g.clock.advance(8000);
  await g.control('pause');
  assertEqual(g.view().paused, true);
  await g.say('we');
  assertEqual(g.words().length, 0, 'no words while paused');
  await g.clock.advance(60000);
  assertEqual(g.view().turn.id, 0, 'the clock stands still');
  await g.control('resume');
  assertEqual(g.view().turn.endsAt, g.clock.now + 12000);
  const team = g.current();
  await g.control('next');
  assert(g.current() !== team, 'next skips the turn');
  assertEqual(g.points(team), 0);
  await g.control('end');
  assertEqual(g.view().phase, 'ended', 'nothing to reveal');
  assertEqual(g.reports.length, 1);
  assertEqual(g.reports[0].p.why, 'stopped');
});

test('word by word referee: a replayed command lands once', async function () {
  const g = await game({ config: { rounds: 3 } });
  await g.toPlay();
  await g.say('we');
  await g.say('love');
  const team = g.current();
  await g.send(FIRST[team], { word: 'you' }, { n: 0 });
  assertEqual(g.words().length, 2, 'an old number is a replay');
});

test('word by word referee: members follow moves and empty teams are skipped', async function () {
  const g = await game({ config: { rounds: 3 } });
  await g.toPlay();
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_gold' }, r1: { name: 'Cat', team: 't_gold' } });
  await flush();
  assertEqual(g.view().teams.t_gold.players.r1, 'Cat');
  assertEqual(g.current(), 't_gold', 'Ruby has nobody now');
  await g.send('r1', { word: 'we' });
  assertEqual(g.words().join(' '), 'We', 'Cat plays for Gold');
  assertEqual(g.current(), 't_gold', 'Ruby is skipped at once');
  assertEqual(g.view().turn.id, g.order()[0] === 't_gold' ? 2 : 3);
});

test('word by word referee: a restarted referee carries on', async function () {
  const bus = makeBus();
  const clock = makeClock(5000000);
  const saved = { value: null };
  const g = await game({ bus, clock, saved, config: { mode: 'blind', rounds: 3 } });
  await g.toPlay();
  const firstUid = FIRST[g.current()];
  await g.say('we');
  await clock.advance(5000);
  const turn = JSON.stringify(g.view().turn);
  g.ref.stop();
  const g2 = await game({ bus, clock, saved, randomInt: seeded(999), config: { mode: 'blind', rounds: 3 } });
  assertEqual(JSON.stringify(g2.view().turn), turn, 'same turn and deadline');
  assertEqual(g2.tree().staff.words.length, 1);
  assertEqual(g2.view().n[firstUid], 1, 'old command numbers are still known');
  await clock.advance(15000);
  assertEqual(g2.view().turn.id, 2, 'the deadline still runs');
});

test('word by word: the runner loads it; the inbox rule takes word, end and turn', function () {
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(loader.indexOf("'js/celebrate/wordByWord/rules.js'") !== -1 && loader.indexOf("'js/celebrate/wordByWord/referee.js'") !== -1, 'loader');
  assert(loader.indexOf("'js/wordflow/rules.js'") !== -1, 'with the word checker');
  const runner = fs.readFileSync(path.join(ROOT, 'api/crew/runner.js'), 'utf8');
  const start = runner.slice(runner.indexOf('function startCelebration'), runner.indexOf('celebrations.set(runId'));
  assert(/isWord/.test(start) && /isQuiet/.test(start), 'the referee gets the word bank');
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const inbox = rules.celebrations.$cid.inbox.$uid.$id;
  ['word', 'end', 'turn'].forEach((k) => assert(inbox[k], 'rule for ' + k));
  assert(/isString/.test(inbox.word['.validate']) && /26/.test(inbox.word['.validate']), 'a short string');
  assert(/isBoolean/.test(inbox.end['.validate']));
  assert(/isNumber/.test(inbox.turn['.validate']));
});

test('word by word: the server offers the same settings', function () {
  const R = loadFF(RULES).WordByWordRules;
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/CelebrationGames.php'), 'utf8');
  assert(php.indexOf("'mode' => ['" + R.MODES.join("', '") + "']") !== -1, 'the same versions');
  assert(php.indexOf("'seconds' => [" + R.SECONDS.join(', ') + ']') !== -1, 'the same turn times');
  assert(php.indexOf("'minUnit' => ['" + R.MIN_UNITS.join("', '") + "']") !== -1, 'the same minimum units');
  const d = R.DEFAULTS;
  assert(php.indexOf("WBW_DEFAULTS = ['mode' => '" + d.mode + "', 'rounds' => " + d.rounds + ", 'minUnit' => '" + d.minUnit + "', 'minCount' => " + d.minCount + ", 'seconds' => " + d.seconds + ']') !== -1, 'the same standards');
  assert(php.indexOf('WBW_ROUNDS_MAX = ' + R.ROUNDS_MAX + ';') !== -1 && php.indexOf('WBW_MAX_NAMES = ' + R.MAX_NAMES + ';') !== -1 && php.indexOf('WBW_MAX_OPENING = ' + R.MAX_OPENING + ';') !== -1, 'the same limits');
});

test('word by word referee: once ended it leaves the next game\'s words in the inbox', async function () {
  // The crew keeps an ended referee for a minute; the MC may start the next game straight away.
  const g = await game();
  await g.toPlay();
  await g.control('end');
  await g.clock.advance(5000);
  assertEqual(g.view().phase, 'ended');
  await g.room.set('inbox/g1/cnext', { type: 'word', runId: 'r_2', n: 0, t: g.clock.now, word: 'hello', end: false, turn: 0 });
  await g.clock.advance(100);
  const box = g.tree().inbox || {};
  assert(box.g1 && box.g1.cnext, 'the next game\'s word waits for its own referee');
});

test('word by word rules: a real word typed with a capital is a word, not a name', function () {
  const R = loadFF(RULES).WordByWordRules;
  const bank = { happy: 1, birthday: 1, love: 1 };
  const o = { isWord: (w) => !!bank[w], isQuiet: () => false };
  const known = R.known(['Vics'], 'Vicky Banda');
  const start = R.parse('Happy', Object.assign({ capital: true }, o));
  assertEqual(start.name, false, 'Happy at the start is a word');
  assertEqual(R.points(start, known), 5);
  const mid = R.parse('Birthday', o);
  assertEqual(mid.text, 'Birthday', 'the capital is kept');
  assertEqual(mid.name, false, 'Birthday mid-sentence is a word');
  assertEqual(R.points(mid, known), 8);
  assertEqual(R.parse('Harare', o).name, true, 'not in the bank: a name');
  assertEqual(R.points(R.parse('Harare', o), known), 1);
});

test('word by word rules: a known name in capitals is taken', function () {
  const R = loadFF(RULES).WordByWordRules;
  const o = { isWord: () => false, isQuiet: () => false, known: R.known(['Vics'], 'Vicky Banda') };
  const shout = R.parse('VICKY!', o);
  assert(shout.ok, 'VICKY! is the celebrant');
  assertEqual(shout.text, 'Vicky!');
  assertEqual(R.points(shout, o.known), 5);
  assertEqual(R.parse('ZORK', o).error, 'unknown', 'an unknown shout is still refused');
});

test('word by word referee: a guest removed from the event leaves the order', async function () {
  const g = await game({ config: { rounds: 3 } });
  await g.toPlay();
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_gold' }, r1: { name: 'Cat', team: 't_ruby' } });
  await flush();
  // Removing a guest deletes their entry; Ruby's only member goes while the game is paused.
  await g.control('pause');
  await g.room.set('members/r1', null);
  await flush();
  await g.control('resume');
  assert(!g.view().teams.t_ruby.players.r1, 'Cat is out of Ruby');
  assertEqual(g.current(), 't_gold', 'Ruby has nobody left');
  await g.say('we');
  assertEqual(g.current(), 't_gold', 'Ruby is skipped at once');
});
