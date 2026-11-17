'use strict';
/* WordShift online Race, a phone's side (js/wordshift/client.js): it follows the shared view and
   its own private words, sends one move at a time to the referee, and never sees anyone else's
   words. Played against the real referee over the dev transport with a hand-moved clock. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/wordshift/rules.js', 'js/net/transport.js', 'js/wordshift/referee.js', 'js/wordshift/client.js'];
const WORDS = new Set(['cold', 'cord', 'card', 'ward', 'warm', 'word', 'worm', 'core', 'bold']);
const PUZZLES = [{ id: 't1', s: 'cold', t: 'warm', n: 4, lv: 'normal' }, { id: 't3', s: 'cold', t: 'word', n: 2, lv: 'normal' }];

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
function makeBus() {
  const store = {};
  const listeners = [];
  return {
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
      c.now = j.at; c.jobs.shift(); j.fn();
    }
    c.now = end;
    await flush();
  };
  return c;
}

async function setup() {
  const FF = loadFF(FILES);
  const bus = makeBus();
  const clock = makeClock(1000000);
  const code = 'ROOM02';
  async function tab() {
    const T = FF.Transport.dev({ bus, root: 'rooms/' + code });
    await T.connect();
    T.serverNow = () => clock.now;
    return T;
  }
  const refT = await tab();
  async function mineTab() {
    const T = FF.Transport.dev({ bus, root: 'wordshiftMine/' + code });
    await T.connect();
    T.serverNow = () => clock.now;
    return T;
  }
  const refMine = await mineTab();
  const players = { p1: { name: 'A', online: true }, p2: { name: 'B', online: true } };
  await refT.set('', { meta: { status: 'playing', hostUid: 'p1', wsMatch: 'w_1' }, players });
  let x = 7;
  const ref = FF.WordShiftReferee.create({
    run: { matchId: 'w_1', roomCode: code, seats: ['p1', 'p2'], startAt: clock.now, settings: { level: 'normal', rounds: 1, clock: 90 } },
    room: refT, mine: { set: (uid, v) => refMine.set(uid, v), clear: () => refMine.set('', null) }, randomInt: (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; }, timers: clock,
    puzzles: PUZZLES, isWord: (w) => WORDS.has(w)
  });
  await ref.start();
  const changes = { p1: 0, p2: 0 };
  const c1 = FF.WordShiftClient.create({ room: { transport: await tab(), uid: 'p1', code }, openMine: mineTab, onChange: () => changes.p1++ });
  const c2 = FF.WordShiftClient.create({ room: { transport: await tab(), uid: 'p2', code }, openMine: mineTab, onChange: () => changes.p2++ });
  await flush();
  async function open() {
    const ws = c1.view().ws;
    await clock.advance(Math.max(0, ws.readyAt - clock.now) + FF.WordShiftReferee.READY_MS + 1);
  }
  return { FF, bus, clock, ref, c1, c2, changes, open, code };
}

test('wordshift client: follows the shared view and is ready only once a phase has arrived in full', async () => {
  const s = await setup();
  const C = s.FF.WordShiftClient;
  const v = s.c1.view();
  assertEqual(v.ws.phase, 'starting');
  assertEqual(v.seated, true);
  assert(C.ready(v.ws), 'starting is ready');
  assert(s.changes.p1 > 0, 'the screen was told');
  assertEqual(C.ready({ settings: {}, phase: 'open', k: 0 }), false, 'an open round without its puzzle');
  assertEqual(C.ready({ settings: {}, phase: 'reveal', k: 0, puzzle: { s: 'cold', t: 'warm' } }), false, 'a reveal without results');
  assertEqual(C.ready({ settings: {}, phase: 'ended' }), false, 'an end without results');
  await s.open();
  const ws = s.c1.view().ws;
  assertEqual(ws.phase, 'open');
  assert(C.ready(ws), 'open with its puzzle');
  assertEqual(s.c1.view().mine.word, ws.puzzle.s, 'my own word starts at the start word');
});

test('wordshift client: one move at a time, my words stay mine, refused moves come back with a reason', async () => {
  const s = await setup();
  assertEqual(s.c1.send('cord'), false, 'nothing is sent before the clock starts');
  await s.open();
  const start = s.c1.view().ws.puzzle.s;
  assertEqual(start, 'cold');
  assertEqual(s.c1.send('cold'), false, 'the same word is never sent');
  assertEqual(s.c1.send('cord'), true);
  assertEqual(s.c1.send('card'), false, 'a second move waits for the first');
  assertEqual(s.c1.view().pending, 'cord');
  await s.clock.advance(100);
  const mine = s.c1.view().mine;
  assertEqual(mine.word, 'cord');
  assertEqual(mine.moves, 1);
  assertEqual(s.c1.view().pending, null, 'the referee answered');
  assertEqual(s.c2.view().mine.word, 'cold', 'the other phone has only its own words');
  assertEqual(s.c2.view().ws.p.p1.moves, 1, 'and sees my count');
  assert(!JSON.stringify(s.c2.view().ws).includes('cord'), 'but never my word');
  assertEqual(s.c1.send('cxrd'), true, 'a non-word still goes: the referee counts it');
  await s.clock.advance(100);
  const bad = s.c1.view().mine;
  assertEqual(bad.last.ok, false);
  assertEqual(bad.last.reason, 'word');
  assertEqual(bad.invalid, 1);
  assertEqual(bad.word, 'cord', 'a refused move leaves the word alone');
});

test('wordshift client: reaching the target ends my moves; a lost command can be sent again', async () => {
  const s = await setup();
  await s.open();
  for (const w of ['cord', 'card', 'ward', 'warm']) { assertEqual(s.c1.send(w), true, w); await s.clock.advance(100); }
  assertEqual(s.c1.view().mine.done, true);
  assertEqual(s.c1.view().ws.p.p1.done, true);
  assertEqual(s.c1.send('ward'), false, 'nothing after the target');
  // A write that never reaches the referee lets the player try again.
  const seen = { ws: s.c2.view().ws, p2: s.c2.view().mine };
  const T = { watch: (p, fn) => { fn(seen[p]); return () => {}; }, set: () => Promise.reject(new Error('offline')), serverNow: () => s.clock.now };
  const c3 = s.FF.WordShiftClient.create({ room: { transport: T, uid: 'p2', code: s.code }, openMine: () => T });
  await flush();
  assertEqual(c3.send('cord'), true);
  await flush();
  assertEqual(c3.view().pending, null, 'the failed move is released');
});

test('wordshift client: stop stops listening', async () => {
  const s = await setup();
  s.c1.stop();
  const before = s.changes.p1;
  await s.open();
  assertEqual(s.changes.p1, before);
});
