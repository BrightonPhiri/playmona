'use strict';
/* Say What? online Race: whole matches refereed by js/saywhat/referee.js over the app's dev
   transport with a hand-moved clock — secret seed, the gap words never published before the
   reveal, answers checked, timed and scored on the server (with its own streaks), one answer
   per round, late and early answers, the final ranking. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/sayings.js', 'js/saywhat/rules.js',
  'js/net/transport.js', 'js/saywhat/referee.js'];

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
  const R = FF.SayWhatRules;
  const RF = FF.SayWhatReferee;
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
  bus.subscribe(() => { const v = bus.read('rooms/' + code); if (v && v.sw) views.push(JSON.stringify(v.sw)); });
  const run = { matchId: 'y_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({ level: 'normal', rounds: 10 }, opts.settings || {}) };
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
    sw: () => bus.read('rooms/' + code).sw || null,
    meta: () => bus.read('rooms/' + code).meta,
    /* The secret round, worked out from the referee's own saved state (tests only). */
    secret: (k) => {
      const s = m.saved.value;
      const items = R.deal(s.settings, s.seed, s.settings.rounds).items;
      const kk = k == null ? m.sw().k : k;
      return R.roundAt(s.settings, s.seed, kk, items[kk]);
    },
    right: () => m.secret().target,
    async open() {
      const g = m.sw();
      const due = g.phase === 'starting' ? g.readyAt + RF.READY_MS : g.phase === 'ready' ? g.openAt : g.phase === 'reveal' ? g.nextAt + RF.READY_MS : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      assertEqual(m.sw().phase, 'open');
    },
    async answer(uid, text, over) {
      const g = m.sw();
      const cmd = Object.assign({ matchId: g.matchId, k: g.k, text, t: clock.now }, over || {});
      await room.set('swInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    }
  };
  return m;
}

test('saywhat referee: the seed stays secret; a saying is published ready, then opened', async function () {
  const m = await match();
  const g0 = m.sw();
  assertEqual(g0.phase, 'starting');
  assert(!('seed' in g0) && !g0.round, 'no seed and no saying before the first round');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.sw();
  assertEqual(g.phase, 'ready');
  assertEqual(g.k, 0);
  assert(g.round && g.round.words && g.round.tiles && g.round.cells, 'the saying is published with its tiles');
  assert(JSON.stringify(g).indexOf(m.saved.value.seed) === -1, 'the seed is never in the view');
  assertEqual(g.settings.packs, 'mixed', 'rooms play mixed packs');
  assertEqual(g.closeAt, g.openAt + m.secret().seconds * 1000);
  await m.open();
});

test('saywhat referee: the view never holds a gap word before the reveal', async function () {
  const m = await match({ settings: { rounds: 10, level: 'hard' } });
  let twoSeen = false;
  for (let k = 0; k < 10; k++) {
    await m.open();
    const s = m.secret();
    if (s.two) twoSeen = true;
    const g = m.sw();
    assert(g.round.words.every((w) => typeof w === 'string' || (w.gap != null && w.len > 0)), 'gaps are placeholders');
    assert(String(g.round.cells).replace(/[_ ]/g, '') === String(g.round.cells).replace(/[A-Za-z0-9_ ]/g, ''), 'cells hold no letters');
    const before = m.views.length;
    await m.answer('p1', m.right());
    await m.answer('p2', 'nothing');
    const during = m.views.slice(0, before).concat(m.views.slice(before).filter((v) => JSON.parse(v).phase !== 'reveal' && JSON.parse(v).phase !== 'ended'));
    during.forEach((v) => {
      const p = JSON.parse(v);
      if (p.k !== k || !p.round) return;
      const shown = JSON.stringify({ words: p.round.words, cells: p.round.cells, p: p.p, reveal: p.reveal || null, last: p.last || null });
      s.gaps.forEach((word) => {
        assert(!new RegExp('\\b' + word + '\\b', 'i').test(shown), 'gap word "' + word + '" leaked while open: ' + shown.slice(0, 200));
      });
    });
    assertEqual(m.sw().last.target, s.target, 'the reveal shows the answer');
    assertEqual(m.sw().last.text, s.text, 'and the whole saying');
    assertEqual(m.sw().last.meaning, s.meaning, 'and its meaning');
  }
  assert(twoSeen, 'a hard room deals at least one two-gap saying in 10');
});

