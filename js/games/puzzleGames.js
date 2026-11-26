/* ============================================================
   PLAYMONA — puzzleGames.js
   Visual puzzle games: Hidden Object.
   (Picture Puzzle was replaced by Picture Rush, js/games/pictureRush.js;
   Spot the Difference moved to js/games/spotDifference.js.)
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

  function ring(el) {
    if (!el) return;
    el.classList.add('scene-item--found');
  }

  function flashWrong(el) {
    if (!el) return;
    el.classList.add('scene-item--miss');
    setTimeout(function () { el.classList.remove('scene-item--miss'); }, 450);
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

  function hiddenPoints(st, ms, limitMs, bonus) {
    if (!st.found) return 0;
    return Math.max(0, Math.round(bonus * (50 + FF.Parallel.speedBonus(ms, limitMs, 100))) - (st.wrong || 0) * 10);
  }

  function wrongText(n) {
    if (!n) return '';
    return n === 1 ? FF.t('wrongTap1', '1 wrong tap') : FF.t('wrongTapsN', '{n} wrong taps', { n: n });
  }

  /* ============================================================
     HIDDEN OBJECT
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
