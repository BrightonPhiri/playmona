'use strict';
/* Mission Trail (js/missiontrail/*): grid rules, Stage 1 data, scoring,
   progress, the mission engine, the stage validator and the account sync merge. */
const { loadFF, test, assert, assertEqual, assertClose } = require('./harness');

const FILES = [
  'js/core.js',
  'js/data/missionTrailMaps.js',
  'js/data/missionTrailStages.js',
  'js/missiontrail/rules.js'
];

function load(extra) { return loadFF(FILES.concat(extra || [])); }

let shared = null;
function map(id) {
  shared = shared || load();
  const def = shared.data.missionTrailMaps.find(function (m) { return m.id === id; });
  if (!def) throw new Error('No map ' + id);
  return JSON.parse(JSON.stringify(def));
}

/* ---------------- Task 1: grid rules and Stage 1 data ---------------- */

test('mission trail: turn and move', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.turn('up', 'right'), 'right');
  assertEqual(R.turn('left', 'left'), 'down');
  assertEqual(R.move(m, { x: 5, y: 10, facing: 'up' }, 'up'), { x: 5, y: 9, facing: 'up', moved: true });
  assertEqual(R.move(m, { x: 5, y: 10, facing: 'up' }, 'left'), { x: 5, y: 10, facing: 'left', moved: false });
});

test('mission trail: the map edge blocks', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.move(m, { x: 5, y: 11, facing: 'down' }, 'down'), { x: 5, y: 11, facing: 'down', moved: false });
});

test('mission trail: buildings and props block, only checkable things check', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(m.walkable(8, 4), false);
  assertEqual(m.thingAt(8, 4).key, 'stopB');
  assertEqual(m.thing('stopB').check, true);
  assertEqual(m.thing('tree1').check, false);
  assertEqual(m.thing('b1').check, true);
  assertEqual(m.thingAt(3, 3).key, 'b1');
});

test('mission trail: stage 1 route ends beside bus stop B', function () {
  const FF = load(), R = FF.MissionTrail.Rules, s = FF.data.missionTrail.stages[0], m = R.buildMap(map(s.map));
  const r = R.routeCells(m, m.start, s.route);
  assert(r.ok, 'route should be ok: ' + r.error);
  assertEqual(r.cells.length, 9);
  assertEqual([r.end.x, r.end.y, r.end.facing], [8, 5, 'right']);
  assert(R.inReach(r.end, m.thing('stopB')), 'stop B in reach');
  assert(!R.inReach(r.end, m.thing('stopC')), 'stop C out of reach');
  assert(!R.inReach(r.end, m.thing('stopA')), 'stop A out of reach');
  assertEqual(R.directions(s.route), ['Go straight for 5 steps.', 'Turn right.', 'Go straight for 3 steps.']);
});

test('mission trail: one step reads as singular', function () {
  const R = load().MissionTrail.Rules;
  assertEqual(R.directions([{ go: 1 }, { turn: 'left' }]), ['Go straight for 1 step.', 'Turn left.']);
});

test('mission trail: a route through grass is not ok', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.routeCells(m, m.start, [{ turn: 'left' }, { go: 1 }]).ok, false);
});

test('mission trail: fog radius and road mask', function () {
  const R = load().MissionTrail.Rules, m = R.buildMap(map('village-1'));
  assertEqual(R.visibleCells(m, { x: 5, y: 5 }, 1).length, 9);
  assertEqual(R.visibleCells(m, { x: 0, y: 0 }, 1).length, 4);
  assertEqual(R.roadMask(m, 5, 5), 15);
  assertEqual(R.roadMask(m, 5, 10), 5);
  assertEqual(R.roadMask(m, 0, 0), 0);
});

