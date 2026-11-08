'use strict';
/* What's Missing? online: whole matches refereed by js/whatsmissing/referee.js over the app's
   dev transport with a hand-moved clock. The seed stays secret, the study board is hidden once
   answering opens, the answer is hidden until the reveal, answers are checked and timed by the
   server, one answer per round, the match ends ranked, and a restart carries on. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/data/memoryDecks.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/memoryAliases.js',
  'js/whatsmissing/rules.js', 'js/net/transport.js', 'js/whatsmissing/referee.js'];

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
  const R = FF.WhatsMissingRules;
  const RF = FF.WhatsMissingReferee;
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
  const run = { matchId: 'm_1', roomCode: code, seats, startAt: clock.now + 1000 - (opts.lateMs || 0), settings: Object.assign({ level: 'normal', rounds: 5 }, opts.settings || {}) };
  const ref = RF.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(42), timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    FF, R, RF, bus, clock, room, ref, seats, saved, reports, run,
    wm: () => bus.read('rooms/' + code).wm || null,
    meta: () => bus.read('rooms/' + code).meta,
    /* The server's own round, dealt from the saved secret seed. */
    truth: () => R.deal(m.saved.value.settings, m.saved.value.seed, m.wm().k),
    /* Wait until the next round's answers are open. */
    async open() {
      const g = m.wm();
      const study = g.settings.seconds * 1000 + RF.CHANGE_MS;
      const due = g.phase === 'starting' ? g.studyAt + study : g.phase === 'study' ? g.changeAt + RF.CHANGE_MS
        : g.phase === 'change' ? g.openAt : g.phase === 'reveal' ? g.nextAt + study : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      assertEqual(m.wm().phase, 'open');
    },
    /* The right answer to the current round, as a phone sends it. */
    right() {
      const rd = m.truth();
      if (rd.twist === 'added' || rd.twist === 'swapped') return { slots: rd.answer.slots.join(',') };
      if (rd.spell) return { text: rd.answer.ids.map((id) => R.cardOf(id).name).join('|') };
      return { picks: rd.answer.ids.join(',') };
    },
    wrong() {
      const rd = m.truth();
      if (rd.twist === 'added' || rd.twist === 'swapped') {
        const other = [0, 1, 2, 3].filter((s) => rd.answer.slots.indexOf(s) === -1).slice(0, rd.twist === 'added' ? 1 : 2);
        return { slots: other.join(',') };
      }
      if (rd.spell) return { text: rd.answer.ids.map(() => 'Zebraffe').join('|') };
      return { picks: rd.answer.ids.map(() => 'nope').join(',') };
    },
    async answer(uid, ans, over) {
      const g = m.wm();
      const cmd = Object.assign({ type: 'answer', matchId: g.matchId, k: g.k, t: clock.now }, ans, over || {});
      await room.set('wmInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    }
  };
  return m;
}

test('wm referee: seed secret, study then open', async function () {
  const m = await match();
  const g0 = m.wm();
  assertEqual(g0.phase, 'starting');
  assert(!g0.round, 'no board while starting');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.wm();
  assertEqual(g.phase, 'study');
  assertEqual(g.k, 0);
  assert(g.round && g.round.before, 'the study board is published');
  assert(!('after' in g.round) && !('answer' in g.round), 'no changed board and no answer while studying');
  assert(!g.round.twist, 'the twist is not told while studying');
  assertEqual(g.changeAt, g.studyAt + g.settings.seconds * 1000);
  assert(JSON.stringify(g).indexOf(m.saved.value.seed) === -1, 'the seed is never in the view');
  await m.open();
  const o = m.wm();
  assert(!('before' in o.round), 'the study board is gone once answering opens');
  assert(o.round.after && o.round.twist, 'the changed board and twist are there');
  assert(!('answer' in o.round), 'the answer stays hidden');
  const tr = m.truth();
  if (tr.twist === 'gone' || tr.twist === 'several') assertEqual(JSON.stringify(o.round.holes), JSON.stringify(tr.answer.slots), 'the gaps are shown (they are empty on the board)');
  else assert(!o.round.holes, 'no holes to show for a newcomer or a swap');
  assertEqual(o.closeAt, o.openAt + m.truth().secs * 1000);
  assert(JSON.stringify(o).indexOf(m.saved.value.seed) === -1, 'still no seed');
});

