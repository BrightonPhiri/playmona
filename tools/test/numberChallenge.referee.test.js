'use strict';
/* Number Challenge online Race: whole matches refereed by js/numberchallenge/referee.js over
   the app's dev transport with a hand-moved clock — secret seed, answers never published before
   the reveal, chain steps one at a time, target steps replayed, sprint answers in order and
   inside each player's own clock, one answer per item, the final ranking. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/numberchallenge/rules.js', 'js/net/transport.js', 'js/numberchallenge/referee.js'];

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
  const R = FF.NumberChallengeRules;
  const RF = FF.NumberChallengeReferee;
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(1000000);
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
  if (!opts.bus) await room.set('', { meta: { seed: 's', status: 'playing', hostUid: 'p1', startAt: clock.now + 1000 }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const views = [];
  bus.subscribe(() => { const v = bus.read('rooms/' + code); if (v && v.nc) views.push(JSON.stringify(v.nc)); });
  const run = opts.run || { matchId: 'n_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({}, opts.settings || {}) };
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
    nc: () => bus.read('rooms/' + code).nc || null,
    meta: () => bus.read('rooms/' + code).meta,
    /* The secret item, worked out from the referee's own saved state (tests only). */
    item: (k) => {
      const s = m.saved.value;
      const kk = k == null ? Math.max(0, m.nc().k) : k;
      return R.deal(s.settings, s.seed).items[kk];
    },
    async open() {
      const g = m.nc();
      const due = g.phase === 'starting' ? g.readyAt + RF.READY_MS + R.STEP_MS.fast * 12
        : g.phase === 'ready' || g.phase === 'steps' ? g.openAt
          : g.phase === 'reveal' ? g.nextAt + RF.READY_MS + R.STEP_MS.steady * 9 : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      if (m.nc().phase !== 'open') await clock.advance(Math.max(0, m.nc().openAt - clock.now) + 1);
      assertEqual(m.nc().phase, 'open');
    },
    async answer(uid, text, over) {
      const g = m.nc();
      const cmd = Object.assign({ matchId: g.matchId, k: g.k, text, t: clock.now }, over || {});
      await room.set('ncInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    }
  };
  return m;
}

const wrongOf = (item) => String(item.answer + 1);

test('nc referee: the seed stays secret; a quick sum is published ready, then opened', async function () {
  const m = await match();
  const g0 = m.nc();
  assertEqual(g0.phase, 'starting');
  assert(!g0.round, 'no sum before the first round');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.nc();
  assertEqual([g.phase, g.k, g.total], ['ready', 0, 10]);
  assertEqual(g.round.text, m.item().text);
  assertEqual(g.round.choices.split('|').length, 4);
  assert(!('answer' in g.round) && JSON.stringify(g).indexOf(m.saved.value.seed) === -1, 'no answer and no seed in the view');
  assertEqual(g.settings.mode, 'quick');
  assertEqual(g.closeAt, g.openAt + m.R.secondsFor(g.settings, m.item()) * 1000);
  await m.open();
});

test('nc referee: a right answer scores by speed, a wrong one 0, results come together', async function () {
  const m = await match();
  await m.open();
  const item = m.item();
  const g = m.nc();
  await m.clock.advance(1500 - (m.clock.now - g.openAt));
  await m.answer('p1', String(item.answer));
  assertEqual(m.nc().phase, 'open', 'still waiting for p2');
  assert(!m.nc().last, 'no results until everyone is in');
  assertEqual(m.nc().p.p1.inK, 0, 'p1 has a tick');
  await m.answer('p2', wrongOf(item));
  const v = m.nc();
  assertEqual(v.phase, 'reveal');
  const want = m.R.judge(v.settings, item, String(item.answer), 1500).points;
  assertEqual([v.last.results.p1.right, v.last.results.p1.points, v.last.results.p2.right, v.last.results.p2.points], [true, want, false, 0]);
  assertEqual(v.last.answer, item.answer);
  assertEqual([v.p.p1.score, v.p.p1.streak, v.p.p2.score], [want, 1, 0]);
});

