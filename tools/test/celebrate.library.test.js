'use strict';
/* Library games at a celebration: the shared rules (js/celebrate/library/rules.js) and whole runs
   refereed by js/celebrate/library/referee.js over the dev transport with a hand-moved clock:
   one shared seed, the first score per phone, a team's best score, place points, the time limit,
   End, and a restarted referee. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/celebrate/library/rules.js'];

/* ---------- rules ---------- */

test('library rules: settings keep to the offered values', function () {
  const R = loadFF(RULES).LibraryRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify({ game: '', minutes: 10, prize: 3000 }));
  assertEqual(JSON.stringify(R.sanitize({ game: 'bibleVerseRush', minutes: '15', prize: '5000' })), JSON.stringify({ game: 'bibleVerseRush', minutes: 15, prize: 5000 }));
  assertEqual(R.sanitize({ game: 'bad id!', minutes: 7, prize: 999 }).game, '');
  assertEqual(R.sanitize({ minutes: 7 }).minutes, 10);
  assertEqual(R.sanitize({ prize: 999 }).prize, 3000);
  assertEqual(R.sanitize({ game: 'x'.repeat(41) }).game, '');
});

test('library rules: place points fall evenly from the prize', function () {
  const R = loadFF(RULES).LibraryRules;
  assertEqual([1, 2, 3, 4, 5].map((p) => R.placePoints(3000, p, 5)).join(','), '3000,2400,1800,1200,600');
  assertEqual(R.placePoints(1000, 2, 3), 670, 'to the nearest 10');
  assertEqual(R.placePoints(3000, 1, 1), 3000);
  assertEqual(R.placePoints(3000, 0, 3), 0);
});

test('library rules: ranking by best score, ties by who finished first, equal shares a place', function () {
  const R = loadFF(RULES).LibraryRules;
  const rows = R.ranked({ t_a: { score: 500, at: 30 }, t_b: { score: 900, at: 50 }, t_c: { score: 500, at: 10 } }, ['t_a', 't_b', 't_c', 't_d'], 3000);
  assertEqual(rows.map((r) => r.teamId + ':' + r.place + ':' + r.points).join(','), 't_b:1:3000,t_c:2:2000,t_a:3:1000,t_d:0:0');
  const tie = R.ranked({ t_a: { score: 500, at: 10 }, t_b: { score: 500, at: 10 } }, ['t_a', 't_b'], 3000);
  assertEqual(tie.map((r) => r.place + ':' + r.points).join(','), '1:3000,1:3000', 'exact ties share');
});

test('library rules: a play link carries the run and comes back the same', function () {
  const R = loadFF(RULES).LibraryRules;
  const o = { cid: 'cel_abc', runId: 'r_1', game: 'bibleVerseRush', seed: 'abc123', uid: 'u_9-x', back: '/c/vicky' };
  const hash = R.link('/play', o).split('#')[1];
  assert(/^celebrate=[A-Za-z0-9_-]+$/.test(hash), hash);
  assertEqual(JSON.stringify(R.decode('#' + hash)), JSON.stringify(o));
  assertEqual(R.decode('#celebrate=zz'), null);
  assertEqual(R.decode('#other=1'), null);
  assertEqual(R.decode('#' + R.link('/play', Object.assign({}, o, { back: 'https://evil.example/' })).split('#')[1]).back, '/', 'only a link on this site');
});

test('library: the server offers the same settings', function () {
  const R = loadFF(RULES).LibraryRules;
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/CelebrationGames.php'), 'utf8');
  assert(php.indexOf("LIBRARY = ['minutes' => [" + R.MINUTES.join(', ') + "], 'prize' => [" + R.PRIZES.join(', ') + ']]') !== -1, 'minutes and prizes');
  assert(php.indexOf("LIBRARY_DEFAULTS = ['minutes' => " + R.DEFAULTS.minutes + ", 'prize' => " + R.DEFAULTS.prize + ']') !== -1, 'standards');
  assert(/TEMPLATES = \[[^\]]*'library'/.test(php), 'template');
});

/* ---------- the referee ---------- */

const FILES = RULES.concat(['js/net/transport.js', 'js/celebrate/library/referee.js']);

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

const CID = 'cel_' + 'l'.repeat(24);

