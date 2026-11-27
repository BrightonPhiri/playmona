#!/usr/bin/env node
/* Checks every Mission Trail stage can be played before it ships.
   Usage: node tools/missiontrail-check.js
   Also run by tools/test/missionTrail.test.js (module.exports.check).

   For each stage: ids run 1, 2, 3 ...; its map exists; its identities and
   step targets are things on that map; the letter's route stays on
   walkable cells; every turn is at a junction (a cell with another way
   to go, so the instruction matters); the last target is in reach of the
   route's end and can be reached from the start; and, when the asset
   registry is loaded, every picture the stage needs is cut (pictures the
   art pack promises, Assets.PLANNED, are listed as "waiting for art" and
   the stage stays hidden in the game until they arrive); the time limit
   leaves at least 6 s over par (FF.MissionTrail.Score.parMs); every pick
   scene holds its answer among at least 3 choices; a give step hands over
   something an earlier step collected; an enter step targets a car. */
'use strict';

const path = require('path');

function check(FF) { return report(FF).problems; }

function report(FF) {
  const problems = [];
  const waiting = [];
  const out = { problems: problems, waiting: waiting };
  const R = FF.MissionTrail && FF.MissionTrail.Rules;
  const data = FF.data && FF.data.missionTrail;
  if (!R) { problems.push('FF.MissionTrail.Rules is not loaded'); return out; }
  if (!data || !Array.isArray(data.stages)) { problems.push('FF.data.missionTrail.stages is missing'); return out; }
  const maps = {};
  (FF.data.missionTrailMaps || []).forEach(function (m) { maps[m.id] = m; });
  const Assets = FF.MissionTrail.Assets;

  data.stages.forEach(function (stage, i) {
    const say = function (msg) { problems.push('Stage ' + stage.id + ': ' + msg); };
    if (stage.id !== i + 1) say('expected stage ' + (i + 1) + ' here (ids must run 1, 2, 3 ...)');
    if (!(stage.time > 0)) say('time must be a positive number of seconds');
    const def = maps[stage.map];
    if (!def) { say('map "' + stage.map + '" does not exist'); return; }
    const map = R.mapFor ? R.mapFor(def, stage) : R.buildMap(def);

    if (Assets && Assets.forStage) {
      Assets.missing(Assets.forStage(stage, map)).forEach(function (it) {
        const id = it.category + '/' + it.id;
        if (Assets.planned(it.category, it.id)) waiting.push('Stage ' + stage.id + ': ' + id);
        else say('needs the picture ' + id + ', which is not cut and not in the art pack (Assets.PLANNED)');
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
    const carrying = [];
    steps.forEach(function (step, idx) {
      const n = 'step ' + (idx + 1);
      if (!FF.MissionTrail.Engine || !FF.MissionTrail.Engine.STEPS[step.do]) {
        if (FF.MissionTrail.Engine) say(n + ' has the unknown type "' + step.do + '"');
      }
      const answer = step.do === 'collect' ? step.item : ((step.do === 'give' || step.do === 'meet') ? step.to : null);
      if (answer !== null) {
        const opts = (step.scene && step.scene.options) || [];
        if (!answer) say(n + ' (' + step.do + ') does not say who or what is right');
        else if (opts.indexOf(answer) === -1) say(n + ': ' + answer + ' is not in its scene');
        if (opts.length < 3) say(n + ': a scene needs at least 3 choices');
        if (opts.some(function (o, i) { return opts.indexOf(o) !== i; })) say(n + ': its scene lists a choice twice');
        if (!step.scene || !step.scene.backdrop) say(n + ': its scene has no backdrop');
      }
      if (step.do === 'collect') carrying.push(step.item);
      if (step.do === 'give') {
        const at = carrying.indexOf(step.item);
        if (at === -1) say(n + ' gives ' + step.item + ', which the player is not carrying');
        else carrying.splice(at, 1);
      }
      const key = step.target || step.at;
      if (!key) return;
      const th = map.thing(key);
      if (!th) { say(n + ' targets "' + key + '", which is not on map ' + map.id); return; }
      if (step.do === 'enter' && th.kind !== 'vehicle') say(n + ' enters "' + key + '", which is not a car');
      if (!th.check) say(n + ' targets "' + key + '", which cannot be checked');
      if (!reachable.some(function (c) { return R.inReach({ x: c[0], y: c[1] }, th); })) {
        say(n + ' target "' + key + '" cannot be reached from the start');
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
  return out;
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

module.exports = { check: check, report: report };

if (require.main === module) {
  const { loadFF } = require(path.join(__dirname, 'test', 'harness'));
  const FF = loadFF([
    'js/core.js', 'js/data/assetManifest.js', 'js/assets.js',
    'js/data/missionTrailMaps.js', 'js/data/missionTrailStages.js',
    'js/missiontrail/rules.js', 'js/missiontrail/score.js', 'js/missiontrail/engine.js'
  ].concat(require('fs').existsSync(path.join(__dirname, '..', 'js', 'missiontrail', 'assets.js')) ? ['js/missiontrail/assets.js'] : []));
  const res = report(FF);
  if (res.problems.length) {
    res.problems.forEach(function (p) { console.log(p); });
    process.exit(1);
  }
  if (res.waiting.length) {
    const by = {};
    res.waiting.forEach(function (w) { const m = w.split(': '); (by[m[0]] = by[m[0]] || []).push(m[1]); });
    Object.keys(by).forEach(function (k) { console.log(k + ' waits for art: ' + by[k].join(', ')); });
  }
  console.log(FF.data.missionTrail.stages.length + ' stages OK');
}
