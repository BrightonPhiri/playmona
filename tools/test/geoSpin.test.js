'use strict';
/* GeoSpin: the pure rules (js/geospin/rules.js) — settings, the country deal, the letter
   banks, the shared checker, hints and points — every country's border data and fact, and
   whole online matches refereed by js/geospin/referee.js over the app's dev transport with a
   hand-moved clock: secret seed, one round at a time, answers checked and timed by the server,
   one answer per round, late answers, results shown together, streaks and the final ranking. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const RULES = ['js/core.js', 'js/answerMatch.js', 'js/data/worldFlags.js', 'js/data/countryAliases.js', 'js/geospin/places.js', 'js/geospin/rules.js'];
const FILES = RULES.concat(['js/net/transport.js', 'js/geospin/referee.js']);
let cached = null;
const app = () => cached || (cached = loadFF(RULES.concat(['js/geospin/facts.js'])));

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
}
function count(list) {
  const c = {};
  list.forEach((ch) => { c[ch] = (c[ch] || 0) + 1; });
  return c;
}

/* ---------- data ---------- */

test('geospin data: every country has borders (or a point), a place to look at and a fact', function () {
  const FF = app();
  const codes = FF.data.worldFlags.countries.map((c) => c.code);
  assertEqual(codes.length, 194);
  codes.forEach((code) => {
    const p = FF.data.geoSpinPlaces[code];
    assert(p, code + ': has a place');
    assert(Array.isArray(p[0]), code + ': shape list');
    assert(p[1] >= -90 && p[1] <= 90 && p[2] >= -180 && p[2] <= 180, code + ': a real centre');
    assert(typeof FF.data.geoSpinFacts[code] === 'string' && FF.data.geoSpinFacts[code].length > 20, code + ': has a fact');
  });
});

/* ---------- settings and the deal ---------- */

test('geospin rules: sanitize keeps known settings, and only level and region make a run non-standard', function () {
  const R = app().GeoSpinRules;
  assertEqual(JSON.stringify(R.sanitize({ level: 'nope', region: 'mars', rounds: 7 })), JSON.stringify(R.STANDARD));
  assertEqual(R.sanitize({ rounds: '15' }).rounds, 15);
  assert(R.isStandard({ rounds: 5 }), 'the number of rounds is the game length');
  assert(!R.isStandard({ level: 'hard' }));
  assertEqual([R.secondsFor('easy'), R.secondsFor('normal'), R.secondsFor('hard'), R.secondsFor('expert')].join(), '30,25,20,15');
});

test('geospin deal: the same seed deals the same countries, no repeats, only from the region', function () {
  const FF = app();
  const R = FF.GeoSpinRules;
  const a = R.deal(R.sanitize({}), 'abc', 15);
  assertEqual(a.join(), R.deal(R.sanitize({}), 'abc', 15).join(), 'same seed, same countries');
  assert(a.join() !== R.deal(R.sanitize({}), 'abd', 15).join(), 'another seed, other countries');
  assertEqual(new Set(a).size, 15, 'no repeats');
  const byCode = {};
  FF.data.worldFlags.countries.forEach((c) => { byCode[c.code] = c; });
  R.REGIONS.filter((r) => r !== 'world').forEach((region) => {
    R.deal(R.sanitize({ region, level: 'hard' }), 'r' + region, 10).forEach((code) => assertEqual(byCode[code].region, region, region + ': ' + code));
  });
  const easy = R.deal(R.sanitize({ level: 'easy' }), 'e', 15);
  easy.forEach((code) => assert(FF.data.geoSpinPlaces[code][3] >= 0.5, 'easy skips tiny countries: ' + code));
});

/* ---------- letter banks ---------- */

