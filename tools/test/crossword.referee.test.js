'use strict';
/* Mini Crossword online: whole matches refereed by js/crossword/referee.js over the app's dev
   transport with a hand-moved clock. Race (everyone solves their own copy; checking on sends a
   word at a time, Expert sends the whole grid) and Co-op (one shared grid, letter by letter).
   The answers stay on the server: the room only ever sees the shape, the clues and progress. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const FILES = ['js/core.js', 'js/crossword/rules.js', 'js/data/crosswords.js', 'js/net/transport.js', 'js/crossword/referee.js'];

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
  const R = FF.CrosswordRules;
  const RF = FF.CrosswordReferee;
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
  const saved = { value: null };
  const reports = [];
  const writes = [];
  bus.subscribe((k) => writes.push(JSON.stringify(bus.read(k))));
  const settings = Object.assign({ level: 'easy', pack: 'animals', checking: 'on', play: 'race' }, opts.settings || {});
  const run = { matchId: 'x_1', roomCode: code, hostUid: 'p1', seats, startAt: clock.now + 1000, settings };
  const ref = RF.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const m = {
    FF, R, RF, bus, clock, room, ref, seats, saved, reports, writes, run,
    cw: () => bus.read('rooms/' + code).cw || null,
    meta: () => bus.read('rooms/' + code).meta,
    puzzle: () => R.pick(FF.data.crosswords, Object.assign({}, m.cw().settings, { sharedDeal: true }), m.saved.value.seed),
    built: () => R.build(m.puzzle()),
    answer: (id) => R.answer(m.puzzle(), id),
    async play() { await clock.advance(1000 + RF.BRIEF_MS + 1); assertEqual(m.cw().status, 'play'); },
    async send(uid, cmd) {
      const full = Object.assign({ matchId: m.cw().matchId, t: clock.now }, cmd);
      await room.set('cwInbox/' + uid + '/c' + tag + (++seq), full);
      await flush();
    },
    word: (uid, id, text) => m.send(uid, { type: 'word', word: id, text: text == null ? m.answer(id) : text }),
    grid: (uid, rows) => m.send(uid, { type: 'grid', text: (rows || m.puzzle().rows).join('/') }),
    fill: (uid, r, c, ch, over) => m.send(uid, Object.assign({ type: 'fill', r, c, ch }, over || {}))
  };
  return m;
}

async function solveAll(m, uid) {
  for (const w of m.built().words) await m.word(uid, w.id);
}

test('crossword race: the view never contains an answer', async function () {
  const m = await match();
  await m.play();
  const words = m.built().words.map((w) => m.answer(w.id));
  await m.word('p1', words.length ? m.built().words[0].id : '1A');
  await m.word('p2', m.built().words[0].id, 'ZZZ');
  await solveAll(m, 'p1');
  const cw = m.cw();
  assert(cw.shape && cw.shape.blocks && cw.shape.clues, 'the shape and clues are public');
  assert(!('rows' in cw.shape) && !('id' in cw.shape), 'no rows and no puzzle id');
  // Room writes may contain the whole room; only the cw branch must be answer-free.
  const leaks = m.writes.map((w) => JSON.parse(w)).filter((v) => v && v.cw).map((v) => JSON.stringify(v.cw))
    .filter((s) => words.some((a) => a.length >= 3 && s.indexOf('"' + a + '"') !== -1));
  assertEqual(leaks.length, 0, 'no answer string in the public view');
  assert(JSON.stringify(cw).indexOf(String(m.saved.value.seed)) === -1 || String(m.saved.value.seed).length < 4, 'the seed is not published');
});

test('crossword race: right word locks, wrong word does not, finish order ranks', async function () {
  const m = await match();
  await m.play();
  const first = m.built().words[0].id;
  await m.word('p1', first, 'QQQQQ'.slice(0, m.answer(first).length));
  assert(!m.cw().p.p1.solved || !m.cw().p.p1.solved[first], 'a wrong word does not lock');
  assertEqual(JSON.stringify(m.cw().p.p1.miss), JSON.stringify({ w: first, n: 1 }), 'the phone hears the word was wrong');
  await m.word('p1', first);
  assert(m.cw().p.p1.solved[first], 'a right word locks');
  assertEqual(m.cw().p.p1.done, 1);
  await m.clock.advance(4000);
  await solveAll(m, 'p2');
  assert(m.cw().p.p2.finishedAt, 'p2 finished first');
  assertEqual(m.cw().status, 'play', 'p1 is still solving');
  await m.clock.advance(3000);
  await solveAll(m, 'p1');
  const cw = m.cw();
  assertEqual(cw.status, 'over', 'everyone finished: the race is over');
  assertEqual(cw.result.rows.map((r) => r.uid).join(), 'p2,p1');
  assertEqual(cw.result.rows[0].place, 1);
  assert(cw.result.rows[0].points > cw.result.rows[1].points, 'the faster finisher scores more, not just the same word points (' + cw.result.rows.map((r) => r.points).join(' vs ') + ')');
  assertEqual(m.meta().results.gameId, 'miniCrossword');
  const rep = m.reports.filter((r) => r.e === 'crossword');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(), 'p2');
});

test('crossword race: a player who leaves is ranked by words solved when time runs out', async function () {
  const m = await match({ players: 3 });
  await m.play();
  const ids = m.built().words.map((w) => w.id);
  await m.word('p3', ids[0]);
  await m.word('p3', ids[1]);
  await m.word('p2', ids[0]);
  await m.room.update('players/p3', { online: false });
  await flush();
  await solveAll(m, 'p1');
  assertEqual(m.cw().status, 'play', 'p2 is still here and solving');
  await m.clock.advance(m.R.RACE_MS.easy + m.RF.GRACE_MS + 10);
  const cw = m.cw();
  assertEqual(cw.status, 'over');
  assertEqual(cw.result.rows.map((r) => r.uid).join(), 'p1,p3,p2', 'finisher, then most words');
  assertEqual(cw.result.rows[1].words, 2);
});

test('crossword race expert: one wrong square gives wrong:1, not finished, and a time penalty', async function () {
  const m = await match({ settings: { checking: 'on' }, players: 2 });
  const e = await match({ settings: { checking: 'expert' }, players: 2 });
  await m.play();
  await e.play();
  const rows = e.puzzle().rows.slice();
  const r0 = rows[0];
  const c0 = r0.search(/[A-Z]/);
  rows[0] = r0.slice(0, c0) + (r0[c0] === 'Q' ? 'Z' : 'Q') + r0.slice(c0 + 1);
  await e.grid('p1', rows);
  assertEqual(e.cw().p.p1.wrong, 1);
  assertEqual(e.cw().p.p1.checks, 1, 'each check is counted, so a phone knows its answer came');
  assert(!e.cw().p.p1.finishedAt, 'not finished');
  await e.clock.advance(1000);
  await e.grid('p1');
  const p1 = e.cw().p.p1;
  assert(p1.finishedAt, 'the right grid finishes');
  assert(p1.ms >= 20000 && p1.ms === p1.finishedAt - e.cw().playAt + 20000, 'the view gives the finish time with the penalty in it');
  await e.clock.advance(1000);
  await e.grid('p2');
  const rowsOut = e.cw().result.rows;
  const pa = rowsOut.filter((r) => r.uid === 'p1')[0].points, pb = rowsOut.filter((r) => r.uid === 'p2')[0].points;
  assert(pb > pa, 'the faster finish scores more (' + pb + ' vs ' + pa + ')');
  const a = rowsOut.filter((r) => r.uid === 'p1')[0];
  const b = rowsOut.filter((r) => r.uid === 'p2')[0];
  assert(a.ms >= 20000, 'the wrong check added 20 seconds');
  assertEqual(rowsOut[0].uid, 'p2', 'p2 sent a right grid later, but without the penalty');
  assert(b.ms < a.ms);
  // A word command in Expert, and a grid command with checking on, do nothing.
  await m.grid('p1');
  assert(!m.cw().p.p1.finishedAt, 'grid commands are Expert only');
});

test('crossword coop: two fills on one cell at once, the later t wins, everyone reads the same grid', async function () {
  const m = await match({ settings: { play: 'coop' } });
  await m.play();
  const w = m.built().words[0];
  const [r, c] = w.cells[0];
  const t = m.clock.now;
  const tag = 'same';
  // Both arrive in one write, newest first, so arrival order cannot decide.
  await m.room.set('cwInbox', {
    p1: { [tag + 'a']: { type: 'fill', matchId: 'x_1', r, c, ch: 'K', t: t + 5 } },
    p2: { [tag + 'b']: { type: 'fill', matchId: 'x_1', r, c, ch: 'J', t: t + 2 } }
  });
  await flush();
  assertEqual(m.cw().grid[r + '_' + c].ch, 'K');
  assertEqual(m.cw().grid[r + '_' + c].by, 'p1');
  await m.fill('p2', r, c, 'M', { t: t + 1 });
  assertEqual(m.cw().grid[r + '_' + c].ch, 'K', 'an older write never overwrites a newer one');
  await m.fill('p2', r, c, '', { t: t + 9 });
  assert(!(m.cw().grid || {})[r + '_' + c], 'an empty letter clears the square');
});

test('crossword coop: completing a word scores the completer; locked cells ignore fills', async function () {
  const m = await match({ settings: { play: 'coop' } });
  await m.play();
  const w = m.built().words[0];
  const a = m.answer(w.id);
  for (let i = 0; i < w.cells.length; i++) {
    const [r, c] = w.cells[i];
    await m.clock.advance(10);
    await m.fill(i === w.cells.length - 1 ? 'p2' : 'p1', r, c, a[i]);
  }
  assertEqual(m.cw().locked[w.id], 'p2', 'the last letter completed it');
  assert(m.cw().p.p2.points > 0 && !m.cw().p.p1.points, 'the completer scores');
  const [r, c] = w.cells[0];
  await m.fill('p1', r, c, 'Z');
  assertEqual(m.cw().grid[r + '_' + c].ch, a[0], 'a locked square keeps its letter');
  // A wrong word is marked bad until one of its squares changes.
  const v = m.built().words.filter((x) => !m.cw().locked[x.id] && x.cells.every(([rr, cc]) => !m.cw().grid[rr + '_' + cc]))[0];
  if (v) {
    for (let i = 0; i < v.cells.length; i++) await m.fill('p1', v.cells[i][0], v.cells[i][1], 'Q');
    assert(m.cw().bad[v.id], 'a full wrong word is marked');
    await m.fill('p1', v.cells[0][0], v.cells[0][1], '');
    assert(!m.cw().bad || !m.cw().bad[v.id], 'clearing a square clears the mark');
    await m.fill('p1', v.cells[0][0], v.cells[0][1], 'Z');
    assert(m.cw().bad[v.id], 'still wrong when full again');
  }
});

test('crossword coop: the match ends when every word is locked', async function () {
  const m = await match({ settings: { play: 'coop' } });
  await m.play();
  const rows = m.puzzle().rows;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== '#') { await m.clock.advance(5); await m.fill(r % 2 ? 'p2' : 'p1', r, c, rows[r][c]); }
    }
  }
  assertEqual(m.cw().status, 'over');
  assertEqual(Object.keys(m.cw().locked).length, m.built().words.length);
  assertEqual(m.meta().status, 'ended');
});

test('crossword referee: incomplete commands are skipped and other matches are ignored', async function () {
  const m = await match();
  await m.play();
  const id = m.built().words[0].id;
  await m.room.set('cwInbox/p1/half', { type: 'word', matchId: 'x_1', word: id });
  await flush();
  assert(m.bus.read('rooms/ROOM01').cwInbox && m.bus.read('rooms/ROOM01').cwInbox.p1.half, 'an incomplete command waits');
  assertEqual(m.cw().p.p1.done, 0);
  await m.room.update('cwInbox/p1/half', { text: m.answer(id), t: m.clock.now });
  await flush();
  assertEqual(m.cw().p.p1.done, 1, 'once complete it counts');
  await m.send('p2', { type: 'word', word: id, text: m.answer(id), matchId: 'x_other' });
  assertEqual(m.cw().p.p2.done, 0, 'another match is ignored');
  await m.word('p9', id);
  assert(!m.cw().p.p9, 'a stranger is ignored');
});

test('crossword referee: a restarted referee carries on with the same puzzle', async function () {
  const m = await match();
  await m.play();
  const id = m.built().words[0].id;
  await m.word('p1', id);
  const before = m.cw().shape.blocks;
  m.ref.stop();
  const ref2 = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(m.saved.value), save: (s) => { m.saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(99), timers: m.clock, report: () => Promise.resolve()
  });
  await ref2.start();
  await flush();
  assertEqual(m.cw().shape.blocks, before);
  assertEqual(m.cw().p.p1.done, 1, 'progress kept');
});

test('crossword referee: the crew runner loads it with the puzzles, and the runner hosts crosswordRuns', function () {
  const loader = require(path.join(ROOT, 'api/crew/lib/loader.js'));
  const S = loader.load();
  assert(S.CrosswordReferee && typeof S.CrosswordReferee.create === 'function', 'the referee is loaded');
  assert(S.data.crosswords && S.data.crosswords.length > 100, 'with the puzzles');
  const runner = fs.readFileSync(path.join(ROOT, 'api/crew/runner.js'), 'utf8');
  assert(/rtdb\.stream\('crosswordRuns'/.test(runner), 'the runner watches crosswordRuns');
  assert(/crossword: Array\.from\(crosswords\.keys\(\)\)/.test(runner), 'and reports them in the heartbeat');
});

test('crossword race: on a big grid the faster finisher still scores more than the slower one', async function () {
  const m = await match({ settings: { level: 'normal', pack: 'mixed' } });
  await m.play();
  await solveAll(m, 'p2');
  await m.clock.advance(60000);
  await solveAll(m, 'p1');
  const rows = m.cw().result.rows;
  assertEqual(rows[0].uid, 'p2');
  assert(rows[0].points > rows[1].points, 'faster scores more: ' + rows.map((r) => r.uid + '=' + r.points).join(' '));
});
