'use strict';
/* SortRush: the pure rules (js/sortrush/rules.js), the seeded generator and solver, and
   whole matches refereed by js/sortrush/referee.js over the app's dev transport with a
   hand-moved clock: one puzzle for everyone, legal and refused moves, Single and Group
   moves, undo, restart and skip, replays and double taps, late moves, finishing first,
   simultaneous finishes, the last call, time running out, Timed Score scoring (no farming),
   people leaving, a restart from saved state, and the phone's prediction. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FILES = ['js/core.js', 'js/net/transport.js', 'js/sortrush/rules.js', 'js/sortrush/referee.js'];
const rules = () => loadFF(['js/core.js', 'js/sortrush/rules.js']).SortRushRules;

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
}

/* Count every letter on a board. */
function counts(b) {
  const c = {};
  b.join('').split('').forEach((ch) => { c[ch] = (c[ch] || 0) + 1; });
  return c;
}

/* ---------- settings ---------- */

test('sortrush rules: sanitize keeps known values, levels set the board, and incompatible boards are fixed', function () {
  const R = rules();
  const s = R.sanitize({ mode: 'nope', style: 'nuts', level: 'hard', colours: 3, seconds: '90', limit: 'tight' });
  assertEqual(s.mode, 'race');
  assertEqual(s.style, 'nuts');
  assertEqual([s.colours, s.size, s.empty].join(), '8,4,2', 'a level decides colours, size and empty holders');
  assertEqual(s.seconds, 90);
  assertEqual(s.limit, 'tight');
  const c = R.sanitize({ level: 'custom', colours: 10, size: 6, empty: 1 });
  assertEqual(c.empty, 2, 'one empty holder is only offered on small boards');
  const small = R.sanitize({ level: 'custom', colours: 4, size: 4, empty: 1 });
  assertEqual(small.empty, 1);
  const wide = R.sanitize({ level: 'custom', colours: 10, size: 3, empty: 3 });
  assert(wide.colours + wide.empty <= R.MAX_HOLDERS, 'never more holders than fit');
  assert(R.isStandard(R.STANDARD));
  assert(R.isStandard(Object.assign({}, R.STANDARD, { style: 'rings' })), 'the style is only a look');
  assert(!R.isStandard(Object.assign({}, R.STANDARD, { move: 'group' })));
});

/* ---------- the generator ---------- */

test('sortrush deal: every offered board is exact, not solved, not trivial, and provably solvable', function () {
  const R = rules();
  const seen = {};
  let boards = 0;
  R.COLOURS.forEach((colours) => R.SIZES.forEach((size) => R.EMPTIES.forEach((empty) => R.MOVES.forEach((move) => {
    const s = R.sanitize({ level: 'custom', colours, size, empty, move });
    const key = R.key(s);
    if (seen[key]) return;
    seen[key] = true;
    const n = s.colours * s.size > 40 ? 4 : 10;
    for (let i = 0; i < n; i++) {
      const pz = R.deal(s, 'seed' + i, i % 2);
      boards++;
      assertEqual(pz.b.length, s.colours + s.empty, key + ': holders');
      pz.b.forEach((h) => assert(h.length <= s.size, key + ': capacity'));
      const c = counts(pz.b);
      assertEqual(Object.keys(c).length, s.colours, key + ': every colour');
      Object.keys(c).forEach((ch) => assertEqual(c[ch], s.size, key + ': exactly ' + s.size + ' of ' + ch));
      assert(!R.solved(pz.b, s.size), key + ': not solved at the start');
      assertEqual(R.completedCount(pz.b, s.size), 0, key + ': no holder complete at the start');
      assert(pz.par >= R.minPar(s) || pz.tries < 0, key + ': not trivial');
      const sol = R.solve(pz.b, s.size, s.move, 400000);
      assert(sol, key + ': solvable');
      let b = pz.b;
      sol.forEach((m) => {
        const L = R.legal(b, s.size, m[0], m[1], s.move);
        assert(L.ok, key + ': each solution move is legal');
        b = R.apply(b, m[0], m[1], L.count);
      });
      assert(R.solved(b, s.size), key + ': the solution solves it');
    }
  }))));
  assert(boards > 300, 'checked ' + boards + ' boards');
});

