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

module.exports = { load, map };
