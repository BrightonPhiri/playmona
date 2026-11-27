/* ============================================================
   PLAYMONA — missiontrail/engine.js
   One attempt at a Mission Trail stage, with no DOM. The screens call
   start() when the letter closes, move(dir) per arrow press and
   check(key) when the player checks a place; the engine keeps the
   clock, runs the stage's steps in order, counts mistakes and scores.

   The clock is a deadline: remaining = deadline - now(), so a hidden tab
   or a slow phone never adds time. Every move and check first looks at
   the clock; after the deadline they are ignored and the mission fails.

   Step types live in Engine.STEPS; a new mechanic is a new entry there,
   never stage code. onCheck(run, step, thing) answers 'done', 'wrong' or
   'scene' (open a pick scene: things to collect or people to choose
   from); onPick(run, step, id) answers 'done' or 'wrong'; onDone applies
   the step (into the bag, out of the bag, into the car).
   A collect step with no `at` opens its scene as soon as it is reached
   (the start of the mission, or right after the step before it).
   Events: moved, bumped, revealed, wrong, scene, sceneClosed, picked,
   entered, stepDone, complete, failed.
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

  function atTarget(run, step, thing) { return thing.key === step.target ? 'scene' : 'wrong'; }
  function pickIs(field) { return function (run, step, id) { return id === step[field] ? 'done' : 'wrong'; }; }

  var STEPS = {
    reach: {
      onCheck: function (run, step, thing) { return thing.key === step.target ? 'done' : 'wrong'; }
    },
    // Pick the thing from a scene: at the start (no `at`) or inside the place `at`.
    collect: {
      result: 'picked',
      opensAtOnce: function (step) { return !step.at; },
      onCheck: function (run, step, thing) { return step.at && thing.key === step.at ? 'scene' : 'wrong'; },
      onPick: pickIs('item'),
      onDone: function (run, step) { run.inventory.push(step.item); }
    },
    // Hand what you carry to the right person at the right place.
    give: {
      result: 'given',
      onCheck: atTarget,
      onPick: pickIs('to'),
      onDone: function (run, step) {
        var i = run.inventory.indexOf(step.item);
        if (i !== -1) run.inventory.splice(i, 1);
      }
    },
    // Find the right person at the right place.
    meet: { result: 'met', onCheck: atTarget, onPick: pickIs('to') },
    // Get into the right car; from then on the walker drives it.
    enter: {
      result: 'entered',
      onCheck: function (run, step, thing) { return thing.key === step.target && thing.kind === 'vehicle' ? 'done' : 'wrong'; },
      onDone: function (run, step, thing) { run.vehicle = thing.key; run.vehicleLook = thing.car; }
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
    var pausedAt = null;
    var stepsTaken = 0;
    var onRoute = true;
    var mistakes = { wrongTurns: 0, bumps: 0, wrongChecks: 0, wrongPicks: 0 };

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
      inventory: [],
      scene: null,
      vehicle: null,
      vehicleLook: null,

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
        openAtOnce();
      },

      /* PlayMona's pause button: the clock stops and every input is ignored until resume.
         The paused time moves the deadline and the start, so it never counts. */
      pause: function () {
        if (run.state !== 'playing' || run.tick() !== 'playing') return;
        pausedAt = now();
        run.state = 'paused';
      },
      resume: function () {
        if (run.state !== 'paused') return;
        var away = Math.max(0, now() - pausedAt);
        deadline += away;
        startedAt += away;
        pausedAt = null;
        run.state = 'playing';
      },

      remaining: function () {
        if (run.state === 'ready') return limitMs;
        if (run.state === 'paused') return Math.max(0, deadline - pausedAt);
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
        if (run.tick() !== 'playing' || run.scene) return { type: 'ignored', pos: run.pos };
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
        if (run.tick() !== 'playing' || run.scene) return { type: 'ignored' };
        var thing = map.thing(key);
        if (!thing || !thing.check || thing.key === run.vehicle) return { type: 'ignored' };
        if (!R.inReach(run.pos, thing)) return { type: 'far' };
        var step = steps[run.stepIndex];
        var kind = step && STEPS[step.do];
        var res = kind ? kind.onCheck(run, step, thing) : 'wrong';
        if (res === 'scene') {
          reveal(key);
          openScene(step, true);
          return { type: 'scene', name: run.revealed[key] };
        }
        if (res === 'done') {
          if (thing.kind !== 'vehicle') reveal(key);
          var type = finishStep(step, kind, thing);
          return type === 'revealed' ? { type: 'revealed', name: run.revealed[key] } : { type: type };
        }
        return penalise('wrongChecks', { key: key });
      },

      /* Choose a thing or a person in the open scene. */
      pick: function (id) {
        if (run.tick() !== 'playing' || !run.scene) return { type: 'ignored' };
        var step = steps[run.stepIndex];
        var kind = step && STEPS[step.do];
        var res = kind && kind.onPick ? kind.onPick(run, step, id) : 'wrong';
        if (res !== 'done') return penalise('wrongPicks', { pick: id });
        run.scene = null;
        return { type: finishStep(step, kind, null, id) };
      },

      /* Step back out of a scene opened at a place (a start scene stays open). */
      closeScene: function () {
        if (!run.scene || !run.scene.closable) return false;
        run.scene = null;
        emit('sceneClosed', null);
        return true;
      },

      result: function () {
        var done = run.state === 'complete';
        var ms = startedAt === null ? 0 : Math.max(0, (endedAt === null ? now() : endedAt) - startedAt);
        var m = {
          wrongTurns: mistakes.wrongTurns,
          extraSteps: Math.max(0, stepsTaken - routeSteps),
          bumps: mistakes.bumps,
          wrongChecks: mistakes.wrongChecks,
          wrongPicks: mistakes.wrongPicks
        };
        var parts = {
          task: done ? 1 : 0,
          nav: S.nav(m),
          obs: S.obs(m.wrongChecks + m.wrongPicks),
          seq: steps.length > 1 ? 1 : null,
          time: S.time(ms, limitMs, S.parMs(routeSteps, steps.length))
        };
        var score = done ? S.total(parts, stage.scoring || null) : 0;
        return { done: done, score: score, stars: done ? S.stars(score) : 0, ms: ms, parts: parts, mistakes: m };
      }
    };

    function reveal(key) {
      if (run.revealed[key]) return;
      var name = nameOf(key);
      run.revealed[key] = name;
      emit('revealed', { key: key, name: name });
    }

    function openScene(step, closable) {
      var sc = step.scene || {};
      run.scene = {
        step: run.stepIndex,
        kind: step.do,
        backdrop: sc.backdrop || null,
        options: (sc.options || []).slice(),
        closable: !!closable
      };
      emit('scene', run.scene);
    }

    function openAtOnce() {
      var step = steps[run.stepIndex];
      var kind = step && STEPS[step.do];
      if (kind && kind.opensAtOnce && kind.opensAtOnce(step)) openScene(step, false);
    }

    function penalise(field, data) {
      mistakes[field] += 1;
      deadline -= WRONG_CHECK_MS;
      emit('wrong', data);
      run.tick();
      return { type: 'wrong' };
    }

    /* The step is done: apply it, move on, then finish the mission or open the next scene. */
    function finishStep(step, kind, thing, picked) {
      if (kind.onDone) kind.onDone(run, step, thing, picked);
      var type = kind.result || 'revealed';
      if (type === 'entered') emit('entered', { key: thing.key, look: run.vehicleLook });
      if (picked !== undefined) emit('picked', { kind: step.do, id: picked, inventory: run.inventory.slice() });
      run.stepIndex += 1;
      emit('stepDone', { index: run.stepIndex - 1, total: steps.length });
      if (run.stepIndex >= steps.length) {
        run.state = 'complete';
        endedAt = now();
        emit('complete', run.result());
      } else {
        openAtOnce();
      }
      return type;
    }
    return run;
  }

  FF.MissionTrail.Engine = { create: create, STEPS: STEPS, WRONG_CHECK_MS: WRONG_CHECK_MS };
})();
