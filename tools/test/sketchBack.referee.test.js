'use strict';
/* SketchBack online: whole matches refereed by js/sketchback/referee.js over the app's dev
   transport with a hand-moved clock — a secret seed, one object at a time and never the
   next one, no names while players name their drawings, drawings and answers taken once,
   the naming clock, the ranking, everyone's drawings at the end — and the phone client
   (js/sketchback/client.js). */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/answerMatch.js', 'js/data/sketches.js', 'js/sketchback/rules.js',
  'js/net/transport.js', 'js/sketchback/referee.js'];

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
  const R = FF.SketchBackRules;
  const RF = FF.SketchBackReferee;
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
  bus.subscribe(() => { const v = bus.read('rooms/' + code); if (v && v.skb) views.push(JSON.stringify(v.skb)); });
  const run = { matchId: 'k_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({ count: 5, level: 'hard' }, opts.settings || {}) };
  const ref = RF.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(42), timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    FF, R, RF, bus, clock, room, ref, seats, saved, reports, run, views, code,
    skb: () => bus.read('rooms/' + code).skb || null,
    meta: () => bus.read('rooms/' + code).meta,
    /* The secret deal, worked out from the referee's own saved state (tests only). */
    deal: () => R.deal(m.saved.value.settings, m.saved.value.seed),
    async to(ms) { await clock.advance(Math.max(0, ms - clock.now) + 1); },
    /* Run the drawing part through to the naming. */
    async toRecall() {
      for (let i = 0; i < 40 && m.skb().phase !== 'recall'; i++) {
        const g = m.skb();
        await m.to(g.phase === 'starting' ? g.drawAt : g.phase === 'draw' ? g.closeAt : g.drawAt || g.recallAt);
      }
      assertEqual(m.skb().phase, 'recall');
    },
    async send(uid, cmd) {
      await room.set('skbInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    },
    async drawings(uid, list, over) {
      const g = m.skb();
      await m.send(uid, Object.assign({ type: 'drawings', matchId: g.matchId, art: list.join('|') }, over || {}));
    },
    async answers(uid, list, over) {
      const g = m.skb();
      await m.send(uid, Object.assign({ type: 'answers', matchId: g.matchId, text: list.join('|'), t: clock.now }, over || {}));
    }
  };
  return m;
}

const DOT = '1e,1e,2s,2s';   // a short line, encoded

test('sketchback referee: the seed stays secret; only the object being drawn is published', async function () {
  const m = await match();
  const deal = m.deal();
  assertEqual(deal.length, 5);
  assertEqual(m.skb().phase, 'starting');
  for (let k = 0; k < 5; k++) {
    await m.to(m.skb().phase === 'draw' ? m.skb().closeAt : m.skb().drawAt);
    if (m.skb().phase !== 'draw') await m.to(m.skb().drawAt);
    const g = m.skb();
    assertEqual(g.phase, 'draw');
    assertEqual(g.k, k);
    assertEqual(g.round.id, deal[k]);
    assertEqual(g.round.name, m.R.object(deal[k]).name);
    assertEqual(g.closeAt - g.drawAt, 4000, 'Hard is 4 seconds');
  }
  m.views.forEach((v) => {
    assert(v.indexOf(m.saved.value.seed) === -1, 'the seed is never published');
    const g = JSON.parse(v);
    if (g.phase === 'draw' || g.phase === 'gap') deal.slice(g.k + 1).forEach((id) => assert(v.indexOf('"' + id + '"') === -1, 'a later object ' + id + ' leaked at k ' + g.k));
  });
  m.ref.stop();
});

test('sketchback referee: no names or objects while players name their drawings', async function () {
  const m = await match();
  await m.toRecall();
  const g = m.skb();
  assertEqual(g.round, undefined, 'no round in the naming view');
  const text = JSON.stringify(g);
  m.deal().forEach((id) => assert(text.indexOf('"' + id + '"') === -1 && text.indexOf(m.R.object(id).name) === -1, id + ' shown while naming'));
  assertEqual(g.recallEnd - g.recallAt, m.R.RECALL_MS);
  m.ref.stop();
});

test('sketchback referee: drawings and answers are taken once; early, late, replayed and other-match commands do nothing', async function () {
  const m = await match();
  await m.to(m.skb().drawAt);
  await m.drawings('p1', [DOT, '', '', '', '']);
  assertEqual(m.skb().p.p1.drew, false, 'no drawings while drawing');
  await m.toRecall();
  await m.answers('p1', ['x', 'x', 'x', 'x', 'x'], { t: m.skb().recallAt - 5000 });
  assertEqual(m.skb().p.p1.named, false, 'answers sent before the naming opened');
  await m.drawings('p1', [DOT, DOT, '', '', '']);
  await m.drawings('p1', ['', '', '', '', '']);
  assertEqual(m.skb().p.p1.drew, true);
  assertEqual(m.saved.value.players.p1.art, [DOT, DOT, '', '', ''].join('|'), 'the first drawings stay');
  await m.drawings('p2', [DOT, '', '', '', ''], { matchId: 'k_other' });
  assertEqual(m.skb().p.p2.drew, false, 'another match');
  const deal = m.deal();
  await m.answers('p1', deal.map((id) => m.R.object(id).name));
  await m.answers('p1', ['a', 'b', 'c', 'd', 'e']);
  assertEqual(m.skb().p.p1.named, true);
  assertEqual(m.saved.value.players.p1.answers.join('|'), deal.map((id) => m.R.object(id).name).join('|'), 'one answers command (the button and the auto-send racing)');
  await m.to(m.skb().recallEnd + m.RF.GRACE_MS + 10);
  assertEqual(m.skb().phase, 'ended');
  await m.answers('p2', ['a', 'b', 'c', 'd', 'e']);
  assertEqual(m.skb().p.p2.named, false, 'too late');
  m.ref.stop();
});

test('sketchback referee: half-delivered commands wait until they are whole', async function () {
  const m = await match();
  await m.toRecall();
  const g = m.skb();
  await m.room.set('skbInbox/p1/half', { type: 'answers', matchId: g.matchId, text: 'cat|dog|a|b|c' });
  assertEqual(m.skb().p.p1.named, false, 'no t yet');
  await m.room.update('skbInbox/p1/half', { t: m.clock.now });
  await flush();
  assertEqual(m.skb().p.p1.named, true);
  m.ref.stop();
});

test('sketchback referee: naming ends early once everyone here has answered; a leaver is not waited for', async function () {
  const m = await match({ players: 3 });
  await m.toRecall();
  await m.room.update('players/p3', { online: false });
  await flush();
  await m.answers('p1', ['a', 'b', 'c', 'd', 'e']);
  assertEqual(m.skb().phase, 'recall', 'p2 still naming');
  await m.answers('p2', ['a', 'b', 'c', 'd', 'e']);
  assertEqual(m.skb().phase, 'ended');
  assertEqual(m.skb().result.rows.length, 3, 'the leaver is still ranked');
  m.ref.stop();
});

test('sketchback referee: the clock ends the naming; what was sent counts, silence scores 0', async function () {
  const m = await match();
  await m.toRecall();
  const deal = m.deal();
  await m.answers('p1', [m.R.object(deal[0]).name, '', '', '', '']);
  await m.to(m.skb().recallEnd + m.RF.GRACE_MS);
  const g = m.skb();
  assertEqual(g.phase, 'ended');
  const rows = g.result.rows;
  assertEqual(rows[0].uid, 'p1');
  assertEqual(rows[0].correct, 1);
  assertEqual(rows[0].points, 100);
  assertEqual(rows[1].points, 0);
  m.ref.stop();
});

test('sketchback referee: ranked by right answers, then the faster naming; results, art and the report', async function () {
  const m = await match({ players: 3 });
  await m.toRecall();
  const names = m.deal().map((id) => m.R.object(id).name);
  await m.drawings('p1', [DOT, DOT, DOT, '', '']);
  await m.drawings('p2', [DOT, '', '', '', '']);
  await m.clock.advance(5000);
  await m.answers('p2', names.slice(0, 3).concat(['nope', 'nope']));
  await m.clock.advance(5000);
  await m.answers('p1', names.slice(0, 3).concat(['nope', 'nope']));
  await m.answers('p3', names.map((n) => n.toUpperCase()));
  const g = m.skb();
  assertEqual(g.phase, 'ended');
  const rows = g.result.rows;
  assertEqual(rows.map((r) => r.uid).join(','), 'p3,p2,p1', 'p3 got all; p2 named as many as p1, faster');
  assertEqual(rows.map((r) => r.place).join(','), '1,2,3');
  assertEqual(rows[0].points, 500);
  assertEqual(g.result.deal.join(','), m.deal().join(','), 'the deal is shown at the end');
  assertEqual(g.result.answers.p2[0], names[0]);
  assertEqual(g.result.ok.p1.join(','), 'true,true,true,false,false');
  assertEqual(g.result.art.p1, [DOT, DOT, DOT, '', ''].join('|'));
  assertEqual(g.result.art.p3 || '', '', 'no drawings sent: none shown');
  const meta = m.meta();
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.gameId, 'sketchBack');
  assertEqual(meta.results.ranked[0].id, 'p3');
  assertEqual(meta.results.ranked[0].correct, 5);
  const rep = m.reports.filter((r) => r.e === 'sketchback');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(','), 'p3');
  m.ref.stop();
});

