'use strict';
/* Ball Swap: the pure rules (js/ballswap/rules.js) and whole matches refereed by
   js/ballswap/referee.js over the app's dev transport with a hand-moved clock: dealing,
   right and wrong swaps, replays and double taps, stale boards, knock-outs, finishing first,
   simultaneous finishes, the last call, time running out, people leaving, and a restart. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FILES = ['js/core.js', 'js/net/transport.js', 'js/ballswap/rules.js', 'js/ballswap/referee.js'];

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
}

/* ---------- rules ---------- */

test('ballswap rules: two colours fill one container each and trade completely', function () {
  const R = loadFF(['js/core.js', 'js/ballswap/rules.js']).BallSwapRules;
  for (let s = 1; s < 40; s++) {
    const pz = R.deal({ level: 'easy', colours: 2 }, seeded(s));
    assert(pz.n >= 3 && pz.n <= 5, 'easy is 3 to 5 balls');
    assertEqual(pz.a.length, pz.n);
    assertEqual(pz.b.length, pz.n);
    assertEqual(pz.need, pz.n);
    const [first, second] = pz.colours;
    assert(pz.a.every((id) => pz.balls[id] === first), 'A holds only the first colour');
    assert(pz.b.every((id) => pz.balls[id] === second), 'B holds only the second colour');
    assertEqual(pz.target[first], 'B');
    assertEqual(pz.target[second], 'A');
    const lines = R.instructions(pz);
    assertEqual(JSON.stringify(lines.map((l) => l.from + '>' + l.to)), JSON.stringify(['A>B', 'B>A']));
  }
});

test('ballswap rules: every level and colour count deals a full, solvable board', function () {
  const R = loadFF(['js/core.js', 'js/ballswap/rules.js']).BallSwapRules;
  R.LEVELS.forEach((level) => R.COLOURS.forEach((colours) => {
    for (let s = 1; s < 25; s++) {
      const pz = R.deal({ level, colours }, seeded(s * 7 + colours));
      const [lo, hi] = R.SIZES[level];
      assert(pz.n >= lo && pz.n <= hi, level + ' size');
      assertEqual(pz.colours.length, colours);
      assertEqual(pz.a.length + pz.b.length, pz.n * 2);
      assertEqual(new Set(pz.a.concat(pz.b)).size, pz.n * 2, 'every ball once');
      const homeA = pz.balls.filter((c) => pz.target[c] === 'A').length;
      assertEqual(homeA, pz.n, 'exactly a container of balls belongs in A');
      let bd = R.board(pz);
      assertEqual(R.left(pz, bd), pz.need);
      // Solve it: always pair a ball for B (in A) with a ball for A (in B).
      let moves = 0;
      while (!R.solved(pz, bd)) {
        const a = bd.a.find((id) => pz.target[pz.balls[id]] === 'B');
        const b = bd.b.find((id) => pz.target[pz.balls[id]] === 'A');
        assertEqual(R.check(pz, bd, a, b), 'ok');
        bd = R.apply(bd, a, b);
        moves++;
      }
      assertEqual(moves, pz.need, 'solved in exactly need swaps');
      assertEqual(bd.a.length, pz.n, 'swaps never change how full a container is');
    }
  }));
});

test('ballswap rules: a swap is right only when both balls go home; stale is not a mistake', function () {
  const R = loadFF(['js/core.js', 'js/ballswap/rules.js']).BallSwapRules;
  const pz = { n: 2, colours: ['red', 'blue', 'green'], target: { red: 'B', blue: 'A', green: 'A' }, balls: ['red', 'green', 'blue', 'red'], a: [0, 1], b: [2, 3], need: 1 };
  const bd = R.board(pz);
  assertEqual(R.check(pz, bd, 0, 2), 'ok', 'red to B, blue to A');
  assertEqual(R.check(pz, bd, 1, 2), 'wrong', 'green already belongs in A');
  assertEqual(R.check(pz, bd, 0, 3), 'wrong', 'red already belongs in B');
  assertEqual(R.check(pz, bd, 2, 0), 'stale', 'ball 2 is not in A');
  const next = R.apply(bd, 0, 2);
  assertEqual(JSON.stringify(next), JSON.stringify({ a: [2, 1], b: [0, 3] }), 'they trade slots');
  assertEqual(JSON.stringify(bd), JSON.stringify({ a: [0, 1], b: [2, 3] }), 'the old board is untouched');
  assert(R.solved(pz, next));
  const lines = R.instructions(pz);
  assertEqual(lines.find((l) => l.colour === 'green').from, null, 'green stays where it is');
});