test('sortrush deal: the standard levels deal 200 solvable boards each', function () {
  const R = rules();
  ['easy', 'medium', 'hard', 'expert'].forEach((level) => R.MOVES.forEach((move) => {
    const s = R.sanitize({ level, move });
    for (let i = 0; i < 200; i++) {
      const pz = R.deal(s, 'L' + i, 0);
      assert(pz.tries > 0, level + '/' + move + ': dealt from a solver-checked shuffle (no fallback needed)');
      assert(!R.solved(pz.b, s.size));
    }
  }));
});

test('sortrush deal: the same seed deals the same board on every phone; another index deals another', function () {
  const a = rules(), b = rules();
  const s = a.STANDARD;
  assertEqual(a.deal(s, 'room-42', 0).b.join(','), b.deal(s, 'room-42', 0).b.join(','), 'two separate loads agree');
  assertEqual(a.deal(s, 'room-42', 0).par, b.deal(s, 'room-42', 0).par);
  assert(a.deal(s, 'room-42', 0).b.join(',') !== a.deal(s, 'room-42', 1).b.join(','), 'the next Timed Score puzzle differs');
  assert(a.deal(s, 'room-42', 0).b.join(',') !== a.deal(s, 'room-43', 0).b.join(','), 'another seed differs');
});

test('sortrush deal: the backwards-built fallback is always solvable', function () {
  const R = rules();
  for (let i = 0; i < 30; i++) {
    const s = R.sanitize({ level: 'custom', colours: 3 + (i % 6), size: 3 + (i % 4), empty: 2 });
    const built = R.reverseBuilt(s, R.rng('fb' + i));
    assert(built, 'built');
    assert(R.solve(built.b, s.size, 'single', 400000), 'solvable under Single');
    assert(R.solve(built.b, s.size, 'group', 400000), 'solvable under Group');
    assert(!R.solved(built.b, s.size));
  }
});

/* ---------- moves ---------- */

test('sortrush moves: Single moves only the top object, onto empty or the same colour, within capacity', function () {
  const R = rules();
  const b = ['aab', 'a', '', 'abab'];
  assertEqual(JSON.stringify(R.legal(b, 4, 3, 0, 'single')), JSON.stringify({ ok: true, count: 1, colour: 1 }));
  assertEqual(R.apply(b, 3, 0, 1).join(','), 'aabb,a,,aba');
  assertEqual(R.legal(b, 4, 0, 2, 'single').ok, true, 'onto an empty holder');
  assertEqual(R.legal(b, 4, 0, 1, 'single').why, 'mismatch', 'never onto another colour');
  assertEqual(R.legal(b, 4, 2, 0, 'single').why, 'empty', 'nothing to take');
  assertEqual(R.legal(b, 4, 1, 3, 'single').why, 'full', 'a full holder takes nothing');
  assertEqual(R.legal(b, 4, 0, 0, 'single').why, 'same');
  assertEqual(R.legal(b, 4, 0, 9, 'single').why, 'range');
  assertEqual(R.legal(b, 4, 0.5, 1, 'single').why, 'range');
});

test('sortrush moves: Group moves the top run in order, only as much as fits', function () {
  const R = rules();
  const b = ['abbb', 'ab', 'ccc', ''];
  const L = R.legal(b, 4, 0, 1, 'group');
  assertEqual(L.count, 2, 'only two of the three fit');
  assertEqual(R.apply(b, 0, 1, L.count).join(','), 'ab,abbb,ccc,');
  assertEqual(R.legal(b, 4, 0, 3, 'group').count, 3, 'the whole run into an empty holder');
  assertEqual(R.apply(b, 0, 3, 3).join(','), 'a,ab,ccc,bbb');
  assertEqual(R.legal(b, 4, 0, 1, 'single').count, 1, 'Single still moves one');
});

