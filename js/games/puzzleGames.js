/* ============================================================
   FAMILY FUN — puzzleGames.js
   Visual puzzle games: Picture Puzzle, Spot the Difference,
   Hidden Object, and Visual Riddle.
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

  function noData(api, what) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('panel panel--center');
    wrap.appendChild(api.ui.el('h2', {}, '😕 ' + what));
    wrap.appendChild(api.ui.el('p', {}, 'This game needs its picture data, which could not be found. Please make sure the visual data file is loaded, then try again.'));
    wrap.appendChild(api.ui.button('🏠 EXIT', {
      primary: true, class: 'btn-lg',
      onClick: function () { if (FF.GameFlow && FF.GameFlow.exitToHome) FF.GameFlow.exitToHome(); }
    }));
    root.appendChild(wrap);
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
    if (Math.random() < 0.55) {
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
      position: 'absolute',
      left: item.x + 'px',
      top: item.y + 'px',
      width: item.size + 'px',
      height: item.size + 'px',
      cursor: onClick ? 'pointer' : 'default'
    };
    if (item.type === 'emoji') {
      style.fontSize = Math.round(item.size * 0.72) + 'px';
      style.lineHeight = item.size + 'px';
      style.textAlign = 'center';
    } else {
      style.backgroundColor = item.color.hex;
      if (item.shape === 'circle') style.borderRadius = '50%';
      else if (item.shape === 'triangle') style.clipPath = 'polygon(50% 8%, 96% 92%, 4% 92%)';
      else style.borderRadius = '14%';
      style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.08)';
    }
    var el = api.ui.el('div', {
      class: 'scene-item',
      style: style,
      tabindex: onClick ? 0 : null,
      onclick: onClick || null
    });
    if (item.type === 'emoji') el.textContent = item.emoji;
    stage.appendChild(el);
    return el;
  }

  function scaledStage(api, w, h, scale) {
    var outer = api.ui.div('');
    outer.style.width = Math.round(w * scale) + 'px';
    outer.style.height = Math.round(h * scale) + 'px';
    outer.style.position = 'relative';
    outer.style.overflow = 'hidden';
    outer.style.background = '#eef2f6';
    outer.style.borderRadius = '12px';
    outer.style.border = '1px solid var(--border)';
    outer.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
    var stage = api.ui.div('');
    stage.style.position = 'absolute';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.transformOrigin = 'top left';
    stage.style.transform = 'scale(' + scale + ')';
    outer.appendChild(stage);
    return { outer: outer, stage: stage };
  }

  function fitScaleFor(w) {
    var vw = window.innerWidth || 900;
    var avail = Math.max(260, vw - 40);
    var sideBySide = vw >= 720;
    var per = sideBySide ? (avail - 20) / 2 : avail;
    return { scale: Math.min(1, per / w), sideBySide: sideBySide };
  }

  function labeledStage(api, label, w, h, scale) {
    var col = api.ui.div('stage-col');
    col.style.textAlign = 'center';
    col.style.display = 'inline-block';
    col.style.verticalAlign = 'top';
    var lab = api.ui.div('stage-label', label);
    lab.style.fontWeight = '800';
    lab.style.marginBottom = '6px';
    col.appendChild(lab);
    var s = scaledStage(api, w, h, scale);
    col.appendChild(s.outer);
    return { col: col, stage: s.stage };
  }

  function ring(el) {
    if (!el) return;
    el.style.boxShadow = '0 0 0 3px #10b981, 0 0 12px rgba(16,185,129,0.8)';
    el.style.zIndex = '5';
  }

  function flashWrong(el) {
    if (!el) return;
    var prev = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px #ef4444';
    setTimeout(function () { el.style.boxShadow = prev; }, 450);
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

  /* ================= puzzle helpers ================= */

  function puzzleNeighbors(cell, size) {
    var out = [];
    var r = Math.floor(cell / size);
    var c = cell % size;
    if (r > 0) out.push(cell - size);
    if (r < size - 1) out.push(cell + size);
    if (c > 0) out.push(cell - 1);
    if (c < size - 1) out.push(cell + 1);
    return out;
  }

  function puzzleAdjacent(a, b, size) {
    var ra = Math.floor(a / size), ca = a % size;
    var rb = Math.floor(b / size), cb = b % size;
    return (Math.abs(ra - rb) + Math.abs(ca - cb)) === 1;
  }

  /* ============================================================
     1. PICTURE PUZZLE
     ============================================================ */
  FF.registerGame({
    id: 'picturePuzzle',
    name: 'Picture Puzzle',
    description: 'Slide the tiles to unscramble a hidden picture.',
    category: 'visual',
    icon: '🧩',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual', 'puzzle'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Slide the tiles by tapping one next to the gap.',
      'Rearrange them to reveal the hidden picture.',
      'Fewer moves means more points.',
      'Finish the picture to score.'
    ],
    start: function (api) {
      var vis = (typeof FF.data !== 'undefined') ? FF.data.visual : null;
      var pool = [];
      function addAll(arr) { if (arr && arr.length) pool = pool.concat(arr); }
      if (vis) {
        addAll(vis.animals);
        addAll(vis.food);
        addAll(vis.landmarks);
        addAll(vis.objects);
      }
      if (typeof FF.data !== 'undefined' && FF.data.visual2) {
        addAll(FF.data.visual2.sports);
        addAll(FF.data.visual2.vehicles);
      }
      pool = pool.filter(function (it) { return it && it.svg && it.name; });
      if (!pool.length) { noData(api, 'No puzzle pictures'); return; }

      var size = 3;
      if (api.config.difficulty === 'normal') size = 4;
      else if (api.config.difficulty === 'hard') size = 5;

      var list = scorers(api);
      var index = 0;
      var rounds = (list.length > 1 && api.config.mode !== 'solo') ? list.length : 1;
      var bag = new api.random.Bag(pool);

      function playRound() {
        if (index >= rounds) { finish(api); return; }
        var scorer = list[index];
        var label = (list.length > 1) ? (scorer.avatar || '😀') + ' ' + scorer.name + "'s turn" : 'Slide the tiles to reveal the picture';
        index++;
        renderPuzzle(api, scorer, bag.next(), size, label, playRound);
      }
      playRound();
    }
  });

  function renderPuzzle(api, scorer, item, size, label, onDone) {
    var root = api.shell.root;
    api.ui.clear(root);
    api.shell.updateScores(scorer.id);
    api.shell.hideTimer();

    var wrap = api.ui.div('');
    wrap.style.textAlign = 'center';

    wrap.appendChild(api.ui.el('h2', {}, label));
    wrap.appendChild(api.ui.el('p', { class: 'hint' }, '🖼️ ' + item.name));

    var status = api.ui.div('puzzle-status');
    status.style.margin = '8px 0';
    status.style.fontWeight = '700';
    var movesEl = api.ui.span('puzzle-moves', 'Moves: 0');
    status.appendChild(movesEl);
    wrap.appendChild(status);

    var stage = api.ui.div('puzzle-stage');
    stage.style.margin = '12px auto';
    stage.style.textAlign = 'center';
    wrap.appendChild(stage);

    stage.appendChild(api.ui.div('hint', 'Preparing your game...'));

    var controls = api.ui.div('puzzle-controls');
    controls.style.marginTop = '12px';
    controls.appendChild(api.ui.button('🔀 Reshuffle', { class: 'btn', onClick: function () { buildBoard(); } }));
    controls.appendChild(api.ui.button('🏠 End Game', { class: 'btn', onClick: function () { FF.GameFlow.confirmExit(); } }));
    wrap.appendChild(controls);

    root.appendChild(wrap);

    var board = null;
    var blankCell = 0;
    var moves = 0;
    var solved = false;
    var tileEls = [];
    var boardSize = 0;
    var tileSize = 0;
    var total = 0;
    var built = false;

    function isSolved() {
      for (var cell = 0; cell < total; cell++) {
        if (cell === total - 1) { if (board[cell] !== null) return false; }
        else if (board[cell] !== cell) return false;
      }
      return true;
    }

    function updateStatus() {
      if (movesEl) movesEl.textContent = 'Moves: ' + moves;
    }

    function reposition() {
      for (var cell = 0; cell < total; cell++) {
        var tid = board[cell];
        if (tid == null) continue;
        var t = tileEls[tid];
        if (!t) continue;
        t.style.left = (cell % size) * tileSize + 'px';
        t.style.top = (Math.floor(cell / size)) * tileSize + 'px';
      }
    }

    function onTap(cell) {
      if (solved || !built) return;
      if (puzzleAdjacent(cell, blankCell, size)) {
        board[blankCell] = board[cell];
        board[cell] = null;
        blankCell = cell;
        moves++;
        reposition();
        api.audio.play('tap');
        updateStatus();
        if (isSolved()) {
          solved = true;
          api.audio.play('winner');
          var raw = Math.max(50, 300 - moves * 5);
          var pts = Math.round(raw * bonusFor(api));
          api.scoring.add(scorer.id, pts);
          api.shell.updateScores(scorer.id);
          api.shell.toast('Solved in ' + moves + ' moves! +' + pts + ' pts');
          var cont = stage.querySelector('.puzzle-board');
          if (cont) cont.style.boxShadow = '0 8px 24px rgba(16,185,129,0.5)';
          setTimeout(onDone, 1500);
        }
      } else {
        api.audio.play('wrong');
      }
    }

    function makeTile(tid, cell, uri, cont) {
      var col = tid % size;
      var row = Math.floor(tid / size);
      var t = api.ui.el('div', {
        class: 'puzzle-tile',
        style: {
          position: 'absolute',
          width: tileSize + 'px',
          height: tileSize + 'px',
          left: (cell % size) * tileSize + 'px',
          top: (Math.floor(cell / size)) * tileSize + 'px',
          backgroundImage: 'url("' + uri + '")',
          backgroundSize: boardSize + 'px ' + boardSize + 'px',
          backgroundPosition: (-col * tileSize) + 'px ' + (-row * tileSize) + 'px',
          backgroundRepeat: 'no-repeat',
          cursor: 'pointer',
          transition: 'left .15s ease, top .15s ease',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)'
        },
        tabindex: 0,
        onclick: function () { onTap(cell); }
      });
      cont.appendChild(t);
      return t;
    }

    function buildBoard() {
      FF.ui.clear(stage);
      total = size * size;
      boardSize = Math.min(340, Math.max(220, (window.innerWidth || 360) - 64));
      boardSize = Math.floor(boardSize / size) * size;
      tileSize = boardSize / size;

      board = [];
      var i;
      for (i = 0; i < total - 1; i++) board[i] = i;
      board[total - 1] = null;
      blankCell = total - 1;
      moves = 0;
      solved = false;
      tileEls = [];

      var shuffles = total * 30;
      for (i = 0; i < shuffles; i++) {
        var nb = puzzleNeighbors(blankCell, size);
        var cell = nb[FF.util.int(0, nb.length - 1)];
        board[blankCell] = board[cell];
        board[cell] = null;
        blankCell = cell;
      }
      if (isSolved()) {
        var nb2 = puzzleNeighbors(blankCell, size);
        var c2 = nb2[FF.util.int(0, nb2.length - 1)];
        board[blankCell] = board[c2];
        board[c2] = null;
        blankCell = c2;
      }

      var uri = api.assets.svgUri(item.svg);
      var cont = api.ui.div('puzzle-board');
      cont.style.position = 'relative';
      cont.style.width = boardSize + 'px';
      cont.style.height = boardSize + 'px';
      cont.style.margin = '0 auto';
      cont.style.background = '#eef2f6';
      cont.style.borderRadius = '12px';
      cont.style.overflow = 'hidden';
      cont.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';

      var cell2;
      for (cell2 = 0; cell2 < total; cell2++) {
        var tid = board[cell2];
        if (tid == null) continue;
        tileEls[tid] = makeTile(tid, cell2, uri, cont);
      }
      stage.appendChild(cont);
      built = true;
      updateStatus();
    }

    setTimeout(function () { if (!built) buildBoard(); }, 250);
  }

  /* ============================================================
     2. SPOT THE DIFFERENCE
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
      var list = scorers(api);
      var index = 0;
      var rounds = (list.length > 1 && api.config.mode !== 'solo') ? list.length : 1;

      function playRound() {
        if (index >= rounds) { finish(api); return; }
        var scorer = list[index];
        var label = (list.length > 1) ? (scorer.avatar || '😀') + ' ' + scorer.name + "'s turn" : 'Spot the differences';
        index++;
        renderSpotRound(api, scorer, label, playRound);
      }
      playRound();
    }
  });

  function renderSpotRound(api, scorer, label, onDone) {
    var root = api.shell.root;
    api.ui.clear(root);
    api.shell.updateScores(scorer.id);
    api.shell.hideTimer();

    var n = 3;
    if (api.config.difficulty === 'normal') n = 5;
    else if (api.config.difficulty === 'hard') n = 7;

    var base = placeSceneItems(16, 600, 380, [22, 34], false);
    var changes = pickChanges(base, n);

    var wrap = api.ui.div('');
    wrap.style.textAlign = 'center';

    wrap.appendChild(api.ui.el('h2', {}, label));
    wrap.appendChild(api.ui.el('p', { class: 'hint' }, 'Tap the ' + n + ' differences on the RIGHT picture.'));

    var status = api.ui.div('puzzle-status');
    status.style.margin = '8px 0';
    status.style.fontWeight = '700';
    status.textContent = 'Found 0 of ' + n;
    wrap.appendChild(status);

    var panels = api.ui.div('spot-panels');
    panels.style.display = 'flex';
    panels.style.flexWrap = 'wrap';
    panels.style.gap = '16px';
    panels.style.justifyContent = 'center';
    panels.style.alignItems = 'flex-start';
    panels.style.margin = '12px 0';
    wrap.appendChild(panels);

    var fs = fitScaleFor(600);
    var pa = labeledStage(api, 'ORIGINAL', 600, 380, fs.scale);
    var pb = labeledStage(api, 'FIND THE DIFFERENCES', 600, 380, fs.scale);
    panels.appendChild(pa.col);
    panels.appendChild(pb.col);

    var aEls = [];
    base.forEach(function (it, i) { aEls[i] = renderSceneItem(pa.stage, it, null); });

    var bItems = buildBItems(base, changes);
    var changeMap = {};
    changes.forEach(function (c) { changeMap[c.index] = true; });

    var found = {};
    var foundCount = 0;
    var done = false;
    var bEls = [];

    bItems.forEach(function (bit, i) {
      var el;
      if (bit.ghost) {
        el = api.ui.el('div', {
          class: 'scene-item scene-item--ghost',
          style: {
            position: 'absolute',
            left: bit.x + 'px',
            top: bit.y + 'px',
            width: bit.size + 'px',
            height: bit.size + 'px',
            border: '2px dashed rgba(120,130,150,0.6)',
            borderRadius: '8px',
            boxSizing: 'border-box',
            cursor: 'pointer'
          },
          tabindex: 0,
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
        var pts = Math.round(100 * bonusFor(api));
        api.scoring.add(scorer.id, pts);
        api.shell.updateScores(scorer.id);
        api.audio.play('correct');
        ring(bEls[i]);
        if (aEls[i]) ring(aEls[i]);
        status.textContent = 'Found ' + foundCount + ' of ' + n;
        if (foundCount >= n) {
          done = true;
          api.audio.play('roundEnd');
          api.shell.toast('All ' + n + ' differences found!');
          setTimeout(onDone, 1400);
        }
      } else if (!changeMap[i]) {
        api.audio.play('wrong');
        api.scoring.subtract(scorer.id, 20);
        api.shell.updateScores(scorer.id);
        flashWrong(bEls[i]);
      }
    }

    root.appendChild(wrap);
  }

  /* ============================================================
     3. HIDDEN OBJECT
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
      var list = scorers(api);
      var rounds = 6;
      if (api.config.length === 'quick') rounds = 4;
      else if (api.config.length === 'long') rounds = 8;
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

  function renderHiddenRound(api, scorer, roundNum, totalRounds, onDone) {
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

    var wrap = api.ui.div('');
    wrap.style.textAlign = 'center';

    var heading = 'Round ' + roundNum + ' of ' + totalRounds;
    if (scorers(api).length > 1) heading = heading + ' — ' + scorer.name;
    wrap.appendChild(api.ui.el('h2', {}, heading));

    var prompt = api.ui.el('div', { class: 'find-prompt' });
    prompt.style.fontSize = '1.6rem';
    prompt.style.fontWeight = '800';
    prompt.style.margin = '8px 0';
    prompt.style.letterSpacing = '1px';
    prompt.textContent = 'FIND THE ' + describeItem(target);
    wrap.appendChild(prompt);

    wrap.appendChild(api.ui.div('hint', 'Tap the hidden item. Wrong taps cost 10 points.'));

    var stageWrap = api.ui.div('');
    stageWrap.style.display = 'inline-block';
    stageWrap.style.margin = '10px 0';
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

    var t = api.config.timer;
    if (t && t > 0) {
      api.shell.setTimer(t, function () { onTimeout(); });
    }

    function onPick(i) {
      if (done) return;
      if (i === targetIndex) {
        done = true;
        api.shell.hideTimer();
        var pts = Math.round(100 * bonusFor(api));
        api.scoring.add(scorer.id, pts);
        api.shell.updateScores(scorer.id);
        api.audio.play('correct');
        ring(targetEl);
        api.shell.toast('Found it! +' + pts + ' pts');
        setTimeout(onDone, 900);
      } else {
        api.audio.play('wrong');
        api.scoring.subtract(scorer.id, 10);
        api.shell.updateScores(scorer.id);
        flashWrong(itemsEls[i]);
      }
    }

    function onTimeout() {
      if (done) return;
      done = true;
      if (targetEl) ring(targetEl);
      api.shell.toast("Time's up! It was " + describeItem(target));
      setTimeout(onDone, 1100);
    }
  }

  /* ============================================================
     4. VISUAL RIDDLE
     ============================================================ */
  FF.registerGame({
    id: 'visualRiddle',
    name: 'Visual Riddle',
    description: 'Picture-based brain teasers. Choose the right answer.',
    category: 'visual',
    icon: '🧠',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['visual', 'quiz'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the picture and read the question.',
      'Choose the correct answer from four options.',
      'Answer fast for a speed bonus.',
      'Most points after all rounds wins.'
    ],
    start: function (api) {
      var vis = (typeof FF.data !== 'undefined') ? FF.data.visual : null;
      var riddles = null;
      if (vis && vis.visualRiddles && vis.visualRiddles.length) riddles = vis.visualRiddles;
      else if (typeof FF.data !== 'undefined' && FF.data.visual2 && FF.data.visual2.visualRiddles && FF.data.visual2.visualRiddles.length) riddles = FF.data.visual2.visualRiddles;

      if (riddles) {
        riddles = riddles.filter(function (r) {
          return r && r.question && r.options && r.options.length >= 2 && r.answer != null;
        });
      }
      if (!riddles || !riddles.length) { noData(api, 'No visual riddles'); return; }

      var list = scorers(api);
      var rounds = 8;
      if (api.config.length === 'quick') rounds = 5;
      else if (api.config.length === 'long') rounds = 10;
      var round = 0;
      var bag = new api.random.Bag(riddles);

      // ---- Race support. Offline this stays null and nothing changes. ----
      var race = FF.Race ? FF.Race.forGame(api, {
        rounds: rounds,
        optionSelector: '.riddle-opt'
      }) : null;

      function playRound() {
        if (round >= rounds) {
          if (race) race.end();
          finish(api);
          return;
        }
        var scorer = list[round % list.length];
        if (race) {
          // In a room nobody takes turns - everyone races the same riddle.
          race.beginRound(round);
          var me = FF.Room.current();
          scorer = list.filter(function (sc) { return sc.id === me.uid; })[0] || list[0];
        }
        round++;
        var label = race
          ? ('Round ' + round + ' of ' + rounds + ' — 🏁 everyone races')
          : ('Round ' + round + ' of ' + rounds + (list.length > 1 ? ' — ' + scorer.name : ''));
        renderRiddleRound(api, scorer, bag.next(), label, playRound, race, round >= rounds);
      }
      playRound();
    }
  });

  function renderRiddleRound(api, scorer, item, label, onDone, race, isLast) {
    var root = api.shell.root;
    api.ui.clear(root);
    api.shell.updateScores(scorer.id);
    api.shell.hideTimer();

    var ansIdx = (typeof item.answer === 'number') ? item.answer : item.options.indexOf(item.answer);
    if (ansIdx < 0 || ansIdx >= item.options.length) ansIdx = 0;

    var startMs = Date.now();
    var done = false;

    var wrap = api.ui.div('panel panel--center riddle-panel');
    wrap.style.maxWidth = '640px';
    wrap.style.margin = '0 auto';

    wrap.appendChild(api.ui.el('p', { class: 'hint' }, label));

    if (item.svg) {
      var img = api.assets.illustration(item.svg, 'riddle-img', item.question);
      img.style.margin = '6px auto';
      wrap.appendChild(img);
    }

    wrap.appendChild(api.ui.el('h2', {}, item.question));

    var opts = api.ui.div('riddle-opts');
    opts.style.display = 'grid';
    opts.style.gridTemplateColumns = '1fr 1fr';
    opts.style.gap = '10px';
    opts.style.marginTop = '8px';

    var optionBtns = [];
    item.options.forEach(function (text, i) {
      var b = api.ui.button(text, {
        class: 'btn riddle-opt',
        onClick: function () { onAnswer(i); }
      });
      b.style.padding = '12px';
      b.style.fontSize = '1rem';
      b.style.textAlign = 'center';
      b.style.whiteSpace = 'normal';
      optionBtns.push(b);
      opts.appendChild(b);
    });
    wrap.appendChild(opts);

    root.appendChild(wrap);

    var t = api.config.timer;

    function openRound() {
      startMs = Date.now();
      if (t && t > 0) {
        api.shell.setTimer(t, function () { onTimeout(); });
      }
    }

    if (race) {
      // Hold every device until the round's shared instant, then settle
      // the round for everyone at once.
      api.shell.hideTimer();
      race.gate(openRound);
      race.onSettle(function (payload) {
        if (done) return;
        done = true;
        api.shell.hideTimer();
        race.showResult(payload, {
          answerText: item.options[ansIdx],
          isLast: !!isLast,
          onNext: function () { onDone(); }
        });
      });
    } else {
      openRound();
    }

    function elapsedSec() { return (Date.now() - startMs) / 1000; }

    function onAnswer(i) {
      if (done) return;
      var correct = (i === ansIdx);

      if (race) {
        // The race decides the round; a wrong answer only locks this
        // device out while everyone else keeps playing.
        race.submit(i, correct, Date.now() - startMs);
        return;
      }

      done = true;
      api.shell.hideTimer();
      var pts = 0;
      if (correct) {
        var elapsed = elapsedSec();
        var speed = Math.max(0, Math.round(50 * Math.max(0, 1 - elapsed / 8)));
        pts = Math.round(100 * bonusFor(api)) + speed;
        api.scoring.add(scorer.id, pts);
        api.scoring.markAnswer(scorer.id, true, Math.round(elapsed * 1000));
        api.audio.play('correct');
        api.shell.toast('Correct! +' + pts + ' pts');
      } else {
        api.scoring.markAnswer(scorer.id, false, null);
        api.audio.play('wrong');
      }
      optionBtns.forEach(function (b, bi) {
        b.disabled = true;
        if (bi === ansIdx) {
          b.classList.add('btn-primary');
          b.style.boxShadow = '0 0 0 3px #10b981';
        } else if (bi === i && !correct) {
          b.style.boxShadow = '0 0 0 3px #ef4444';
        }
      });
      api.shell.updateScores(scorer.id);
      if (!correct) api.shell.toast('Answer: ' + item.options[ansIdx]);
      setTimeout(onDone, correct ? 1400 : 1800);
    }

    function onTimeout() {
      if (done) return;
      done = true;
      api.scoring.markAnswer(scorer.id, false, null);
      optionBtns.forEach(function (b, bi) {
        b.disabled = true;
        if (bi === ansIdx) {
          b.classList.add('btn-primary');
          b.style.boxShadow = '0 0 0 3px #10b981';
        }
      });
      api.shell.updateScores(scorer.id);
      api.shell.toast("Time's up! Answer: " + item.options[ansIdx]);
      setTimeout(onDone, 1600);
    }
  }
})();
