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

  /* The thing the Check button checks: what the walker faces, else the nearest in reach. */
  function checkTarget(map, pos, revealed) {
    var R = FF.MissionTrail.Rules;
    var near = map.things.filter(function (th) { return th.check && !revealed[th.key] && R.inReach(pos, th); });
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
    near.sort(function (a, b) { return dist(a) - dist(b); });
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
    var root = api.shell.root;
    if (api.shell.el && api.shell.el.classList) api.shell.el.classList.add('mt-shell');
    var player = (api.config.scorers && api.config.scorers[0]) || { id: 'me', name: t('you', 'You') };
    var visit = { completed: 0, stars: 0, ended: false };
    var attempt = null;   // the stage being played: { run, view, handle, raf, off }
    var token = 0;        // bumps on every screen change, so late image loads are dropped

    var ctx = {
      api: api,
      stages: data.stages,
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
      for (var i = 0; i < data.stages.length; i++) if (data.stages[i].id === id) return data.stages[i];
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
      var map = MT.Rules.buildMap(JSON.parse(JSON.stringify(def)));
      FF.ui.clear(root);
      if (FF.UI && FF.UI.loading) root.appendChild(FF.UI.loading(t('mtLoading', 'Getting the town ready…')));
      MT.Assets.load(MT.Assets.forMap(map)).then(function (images) {
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
          var key = checkTarget(map, run.pos, run.revealed);
          if (key) doCheck(key);
          else handle.say(t('mtWalkCloser', 'Walk closer to check it.'), 'info');
        },
        onTap: function (e) {
          var key = a.view && a.view.thingAtPoint(e.clientX, e.clientY);
          if (key) doCheck(key);
        }
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
      function sync() { handle.showCheck(run.state === 'playing' && !!checkTarget(map, run.pos, run.revealed)); }
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
          handle.say(t('mtNotThePlace', 'This isn’t the place from your letter. 5 seconds off!'), 'bad');
          handle.penalty();
          view.shake();
        } else if (r.type === 'revealed') {
          sound('correct');
          view.reveal(key, r.name);
          handle.say(t('mtFound', 'You found the {name}!', { name: String(r.name).toLowerCase() }), 'good');
        }
        sync();
      }

      a.off.push(run.on('stepDone', function (e) { handle.setSteps(e.index + 1); }));
      a.off.push(run.on('complete', function (res) { finish(stage, res, false); }));
      a.off.push(run.on('failed', function (res) { finish(stage, res, true); }));

      function frame() {
        a.raf = null;
        if (attempt !== a) return;
        if (!handle.canvas.isConnected) { stop(); return; }
        run.tick();
        handle.setClock(run.remaining());
        if (run.state === 'playing') a.raf = window.requestAnimationFrame(frame);
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
  FF.MissionTrail.Game = { checkTarget: checkTarget, visitSummary: visitSummary, createMover: createMover };

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
      'A wrong place costs 5 seconds. Finish before the clock runs out to earn up to 3 stars.'
    ],
    start: start
  });
})();
