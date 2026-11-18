/* ============================================================
   PLAYMONA — celebrate/pictureRush/board.js
   The Picture Rush tile board: the photo cut into a grid. Tap a
   tile then another to swap them, or drag one onto another.
   It only draws and reports what the player did; whoever made it
   (the phone game, or the organiser's preview) decides the rest.

     var b = FF.PictureRushBoard.create(host, {
       size: 4, url: '...',
       onPick(a), onDrop(), onSwap(a, b),
       canTake(pos) -> bool        // false: a teammate is holding it
     });
     b.update({ tiles, selected, held: { pos: { color, initial, name } }, locked, solved, peek });
     b.destroy();
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var DRAG_PX = 8;

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }

  function create(host, opts) {
    var size = opts.size;
    var total = size * size;
    var root = document.createElement('div');
    root.className = 'prb';
    root.style.setProperty('--prb-n', String(size));
    root.setAttribute('role', 'grid');
    root.setAttribute('aria-label', t('prBoard', 'Picture tiles'));
    var peek = document.createElement('div');
    peek.className = 'prb__peek';
    peek.style.backgroundImage = 'url("' + opts.url + '")';
    peek.setAttribute('aria-hidden', 'true');
    var cells = [];
    for (var pos = 0; pos < total; pos++) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'prb__tile';
      cell.dataset.pos = String(pos);
      var badge = document.createElement('span');
      badge.className = 'prb__who';
      badge.setAttribute('aria-hidden', 'true');
      cell.appendChild(badge);
      cells.push(cell);
      root.appendChild(cell);
    }
    root.appendChild(peek);
    host.appendChild(root);

    var view = { tiles: [], selected: -1, held: {}, locked: true, solved: false, peek: false };
    var ghost = null;
    var press = null;      // { pos, x, y, id, dragging }

    function paint(cell, piece) {
      var row = Math.floor(piece / size), col = piece % size;
      var step = size > 1 ? 100 / (size - 1) : 0;
      cell.style.backgroundImage = 'url("' + opts.url + '")';
      cell.style.backgroundSize = (size * 100) + '% ' + (size * 100) + '%';
      cell.style.backgroundPosition = (col * step) + '% ' + (row * step) + '%';
    }

    function update(next) {
      Object.keys(next).forEach(function (k) { view[k] = next[k]; });
      var tiles = view.tiles || [];
      cells.forEach(function (cell, p) {
        var piece = tiles[p];
        if (piece == null) return;
        if (cell.dataset.piece !== String(piece)) { paint(cell, piece); cell.dataset.piece = String(piece); }
        var home = piece === p;
        cell.classList.toggle('is-home', home);
        cell.classList.toggle('is-selected', view.selected === p);
        var h = view.held && view.held[p];
        cell.classList.toggle('is-held', !!h);
        cell.style.setProperty('--prb-held', h ? h.color : 'transparent');
        cell.firstChild.textContent = h ? h.initial : '';
        cell.disabled = !!view.locked;
        var row = Math.floor(p / size) + 1, col = (p % size) + 1;
        var label = t('prTileLabel', 'Row {row}, column {col}', { row: row, col: col });
        if (home) label += ', ' + t('prTileHome', 'in place');
        if (h) label += ', ' + t('prTileHeld', 'held by {name}', { name: h.name });
        if (view.selected === p) label += ', ' + t('prTileSelected', 'picked up');
        cell.setAttribute('aria-label', label);
      });
      root.classList.toggle('is-solved', !!view.solved);
      root.classList.toggle('is-locked', !!view.locked);
      root.classList.toggle('is-peek', !!view.peek);
    }

    function posAt(x, y) {
      var el = document.elementFromPoint(x, y);
      while (el && el !== root && !(el.dataset && el.dataset.pos != null)) el = el.parentNode;
      return el && el !== root && el.dataset ? Number(el.dataset.pos) : -1;
    }

    function shake(p) {
      var c = cells[p];
      c.classList.remove('is-refused');
      void c.offsetWidth;
      c.classList.add('is-refused');
    }

    /* A tap (or Enter): pick up, put back, or swap with the tile already picked up. */
    function tap(p) {
      if (view.locked) return;
      var sel = view.selected;
      if (sel === p) { opts.onDrop(); return; }
      if (opts.canTake && !opts.canTake(p)) { shake(p); return; }
      if (sel >= 0) { opts.onSwap(sel, p); return; }
      opts.onPick(p);
    }

    function endGhost() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      root.classList.remove('is-dragging');
    }

    function onDown(e) {
      if (view.locked || (e.button != null && e.button > 0)) return;
      var p = posAt(e.clientX, e.clientY);
      if (p < 0) return;
      press = { pos: p, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
      try { root.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
    }

    function onMove(e) {
      if (!press || e.pointerId !== press.id) return;
      if (!press.dragging) {
        if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) < DRAG_PX) return;
        if (opts.canTake && !opts.canTake(press.pos)) { shake(press.pos); press = null; return; }
        press.dragging = true;
        if (view.selected !== press.pos) opts.onPick(press.pos);
        var src = cells[press.pos];
        var r = src.getBoundingClientRect();
        ghost = src.cloneNode(true);
        ghost.className = 'prb__tile prb__ghost';
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        root.classList.add('is-dragging');
      }
      e.preventDefault();
      ghost.style.transform = 'translate(' + (e.clientX - ghost.offsetWidth / 2) + 'px,' + (e.clientY - ghost.offsetHeight / 2) + 'px)';
    }

    function onUp(e) {
      if (!press || e.pointerId !== press.id) return;
      var p = press;
      press = null;
      if (!p.dragging) { tap(p.pos); return; }
      endGhost();
      var target = posAt(e.clientX, e.clientY);
      if (target >= 0 && target !== p.pos && (!opts.canTake || opts.canTake(target))) opts.onSwap(p.pos, target);
      else opts.onDrop();
    }

    function onCancel() {
      if (press && press.dragging) opts.onDrop();
      press = null;
      endGhost();
    }

    function onKey(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var p = e.target && e.target.dataset ? Number(e.target.dataset.pos) : -1;
      if (p < 0 || isNaN(p)) return;
      e.preventDefault();
      tap(p);
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    root.addEventListener('keydown', onKey);
    // Pointer events do the work; stop the click a tap would also send.
    root.addEventListener('click', function (e) { e.preventDefault(); });

    return {
      el: root,
      update: update,
      destroy: function () {
        endGhost();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  FF.PictureRushBoard = { create: create };
})();