test('wm referee: answers scored on the server', async function () {
  const m = await match();
  await m.open();
  await m.clock.advance(4000);
  await m.answer('p1', m.right());
  assertEqual(m.wm().p.p1.inK, 0, 'p1 has answered');
  assert(!m.wm().p.p1.last, 'nobody sees how p1 did yet');
  assertEqual(m.wm().phase, 'open', 'still waiting for p2');
  await m.answer('p2', m.wrong());
  const g = m.wm();
  assertEqual(g.phase, 'reveal', 'both in: reveal early');
  assert(g.round.answer && g.round.before, 'the reveal shows the answer and the study board');
  assert(g.p.p1.last.ok && g.p.p1.last.pts > 0, 'p1 right with points');
  assert(!g.p.p2.last.ok);
  assertEqual(g.p.p2.score, 0);
  const rd = m.truth();
  const res = { ok: true, rightGaps: rd.answer.ids.length };
  const want = m.R.points({ round: rd, res, ms: 4001, secs: rd.secs, streak: 1 }).total;
  assertEqual(g.p.p1.score, want, 'timed from when answering opened');
});

test('wm referee: one answer per round', async function () {
  const m = await match({ players: 3 });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  await m.answer('p1', m.right());
  assertEqual(m.wm().p.p1.inK, -1, 'an answer while studying is refused');
  await m.open();
  await m.answer('p1', m.wrong());
  await m.answer('p1', m.right());
  await m.answer('p2', m.right(), { k: -1 });
  await m.answer('p2', m.right(), { matchId: 'm_other' });
  await m.answer('p3', m.right(), { t: m.clock.now - 60000 });
  assertEqual(m.wm().p.p2.inK, -1, 'an old round and another match are refused');
  assertEqual(m.wm().p.p3.inK, -1, 'an answer stamped before open is refused');
  await m.answer('p2', m.right());
  const g0 = m.wm();
  await m.clock.advance(g0.closeAt - m.clock.now + m.RF.GRACE_MS + 5);
  await m.answer('p3', m.right(), { k: 0 });
  const g = m.wm();
  assertEqual(g.phase, 'reveal');
  assert(!g.p.p1.last.ok, 'only the first answer from p1 counted');
  assert(g.p.p2.last.ok);
  assertEqual(g.p.p3.score, 0, 'an answer after the clock and grace scores nothing');
  assert(g.p.p3.last && !g.p.p3.last.ok, 'a timeout shows as not right');
});

test('wm referee: an answer within grace counts', async function () {
  const m = await match();
  await m.open();
  const g = m.wm();
  await m.answer('p1', m.right());
  await m.clock.advance(g.closeAt - m.clock.now + m.RF.GRACE_MS - 100);
  assertEqual(m.wm().phase, 'open');
  await m.answer('p2', m.right(), { t: g.closeAt + 200 });
  assert(m.wm().p.p2.last.ok, 'sent just after the clock, still counts');
});

test('wm referee: ends ranked and reports', async function () {
  const m = await match({ settings: { rounds: 5, level: 'easy' } });
  for (let k = 0; k < 5; k++) {
    await m.open();
    await m.answer('p1', m.right());
    await m.answer('p2', k === 2 ? m.wrong() : m.right());
  }
  await m.clock.advance(m.RF.REVEAL_MS + 10);
  const g = m.wm();
  assertEqual(g.phase, 'ended');
  assertEqual(g.p.p1.right, 5);
  assertEqual(g.p.p1.best, 5);
  const rows = g.result.rows;
  assertEqual(rows[0].uid, 'p1');
  assert(rows[0].points >= rows[1].points, 'rows sorted by score');
  assertEqual(g.result.winners.join(), 'p1');
  const meta = m.meta();
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.gameId, 'whatsMissing');
  assertEqual(meta.results.ranked[0].uid, 'p1');
  const rep = m.reports.filter((r) => r.e === 'whatsmissing');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(), 'p1');
});

