#!/usr/bin/env node
/* Checks every Mission Trail stage can be played before it ships.
   Usage: node tools/missiontrail-check.js
   Also run by tools/test/missionTrail.test.js (module.exports.check).

   For each stage: ids run 1, 2, 3 ...; its map exists; its identities and
   step targets are things on that map; the letter's route stays on
   walkable cells; every turn is at a junction (a cell with another way
   to go, so the instruction matters); the last target is in reach of the
   route's end and can be reached from the start; and, when the asset
   registry is loaded, every look on the map is a known picture; and the
   time limit leaves at least 6 s over par (FF.MissionTrail.Score.parMs). */
'use strict';

const path = require('path');

function check(FF) {
  const problems = [];
  const R = FF.MissionTrail && FF.MissionTrail.Rules;
  const data = FF.data && FF.data.missionTrail;
  if (!R) return ['FF.MissionTrail.Rules is not loaded'];
  if (!data || !Array.isArray(data.stages)) return ['FF.data.missionTrail.stages is missing'];
  const maps = {};
  (FF.data.missionTrailMaps || []).forEach(function (m) { maps[m.id] = m; });
  const Assets = FF.MissionTrail.Assets;

  data.stages.forEach(function (stage, i) {
    const say = function (msg) { problems.push('Stage ' + stage.id + ': ' + msg); };
    if (stage.id !== i + 1) say('expected stage ' + (i + 1) + ' here (ids must run 1, 2, 3 ...)');
    if (!(stage.time > 0)) say('time must be a positive number of seconds');
    const def = maps[stage.map];
    if (!def) { say('map "' + stage.map + '" does not exist'); return; }
    const map = R.buildMap(def);

    if (Assets && Assets.known) {
      map.things.forEach(function (th) {
        const cat = th.kind === 'building' ? 'buildings' : 'props';
        if (!Assets.known(cat, th.look)) say('"' + th.key + '" uses the look "' + th.look + '", which is not in ' + cat);
      });
    }

    Object.keys(stage.identities || {}).forEach(function (key) {
      if (!map.thing(key)) say('identity for "' + key + '", which is not on map ' + map.id);
    });

    const start = stage.start || map.start;
    if (!map.walkable(start.x, start.y)) say('the start (' + start.x + ',' + start.y + ') is not walkable');
    const route = stage.route || [];
    const r = R.routeCells(map, start, route);
    if (!r.ok) say('the route does not work: ' + r.error);
    route.forEach(function (item, idx) {
      if (!item.turn) return;
      const at = R.routeCells(map, start, route.slice(0, idx)).end;
      const mask = R.roadMask(map, at.x, at.y);
      const ways = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
      if (ways < 3) say('route item ' + (idx + 1) + ' turns at (' + at.x + ',' + at.y + '), which is not a junction');
    });

    route.forEach(function (item) {
      if (!item.take) return;
      if (!map.things.some(function (th) { return th.sign === item.take; })) {
        say('the letter names ' + item.take + ', but no signpost on map ' + map.id + ' shows it');
      }
    });

    const steps = stage.steps || [];
    if (!steps.length) say('has no steps');
    const reachable = reachableCells(map, start);
    steps.forEach(function (step, idx) {
      if (!FF.MissionTrail.Engine || !FF.MissionTrail.Engine.STEPS[step.do]) {
        if (FF.MissionTrail.Engine) say('step ' + (idx + 1) + ' has the unknown type "' + step.do + '"');
      }
      if (!step.target) return;
      const th = map.thing(step.target);
      if (!th) { say('step ' + (idx + 1) + ' targets "' + step.target + '", which is not on map ' + map.id); return; }
      if (!th.check) say('step ' + (idx + 1) + ' targets "' + step.target + '", which cannot be checked');
      if (!reachable.some(function (c) { return R.inReach({ x: c[0], y: c[1] }, th); })) {
        say('step ' + (idx + 1) + ' target "' + step.target + '" cannot be reached from the start');
      }
    });
    const Score = FF.MissionTrail.Score;
    if (r.ok && Score && stage.time > 0) {
      // A sure player needs par; leave at least 6 s for remembering and a slip.
      const par = Score.parMs(r.cells.length - 1, steps.length);
      if (stage.time * 1000 < par + 6000) {
        say('time ' + stage.time + ' s is too short: par is ' + (par / 1000) + ' s, allow at least ' + Math.ceil((par + 6000) / 1000) + ' s');
      }
    }
    const last = steps[steps.length - 1];
    if (r.ok && last && last.target && map.thing(last.target) && !R.inReach(r.end, map.thing(last.target))) {
      say('the route ends at (' + r.end.x + ',' + r.end.y + '), out of reach of "' + last.target + '"');
    }
  });
  return problems;
}

function reachableCells(map, start) {
  const seen = {};
  const out = [];
  const queue = [[start.x, start.y]];
  seen[start.x + ',' + start.y] = true;
  while (queue.length) {
    const c = queue.shift();
    out.push(c);
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
      const x = c[0] + d[0];
      const y = c[1] + d[1];
      if (!seen[x + ',' + y] && map.walkable(x, y)) {
        seen[x + ',' + y] = true;
        queue.push([x, y]);
      }
    });
  }
  return out;
}

module.exports = { check: check };

if (require.main === module) {
  const { loadFF } = require(path.join(__dirname, 'test', 'harness'));
  const FF = loadFF([
    'js/core.js', 'js/data/assetManifest.js',
    'js/data/missionTrailMaps.js', 'js/data/missionTrailStages.js',
    'js/missiontrail/rules.js', 'js/missiontrail/score.js', 'js/missiontrail/engine.js'
  ].concat(require('fs').existsSync(path.join(__dirname, '..', 'js', 'missiontrail', 'assets.js')) ? ['js/missiontrail/assets.js'] : []));
  const problems = check(FF);
  if (problems.length) {
    problems.forEach(function (p) { console.log(p); });
    process.exit(1);
  }
  console.log(FF.data.missionTrail.stages.length + ' stages OK');
}
