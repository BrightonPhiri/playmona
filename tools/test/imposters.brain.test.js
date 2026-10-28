'use strict';
/* Crew players in Imposters (js/crew/brains/imposters.js), loaded the way the runner loads them:
   the strategy on its own, then crew seats playing a whole match against the referee through
   the same inbox a phone uses, reading only their own secrets. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');
const loader = require('../../api/crew/lib/loader.js');

const FF = loader.load();
const S = FF.CrewImposters.strategy;

/* mulberry32: an even spread from the very first draw, whatever the seed. */
function rnd(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  c.setInterval = (fn, ms) => { const id = ++c.n; c.jobs.push({ id, at: c.now + ms, fn, every: ms }); return id; };
  c.clearInterval = c.clearTimeout;
  c.advance = async (ms) => {
    const end = c.now + ms;
    for (;;) {
      await flush();
      c.jobs.sort((a, b) => a.at - b.at);
      const j = c.jobs[0];
      if (!j || j.at > end) break;
      c.now = j.at;
      if (j.every) j.at += j.every; else c.jobs.shift();
      j.fn();
    }
    c.now = end;
    await flush();
  };
  return c;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

const PAIR = {
  id: 'water-car', a: 'Water', b: 'Car',
  hintsA: ['wet', 'drink', 'ocean', 'rain', 'thirst', 'splash'],
  hintsB: ['drive', 'wheels', 'road', 'engine', 'garage', 'fuel'], shared: ['wash', 'clean']
};

function view(board, extra) {
  const order = Object.keys(board.r1 || {});
  const seats = {};
  order.forEach((u) => { seats[u] = { alive: true }; });
  return Object.assign({ matchId: 'm', phaseId: 1, mode: 'word', order, seats, board, candidates: order }, extra || {});
}

test('crew imposters: clues come from the crew player\'s own word and never give it away', function () {
  const secret = { word: 'Water', hints: PAIR.hintsA, shared: PAIR.shared, matchId: 'm' };
  const imp = view({});
  for (let i = 0; i < 50; i++) {
    const c = S.word.clue({ imp, uid: 'me', secret, level: 'medium', random: rnd(i + 1), myClues: [] });
    assert(PAIR.hintsA.concat(PAIR.shared).map((h) => h.toLowerCase()).indexOf(c.toLowerCase()) !== -1, 'own hints: ' + c);
    assertEqual(FF.ImpostersRules.validateClue(c, { secret: 'Water' }).ok, true);
  }
});

test('crew imposters: clues already on the board are not repeated', function () {
  const secret = { word: 'Water', hints: ['wet', 'drink'], shared: [], matchId: 'm' };
  const imp = view({ r1: { a: 'Wet', b: 'Drink' } });
  const c = S.word.clue({ imp, uid: 'me', secret, level: 'hard', random: rnd(3), myClues: [] });
  assert(['wet', 'drink'].indexOf(c.toLowerCase()) === -1, 'picked a fresh clue: ' + c);
});

test('crew imposters: a careful player who suspects it is the odd one out leans on shared clues', function () {
  // Everyone else clues for Car; this player has Water.
  const secret = { word: 'Water', hints: PAIR.hintsA, shared: PAIR.shared, matchId: 'm' };
  const imp = view({ r1: { a: 'Drive', b: 'Road', c: 'Engine', me: 'Wet' } });
  let shared = 0;
  for (let i = 0; i < 40; i++) {
    const c = S.word.clue({ imp, uid: 'me', secret, level: 'hard', random: rnd(i + 7), myClues: ['wet'] });
    if (PAIR.shared.indexOf(c.toLowerCase()) !== -1) shared++;
  }
  assert(shared >= 35, 'mostly shared clues (' + shared + ' of 40)');
});

test('crew imposters: a hard player votes for the clue that does not fit', function () {
  const secret = { word: 'Water', hints: PAIR.hintsA, shared: PAIR.shared, matchId: 'm' };
  const imp = view({ r1: { me: 'Wet', a: 'Ocean', b: 'Rain', odd: 'Engine' } }, { phase: 'vote' });
  let right = 0;
  for (let i = 0; i < 100; i++) if (S.vote({ imp, uid: 'me', secret, level: 'hard', random: rnd(i + 11) }) === 'odd') right++;
  assert(right >= 85, 'found the odd clue ' + right + ' times in 100');
  // Never itself, never someone out.
  imp.seats.odd.alive = false;
  for (let i = 0; i < 50; i++) {
    const v = S.vote({ imp, uid: 'me', secret, level: 'easy', random: rnd(i + 5) });
    assert(v !== 'me' && v !== 'odd', 'voted for ' + v);
  }
});

test('crew imposters: Number Imposter stops near the target, closer on hard', function () {
  const spread = (level) => {
    let sum = 0;
    for (let i = 0; i < 300; i++) sum += Math.abs(S.number.stopAt({ secret: { target: 6000 }, level, random: rnd(i + 1) }) - 6000);
    return sum / 300;
  };
  const easy = spread('easy'), hard = spread('hard');
  assert(hard < easy, 'hard ' + hard + ' < easy ' + easy);
  assert(hard < 400, 'hard players are close: ' + hard);
});

test('crew imposters: crew seats play a whole match through the inbox and read only their own secrets', async function () {
  const bus = makeBus();
  const clock = makeClock(5000000);
  const code = 'ROOMAI';
  const app = loadFF(['js/core.js', 'js/net/transport.js']);
  const dev = (root) => { const t = app.Transport.dev({ bus, root }); t.serverNow = () => clock.now; return t; };
  const host = dev('rooms/' + code);
  await host.connect();
  const crewUids = ['crewA', 'crewB', 'crewC'];
  const human = 'human1';
  const players = { [human]: { name: 'Ann', online: true } };
  crewUids.forEach((u, i) => { players[u] = { name: 'Crew ' + i, online: true }; });
  await host.set('', { meta: { seed: 's', status: 'lobby', appVersion: '2.0.0', hostUid: human }, players });

  // The referee, as the runner hosts it.
  const sec = dev('imposterSecrets/' + code);
  await sec.connect();
  const seats = [human].concat(crewUids);
  const run = { matchId: 'i_1', roomCode: code, seats, crew: { crewA: true, crewB: true, crewC: true }, startAt: clock.now,
    settings: { mode: 'word', imposters: 1, rounds: 3, clueSeconds: 30, discussSeconds: 60, difficulty: 'normal' }, pair: PAIR };
  const refRoom = dev('rooms/' + code);
  await refRoom.connect();
  const ref = FF.ImpostersReferee.create({
    run, room: refRoom, timers: clock, randomInt: (n) => crypto.randomInt(n),
    secrets: { set: (u, v) => sec.set(u, v), update: (u, v) => sec.update(u, v), clear: () => sec.set('', null) }
  });

  // The crew controller, with a secret reader that records every read.
  const reads = [];
  const crewT = dev('rooms/' + code);
  await crewT.connect();
  const sheets = {};
  crewUids.forEach((u) => { sheets[u] = { uid: u, name: u, persona: { patience: 60 }, skills: { imposters: { skill: 70, level: 'hard' } } }; });
  const ctl = FF.CrewController.create({
    transport: crewT, matchId: 'm_crew', timers: clock,
    run: { roomCode: code, gameId: 'imposters', difficulty: 'normal', crew: sheets },
    report: () => Promise.resolve({ stay: true }),
    secretOf: (uid) => { reads.push(uid); return sec.get(uid); }
  });
  ctl.start();
  await host.update('meta', { status: 'playing', gameId: 'imposters', startAt: clock.now, impMatch: 'i_1', settings: run.settings });
  await ref.start();
  await flush();

  const imp = () => bus.read('rooms/' + code).imp;
  const humanSend = async (type, extra) => {
    const i = imp();
    await host.set('impInbox/' + human + '/c' + crypto.randomBytes(6).toString('hex'), Object.assign({ type, matchId: i.matchId, phaseId: i.phaseId, t: clock.now }, extra || {}));
    await flush();
  };
  const keepHere = async () => {
    const values = {};
    seats.forEach((u) => { values['players/' + u + '/lastSeen'] = clock.now; });
    await host.update('', values);
  };

  // Play: the human answers each phase at once; the crew act on their own.
  let guard = 0;
  while (imp().phase !== 'ended' && guard++ < 200) {
    const i = imp();
    const me = i.seats[human];
    if (me.alive) {
      if (i.phase === 'reveal' && !me.ready) await humanSend('ready');
      if (i.phase === 'clues' && !me.submitted) await humanSend('clue', { clue: 'humanclue' + 'abcdef'[i.round] });
      if (i.phase === 'vote' && !me.voted) await humanSend('vote', { target: i.candidates.filter((u) => u !== human)[0] });
    }
    await keepHere();
    await clock.advance(4000);
  }
  assertEqual(imp().phase, 'ended', 'the match finished');
  const st = ref.state();
  // Every crew clue was accepted (they only sent valid ones) and they all voted or clued.
  crewUids.forEach((u) => {
    const fb = (bus.read('imposterSecrets/' + code) || {})[u];
    assert(!fb || !fb.feedback || ['stale', 'done', 'voted'].indexOf(fb.feedback.code) !== -1, u + ' was refused: ' + JSON.stringify(fb && fb.feedback));
  });
  const crewClues = Object.keys(st.board).reduce((n, k) => n + crewUids.filter((u) => st.board[k][u]).length, 0);
  assert(crewClues >= 3, 'crew gave clues (' + crewClues + ')');
  assert(Object.keys(st.allBallots).some((k) => crewUids.some((u) => st.allBallots[k][u])), 'crew voted');
  // Crew only ever read their own secrets.
  assert(reads.length > 0 && reads.every((u) => crewUids.indexOf(u) !== -1), 'secret reads: ' + Array.from(new Set(reads)).join(','));
  ctl.stop();
  ref.stop();
});

test('crew imposters: a failed secret read is retried, so the crew player still gives a clue', async function () {
  const clock = makeClock(1000);
  let cb = null;
  const sent = [];
  const T = {
    serverNow: () => clock.now,
    watch: (path, fn) => { cb = fn; return () => {}; },
    set: (path, v) => { sent.push({ path, v }); return Promise.resolve(); }
  };
  let reads = 0;
  const logs = [];
  const seats = FF.CrewImposters.create({
    transport: T, uids: ['c1'], crew: { c1: { skills: { imposters: { level: 'medium' } } } },
    later: (fn, ms) => clock.setTimeout(fn, ms), log: (m) => logs.push(m), random: rnd(3),
    secretOf: () => (++reads === 1 ? Promise.reject(new Error('read timed out')) : Promise.resolve({ word: 'Water', hints: PAIR.hintsA, shared: PAIR.shared, matchId: 'm' }))
  });
  seats.start();
  cb({ matchId: 'm', phaseId: 2, phase: 'clues', round: 1, deadline: clock.now + 45000, order: ['c1', 'h'], seats: { c1: { alive: true }, h: { alive: true } }, board: {} });
  await clock.advance(20000);
  const clue = sent.filter((s) => s.v.type === 'clue');
  assertEqual(clue.length, 1, 'one clue sent');
  assertEqual(reads, 2);
  assert(logs.some((m) => m.indexOf('read timed out') !== -1), 'the failure is logged');
  seats.stop();
});

test('crew imposters: in the talk, crew back either a vote or another clue round, and never more clues in the last round', function () {
  const kinds = { callVote: 0, moreClues: 0, none: 0 };
  for (let i = 0; i < 200; i++) {
    const p = S.discuss({ imp: { round: 1, final: false }, random: rnd(i + 1), persona: { patience: 50 } });
    kinds[p ? p.type : 'none']++;
  }
  assert(kinds.callVote > 20 && kinds.moreClues > 20, JSON.stringify(kinds));
  for (let i = 0; i < 100; i++) {
    const p = S.discuss({ imp: { round: 4, final: true }, random: rnd(i + 1), persona: { patience: 90 } });
    assertEqual(p.type, 'callVote');
  }
});