test('sketchback referee: a restarted referee carries on from the saved state with the same objects', async function () {
  const m = await match();
  await m.to(m.skb().drawAt);
  await m.to(m.skb().closeAt);
  await m.to(m.skb().drawAt);
  const g = m.skb();
  assertEqual(g.k, 1);
  m.ref.stop();
  const again = m.RF.create({ run: m.run, room: m.room, store: { load: () => Promise.resolve(m.saved.value), save: (s) => { m.saved.value = s; return Promise.resolve(); } }, randomInt: seeded(7), timers: m.clock });
  await again.start();
  await flush();
  assertEqual(m.skb().k, 1);
  assertEqual(m.skb().round.id, g.round.id, 'the same object');
  await m.to(m.skb().closeAt);
  await m.to(m.skb().drawAt);
  assertEqual(m.skb().round.id, m.deal()[2]);
  again.stop();
});

/* ---------- the phone's client ---------- */

async function phone(m, uid) {
  const FF = loadFF(FILES.concat(['js/sketchback/client.js']));
  const T = FF.Transport.dev({ bus: m.bus, root: 'rooms/ROOM01' });
  await T.connect();
  T.serverNow = () => m.clock.now;
  let changes = 0;
  const c = FF.SketchBackClient.create({ room: { transport: T, uid, code: 'ROOM01' }, onChange: () => { changes++; } });
  await flush();
  return { FF, c, changes: () => changes };
}