test('sortrush moves: a complete holder is locked; stuck boards are detected', function () {
  const R = rules();
  assertEqual(R.legal(['aaa', '', 'b'], 3, 0, 1, 'single').why, 'locked');
  assert(R.complete('aaa', 3) && !R.complete('aa', 3) && !R.complete('aab', 3));
  assert(!R.hasAnyMove(['ab', 'ba'], 2, 'single'), 'nothing can move');
  assert(R.hasAnyMove(['ab', 'b'], 2, 'single'));
  assert(R.solved(['aa', 'bb', ''], 2));
  assert(!R.solved(['aa', 'b', 'b'], 2), 'a colour split over two holders is not solved');
  assertEqual(R.sortedCount(['aab', 'a', 'bb']), 4, 'longest bottom run per colour: a2 + b2');
});

/* ---------- a player ---------- */

function soloPlayer(R, settings, board, par) {
  const s = R.sanitize(settings);
  return R.newPlayer(s, { b: board, par: par || 4, k: 0 });
}

test('sortrush step: moves, undo, restart, stale and refused commands', function () {
  const R = rules();
  const s = R.sanitize({ level: 'custom', colours: 3, size: 3, empty: 2 });
  const p = soloPlayer(R, s, ['abc', 'cab', 'bca', '', '']);
  assertEqual(R.step(s, p, { type: 'move', from: 0, to: 1 }, 10, 0).why, 'full');
  assertEqual(p.moves, 0, 'a refused move is not counted');
  const r = R.step(s, p, { type: 'move', from: 0, to: 3, k: 0 }, 10, 0);
  assert(r.ok && r.count === 1 && r.colour === 2);
  assertEqual(p.b.join(','), 'ab,cab,bca,c,');
  assertEqual(R.step(s, p, { type: 'move', from: 1, to: 4, k: 7 }, 11, 0).why, 'stale', 'another puzzle index is stale');
  const u = R.step(s, p, { type: 'undo' }, 12, 0);
  assert(u.ok && u.from === 3 && u.to === 0);
  assertEqual(p.b.join(','), 'abc,cab,bca,,');
  assertEqual(p.moves, 2, 'undo counts as a move');
  assertEqual(R.step(s, p, { type: 'undo' }, 13, 0).why, 'nothing');
  R.step(s, p, { type: 'move', from: 1, to: 3 }, 14, 0);
  R.step(s, p, { type: 'restart' }, 15, 0);
  assertEqual(p.b.join(','), 'abc,cab,bca,,', 'restart puts the start back');
  assertEqual(p.moves, 4, 'the moves keep counting');
  assertEqual(R.step(s, p, { type: 'skip' }, 16, 0).why, 'mode', 'no skipping in a race');
  assertEqual(R.step(s, p, { type: 'jump' }, 16, 0).why, 'type');
});

test('sortrush step: a move that completed a holder cannot be undone', function () {
  const R = rules();
  const s = R.sanitize({ level: 'custom', colours: 3, size: 3, empty: 2 });
  const p = soloPlayer(R, s, ['aab', 'a', 'bbc', 'cc', '']);
  R.step(s, p, { type: 'move', from: 1, to: 0 }, 1, 0);           // wrong colour: refused
  R.step(s, p, { type: 'move', from: 0, to: 4 }, 1, 0);           // b off the top
  const r = R.step(s, p, { type: 'move', from: 1, to: 0 }, 2, 0);
  assert(r.ok && r.completed, 'aaa is complete');
  assertEqual(R.step(s, p, { type: 'undo' }, 3, 0).why, 'locked');
});