test('geospin banks: every country at every level has all its letters, the right number of tiles, and spells itself', function () {
  const FF = app();
  const R = FF.GeoSpinRules;
  const codes = FF.data.worldFlags.countries.map((c) => c.code);
  R.LEVELS.forEach((level) => {
    codes.forEach((code, i) => {
      const rand = R.rng(R.hash(level + code + i));
      const target = R.pickFormat(code, rand);
      const b = R.bank(target, level, rand, R.relatedNames(code, rand));
      const need = count(b.letters);
      const have = count(b.tiles);
      Object.keys(need).forEach((ch) => assert((have[ch] || 0) >= need[ch], level + ' ' + code + ': enough ' + ch));
      const n = b.letters.length;
      const want = Math.min(Math.max(n + 2, Math.round(n * R.MULT[level])), Math.max(R.MAX_TILES, n));
      assertEqual(b.tiles.length, want, level + ' ' + code + ': tile count');
      assert(R.check(target, code).ok, level + ' ' + code + ': "' + target + '" passes its own check');
      assert(R.check(R.spelled(b.cells, b.letters), code).ok, level + ' ' + code + ': the filled slots pass (spaces are automatic)');
    });
  });
});

test('geospin banks: Hard and Expert hide look-alike names; the answer is never dealt spelled out', function () {
  const R = app().GeoSpinRules;
  const b = R.bank('Niger', 'expert', R.rng(1), ['Nigeria', 'Algeria']);
  const have = count(b.tiles);
  assert(have.A >= 1 && have.I >= 2, 'Nigeria can be made too');
  for (let s = 1; s < 200; s++) {
    const x = R.bank('Zimbabwe', 'normal', R.rng(s), []);
    assert(x.tiles.join('').indexOf('ZIMBABWE') === -1, 'not spelled out in a row');
  }
});

/* ---------- checking ---------- */

test('geospin check: other names and small mistakes pass; other countries never do', function () {
  const R = app().GeoSpinRules;
  const ok = (t, c) => assert(R.check(t, c).ok, t + ' is ' + c);
  const no = (t, c) => assert(!R.check(t, c).ok, t + ' is not ' + c);
  ok('United States', 'us'); ok('USA', 'us'); ok('America', 'us');
  ok('UK', 'gb'); ok('Great Britain', 'gb'); ok('Britain', 'gb');
  ok('Holland', 'nl'); ok('Russian Federation', 'ru'); ok('Czech Republic', 'cz'); ok('Czechia', 'cz');
  ok('Ivory Coast', 'ci'); ok("Cote d'Ivoire", 'ci');
  ok('ZIMBABWI', 'zw'); ok('portugall', 'pt'); ok('mozambiqe', 'mz');
  no('Nigeria', 'ne'); no('Niger', 'ng'); no('Iran', 'iq'); no('Iraq', 'ir');
  no('Slovakia', 'si'); no('Slovenia', 'sk'); no('Australia', 'at'); no('Austria', 'au');
  no('chda', 'td'); no('', 'zw'); no('Guinea', 'gq'); no('Dominica', 'do');
});

/* ---------- hints and points ---------- */

test('geospin hints: removable tiles are never needed letters; costs add up', function () {
  const R = app().GeoSpinRules;
  const b = R.bank('Kenya', 'hard', R.rng(5), ['Kenia']);
  const gone = R.removable(b.tiles, b.letters, R.rng(9));
  assertEqual(gone.length, R.REMOVE_N);
  const left = b.tiles.filter((_, i) => gone.indexOf(i) === -1);
  const need = count(b.letters);
  const have = count(left);
  Object.keys(need).forEach((ch) => assert(have[ch] >= need[ch], 'still has ' + ch));
  assertEqual(R.hintCost({ letter: 2, remove: true, continent: true }), 30 * 2 + 20 + 15);
});

