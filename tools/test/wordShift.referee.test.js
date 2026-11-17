'use strict';
/* WordShift online Race: whole matches refereed by js/wordshift/referee.js over the dev transport
   with a hand-moved clock — the same puzzle for everyone, each move checked on the server, no
   player's words ever in the shared view, finishing order and efficiency scored, rounds summed. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/data/wordshiftPuzzles.js', 'js/wordshift/rules.js', 'js/net/transport.js', 'js/wordshift/referee.js'];

// A tiny world of words, with the puzzles the tests deal.
const WORDS = new Set(['cold', 'cord', 'card', 'ward', 'warm', 'word', 'worm', 'wore', 'core', 'bold', 'bolt',
  'head', 'heal', 'teal', 'tell', 'tall', 'tail', 'hell', 'hall', 'heat', 'teat']);
const PUZZLES = [
  { id: 't1', s: 'cold', t: 'warm', n: 4, lv: 'normal' },
  { id: 't2', s: 'head', t: 'tail', n: 5, lv: 'normal' },
  { id: 't3', s: 'cold', t: 'word', n: 2, lv: 'normal' }
];

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
  const R = FF.WordShiftRules;
  const RF = FF.WordShiftReferee;
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
  bus.subscribe(() => { const v = bus.read('rooms/' + code); if (v && v.ws) views.push(JSON.stringify(v.ws)); });
  const run = { matchId: 'w_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({ level: 'normal', rounds: 3, clock: 90 }, opts.settings || {}) };
  const mineT = FF.Transport.dev({ bus, root: 'wordshiftMine/' + code });
  await mineT.connect();
  const mineStore = { set: (uid, v) => mineT.set(uid, v), clear: () => mineT.set('', null) };
  const inbox = FF.Transport.dev({ bus, root: 'wordshiftInbox/' + code });
  await inbox.connect();
  const ref = RF.create({
    run, room, mine: mineStore, inbox, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); },
    puzzles: opts.puzzles || PUZZLES, isWord: (w) => WORDS.has(w)
  });
  await ref.start();
  await flush();
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    FF, R, RF, bus, clock, room, ref, mineStore, inbox,
    inboxTree: () => bus.read('wordshiftInbox/' + code), seats, saved, reports, run, views,
    ws: () => bus.read('rooms/' + code).ws || null,
    mine: (uid) => (bus.read('wordshiftMine/' + code) || {})[uid] || null,
    roomMine: () => (bus.read('rooms/' + code) || {}).wsMine,
    meta: () => bus.read('rooms/' + code).meta,
    async open() {
      const g = m.ws();
      const due = g.phase === 'starting' ? g.readyAt + RF.READY_MS : g.phase === 'ready' ? g.openAt : g.phase === 'reveal' ? g.nextAt + RF.READY_MS : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      assertEqual(m.ws().phase, 'open');
    },
    async send(uid, word, over) {
      const g = m.ws();
      const id = 'c' + tag + (++seq);
      await inbox.set(uid + '/' + id, Object.assign({ matchId: g.matchId, k: g.k, word, t: clock.now }, over || {}));
      await flush();
      return id;
      await flush();
    },
    // Walks a player along a route (the moves, without the start word).
    async walk(uid, route) { for (const w of route) { await clock.advance(1000); await m.send(uid, w); } }
  };
  return m;
}

const ROUTES = { t1: ['cord', 'card', 'ward', 'warm'], t2: ['heal', 'teal', 'tell', 'tall', 'tail'], t3: ['cord', 'word'] };

test('wordShift referee: everyone gets the same puzzle; the seed and the shortest length stay hidden', async function () {
  const m = await match();
  await m.open();
  const g = m.ws();
  assert(g.puzzle && g.puzzle.s && g.puzzle.t, 'puzzle published');
  assertEqual(g.puzzle.n, undefined, 'no shortest length while playing');
  assert(!/seed/.test(JSON.stringify(g)), 'no seed in the view');
  assertEqual(g.settings.rounds, 3);
});

test('wordShift referee: a good move advances only that player; nobody\'s words are in the shared view', async function () {
  const m = await match();
  await m.open();
  const p = m.ws().puzzle;
  const route = ROUTES[m.ws().puzzle.id];
  await m.clock.advance(500);
  await m.send('p1', route[0]);
  const g = m.ws();
  assertEqual(g.p.p1.moves, 1);
  assertEqual(g.p.p2.moves, 0);
  assertEqual(g.p.p1.greens, m.R.greenCount(route[0], p.t));
  assertEqual(m.mine('p1').word, route[0], 'the player sees their own word');
  assertEqual(m.mine('p2').word, p.s, 'the other player still has only the start word');
  assertEqual(m.roomMine(), undefined, 'no private words inside the room, which every signed-in player can read');
  assert(!JSON.stringify(m.bus.read('rooms/ROOM01')).includes('"' + route[0] + '"'), 'my word is nowhere in the room');
  m.views.forEach(function (v) { assert(v.indexOf('"' + route[0] + '"') === -1 || route[0] === p.t, 'a move leaked into the view'); });
});

test('wordShift referee: a refused real try counts as a move, is not applied, and says why', async function () {
  const m = await match();
  await m.open();
  const p = m.ws().puzzle;
  await m.send('p1', p.t);            // jumps too far: the screen never sends this, so it costs nothing
  assertEqual(m.ws().p.p1.moves, 0);
  assertEqual(m.ws().p.p1.invalid, 0);
  assertEqual(m.mine('p1').last.reason, 'many');
  assertEqual(m.mine('p1').word, p.s);
  await m.send('p1', p.s.slice(0, -1) + 'q');   // one letter changed, but not a word
  assertEqual(m.mine('p1').last.reason, 'word');
  assertEqual(m.ws().p.p1.invalid, 1);
  assertEqual(m.ws().p.p1.moves, 1, 'the refused try is a move');
  assertEqual(m.mine('p1').word, p.s, 'and the word goes back');
});

test('wordShift referee: first to the target gets 100, second 70, plus efficiency; round ends when all are done', async function () {
  const m = await match();
  await m.open();
  const id = m.ws().puzzle.id;
  const route = ROUTES[id];
  const n = PUZZLES.find((x) => x.id === id).n;
  await m.walk('p1', route);
  assertEqual(m.ws().p.p1.done, true);
  assertEqual(m.ws().p.p1.place, 1);
  assertEqual(m.ws().phase, 'open', 'still waiting for p2');
  await m.walk('p2', route);
  const g = m.ws();
  assertEqual(g.phase, 'reveal');
  assertEqual(g.last.results.p1.points, 100 + 100 - 15 * Math.max(0, route.length - n));
  assertEqual(g.last.results.p2.points, 70 + 100 - 15 * Math.max(0, route.length - n));
  assertEqual(g.last.n, n, 'the shortest length shows at the reveal');
});

test('wordShift referee: the clock ends a round; unfinished players score nothing', async function () {
  const m = await match({ settings: { clock: 90 } });
  await m.open();
  const route = ROUTES[m.ws().puzzle.id];
  await m.walk('p1', route);
  await m.clock.advance(m.ws().closeAt + m.RF.GRACE_MS + 1 - m.clock.now);
  const g = m.ws();
  assertEqual(g.phase, 'reveal');
  assertEqual(g.last.results.p2.points, 0);
  assertEqual(g.last.results.p2.done, false);
});

test('wordShift referee: moves after the target, for another round or match, or late, do nothing', async function () {
  const m = await match();
  await m.open();
  const route = ROUTES[m.ws().puzzle.id];
  await m.send('p1', route[0], { k: 5 });
  await m.send('p1', route[0], { matchId: 'w_other' });
  assertEqual(m.ws().p.p1.moves, 0);
  await m.send('p1', route[0], { t: m.ws().openAt - 5000 });
  assertEqual(m.ws().p.p1.moves, 0, 'sent before the round opened');
});

test('wordShift referee: moves go through an inbox outside the room, which no phone can read', async function () {
  const m = await match();
  await m.open();
  const route = ROUTES[m.ws().puzzle.id];
  await m.send('p1', route[0]);
  assertEqual(m.ws().p.p1.moves, 1);
  const room = m.bus.read('rooms/ROOM01');
  assertEqual(room.wsInbox, undefined, 'nothing in the room');
  assert(!JSON.stringify(room).includes('"' + route[0] + '"'), 'my word is nowhere in the room');
});

test('wordShift referee: a command seen again (a late echo, a restart) is never taken twice', async function () {
  const m = await match();
  await m.open();
  const g = m.ws();
  const cmd = { matchId: g.matchId, k: g.k, word: g.puzzle.s.slice(0, -1) + 'q', t: m.clock.now };
  await m.inbox.set('p1/cdup1', cmd);
  await flush();
  assertEqual(m.mine('p1').invalid, 1);
  const first = m.mine('p1').last.reason;
  assert(first !== 'same');
  // The clear has not landed yet when someone else moves: the same command comes back.
  await m.inbox.set('p1/cdup1', cmd);
  await m.send('p2', ROUTES[g.puzzle.id][0]);
  await flush();
  assertEqual(m.mine('p1').invalid, 1, 'one refused word costs once');
  assertEqual(m.mine('p1').last.reason, first, 'and no false "same word" afterwards');
});

test('wordShift referee: a player sends two moves: they are taken in the order they were sent', async function () {
  const m = await match();
  await m.open();
  const g = m.ws();
  const route = ROUTES[g.puzzle.id];
  // Two moves land together; their ids sort the wrong way round.
  await m.inbox.update('p1', {
    czzz: { matchId: g.matchId, k: g.k, word: route[0], t: m.clock.now },
    caaa: { matchId: g.matchId, k: g.k, word: route[1], t: m.clock.now + 5 }
  });
  await flush();
  assertEqual(m.mine('p1').moves, 2);
  assertEqual(m.mine('p1').invalid, 0);
});

test('wordShift referee: half-delivered commands wait until they are whole', async function () {
  const m = await match();
  await m.open();
  await m.inbox.set('p1/half', { matchId: m.ws().matchId });
  await flush();
  assertEqual(m.ws().p.p1.moves, 0);
  assert(m.inboxTree() && m.inboxTree().p1, 'kept for later');
});

test('wordShift referee: three rounds summed, ranked, reported, and the room ends', async function () {
  const m = await match();
  for (let r = 0; r < 3; r++) {
    await m.open();
    const route = ROUTES[m.ws().puzzle.id];
    await m.walk(r === 1 ? 'p2' : 'p1', route);
    await m.walk(r === 1 ? 'p1' : 'p2', route);
  }
  await m.clock.advance(m.R.REVEAL_MS + 10);
  const g = m.ws();
  assertEqual(g.phase, 'ended');
  assertEqual(g.result.winners.join(), 'p1');
  assertEqual(m.meta().status, 'ended');
  assertEqual(m.meta().results.gameId, 'wordShift');
  assertEqual(m.reports.length, 1);
  assertEqual(m.reports[0].e, 'wordshift');
  assertEqual(m.reports[0].p.seats.find((s) => s.uid === 'p1').won, true);
  // Three different puzzles.
  assertEqual(new Set(m.saved.value.deal).size, 3);
});

test('wordShift referee: a player who leaves is not waited for', async function () {
  const m = await match();
  await m.open();
  await m.room.update('players/p2', { online: false });
  await flush();
  await m.walk('p1', ROUTES[m.ws().puzzle.id]);
  assertEqual(m.ws().phase, 'reveal');
});

test('wordShift referee: a restarted referee carries on from the saved state', async function () {
  const saved = { value: null };
  const m = await match({ saved });
  await m.open();
  const route = ROUTES[m.ws().puzzle.id];
  await m.send('p1', route[0]);
  m.ref.stop();
  const RF = m.FF.WordShiftReferee;
  const again = RF.create({
    run: m.run, room: m.room, mine: m.mineStore, inbox: m.inbox, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(99), timers: m.clock, puzzles: PUZZLES, isWord: (w) => WORDS.has(w)
  });
  await again.start();
  await flush();
  assertEqual(m.ws().p.p1.moves, 1);
  await m.send('p1', route[1]);
  assertEqual(m.ws().p.p1.moves, 2);
});

test('wordShift rules: raceDeal deals distinct puzzles of the level from a seed', function () {
  const FF = loadFF(['js/core.js', 'js/wordshift/rules.js']);
  const R = FF.WordShiftRules;
  const big = [];
  for (let i = 0; i < 40; i++) big.push({ id: 'n' + i, s: 'a', t: 'b', n: 4, lv: i % 2 ? 'normal' : 'hard' });
  const a = R.raceDeal(big, 'normal', 'seed1', 5);
  assertEqual(a.length, 5);
  assertEqual(new Set(a).size, 5);
  a.forEach((id) => assertEqual(big.find((p) => p.id === id).lv, 'normal'));
  assertEqual(R.raceDeal(big, 'normal', 'seed1', 5).join(), a.join(), 'same seed, same deal');
  assert(R.raceDeal(big, 'normal', 'seed2', 5).join() !== a.join(), 'another seed, another deal');
});
