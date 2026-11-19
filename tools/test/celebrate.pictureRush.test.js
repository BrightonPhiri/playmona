'use strict';
/* Picture Rush (Celebrations): the shared rules (js/celebrate/pictureRush/rules.js) and whole games
   refereed by js/celebrate/pictureRush/referee.js over the dev transport with a hand-moved clock:
   teams sharing one board, swaps from two phones at once, held tiles, out-of-date boards, replays,
   solving, running out of time, hints, the organiser's pause / next / end, people moving team,
   and a restarted referee. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FILES = ['js/core.js', 'js/net/transport.js', 'js/celebrate/pictureRush/rules.js', 'js/celebrate/pictureRush/referee.js'];

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
}
const PHOTO = (i) => ({ id: 'm_' + String(i).padStart(24, '0'), title: 'Photo ' + i, hint: 'Hint ' + i, url: '/api/c/media/p' + i });

/* ---------- rules ---------- */

test('picture rush rules: settings keep to the offered values and photos are checked', function () {
  const R = loadFF(['js/core.js', 'js/celebrate/pictureRush/rules.js']).PictureRushRules;
  const d = R.sanitize({});
  assertEqual(d.level, 'medium');
  assertEqual(d.seconds, 120);
  assertEqual(d.reveal, 3);
  assertEqual(d.hints, 1);
  assertEqual(JSON.stringify(d.scoring), JSON.stringify({ base: 1000, speed: 500, hintCost: 100, partial: 500 }));
  const s = R.sanitize({
    level: 'impossible', seconds: 7, reveal: '5', hints: 9, rounds: 50,
    scoring: { base: 99999, speed: -5, hintCost: 'x', partial: 250.4 },
    photos: [PHOTO(1), { id: '../etc/passwd' }, PHOTO(2), null, { id: PHOTO(3).id, title: 'A\u0000very   long title '.repeat(10) }]
  });
  assertEqual(s.level, 'medium', 'unknown level');
  assertEqual(s.seconds, 120, 'unknown seconds');
  assertEqual(s.reveal, 5, 'numbers arrive as strings from forms');
  assertEqual(s.hints, 1);
  assertEqual(s.photos.length, 3, 'only real picture ids');
  assertEqual(s.rounds, 3, 'never more rounds than photos');
  assertEqual(s.scoring.base, 5000, 'capped');
  assertEqual(s.scoring.speed, 0, 'never below zero');
  assertEqual(s.scoring.hintCost, 100, 'nonsense falls back');
  assertEqual(s.scoring.partial, 250);
  assert(s.photos[2].title.length <= 60 && s.photos[2].title.indexOf('\u0000') === -1, 'titles are cleaned and short');
  assertEqual(R.grid({ level: 'easy' }), 3);
  assertEqual(R.grid({ level: 'expert' }), 6);
});

test('picture rush rules: the scramble is a whole picture with hardly any tile home, and seeded', function () {
  const R = loadFF(['js/core.js', 'js/celebrate/pictureRush/rules.js']).PictureRushRules;
  [3, 4, 5, 6].forEach((size) => {
    for (let s = 1; s < 60; s++) {
      const t = R.scramble(size, seeded(s));
      assertEqual(t.length, size * size);
      assertEqual(JSON.stringify(t.slice().sort((a, b) => a - b)), JSON.stringify(t.map((_, i) => i)), 'every piece once');
      assert(R.correct(t) <= (size <= 3 ? 1 : Math.floor(size / 2)), 'few tiles start home');
      assert(!R.solved(t), 'never solved');
    }
    assertEqual(JSON.stringify(R.scramble(size, seeded(7))), JSON.stringify(R.scramble(size, seeded(7))));
  });
  assert(R.solved(R.swap([1, 0, 2, 3], 0, 1)));
});