test('sortrush step: a race finishes on the solving move and runs out of moves at the limit', function () {
  const R = rules();
  const s = R.sanitize({ level: 'custom', colours: 3, size: 3, empty: 2, mode: 'race' });
  const pz = R.deal(s, 'finish', 0);
  const p = R.newPlayer(s, pz);
  R.solve(pz.b, s.size, s.move).forEach((m, i) => R.step(s, p, { type: 'move', from: m[0], to: m[1] }, 5000 + i, 1000));
  assert(p.done, 'solved');
  assertEqual(p.used, 5000 + pz.par - 1 - 1000);
  assertEqual(R.step(s, p, { type: 'move', from: 0, to: 1 }, 9999, 1000).why, 'over', 'nothing after the finish');

  const t = R.sanitize(Object.assign({}, s, { limit: 'tight' }));
  const q = R.newPlayer(t, pz);
  assertEqual(q.limit, R.moveLimit(t, pz.par));
  for (let i = 0; i < q.limit && !q.out; i++) R.step(t, q, { type: i % 2 ? 'undo' : 'move', from: 0, to: pz.b.length - 1 }, i, 0);
  assert(q.out, 'out of moves');
});

test('sortrush step: Timed Score pays each holder once, the clear bonus, a bounded efficiency bonus, and deals the next puzzle', function () {
  const R = rules();
  const s = R.sanitize({ level: 'custom', colours: 3, size: 3, empty: 2, mode: 'score' });
  const deal = (k) => R.deal(s, 'score', k);
  const p = R.newPlayer(s, deal(0));
  const sol = R.solve(p.b, s.size, s.move);
  let last;
  // Play until the first holder completes, then restart and complete it again: no second payment.
  let i = 0;
  for (; i < sol.length; i++) {
    last = R.step(s, p, { type: 'move', from: sol[i][0], to: sol[i][1] }, i, 0, deal);
    if (last.completed) break;
  }
  assertEqual(p.score, R.POINTS.holder, 'one holder, 100 points');
  R.step(s, p, { type: 'restart' }, 50, 0, deal);
  for (let j = 0; j <= i; j++) R.step(s, p, { type: 'move', from: sol[j][0], to: sol[j][1] }, 60 + j, 0, deal);
  assertEqual(p.score, R.POINTS.holder, 'completing it again after a restart earns nothing');
  for (let j = i + 1; j < sol.length; j++) last = R.step(s, p, { type: 'move', from: sol[j][0], to: sol[j][1] }, 100 + j, 0, deal);
  assert(last.cleared && last.next, 'cleared, and the next puzzle is dealt');
  assertEqual(p.k, 1);
  assertEqual(p.b.join(','), deal(1).b.join(','));
  assertEqual(p.cleared, 1);
  const eff = R.efficiency(sol.length, sol.length + i + 2);
  assert(eff > 0 && eff <= R.POINTS.efficiency, 'efficiency is bounded');
  assertEqual(p.score, s.colours * R.POINTS.holder + R.POINTS.clear + eff);
  const before = p.score;
  assert(R.step(s, p, { type: 'skip', k: 1 }, 300, 0, deal).ok, 'skipping is allowed in Timed Score');
  assertEqual(p.score, before, 'skipping earns nothing');
  assertEqual(p.k, 2);
  assertEqual(R.efficiency(10, 5), R.POINTS.efficiency, 'never more than the cap');
});

/* ---------- results ---------- */

