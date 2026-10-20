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
    FF.GameUI.exitCard(api, what, FF.t('needsPictures', 'This game needs its picture data, which could not be found. Make sure the visual data file is loaded, then try again.'));
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
        var label = (list.length > 1) ? FF.t('turnOf', '{name}’s turn', { name: scorer.name }) : FF.t('slideTiles', 'Slide the tiles to reveal the picture');
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

    var wrap = FF.GameUI.stage();

    wrap.appendChild(FF.GameUI.prompt(label, 'sm'));
    var meta = FF.ui.div('gm-turnbar');
    meta.appendChild(FF.GameUI.pill(item.name, 'image'));
    var movesEl = FF.GameUI.pill(FF.t('movesN', 'Moves: {n}', { n: 0 }), 'shuffle');
    movesEl.classList.add('puzzle-moves');
    meta.appendChild(movesEl);
    wrap.appendChild(meta);

    var stage = api.ui.div('puzzle-stage');
    wrap.appendChild(stage);

    stage.appendChild(FF.GameUI.note(FF.t('preparing', 'Getting the puzzle ready…')));

    var controls = api.ui.div('gm-row puzzle-controls');
    controls.appendChild(FF.UI.button(FF.t('reshuffle', 'Shuffle again'), { icon: 'shuffle', onClick: function () { buildBoard(); } }));
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
      if (movesEl) {
        FF.ui.clear(movesEl);
        movesEl.appendChild(FF.Icons.icon('shuffle'));
        movesEl.appendChild(document.createTextNode(FF.t('movesN', 'Moves: {n}', { n: moves })));
      }
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
          api.shell.toast(FF.t('solvedIn', 'Solved in {m} moves! +{n} points', { m: moves, n: pts }), 'good');
          var cont = stage.querySelector('.puzzle-board');
          if (cont) cont.classList.add('puzzle-board--solved');
          setTimeout(onDone, 1500);
        }
      } else {
        api.audio.play('wrong');
      }
    }

    function makeTile(tid, cell, uri, cont) {
      var col = tid % size;
      var row = Math.floor(tid / size);
      var t = api.ui.el('button', {
        type: 'button',
        class: 'puzzle-tile',
        'aria-label': FF.t('tileN', 'Tile {n}', { n: tid + 1 }),
        style: {
          width: tileSize + 'px',
          height: tileSize + 'px',
          left: (cell % size) * tileSize + 'px',
          top: (Math.floor(cell / size)) * tileSize + 'px',
          backgroundImage: 'url("' + uri + '")',
          backgroundSize: boardSize + 'px ' + boardSize + 'px',
          backgroundPosition: (-col * tileSize) + 'px ' + (-row * tileSize) + 'px'
        },
        // Tiles move, so look up where this tile is now (not where it started).
        onclick: function () { onTap(board.indexOf(tid)); }
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
      cont.style.width = boardSize + 'px';
      cont.style.height = boardSize + 'px';

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

    var wrap = FF.GameUI.stage({ wide: true });

    wrap.appendChild(FF.GameUI.prompt(label, 'sm'));
    wrap.appendChild(FF.GameUI.sub(FF.t('spotRule', 'Tap the {n} differences in the second picture.', { n: n })));

    var status = FF.GameUI.pill(FF.t('foundOf', 'Found {f} of {n}', { f: 0, n: n }), 'magnifying-glass', 'turn');
    status.classList.add('puzzle-status');
    status.setAttribute('aria-live', 'polite');
    var statusRow = FF.ui.div('gm-turnbar');
    statusRow.appendChild(status);
    wrap.appendChild(statusRow);

    var panels = api.ui.div('spot-panels');
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
    var done = false;
    var bEls = [];

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
        var pts = Math.round(100 * bonusFor(api));
        api.scoring.add(scorer.id, pts);
        api.shell.updateScores(scorer.id);
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

    var wrap = FF.GameUI.stage({ wide: true });

    wrap.appendChild(FF.GameUI.turnBar(scorers(api).length > 1 ? scorer : null, FF.t('roundOf', 'Round {n} of {total}', { n: roundNum, total: totalRounds })));

    var prompt = api.ui.el('h2', { class: 'find-prompt gm-prompt' });
    prompt.appendChild(document.createTextNode(FF.t('findThe', 'Find the') + ' '));
    prompt.appendChild(api.ui.span(target.type === 'emoji' ? 'find-prompt__emoji' : 'find-prompt__name', target.type === 'emoji' ? target.emoji : describeItem(target).toLowerCase()));
    wrap.appendChild(prompt);

    wrap.appendChild(FF.GameUI.note(FF.t('hiddenRule', 'Tap it as fast as you can. Wrong taps cost 10 points.')));

    var stageWrap = api.ui.div('scene-wrap');
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
        api.shell.toast(FF.t('foundIt', 'Found it! +{n} points', { n: pts }), 'good');
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
      api.shell.toast(FF.t('timeUpWas', 'Time’s up! It was {x}.', { x: describeItem(target).toLowerCase() }), 'bad');
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
        var label = FF.t('roundOf', 'Round {n} of {total}', { n: round, total: rounds });
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

    var wrap = FF.GameUI.stage({ className: 'riddle-panel' });

    wrap.appendChild(FF.GameUI.turnBar(race ? null : (scorers(api).length > 1 ? scorer : null), label));
    if (race) wrap.firstChild.insertBefore(FF.GameUI.pill(FF.t('everyoneRaces', 'Everyone races'), 'lightning', 'turn'), wrap.firstChild.firstChild);

    if (item.svg) {
      wrap.appendChild(FF.GameUI.media(api.assets.illustration(item.svg, 'riddle-img', item.question)));
    }

    wrap.appendChild(FF.GameUI.prompt(item.question));

    var opts = FF.GameUI.options({ columns: 'auto', className: 'riddle-opts' });

    var optionBtns = [];
    item.options.forEach(function (text, i) {
      var b = FF.GameUI.option(text, function () { onAnswer(i); }, i, { className: 'riddle-opt' });
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
        api.shell.toast(FF.GameUI.correctText(pts), 'good');
      } else {
        api.scoring.markAnswer(scorer.id, false, null);
        api.audio.play('wrong');
      }
      optionBtns.forEach(function (b, bi) {
        b.disabled = true;
        if (bi === ansIdx) FF.GameUI.markOption(b, 'correct');
        else if (bi === i && !correct) FF.GameUI.markOption(b, 'wrong');
        else FF.GameUI.markOption(b, 'dim');
      });
      api.shell.updateScores(scorer.id);
      if (!correct) wrap.appendChild(FF.GameUI.feedback('bad', FF.t('answerWas', 'The answer was {answer}.', { answer: item.options[ansIdx] })));
      else wrap.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts)));
      setTimeout(onDone, correct ? 1400 : 1800);
    }

    function onTimeout() {
      if (done) return;
      done = true;
      api.scoring.markAnswer(scorer.id, false, null);
      optionBtns.forEach(function (b, bi) {
        b.disabled = true;
        FF.GameUI.markOption(b, bi === ansIdx ? 'correct' : 'dim');
      });
      api.shell.updateScores(scorer.id);
      wrap.appendChild(FF.GameUI.feedback('bad', FF.t('timeUpAnswer', 'Time’s up! The answer is {answer}.', { answer: item.options[ansIdx] })));
      setTimeout(onDone, 1600);
    }
  }
})();
