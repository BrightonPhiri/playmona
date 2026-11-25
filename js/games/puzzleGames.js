/* ============================================================
   PLAYMONA — puzzleGames.js
   Visual puzzle games: Spot the Difference and Hidden Object.
   (Picture Puzzle was replaced by Picture Rush, js/games/pictureRush.js.)
   Classic script (no ES modules) so the app runs from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* The shell may expose FF.registerGame directly, or (older builds)
     use FF.Games.register. Shim it defensively so this file works
     either way without clobbering an existing definition. */
  if (typeof FF.registerGame !== 'function') {
    FF.registerGame = function (def) {
      if (FF.Games && typeof FF.Games.register === 'function') {
        FF.Games.register(def);
      }
    };
  }

  /* ================= shared helpers ================= */

  function bonusFor(api) {
    var d = api.config.difficulty;
    if (d === 'easy') return 1;
    if (d === 'hard') return 2;
    return 1.5;
  }

  function scorers(api) {
    if (api.config.scorers && api.config.scorers.length) return api.config.scorers;
    if (api.config.players && api.config.players.length) return api.config.players;
    return [];
  }

  function finish(api) {
    if (api.shell && api.shell.hideTimer) api.shell.hideTimer();
    var res = api.scoring.results();
    var bestStreak = 0;
    var fastest = null;
    var list = scorers(api);
    for (var i = 0; i < list.length; i++) {
      var r = api.scoring.record(list[i].id);
      if (r) {
        if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
        if (r.fastest != null) fastest = (fastest == null) ? r.fastest : Math.min(fastest, r.fastest);
      }
    }
    var out = { results: res.results, winnerId: res.winnerId, bestStreak: bestStreak };
    if (fastest != null) out.fastest = fastest / 1000;
    api.end(out);
  }

  function cloneItem(it) {
    var c = {};
    for (var k in it) {
      if (Object.prototype.hasOwnProperty.call(it, k)) c[k] = it[k];
    }
    return c;
  }

  /* ================= procedural scene helpers ================= */

  var SCENE_EMOJIS = ['🍎', '⭐', '🍌', '🚗', '🌸', '🐟', '⚽', '🎈', '🍩', '🐞', '🎵', '🧸', '🌵', '🍄', '💎', '🦋', '🚀', '🌙', '🍉', '🎁', '🐠', '🐚', '🍇', '🎲', '🍦', '🦉'];

  var SCENE_COLORS = [
    { name: 'Red', hex: '#ef4444' },
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Green', hex: '#10b981' },
    { name: 'Yellow', hex: '#f59e0b' },
    { name: 'Purple', hex: '#8b5cf6' },
    { name: 'Pink', hex: '#ec4899' },
    { name: 'Orange', hex: '#f97316' },
    { name: 'Teal', hex: '#14b8a6' },
    { name: 'Brown', hex: '#a16207' },
    { name: 'Cyan', hex: '#06b6d4' }
  ];

  var SCENE_SHAPES = ['circle', 'square', 'triangle'];
  var SHAPE_WORDS = { circle: 'BALL', square: 'SQUARE', triangle: 'TRIANGLE' };

  function makeSceneItem() {
    if (FF._rand() < 0.55) {
      return { type: 'emoji', emoji: FF.util.pick(SCENE_EMOJIS) };
    }
    var c = FF.util.pick(SCENE_COLORS);
    return { type: 'shape', shape: FF.util.pick(SCENE_SHAPES), color: c };
  }

  function itemIdentity(it) {
    if (it.type === 'emoji') return 'e:' + it.emoji;
    return 's:' + it.color.name + ':' + it.shape;
  }

  function describeItem(it) {
    if (it.type === 'emoji') return it.emoji;
    return it.color.name.toUpperCase() + ' ' + SHAPE_WORDS[it.shape];
  }

  function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2, pad) {
    return !(x1 + w1 + pad <= x2 || x2 + w2 + pad <= x1 || y1 + h1 + pad <= y2 || y2 + h2 + pad <= y1);
  }

  function placeSceneItems(count, areaW, areaH, sizeRange, unique) {
    var items = [];
    var used = {};
    var margin = 8;
    var minSize = sizeRange[0];
    var maxSize = sizeRange[1];
    var i, j, a, t, x, y, size, item, cand, key, ok, p;
    for (i = 0; i < count; i++) {
      item = null;
      for (a = 0; a < 300; a++) {
        cand = makeSceneItem();
        key = itemIdentity(cand);
        if (unique && used[key]) continue;
        if (unique) used[key] = true;
        item = cand;
        break;
      }
      if (!item) item = makeSceneItem();
      size = FF.util.int(minSize, maxSize);
      x = FF.util.int(margin, Math.max(margin + 1, areaW - size - margin));
      y = FF.util.int(margin, Math.max(margin + 1, areaH - size - margin));
      ok = false;
      for (t = 0; t < 400; t++) {
        x = FF.util.int(margin, Math.max(margin + 1, areaW - size - margin));
        y = FF.util.int(margin, Math.max(margin + 1, areaH - size - margin));
        ok = true;
        for (j = 0; j < items.length; j++) {
          p = items[j];
          if (rectsOverlap(x, y, size, size, p.x, p.y, p.size, p.size, 5)) { ok = false; break; }
        }
        if (ok) break;
      }
      item.x = x;
      item.y = y;
      item.size = size;
      items.push(item);
    }
    return items;
  }

  function renderSceneItem(stage, item, onClick) {
    var style = {
      left: item.x + 'px',
      top: item.y + 'px',
      width: item.size + 'px',
      height: item.size + 'px'
    };
    if (item.type === 'emoji') {
      style.fontSize = Math.round(item.size * 0.72) + 'px';
      style.lineHeight = item.size + 'px';
    } else {
      style.backgroundColor = item.color.hex;
    }
    var el = FF.ui.el(onClick ? 'button' : 'div', {
      type: onClick ? 'button' : null,
      class: 'scene-item' + (item.type === 'emoji' ? ' scene-item--emoji' : ' scene-item--' + item.shape) + (onClick ? ' scene-item--tap' : ''),
      style: style,
      'aria-label': onClick ? describeItem(item) : null,
      onclick: onClick || null
    });
    if (item.type === 'emoji') el.textContent = item.emoji;
    stage.appendChild(el);
    return el;
  }

  function scaledStage(api, w, h, scale) {
    var outer = api.ui.div('scene-frame');
    outer.style.width = Math.round(w * scale) + 'px';
    outer.style.height = Math.round(h * scale) + 'px';
    var stage = api.ui.div('scene-stage');
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.transform = 'scale(' + scale + ')';
    outer.appendChild(stage);
    return { outer: outer, stage: stage };
  }

  function fitScaleFor(w) {
    var vw = window.innerWidth || 900;
    var avail = Math.max(260, vw - 48);
    var sideBySide = vw >= 720;
    var per = sideBySide ? (avail - 20) / 2 : avail;
    return { scale: Math.min(1, per / w), sideBySide: sideBySide };
  }

  function labeledStage(api, label, w, h, scale) {
    var col = api.ui.div('stage-col');
    var lab = api.ui.div('stage-label', label);
    col.appendChild(lab);
    var s = scaledStage(api, w, h, scale);
    col.appendChild(s.outer);
    return { col: col, stage: s.stage };
  }

  function ring(el) {
    if (!el) return;
    el.classList.add('scene-item--found');
  }

  function flashWrong(el) {
    if (!el) return;
    el.classList.add('scene-item--miss');
    setTimeout(function () { el.classList.remove('scene-item--miss'); }, 450);
  }

  function pickChanges(base, n) {
    var idxs = FF.util.sample(base.map(function (_, i) { return i; }), n);
    return idxs.map(function (i) {
      var item = base[i];
      var kinds = (item.type === 'emoji') ? ['emoji', 'remove'] : ['color', 'shape', 'remove'];
      return { index: i, kind: FF.util.pick(kinds) };
    });
  }

  function applyChange(item, kind) {
    if (kind === 'remove') return null;
    if (kind === 'emoji') {
      var others = SCENE_EMOJIS.filter(function (e) { return e !== item.emoji; });
      item.emoji = FF.util.pick(others.length ? others : SCENE_EMOJIS);
    } else if (kind === 'color') {
      var ocs = SCENE_COLORS.filter(function (c) { return c.name !== item.color.name; });
      item.color = FF.util.pick(ocs.length ? ocs : SCENE_COLORS);
    } else if (kind === 'shape') {
      item.shape = (item.shape === 'circle') ? 'square' : 'circle';
    }
    return item;
  }

  function buildBItems(base, changes) {
    var byIdx = {};
    changes.forEach(function (c) { byIdx[c.index] = c; });
    var out = [];
    for (var i = 0; i < base.length; i++) {
      var c = byIdx[i];
      if (c) {
        var ch = applyChange(cloneItem(base[i]), c.kind);
        if (ch) {
          ch.changed = true;
          ch.ghost = false;
          out.push(ch);
        } else {
          out.push({ ghost: true, changed: true, x: base[i].x, y: base[i].y, size: base[i].size });
        }
      } else {
        out.push(cloneItem(base[i]));
      }
    }
    return out;
  }

  function roundParams(round, difficulty) {
    var diff = 0;
    if (difficulty === 'easy') diff = -2;
    else if (difficulty === 'hard') diff = 2;
    var count = FF.util.clamp(22 + round * 2 + diff, 18, 36);
    var size = FF.util.clamp(30 - round * 2 - diff, 16, 30);
    return { count: count, size: size };
  }

  /* ================= room challenges (FF.Parallel) =================
     Everyone gets the same puzzle at the same moment and keeps their own
     score: these turn one finished (or unfinished) puzzle into points. */

  function spotPoints(st, ms, limitMs, bonus) {
    var pts = st.found * 100;
    if (st.found >= st.total) pts += FF.Parallel.speedBonus(ms, limitMs, 200);
    return Math.max(0, Math.round(bonus * pts) - (st.wrong || 0) * 20);
  }

  function hiddenPoints(st, ms, limitMs, bonus) {
    if (!st.found) return 0;
    return Math.max(0, Math.round(bonus * (50 + FF.Parallel.speedBonus(ms, limitMs, 100))) - (st.wrong || 0) * 10);
  }

  function wrongText(n) {
    if (!n) return '';
    return n === 1 ? FF.t('wrongTap1', '1 wrong tap') : FF.t('wrongTapsN', '{n} wrong taps', { n: n });
  }

  /* ============================================================
     1. SPOT THE DIFFERENCE
     ============================================================ */
  FF.registerGame({
    id: 'spotDifference',
    name: 'Spot the Difference',
    description: 'Spot every difference between two busy scenes.',
    category: 'visual',
    icon: '🔍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['visual', 'observation'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Compare the two pictures side by side.',
      'Tap the differences on the RIGHT picture.',
      'Correct tap = +100 points. Wrong tap = -20.',
      'Find them all to finish your turn.'
    ],
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { spotOnline(api); return; }
      var list = scorers(api);
      var index = 0;
      var rounds = (list.length > 1 && api.config.mode !== 'solo') ? list.length : 1;

      function playRound() {
        if (index >= rounds) { finish(api); return; }
        var scorer = list[index];
        var label = (list.length > 1) ? FF.t('turnOf', '{name}\u2019s turn', { name: scorer.name }) : FF.t('spotTheDifferences', 'Spot the differences');
        index++;
        renderSpotRound(api, scorer, label, playRound);
      }
      playRound();
    }
  });

  function spotCount(api) {
    if (api.config.difficulty === 'normal') return 5;
    if (api.config.difficulty === 'hard') return 7;
    return 3;
  }

  /* Online: every phone gets the same two scenes each round. */
  function spotOnline(api) {
    var bonus = bonusFor(api);
    var n = spotCount(api);
    FF.Parallel.run(api, {
      rounds: 3,
      seconds: 30 + n * 10,
      gate: '.scene-item--tap',
      play: function (r, ctx) {
        return renderSpotRound(api, ctx.me, FF.t('spotTheDifferences', 'Spot the differences'), null, {
          extra: ctx.live,
          roundText: ctx.roundText,
          done: function (st) { ctx.done(Object.assign({ value: spotPoints(st, ctx.elapsed(), ctx.limitMs, bonus) }, st)); },
          points: function (st) { return spotPoints(st, null, ctx.limitMs, bonus); }
        });
      },
      describe: function () { return { kind: 'card', text: FF.t('spotWatch', 'Everyone is hunting the same {n} differences', { n: n }) }; },
      detail: function (a) {
        var found = a.found >= a.total
          ? FF.t('spotDetailAll', 'All {n} in {time}', { n: a.total || 0, time: FF.Parallel.clock(a.ms) })
          : FF.t('foundOf', 'Found {f} of {n}', { f: a.found || 0, n: a.total || 0 });
        return [found, wrongText(a.wrong)].filter(Boolean).join(' \u00b7 ');
      }
    });
  }

  /* race (a room challenge only): { extra, roundText, done(stats), points(stats) };
     the scenes stay hidden until start(), and it returns { start, stop }. */
  function renderSpotRound(api, scorer, label, onDone, race) {
    var root = api.shell.root;
    api.ui.clear(root);
    api.shell.updateScores(scorer.id);
    api.shell.hideTimer();

    var n = spotCount(api);

    var base = placeSceneItems(16, 600, 380, [22, 34], false);
    var changes = pickChanges(base, n);

    var wrap = FF.GameUI.stage({ wide: true });

    if (race) {
      wrap.appendChild(race.extra);
      wrap.appendChild(FF.GameUI.turnBar(null, race.roundText));
    }
    wrap.appendChild(FF.GameUI.prompt(label, 'sm'));
    wrap.appendChild(FF.GameUI.sub(FF.t('spotRule', 'Tap the {n} differences in the second picture.', { n: n })));

    var status = FF.GameUI.pill(FF.t('foundOf', 'Found {f} of {n}', { f: 0, n: n }), 'magnifying-glass', 'turn');
    status.classList.add('puzzle-status');
    status.setAttribute('aria-live', 'polite');
    var statusRow = FF.ui.div('gm-turnbar');
    statusRow.appendChild(status);
    wrap.appendChild(statusRow);

    var panels = api.ui.div('spot-panels' + (race ? ' hidden' : ''));
    wrap.appendChild(panels);

    var fs = fitScaleFor(600);
    var pa = labeledStage(api, FF.t('original', 'Original'), 600, 380, fs.scale);
    var pb = labeledStage(api, FF.t('findDifferences', 'Find the differences'), 600, 380, fs.scale);
    panels.appendChild(pa.col);
    panels.appendChild(pb.col);

    var aEls = [];
    base.forEach(function (it, i) { aEls[i] = renderSceneItem(pa.stage, it, null); });

    var bItems = buildBItems(base, changes);
    var changeMap = {};
    changes.forEach(function (c) { changeMap[c.index] = true; });

    var found = {};
    var foundCount = 0;
    var wrongCount = 0;
    var done = false;
    var bEls = [];

    function stats() { return { found: foundCount, total: n, wrong: wrongCount }; }

    bItems.forEach(function (bit, i) {
      var el;
      if (bit.ghost) {
        el = api.ui.el('button', {
          type: 'button',
          class: 'scene-item scene-item--ghost scene-item--tap',
          'aria-label': FF.t('emptySpot', 'Empty spot'),
          style: {
            left: bit.x + 'px',
            top: bit.y + 'px',
            width: bit.size + 'px',
            height: bit.size + 'px'
          },
          onclick: function () { onB(i); }
        });
        pb.stage.appendChild(el);
      } else {
        el = renderSceneItem(pb.stage, bit, function () { onB(i); });
      }
      bEls[i] = el;
    });

    function onB(i) {
      if (done) return;
      if (changeMap[i] && !found[i]) {
        found[i] = true;
        foundCount++;
        if (!race) {
          var pts = Math.round(100 * bonusFor(api));
          api.scoring.add(scorer.id, pts);
          api.shell.updateScores(scorer.id);
        }
        api.audio.play('correct');
        ring(bEls[i]);
        if (aEls[i]) ring(aEls[i]);
        FF.ui.clear(status);
        status.appendChild(FF.Icons.icon('magnifying-glass'));
        status.appendChild(document.createTextNode(FF.t('foundOf', 'Found {f} of {n}', { f: foundCount, n: n })));
        if (foundCount >= n) {
          done = true;
          api.audio.play('roundEnd');
          api.shell.toast(FF.t('allFound', 'All {n} differences found!', { n: n }), 'good');
          if (race) setTimeout(function () { race.done(stats()); }, 1200);
          else setTimeout(onDone, 1400);
        }
      } else if (!changeMap[i]) {
        api.audio.play('wrong');
        wrongCount++;
        if (!race) {
          api.scoring.subtract(scorer.id, 20);
          api.shell.updateScores(scorer.id);
        }
        flashWrong(bEls[i]);
      }
    }

    root.appendChild(wrap);
    if (!race) return null;
    return {
      start: function () { panels.classList.remove('hidden'); },
      stop: function () {
        done = true;
        var st = stats();
        return Object.assign({ value: race.points(st) }, st);
      }
    };
  }

  /* ============================================================
     2. HIDDEN OBJECT
     ============================================================ */
  FF.registerGame({
    id: 'hiddenObject',
    name: 'Hidden Object',
    description: 'Find the hidden object in a busy scene.',
    category: 'visual',
    icon: '🕵️',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['visual', 'observation'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'A busy scene appears with one hidden target.',
      'Read the FIND THE... prompt and tap the target.',
      'Find it fast for the points.',
      'Careful — wrong taps cost points.'
    ],
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { hiddenOnline(api); return; }
      var list = scorers(api);
      var rounds = FF.GameLength.rounds(api, 6, 0);
      var round = 0;

      function playRound() {
        if (round >= rounds) { finish(api); return; }
        var scorer = list[round % list.length];
        round++;
        renderHiddenRound(api, scorer, round, rounds, playRound);
      }
      playRound();
    }
  });

  /* Online: every phone hunts the same object in the same scene. */
  function hiddenOnline(api) {
    var bonus = bonusFor(api);
    FF.Parallel.run(api, {
      rounds: 6,
      seconds: 20,
      gate: '.scene-item--tap',
      play: function (n, ctx) {
        return renderHiddenRound(api, ctx.me, n + 1, ctx.total, null, {
          extra: ctx.live,
          roundText: ctx.roundText,
          done: function (st) { ctx.done(Object.assign({ value: hiddenPoints(st, ctx.elapsed(), ctx.limitMs, bonus) }, st)); }
        });
      },
      describe: function () { return { kind: 'card', text: FF.t('hiddenWatch', 'Everyone is hunting the same hidden object') }; },
      detail: function (a) {
        var line = a.found ? FF.t('hiddenFoundIn', 'Found in {s} s', { s: ((a.ms || 0) / 1000).toFixed(1) }) : FF.t('hiddenMissed', 'Not found');
        return [line, wrongText(a.wrong)].filter(Boolean).join(' \u00b7 ');
      }
    });
  }

  /* race (a room challenge only): { extra, roundText, done(stats) }; the
     target and scene stay hidden until start(), and it returns { start, stop }. */
  function renderHiddenRound(api, scorer, roundNum, totalRounds, onDone, race) {
    var root = api.shell.root;
    api.ui.clear(root);
    api.shell.updateScores(scorer.id);
    api.shell.hideTimer();

    var p = roundParams(roundNum - 1, api.config.difficulty);
    var areaW = 640;
    var areaH = 420;
    var items = placeSceneItems(p.count, areaW, areaH, [p.size, p.size + 8], true);
    var target = items[FF.util.int(0, items.length - 1)];
    var targetIndex = -1;
    for (var ti = 0; ti < items.length; ti++) { if (items[ti] === target) targetIndex = ti; }

    var wrap = FF.GameUI.stage({ wide: true });

    if (race) wrap.appendChild(race.extra);
    wrap.appendChild(FF.GameUI.turnBar(scorers(api).length > 1 ? scorer : null, race ? race.roundText : FF.GameLength.roundText(roundNum, totalRounds)));

    var prompt = api.ui.el('h2', { class: 'find-prompt gm-prompt' + (race ? ' hidden' : '') });
    prompt.appendChild(document.createTextNode(FF.t('findThe', 'Find the') + ' '));
    prompt.appendChild(api.ui.span(target.type === 'emoji' ? 'find-prompt__emoji' : 'find-prompt__name', target.type === 'emoji' ? target.emoji : describeItem(target).toLowerCase()));
    wrap.appendChild(prompt);

    wrap.appendChild(FF.GameUI.note(FF.t('hiddenRule', 'Tap it as fast as you can. Wrong taps cost 10 points.')));

    var stageWrap = api.ui.div('scene-wrap' + (race ? ' hidden' : ''));
    var fs = fitScaleFor(areaW);
    var st = scaledStage(api, areaW, areaH, fs.scale);
    stageWrap.appendChild(st.outer);
    wrap.appendChild(stageWrap);

    root.appendChild(wrap);

    var done = false;
    var targetEl = null;
    var itemsEls = [];

    items.forEach(function (it, i) {
      var el = renderSceneItem(st.stage, it, function () { onPick(i); });
      itemsEls[i] = el;
      if (i === targetIndex) targetEl = el;
    });

    var wrongCount = 0;
    var t = api.config.timer;
    if (t && t > 0 && !race) {
      api.shell.setTimer(t, function () { onTimeout(); });
    }

    function onPick(i) {
      if (done) return;
      if (i === targetIndex && race) {
        done = true;
        api.audio.play('correct');
        ring(targetEl);
        api.shell.toast(FF.t('foundItShort', 'Found it!'), 'good');
        setTimeout(function () { race.done({ found: true, wrong: wrongCount }); }, 900);
      } else if (i === targetIndex) {
        done = true;
        api.shell.hideTimer();
        var pts = Math.round(100 * bonusFor(api));
        api.scoring.add(scorer.id, pts);
        api.shell.updateScores(scorer.id);
        api.audio.play('correct');
        ring(targetEl);
        api.shell.toast(FF.t('foundIt', 'Found it! +{n} points', { n: pts }), 'good');
        setTimeout(onDone, 900);
      } else {
        api.audio.play('wrong');
        wrongCount++;
        if (!race) {
          api.scoring.subtract(scorer.id, 10);
          api.shell.updateScores(scorer.id);
        }
        flashWrong(itemsEls[i]);
      }
    }

    if (race) {
      return {
        start: function () {
          prompt.classList.remove('hidden');
          stageWrap.classList.remove('hidden');
        },
        stop: function () {
          done = true;
          if (targetEl) ring(targetEl);
          return { value: 0, found: false, wrong: wrongCount };
        }
      };
    }

    function onTimeout() {
      if (done) return;
      done = true;
      if (targetEl) ring(targetEl);
      api.shell.toast(FF.t('timeUpWas', 'Time’s up! It was {x}.', { x: describeItem(target).toLowerCase() }), 'bad');
      setTimeout(onDone, 1100);
    }
  }

})();