test('nc referee: one answer per item; early, late, other items and other matches do nothing', async function () {
  const m = await match({ players: 3 });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const item = m.item();
  await m.answer('p1', String(item.answer));                       // while ready
  await m.open();
  assertEqual(m.nc().p.p1.inK, -1, 'an answer before the clock opened is dropped');
  await m.answer('p1', String(item.answer), { matchId: 'other' });
  await m.answer('p1', String(item.answer), { k: 3 });
  await m.answer('p1', String(item.answer), { t: m.nc().openAt - 5 });
  assertEqual(m.nc().p.p1.inK, -1, 'other match, other item, sent before the open');
  await m.answer('p1', wrongOf(item));
  await m.answer('p1', String(item.answer));
  await m.answer('p2', String(item.answer), { t: m.clock.now + 999999 });
  assertEqual(m.nc().p.p2.inK, 0, 'a time from the future is read as now');
  await m.clock.advance(m.nc().closeAt + m.RF.GRACE_MS + 1 - m.clock.now);
  await m.answer('p3', String(item.answer));
  const v = m.nc();
  assertEqual(v.phase, 'reveal');
  assertEqual([v.last.results.p1.right, v.last.results.p1.text], [false, wrongOf(item)], 'the first answer stands');
  assertEqual([v.last.results.p2.answered, v.last.results.p3.answered], [true, false], 'p3 arrived after the clock');
});

test('nc referee: chain steps are published one at a time, never ahead', async function () {
  const m = await match({ settings: { mode: 'chain', level: 'normal', rounds: 5, speed: 'fast' } });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.nc();
  const item = m.item();
  assertEqual([g.phase, g.round.start, g.round.shown, g.round.steps], ['steps', item.start, 0, item.steps.length]);
  const stepMs = m.R.STEP_MS.fast;
  const seen = [];
  for (let i = 1; i <= item.steps.length; i++) {
    await m.clock.advance(stepMs - 2);
    assertEqual(m.nc().round.shown, i - 1, 'not ahead of the clock');
    await m.clock.advance(2);
    const r = m.nc().round;
    seen.push(r.shown);
    assertEqual([r.step.op, r.step.n == null ? null : r.step.n], [item.steps[i - 1].op, item.steps[i - 1].n == null ? null : item.steps[i - 1].n]);
    assert(!r.choices, 'no choices until the steps are done');
  }
  assertEqual(seen, item.steps.map((s, i) => i + 1));
  await m.clock.advance(stepMs);
  const v = m.nc();
  assertEqual(v.phase, 'open');
  assertEqual(v.round.choices.split('|').map(Number).indexOf(item.answer) !== -1, true);
  m.views.forEach((s) => {
    const r = JSON.parse(s).round;
    if (r && r.k === 0) assert(!('answer' in r) && !('values' in r), 'no running totals in the view');
  });
  await m.answer('p1', String(item.answer));
  await m.answer('p2', wrongOf(item));
  assertEqual(m.nc().last.results.p1.right, true);
});

test('nc referee: target steps are replayed; a tile the player never had scores 0', async function () {
  const m = await match({ settings: { mode: 'target', level: 'hard', rounds: 3 } });
  await m.open();
  const item = m.item();
  const r = m.nc().round;
  assertEqual([r.tiles, r.target, r.ops], [item.tiles.join(','), item.target, item.ops.join('')]);
  assert(!('solution' in r), 'the way is secret');
  const best = m.R.solveTarget(item.tiles, item.target, item.ops, {});
  await m.answer('p1', m.R.submitText(best.steps, best.value));
  await m.answer('p2', '99*99;9801');
  const v = m.nc();
  assertEqual(v.phase, 'reveal');
  assertEqual(v.last.results.p1.points, m.R.judge(v.settings, item, m.R.submitText(best.steps, best.value), v.last.results.p1.ms).points);
  assert(v.last.results.p1.points > 0, 'the real way scores');
  assertEqual([v.last.results.p2.points, v.last.results.p2.right], [0, false]);
  assertEqual(v.last.solution, item.solution);
});

