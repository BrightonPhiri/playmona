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
  assertEqual([s.id, s.time, s.fog, s.steps[0].do, s.steps[0].target], [1, 20, false, 'reach', 'stopB']);
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
  assertEqual(S.parMs(8, 1), 8300);
  assertEqual(S.parMs(8), 8300);
  assertEqual(S.parMs(20, 3), 18500);
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
  assertEqual(res.mistakes, { wrongTurns: 0, extraSteps: 0, bumps: 0, wrongChecks: 0, wrongPicks: 0 });
});

test('mission trail: the clock waits for the letter', function () {
  const o = newRun();
  o.clock.t = 99999;
  assertEqual(o.run.remaining(), 20000);
  assertEqual(o.run.move('up').type, 'ignored');
  o.run.start();
  assertEqual(o.run.remaining(), 20000);
  o.clock.t += 1000;
  assertEqual(o.run.remaining(), 19000);
});

test('mission trail: ten bumps into a wall never move the walker', function () {
  const r = newRun().run;
  r.start();
  const types = walk(r, 'LLLLLLLLLL');
  assertEqual(types.filter(function (x) { return x === 'bumped'; }).length, 10);
  assertEqual([r.pos.x, r.pos.y, r.pos.facing], [5, 10, 'left']);
  assertEqual(r.result().mistakes.bumps, 10);
});

test('mission trail: a wrong stop costs 3 seconds and observation', function () {
  const r = newRun().run;
  r.start();
  walk(r, 'UUURRR');
  assertEqual(r.check('stopC').type, 'wrong');
  assertEqual([r.remaining(), r.state], [17000, 'playing']);
  walk(r, 'LLLUURRR');
  assertEqual(r.check('stopB').type, 'revealed');
  const res = r.result();
  assertEqual([res.parts.obs, res.mistakes.wrongChecks], [0.5, 1]);
});

test('mission trail: out of reach says walk closer, no penalty', function () {
  const r = newRun().run;
  r.start();
  assertEqual(r.check('stopB').type, 'far');
  assertEqual([r.remaining(), r.result().mistakes.wrongChecks], [20000, 0]);
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
  o.clock.t += 21000;
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
  o.clock.t += 20001;
  assertEqual(r.check('stopB').type, 'ignored');
  assertEqual(r.state, 'failed');
});