test('mission trail: stage 1 data has the decoys and the groups', function () {
  const FF = load(), d = FF.data.missionTrail, s = d.stages[0];
  assertEqual([s.id, s.time, s.fog, s.steps[0].do, s.steps[0].target], [1, 60, false, 'reach', 'stopB']);
  assertEqual([s.identities.stopA, s.identities.stopB, s.identities.stopC], ['busStop', 'busStop', 'busStop']);
  assertEqual(d.groups.length, 10);
  assertEqual([d.groups[0].from, d.groups[9].from], [1, 91]);
});

/* ---------------- Task 2: scoring and progress ---------------- */

const MORE = ['js/storage.js', 'js/missiontrail/score.js', 'js/missiontrail/progress.js'];

test('mission trail: scoring', function () {
  const S = load(MORE).MissionTrail.Score;
  assertEqual(S.total({ task: 1, nav: 1, obs: 1, seq: null, time: 1 }), 100);
  assertEqual(S.total({ task: 1, nav: 0.8, obs: 0.5, seq: null, time: 1 }), 82);
  assertEqual([S.stars(90), S.stars(89), S.stars(70), S.stars(50), S.stars(49)], [3, 2, 2, 1, 0]);
  assertClose(S.nav({ wrongTurns: 1, extraSteps: 4, bumps: 2 }), 0.64, 1e-9);
  assertEqual(S.nav({ wrongTurns: 9, extraSteps: 0, bumps: 0 }), 0);
  assertEqual([S.obs(0), S.obs(1), S.obs(3)], [1, 0.5, 0]);
  assertEqual(S.time(18000, 60000, 18000), 1);
  assertClose(S.time(39000, 60000, 18000), 0.5, 1e-9);
  assertEqual(S.time(60000, 60000, 18000), 0);
  assertEqual(S.parMs(8), 18000);
});

test('mission trail: a stage can change the weights', function () {
  const S = load(MORE).MissionTrail.Score;
  assertEqual(S.total({ task: 1, nav: 0, obs: null, seq: null, time: null }, { task: 50, nav: 50, obs: 0, seq: 0, time: 0 }), 50);
});

test('mission trail: a worse replay keeps the best, an attempt saves once', function () {
  const P = load(MORE).MissionTrail.Progress;
  let p = P.record(P.empty(), 1, { done: true, score: 95, stars: 3, ms: 20000 }, 'a1');
  p = P.record(p, 1, { done: true, score: 60, stars: 1, ms: 15000 }, 'a2');
  p = P.record(p, 1, { done: true, score: 60, stars: 1, ms: 15000 }, 'a2');
  assertEqual(p.stages['1'], { stars: 3, best: 95, bestMs: 15000, done: true, plays: 2 });
  assertEqual(p.highest, 2);
});

test('mission trail: a failed attempt unlocks nothing', function () {
  const P = load(MORE).MissionTrail.Progress;
  const p = P.record(P.empty(), 1, { done: false, score: 0, stars: 0, ms: 60000 }, 'a1');
  assertEqual([P.state(p, 1), P.state(p, 2), p.stages['1'].plays], ['open', 'locked', 1]);
  assertEqual(p.stages['1'].done, false);
});

test('mission trail: merge keeps the best of both copies', function () {
  const P = load(MORE).MissionTrail.Progress;
  const a = { v: 1, highest: 3, stages: { '1': { stars: 3, best: 92, bestMs: 30000, done: true, plays: 2 }, '2': { stars: 1, best: 55, bestMs: 50000, done: true, plays: 1 } } };
  const b = { v: 1, highest: 2, stages: { '1': { stars: 2, best: 80, bestMs: 21000, done: true, plays: 5 } } };
  const m = P.merge(a, b);
  assertEqual(m.stages['1'], { stars: 3, best: 92, bestMs: 21000, done: true, plays: 5 });
  assertEqual([m.highest, P.totals(m).stars, P.totals(m).completed], [3, 4, 2]);
  assertEqual(P.merge(null, b).stages['1'].plays, 5);
});

