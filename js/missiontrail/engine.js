/* ============================================================
   PLAYMONA — missiontrail/engine.js
   One attempt at a Mission Trail stage, with no DOM. The screens call
   start() when the letter closes, move(dir) per arrow press and
   check(key) when the player checks a place; the engine keeps the
   clock, runs the stage's steps in order, counts mistakes and scores.

   The clock is a deadline: remaining = deadline - now(), so a hidden tab
   or a slow phone never adds time. Every move and check first looks at
   the clock; after the deadline they are ignored and the mission fails.

   Step types live in Engine.STEPS; a new mechanic is a new entry there
   (onCheck(run, step, thing) -> 'done' | 'wrong'), never stage code.
   Events: moved, bumped, revealed, wrong, stepDone, complete, failed.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var WRONG_CHECK_MS = 3000;

  function t(key, fallback) { return FF.t ? FF.t(key, fallback) : String(fallback); }

  function clockNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  var STEPS = {
    reach: {
      onCheck: function (run, step, thing) { return thing.key === step.target ? 'done' : 'wrong'; }
    }
  };

  function create(stage, map, opts) {
    opts = opts || {};
    var R = FF.MissionTrail.Rules;
    var S = FF.MissionTrail.Score;
    var now = opts.now || clockNow;
    var names = opts.names || (FF.data && FF.data.missionTrail && FF.data.missionTrail.identityNames) || {};
    var limitMs = (stage.time || 60) * 1000;
    var start = stage.start || map.start;
    var route = R.routeCells(map, start, stage.route || []);
    var onRouteSet = {};
    route.cells.forEach(function (c) { onRouteSet[c[0] + ',' + c[1]] = true; });
    var routeSteps = route.cells.length - 1;
    var steps = stage.steps || [];
    var listeners = {};
    var startedAt = null;
    var endedAt = null;
    var deadline = null;
    var stepsTaken = 0;
    var onRoute = true;
    var mistakes = { wrongTurns: 0, bumps: 0, wrongChecks: 0 };

    function emit(type, data) {
      (listeners[type] || []).slice().forEach(function (fn) { fn(data); });
    }

    function nameOf(key) {
      var id = stage.identities && stage.identities[key];
      return id ? t('mtPlace_' + id, names[id] || id) : t('mtPlaceHere', 'This place');
    }

    var run = {
      id: 'mt' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      stage: stage,
      map: map,
      state: 'ready',
      pos: { x: start.x, y: start.y, facing: start.facing || 'up' },
      stepIndex: 0,
      revealed: {},
      routeSteps: routeSteps,

      on: function (type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
        return function () {
          var list = listeners[type] || [];
          var i = list.indexOf(fn);
          if (i !== -1) list.splice(i, 1);
        };
      },

      start: function () {
        if (run.state !== 'ready') return;
        startedAt = now();
        deadline = startedAt + limitMs;
        run.state = 'playing';
      },

      remaining: function () {
        if (run.state === 'ready') return limitMs;
        var at = run.state === 'playing' ? now() : endedAt;
        return Math.max(0, deadline - at);
      },

      tick: function () {
        if (run.state === 'playing' && now() >= deadline) {
          run.state = 'failed';
          endedAt = deadline;
          emit('failed', run.result());
        }
        return run.state;
      },

      move: function (dir) {
        if (run.tick() !== 'playing') return { type: 'ignored', pos: run.pos };
        var next = R.move(map, run.pos, dir);
        run.pos = { x: next.x, y: next.y, facing: next.facing };
        if (!next.moved) {
          mistakes.bumps += 1;
          emit('bumped', run.pos);
          return { type: 'bumped', pos: run.pos };
        }
        stepsTaken += 1;
        var on = !!onRouteSet[next.x + ',' + next.y];
        if (onRoute && !on) mistakes.wrongTurns += 1;
        onRoute = on;
        emit('moved', run.pos);
        return { type: 'moved', pos: run.pos };
      },

      check: function (key) {
        if (run.tick() !== 'playing') return { type: 'ignored' };
        var thing = map.thing(key);
        if (!thing || !thing.check) return { type: 'ignored' };
        if (!R.inReach(run.pos, thing)) return { type: 'far' };
        var step = steps[run.stepIndex];
        var kind = step && STEPS[step.do];
        var res = kind ? kind.onCheck(run, step, thing) : 'wrong';
        if (res === 'done') {
          var name = nameOf(key);
          run.revealed[key] = name;
          emit('revealed', { key: key, name: name });
          run.stepIndex += 1;
          emit('stepDone', { index: run.stepIndex - 1, total: steps.length });
          if (run.stepIndex >= steps.length) {
            run.state = 'complete';
            endedAt = now();
            emit('complete', run.result());
          }
          return { type: 'revealed', name: name };
        }
        mistakes.wrongChecks += 1;
        deadline -= WRONG_CHECK_MS;
        emit('wrong', { key: key });
        run.tick();
        return { type: 'wrong' };
      },

      result: function () {
        var done = run.state === 'complete';
        var ms = startedAt === null ? 0 : Math.max(0, (endedAt === null ? now() : endedAt) - startedAt);
        var m = {
          wrongTurns: mistakes.wrongTurns,
          extraSteps: Math.max(0, stepsTaken - routeSteps),
          bumps: mistakes.bumps,
          wrongChecks: mistakes.wrongChecks
        };
        var parts = {
          task: done ? 1 : 0,
          nav: S.nav(m),
          obs: S.obs(m.wrongChecks),
          seq: steps.length > 1 ? 1 : null,
          time: S.time(ms, limitMs, S.parMs(routeSteps, steps.length))
        };
        var score = done ? S.total(parts, stage.scoring || null) : 0;
        return { done: done, score: score, stars: done ? S.stars(score) : 0, ms: ms, parts: parts, mistakes: m };
      }
    };
    return run;
  }

  FF.MissionTrail.Engine = { create: create, STEPS: STEPS, WRONG_CHECK_MS: WRONG_CHECK_MS };
})();