async function game(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const Ref = app.CelebrateReferees.library;
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(5000000);
  const room = app.Transport.dev({ bus, root: 'celebrations/' + CID });
  await room.connect();
  room.serverNow = () => clock.now;
  const teams = opts.teams || {
    t_gold: { name: 'Gold', color: '#D4A017', members: [{ uid: 'g1', name: 'Ann' }, { uid: 'g2', name: 'Ben' }] },
    t_ruby: { name: 'Ruby', color: '#C0392B', members: [{ uid: 'r1', name: 'Cat' }] },
    t_jade: { name: 'Jade', color: '#1E8449', members: [] }
  };
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = {
    runId: 'r_1', cid: CID, gameId: 'g_1', template: 'library', name: 'Verse Rush', instructions: 'Play on your phone',
    startAt: clock.now + 10000, teams, celebrant: 'Vicky Banda',
    config: Object.assign({ game: 'bibleVerseRush', minutes: 10, prize: 3000 }, opts.config || {}),
    waitReady: !!opts.waitReady
  };
  let x = 7;
  const ref = Ref.create({
    run, room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; }, timers: clock,
    report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  const next = {};
  const tag = crypto.randomBytes(4).toString('hex');
  let seq = 0;
  const g = {
    app, Ref, bus, clock, room, ref, saved, reports, run,
    view: () => (bus.read('celebrations/' + CID) || {}).run || null,
    async toPlay() { await clock.advance(10000); },
    async score(uid, score, over) {
      if (next[uid] == null) next[uid] = 0;
      const full = Object.assign({ type: 'score', runId: run.runId, n: next[uid]++, t: clock.now, score, ms: 60000 }, over || {});
      await room.set('inbox/' + uid + '/c' + tag + (++seq), full);
      await flush();
    },
    async control(action) { await room.set('control', { runId: run.runId, id: 'k' + (++seq), action }); await flush(); }
  };
  return g;
}

test('library referee: a countdown, then playing with one seed and a deadline', async function () {
  const g = await game();
  assertEqual(g.view().phase, 'starting');
  assertEqual(g.view().game, 'bibleVerseRush');
  await g.toPlay();
  const v = g.view();
  assertEqual(v.phase, 'playing');
  assert(typeof v.seed === 'string' && v.seed.length >= 8, 'a seed');
  assertEqual(v.endsAt, g.clock.now + 10 * 60000);
  assertEqual(v.total, 2, 'Jade has nobody');
});

test('library referee: the first score per phone counts, a team keeps its best', async function () {
  const g = await game();
  await g.toPlay();
  await g.score('g1', 400);
  await g.score('g1', 9000);
  assertEqual(g.view().finished.t_gold.score, 400, 'one go each');
  await g.score('g2', 700);
  assertEqual(g.view().finished.t_gold.score, 700, 'the better teammate counts');
  assertEqual(g.view().finished.t_gold.by, 'Ben');
  assertEqual(g.view().phase, 'playing', 'Ruby has not finished');
  assertEqual(g.view().mine.g1, 400);
});

test('library referee: every team in, it ends with place points and reports once', async function () {
  const g = await game();
  await g.toPlay();
  await g.score('g1', 400);
  await g.score('r1', 800);
  const v = g.view();
  assertEqual(v.phase, 'ended');
  assertEqual(v.result.rows.map((r) => r.teamId + ':' + r.place + ':' + r.points).join(','), 't_ruby:1:3000,t_gold:2:1500,t_jade:0:0');
  assertEqual(g.reports.length, 1);
  const p = g.reports[0].p;
  assertEqual(p.template, 'library');
  assertEqual(p.ranked.length, 3);
  assertEqual(p.rounds[0].teams.t_ruby.points, 3000);
  await g.score('g2', 99999);
  assertEqual(g.reports.length, 1, 'nothing after the end');
});

test('library referee: the time runs out and whoever finished is ranked', async function () {
  const g = await game({ config: { minutes: 5 } });
  await g.toPlay();
  await g.score('g1', 400);
  await g.clock.advance(5 * 60000);
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.view().result.why, 'time');
  assertEqual(g.reports[0].p.ranked.map((r) => r.teamId + ':' + r.points).join(','), 't_gold:3000,t_jade:0,t_ruby:0');
});

test('library referee: nobody plays and it still ends on time', async function () {
  const g = await game();
  await g.toPlay();
  await g.clock.advance(10 * 60000);
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.reports.length, 1);
});