test('picture rush rules: points for solving, speed, hints and unfinished boards', function () {
  const R = loadFF(['js/core.js', 'js/celebrate/pictureRush/rules.js']).PictureRushRules;
  const sc = R.SCORING;
  assertEqual(R.roundPoints(sc, { solved: true, usedMs: 0, hints: 0, size: 3 }, 60000), 1500, 'instant: all of the speed bonus');
  assertEqual(R.roundPoints(sc, { solved: true, usedMs: 30000, hints: 0, size: 3 }, 60000), 1250, 'half the time left: half the bonus');
  assertEqual(R.roundPoints(sc, { solved: true, usedMs: 30000, hints: 2, size: 3 }, 60000), 1050, 'each hint costs');
  assertEqual(R.roundPoints(sc, { solved: false, correct: 1, startCorrect: 1, hints: 0, size: 3 }, 60000), 0, 'no progress, nothing');
  assertEqual(R.roundPoints(sc, { solved: false, correct: 5, startCorrect: 1, hints: 0, size: 3 }, 60000), 250, 'half way');
  assertEqual(R.roundPoints(sc, { solved: false, correct: 2, startCorrect: 0, hints: 3, size: 3 }, 60000), 0, 'never below zero');
  assert(R.roundPoints(sc, { solved: true, usedMs: 60000, hints: 0, size: 3 }, 60000) > R.roundPoints(sc, { solved: false, correct: 8, startCorrect: 0, size: 3 }, 60000),
    'a solved picture beats a nearly solved one');
});