test('wm referee: restart resumes with the same boards', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', m.right());
  const after0 = JSON.stringify(m.wm().round.after);
  m.ref.stop();
  const saved = m.saved;
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await flush();
  assertEqual(JSON.stringify(m.wm().round.after), after0, 'the same board');
  assertEqual(m.wm().p.p1.inK, 0, 'the answer from p1 is kept');
  await m.answer('p2', m.right());
  assertEqual(m.wm().phase, 'reveal');
  assert(m.wm().p.p2.last.ok);
  again.stop();
});

test('wm referee: refuses endless', async function () {
  const m = await match({ settings: { level: 'endless' } });
  assertEqual(m.wm().settings.level, 'normal');
});

test('wm referee: Expert publishes letter tiles, never the name', async function () {
  const m = await match({ settings: { level: 'expert', twists: 'gone' } });
  await m.open();
  const g = m.wm();
  const rd = m.truth();
  assert(g.round.spell && g.round.tiles, 'tiles for each gap');
  const name = m.R.cardOf(rd.answer.ids[0]).name;
  assert(JSON.stringify(g.round).toUpperCase().indexOf('"' + name.toUpperCase()) === -1, 'the name is not in the view');
  assert(!g.round.choices, 'no choices on Expert gone');
  await m.answer('p1', m.right());
  await m.answer('p2', { text: 'Zebraffe' });
  assert(m.wm().p.p1.last.ok, 'spelled right');
  assert(!m.wm().p.p2.last.ok);
});

test('wm client: answers travel as one string each and the view comes back as lists', async function () {
  const FF = loadFF(FILES.concat(['js/whatsmissing/client.js']));
  const C = FF.WhatsMissingClient;
  assertEqual(C.encode({ picks: ['cat', 'dog'] }).picks, 'cat,dog');
  assertEqual(C.encode({ text: ['Ice cream', 'a|b,c'] }).text, 'Ice cream|a b c');
  assertEqual(C.encode({ slots: [3, 7, 9] }).slots, '3,7');
  assertEqual(C.encode(null).picks, '');
  const m = await match();
  await m.open();
  const wm = C.tidy(JSON.parse(JSON.stringify(m.wm())));
  assertEqual(wm.round.after.length, wm.round.slots, 'every slot, empty ones as null');
  assert(wm.round.after.indexOf(null) !== -1 && wm.round.after.indexOf('') === -1);
  const rd = m.truth();
  const ans = rd.twist === 'gone' ? { picks: rd.answer.ids } : { slots: rd.answer.slots };
  await m.answer('p1', C.encode(ans));
  await m.answer('p2', C.encode({ picks: ['x'] }));
  assert(m.wm().p.p1.last.ok, 'an encoded right answer scores');
});

test('wm client: a phase is drawn only once its round has arrived in full', async function () {
  const FF = loadFF(FILES.concat(['js/whatsmissing/client.js']));
  const C = FF.WhatsMissingClient;
  const m = await match();
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const study = C.tidy(JSON.parse(JSON.stringify(m.wm())));
  assert(C.ready(study), 'a full study view is ready');
  const half = JSON.parse(JSON.stringify(m.wm()));
  delete half.round.before;
  assert(!C.ready(C.tidy(half)), 'study without its board is not');
  await m.open();
  const open = JSON.parse(JSON.stringify(m.wm()));
  assert(C.ready(C.tidy(JSON.parse(JSON.stringify(open)))), 'a full open view is ready');
  for (const field of ['after', 'twist', open.round.choices ? 'choices' : 'secs']) {
    const v = JSON.parse(JSON.stringify(open));
    delete v.round[field];
    assert(!C.ready(C.tidy(v)), 'open without ' + field + ' is not ready');
  }
  await m.answer('p1', m.right());
  await m.answer('p2', m.right());
  const rev = JSON.parse(JSON.stringify(m.wm()));
  assert(C.ready(C.tidy(JSON.parse(JSON.stringify(rev)))), 'a full reveal is ready');
  delete rev.round.answer;
  assert(!C.ready(C.tidy(rev)), 'a reveal without the answer is not');
  assert(!C.ready(null));
});

