/* ============================================================
   PLAYMONA — games/missionTrail.js
   Mission Trail: read a mission letter once, then walk the town from
   memory and finish it before the clock runs out. One visit plays many
   stages; Done on the landing or stage picker closes the game once.

   Wires FF.MissionTrail.Screens (DOM) to the Engine (rules of one
   attempt), the Render view (canvas town) and Progress (saved stars).
   The clock is the engine's deadline: pausing the shell does not stop
   it, and a hidden tab fails the mission on return once time is up.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }
  function sound(name) { if (FF.Audio && FF.Audio.play) FF.Audio.play(name); }

  function nearThings(map, pos, skip) {
    var R = FF.MissionTrail.Rules;
    return map.things.filter(function (th) { return th.check && !skip[th.key] && R.inReach(pos, th); });
  }

  /* What Check leaves out for the current step: places already found (except the one this
     step still needs, since a give or meet place reopens its scene) and the car being driven.
     While the step is getting into a car only cars count; otherwise cars never do, so Check
     never spends the player's time on a kind of thing the step cannot want. */
  function skipFor(map, step, revealed, vehicle) {
    var skip = {};
    Object.keys(revealed || {}).forEach(function (k) { skip[k] = true; });
    var wantCar = !!(step && step.do === 'enter');
    map.things.forEach(function (th) { if ((th.kind === 'vehicle') !== wantCar) skip[th.key] = true; });
    if (step) { delete skip[step.target]; delete skip[step.at]; }
    if (vehicle) skip[vehicle] = true;
    return skip;
  }

  /* How many places Check could mean from here. */
  function checkChoices(map, pos, skip) { return nearThings(map, pos, skip || {}).length; }

  /* The thing the Check button checks: what the walker faces, else the nearest in reach,
     else the nearest one ahead. Two equally good choices give null: Check never guesses
     (a wrong guess would cost the player time), so the player taps the one they mean. */
  function checkTarget(map, pos, skip) {
    var R = FF.MissionTrail.Rules;
    var near = nearThings(map, pos, skip || {});
    if (!near.length) return null;
    var d = R.DIRS[pos.facing] || [0, 0];
    var fx = pos.x + d[0];
    var fy = pos.y + d[1];
    for (var i = 0; i < near.length; i++) {
      var th = near[i];
      if (fx >= th.x && fx < th.x + th.w && fy >= th.y && fy < th.y + th.h) return th.key;
    }
    function dist(th) {
      var cx = Math.max(th.x, Math.min(pos.x, th.x + th.w - 1));
      var cy = Math.max(th.y, Math.min(pos.y, th.y + th.h - 1));
      return Math.abs(cx - pos.x) + Math.abs(cy - pos.y);
    }
    function ahead(th) { return (th.x + th.w / 2 - 0.5 - pos.x) * d[0] + (th.y + th.h / 2 - 0.5 - pos.y) * d[1]; }
    near.sort(function (a, b) { return dist(a) - dist(b) || ahead(b) - ahead(a); });
    if (near.length > 1 && dist(near[0]) === dist(near[1]) && ahead(near[0]) === ahead(near[1])) return null;
    return near[0].key;
  }

  /* Turns presses into engine moves and walker animations. Every press reaches the
     engine at once (it is the truth for position, mistakes and the clock); the view
     walks the same cells behind it and jumps ahead when more than two steps behind,
     so fast taps are never lost. A held key's auto-repeat only counts when the walker
     is standing still, so letting go stops it where it is.
     view: { isMoving(), walk(pos, done), place(pos), face(dir), shake() }. */
  function createMover(run, view, hooks) {
    hooks = hooks || {};
    var queue = [];
    function next() {
      if (!queue.length) return;
      while (queue.length > 2) view.place(queue.shift());
      view.walk(queue.shift(), next);
    }
    function busy() { return view.isMoving() || queue.length > 0; }
    return {
      busy: busy,
      move: function (dir, repeat) {
        if (run.state !== 'playing') return { type: 'ignored' };
        var wasBusy = busy();
        if (repeat && wasBusy) return { type: 'ignored' };
        var r = run.move(dir);
        if (r.type === 'moved') {
          queue.push({ x: r.pos.x, y: r.pos.y, facing: r.pos.facing });
          if (!view.isMoving()) next();
          if (hooks.moved) hooks.moved(r.pos);
        } else if (r.type === 'bumped') {
          if (!wasBusy) { view.face(dir); view.shake(); }
          if (hooks.bumped) hooks.bumped(dir);
        }
        return r;
      }
    };
  }

  /* The stages a player can see: the run from Stage 1 up to the first stage whose map is
     missing or whose pictures are not cut yet (the art pack sends them later). */
  function availableStages(stages, mapsById) {
    var MT = FF.MissionTrail;
    var out = [];
    var checkArt = !!(FF.AssetManifest && MT.Assets && MT.Assets.forStage);
    for (var i = 0; i < stages.length; i++) {
      var stage = stages[i];
      var def = mapsById[stage.map];
      if (!def) break;
      if (checkArt && MT.Assets.missing(MT.Assets.forStage(stage, MT.Rules.mapFor(def, stage))).length) break;
      out.push(stage);
    }
    return out;
  }

  /* The summary PlayMona's end screen shows for one visit. */
  function visitSummary(visit) {
    return {
      kicker: t('mtName', 'Mission Trail'),
      headline: visit.completed
        ? t('mtVisitDone', '{n} missions completed!', { n: visit.completed })
        : t('mtVisitNone', 'See you on the trail!'),
      stats: [
        { icon: 'check-circle', label: t('mtCompleted', 'Completed'), value: String(visit.completed) },
        { icon: 'star-fill', label: t('mtStarsEarned', 'New stars'), value: String(visit.stars) }
      ]
    };
  }

  function start(api) {
    var MT = FF.MissionTrail;
    var data = FF.data.missionTrail;
    var maps = FF.data.missionTrailMaps || [];
    var mapsById = {};
    maps.forEach(function (m) { mapsById[m.id] = m; });
    var root = api.shell.root;
    if (api.shell.el && api.shell.el.classList) api.shell.el.classList.add('mt-shell');
    var player = (api.config.scorers && api.config.scorers[0]) || { id: 'me', name: t('you', 'You') };
    var visit = { completed: 0, stars: 0, ended: false };
    var attempt = null;   // the stage being played: { run, view, handle, raf, off }
    var token = 0;        // bumps on every screen change, so late image loads are dropped

    var ctx = {
      api: api,
      stages: availableStages(data.stages, mapsById),
      groups: data.groups,
      progress: MT.Progress.load(),
      open: open,
      home: home,
      picker: picker,
      done: done
    };

    function shown() { return !!root && root.isConnected !== false; }
    function fresh() { stop(); token += 1; ctx.progress = MT.Progress.load(); return token; }
    function stageById(id) {
      for (var i = 0; i < ctx.stages.length; i++) if (ctx.stages[i].id === id) return ctx.stages[i];
      return null;
    }

    function home() { fresh(); MT.Screens.landing(root, ctx); }
    function picker(gi) { fresh(); MT.Screens.picker(root, ctx, gi); }

    function done() {
      if (visit.ended) return;
      visit.ended = true;
      fresh();
      api.end({
        results: [{ id: player.id, name: player.name, avatar: player.avatar, color: player.color, photo: player.photo,
          points: Math.min(10, visit.stars), correct: visit.completed }],
        winnerId: player.id,
        summary: visitSummary(visit)
      });
    }

    function open(id) {
      var my = fresh();
      var stage = stageById(id);
      if (!stage || MT.Progress.state(ctx.progress, id) === 'locked') { MT.Screens.picker(root, ctx, 0); return; }
      var def = maps.filter(function (m) { return m.id === stage.map; })[0];
      if (!def) { FF.GameUI.exitCard(api, t('mtName', 'Mission Trail'), t('needsPictures', 'This game needs its pictures, which could not be found. Please try again later.')); return; }
      var map = MT.Rules.mapFor(JSON.parse(JSON.stringify(def)), stage);
      FF.ui.clear(root);
      if (FF.UI && FF.UI.loading) root.appendChild(FF.UI.loading(t('mtLoading', 'Getting the town ready…')));
      MT.Assets.load(MT.Assets.forStage(stage, map)).then(function (images) {
        if (my !== token || !shown()) return;
        MT.Screens.letter(root, stage, player.name, function () {
          if (my !== token || !shown()) return;
          play(stage, map, images);
        });
      }).catch(function () {
        if (my !== token || !shown()) return;
        FF.GameUI.exitCard(api, t('mtName', 'Mission Trail'), t('needsPictures', 'This game needs its pictures, which could not be found. Please try again later.'));
      });
    }

    function play(stage, map, images) {
      var run = MT.Engine.create(stage, map, {});
      var mover = null;
      var a = { run: run, view: null, handle: null, raf: null, off: [] };
      attempt = a;
      var handle = MT.Screens.play(root, {
        stage: stage,
        total: (stage.steps || []).length,
        onMove: function (dir, repeat) { if (mover) mover.move(dir, repeat); },
        onCheck: function () {
          var key = checkTarget(map, run.pos, skipped());
          if (key) doCheck(key);
          else if (checkChoices(map, run.pos, skipped()) > 1) {
            var forCar = ((stage.steps || [])[run.stepIndex] || {}).do === 'enter';
            handle.say(forCar ? t('mtTapWhichCar', 'Tap the car you mean.') : t('mtTapWhich', 'Tap the place you mean.'), 'info');
          }
          else handle.say(t('mtWalkCloser', 'Walk closer to check it.'), 'info');
        },
        onTap: function (e) {
          var key = a.view && a.view.thingAtPoint(e.clientX, e.clientY);
          if (key) doCheck(key);
        },
        onPick: function (id) { doPick(id); },
        onCloseScene: function () { if (run.closeScene()) { handle.closeScene(); sync(); } }
      });
      a.handle = handle;
      var view = MT.Render.create(handle.canvas, map, images, { fog: !!stage.fog });
      a.view = view;
      view.place(run.pos);
      var explored = new Set();
      function fog() {
        if (!stage.fog) return;
        var vis = MT.Rules.visibleCells(map, run.pos, 3);
        vis.forEach(function (i) { explored.add(i); });
        view.fog(vis, explored);
      }
      function skipped() { return skipFor(map, (stage.steps || [])[run.stepIndex], run.revealed, run.vehicle); }
      function sync() { handle.showCheck(run.state === 'playing' && !run.scene && checkChoices(map, run.pos, skipped()) > 0); }
      fog();
      sync();
      mover = createMover(run, view, {
        moved: function () { sound('tap'); fog(); sync(); },
        bumped: function () { sync(); }
      });
      function doCheck(key) {
        if (run.state !== 'playing') return;
        var r = run.check(key);
        if (r.type === 'far') handle.say(t('mtWalkCloser', 'Walk closer to check it.'), 'info');
        else if (r.type === 'wrong') {
          sound('wrong');
          var isCar = (map.thing(key) || {}).kind === 'vehicle';
          handle.say(isCar
            ? t('mtNotTheCar', 'That isn’t the car from your letter. {n} seconds off!', { n: MT.Engine.WRONG_CHECK_MS / 1000 })
            : t('mtNotThePlace', 'This isn’t the place from your letter. {n} seconds off!', { n: MT.Engine.WRONG_CHECK_MS / 1000 }), 'bad');
          handle.penalty();
          view.shake();
        } else if (r.type === 'revealed' || r.type === 'scene') {
          sound('correct');
          view.reveal(key, r.name);
          if (r.type === 'revealed') handle.say(t('mtFound', 'You found the {name}!', { name: String(r.name).toLowerCase() }), 'good');
        } else if (r.type === 'entered') {
          sound('correct');
          handle.say(t('mtInTheCar', 'You are in the car. Drive!'), 'good');
        }
        sync();
      }

      var names = { objects: data.objectNames || {}, characters: data.peopleNames || {} };
      function choice(category, id) {
        return { id: id, src: MT.Assets.path(category, id), name: t('mtThing_' + id, names[category][id] || id) };
      }
      function doPick(id) {
        if (run.state !== 'playing' || !run.scene) return;
        var r = run.pick(id);
        if (r.type === 'wrong') {
          sound('wrong');
          handle.say(t('mtNotThatOne', 'Not that one. {n} seconds off!', { n: MT.Engine.WRONG_CHECK_MS / 1000 }), 'bad');
          handle.penalty();
          handle.sceneWrong(id);
        }
      }
      a.off.push(run.on('scene', function (sc) {
        var category = MT.Assets.OPTION_CAT[sc.kind] || 'objects';
        handle.openScene({
          kind: sc.kind,
          category: category,
          closable: sc.closable,
          backdrop: sc.backdrop ? MT.Assets.path('scenes', sc.backdrop) : null,
          options: sc.options.map(function (id) { return choice(category, id); })
        });
        sync();
      }));
      a.off.push(run.on('picked', function (e) {
        sound('correct');
        handle.closeScene();
        handle.setBag(e.inventory.map(function (id) { return choice('objects', id); }));
        var who = e.kind === 'collect' ? null : choice('characters', e.id).name;
        var thing = e.kind === 'collect' ? choice('objects', e.id).name : null;
        if (e.kind === 'collect') handle.say(t('mtPickedUp', '{name} is in your bag.', { name: thing }), 'good');
        else if (e.kind === 'give') handle.say(t('mtGaveTo', 'You gave it to the {name}.', { name: String(who).toLowerCase() }), 'good');
        else handle.say(t('mtMet', 'You found the {name}!', { name: String(who).toLowerCase() }), 'good');
        sync();
      }));
      a.off.push(run.on('entered', function (e) { view.drive(e.key, e.look); }));

      a.off.push(run.on('stepDone', function (e) { handle.setSteps(e.index + 1); }));
      a.off.push(run.on('complete', function (res) { finish(stage, res, false); }));
      a.off.push(run.on('failed', function (res) { finish(stage, res, true); }));

      // PlayMona's pause button (and its exit card) stop this game's own clock: at once when
      // the card is added to or taken off the game screen, and on every frame as a backstop.
      function holdClock() {
        if (attempt !== a) return;
        var covered = handle.covered();
        if (covered && run.state === 'playing') run.pause();
        else if (!covered && run.state === 'paused') run.resume();
      }
      var gameScreen = document.getElementById && document.getElementById('game-screen');
      if (gameScreen && window.MutationObserver) {
        var watcher = new MutationObserver(holdClock);
        watcher.observe(gameScreen, { childList: true });
        a.off.push(function () { watcher.disconnect(); });
      }

      function frame() {
        a.raf = null;
        if (attempt !== a) return;
        if (!handle.canvas.isConnected) { stop(); return; }
        holdClock();
        run.tick();
        handle.setClock(run.remaining());
        if (run.state === 'playing' || run.state === 'paused') a.raf = window.requestAnimationFrame(frame);
      }
      function onVisible() { if (attempt === a) { run.tick(); handle.setClock(run.remaining()); } }
      document.addEventListener('visibilitychange', onVisible);
      a.off.push(function () { document.removeEventListener('visibilitychange', onVisible); });

      function go() {
        if (attempt !== a || !shown()) return;
        run.start();
        handle.bind();
        a.off.push(handle.unbind);
        sync();
        frame();
      }
      var saved = ctx.progress.stages[String(stage.id)];
      if (stage.tip && !(saved && saved.plays)) MT.Screens.tip(root, go);
      else go();
    }

    function finish(stage, result, timeUp) {
      var a = attempt;
      if (!a) return;
      if (a.raf) { window.cancelAnimationFrame(a.raf); a.raf = null; }
      a.handle.unbind();
      a.handle.showCheck(false);
      a.handle.closeScene();
      a.handle.setClock(a.run.remaining());
      var before = MT.Progress.load();
      var prevStage = before.stages[String(stage.id)] ? JSON.parse(JSON.stringify(before.stages[String(stage.id)])) : null;
      var after = MT.Progress.record(before, stage.id, result, a.run.id);
      MT.Progress.save(after);
      var gained = MT.Progress.totals(after).stars - MT.Progress.totals(before).stars;
      if (result.done) visit.completed += 1;
      visit.stars += Math.max(0, gained);
      ctx.progress = after;
      var nextStage = stageById(stage.id + 1);
      var nextId = nextStage && MT.Progress.state(after, nextStage.id) !== 'locked' ? nextStage.id : null;
      if (result.done && FF.Confetti && FF.Confetti.burst) FF.Confetti.burst(result.stars >= 3 ? 120 : 60);
      var my = token;
      setTimeout(function () {
        if (my !== token || attempt !== a || !shown()) return;
        stop();
        MT.Screens.results(root, ctx, { stage: stage, result: result, before: prevStage, nextId: nextId, timeUp: timeUp });
      }, result.done ? 1100 : 700);
    }

    function stop() {
      var a = attempt;
      if (!a) return;
      attempt = null;
      if (a.raf) window.cancelAnimationFrame(a.raf);
      a.off.forEach(function (fn) { try { fn(); } catch (e) { /* already gone */ } });
      if (a.view) a.view.destroy();
    }

    home();
  }

  FF.MissionTrail = FF.MissionTrail || {};
  FF.MissionTrail.Game = { checkTarget: checkTarget, checkChoices: checkChoices, visitSummary: visitSummary, createMover: createMover, availableStages: availableStages, skipFor: skipFor };

  FF.registerGame({
    id: 'missionTrail',
    name: 'Mission Trail',
    description: 'Read a mission letter once, then find your way around town from memory before the clock runs out.',
    category: 'memory',
    icon: '🗺️',
    players: [1, 1],
    difficulty: 'Normal',
    duration: 5,
    tags: ['memory', 'navigation', 'directions'],
    modes: ['solo'],
    defaultMode: 'solo',
    leaderboard: false,
    howToPlay: [
      'Read the mission letter carefully. You can read it only once.',
      'Walk the town with the arrows, following the directions from memory.',
      'When you are next to the right place, tap it or press Check.',
      'Some missions ask you to pick something up, hand it to someone or drive a car.',
      'A wrong place costs 3 seconds. Finish before the clock runs out to earn up to 3 stars.'
    ],
    start: start
  });
})();