test('ballswap rules: settings, knock-outs, points and the official order', function () {
  const R = loadFF(['js/core.js', 'js/ballswap/rules.js']).BallSwapRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify(R.STANDARD));
  assertEqual(R.sanitize({ colours: '4', seconds: 7, mistakes: '-1', level: 'insane' }).colours, 4);
  assertEqual(R.sanitize({ seconds: 7 }).seconds, 90);
  assertEqual(R.sanitize({ mistakes: '-1' }).mistakes, -1);
  assert(!R.knockedOut({ mistakes: 3 }, 3), 'three of three allowed is still in');
  assert(R.knockedOut({ mistakes: 3 }, 4), 'one more is out');
  assert(R.knockedOut({ mistakes: 0 }, 1), 'no mistakes allowed');
  assert(!R.knockedOut({ mistakes: -1 }, 99), 'no limit');
  assertEqual(R.accuracy({ swaps: 3, mistakes: 1 }), 75);
  const settings = { seconds: 100 };
  const rows = R.ranked({
    fast: { swaps: 5, mistakes: 2, done: true, doneAt: 1000, used: 20000 },
    clean: { swaps: 5, mistakes: 0, done: true, doneAt: 2000, used: 21000 },
    half: { swaps: 3, mistakes: 0 },
    out: { swaps: 4, mistakes: 4, out: true },
    idle: {}
  }, ['idle', 'out', 'half', 'clean', 'fast'], 5, settings);
  assertEqual(rows.map((r) => r.uid).join(','), 'fast,clean,half,idle,out', 'first to finish wins; knocked out ranks below everyone still in');
  for (let i = 1; i < rows.length; i++) assert(rows[i].points < rows[i - 1].points || rows[i].points === 0, 'points follow the order');
  assertEqual(R.winners(rows).join(','), 'fast');
  const tie = R.ranked({ x: { swaps: 2, mistakes: 1 }, y: { swaps: 2, mistakes: 1 } }, ['x', 'y'], 5, settings);
  assertEqual(tie[0].place, 1);
  assertEqual(tie[1].place, 1, 'equal on everything: a draw');
  assertEqual(tie[0].points, tie[1].points);
  assertEqual(R.winners(tie).length, 2);
  assertEqual(R.winners(R.ranked({ x: {}, y: {} }, ['x', 'y'], 5, settings)).length, 0, 'nobody did anything');
});

/* ---------- the referee ---------- */

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
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

