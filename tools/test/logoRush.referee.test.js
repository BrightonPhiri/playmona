'use strict';
/* Logo Rush online: whole matches refereed by js/logorush/referee.js over the app's dev
   transport with a hand-moved clock — secret seed, one logo at a time, the name never
   published before the reveal, answers checked and timed by the server, one answer per
   round, late and early answers, results together, the final ranking — and the phone
   client's commands (js/logorush/client.js). */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/logos.js', 'js/logorush/rules.js',
  'js/net/transport.js', 'js/logorush/referee.js'];

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
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
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

async function match(opts) {
  opts = opts || {};
  const FF = loadFF(FILES);
  const R = FF.LogoRushRules;
  const RF = FF.LogoRushReferee;
  const bus = makeBus();
  const clock = makeClock(1000000);
  const code = 'ROOM01';
  const room = FF.Transport.dev({ bus, root: 'rooms/' + code });
  await room.connect();
  room.serverNow = () => clock.now;
  const n = opts.players || 2;
  const seats = [];
  const players = {};
  for (let i = 0; i < n; i++) {
    const uid = 'p' + (i + 1);
    seats.push(uid);
    players[uid] = { name: 'Player ' + (i + 1), online: true, joinedAt: i };
  }
  await room.set('', { meta: { seed: 's', status: 'playing', hostUid: 'p1', startAt: clock.now + 1000 }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const views = [];
  bus.subscribe(() => { const v = bus.read('rooms/' + code); if (v && v.lr) views.push(JSON.stringify(v.lr)); });
  const run = { matchId: 'l_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({ level: 'normal', rounds: 10 }, opts.settings || {}) };
  const ref = RF.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(42), timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    FF, R, RF, bus, clock, room, ref, seats, saved, reports, run, views,
    lr: () => bus.read('rooms/' + code).lr || null,
    meta: () => bus.read('rooms/' + code).meta,
    /* The secret answer, worked out from the referee's own saved state (tests only). */
    secret: () => { const s = m.saved.value; return R.roundAt(s.settings, s.seed, m.lr().k); },
    answerText: () => (m.lr().settings.mode === 'choice' ? m.secret().id : m.secret().target),
    /* Wait until the next logo is open for answers. */
    async open() {
      const g = m.lr();
      const due = g.phase === 'starting' ? g.readyAt + RF.READY_MS : g.phase === 'ready' ? g.openAt : g.phase === 'reveal' ? g.nextAt + RF.READY_MS : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      assertEqual(m.lr().phase, 'open');
    },
    async answer(uid, text, over) {
      const g = m.lr();
      const cmd = Object.assign({ type: 'answer', matchId: g.matchId, k: g.k, text, t: clock.now }, over || {});
      await room.set('lrInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    }
  };
  return m;
}

test('logorush referee: the seed stays secret; a logo is published ready, then opened', async function () {
  const m = await match();
  const g0 = m.lr();
  assertEqual(g0.phase, 'starting');
  assert(!('seed' in g0) && !g0.round, 'no seed and no logo before the first round');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.lr();
  assertEqual(g.phase, 'ready');
  assertEqual(g.k, 0);
  assert(g.round && g.round.id && g.round.tiles && g.round.cells, 'the round is published so phones can load the logo');
  assert(JSON.stringify(g).indexOf(m.saved.value.seed) === -1, 'the seed is never in the view');
  assertEqual(g.openAt, g.readyAt + m.RF.READY_MS);
  assertEqual(g.closeAt, g.openAt + 20000);
  await m.open();
});

test('logorush referee: the brand name is never published before the reveal', async function () {
  const m = await match({ settings: { rounds: 3 } });
  const names = [];
  for (let k = 0; k < 3; k++) {
    await m.open();
    const s = m.secret();
    names.push(s.name, s.target);
    const before = m.views.length;
    const g = m.lr();
    assert(String(g.round.cells).indexOf(s.letters.join('')) === -1, 'the slots are masked');
    await m.answer('p1', m.answerText());
    await m.answer('p2', 'nothing');
    const during = m.views.slice(0, before).concat(m.views.slice(before).filter((v) => JSON.parse(v).phase !== 'reveal' && JSON.parse(v).phase !== 'ended'));
    during.forEach((v) => {
      const k = JSON.parse(v).k;
      if (k !== m.lr().k) return;
      assert(v.indexOf('"' + s.name + '"') === -1 && v.indexOf(s.target) === -1, 'name leaked while open: ' + v.slice(0, 200));
    });
    assertEqual(m.lr().reveal.name, s.name, 'the reveal names the brand');
  }
});

test('logorush referee: answers are checked, timed and scored on the server; results show together', async function () {
  const m = await match();
  await m.open();
  await m.clock.advance(5000);
  await m.answer('p1', m.answerText());
  assertEqual(m.lr().p.p1.inK, 0, 'p1 has answered');
  assert(!m.lr().p.p1.last, 'but nobody sees how p1 did yet');
  assertEqual(m.lr().phase, 'open', 'still waiting for p2');
  await m.answer('p2', 'Atlantis Airways');
  const g = m.lr();
  assertEqual(g.phase, 'reveal', 'everyone in: reveal straight away');
  assert(g.p.p1.last.ok && !g.p.p2.last.ok);
  const want = m.R.points({ level: 'normal', ok: true, ms: 5001, secs: 20, mode: 'tiles', twist: 'none' }).total;
  assertEqual(g.p.p1.score, want, 'timed from when the logo opened');
  assertEqual(g.p.p2.score, 0);
});

test('logorush referee: one answer per round; early answers, replays, wrong rounds and other matches do nothing', async function () {
  const m = await match({ players: 3 });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  assertEqual(m.lr().phase, 'ready');
  await m.answer('p1', m.answerText());
  assertEqual(m.lr().p.p1.inK, -1, 'an answer before the logo opens is refused');
  await m.open();
  await m.answer('p1', 'wrong');
  await m.answer('p1', m.answerText());
  await m.answer('p2', m.answerText(), { k: 4 });
  await m.answer('p2', m.answerText(), { matchId: 'l_other' });
  await m.answer('p3', m.answerText(), { t: m.clock.now - 60000 });
  assertEqual(m.lr().p.p2.inK, -1, 'wrong round and wrong match are refused');
  assertEqual(m.lr().p.p3.inK, -1, 'an answer stamped before the round opened is refused');
  await m.answer('p2', m.answerText());
  await m.answer('p3', m.answerText());
  assert(!m.lr().p.p1.last.ok, 'only p1\'s first answer counted');
  assert(m.lr().p.p2.last.ok);
});

test('logorush referee: half-delivered commands wait until they are whole', async function () {
  const m = await match();
  await m.open();
  const g = m.lr();
  await m.room.set('lrInbox/p1/half', { type: 'answer', matchId: g.matchId, k: g.k, text: m.answerText() });
  await flush();
  assertEqual(m.lr().p.p1.inK, -1, 'no t yet: skipped');
  await m.room.update('lrInbox/p1/half', { t: m.clock.now });
  await flush();
  assertEqual(m.lr().p.p1.inK, 0, 'whole now: taken');
});

test('logorush referee: time runs out, a late answer scores nothing, then the next logo', async function () {
  const m = await match();
  await m.open();
  const g = m.lr();
  await m.answer('p1', m.answerText());
  await m.clock.advance(g.closeAt - m.clock.now + m.RF.GRACE_MS + 5);
  assertEqual(m.lr().phase, 'reveal');
  await m.answer('p2', 'anything', { k: 0 });
  assertEqual(m.lr().p.p2.score, 0, 'too late');
  assert(m.lr().p.p2.last && !m.lr().p.p2.last.ok, 'a timeout shows as not right');
  const first = m.lr().round.id;
  await m.open();
  assertEqual(m.lr().k, 1);
  assert(m.lr().round.id !== first, 'a new logo');
});

test('logorush referee: the match ends ranked, ties go to the faster total, and it reports', async function () {
  const m = await match({ settings: { rounds: 10, level: 'easy' } });
  for (let k = 0; k < m.lr().total; k++) {
    await m.open();
    await m.answer('p1', m.answerText());
    await m.answer('p2', k === 2 ? 'nope' : m.answerText());
  }
  await m.clock.advance(m.R.REVEAL_MS + 10);
  const g = m.lr();
  assertEqual(g.phase, 'ended');
  assertEqual(g.p.p1.right, 10);
  assertEqual(g.p.p2.right, 9);
  assertEqual(g.result.winners.join(), 'p1');
  assertEqual(g.result.rows[0].uid, 'p1');
  const meta = m.meta();
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.gameId, 'logoRush');
  assertEqual(meta.results.ranked[0].uid, 'p1');
  const rep = m.reports.filter((r) => r.e === 'logorush');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(), 'p1');
});

test('logorush referee: equal points rank the faster player first', async function () {
  const m = await match({ settings: { rounds: 10, time: 'none' } });
  assertEqual(m.lr().settings.time, 'normal', 'rooms always have a clock');
  const m2 = await match({ settings: { rounds: 10, mode: 'choice', level: 'easy' } });
  for (let k = 0; k < m2.lr().total; k++) {
    await m2.open();
    await m2.answer('p2', m2.answerText());
    await m2.clock.advance(1000);
    await m2.answer('p1', m2.answerText());
  }
  await m2.clock.advance(m2.R.REVEAL_MS + 10);
  const rows = m2.lr().result.rows;
  assertEqual(rows[0].uid, 'p2', 'p2 answered faster every time');
});

test('logorush referee: when a player leaves the others do not wait, and the leaver is still ranked', async function () {
  const m = await match({ players: 3, settings: { rounds: 10 } });
  await m.open();
  await m.room.update('players/p3', { online: false });
  await flush();
  await m.answer('p1', m.answerText());
  await m.answer('p2', m.answerText());
  assertEqual(m.lr().phase, 'reveal');
  for (let k = 1; k < m.lr().total; k++) {
    await m.open();
    await m.answer('p1', m.answerText());
    await m.answer('p2', 'x');
  }
  await m.clock.advance(m.R.REVEAL_MS + 10);
  const rows = m.lr().result.rows;
  assertEqual(rows.length, 3);
  assertEqual(rows[2].uid, 'p3');
});

test('logorush referee: multiple choice publishes the picks, not tiles, and shows the name picked', async function () {
  const m = await match({ settings: { mode: 'choice', level: 'hard' } });
  await m.open();
  const g = m.lr();
  const list = String(g.round.choices).split(',');
  assertEqual(list.length, 8);
  assert(!g.round.tiles && !g.round.cells, 'no letters to spell');
  const wrong = list.filter((c) => c !== m.secret().id)[0];
  await m.clock.advance(2000);
  await m.answer('p1', m.secret().id);
  await m.answer('p2', wrong);
  const r = m.lr();
  assertEqual(r.phase, 'reveal');
  assert(r.p.p1.last.ok && r.p.p1.score > 0, 'the right pick scores');
  assert(!r.p.p2.last.ok && r.p.p2.score === 0);
  assertEqual(r.p.p2.last.text, m.R.brand(wrong).name, 'the results show the name picked');
});

test('logorush referee: a restarted referee carries on from the saved state with the same logos', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', m.answerText());
  const id0 = m.lr().round.id;
  const saved = m.saved;
  m.ref.stop();
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await flush();
  assertEqual(m.lr().round.id, id0, 'the same round');
  assertEqual(m.lr().p.p1.inK, 0, 'p1\'s answer is kept');
  await m.answer('p2', m.answerText());
  assertEqual(m.lr().phase, 'reveal');
  again.stop();
});

test('logorush: the inbox rule, the lists that name online games, and the runner know the game', function () {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '..', '..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const room = JSON.parse(read('database.rules.json')).rules.rooms.$code;
  assertEqual(room.lr, undefined, 'rooms/$code/lr is server-only');
  const inbox = room.lrInbox.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('lr'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assert(/child\('lr'\)\.child\('matchId'\)/.test(inbox.matchId['.validate']), 'this match only');
  assert(/child\('lr'\)\.child\('k'\)/.test(inbox.k['.validate']), 'this round only');
  assertEqual(inbox.text['.validate'], 'newData.isString() && newData.val().length <= 60');
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  const keys = Object.keys(room);
  assertEqual(keys.indexOf('lrInbox'), keys.indexOf('cwInbox') + 1, 'right after cwInbox');
  assert(/'logoRush'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(read('js/net/roomUI.js'))[1]), 'roomUI ONLINE_GAMES');
  assert(/'logoRush'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(read('api/lib/Crew.php'))[1]), 'Crew::ONLINE_GAMES');
  const loader = read('api/crew/lib/loader.js');
  ['js/data/logos.js', 'js/logorush/rules.js', 'js/logorush/referee.js'].forEach((f) => assert(loader.indexOf("'" + f + "'") !== -1, 'the runner loads ' + f));
  const runner = read('api/crew/runner.js');
  assert(/logorushRuns/.test(runner) && /LogoRushReferee/.test(runner) && /logorushState/.test(runner) && /dropLogorush/.test(runner), 'the runner referees logorushRuns');
});