test('wm crew seat: plays a whole match through the inbox and is scored by the referee', async function () {
  const FF = loadFF(FILES.concat(['js/whatsmissing/client.js', 'js/crew/levels.js', 'js/crew/brains/whatsMissing.js']));
  const m = await match({ settings: { rounds: 5, level: 'hard' } });
  // The crew seat watches the same room through its own transport, with the same clock.
  const T = FF.Transport.dev({ bus: m.bus, root: 'rooms/ROOM01' });
  await T.connect();
  T.serverNow = () => m.clock.now;
  const seat = FF.CrewWhatsMissing.create({
    transport: T, uids: ['p2'], crew: { p2: { persona: { accuracy: 100, reaction: 80 }, skills: { whatsMissing: { skill: 100, level: 'hard' } } } },
    later: (fn, ms) => m.clock.setTimeout(fn, ms), random: () => 0.01
  });
  seat.start();
  for (let k = 0; k < 5; k++) {
    await m.open();
    const g = m.wm();
    await m.clock.advance(g.closeAt - m.clock.now - 500);
    assertEqual(m.wm().p.p2.inK, k, 'the crew seat answered round ' + (k + 1) + ' before the clock');
    await m.answer('p1', m.wrong());
    assertEqual(m.wm().phase, 'reveal');
    assert(m.wm().p.p2.last.ok, 'a sure crew seat is right in round ' + (k + 1) + ' (' + m.truth().twist + ')');
  }
  await m.clock.advance(m.RF.REVEAL_MS + 10);
  assertEqual(m.wm().result.winners.join(), 'p2');
  seat.stop();
});

test('wm referee: a late start still gives the full study time', async function () {
  const m = await match({ lateMs: 20000 });
  await m.clock.advance(1);
  const g = m.wm();
  assertEqual(g.phase, 'study', 'the first board is studied, not skipped');
  assertEqual(g.changeAt - m.clock.now, g.settings.seconds * 1000 - 1, 'the whole study time from now');
  assertEqual(g.closeAt - g.openAt, m.truth().secs * 1000, 'and the whole answer time');
});

test('wm referee: a restart after the reveal ran out still studies the next board', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', m.right());
  await m.answer('p2', m.right());
  assertEqual(m.wm().phase, 'reveal');
  const nextAt = m.wm().nextAt;
  m.ref.stop();
  m.clock.now = nextAt + 15000;
  const saved = m.saved;
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (v) => { saved.value = v; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await m.clock.advance(1);
  const g = m.wm();
  assertEqual(g.k, 1);
  assertEqual(g.phase, 'study', 'the next board is studied');
  assert(g.changeAt - m.clock.now >= g.settings.seconds * 1000 - 5, 'for the whole study time');
  again.stop();
});

test('wm referee: a restart in the middle of study starts the study again', async function () {
  const m = await match();
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  assertEqual(m.wm().phase, 'study');
  const before0 = JSON.stringify(m.wm().round.before);
  m.ref.stop();
  m.clock.now = m.wm().changeAt + 3000;
  const saved = m.saved;
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (v) => { saved.value = v; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await m.clock.advance(1);
  const g = m.wm();
  assertEqual(g.phase, 'study');
  assertEqual(JSON.stringify(g.round.before), before0, 'the same board');
  assert(g.changeAt - m.clock.now >= g.settings.seconds * 1000 - 5, 'studied again in full');
  again.stop();
});