test('sortrush ranked: race order, ties share a place, points follow the order', function () {
  const R = rules();
  const s = R.sanitize({ mode: 'race', seconds: 60 });
  const rows = R.ranked({
    fast: { done: true, doneAt: 10, used: 9000, moves: 30 },
    slow: { done: true, doneAt: 20, used: 19000, moves: 20 },
    half: { peakC: 2, peakS: 12, moves: 10 },
    more: { peakC: 3, peakS: 10, moves: 40 },
    out: { out: true, peakC: 5, moves: 30 },
    idle: {}
  }, ['idle', 'out', 'half', 'more', 'slow', 'fast'], s);
  assertEqual(rows.map((r) => r.uid).join(','), 'fast,slow,more,half,idle,out');
  for (let i = 1; i < rows.length; i++) assert(rows[i].points < rows[i - 1].points || rows[i].points === 0, 'points follow the order');
  assertEqual(R.winners(rows).join(','), 'fast');
  const tie = R.ranked({ x: { done: true, doneAt: 5, moves: 3 }, y: { done: true, doneAt: 5, moves: 9 } }, ['x', 'y'], s);
  assertEqual(tie[1].place, 1, 'finishing at the same instant is a draw');
  assertEqual(R.winners(tie).length, 2);
  const byMoves = R.ranked({ x: { peakC: 1, peakS: 5, moves: 9, peakAt: 1 }, y: { peakC: 1, peakS: 5, moves: 7, peakAt: 9 } }, ['x', 'y'], s);
  assertEqual(byMoves[0].uid, 'y', 'same progress: fewer moves wins');
  assertEqual(R.winners(R.ranked({ x: {}, y: {} }, ['x', 'y'], s)).length, 0, 'nobody moved');
});

