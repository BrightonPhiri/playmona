/* ============================================================
   PLAYMONA — sketchback/pad.js
   SketchBack's paper: one pen, smooth strokes, Undo and Clear,
   and a lock the moment a sketch's time runs out.

     var pad = FF.SketchPad.create(canvas, { onChange });
     pad.strokes()   a copy, [[x, y, x, y...], ...] in 0-1000 units
     pad.undo(); pad.clear(); pad.lock(); pad.locked(); pad.isEmpty()
     pad.resize();   after the box changes size
     pad.destroy();

     FF.SketchPad.paint(canvas, strokes)   draws a saved drawing at any size

   Points are kept in units of the paper (0-1000 on both axes of a
   square), so a drawing redraws the same in a thumbnail, the
   answer dialog and the results. New points are drawn as they
   arrive (only the newest segment); the whole drawing is redrawn
   only on Undo, Clear and resize. Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var UNITS = 1000;
  var WIDTH = 7;           // pen width in paper units

  function clamp(v) { return Math.max(0, Math.min(UNITS, Math.round(v))); }

  /* ---------- the stroke model (no DOM) ---------- */

  function model() {
    var strokes = [];
    var cur = null;
    var isLocked = false;
    return {
      start: function (x, y) {
        if (isLocked) return false;
        cur = [clamp(x), clamp(y)];
        strokes.push(cur);
        return true;
      },
      move: function (x, y) {
        if (isLocked || !cur) return false;
        x = clamp(x); y = clamp(y);
        if (x === cur[cur.length - 2] && y === cur[cur.length - 1]) return false;
        cur.push(x, y);
        return true;
      },
      end: function () { cur = null; },
      undo: function () { if (isLocked) return false; cur = null; return strokes.pop() != null; },
      clear: function () { if (isLocked) return false; cur = null; var had = strokes.length > 0; strokes = []; return had; },
      lock: function () { isLocked = true; cur = null; },
      locked: function () { return isLocked; },
      current: function () { return cur; },
      raw: function () { return strokes; },
      strokes: function () { return strokes.map(function (s) { return s.slice(); }); }
    };
  }

  /* ---------- drawing ---------- */

  function inkColour(el) {
    try {
      var v = getComputedStyle(el).getPropertyValue('--skb-ink');
      if (v && v.trim()) return v.trim();
    } catch (e) { /* no styles */ }
    return '#1b2140';
  }

  /* Size the canvas to its box at the screen's pixel ratio; returns the scale (pixels per unit). */
  function fit(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return { sx: w / UNITS, sy: h / UNITS, s: Math.min(w, h) / UNITS };
  }

  function pen(ctx, scale, colour) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = WIDTH * scale.s;
  }

  /* One stroke with quadratic curves through the midpoints, so it looks drawn, not jagged. */
  function stroke(ctx, s, scale) {
    var n = s.length / 2;
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(s[0] * scale.sx, s[1] * scale.sy, WIDTH * scale.s / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s[0] * scale.sx, s[1] * scale.sy);
    for (var i = 1; i < n - 1; i++) {
      var x = s[i * 2], y = s[i * 2 + 1];
      var mx = (x + s[i * 2 + 2]) / 2, my = (y + s[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(x * scale.sx, y * scale.sy, mx * scale.sx, my * scale.sy);
    }
    ctx.lineTo(s[(n - 1) * 2] * scale.sx, s[(n - 1) * 2 + 1] * scale.sy);
    ctx.stroke();
  }

  /* The newest bit of a stroke being drawn: from the last midpoint to the new one. */
  function tail(ctx, s, scale) {
    var n = s.length / 2;
    if (n < 2) { stroke(ctx, s, scale); return; }
    ctx.beginPath();
    if (n === 2) {
      ctx.moveTo(s[0] * scale.sx, s[1] * scale.sy);
      ctx.lineTo((s[0] + s[2]) / 2 * scale.sx, (s[1] + s[3]) / 2 * scale.sy);
    } else {
      var a = (n - 3) * 2, b = (n - 2) * 2, c = (n - 1) * 2;
      ctx.moveTo((s[a] + s[b]) / 2 * scale.sx, (s[a + 1] + s[b + 1]) / 2 * scale.sy);
      ctx.quadraticCurveTo(s[b] * scale.sx, s[b + 1] * scale.sy, (s[b] + s[c]) / 2 * scale.sx, (s[b + 1] + s[c + 1]) / 2 * scale.sy);
    }
    ctx.stroke();
  }

  function paint(canvas, strokes, opts) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var scale = fit(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pen(ctx, scale, (opts && opts.colour) || inkColour(canvas));
    (strokes || []).forEach(function (s) { if (s && s.length >= 2) stroke(ctx, s, scale); });
  }

  /* ---------- the live pad ---------- */

  function create(canvas, opts) {
    opts = opts || {};
    var m = model();
    var ctx = canvas.getContext('2d');
    var scale = fit(canvas);
    var colour = inkColour(canvas);
    var pointer = null;
    var onChange = opts.onChange || function () {};

    canvas.classList.add('skb-pad');

    function redraw() {
      scale = fit(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pen(ctx, scale, colour);
      m.raw().forEach(function (s) { stroke(ctx, s, scale); });
    }

    function at(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / (r.width || 1) * UNITS, y: (e.clientY - r.top) / (r.height || 1) * UNITS };
    }

    function down(e) {
      if (m.locked() || pointer !== null) return;
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      pointer = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      var p = at(e);
      if (m.start(p.x, p.y)) { pen(ctx, scale, colour); tail(ctx, m.current(), scale); onChange(); }
    }
    function moveTo(e) {
      var p = at(e);
      if (m.move(p.x, p.y)) tail(ctx, m.current(), scale);
    }
    function move(e) {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      if (m.locked()) return;
      // Fast pens send several points per frame: use them all for a smooth line.
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (list && list.length) list.forEach(moveTo);
      else moveTo(e);
    }
    function up(e) {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (m.current()) { m.end(); onChange(); }
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    var onResize = function () { redraw(); };
    window.addEventListener('resize', onResize);

    return {
      strokes: m.strokes,
      isEmpty: function () { return m.raw().length === 0; },
      undo: function () { if (m.undo()) { redraw(); onChange(); } },
      clear: function () { if (m.clear()) { redraw(); onChange(); } },
      lock: function () { m.lock(); pointer = null; canvas.classList.add('is-locked'); },
      locked: m.locked,
      resize: redraw,
      destroy: function () {
        m.lock();
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('lostpointercapture', up);
        window.removeEventListener('resize', onResize);
      }
    };
  }

  FF.SketchPad = { create: create, paint: paint, UNITS: UNITS, _model: model };
})();