async function match(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const R = app.BallSwapRules;
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(1000000);
  const code = 'ROOM01';
  const room = app.Transport.dev({ bus, root: 'rooms/' + code });
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
  if (!opts.bus) await room.set('', { meta: { seed: 's', status: 'playing', appVersion: '2.0.0', hostUid: 'p1', startAt: clock.now + 1000 }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = Object.assign({
    matchId: 'b_1', roomCode: code, seats, startAt: clock.now + 1000,
    settings: Object.assign({ level: 'easy', colours: 2, seconds: 60, mistakes: 1 }, opts.settings || {})
  }, opts.run || {});
  const ref = app.BallSwapReferee.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: opts.randomInt || seeded(42),
    timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const next = {};
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    app, R, bus, clock, room, ref, seats, saved, reports, run,
    bs: () => bus.read('rooms/' + code).bs || null,
    meta: () => bus.read('rooms/' + code).meta,
    row: (uid) => m.bs().p[uid],
    puzzle: () => m.bs().puzzle,
    async go() { await clock.advance(1000 + app.BallSwapReferee.BRIEF_MS); },
    /* Send one swap as uid's phone would; n defaults to that phone's next move number. */
    async send(uid, a, b, over) {
      if (next[uid] == null) next[uid] = 0;
      const cmd = Object.assign({ type: 'swap', matchId: m.bs().matchId, n: next[uid], a, b, t: clock.now }, over || {});
      if (!over || over.n == null) next[uid]++;
      await room.set('bsInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    },
    /* A right swap for uid on its current board. */
    rightPair(uid) {
      const pz = m.puzzle(), r = m.row(uid);
      return [r.a.find((id) => pz.target[pz.balls[id]] === 'B'), r.b.find((id) => pz.target[pz.balls[id]] === 'A')];
    },
    /* A wrong swap: a ball already home in A (there is one once a swap has been made). */
    wrongPair(uid) {
      const pz = m.puzzle(), r = m.row(uid);
      const homeInA = r.a.find((id) => pz.target[pz.balls[id]] === 'A');
      const anyB = r.b[0];
      return [homeInA, anyB];
    },
    async solve(uid) {
      while (!m.row(uid).done && !m.row(uid).out) { const [a, b] = m.rightPair(uid); await m.send(uid, a, b); }
    }
  };
  return m;
}

test('ballswap referee: one puzzle for everyone, opened at the start time', async function () {
  const m = await match({ players: 3 });
  assertEqual(m.bs().phase, 'starting');
  const pz = m.puzzle();
  m.seats.forEach((uid) => {
    assertEqual(JSON.stringify(m.row(uid).a), JSON.stringify(pz.a), uid + ' gets the same A');
    assertEqual(JSON.stringify(m.row(uid).b), JSON.stringify(pz.b), uid + ' gets the same B');
  });
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  assertEqual(m.row('p1').swaps, 0, 'a swap before the start does nothing');
  await m.go();
  assertEqual(m.bs().phase, 'playing');
  assertEqual(m.bs().openAt, m.run.startAt + m.app.BallSwapReferee.BRIEF_MS, 'a briefing after the room countdown');
  assertEqual(m.bs().deadline, m.bs().openAt + 60000);
});

test('ballswap referee: right swaps move both balls; a wrong one is one mistake and moves nothing', async function () {
  const m = await match({ settings: { mistakes: 3 } });
  await m.go();
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  const r1 = m.row('p1');
  assertEqual(r1.swaps, 1);
  assert(r1.b.indexOf(a) !== -1 && r1.a.indexOf(b) !== -1, 'they traded places');
  assertEqual(JSON.stringify(m.row('p2').a), JSON.stringify(m.puzzle().a), 'the other board is untouched');
  const [wa, wb] = m.wrongPair('p1');
  const before = JSON.stringify(m.row('p1').a) + JSON.stringify(m.row('p1').b);
  await m.send('p1', wa, wb);
  assertEqual(m.row('p1').mistakes, 1, 'one mistake for the pair, not two');
  assertEqual(JSON.stringify(m.row('p1').a) + JSON.stringify(m.row('p1').b), before, 'neither ball moved');
  assertEqual(m.row('p1').last, 'wrong');
});

test('ballswap referee: a replayed or double-tapped swap lands once; a stale one is no mistake', async function () {
  const m = await match({ settings: { mistakes: 3 } });
  await m.go();
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b, { n: 0 });
  await m.send('p1', a, b, { n: 0 });
  assertEqual(m.row('p1').swaps, 1, 'the copy was dropped');
  assertEqual(m.row('p1').mistakes, 0, 'and was not a mistake');
  await m.send('p1', a, b, { n: 1 });   // the same balls again: they are no longer where they were
  assertEqual(m.row('p1').mistakes, 0, 'stale is not a mistake');
  assertEqual(m.row('p1').last, 'stale');
  assertEqual(m.row('p1').n, 2);
});

test('ballswap referee: one more mistake than allowed knocks a player out', async function () {
  const m = await match({ settings: { mistakes: 1 } });
  await m.go();
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  let [wa, wb] = m.wrongPair('p1');
  await m.send('p1', wa, wb);
  assert(!m.row('p1').out, 'one mistake of one allowed');
  [wa, wb] = m.wrongPair('p1');
  await m.send('p1', wa, wb);
  assert(m.row('p1').out, 'the second is out');
  const swaps = m.row('p1').swaps;
  const [ra, rb] = m.rightPair('p1');
  await m.send('p1', ra, rb);
  assertEqual(m.row('p1').swaps, swaps, 'an eliminated player cannot move');
});

test('ballswap referee: the first to finish wins; the others get a last call, then it ends', async function () {
  const m = await match({ players: 3, settings: { seconds: 120 } });
  await m.go();
  await m.clock.advance(3000);
  await m.solve('p2');
  const r = m.row('p2');
  assert(r.done, 'p2 finished');
  assertEqual(r.used, 3000, 'finishing time from the start');
  assertEqual(m.bs().first, 'p2');
  assertEqual(m.bs().closeAt, m.clock.now + m.R.LAST_CALL_MS);
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  await m.clock.advance(m.R.LAST_CALL_MS + 10);
  const bs = m.bs();
  assertEqual(bs.phase, 'ended');
  assertEqual(bs.result.why, 'lastCall');
  assertEqual(bs.result.winners.join(','), 'p2');
  assertEqual(bs.result.rows[1].uid, 'p1', 'p1 did more than p3');
  assertEqual(m.meta().status, 'ended');
  assertEqual(m.meta().results.ranked[0].id, 'p2');
  assertEqual(m.meta().results.startAt, m.run.startAt);
  assertEqual(m.reports[0].e, 'ballswap');
  assertEqual(m.reports[0].p.seats.find((s) => s.uid === 'p2').won, true);
});

test('ballswap referee: two finishes stamped at the same instant are a draw', async function () {
  const m = await match({ players: 2 });
  await m.go();
  // Both phones send their last swaps; they reach the referee in turn but carry the same server time.
  const t = m.clock.now;
  const solveAt = async (uid) => {
    while (!m.row(uid).done) { const [a, b] = m.rightPair(uid); await m.send(uid, a, b, { t }); }
  };
  await solveAt('p1');
  await solveAt('p2');
  const res = m.bs().result;
  assertEqual(m.bs().phase, 'ended', 'everyone finished: it ends at once');
  assertEqual(res.why, 'done');
  assertEqual(res.draw, true);
  assertEqual(res.winners.length, 2);
});

test('ballswap referee: time runs out with nobody done; most progress wins; leavers do not hold it up', async function () {
  const m = await match({ players: 3, settings: { level: 'medium', mistakes: -1, seconds: 45 } });
  await m.go();
  let [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  [a, b] = m.rightPair('p2');
  await m.send('p2', a, b);
  await m.clock.advance(45000);
  const res = m.bs().result;
  assertEqual(res.why, 'time');
  assertEqual(res.rows.map((r) => r.uid).join(','), 'p1,p2,p3');
  assertEqual(res.winners.join(','), 'p1');

  const m2 = await match({ players: 2 });
  await m2.go();
  await m2.room.update('players/p2', { online: false });
  await m2.solve('p1');
  assertEqual(m2.bs().phase, 'ended', 'the only player still here finished');
});

test('ballswap referee: a restarted referee carries on from its saved state', async function () {
  const bus = makeBus();
  const clock = makeClock(1000000);
  const saved = { value: null };
  const m = await match({ bus: null, clock, saved, settings: { mistakes: 3 } });
  await m.go();
  const [a, b] = m.rightPair('p1');
  await m.send('p1', a, b);
  await m.ref.flush();
  m.ref.stop();
  const again = m.app.BallSwapReferee.create({
    run: m.run, room: m.room,
    store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(99), timers: clock
  });
  await again.start();
  await flush();
  assertEqual(m.row('p1').swaps, 1, 'kept the swap');
  assertEqual(JSON.stringify(m.puzzle().a), JSON.stringify(m.saved.value.puzzle.a), 'same puzzle, not a new deal');
  assert(bus, 'unused');
});

test('ballswap: the inbox rule, the lists that name online games, and the runner know the game', function () {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const room = rules.rooms.$code;
  assertEqual(room.bs, undefined, 'rooms/$code/bs is server-only');
  const inbox = room.bsInbox.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('bs'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  const ui = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/'ballSwap'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(ui)[1]), 'roomUI ONLINE_GAMES');
  const crew = fs.readFileSync(path.join(ROOT, 'api/lib/Crew.php'), 'utf8');
  assert(/'ballSwap'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::ONLINE_GAMES');
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(/js\/ballswap\/referee\.js/.test(loader), 'the runner loads the referee');
  const runner = fs.readFileSync(path.join(ROOT, 'api/crew/runner.js'), 'utf8');
  assert(/ballswapRuns/.test(runner) && /BallSwapReferee/.test(runner), 'the runner referees ballswapRuns');
});