test('library referee: End stops it; old-run and junk scores are ignored', async function () {
  const g = await game();
  await g.toPlay();
  await g.score('g1', 400, { runId: 'r_old' });
  await g.score('g2', -5);
  await g.score('zz', 500);
  assertEqual(Object.keys(g.view().finished || {}).length, 0);
  await g.control('end');
  assertEqual(g.view().phase, 'ended');
  assertEqual(g.view().result.why, 'stopped');
});

test('library referee: scores before the start are ignored', async function () {
  const g = await game();
  await g.score('g1', 400);
  assertEqual(Object.keys(g.view().finished || {}).length, 0);
});

test('library referee: Start now while getting ready, then the countdown', async function () {
  const g = await game({ waitReady: true });
  await g.clock.advance(60000);
  assertEqual(g.view().phase, 'starting');
  await g.control('next');
  assertEqual(g.view().waitReady, false);
  await g.clock.advance(10000);
  assertEqual(g.view().phase, 'playing');
});

test('library referee: a restarted referee keeps the seed and the scores', async function () {
  const g = await game();
  await g.toPlay();
  await g.score('g1', 400);
  const seed = g.view().seed;
  g.ref.stop();
  await g.ref.flush();
  const h = await game({ bus: g.bus, clock: g.clock, saved: g.saved });
  assertEqual(h.view().seed, seed);
  assertEqual(h.view().finished.t_gold.score, 400);
  await h.score('r1', 100);
  assertEqual(h.view().phase, 'ended');
});

test('library: the runner loads it; the inbox rule takes score and ms', function () {
  const loader = fs.readFileSync(path.join(ROOT, 'api/crew/lib/loader.js'), 'utf8');
  assert(loader.indexOf("'js/celebrate/library/rules.js'") !== -1 && loader.indexOf("'js/celebrate/library/referee.js'") !== -1, 'loader');
  const panel = fs.readFileSync(path.join(ROOT, 'js/celebrate/livePanel.js'), 'utf8');
  assert(panel.indexOf("'js/celebrate/library/referee.js'") !== -1, 'the dev referee loads in the organiser tab');
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const inbox = rules.celebrations.$cid.inbox.$uid.$id;
  assert(inbox.score && /isNumber/.test(inbox.score['.validate']) && /<= 10000000/.test(inbox.score['.validate']), 'score');
  assert(inbox.ms && /isNumber/.test(inbox.ms['.validate']), 'ms');
});

/* ---------- the game page ---------- */

const FLOW = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/auth.js', 'js/cloud.js', 'js/gameConfig.js', 'js/leaderboards.js'];

function flow() {
  const FF = loadFF(FLOW);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  FF.Games.register({ id: 'quickTap', name: 'Quick Tap', category: 'reaction', players: [1, 8], modes: ['solo', 'turn'] });
  return FF;
}

test('library on the game page: a celebration run plays standard settings from the run seed, free, one go', function () {
  const FF = flow();
  FF.Settings.set('difficulty', 'hard');
  const def = FF.Games.get('quickTap');
  const cel = { cid: 'cel_abc', runId: 'r_1', game: 'quickTap', seed: 'k3y9x2p1abcd', uid: 'u1', back: '/c/vicky' };
  const config = FF.GameFlow.buildConfig(def, { celebration: cel });
  const std = FF.Leaderboards.standard();
  assertEqual([config.mode, config.difficulty, config.length, config.timer, config.clock], ['solo', std.difficulty, std.length, std.timer, 0]);
  assertEqual(config.sharedDeal, true);
  assertEqual(config.randomOrder, false);
  assertEqual(FF.GameFlow._seedFor(def, config), 'cel|k3y9x2p1abcd|quickTap|init');
  assertEqual(config.challengeSeed || null, null, 'never a friend challenge');
  assertEqual(FF.GameFlow._checksAccess({ celebration: cel }), false, 'no paywall, guest limit or switch');
  assertEqual(FF.GameFlow._canRestart({ config: config }), false);
  // Games skip their own setup screens for a challenge, so the run looks like one to them.
  assertEqual(config.challenge && config.challenge.celebration, true, 'games see a challenge and play the standard deal');
  assertEqual(config.challenge.seed, 'k3y9x2p1abcd');
});
