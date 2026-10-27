'use strict';
/* The crew controller (js/crew/controller.js) playing a room over the app's own dev transport:
   ready when the host picks, one answer per round at the planned time and never after the round
   or game is over, heartbeats, leaving when no real player is left, and one report per game. */
const { loadFF, test, assert, assertEqual } = require('./harness');
const loader = require('../../api/crew/lib/loader.js');

const CREW = loader.load();

function makeBus() {
  const store = {};
  const listeners = [];
  return {
    read: (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))),
    write: (k, v) => { if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); listeners.slice().forEach((fn) => fn(k)); },
    subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; }
  };
}

/* A clock we move by hand, shared by the transport and the controller's timers. */
function makeClock(start) {
  const c = { now: start, jobs: [], n: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.n; c.jobs.push({ id, at: c.now + ms, fn }); return id; };
  c.clearTimeout = (id) => { c.jobs = c.jobs.filter((j) => j.id !== id); };
  c.setInterval = (fn, ms) => { const id = ++c.n; c.jobs.push({ id, at: c.now + ms, fn, every: ms }); return id; };
  c.clearInterval = c.clearTimeout;
  c.advance = async (ms) => {
    const end = c.now + ms;
    for (;;) {
      c.jobs.sort((a, b) => a.at - b.at);
      const j = c.jobs[0];
      if (!j || j.at > end) break;
      c.now = j.at;
      if (j.every) j.at += j.every; else c.jobs.shift();
      j.fn();
      await flush();
    }
    c.now = end;
    await flush();
  };
  return c;
}
const flush = () => new Promise((r) => setImmediate(r));

const CREW_UID = 'Crew0000000000000000000000AA';
const HUMAN = 'human1';

async function setup(opts) {
  opts = opts || {};
  const app = loadFF(['js/core.js', 'js/net/transport.js']);
  const bus = makeBus();
  const clock = makeClock(1_000_000);
  const host = app.Transport.dev({ bus, root: 'rooms/ROOM01' });
  await host.connect();
  host.serverNow = () => clock.now;
  await host.set('', {
    meta: { seed: 'seed1', status: 'lobby', appVersion: '2.0.0', hostUid: HUMAN, ownerUid: HUMAN, mode: opts.mode || 'players' },
    players: {
      [HUMAN]: { name: 'Ann', joinedAt: 1, lastSeen: clock.now, online: true },
      [CREW_UID]: { name: 'Tariro', avatar: 'amara', color: '#e4572e', teamId: null, joinedAt: 2, lastSeen: clock.now, online: true, away: false }
    }
  });
  const crewT = app.Transport.dev({ bus, root: 'rooms/ROOM01' });
  await crewT.connect();
  crewT.serverNow = () => clock.now;
  const reports = [];
  const run = { roomCode: 'ROOM01', gameId: 'familyQuiz', difficulty: 'normal',
    crew: { [CREW_UID]: { crewId: 'cr_1', uid: CREW_UID, name: 'Tariro', persona: Object.assign({ patience: 100, friendliness: 80 }, opts.persona || {}),
      skills: { familyQuiz: { skill: opts.skill == null ? 60 : opts.skill, level: 'medium' }, quickTap: { skill: 60, level: 'medium' } } } } };
  const ctl = CREW.CrewController.create({
    transport: crewT, run, matchId: 'm_1', timers: clock,
    report: (event, payload) => { reports.push({ event, payload }); return Promise.resolve({ stay: opts.stay !== false }); }
  });
  ctl.start();
  await flush();
  return { host, clock, ctl, reports };
}

async function startGame(w, gameId, settings) {
  await w.host.update('meta', { status: 'playing', gameId, startAt: w.clock.now, settings: settings || { difficulty: 'normal', timer: 20 }, pick: null });
  await flush();
}

async function openRound(w, n) {
  await w.host.set('rounds/' + n + '/startedAt', w.clock.now + 1200);
  await flush();
}

async function keepHumanHere(w) { await w.host.set('players/' + HUMAN + '/lastSeen', w.clock.now); }

test('crew controller: says ready when the host picks a game, only in the lobby', async function () {
  const w = await setup();
  await w.host.set('meta/pick', { id: 'pick1', gameId: 'familyQuiz', settings: {} });
  await w.clock.advance(500);
  assertEqual(await w.host.get('players/' + CREW_UID + '/ready'), null, 'takes a moment, like a person');
  await w.clock.advance(6000);
  assertEqual(await w.host.get('players/' + CREW_UID + '/ready'), 'pick1');
  w.ctl.stop();
});