test('mission trail: stage states and where Continue goes', function () {
  const P = load(MORE).MissionTrail.Progress;
  const p = { v: 1, highest: 3, stages: { '1': { stars: 2, best: 80, bestMs: 1, done: true, plays: 1 }, '2': { stars: 3, best: 95, bestMs: 1, done: true, plays: 1 } } };
  assertEqual([P.state(p, 1), P.state(p, 2), P.state(p, 3), P.state(p, 4)], ['done', 'done', 'open', 'locked']);
  assertEqual(P.next(p, [1, 2, 3, 4]), 3);
  assertEqual(P.next(p, [1, 2]), 2);
  assertEqual(P.next(P.empty(), [1]), 1);
});

test('mission trail: progress saves and loads on the device', function () {
  const FF = load(MORE), P = FF.MissionTrail.Progress;
  FF.Storage.init();
  P.save(P.record(P.empty(), 1, { done: true, score: 91, stars: 3, ms: 12000 }, 'x'));
  assertEqual(P.load().stages['1'].best, 91);
  FF.Storage.set(P.KEY, 'garbage');
  assertEqual(P.load(), P.empty());
});

/* ---------------- Task 3: the mission engine ---------------- */

const ENGINE = MORE.concat(['js/missiontrail/engine.js']);
const KEYS = { U: 'up', D: 'down', L: 'left', R: 'right' };

function newRun() {
  const FF = load(ENGINE);
  const clock = { t: 1000 };
  const stage = FF.data.missionTrail.stages[0];
  const m = FF.MissionTrail.Rules.buildMap(map(stage.map));
  const run = FF.MissionTrail.Engine.create(stage, m, { now: function () { return clock.t; } });
  return { FF: FF, clock: clock, run: run };
}

function walk(run, keys) {
  return keys.split('').map(function (k) { return run.move(KEYS[k]).type; });
}

test('mission trail: a perfect stage 1 scores 100', function () {
  const r = newRun().run;
  let completes = 0;
  r.on('complete', function () { completes++; });
  r.start();
  assertEqual(walk(r, 'UUUUURRR'), ['moved', 'moved', 'moved', 'moved', 'moved', 'moved', 'moved', 'moved']);
  assertEqual(r.check('stopB'), { type: 'revealed', name: 'Bus stop' });
  const res = r.result();
  assertEqual([r.state, res.done, res.score, res.stars, completes], ['complete', true, 100, 3, 1]);
  assertEqual(res.mistakes, { wrongTurns: 0, extraSteps: 0, bumps: 0, wrongChecks: 0 });
});

test('mission trail: the clock waits for the letter', function () {
  const o = newRun();
  o.clock.t = 99999;
  assertEqual(o.run.remaining(), 60000);
  assertEqual(o.run.move('up').type, 'ignored');
  o.run.start();
  assertEqual(o.run.remaining(), 60000);
  o.clock.t += 1000;
  assertEqual(o.run.remaining(), 59000);
});

test('mission trail: ten bumps into a wall never move the walker', function () {
  const r = newRun().run;
  r.start();
  const types = walk(r, 'LLLLLLLLLL');
  assertEqual(types.filter(function (x) { return x === 'bumped'; }).length, 10);
  assertEqual([r.pos.x, r.pos.y, r.pos.facing], [5, 10, 'left']);
  assertEqual(r.result().mistakes.bumps, 10);
});

test('mission trail: a wrong stop costs 5 seconds and observation', function () {
  const r = newRun().run;
  r.start();
  walk(r, 'UUURRR');
  assertEqual(r.check('stopC').type, 'wrong');
  assertEqual([r.remaining(), r.state], [55000, 'playing']);
  walk(r, 'LLLUURRR');
  assertEqual(r.check('stopB').type, 'revealed');
  const res = r.result();
  assertEqual([res.parts.obs, res.mistakes.wrongChecks], [0.5, 1]);
});

test('mission trail: out of reach says walk closer, no penalty', function () {
  const r = newRun().run;
  r.start();
  assertEqual(r.check('stopB').type, 'far');
  assertEqual([r.remaining(), r.result().mistakes.wrongChecks], [60000, 0]);
});