test('geospin points: base by level, speed bonus, streak multiplier, hints off, nothing for wrong', function () {
  const R = app().GeoSpinRules;
  assertEqual(R.points({ level: 'normal', ok: false, ms: 0 }).total, 0);
  const fast = R.points({ level: 'normal', ok: true, ms: 0, streak: 1 });
  assertEqual(fast.base, 150);
  assertEqual(fast.speed, 75);
  assertEqual(fast.total, 225);
  assertEqual(R.points({ level: 'expert', ok: true, ms: 15000 }).total, 300, 'no speed bonus at the buzzer');
  assertEqual([R.streakMult(2), R.streakMult(3), R.streakMult(5), R.streakMult(10)].join(), '1,1.1,1.2,1.3');
  assertEqual(R.points({ level: 'easy', ok: true, ms: 30000, streak: 10 }).total, 130);
  assertEqual(R.points({ level: 'easy', ok: true, ms: 30000, hints: { letter: 5 } }).total, 0, 'never below zero');
});

test('geospin rounds: the same seed gives every phone the same round', function () {
  const R = app().GeoSpinRules;
  const cfg = R.sanitize({ level: 'hard' });
  const a = R.roundAt(cfg, 'xyz', 3);
  const b = R.roundAt(cfg, 'xyz', 3);
  assertEqual(JSON.stringify(a), JSON.stringify(b));
  assertEqual(a.seconds, 20);
  assert(a.continent, 'knows the continent');
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
  const R = FF.GeoSpinRules;
  const RF = FF.GeoSpinReferee;
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
  const run = { matchId: 'g_1', roomCode: code, seats, startAt: clock.now + 1000, settings: Object.assign({ level: 'normal', rounds: 5 }, opts.settings || {}) };
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
    gs: () => bus.read('rooms/' + code).gs || null,
    meta: () => bus.read('rooms/' + code).meta,
    row: (uid) => m.gs().p[uid],
    /* Wait until the next round's tiles are open. */
    async open() {
      const g = m.gs();
      const due = g.phase === 'starting' ? g.spinAt + R.SPIN_MS : g.phase === 'spin' ? g.openAt : g.phase === 'reveal' ? g.nextAt + R.SPIN_MS : clock.now;
      await clock.advance(Math.max(0, due - clock.now) + 1);
      assertEqual(m.gs().phase, 'open');
    },
    async answer(uid, text, over) {
      const g = m.gs();
      const cmd = Object.assign({ type: 'answer', matchId: g.matchId, k: g.k, text, t: clock.now }, over || {});
      await room.set('gsInbox/' + uid + '/c' + tag + (++seq), cmd);
      await flush();
    },
    target: () => m.gs().round.target
  };
  return m;
}

test('geospin referee: the seed stays secret; one round at a time, spinning first, then open', async function () {
  const m = await match();
  const g0 = m.gs();
  assertEqual(g0.phase, 'starting');
  assert(!('seed' in g0) && !g0.round, 'no seed and no country before the spin');
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 1);
  const g = m.gs();
  assertEqual(g.phase, 'spin');
  assertEqual(g.k, 0);
  assert(g.round && g.round.code && g.round.tiles, 'the round is published as the globe spins');
  assert(JSON.stringify(g).indexOf(m.saved.value.seed) === -1, 'the seed is never in the view');
  assertEqual(g.openAt, g.spinAt + m.R.SPIN_MS);
  assertEqual(g.closeAt, g.openAt + 25000);
  await m.open();
});

test('geospin referee: answers are checked, timed and scored on the server; results show together', async function () {
  const m = await match();
  await m.open();
  await m.clock.advance(5000);
  await m.answer('p1', m.target());
  assert(m.gs().p.p1.inK === 0, 'p1 has answered');
  assert(!m.gs().p.p1.last, 'but nobody sees how p1 did yet');
  assertEqual(m.gs().phase, 'open', 'still waiting for p2');
  await m.answer('p2', 'Atlantis');
  assertEqual(m.gs().phase, 'reveal', 'everyone in: reveal straight away');
  const g = m.gs();
  assertEqual(g.reveal.code, g.round.code);
  assert(g.p.p1.last.ok && !g.p.p2.last.ok);
  const want = m.R.points({ level: 'normal', ok: true, ms: 5001, secs: 25, streak: 1 }).total;
  assertEqual(g.p.p1.score, want, 'timed from when the tiles opened');
  assertEqual(g.p.p2.score, 0);
});