test('crew controller: answers each round once, at the planned time, shaped like a phone\'s answer', async function () {
  const w = await setup();
  await startGame(w, 'familyQuiz');
  await openRound(w, 0);
  assertEqual(await w.host.get('rounds/0/answers/' + CREW_UID), null, 'not before the round opens');
  await w.clock.advance(1200 + 21000);
  const a = await w.host.get('rounds/0/answers/' + CREW_UID);
  assert(a, 'answered round 0');
  assertEqual(Object.keys(a).sort().join(','), 'choice,correct,ms');
  if (a.correct) assertEqual(await w.host.get('rounds/0/winner'), CREW_UID, 'a right answer claims the round in first mode');
  // Changes in the room (other answers arriving) never make it answer twice.
  await w.host.set('rounds/0/answers/' + HUMAN, { choice: 1, correct: false, ms: 900 });
  await w.clock.advance(30000);
  assertEqual(JSON.stringify(await w.host.get('rounds/0/answers/' + CREW_UID)), JSON.stringify(a));
  w.ctl.stop();
});

test('crew controller: nothing is written after the round is won or the game ended', async function () {
  const w = await setup({ skill: 100 });
  await startGame(w, 'familyQuiz');
  await openRound(w, 0);
  await w.host.set('rounds/0/winner', HUMAN);
  await w.clock.advance(30000);
  assertEqual(await w.host.get('rounds/0/answers/' + CREW_UID), null, 'the round was already won');
  await openRound(w, 1);
  await w.host.update('meta', { status: 'ended' });
  await w.clock.advance(30000);
  assertEqual(await w.host.get('rounds/1/answers/' + CREW_UID), null, 'the game ended');
  w.ctl.stop();
});

test('crew controller: Quick Tap taps land after the shared signal', async function () {
  const w = await setup();
  await startGame(w, 'quickTap', { difficulty: 'normal' });
  await openRound(w, 0);
  const signal = CREW.CrewBrains.view('quickTap', { seed: 'seed1', round: 0, difficulty: 'normal' }).schedule.signal;
  await w.clock.advance(1200 + signal - 1);
  assertEqual(await w.host.get('rounds/0/answers/' + CREW_UID), null, 'no tap before the signal');
  await w.clock.advance(3000);
  const a = await w.host.get('rounds/0/answers/' + CREW_UID);
  assert(a && ['tap', 'early', 'decoy', 'miss'].indexOf(a.kind) >= 0, JSON.stringify(a));
  w.ctl.stop();
});

test('crew controller: keeps its seats fresh with heartbeats', async function () {
  const w = await setup();
  const before = await w.host.get('players/' + CREW_UID + '/lastSeen');
  await keepHumanHere(w);
  await w.clock.advance(8000);
  assertEqual(await w.host.get('players/' + CREW_UID + '/lastSeen'), before + 8000);
  w.ctl.stop();
});

test('crew controller: leaves when no real player is left', async function () {
  const w = await setup();
  await w.host.set('players/' + HUMAN + '/online', false);
  await w.clock.advance(41000);
  assertEqual(w.reports.map((r) => r.event).join(), 'leave');
  assert(w.ctl.stopped());
});

test('crew controller: reports each finished game once, and stops when told to', async function () {
  const w = await setup({ stay: false });
  await startGame(w, 'familyQuiz');
  const startAt = await w.host.get('meta/startAt');
  const ranked = [{ uid: CREW_UID, points: 300 }, { uid: HUMAN, points: 150 }];
  await w.host.update('meta', { status: 'ended', results: { gameId: 'familyQuiz', startAt, ranked } });
  await flush();
  await w.host.set('meta/endedAt', 5);
  await flush();
  assertEqual(w.reports.length, 1);
  assertEqual(JSON.stringify(w.reports[0]), JSON.stringify({ event: 'game', payload: { gameId: 'familyQuiz', ranked } }));
  assert(w.ctl.stopped(), 'the server said the crew leave');
});

test('crew controller: team rooms put crew on the smaller team', async function () {
  const w = await setup({ mode: 'teams' });
  await w.host.set('players/' + HUMAN + '/teamId', 'team1');
  await w.host.set('meta/pick', { id: 'p', gameId: 'familyQuiz' });
  await flush();
  assertEqual(await w.host.get('players/' + CREW_UID + '/teamId'), 'team2');
  w.ctl.stop();
});