test('mission trail: decorations and unknown keys cannot be checked', function () {
  const r = newRun().run;
  r.start();
  walk(r, 'UUUUUR');
  assertEqual(r.check('bench1').type, 'ignored');
  assertEqual(r.check('nope').type, 'ignored');
  assertEqual(r.result().mistakes.wrongChecks, 0);
});

test('mission trail: a wrong turn is counted once per departure', function () {
  const r = newRun().run;
  r.start();
  walk(r, 'UUUUULRRRR');
  assertEqual(r.check('stopB').type, 'revealed');
  const m = r.result().mistakes;
  assertEqual([m.wrongTurns, m.extraSteps], [1, 2]);
});

test('mission trail: a hidden tab earns no time', function () {
  const o = newRun(), r = o.run;
  let fails = 0;
  r.on('failed', function () { fails++; });
  r.start();
  o.clock.t += 61000;
  assertEqual(r.move('up').type, 'ignored');
  r.tick();
  assertEqual([r.state, fails, r.remaining()], ['failed', 1, 0]);
  const res = r.result();
  assertEqual([res.done, res.score, res.stars], [false, 0, 0]);
});

test('mission trail: a check after the deadline fails', function () {
  const o = newRun(), r = o.run;
  r.start();
  walk(r, 'UUUUURRR');
  o.clock.t += 60001;
  assertEqual(r.check('stopB').type, 'ignored');
  assertEqual(r.state, 'failed');
});

test('mission trail: a slow perfect run loses only time points', function () {
  const o = newRun(), r = o.run;
  r.start();
  o.clock.t += 39000;
  walk(r, 'UUUUURRR');
  r.check('stopB');
  const res = r.result();
  assertEqual([res.ms, res.parts.time, res.score], [39000, 0.5, 94]);
});

/* ---------------- Task 4: the stage validator ---------------- */

const checker = require('../missiontrail-check');

test('mission trail: every stage passes the validator', function () {
  assertEqual(checker.check(load(ENGINE)), []);
});

test('mission trail: the validator catches a turn off a junction', function () {
  const FF = load(ENGINE);
  FF.data.missionTrail.stages[0].route = [{ go: 4 }, { turn: 'right' }, { go: 3 }];
  const problems = checker.check(FF);
  assert(problems.length > 0, 'expected problems');
  assert(problems.every(function (p) { return p.indexOf('Stage 1:') === 0; }), problems.join(' | '));
  assert(problems.some(function (p) { return p.indexOf('junction') !== -1; }), problems.join(' | '));
});

test('mission trail: the validator catches a missing target', function () {
  const FF = load(ENGINE);
  FF.data.missionTrail.stages[0].steps = [{ do: 'reach', target: 'nope' }];
  assert(checker.check(FF).some(function (p) { return p.indexOf('nope') !== -1; }));
});

test('mission trail: the validator catches gaps in stage ids and unknown maps', function () {
  const FF = load(ENGINE);
  const copy = JSON.parse(JSON.stringify(FF.data.missionTrail.stages[0]));
  copy.id = 3;
  copy.map = 'atlantis';
  FF.data.missionTrail.stages.push(copy);
  const problems = checker.check(FF).join(' | ');
  assert(problems.indexOf('Stage 3:') !== -1 && problems.indexOf('atlantis') !== -1, problems);
  assert(problems.indexOf('expected stage 2') !== -1, problems);
});

/* ---------------- Task 5: account sync merge ---------------- */

const DEVICE_A = { v: 1, highest: 3, stages: { '1': { stars: 3, best: 92, bestMs: 30000, done: true, plays: 2 }, '2': { stars: 1, best: 55, bestMs: 50000, done: true, plays: 1 } } };
const SERVER_B = { v: 1, highest: 2, stages: { '1': { stars: 2, best: 80, bestMs: 21000, done: true, plays: 5 } } };