/* ---------- the phone's client ---------- */

async function phone(m, uid) {
  const FF = loadFF(FILES.concat(['js/logorush/client.js']));
  const T = FF.Transport.dev({ bus: m.bus, root: 'rooms/ROOM01' });
  await T.connect();
  T.serverNow = () => m.clock.now;
  let changes = 0;
  const c = FF.LogoRushClient.create({ room: { transport: T, uid, code: 'ROOM01' }, onChange: () => { changes++; } });
  await flush();
  return { FF, c, changes: () => changes };
}

test('logorush client: one answer per logo, sent only while it is open, and the referee takes it', async function () {
  const m = await match();
  const a = await phone(m, 'p1');
  const b = await phone(m, 'p2');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  assertEqual(a.c.view().lr.phase, 'ready');
  assertEqual(a.c.send(m.answerText()), false, 'not before the clock starts');
  await m.open();
  assert(a.c.view().seated && a.c.view().me, 'p1 is seated');
  assertEqual(a.c.send(m.answerText()), true);
  assertEqual(a.c.send('again'), false, 'one answer per logo');
  await flush();
  assertEqual(m.lr().p.p1.inK, 0, 'the referee took it');
  assertEqual(b.c.send('Nobody Knows'), true);
  await flush();
  assertEqual(m.lr().phase, 'reveal');
  assert(m.lr().p.p1.last.ok && !m.lr().p.p2.last.ok);
  assertEqual(a.c.send('late'), false, 'not after the reveal');
  assert(a.changes() > 0, 'the screen hears about changes');
  a.c.stop();
  b.c.stop();
});