test('nc referee: sprint answers count only in order and before the player\'s own end; the referee\'s score stands', async function () {
  const m = await match({ settings: { mode: 'sprint', level: 'easy', sprint: 30 } });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.nc();
  assertEqual([g.phase, g.total, g.round.list.length], ['ready', 1, m.R.SPRINT_LIST]);
  assert(g.round.list.every((x) => !('answer' in x)), 'no answers in the list');
  await m.open();
  const items = m.R.deal(m.saved.value.settings, m.saved.value.seed).items;
  const a = (i) => i + ':' + items[i].answer;
  await m.answer('p1', [a(0), '1:' + (items[1].answer + 1), a(2)].join(','));
  let p = m.nc().p.p1;
  assertEqual([p.right, p.wrong, p.at], [2, 1, 3]);
  const st = m.R.sprintCreate(m.nc().settings, m.nc().openAt);
  m.R.sprintAnswer(st, items, String(items[0].answer), m.clock.now);
  m.R.sprintAnswer(st, items, String(items[1].answer + 1), m.clock.now);
  m.R.sprintAnswer(st, items, String(items[2].answer), m.clock.now);
  assertEqual([p.score, p.end], [st.score, m.nc().openAt + 30000 - 2000], 'a miss takes 2 s off Easy');
  await m.answer('p1', a(5));
  assertEqual(m.nc().p.p1.at, 3, 'out of order is ignored');
  await m.clock.advance(p.end + m.RF.GRACE_MS + 10 - m.clock.now);
  assertEqual(m.nc().phase, 'open', 'the room clock still runs');
  await m.answer('p1', a(3));
  assertEqual(m.nc().p.p1.at, 3, 'after the player\'s own end is ignored');
  await m.answer('p2', a(0) + ',' + a(1));
  await m.clock.advance(m.nc().closeAt + m.RF.GRACE_MS + 1 - m.clock.now);
  const v = m.nc();
  assertEqual(v.phase, 'reveal');
  assertEqual([v.last.results.p1.points, v.last.results.p1.right, v.last.results.p2.right], [st.score, 2, 2]);
});

test('nc referee: the match ends ranked and reports', async function () {
  const m = await match({ settings: { mode: 'target', level: 'easy', rounds: 3 } });
  for (let k = 0; k < 3; k++) {
    await m.open();
    const item = m.item();
    const best = m.R.solveTarget(item.tiles, item.target, item.ops, {});
    await m.answer('p1', m.R.submitText(best.steps, best.value));
    await m.answer('p2', '');
    assertEqual(m.nc().phase, 'reveal');
  }
  await m.clock.advance(m.nc().nextAt - m.clock.now + 1);
  const v = m.nc();
  assertEqual(v.phase, 'ended');
  assertEqual(v.result.rows.map((r) => [r.uid, r.place]), [['p1', 1], ['p2', 2]]);
  assertEqual(v.result.winners, ['p1']);
  assertEqual(m.meta().status, 'ended');
  assertEqual(m.meta().results.gameId, 'numberChallenge');
  assertEqual(m.reports.length, 1);
  assertEqual(m.reports[0].e, 'numberchallenge');
  assertEqual(m.reports[0].p.seats[0].won, true);
  assert(!m.nc().round, 'no round once ended');
});

test('nc referee: a restarted referee carries on from saved state', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', String(m.item().answer));
  await m.answer('p2', String(m.item().answer));
  await m.open();
  assertEqual(m.nc().k, 1);
  m.ref.stop();
  const m2 = await match({ bus: m.bus, clock: m.clock, saved: m.saved, run: m.run });
  assertEqual([m2.nc().phase, m2.nc().k], ['open', 1]);
  assertEqual(m2.nc().p.p1.score, m.nc().p.p1.score);
  await m2.answer('p1', String(m2.item().answer));
  await m2.answer('p2', String(m2.item().answer));
  assertEqual([m2.nc().phase, m2.nc().p.p1.streak], ['reveal', 2]);
});