test('sketchback client: drawings and answers go once, only when the referee takes them', async function () {
  const m = await match();
  const a = await phone(m, 'p1');
  await m.to(m.skb().drawAt);
  assertEqual(a.c.sendDrawings([DOT]), false, 'not while drawing');
  assertEqual(a.c.sendAnswers(['cat']), false, 'not while drawing');
  await m.toRecall();
  assertEqual(a.c.sendDrawings([DOT, '', '', '', '']), true);
  assertEqual(a.c.sendDrawings([DOT, '', '', '', '']), false, 'once');
  assertEqual(a.c.sendAnswers(['a|b', 'b', 'c', 'd', 'e']), true);
  assertEqual(a.c.sendAnswers(['a', 'b', 'c', 'd', 'e']), false, 'once');
  await flush();
  assertEqual(m.skb().p.p1.drew, true);
  assertEqual(m.skb().p.p1.named, true);
  assertEqual(m.saved.value.players.p1.answers[0], 'a b', 'a | in an answer cannot split it');
  assert(a.changes() > 0, 'the screen hears about changes');
  a.c.stop();
  m.ref.stop();
});

test('sketchback client: a phase is drawn only once it has arrived in full', async function () {
  const m = await match();
  const { FF } = await phone(m, 'p1');
  const C = FF.SketchBackClient;
  const copy = () => C.tidy(JSON.parse(JSON.stringify(m.skb())));
  assert(C.ready(copy()), 'starting is ready');
  await m.to(m.skb().drawAt);
  assert(C.ready(copy()), 'a full draw view is ready');
  for (const field of ['id', 'name']) {
    const v = copy();
    delete v.round[field];
    assert(!C.ready(v), 'draw without ' + field + ' is not');
  }
  const stale = copy();
  stale.round.k = stale.k - 1;
  assert(!C.ready(stale), 'last object is not this one');
  await m.toRecall();
  assert(C.ready(copy()), 'recall is ready');
  const rc = copy();
  delete rc.recallEnd;
  assert(!C.ready(rc), 'recall without its end is not');
  await m.answers('p1', ['a', 'b', 'c', 'd', 'e']);
  await m.answers('p2', ['a', 'b', 'c', 'd', 'e']);
  const end = copy();
  assert(C.ready(end) && Array.isArray(end.result.rows) && Array.isArray(end.result.deal), 'ended, lists back');
  assert(Array.isArray(end.result.ok.p1), 'ok lists back');
  delete end.result.deal;
  assert(!C.ready(end), 'ended without the deal is not');
  assert(!C.ready(null) && !C.ready({}));
  m.ref.stop();
});