async function syncWith(localNewer) {
  const FF = load(['js/storage.js', 'js/missiontrail/progress.js', 'js/sync.js']);
  FF.Storage.init();
  FF.Storage.setScope('u1');
  FF.Storage.set('missionTrail', DEVICE_A);
  FF.Storage.set('syncMeta', { missionTrail: localNewer ? 9e12 : 1 });
  const updates = [];
  const remote = { missionTrail: { v: JSON.stringify(SERVER_B), t: 5000 } };
  const firebase = { database: function () { return { ref: function () { return {
    once: function () { return Promise.resolve({ val: function () { return remote; } }); },
    update: function (v) { updates.push(v); return Promise.resolve(); }
  }; } }; } };
  await FF.Sync.start('u1', firebase);
  FF.Sync.stop();
  return { FF: FF, updates: updates };
}

function assertMerged(o) {
  const local = o.FF.MissionTrail.Progress.load();
  assertEqual(local.stages['1'], { stars: 3, best: 92, bestMs: 21000, done: true, plays: 5 });
  assertEqual([local.highest, !!local.stages['2']], [3, true]);
  const sent = o.updates.filter(function (u) { return u.missionTrail; }).pop();
  assert(sent, 'the merged copy is sent back to the account');
  assertEqual(JSON.parse(sent.missionTrail.v).stages['1'].bestMs, 21000);
}

test('mission trail: progress is a synced account key', function () {
  const FF = load(['js/storage.js', 'js/missiontrail/progress.js', 'js/sync.js']);
  assert(FF.Sync.KEYS.indexOf('missionTrail') !== -1);
});

test('mission trail: a newer server copy merges with this device', async function () {
  assertMerged(await syncWith(false));
});

test('mission trail: a newer device copy merges with the server', async function () {
  assertMerged(await syncWith(true));
});

/* ---------------- Task 7: the asset registry ---------------- */

const ASSETS = ENGINE.concat(['js/data/assetManifest.js', 'js/assets.js', 'js/missiontrail/assets.js']);

test('mission trail: the registry knows the cut pictures', function () {
  const A = load(ASSETS).MissionTrail.Assets;
  assert(A.known('props', 'bus-stop'), 'bus-stop');
  assert(A.known('buildings', 'house-red'), 'house-red');
  assert(A.known('walker', 'walker-up-2'), 'walker-up-2');
  assert(!A.known('props', 'nope'), 'nope');
  assert(!A.known('spaceships', 'bus-stop'), 'unknown category');
  assert(/^assets\/images\/games\/missionTrail\/props\/bus-stop\.webp\?v=[0-9a-f]{8}$/.test(A.path('props', 'bus-stop')), A.path('props', 'bus-stop'));
});

test('mission trail: a map asks only for the pictures it uses', function () {
  const FF = load(ASSETS), A = FF.MissionTrail.Assets;
  const list = A.forMap(FF.MissionTrail.Rules.buildMap(map('village-1')));
  const keys = list.map(function (x) { return x.category + '/' + x.id; });
  assertEqual(keys.filter(function (k) { return k === 'props/bus-stop'; }).length, 1);
  assertEqual(keys.filter(function (k) { return k.indexOf('walker/') === 0; }).length, 12);
  assertEqual(keys.filter(function (k) { return k.indexOf('ground/') === 0; }).sort(), ['ground/asphalt', 'ground/grass', 'ground/pavement']);
  assert(keys.indexOf('props/fountain') === -1, 'no fountain on this map');
  assert(keys.indexOf('buildings/hall-stone') === -1, 'no hall on this map');
});

test('mission trail: the validator reports a look with no picture', function () {
  const FF = load(ASSETS);
  FF.data.missionTrailMaps[0].props[0].look = 'rocket';
  assert(checker.check(FF).some(function (p) { return p.indexOf('rocket') !== -1; }));
});

module.exports = { load, map };