test('picture rush rules: standings by points, then time, then who finished first; exact ties share', function () {
  const R = loadFF(['js/core.js', 'js/celebrate/pictureRush/rules.js']).PictureRushRules;
  const rows = R.ranked({
    a: { points: 2000, usedMs: 90000, lastFinish: 500 },
    b: { points: 2000, usedMs: 80000, lastFinish: 900 },
    c: { points: 2500, usedMs: 99999, lastFinish: 100 },
    d: { points: 2000, usedMs: 90000, lastFinish: 400 },
    e: { points: 2000, usedMs: 90000, lastFinish: 400 }
  });
  assertEqual(rows.map((r) => r.teamId).join(','), 'c,b,d,e,a');
  assertEqual(rows.map((r) => r.place).join(','), '1,2,3,3,5');
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
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

const CID = 'cel_' + 'a'.repeat(24);

async function game(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const R = app.PictureRushRules;
  const Ref = app.CelebrateReferees.pictureRush;
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(5000000);
  const room = app.Transport.dev({ bus, root: 'celebrations/' + CID });
  await room.connect();
  room.serverNow = () => clock.now;
  const teams = opts.teams || {
    t_gold: { name: 'Gold', color: '#D4A017', members: [{ uid: 'g1', name: 'Ann' }, { uid: 'g2', name: 'Ben' }] },
    t_ruby: { name: 'Ruby', color: '#C0392B', members: [{ uid: 'r1', name: 'Cat' }] }
  };
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = Object.assign({
    runId: 'r_1', cid: CID, gameId: 'g_1', template: 'pictureRush', name: 'Baby photos', instructions: 'Rebuild it',
    startAt: clock.now + 10000, teams,
    config: Object.assign({ level: 'easy', seconds: 60, reveal: 3, hints: 1, photos: [PHOTO(1), PHOTO(2)] }, opts.config || {})
  }, opts.run || {});
  const ref = Ref.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: opts.randomInt || seeded(42),
    timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const next = {};
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const g = {
    app, R, Ref, bus, clock, room, ref, saved, reports, run,
    view: () => (bus.read('celebrations/' + CID) || {}).run || null,
    board: (tid) => g.view().boards[tid],
    tiles: (tid) => R.list(g.board(tid).tiles),
    async toPlay() { await clock.advance(10000 + 3000); },
    async send(uid, cmd, over) {
      if (next[uid] == null) next[uid] = 0;
      const full = Object.assign({ runId: run.runId, n: next[uid], t: clock.now }, cmd, over || {});
      if (!over || over.n == null) next[uid]++;
      await room.set('inbox/' + uid + '/c' + tag + (++seq), full);
      await flush();
    },
    /* A swap that puts one more piece home on tid's board, sent by uid. */
    async goodSwap(uid, tid) {
      const t = g.tiles(tid);
      const a = t.findIndex((p, i) => p !== i);
      const b = t.indexOf(a);
      await g.send(uid, { type: 'swap', a, b, pa: t[a], pb: t[b] });
    },
    async solve(uid, tid) { let guard = 0; while (!g.board(tid).solved && guard++ < 50) await g.goodSwap(uid, tid); },
    async control(action, id) { await room.set('control', { runId: run.runId, id: id || ('k' + (++seq)), action }); await flush(); }
  };
  return g;
}

test('picture rush referee: a countdown, the picture shown whole, then the same scramble for every team', async function () {
  const g = await game();
  assertEqual(g.view().phase, 'starting');
  assertEqual(g.view().photo, null, 'no picture before the game starts');
  await g.clock.advance(10000);
  const v = g.view();
  assertEqual(v.phase, 'reveal');
  assertEqual(v.photo.url, '/api/c/media/p1');
  assertEqual(v.photo.title, '', 'the title is the answer: hidden while playing');
  assertEqual(v.size, 3);
  assertEqual(JSON.stringify(g.tiles('t_gold')), JSON.stringify(g.tiles('t_ruby')), 'fair: the same scramble');
  await g.goodSwap('g1', 't_gold');
  assertEqual(g.board('t_gold').moves, 0, 'no moves during the reveal');
  await g.clock.advance(3000);
  assertEqual(g.view().phase, 'playing');
  assertEqual(g.view().deadline, g.view().playAt + 60000);
  assertEqual(g.view().teams.t_gold.players.g2, 'Ben');
});

test('picture rush referee: two teammates swapping at once both land, and the board stays a whole picture', async function () {
  const g = await game({ config: { level: 'medium' } });
  await g.toPlay();
  const t = g.tiles('t_gold');
  // Two different swaps written at the same moment by two phones of the same team.
  const wrong = t.map((p, i) => i).filter((i) => t[i] !== i);
  const [a, b, c, d] = wrong;
  await Promise.all([
    g.room.set('inbox/g1/x1', { type: 'swap', runId: 'r_1', n: 0, a, b, pa: t[a], pb: t[b], t: g.clock.now }),
    g.room.set('inbox/g2/x1', { type: 'swap', runId: 'r_1', n: 0, a: c, b: d, pa: t[c], pb: t[d], t: g.clock.now })
  ]);
  await flush();
  const after = g.tiles('t_gold');
  assertEqual(g.board('t_gold').moves, 2, 'both swaps landed');
  assertEqual(JSON.stringify(after.slice().sort((x, y) => x - y)), JSON.stringify(after.map((_, i) => i)), 'every piece still once');
  assertEqual(after[a], t[b]);
  assertEqual(after[c], t[d]);
  assertEqual(JSON.stringify(g.tiles('t_ruby')), JSON.stringify(t), 'the other team\'s board is untouched');
});

test('picture rush referee: a swap from an out-of-date board is refused, a held tile cannot be taken, and holds run out', async function () {
  const g = await game();
  await g.toPlay();
  const t = g.tiles('t_gold');
  await g.send('g1', { type: 'swap', a: 0, b: 1, pa: t[1], pb: t[0] });
  assertEqual(g.board('t_gold').moves, 0, 'the pieces were not where the phone thought');
  await g.send('g1', { type: 'pick', a: 4 });
  assertEqual(g.board('t_gold').held.g1, 4, 'everyone sees who holds what');
  await g.send('g2', { type: 'pick', a: 4 });
  assert(g.board('t_gold').held.g2 == null, 'a teammate cannot pick up a held tile');
  await g.send('g2', { type: 'swap', a: 4, b: 5, pa: t[4], pb: t[5] });
  assertEqual(g.board('t_gold').moves, 0, 'nor swap it');
  await g.clock.advance(g.R.HOLD_MS + 1);
  await g.send('g2', { type: 'swap', a: 4, b: 5, pa: t[4], pb: t[5] });
  assertEqual(g.board('t_gold').moves, 1, 'a tile held too long is free again');
  await g.send('g1', { type: 'drop' });
  assert(g.board('t_gold').held.g1 == null);
});

test('picture rush referee: a replayed command lands once; a lost one is skipped after a moment', async function () {
  const g = await game();
  await g.toPlay();
  const t = g.tiles('t_gold');
  const a = t.findIndex((p, i) => p !== i), b = t.indexOf(a);
  const cmd = { type: 'swap', a, b, pa: t[a], pb: t[b] };
  await g.send('g1', cmd, { n: 0 });
  await g.send('g1', cmd, { n: 0 });
  assertEqual(g.board('t_gold').moves, 1, 'the same n twice is one swap');
  assertEqual(g.view().n.g1, 1, 'the phone can read its next number back after a reload');
  const t2 = g.tiles('t_gold');
  const c = t2.findIndex((p, i) => p !== i), d = t2.indexOf(c);
  await g.send('g1', { type: 'swap', a: c, b: d, pa: t2[c], pb: t2[d] }, { n: 2 });
  assertEqual(g.board('t_gold').moves, 1, 'waits for n 1');
  await g.clock.advance(g.Ref.LOST_MS + 10);
  await g.send('g1', { type: 'drop' }, { n: 3 });
  assertEqual(g.board('t_gold').moves, 2, 'then carries on without it');
});

test('picture rush referee: solving scores with the time left; when every team is done the round ends early', async function () {
  const g = await game();
  await g.toPlay();
  await g.clock.advance(15000);
  await g.solve('g2', 't_gold');
  const gold = g.board('t_gold');
  assert(gold.solved, 'solved');
  assertEqual(gold.usedMs, 15000);
  assertEqual(g.view().phase, 'playing', 'Ruby is still going');
  await g.send('g1', { type: 'pick', a: 0 });
  assertEqual(g.board('t_gold').held.g1, undefined, 'a solved board takes no more moves');
  await g.clock.advance(15000);
  await g.solve('r1', 't_ruby');
  const v = g.view();
  assertEqual(v.phase, 'roundEnd', 'everyone solved: no waiting for the clock');
  assertEqual(v.photo.title, 'Photo 1', 'the answer shows at the round end');
  const row = g.app.PictureRushRules.list(v.results)[0];
  assertEqual(row.teams.t_gold.points, 1000 + Math.round(500 * 45 / 60));
  assertEqual(row.teams.t_ruby.points, 1000 + Math.round(500 * 30 / 60));
  assert(row.teams.t_gold.points > row.teams.t_ruby.points, 'faster scores more, whatever the team size');
  await g.clock.advance(g.Ref.ROUND_BREAK_MS);
  assertEqual(g.view().phase, 'reveal', 'next round after the break');
  assertEqual(g.view().round, 1);
  assertEqual(g.view().photo.url, '/api/c/media/p2');
  assertEqual(g.board('t_gold').moves, 0, 'fresh boards');
});

test('picture rush referee: time running out scores progress; hints cost; the game ends ranked and reports once', async function () {
  const g = await game({ config: { photos: [PHOTO(1)], hints: 2 } });
  await g.toPlay();
  await g.send('r1', { type: 'hint' });
  await g.send('r1', { type: 'hint' });
  await g.send('r1', { type: 'hint' });
  assertEqual(g.board('t_ruby').hints, 2, 'only the hints allowed');
  assert(g.board('t_ruby').hintUntil > g.clock.now, 'the picture shows for a moment');
  await g.solve('r1', 't_ruby');
  await g.goodSwap('g1', 't_gold');
  await g.goodSwap('g1', 't_gold');
  await g.clock.advance(60000);
  const v = g.view();
  assertEqual(v.phase, 'roundEnd');
  const row = g.app.PictureRushRules.list(v.results)[0];
  assertEqual(row.teams.t_gold.solved, false);
  assert(row.teams.t_gold.points > 0 && row.teams.t_gold.points < 500, 'a share of the unfinished points');
  assertEqual(row.teams.t_ruby.points, 1500 - 200, 'solved at once, two hints');
  await g.clock.advance(g.Ref.ROUND_BREAK_MS);
  const end = g.view();
  assertEqual(end.phase, 'ended');
  assertEqual(end.result.winners.join(), 't_ruby');
  assertEqual(g.app.PictureRushRules.list(end.result.rows)[0].teamId, 't_ruby');
  assertEqual(g.reports.length, 1, 'reported once');
  assertEqual(g.reports[0].e, 'celebration');
  assertEqual(g.reports[0].p.runId, 'r_1');
  assertEqual(g.reports[0].p.rounds[0].teams.t_ruby.points, 1300);
  await g.clock.advance(60000);
  assertEqual(g.reports.length, 1, 'never again');
});

test('picture rush referee: the organiser pauses, resumes, skips and ends', async function () {
  const g = await game();
  await g.clock.advance(10000);
  await g.control('next');
  assertEqual(g.view().phase, 'playing', 'next skips the reveal');
  const deadline = g.view().deadline;
  await g.clock.advance(5000);
  await g.control('pause');
  assertEqual(g.view().paused, true);
  await g.goodSwap('g1', 't_gold');
  assertEqual(g.board('t_gold').moves, 0, 'nothing moves while paused');
  await g.clock.advance(120000);
  assertEqual(g.view().phase, 'playing', 'the clock stands still');
  await g.control('resume');
  assertEqual(g.view().paused, false);
  assertEqual(g.view().deadline, deadline + 120000, 'the time left is the same as before the pause');
  await g.control('resume', 'same-id');
  await g.control('pause', 'same-id');
  assertEqual(g.view().paused, false, 'a control is acted on once');
  await g.goodSwap('g1', 't_gold');
  assertEqual(g.board('t_gold').moves, 1);
  await g.control('next');
  assertEqual(g.view().phase, 'roundEnd', 'next ends the round');
  await g.control('end');
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.view().result.why, 'stopped');
  assertEqual(g.reports.length, 1);
});

test('picture rush referee: a guest moved to another team plays for it; strangers change nothing', async function () {
  const g = await game();
  await g.toPlay();
  await g.room.set('members', { g1: { name: 'Ann', team: 't_gold' }, g2: { name: 'Ben', team: 't_ruby' }, r1: { name: 'Cat', team: 't_ruby' } });
  await flush();
  assertEqual(g.view().teams.t_ruby.players.g2, 'Ben');
  assert(g.view().teams.t_gold.players.g2 == null);
  await g.goodSwap('g2', 't_ruby');
  assertEqual(g.board('t_ruby').moves, 1, 'Ben now moves Ruby\'s tiles');
  assertEqual(g.board('t_gold').moves, 0);
  await g.goodSwap('zz', 't_gold');
  assertEqual(g.board('t_gold').moves, 0, 'someone in no team moves nothing');
  await g.send('g1', { type: 'swap', a: 0, b: 1, pa: 0, pb: 1 }, { runId: 'r_old' });
  assertEqual(g.board('t_gold').moves, 0, 'a command for another game does nothing');
});

test('picture rush referee: a restarted referee carries on with the same boards', async function () {
  const bus = makeBus();
  const clock = makeClock(5000000);
  const saved = { value: null };
  const g = await game({ bus, clock, saved });
  await g.toPlay();
  await g.goodSwap('g1', 't_gold');
  const before = JSON.stringify(g.tiles('t_gold'));
  const deadline = g.view().deadline;
  g.ref.stop();
  const g2 = await game({ bus, clock, saved, randomInt: seeded(999) });
  assertEqual(JSON.stringify(g2.tiles('t_gold')), before, 'same board');
  assertEqual(g2.view().deadline, deadline);
  await g2.send('g1', { type: 'drop' }, { n: 0 });
  assertEqual(g2.view().n.g1, 1, 'old command numbers are still known');
  await g2.solve('g1', 't_gold');
  assert(g2.board('t_gold').solved);
});

test('picture rush: the runner loads it and hosts celebrationRuns; the inbox rule matches the commands', function () {
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(loader.indexOf("'js/celebrate/pictureRush/rules.js'") !== -1 && loader.indexOf("'js/celebrate/pictureRush/referee.js'") !== -1, 'loader');
  const runner = fs.readFileSync(path.join(ROOT, 'api/crew/runner.js'), 'utf8');
  assert(/rtdb\.stream\('celebrationRuns'/.test(runner), 'the runner follows celebrationRuns');
  assert(/FF\.CelebrateReferees\[run\.template\]/.test(runner), 'by template');
  assert(/celebrationRuns\.close\(\)/.test(runner), 'and lets go of it');
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const inbox = rules.celebrations.$cid.inbox.$uid.$id;
  assert(/members/.test(inbox['.write']), 'only guests of the event write');
  assert(/!data\.exists\(\)/.test(inbox['.write']), 'a command is written once');
  ['type', 'runId', 'n', 'a', 'b', 'pa', 'pb', 't', '$other'].forEach((k) => assert(inbox[k], 'rule for ' + k));
  assertEqual(inbox.$other['.validate'], false);
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/CelebrationGames.php'), 'utf8');
  const R = loadFF(['js/core.js', 'js/celebrate/pictureRush/rules.js']).PictureRushRules;
  assert(php.indexOf("'seconds' => [" + R.SECONDS.join(', ') + ']') !== -1, 'the server offers the same seconds');
  assert(php.indexOf("'level' => ['" + R.LEVELS.join("', '") + "']") !== -1, 'and the same levels');
});

test('picture rush referee: once ended it leaves the next game\'s moves in the inbox', async function () {
  // The crew keeps an ended referee for a minute; the MC may start the next game straight away.
  const g = await game();
  await g.toPlay();
  await g.control('end');
  assertEqual(g.view().phase, 'ended');
  await g.room.set('inbox/g1/cnext', { type: 'swap', runId: 'r_2', n: 0, t: g.clock.now, a: 0, b: 1, pa: 1, pb: 0 });
  await g.clock.advance(100);
  const box = (g.bus.read('celebrations/' + CID) || {}).inbox || {};
  assert(box.g1 && box.g1.cnext, 'the next game\'s move waits for its own referee');
});