test('geospin referee: one answer per round; replays, wrong rounds, other matches and early answers do nothing', async function () {
  const m = await match({ players: 3 });
  await m.clock.advance(1000 + m.RF.BRIEF_MS + 10);
  await m.answer('p1', m.target());
  assertEqual(m.gs().p.p1.inK, -1, 'an answer while the globe still spins is refused');
  await m.open();
  await m.answer('p1', 'wrong');
  await m.answer('p1', m.target());
  await m.answer('p2', m.target(), { k: 4 });
  await m.answer('p2', m.target(), { matchId: 'g_other' });
  await m.answer('p3', m.target(), { t: m.clock.now - 60000 });
  assertEqual(m.gs().p.p2.inK, -1, 'wrong round and wrong match are refused');
  assertEqual(m.gs().p.p3.inK, -1, 'an answer stamped before the round opened is refused');
  await m.answer('p2', m.target());
  await m.answer('p3', m.target());
  assert(!m.gs().p.p1.last.ok, 'only p1\'s first answer counted');
  assert(m.gs().p.p2.last.ok);
});

test('geospin referee: time runs out, a late answer scores nothing, then the next round', async function () {
  const m = await match();
  await m.open();
  const g = m.gs();
  await m.answer('p1', m.target());
  await m.clock.advance(g.closeAt - m.clock.now + m.RF.GRACE_MS + 5);
  assertEqual(m.gs().phase, 'reveal');
  await m.answer('p2', m.target(), { k: 0 });
  assertEqual(m.gs().p.p2.score, 0, 'too late');
  assert(m.gs().p.p2.last && !m.gs().p.p2.last.ok, 'a timeout shows as not right');
  const first = m.gs().round.code;
  await m.open();
  assertEqual(m.gs().k, 1);
  assert(m.gs().round.code !== first, 'a new country');
});

test('geospin referee: streaks multiply, the match ends ranked and reports the result', async function () {
  const m = await match({ settings: { rounds: 5, level: 'easy' } });
  for (let k = 0; k < 5; k++) {
    await m.open();
    await m.answer('p1', m.target());
    await m.answer('p2', k === 2 ? 'nope' : m.target());
  }
  await m.clock.advance(m.R.REVEAL_MS + 10);
  const g = m.gs();
  assertEqual(g.phase, 'ended');
  assertEqual(g.p.p1.best, 5);
  assertEqual(g.p.p1.right, 5);
  assertEqual(g.p.p2.best, 2);
  assertEqual(g.result.winners.join(), 'p1');
  assert(g.p.p1.score > 5 * 100 * 1.4, 'streak bonus on the later rounds');
  const meta = m.meta();
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.gameId, 'geoSpin');
  assertEqual(meta.results.ranked[0].uid, 'p1');
  const rep = m.reports.filter((r) => r.e === 'geospin');
  assertEqual(rep.length, 1);
  assertEqual(rep[0].p.seats.filter((s) => s.won).map((s) => s.uid).join(), 'p1');
});

test('geospin referee: when a player leaves the others do not wait for them', async function () {
  const m = await match({ players: 3 });
  await m.open();
  await m.room.update('players/p3', { online: false });
  await flush();
  await m.answer('p1', m.target());
  await m.answer('p2', m.target());
  assertEqual(m.gs().phase, 'reveal');
});

test('geospin referee: a restarted referee carries on from the saved state with the same countries', async function () {
  const m = await match();
  await m.open();
  await m.answer('p1', m.target());
  const code0 = m.gs().round.code;
  const saved = m.saved;
  m.ref.stop();
  const again = m.RF.create({
    run: m.run, room: m.room, store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: seeded(7), timers: m.clock
  });
  await again.start();
  await flush();
  assertEqual(m.gs().round.code, code0, 'the same round');
  assertEqual(m.gs().p.p1.inK, 0, 'p1\'s answer is kept');
  await m.answer('p2', m.target());
  assertEqual(m.gs().phase, 'reveal');
  again.stop();
});