test('sortrush ranked: Timed Score order and tie-breaks', function () {
  const R = rules();
  const s = R.sanitize({ mode: 'score' });
  const rows = R.ranked({
    a: { score: 900, cleared: 2, moves: 50, lastAt: 9 },
    b: { score: 900, cleared: 3, moves: 60, lastAt: 9 },
    c: { score: 900, cleared: 3, moves: 40, lastAt: 9 },
    d: { score: 1200, cleared: 1, moves: 90, lastAt: 99, moves2: 1 },
    e: { score: 0, moves: 1 }
  }, ['a', 'b', 'c', 'd', 'e'], s);
  assertEqual(rows.map((r) => r.uid).join(','), 'd,c,b,a,e');
  assertEqual(rows[0].points, 1200, 'the winner keeps their score');
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
  const R = app.SortRushRules;
  const RF = app.SortRushReferee;
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
  if (!opts.keep) await room.set('', { meta: { seed: 's', status: 'playing', appVersion: '2.0.0', hostUid: 'p1', startAt: clock.now + 1000 }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = Object.assign({
    matchId: 's_1', roomCode: code, seats, startAt: clock.now + 1000,
    settings: Object.assign({ level: 'custom', colours: 3, size: 3, empty: 2, seconds: 60 }, opts.settings || {})
  }, opts.run || {});
  const ref = RF.create({
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
    app, R, RF, bus, clock, room, ref, seats, saved, reports, run,
    sr: () => bus.read('rooms/' + code).sr || null,
    meta: () => bus.read('rooms/' + code).meta,
    row: (uid) => m.sr().p[uid],
    board: (uid) => RF.unpackBoard(m.row(uid).b),
    settings: () => R.sanitize(m.sr().settings),
    async go() { await clock.advance(1000 + RF.BRIEF_MS); },
    /* Send one command as uid's phone would; n defaults to that phone's next move number. */
    async send(uid, type, from, to, over) {
      if (next[uid] == null) next[uid] = 0;
      const cmd = Object.assign({ type, matchId: m.sr().matchId, n: next[uid], k: m.row(uid).k, f: from == null ? -1 : from, to: to == null ? -1 : to, t: clock.now }, over || {});
      if (!over || over.n == null) next[uid]++;
      await room.set('srInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    },
    async move(uid, from, to, over) { await m.send(uid, 'move', from, to, over); },
    /* The solver's next move for uid's current board. */
    hint(uid) { const s = m.settings(); return R.solve(m.board(uid), s.size, s.move)[0]; },
    async solve(uid) {
      const k = m.row(uid).k;
      const s = m.settings();
      const moves = R.solve(m.board(uid), s.size, s.move);
      for (const mv of moves) { if (m.row(uid).k !== k || m.row(uid).done) break; await m.move(uid, mv[0], mv[1]); }
    }
  };
  return m;
}

test('sortrush referee: one puzzle for everyone, opened at the start time; nothing counts before it', async function () {
  const m = await match({ players: 3 });
  assertEqual(m.sr().phase, 'starting');
  const b0 = m.row('p1').b;
  m.seats.forEach((uid) => assertEqual(m.row(uid).b, b0, uid + ' gets the same board'));
  assertEqual(b0, m.R.deal(m.settings(), m.sr().seed, 0).b.join(','), 'the published seed deals it');
  const h = m.hint('p1');
  await m.move('p1', h[0], h[1]);
  assertEqual(m.row('p1').moves, 0, 'a move before the start does nothing');
  assertEqual(m.row('p1').last, 'late');
  await m.go();
  assertEqual(m.sr().phase, 'playing');
  assertEqual(m.sr().openAt, m.run.startAt + m.RF.BRIEF_MS);
  assertEqual(m.sr().deadline, m.sr().openAt + 60000);
});

test('sortrush referee: legal moves apply; refused ones change nothing; boards stay independent', async function () {
  const m = await match();
  await m.go();
  const h = m.hint('p1');
  await m.move('p1', h[0], h[1]);
  assertEqual(m.row('p1').moves, 1);
  assert(m.row('p1').b !== m.row('p2').b, 'only p1 moved');
  const b = m.board('p1');
  const empty = b.indexOf('');
  const full = b.findIndex((x) => x.length === m.settings().size);
  await m.move('p1', empty, full);
  assertEqual(m.row('p1').last, 'stale', 'taking from an empty holder is refused');
  assertEqual(m.row('p1').moves, 1, 'and not counted');
  await m.move('p1', 99, 0);
  assertEqual(m.row('p1').moves, 1, 'out of range is refused');
  await m.send('p1', 'undo');
  assertEqual(m.row('p1').b, m.row('p2').b, 'undo puts it back');
  assertEqual(m.row('p1').moves, 2);
});

test('sortrush referee: replays and double taps land once; gaps are skipped after a while', async function () {
  const m = await match();
  await m.go();
  const h = m.hint('p1');
  await m.move('p1', h[0], h[1], { n: 0 });
  await m.move('p1', h[0], h[1], { n: 0 });
  await m.move('p1', h[0], h[1], { n: 0 });
  assertEqual(m.row('p1').moves, 1, 'the same move number counts once');
  const h2 = m.hint('p1');
  await m.move('p1', h2[0], h2[1], { n: 3 });   // n 1 and 2 never arrive
  assertEqual(m.row('p1').moves, 1, 'waits for the missing moves');
  await m.clock.advance(m.RF.LOST_MS + 10);
  await m.move('p1', h2[0], h2[1], { n: 4 });
  assert(m.row('p1').n >= 4, 'carried on without them');
});

test('sortrush referee: one winner, a last call for the rest, then the results', async function () {
  const m = await match({ players: 3 });
  await m.go();
  await m.solve('p1');
  assert(m.row('p1').done, 'p1 finished');
  await m.clock.advance(1000);
  assertEqual(m.sr().first, 'p1');
  assertEqual(m.sr().closeAt, m.row('p1').doneAt + m.R.LAST_CALL_MS, 'the others get a last call');
  await m.solve('p2');
  assert(m.row('p2').done);
  await m.clock.advance(m.R.LAST_CALL_MS + 100);
  const sr = m.sr();
  assertEqual(sr.phase, 'ended');
  assertEqual(sr.result.why, 'lastCall');
  assertEqual(sr.result.winners.join(','), 'p1', 'exactly one winner');
  assertEqual(sr.result.rows.map((r) => r.uid).join(','), 'p1,p2,p3');
  assertEqual(m.meta().status, 'ended');
  assertEqual(m.meta().results.gameId, 'sortRush');
  assertEqual(m.reports.length, 1, 'reported once');
  assertEqual(m.reports[0].e, 'sortrush');
  const h = m.R.solve(m.board('p3'), 3, 'single')[0];
  await m.move('p3', h[0], h[1]);
  assertEqual(m.row('p3').moves, 0, 'no moves after the end');
  await m.clock.advance(60000);
  assertEqual(m.reports.length, 1, 'never reported twice');
});

test('sortrush referee: finishing at the same instant is a draw', async function () {
  const m = await match();
  await m.go();
  const s = m.settings();
  const moves = m.R.solve(m.board('p1'), s.size, s.move);
  for (const mv of moves) {
    await m.move('p1', mv[0], mv[1]);
    await m.move('p2', mv[0], mv[1]);
  }
  await flush();
  assertEqual(m.sr().phase, 'ended', 'both done: it ends at once');
  assertEqual(m.sr().result.draw, true);
  assertEqual(m.sr().result.winners.length, 2);
});

test('sortrush referee: time running out ranks by progress; a move sent just before the close still counts, one after does not', async function () {
  const m = await match();
  await m.go();
  const h = m.hint('p1');
  await m.move('p1', h[0], h[1]);
  await m.clock.advance(60000 - 50);
  const h2 = m.hint('p2');
  // Sent 1 ms before the deadline, arriving after it.
  const sentAt = m.sr().deadline - 1;
  await m.clock.advance(10);
  await m.move('p2', h2[0], h2[1], { t: sentAt });
  assertEqual(m.row('p2').moves, 1, 'sent in time counts');
  await m.clock.advance(100);
  assertEqual(m.sr().phase, 'ended');
  assertEqual(m.sr().result.why, 'time');
  await m.move('p1', 0, 1, { t: m.clock.now });
  assertEqual(m.sr().result.rows.find((r) => r.uid === 'p1').moves, 1, 'late moves do nothing');
});

test('sortrush referee: Timed Score deals the same next puzzle to everyone and scores on the server', async function () {
  const m = await match({ settings: { mode: 'score' } });
  await m.go();
  await m.solve('p1');
  assertEqual(m.row('p1').k, 1, 'p1 moved on to puzzle 1');
  assertEqual(m.row('p1').b, m.R.deal(m.settings(), m.sr().seed, 1).b.join(','), 'puzzle 1 from the shared seed');
  assert(m.row('p1').score >= 3 * 100 + 200, 'holders and the clear bonus');
  await m.send('p2', 'skip');
  assertEqual(m.row('p2').k, 1, 'p2 skipped to the same puzzle 1');
  assertEqual(m.row('p2').b, m.row('p1').b);
  assertEqual(m.row('p2').score, 0);
  await m.clock.advance(61000);
  assertEqual(m.sr().result.rows[0].uid, 'p1');
  assertEqual(m.sr().result.mode, 'score');
});

test('sortrush referee: when everyone else leaves the match ends', async function () {
  const m = await match({ players: 2 });
  await m.go();
  await m.room.update('players/p2', { online: false });
  await m.room.update('players/p1', { online: false });
  await m.clock.advance(6000);
  assertEqual(m.sr().phase, 'ended');
  assertEqual(m.sr().result.why, 'done');
});

test('sortrush referee: a restarted referee carries on from its saved state', async function () {
  const clock = makeClock(1000000);
  const saved = { value: null };
  const m = await match({ clock, saved, settings: { mode: 'score' } });
  await m.go();
  const h = m.hint('p1');
  await m.move('p1', h[0], h[1]);
  await m.ref.flush();
  const board = m.row('p1').b;
  m.ref.stop();
  const again = m.RF.create({
    run: m.run, room: m.room,
    store: { load: () => Promise.resolve(JSON.parse(JSON.stringify(saved.value))), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(99), timers: clock
  });
  await again.start();
  await flush();
  assertEqual(m.row('p1').moves, 1, 'kept the move');
  assertEqual(m.row('p1').b, board, 'same board, not a new deal');
  assertEqual(m.sr().seed, saved.value.seed);
  // And it keeps refereeing: undo is still possible from the saved history.
  await m.send('p1', 'undo', null, null, { n: 1 });
  assertEqual(m.row('p1').b, m.row('p2').b, 'undo after the restart');
});

/* ---------- the phone ---------- */

test('sortrush client: the phone predicts with the same rules and takes the referee board once it catches up', async function () {
  const m = await match();
  const app = loadFF(FILES.concat(['js/sortrush/client.js']));
  const T = app.Transport.dev({ bus: m.bus, root: 'rooms/ROOM01' });
  await T.connect();
  T.serverNow = () => m.clock.now;
  let changes = 0;
  const c = app.SortRushClient.create({ room: { transport: T, uid: 'p1' }, onChange: () => changes++ });
  await flush();
  assert(changes > 0, 'it follows the public view');
  assertEqual(c.send({ type: 'move', from: 0, to: 1 }), null, 'nothing before play opens');
  await m.go();
  const h = m.hint('p1');
  const res = c.send({ type: 'move', from: h[0], to: h[1] });
  assert(res && res.ok, 'predicted at once');
  const predicted = c.view().player.b.join(',');
  await flush();
  await m.ref.flush();
  await flush();
  assertEqual(m.row('p1').b, predicted, 'the referee agrees');
  assertEqual(c.view().pending, false);
  const bad = c.send({ type: 'move', from: 0, to: 0 });
  assertEqual(bad.ok, false, 'refused on the phone, never sent');
  c.stop();
});

/* ---------- wiring ---------- */

test('sortrush: the inbox rule, the lists that name online games, and the runner know the game', function () {
  const rulesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const room = rulesJson.rooms.$code;
  assertEqual(room.sr, undefined, 'rooms/$code/sr is server-only');
  const inbox = room.srInbox.$uid.$id;
  assert(/\$uid === auth\.uid/.test(inbox['.write']) && /!data\.exists\(\)/.test(inbox['.write']), 'written once, by the sender');
  assert(/child\('sr'\)\.child\('p'\)\.child\(auth\.uid\)/.test(inbox['.write']), 'only seated players');
  assertEqual(inbox.t['.validate'], 'newData.isNumber() && newData.val() === now', 'server-stamped');
  assertEqual(inbox.$other['.validate'], false);
  const ui = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/'sortRush'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(ui)[1]), 'roomUI ONLINE_GAMES');
  const crew = fs.readFileSync(path.join(ROOT, 'api/lib/Crew.php'), 'utf8');
  assert(/'sortRush'/.test(/ONLINE_GAMES = \[([\s\S]*?)\];/.exec(crew)[1]), 'Crew::ONLINE_GAMES');
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(/js\/sortrush\/rules\.js/.test(loader) && /js\/sortrush\/referee\.js/.test(loader), 'the runner loads the rules and referee');
  const runner = fs.readFileSync(path.join(ROOT, 'api/crew/runner.js'), 'utf8');
  assert(/sortrushRuns/.test(runner) && /SortRushReferee/.test(runner), 'the runner referees sortrushRuns');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(/js\/games\/sortRush\.js/.test(src) && /js\/sortrush\/rules\.js/.test(src) && /js\/sortrush\/client\.js/.test(src), f + ' loads SortRush');
  });
  const icons = fs.readFileSync(path.join(ROOT, 'js/icons.js'), 'utf8');
  assert(/"sortRush"/.test(icons), 'icons.js names the game');
  const lb = fs.readFileSync(path.join(ROOT, 'api/lib/Leaderboards.php'), 'utf8');
  assert(/'sortRush'/.test(lb), 'Leaderboards::GAMES');
});