test('saywhat referee: a right answer scores by speed, a wrong one 0, results together', async function () {
  const m = await match();
  await m.open();
  await m.clock.advance(5000);
  await m.answer('p1', m.right());
  assertEqual(m.sw().p.p1.inK, 0, 'p1 has answered');
  assert(!m.sw().last, 'no results while others still answer');
  assertEqual(m.sw().phase, 'open', 'still waiting for p2');
  await m.answer('p2', 'zebra');
  const g = m.sw();
  assertEqual(g.phase, 'reveal', 'everyone in: reveal straight away');
  const s = m.secret();
  assert(g.last.results.p1.ok && !g.last.results.p2.ok);
  const want = m.R.points({ level: s.level, ok: true, ms: 5001, secs: s.seconds, two: s.two, streak: 1 }).total;
  assertEqual(g.p.p1.score, want, 'timed from when the saying opened');
  assertEqual(g.last.results.p1.points, want);
  assertEqual(g.p.p2.score, 0);
  assertEqual(g.last.results.p2.text, 'zebra', 'the results show what was sent');
});

test('saywhat referee: the streak bonus reaches +25 on the third right answer in a row', async function () {
  const m = await match({ settings: { rounds: 10 } });
  const got = [];
  for (let k = 0; k < 3; k++) {
    await m.open();
    await m.answer('p1', m.right());
    await m.answer('p2', 'x');
    got.push(m.sw().last.results.p1.bonus);
    assertEqual(m.sw().p.p1.streak, k + 1);
  }
  assertEqual(got.join(), '0,0,25');
  assertEqual(m.sw().p.p2.streak, 0);
  await m.open();
  await m.answer('p1', 'wrong');
  await m.answer('p2', 'x');
  assertEqual(m.sw().p.p1.streak, 0, 'a miss resets the streak');
});

test('saywhat referee: a two-gap answer needs both words', async function () {
  const m = await match({ settings: { rounds: 20, level: 'hard' } });
  let done = false;
  for (let k = 0; k < 20 && !done; k++) {
    await m.open();
    const s = m.secret();
    if (s.two) {
      await m.answer('p1', s.gaps[0]);
      await m.answer('p2', s.gaps[0] + ' ' + s.gaps[1]);
      const g = m.sw();
      assert(!g.last.results.p1.ok, 'one word of two is not right');
      assert(g.last.results.p2.ok, 'both words are');
      assert(g.p.p2.score >= 100 * 3 + 50 || g.p.p2.score >= 100 * 2 + 50, 'two-gap bonus counted');
      done = true;
    } else {
      await m.answer('p1', 'x');
      await m.answer('p2', 'x');
    }
  }
  assert(done, 'a hard room of 20 had a two-gap saying');
});

test('saywhat referee: one answer per round; early, late, other rounds and other matches do nothing', async function () {
  const m = await match({ players: 3 });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  assertEqual(m.sw().phase, 'ready');
  await m.answer('p1', m.right());
  assertEqual(m.sw().p.p1.inK, -1, 'an answer before the clock starts is refused');
  await m.open();
  await m.answer('p1', 'wrong');
  await m.answer('p1', m.right());
  await m.answer('p2', m.right(), { k: 4 });
  await m.answer('p2', m.right(), { matchId: 'y_other' });
  await m.answer('p3', m.right(), { t: m.clock.now - 60000 });
  assertEqual(m.sw().p.p2.inK, -1, 'wrong round and wrong match are refused');
  assertEqual(m.sw().p.p3.inK, -1, 'an answer stamped before the round opened is refused');
  await m.answer('p2', m.right());
  await m.answer('p3', m.right());
  assert(!m.sw().last.results.p1.ok, 'only p1\'s first answer counted');
  assert(m.sw().last.results.p2.ok);
});