test('mission trail: a slow perfect run loses only time points', function () {
  const o = newRun(), r = o.run;
  r.start();
  o.clock.t += 14150;
  walk(r, 'UUUUURRR');
  r.check('stopB');
  const res = r.result();
  assertEqual([res.ms, res.parts.time, res.score], [14150, 0.5, 94]);
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
  const n = FF.data.missionTrail.stages.length;
  copy.id = n + 2;
  copy.map = 'atlantis';
  FF.data.missionTrail.stages.push(copy);
  const problems = checker.check(FF).join(' | ');
  assert(problems.indexOf('Stage ' + (n + 2) + ':') !== -1 && problems.indexOf('atlantis') !== -1, problems);
  assert(problems.indexOf('expected stage ' + (n + 1)) !== -1, problems);
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

/* ---------------- Task 9: screens and the game ---------------- */

const SCREENS = ASSETS.concat(['js/i18n.js', 'js/ui-kit.js', 'js/missiontrail/render.js', 'js/missiontrail/screens.js']);

function texts(node, out) {
  out = out || [];
  if (!node) return out;
  if (node.nodeType === 3 || !node.children || !node.children.length) { if (node.textContent) out.push(String(node.textContent)); }
  (node.children || []).forEach(function (c) { texts(c, out); });
  return out;
}
function nodes(node, pred, out) {
  out = out || [];
  if (!node) return out;
  if (pred(node)) out.push(node);
  (node.children || []).forEach(function (c) { nodes(c, pred, out); });
  return out;
}
function document_of(FF) { return FF.__sandbox.document; }
function ctxFor(FF, progress) {
  const d = FF.data.missionTrail;
  return { api: null, progress: progress, stages: d.stages, groups: d.groups, open: function () {}, home: function () {}, done: function () {} };
}

test('mission trail: the picker shows only stages that exist', function () {
  const FF = load(SCREENS), P = FF.MissionTrail.Progress;
  const root = document_of(FF).createElement('div');
  const prog = P.clean({ highest: 1 });
  FF.MissionTrail.Screens.picker(root, ctxFor(FF, prog), 0);
  const cards = nodes(root, function (n) { return n.dataset && n.dataset.stage; });
  const ids = FF.data.missionTrail.stages.map(function (st) { return String(st.id); });
  assertEqual(cards.map(function (c) { return c.dataset.stage; }), ids);
  assertEqual([cards[0].tagName, cards[0].disabled], ['BUTTON', false]);
  assert(cards[1].tagName !== 'BUTTON', 'stage 2 stays locked until stage 1 is done');
});

test('mission trail: the letter is gone after I understand', function () {
  const FF = load(SCREENS), doc = document_of(FF);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  let understood = 0;
  FF.MissionTrail.Screens.letter(root, FF.data.missionTrail.stages[0], 'Sam', function () { understood++; });
  assert(texts(root).some(function (s) { return s.indexOf('Go straight for 5 steps.') !== -1; }), 'the letter shows the directions');
  assert(texts(root).some(function (s) { return s.indexOf('Dear Sam,') !== -1; }), 'the letter greets the player');
  const ok = nodes(root, function (n) { return n.tagName === 'BUTTON' && /(^|\s)mt-understand(\s|$)/.test(n.className || n.getAttribute('class') || ''); })[0];
  assert(ok, 'an I understand button');
  ok.dispatch('click');
  assertEqual(understood, 1);
  assert(!texts(root).some(function (s) { return s.indexOf('Go straight for') !== -1; }), 'no directions left on the page');
});

test('mission trail: the game is registered, solo, no leaderboard', function () {
  const FF = load(['js/storage.js', 'js/missiontrail/score.js', 'js/missiontrail/progress.js', 'js/missiontrail/engine.js',
    'js/data/assetManifest.js', 'js/assets.js', 'js/missiontrail/assets.js', 'js/missiontrail/render.js', 'js/missiontrail/screens.js',
    'js/registry.js', 'js/games/missionTrail.js']);
  const def = FF.Games.get('missionTrail');
  assert(def, 'registered');
  assertEqual([def.id, def.leaderboard, def.modes], ['missionTrail', false, ['solo']]);
});

/* ---------------- final review fixes ---------------- */

const GAME = ENGINE.concat(['js/data/assetManifest.js', 'js/assets.js', 'js/missiontrail/assets.js', 'js/missiontrail/render.js',
  'js/missiontrail/screens.js', 'js/registry.js', 'js/games/missionTrail.js']);

function keyEvent(doc, key, extra) {
  const ev = { key: key, target: doc.body, repeat: false, prevented: 0, stopped: 0,
    preventDefault: function () { this.prevented++; }, stopPropagation: function () { this.stopped++; } };
  return Object.assign(ev, extra || {});
}

test('mission trail: play keys are taken before the page navigation sees them', function () {
  const FF = load(SCREENS), doc = document_of(FF);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const moves = [];
  let checks = 0;
  const h = FF.MissionTrail.Screens.play(root, { stage: FF.data.missionTrail.stages[0], total: 1,
    onMove: function (d, repeat) { moves.push(d + (repeat ? '*' : '')); }, onCheck: function () { checks++; }, onTap: function () {} });
  h.bind();
  const ev = keyEvent(doc, 'ArrowUp');
  doc.dispatch('keydown', ev);
  assertEqual(moves, ['up']);
  assertEqual([ev.prevented, ev.stopped], [1, 1]);
  doc.dispatch('keydown', keyEvent(doc, 'd', { repeat: true }));
  assertEqual(moves, ['up', 'right*']);
  doc.dispatch('keydown', keyEvent(doc, 'Enter'));
  assertEqual(checks, 1);
  h.unbind();
  doc.dispatch('keydown', keyEvent(doc, 'ArrowUp'));
  assertEqual(moves.length, 2);
});

test('mission trail: keys do nothing while the pause menu or a dialog is open', function () {
  const FF = load(SCREENS), doc = document_of(FF);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const moves = [];
  const h = FF.MissionTrail.Screens.play(root, { stage: FF.data.missionTrail.stages[0], total: 1,
    onMove: function (d) { moves.push(d); }, onCheck: function () {}, onTap: function () {} });
  h.bind();
  doc.querySelector = function (sel) { return /pause-overlay/.test(sel) ? {} : null; };
  const ev = keyEvent(doc, 'ArrowUp');
  doc.dispatch('keydown', ev);
  assertEqual([moves.length, ev.stopped], [0, 0]);
});

function fakeView() {
  return {
    moving: false, walks: [], placed: null, pending: null, shakes: 0,
    isMoving: function () { return this.moving; },
    walk: function (pos, done) {
      const v = this;
      v.moving = true;
      v.walks.push([pos.x, pos.y]);
      v.pending = function () { v.moving = false; if (done) done(); };
    },
    place: function (pos) { this.placed = [pos.x, pos.y]; },
    face: function () {},
    shake: function () { this.shakes++; }
  };
}
function drain(view) { let n = 0; while (view.pending && n < 50) { const p = view.pending; view.pending = null; p(); n++; } }
function gameRun() {
  const FF = load(GAME);
  const stage = FF.data.missionTrail.stages[0];
  const m = FF.MissionTrail.Rules.buildMap(map(stage.map));
  const run = FF.MissionTrail.Engine.create(stage, m, { now: function () { return 1000; } });
  run.start();
  return { FF: FF, run: run };
}

test('mission trail: five fast taps are five steps', function () {
  const g = gameRun(), view = fakeView();
  const mover = g.FF.MissionTrail.Game.createMover(g.run, view);
  for (let i = 0; i < 5; i++) mover.move('up');
  assertEqual([g.run.pos.x, g.run.pos.y], [5, 5]);
  drain(view);
  const last = view.placed && view.walks.length === 0 ? view.placed : view.walks[view.walks.length - 1];
  assertEqual(last, [5, 5]);
  assertEqual(view.moving, false);
});

test('mission trail: a held key stops when it is let go', function () {
  const g = gameRun(), view = fakeView();
  const mover = g.FF.MissionTrail.Game.createMover(g.run, view);
  mover.move('up');
  mover.move('up', true);
  mover.move('up', true);
  mover.move('up', true);
  assertEqual(g.run.pos.y, 9);
  drain(view);
  mover.move('up', true);
  assertEqual(g.run.pos.y, 8);
});

test('mission trail: a bump while walking never moves the walker', function () {
  const g = gameRun(), view = fakeView();
  const mover = g.FF.MissionTrail.Game.createMover(g.run, view);
  mover.move('up');
  mover.move('left');
  mover.move('left');
  assertEqual([g.run.pos.x, g.run.pos.y], [5, 9]);
  drain(view);
  assertEqual(view.walks[view.walks.length - 1], [5, 9]);
});

async function syncSame(remoteCopy) {
  const FF = load(['js/storage.js', 'js/missiontrail/progress.js', 'js/sync.js']);
  FF.Storage.init();
  FF.Storage.setScope('u1');
  FF.Storage.set('missionTrail', SERVER_B);
  FF.Storage.set('syncMeta', { missionTrail: 1 });
  let redraws = 0;
  FF.App = { onSynced: function () { redraws++; } };
  const updates = [];
  const remote = { missionTrail: { v: JSON.stringify(remoteCopy), t: 5000 } };
  const firebase = { database: function () { return { ref: function () { return {
    once: function () { return Promise.resolve({ val: function () { return remote; } }); },
    update: function (v) { updates.push(v); return Promise.resolve(); }
  }; } }; } };
  await FF.Sync.start('u1', firebase);
  FF.Sync.stop();
  return { redraws: redraws, sent: updates.filter(function (u) { return u.missionTrail; }).length };
}

test('mission trail: matching copies sync without a redraw or a write', async function () {
  assertEqual(await syncSame(SERVER_B), { redraws: 0, sent: 0 });
});

test('mission trail: a server copy that is behind is updated without a redraw', async function () {
  const behind = { v: 1, highest: 1, stages: {} };
  assertEqual(await syncSame(behind), { redraws: 0, sent: 1 });
});

test('mission trail: the game sits with the memory games', function () {
  const FF = load(GAME);
  assertEqual(FF.Games.get('missionTrail').category, 'memory');
});

test('mission trail: the validator catches a time too short for the route', function () {
  const FF = load(MORE);
  FF.data.missionTrail.stages[0].time = 10;
  assert(checker.check(FF).some(function (p) { return p.indexOf('Stage 1:') === 0 && p.indexOf('too short') !== -1; }));
});

test('mission trail: the low-time warning starts at 30% of a short limit', function () {
  const FF = load(SCREENS), doc = document_of(FF);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const h = FF.MissionTrail.Screens.play(root, { stage: FF.data.missionTrail.stages[0], total: 1, onMove: function () {}, onCheck: function () {}, onTap: function () {} });
  const clock = nodes(root, function (n) { return n.className === 'mt-clock'; })[0];
  h.setClock(7000);
  assertEqual(clock.classList.contains('is-warn'), false);
  h.setClock(6000);
  assertEqual(clock.classList.contains('is-warn'), true);
});

/* ---------------- Stages 2-5: landmarks, intersections, streets ---------------- */

const SMALL = {
  id: 'small', name: 'Test block',
  rows: ['ggggggg', 'g=====g', 'g=ggg=g', 'g=====g', 'g=ggg=g', 'g=====g', 'ggggggg'],
  buildings: [],
  props: [
    { key: 'f', look: 'fountain', x: 2, y: 2 },
    { key: 'sign1', look: 'signpost', x: 0, y: 4, sign: 'Dave Street' },
    { key: 'sign2', look: 'signpost', x: 4, y: 6, sign: 'Low Road' }
  ],
  streets: [{ name: 'Dave Street', from: [1, 1], to: [1, 5] }, { name: 'Low Road', from: [2, 5], to: [5, 5] }],
  start: { x: 5, y: 5, facing: 'up' }
};
function small() { const R = load().MissionTrail.Rules; return { R: R, m: R.buildMap(JSON.parse(JSON.stringify(SMALL))) }; }

test('mission trail: go straight until a landmark is in reach', function () {
  const o = small();
  const r = o.R.routeCells(o.m, { x: 1, y: 5, facing: 'up' }, [{ go: 'until', at: 'f' }]);
  assert(r.ok, r.error);
  assertEqual([r.end.x, r.end.y, r.cells.length], [1, 3, 3]);
  assertEqual(o.R.routeCells(o.m, { x: 5, y: 5, facing: 'left' }, [{ turn: 'right' }, { turn: 'right' }, { go: 'until', at: 'f' }]).ok, false);
});

test('mission trail: continue to the nth intersection', function () {
  const o = small();
  const r = o.R.routeCells(o.m, { x: 5, y: 5, facing: 'up' }, [{ go: 'junction', n: 1 }]);
  assertEqual([r.ok, r.end.x, r.end.y], [true, 5, 3]);
  assertEqual(o.R.routeCells(o.m, { x: 5, y: 5, facing: 'up' }, [{ go: 'junction', n: 2 }]).ok, false);
});

test('mission trail: take a street turns onto it', function () {
  const o = small();
  const r = o.R.routeCells(o.m, { x: 5, y: 5, facing: 'up' }, [{ take: 'Low Road', turn: 'left' }, { go: 1 }]);
  assertEqual([r.ok, r.end.x, r.end.y, r.end.facing], [true, 4, 5, 'left']);
  assertEqual(o.R.routeCells(o.m, { x: 5, y: 5, facing: 'up' }, [{ take: 'Dave Street', turn: 'left' }]).ok, false);
  assertEqual([o.m.streetAt(1, 2), o.m.streetAt(3, 5), o.m.streetAt(3, 3)], ['Dave Street', 'Low Road', null]);
  assertEqual(o.m.thing('sign1').sign, 'Dave Street');
});

test('mission trail: the letter words landmarks, intersections and streets', function () {
  const R = load().MissionTrail.Rules;
  const lines = R.directions([{ go: 'until', at: 'f' }, { go: 'junction', n: 2 }, { take: 'Dave Street', turn: 'left' }, { go: 'junction', n: 1 }, { go: 'junction', n: 3 }],
    { name: function (key) { return key === 'f' ? 'fountain' : key; } });
  assertEqual(lines, ['Go straight until you reach the fountain.', 'Continue until the second intersection.', 'Take Dave Street.',
    'Continue to the next intersection.', 'Continue until the third intersection.']);
});

function withSmall(stage) {
  const FF = load(MORE);
  FF.data.missionTrailMaps.push(JSON.parse(JSON.stringify(SMALL)));
  FF.data.missionTrail.stages = [stage];
  return checker.check(FF);
}

test('mission trail: the validator wants a signpost for every street the letter names', function () {
  const base = { id: 1, title: 't', map: 'small', time: 30, route: [{ take: 'Low Road', turn: 'left' }, { go: 2 }], steps: [{ do: 'reach', target: 'f' }], identities: {} };
  assertEqual(withSmall(JSON.parse(JSON.stringify(base))).filter(function (p) { return /signpost/.test(p); }), []);
  const FF = load(MORE);
  const m = JSON.parse(JSON.stringify(SMALL));
  m.props = m.props.filter(function (p) { return p.key !== 'sign2'; });
  FF.data.missionTrailMaps.push(m);
  FF.data.missionTrail.stages = [base];
  assert(checker.check(FF).some(function (p) { return /Low Road/.test(p) && /signpost/.test(p); }), 'missing signpost reported');
});

test('mission trail: the validator catches a landmark that is not on the map', function () {
  const probs = withSmall({ id: 1, title: 't', map: 'small', time: 30, route: [{ go: 'until', at: 'nope' }], steps: [{ do: 'reach', target: 'f' }], identities: {} });
  assert(probs.some(function (p) { return /nope/.test(p); }), probs.join('; '));
});

test('mission trail: stages 2 to 5 exist and play on the town map', function () {
  const d = load().data.missionTrail;
  assertEqual(d.stages.slice(0, 5).map(function (s) { return s.id; }), [1, 2, 3, 4, 5]);
  assertEqual(d.stages[4].fog, true);
  const R = load().MissionTrail.Rules;
  const names = function (k) { return d.identityNames[d.stages[4].identities[k]] || k; };
  assert(R.directions(d.stages[4].route, { name: names }).indexOf('Take Dave Street.') !== -1, 'stage 5 names Dave Street');
});

/* ---------------- Stages 6-10: things to carry, people, cars ---------------- */

const ERRAND_MAP = Object.assign(JSON.parse(JSON.stringify(SMALL)), {
  id: 'errand',
  buildings: [{ key: 'lib', look: 'hall-stone', x: 3, y: 4 }, { key: 'shop', look: 'shop-red', x: 2, y: 4 }]
});
const ERRAND = {
  id: 1, title: 'Errand', map: 'errand', time: 40, start: { x: 5, y: 5, facing: 'left' },
  identities: { lib: 'library', shop: 'shop' },
  vehicles: [{ key: 'carG', look: 'car-green', x: 6, y: 3, facing: 'down' }, { key: 'carR', look: 'car-red', x: 6, y: 1, facing: 'down' }],
  route: [{ go: 1 }],
  steps: [
    { do: 'collect', item: 'red-cap', scene: { backdrop: 'bedroom', options: ['red-cap', 'blue-cap', 'green-cap'] } },
    { do: 'give', target: 'lib', item: 'red-cap', to: 'librarian', scene: { backdrop: 'library', options: ['librarian', 'teacher', 'doctor'] } }
  ]
};
function errand(stagePatch) {
  const FF = load(ENGINE);
  const clock = { t: 1000 };
  const stage = Object.assign(JSON.parse(JSON.stringify(ERRAND)), stagePatch || {});
  const m = FF.MissionTrail.Rules.mapFor(JSON.parse(JSON.stringify(ERRAND_MAP)), stage);
  const run = FF.MissionTrail.Engine.create(stage, m, { now: function () { return clock.t; } });
  return { FF: FF, clock: clock, run: run, map: m };
}

test('mission trail: a stage parks its cars on the map', function () {
  const o = errand();
  const car = o.map.thing('carG');
  assertEqual([car.kind, car.look, car.check, o.map.walkable(6, 3)], ['vehicle', 'car-green-down', true, false]);
});

test('mission trail: a pick scene opens when the letter closes and holds the walker', function () {
  const o = errand(), r = o.run;
  const scenes = [];
  r.on('scene', function (sc) { scenes.push(sc); });
  r.start();
  assertEqual(scenes.length, 1);
  assertEqual([r.scene.kind, r.scene.backdrop, r.scene.options, r.scene.closable], ['collect', 'bedroom', ['red-cap', 'blue-cap', 'green-cap'], false]);
  assertEqual(r.move('left').type, 'ignored');
  assertEqual(r.closeScene(), false);
});

test('mission trail: a wrong pick costs time, the right one goes in the bag', function () {
  const o = errand(), r = o.run;
  r.start();
  const before = r.remaining();
  assertEqual(r.pick('blue-cap').type, 'wrong');
  assertEqual(before - r.remaining(), o.FF.MissionTrail.Engine.WRONG_CHECK_MS);
  assertEqual(r.pick('red-cap').type, 'picked');
  assertEqual([r.inventory, r.scene, r.stepIndex], [['red-cap'], null, 1]);
  assertEqual(r.move('left').type, 'moved');
  assertEqual(r.result().mistakes.wrongPicks, 1);
  assert(r.result().parts.obs < 1, 'a wrong pick lowers observation');
});

test('mission trail: giving opens the people at the right place only', function () {
  const o = errand(), r = o.run;
  let done = null;
  r.on('complete', function (res) { done = res; });
  r.start();
  r.pick('red-cap');
  r.move('left'); r.move('left');
  assertEqual(r.check('shop').type, 'wrong');
  assertEqual(r.check('lib').type, 'scene');
  assertEqual([r.scene.kind, r.scene.closable, r.revealed.lib], ['give', true, 'Library']);
  assertEqual(r.pick('teacher').type, 'wrong');
  assertEqual(r.pick('librarian').type, 'given');
  assertEqual([r.inventory, r.state, !!done], [[], 'complete', true]);
});

test('mission trail: stepping out of a place scene and back in', function () {
  const o = errand(), r = o.run;
  r.start();
  r.pick('red-cap');
  r.move('left'); r.move('left');
  r.check('lib');
  assertEqual(r.closeScene(), true);
  assertEqual([r.scene, r.move('right').type], [null, 'moved']);
  r.move('left');
  assertEqual(r.check('lib').type, 'scene');
});

test('mission trail: get into the right car and drive', function () {
  const o = errand({ start: { x: 5, y: 3, facing: 'down' }, steps: [{ do: 'enter', target: 'carG' }, { do: 'reach', target: 'lib' }] }), r = o.run;
  const entered = [];
  r.on('entered', function (e) { entered.push(e); });
  r.start();
  assertEqual(r.scene, null);
  r.move('up'); r.move('up');
  assertEqual(r.check('carR').type, 'wrong');
  r.move('down'); r.move('down');
  assertEqual(r.check('carG').type, 'entered');
  assertEqual([r.vehicle, entered[0].look, o.map.walkable(6, 3)], ['carG', 'car-green', false]);
  r.move('down'); r.move('down'); r.move('left');
  assertEqual(r.check('lib').type, 'revealed');
  assertEqual(r.state, 'complete');
});

test('mission trail: a stage asks for its cars, scenes, things and people', function () {
  const FF = load(ASSETS), A = FF.MissionTrail.Assets;
  const stage = JSON.parse(JSON.stringify(ERRAND));
  const keys = A.forStage(stage, FF.MissionTrail.Rules.mapFor(JSON.parse(JSON.stringify(ERRAND_MAP)), stage))
    .map(function (x) { return x.category + '/' + x.id; });
  ['vehicles/car-green-down', 'vehicles/car-green-left', 'vehicles/car-green-up', 'vehicles/car-red-right',
    'scenes/bedroom', 'scenes/library', 'objects/red-cap', 'objects/green-cap', 'characters/librarian', 'characters/doctor',
    'buildings/hall-stone', 'props/fountain'].forEach(function (k) { assert(keys.indexOf(k) !== -1, k); });
  assert(keys.indexOf('props/car-green-down') === -1, 'cars are not props');
});

function withErrand(stage, hide) {
  const FF = load(MORE.concat(['js/missiontrail/engine.js', 'js/data/assetManifest.js', 'js/assets.js', 'js/missiontrail/assets.js']));
  (hide || []).forEach(function (h) { delete FF.AssetManifest[h[0]][h[1]]; });
  FF.data.missionTrailMaps.push(JSON.parse(JSON.stringify(ERRAND_MAP)));
  FF.data.missionTrail.stages = [Object.assign(JSON.parse(JSON.stringify(ERRAND)), { route: [{ go: 2 }] }, stage || {})];
  return { FF: FF, report: checker.report(FF) };
}

test('mission trail: pictures still to come wait, unknown pictures are problems', function () {
  // Pretend the red cap has not been cut yet: it is planned, so it waits.
  const o = withErrand(null, [['games/missionTrail/objects', 'red-cap']]);
  assertEqual(o.report.problems, []);
  assert(o.report.waiting.some(function (w) { return /objects\/red-cap/.test(w); }), o.report.waiting.join('; '));
  const bad = withErrand({ vehicles: [{ key: 'carG', look: 'car-pink', x: 6, y: 3, facing: 'down' }] });
  assert(bad.report.problems.some(function (p) { return /car-pink/.test(p); }), bad.report.problems.join('; '));
});

test('mission trail: the validator checks scenes, the bag and cars', function () {
  const steps = function (list) { return withErrand({ steps: list }).report.problems.join(' | '); };
  const give = { do: 'give', target: 'lib', item: 'red-cap', to: 'librarian', scene: { backdrop: 'library', options: ['librarian', 'teacher', 'doctor'] } };
  assert(/not carrying|carry/.test(steps([give])), 'give without the thing: ' + steps([give]));
  const noAnswer = { do: 'collect', item: 'red-cap', scene: { backdrop: 'bedroom', options: ['blue-cap', 'green-cap', 'keys'] } };
  assert(/red-cap/.test(steps([noAnswer, give])) && /not in its scene|scene/.test(steps([noAnswer, give])), steps([noAnswer, give]));
  assert(/vehicle|car/.test(steps([{ do: 'enter', target: 'lib' }])), 'enter a building: ' + steps([{ do: 'enter', target: 'lib' }]));
});

test('mission trail: stages wait until their pictures exist', function () {
  const FF = load(GAME);
  const d = FF.data.missionTrail;
  const maps = {};
  FF.data.missionTrailMaps.forEach(function (m) { maps[m.id] = m; });
  const G = FF.MissionTrail.Game;
  const ready = G.availableStages(d.stages, maps).map(function (s) { return s.id; });
  assertEqual(ready.slice(0, 5), [1, 2, 3, 4, 5]);
  assertEqual(ready.length, d.stages.length, 'every shipped stage has its pictures');
  const extra = d.stages.concat([
    { id: 99, map: 'town-1', steps: [{ do: 'collect', item: 'no-such-thing', scene: { backdrop: 'bedroom', options: ['no-such-thing'] } }] },
    { id: 100, map: 'town-1', steps: [{ do: 'reach', target: 'a1' }] }
  ]);
  const shown = G.availableStages(extra, maps).map(function (s) { return s.id; });
  assert(shown.indexOf(99) === -1 && shown.indexOf(100) === -1, 'a stage without pictures hides it and every stage after it: ' + shown);
});

test('mission trail: Check prefers the place ahead and never guesses between two', function () {
  const FF = load(GAME), G = FF.MissionTrail.Game;
  const m = FF.MissionTrail.Rules.buildMap(map('town-1'));
  assertEqual(G.checkTarget(m, { x: 9, y: 9, facing: 'right' }, {}), 'c2');
  assertEqual(G.checkTarget(m, { x: 9, y: 9, facing: 'left' }, {}), 'b2');
  assertEqual(G.checkTarget(m, { x: 9, y: 8, facing: 'up' }, {}), null);
  assertEqual(G.checkChoices(m, { x: 9, y: 8, facing: 'up' }, {}), 2);
  assertEqual(G.checkTarget(m, { x: 9, y: 8, facing: 'right' }, {}), 'c2');
});

test('mission trail: results count wrong picks as mistakes', function () {
  const FF = load(SCREENS), doc = document_of(FF);
  const root = doc.createElement('div');
  const res = { done: true, score: 80, stars: 2, ms: 9000, parts: { task: 1, nav: 1, obs: 0.5, seq: 1, time: 1 },
    mistakes: { wrongTurns: 0, extraSteps: 0, bumps: 0, wrongChecks: 1, wrongPicks: 2 } };
  FF.MissionTrail.Screens.results(root, ctxFor(FF, FF.MissionTrail.Progress.empty()), { stage: FF.data.missionTrail.stages[0], result: res, before: null, nextId: null, timeUp: false });
  const all = texts(root);
  const i = all.indexOf('Mistakes');
  assert(i !== -1, 'a Mistakes stat');
  assert(all.indexOf('3') !== -1, 'one wrong place and two wrong picks make 3: ' + all.join('|'));
});

module.exports = { load, map };

test('mission trail: Check looks only at cars while the next job is getting into one', function () {
  const FF = load(GAME), G = FF.MissionTrail.Game;
  const stage = FF.data.missionTrail.stages.filter(function (s) { return s.id === 10; })[0];
  const m = FF.MissionTrail.Rules.mapFor(map('town-1'), stage);
  const at = { x: 9, y: 13, facing: 'up' };
  // Step 2 is "get into the red car": the school beside the start is not a choice,
  // and the red and blue cars are equally near, so the player taps the one they mean.
  const enterSkip = G.skipFor(m, stage.steps[1], {}, null);
  assertEqual(G.checkTarget(m, at, enterSkip), null);
  assertEqual(G.checkChoices(m, at, enterSkip), 2);
  assertEqual(G.checkTarget(m, { x: 8, y: 13, facing: 'up' }, enterSkip), 'carRed');
  // Any other step leaves the cars out.
  const giveSkip = G.skipFor(m, stage.steps[2], {}, 'carRed');
  assert(G.checkTarget(m, at, giveSkip) !== 'carBlue' && G.checkTarget(m, at, giveSkip) !== 'carRed', 'cars are not places');
  assertEqual(G.checkTarget(m, { x: 7, y: 5, facing: 'up' }, giveSkip), 'b1');
});

test('mission trail: pausing stops the clock and the walker', function () {
  const o = newRun(), r = o.run;
  r.start();
  o.clock.t += 5000;
  r.pause();
  assertEqual(r.state, 'paused');
  o.clock.t += 60000;                       // a long pause, past the deadline
  assertEqual(r.remaining(), 15000);
  assertEqual(r.tick(), 'paused');          // never fails while paused
  assertEqual(r.move('up').type, 'ignored');
  assertEqual(r.check('stopB').type, 'ignored');
  r.resume();
  assertEqual([r.state, r.remaining()], ['playing', 15000]);
  r.pause(); r.pause(); r.resume(); r.resume();   // repeats are harmless
  assertEqual(r.remaining(), 15000);
  walk(r, 'UUUUURRR');
  o.clock.t += 1000;
  r.check('stopB');
  assertEqual([r.state, r.result().ms], ['complete', 6000]);   // time taken leaves the pause out
});