test('logorush client: a phase is drawn only once its round has arrived in full', async function () {
  const m = await match();
  const { FF } = await phone(m, 'p1');
  const C = FF.LogoRushClient;
  const copy = () => C.tidy(JSON.parse(JSON.stringify(m.lr())));
  assert(C.ready(copy()), 'starting is ready');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  assert(C.ready(copy()), 'a full ready view is ready');
  for (const field of ['id', 'cells', 'tiles', 'seconds']) {
    const v = copy();
    delete v.round[field];
    assert(!C.ready(v), 'ready without ' + field + ' is not');
  }
  const stale = copy();
  stale.round.k = stale.k - 1;
  assert(!C.ready(stale), 'last round\'s logo is not this one');
  await m.open();
  assert(C.ready(copy()), 'open is ready');
  await m.answer('p1', m.answerText());
  await m.answer('p2', m.answerText());
  assert(C.ready(copy()), 'a full reveal is ready');
  const rev = copy();
  delete rev.reveal;
  assert(!C.ready(rev), 'a reveal without the name is not');
  assert(!C.ready(null) && !C.ready({}));
  const ch = await match({ settings: { mode: 'choice' } });
  await ch.open();
  const v = C.tidy(JSON.parse(JSON.stringify(ch.lr())));
  assert(C.ready(v) && Array.isArray(v.round.choices) && v.round.choices.length === 6, 'choices come back as a list');
  delete v.round.choices;
  assert(!C.ready(v), 'choice round without its choices is not ready');
});