test('saywhat referee: half-delivered commands wait until they are whole', async function () {
  const m = await match();
  await m.open();
  const g = m.sw();
  await m.room.set('swInbox/p1/half', { matchId: g.matchId, k: g.k, text: m.right() });
  await flush();
  assertEqual(m.sw().p.p1.inK, -1, 'no t yet: skipped');
  await m.room.update('swInbox/p1/half', { t: m.clock.now });
  await flush();
  assertEqual(m.sw().p.p1.inK, 0, 'whole now: taken');
});

test('saywhat referee: time runs out, a late answer scores nothing, then the next saying', async function () {
  const m = await match();
  await m.open();
  const g = m.sw();
  await m.answer('p1', m.right());
  await m.clock.advance(g.closeAt - m.clock.now + m.RF.GRACE_MS + 5);
  assertEqual(m.sw().phase, 'reveal');
  await m.answer('p2', m.secret().target, { k: 0 });
  assertEqual(m.sw().p.p2.score, 0, 'too late');
  assert(m.sw().last.results.p2 && !m.sw().last.results.p2.ok, 'a timeout shows as not right');
  const first = JSON.stringify(m.sw().round.words);
  await m.open();
  assertEqual(m.sw().k, 1);
  assert(JSON.stringify(m.sw().round.words) !== first, 'a new saying');
  assert(!m.sw().last, 'last round\'s results are gone while the next is open');
});

test('saywhat referee: the match ends ranked by points, ties by total time, and it reports', async function () {
  const m = await match({ settings: { rounds: 10, answer: 'choice' } });
  for (let k = 0; k < 10; k++) {
    await m.open();
    const g = m.sw();
    assertEqual(String(g.round.choices).split('|').length, 4, 'four picks');
    assert(!g.round.tiles && !g.round.cells, 'no letters to spell in a choice room');
    await m.answer('p2', m.right());
    await m.clock.advance(1000);
    await m.answer('p1', m.right());
  }
  await m.clock.advance(m.R.REVEAL_MS + 10);
  const g = m.sw();
  assertEqual(g.phase, 'ended');
  assertEqual(g.result.rows[0].uid, 'p2', 'same right answers, p2 faster: p2 ahead');
  assert(g.result.rows[0].points > g.result.rows[1].points, 'speed points split them');
  assertEqual(g.result.rows[0].place, 1);
  assertEqual(g.result.rows[1].place, 2);
  assertEqual(g.result.rows[0].best, 10, 'best streak');
  const meta = m.meta();
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.gameId, 'sayWhat');
  assertEqual(meta.results.ranked[0].uid, 'p2');
  const rep = m.reports.filter((r) => r.e === 'saywhat');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(), 'p2');
});

test('saywhat referee: equal points tie-break on total time', async function () {
  const { FF } = await match();
  const rank = FF.SayWhatReferee.rank;
  const rows = rank([
    { uid: 'a', points: 500, right: 3, best: 2, ms: 9000 },
    { uid: 'b', points: 500, right: 3, best: 3, ms: 4000 },
    { uid: 'c', points: 700, right: 4, best: 1, ms: 20000 },
    { uid: 'd', points: 500, right: 3, best: 3, ms: 4000 }
  ]);
  assertEqual(rows.map((r) => r.uid).join(), 'c,b,d,a');
  assertEqual(rows.map((r) => r.place).join(), '1,2,2,4');
});

test('saywhat referee: when a player leaves the others do not wait, and the leaver is still ranked', async function () {
  const m = await match({ players: 3 });
  await m.open();
  await m.room.update('players/p3', { online: false });
  await flush();
  await m.answer('p1', m.right());
  await m.answer('p2', m.right());
  assertEqual(m.sw().phase, 'reveal');
});

test('saywhat referee: a restarted referee carries on from the saved state with the same saying', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', m.right());
  const w0 = JSON.stringify(m.sw().round.words);
  const saved = m.saved;
  m.ref.stop();
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await flush();
  assertEqual(JSON.stringify(m.sw().round.words), w0, 'the same round');
  assertEqual(m.sw().p.p1.inK, 0, 'p1\'s answer is kept');
  await m.answer('p2', m.right());
  assertEqual(m.sw().phase, 'reveal');
  assert(m.sw().last.results.p1.ok, 'p1\'s kept answer still scores');
  again.stop();
});
