/* ============================================================
   PLAYMONA — missiontrail/search.js
   The busy-room search: a pick scene shown as one big picture with the
   things hidden in it, the way Hidden Object plays (the zoom maths is the
   same). Drag or pinch to look around, the wheel or + / − to zoom, tap a
   thing to take it. A tap on nothing costs nothing.

     Search.hit(objects, u, v, taken?) -> id | null
     Search.view({ src, objects: [{ id, b, name }], onPick(id), labels }) ->
       { el, buttons, mark(id), destroy() }

   objects[i].b is [x, y, w, h] in shares (0..1) of the picture
   (FF.data.missionTrailRooms). Each thing also gets an invisible button
   over it, so a keyboard or screen reader can take it too.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var MAX_ZOOM = 3;
  var MARGIN = 0.025;   // a tap this close to a box (share of the picture) still finds it
  var TAP_PX = 8;       // a press that moves further than this is a drag

  /* The thing under (u, v), 0..1 across the picture: the nearest box centre among the boxes
     the tap is in or near. Things already taken are not found again. */
  function hit(objects, u, v, taken) {
    var best = null, bestD = Infinity;
    (objects || []).forEach(function (o) {
      var b = o.b;
      if (!b || (taken && taken.indexOf(o.id) !== -1)) return;
      if (u < b[0] - MARGIN || u > b[0] + b[2] + MARGIN || v < b[1] - MARGIN || v > b[1] + b[3] + MARGIN) return;
      var d = Math.pow(u - (b[0] + b[2] / 2), 2) + Math.pow(v - (b[1] + b[3] / 2), 2);
      if (d < bestD) { bestD = d; best = o.id; }
    });
    return best;
  }

  /* The picture is drawn z times the frame's size with its top left corner at (x, y), all as
     shares of the frame. It always covers the frame, so x and y run from 1 - z to 0. */
  function clampView(v) {
    var z = Math.max(1, Math.min(MAX_ZOOM, v.z || 1));
    return { z: z, x: Math.max(1 - z, Math.min(0, v.x || 0)), y: Math.max(1 - z, Math.min(0, v.y || 0)) };
  }

  /* The picture position under a point (u, w) of the frame. */
  function toPicture(v, u, w) { return [(u - v.x) / v.z, (w - v.y) / v.z]; }

  /* Zoom by `factor` round the frame point (u, w), keeping what is there in place. */
  function zoomAt(v, factor, u, w) {
    var p = toPicture(v, u, w);
    var z = Math.max(1, Math.min(MAX_ZOOM, v.z * factor));
    return clampView({ z: z, x: u - p[0] * z, y: w - p[1] * z });
  }

  function isTap(dx, dy) { return Math.sqrt(dx * dx + dy * dy) <= TAP_PX; }

  function pct(v) { return (+(v * 100).toFixed(3)) + '%'; }
  function box(cls, b) {
    var n = FF.ui.el('div', { class: cls });
    n.style.left = pct(b[0]); n.style.top = pct(b[1]); n.style.width = pct(b[2]); n.style.height = pct(b[3]);
    return n;
  }
  function iconButton(icon, label, onClick) {
    var btn = FF.ui.el('button', { type: 'button', class: 'mt-search__zbtn' });
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    if (FF.Icons && FF.Icons.icon) btn.appendChild(FF.Icons.icon(icon));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function view(o) {
    var labels = o.labels || {};
    var objects = o.objects || [];
    var taken = [];
    var timers = [];
    var wrap = FF.ui.el('div', { class: 'mt-search-wrap' });
    var frame = FF.ui.el('div', { class: 'mt-search' });
    var layer = FF.ui.el('div', { class: 'mt-search__layer' });
    var img = FF.ui.el('img', { class: 'mt-search__img', alt: labels.picture || '' });
    img.src = o.src;
    img.setAttribute('draggable', 'false');
    var marks = FF.ui.el('div', { class: 'mt-search__marks' });
    layer.appendChild(img);
    layer.appendChild(marks);
    var buttons = [];
    var byId = {};
    objects.forEach(function (ob) {
      byId[ob.id] = ob;
      var btn = FF.ui.el('button', { type: 'button', class: 'mt-search__spot' });
      btn.style.left = pct(ob.b[0]); btn.style.top = pct(ob.b[1]);
      btn.style.width = pct(ob.b[2]); btn.style.height = pct(ob.b[3]);
      btn.setAttribute('aria-label', ob.name || ob.id);
      btn.dataset.pick = ob.id;
      btn.addEventListener('click', function () { pick(ob.id); });
      buttons.push(btn);
      layer.appendChild(btn);
    });
    frame.appendChild(layer);
    wrap.appendChild(frame);

    function pick(id) {
      if (taken.indexOf(id) !== -1) return;
      if (o.onPick) o.onPick(id);
    }

    /* ---- zoom and drag (as in Hidden Object) ---- */
    var vw = { z: 1, x: 0, y: 0 };
    var zIn, zOut, zReset;
    function setView(v) {
      vw = clampView(v);
      layer.style.transform = 'translate(' + pct(vw.x) + ', ' + pct(vw.y) + ') scale(' + vw.z + ')';
      frame.classList.toggle('is-zoomed', vw.z > 1.001);
      if (zOut) { zOut.disabled = vw.z <= 1.001; zReset.disabled = vw.z <= 1.001; zIn.disabled = vw.z >= MAX_ZOOM - 0.001; }
    }
    zIn = iconButton('plus', labels.zoomIn || 'Zoom in', function () { setView(zoomAt(vw, 1.5, 0.5, 0.5)); });
    zOut = iconButton('minus', labels.zoomOut || 'Zoom out', function () { setView(zoomAt(vw, 1 / 1.5, 0.5, 0.5)); });
    zReset = iconButton('arrows-out', labels.zoomReset || 'Whole picture', function () { setView({ z: 1, x: 0, y: 0 }); });
    var bar = FF.ui.el('div', { class: 'mt-search__zoom' });
    bar.appendChild(zOut); bar.appendChild(zReset); bar.appendChild(zIn);
    wrap.appendChild(bar);

    function rect() { return frame.getBoundingClientRect ? frame.getBoundingClientRect() : { width: 0 }; }
    function onTap(cx, cy) {
      var r = rect();
      if (!r.width) return;
      var p = toPicture(vw, (cx - r.left) / r.width, (cy - r.top) / r.height);
      var id = hit(objects, p[0], p[1], taken);
      if (id) { pick(id); return; }
      // Nothing there: a little puff where the tap landed, and no cost.
      var puff = FF.ui.el('div', { class: 'mt-search__miss' });
      puff.style.left = pct(p[0]); puff.style.top = pct(p[1]);
      puff.style.transform = 'scale(' + (1 / vw.z) + ')';
      marks.appendChild(puff);
      timers.push(setTimeout(function () { if (puff.parentNode) puff.parentNode.removeChild(puff); }, 650));
      if (o.onMiss) o.onMiss();
    }

    var pts = {};
    var npts = 0;
    var press = null;   // { sx, sy, tap }: the press that may become a tap
    var pinch = null;   // { d, mx, my }: the last two-finger distance and middle
    function two() {
      var ids = Object.keys(pts);
      var a = pts[ids[0]], b = pts[ids[1]];
      return { d: Math.max(1, Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
    frame.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      try { frame.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      if (!pts[e.pointerId]) npts++;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (npts === 1) press = { sx: e.clientX, sy: e.clientY, tap: true };
      else { if (press) press.tap = false; if (npts === 2) pinch = two(); }
      frame.classList.add('is-dragging');
    });
    frame.addEventListener('pointermove', function (e) {
      var prev = pts[e.pointerId];
      if (!prev) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var r = rect();
      if (!r.width) return;
      if (npts >= 2 && pinch) {
        var p = two();
        var v = { z: vw.z, x: vw.x + (p.mx - pinch.mx) / r.width, y: vw.y + (p.my - pinch.my) / r.height };
        setView(zoomAt(v, p.d / pinch.d, (p.mx - r.left) / r.width, (p.my - r.top) / r.height));
        pinch = p;
        return;
      }
      if (press && press.tap && !isTap(e.clientX - press.sx, e.clientY - press.sy)) press.tap = false;
      if (press && !press.tap) setView({ z: vw.z, x: vw.x + (e.clientX - prev.x) / r.width, y: vw.y + (e.clientY - prev.y) / r.height });
    });
    function lift(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      npts--;
      if (npts <= 0) {
        npts = 0;
        if (e.type === 'pointerup' && press && press.tap) onTap(e.clientX, e.clientY);
        press = null;
        pinch = null;
        frame.classList.remove('is-dragging');
      } else if (npts === 1) {
        pinch = null;
        var id = Object.keys(pts)[0];
        press = { sx: pts[id].x, sy: pts[id].y, tap: false };
      }
    }
    frame.addEventListener('pointerup', lift);
    frame.addEventListener('pointercancel', lift);
    frame.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = rect();
      if (!r.width) return;
      setView(zoomAt(vw, e.deltaY < 0 ? 1.25 : 1 / 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    }, { passive: false });
    setView(vw);

    return {
      el: wrap,
      buttons: buttons,
      /* A thing was taken: ring it, and it cannot be taken again. */
      mark: function (id) {
        var ob = byId[id];
        if (!ob || taken.indexOf(id) !== -1) return;
        taken.push(id);
        marks.appendChild(box('mt-search__ring', ob.b));
        buttons.forEach(function (b) {
          if (b.dataset.pick !== id) return;
          b.disabled = true;
          b.setAttribute('aria-hidden', 'true');
        });
      },
      destroy: function () { timers.forEach(clearTimeout); timers = []; }
    };
  }

  FF.MissionTrail.Search = {
    MAX_ZOOM: MAX_ZOOM,
    hit: hit,
    clampView: clampView,
    toPicture: toPicture,
    zoomAt: zoomAt,
    isTap: isTap,
    view: view
  };
})();
