/* ============================================================
   PLAYMONA — missiontrail/render.js
   Draws a Mission Trail town on one <canvas>: ground textures, roads
   (worked out from the road cells: kerbs, corners and centre dashes),
   buildings and street things standing on their footprints, the walking
   explorer, fog of war and a camera that follows the walker.

   It never draws a name, outline, marker or highlight on a place until
   reveal(key) is called for it, and things in unexplored fog are not
   drawn at all. It redraws only while something moves.

   view = Render.create(canvas, map, images, { fog, radius })
     place(pos) walk(pos, done) face(dir) shake() reveal(key, name)
     fog(visibleIdx, exploredSet) thingAtPoint(clientX, clientY)
     resize() destroy()
   images: { 'category/id': HTMLImageElement } from Assets.load().
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var STEP_MS = 170;
  var DRIVE_MS = 110;       // a car covers a cell faster than the walker
  var CAR_LONG = 1.05;      // a car's length in cells (side view width, top view height)
  var BUMP_MS = 150;
  var KERB = 0.14;          // pavement strip along a road edge, as a share of a cell
  var WALKER_H = 1.2;       // the explorer's height in cells
  // How big each street thing stands: w = width in cells, or h = height in cells.
  var SIZE = {
    'bus-stop': { w: 1.25 }, fountain: { w: 1.1 }, 'tree-round': { h: 1.7 }, 'tree-pine': { h: 1.85 },
    bench: { w: 0.85 }, 'street-lamp': { h: 1.4 }, 'traffic-light': { h: 1.4 }, signpost: { h: 1.25 },
    bin: { h: 0.72 }, 'flower-bed': { w: 0.95 }, bush: { w: 0.92 }, postbox: { h: 0.95 }
  };
  // Canvas drawing colours (canvas cannot read CSS tokens).
  var INK = {
    shadow: 'rgba(20, 24, 16, 0.22)',
    kerb: 'rgba(40, 36, 30, 0.35)',
    dash: 'rgba(255, 252, 240, 0.9)',
    fog: [18, 22, 42],
    glow: 'rgba(255, 210, 80, 0.55)',
    label: 'rgba(255, 255, 255, 0.96)',
    labelText: '#1f2433',
    labelEdge: 'rgba(31, 36, 51, 0.25)',
    sign: '#276b33',
    signText: '#ffffff',
    signEdge: 'rgba(255, 255, 255, 0.85)'
  };
  var GROUND = { g: 'grass', '=': 'asphalt', p: 'pavement', '-': 'park-path', '~': 'water', f: 'garden' };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function create(canvas, map, images, opts) {
    opts = opts || {};
    var R = FF.MissionTrail.Rules;
    var ctx = canvas.getContext('2d');
    var st = {
      cell: 48, dpr: 1, viewW: 0, viewH: 0, offX: 0, offY: 0,
      cam: { x: 0, y: 0 },
      walker: { x: map.start.x, y: map.start.y, facing: map.start.facing },
      anim: null, shake: null, revealed: {}, driving: null,
      visible: null, explored: null,
      ground: null, fogCanvas: null, raf: null, dead: false
    };

    function img(cat, id) { return images[cat + '/' + id] || null; }

    /* ---------- the ground, drawn once per size into its own canvas ---------- */

    function texCell(tex, x, y, dx, dy, dw, dh) {
      // A texture spans 2 x 2 cells; draw the part that belongs to this cell.
      var half = tex.width / 2;
      var sx = (x % 2) * half + (dx - x * st.cell) / st.cell * half;
      var sy = (y % 2) * half + (dy - y * st.cell) / st.cell * half;
      ctx2().drawImage(tex, sx, sy, dw / st.cell * half, dh / st.cell * half, dx, dy, dw + 0.6, dh + 0.6);
    }
    var gctx = null;
    function ctx2() { return gctx; }

    function buildGround() {
      var c = st.cell;
      var g = document.createElement('canvas');
      var scale = Math.min(st.dpr, Math.max(1, 4096 / Math.max(map.w * c, map.h * c)));
      g.width = Math.ceil(map.w * c * scale);
      g.height = Math.ceil(map.h * c * scale);
      gctx = g.getContext('2d');
      gctx.setTransform(scale, 0, 0, scale, 0, 0);
      gctx.imageSmoothingQuality = 'high';
      var pave = img('ground', 'pavement');
      for (var y = 0; y < map.h; y++) {
        for (var x = 0; x < map.w; x++) {
          var ch = map.ground(x, y);
          var tex = img('ground', GROUND[ch] || 'grass');
          if (tex) texCell(tex, x, y, x * c, y * c, c, c);
          if (ch === '=' && pave) drawKerbs(x, y, pave);
        }
      }
      st.ground = g;
    }

    function isRoad(x, y) { return map.ground(x, y) === '='; }

    function drawKerbs(x, y, pave) {
      var c = st.cell;
      var k = Math.round(c * KERB);
      var x0 = x * c;
      var y0 = y * c;
      var mask = R.roadMask(map, x, y);
      var up = mask & 1, right = mask & 2, down = mask & 4, left = mask & 8;
      var strips = [];
      if (!up) strips.push([x0, y0, c, k]);
      if (!down) strips.push([x0, y0 + c - k, c, k]);
      if (!left) strips.push([x0, y0, k, c]);
      if (!right) strips.push([x0 + c - k, y0, k, c]);
      // Inner corners where two roads meet but the corner between them is not road.
      if (up && right && !isRoad(x + 1, y - 1)) strips.push([x0 + c - k, y0, k, k]);
      if (up && left && !isRoad(x - 1, y - 1)) strips.push([x0, y0, k, k]);
      if (down && right && !isRoad(x + 1, y + 1)) strips.push([x0 + c - k, y0 + c - k, k, k]);
      if (down && left && !isRoad(x - 1, y + 1)) strips.push([x0, y0 + c - k, k, k]);
      strips.forEach(function (s) { texCell(pave, x, y, s[0], s[1], s[2], s[3]); });
      gctx.strokeStyle = INK.kerb;
      gctx.lineWidth = Math.max(1, c * 0.03);
      gctx.beginPath();
      if (!up) { gctx.moveTo(x0 + (left ? 0 : k), y0 + k); gctx.lineTo(x0 + c - (right ? 0 : k), y0 + k); }
      if (!down) { gctx.moveTo(x0 + (left ? 0 : k), y0 + c - k); gctx.lineTo(x0 + c - (right ? 0 : k), y0 + c - k); }
      if (!left) { gctx.moveTo(x0 + k, y0 + (up ? 0 : k)); gctx.lineTo(x0 + k, y0 + c - (down ? 0 : k)); }
      if (!right) { gctx.moveTo(x0 + c - k, y0 + (up ? 0 : k)); gctx.lineTo(x0 + c - k, y0 + c - (down ? 0 : k)); }
      gctx.stroke();
      // Centre dashes on straight stretches only (none inside junctions or corners).
      var lw = Math.max(2, Math.round(c * 0.05));
      gctx.fillStyle = INK.dash;
      if (mask === 10) {
        gctx.fillRect(x0 + c * 0.12, y0 + c / 2 - lw / 2, c * 0.26, lw);
        gctx.fillRect(x0 + c * 0.62, y0 + c / 2 - lw / 2, c * 0.26, lw);
      } else if (mask === 5) {
        gctx.fillRect(x0 + c / 2 - lw / 2, y0 + c * 0.12, lw, c * 0.26);
        gctx.fillRect(x0 + c / 2 - lw / 2, y0 + c * 0.62, lw, c * 0.26);
      }
    }

    /* ---------- fog ---------- */

    function buildFog() {
      if (!opts.fog) { st.fogCanvas = null; return; }
      var P = 4;   // pixels per cell: smoothing softens only a quarter cell of each edge
      var f = st.fogCanvas || document.createElement('canvas');
      f.width = map.w * P;
      f.height = map.h * P;
      var fc = f.getContext('2d');
      var data = fc.createImageData(f.width, f.height);
      for (var y = 0; y < map.h; y++) {
        for (var x = 0; x < map.w; x++) {
          var i = y * map.w + x;
          var a = st.visible && st.visible.has(i) ? 0 : (st.explored && st.explored.has(i) ? 140 : 255);
          for (var py = 0; py < P; py++) {
            for (var px = 0; px < P; px++) {
              var o = ((y * P + py) * f.width + (x * P + px)) * 4;
              data.data[o] = INK.fog[0]; data.data[o + 1] = INK.fog[1]; data.data[o + 2] = INK.fog[2]; data.data[o + 3] = a;
            }
          }
        }
      }
      fc.putImageData(data, 0, 0);
      st.fogCanvas = f;
    }

    function hiddenByFog(th) {
      if (!opts.fog || !st.explored) return false;
      for (var y = th.y; y < th.y + th.h; y++) {
        for (var x = th.x; x < th.x + th.w; x++) if (st.explored.has(y * map.w + x)) return false;
      }
      return true;
    }

    /* ---------- sprites ---------- */

    function stepMs() { return st.driving ? DRIVE_MS : STEP_MS; }

    /* A car seen from the side is CAR_LONG wide; seen from the front or back, CAR_LONG tall. */
    function carSize(im, look, c) {
      var aspect = im ? im.height / im.width : 0.6;
      var side = /-(left|right)$/.test(look);
      if (side) return { w: CAR_LONG * c, h: CAR_LONG * c * aspect };
      return { w: CAR_LONG * c * 0.8 / Math.max(0.5, aspect), h: CAR_LONG * c * 0.8 };
    }

    function spriteRect(th) {
      var c = st.cell;
      var im = img(FF.MissionTrail.Assets ? FF.MissionTrail.Assets.catOf(th) : 'props', th.look);
      var aspect = im ? im.height / im.width : 1;
      var w;
      var h;
      if (th.kind === 'vehicle') {
        var cs = carSize(im, th.look, c);
        w = cs.w;
        h = cs.h;
      } else if (th.kind === 'building') {
        w = th.w * c * 1.02;
        h = w * aspect;
      } else {
        var s = SIZE[th.look] || { w: 0.9 };
        if (s.h) { h = s.h * c * Math.max(1, th.h); w = h / aspect; } else { w = s.w * c * th.w; h = w * aspect; }
      }
      var bottom = (th.y + th.h) * c - c * 0.04;
      var cx = (th.x + th.w / 2) * c;
      return { x: cx - w / 2, y: bottom - h, w: w, h: h, im: im, cx: cx, bottom: bottom };
    }

    function walkerPos(t) {
      var w = st.walker;
      var x = w.x;
      var y = w.y;
      var frame = 0;
      if (st.anim) {
        var p = clamp((t - st.anim.start) / stepMs(), 0, 1);
        x = st.anim.fx + (st.anim.tx - st.anim.fx) * p;
        y = st.anim.fy + (st.anim.ty - st.anim.fy) * p;
        frame = p < 0.5 ? 1 : 2;
      }
      if (st.shake) {
        var q = clamp((t - st.shake.start) / BUMP_MS, 0, 1);
        var d = R.DIRS[w.facing] || [0, 0];
        var push = Math.sin(q * Math.PI) * 0.12;
        x += d[0] * push;
        y += d[1] * push;
      }
      return { x: x, y: y, frame: frame };
    }

    function shadow(cx, bottom, w) {
      ctx.fillStyle = INK.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, bottom - st.cell * 0.04, w * 0.42, Math.max(3, st.cell * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* A revealed place gets a white pill; a street sign gets a green plate. */
    function drawLabel(text, cx, top, sign) {
      var c = st.cell;
      var size = Math.round(clamp(c * (sign ? 0.24 : 0.3), 11, sign ? 15 : 18));
      ctx.font = '700 ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      var tw = ctx.measureText(text).width;
      var padX = size * 0.6;
      var h = size * 1.7;
      var w = tw + padX * 2;
      var x = clamp(cx - w / 2, st.cam.x - st.offX + 4, st.cam.x - st.offX + st.viewW - w - 4);
      var y = Math.max(top - h - 4, st.cam.y - st.offY + 4);
      ctx.fillStyle = sign ? INK.sign : INK.label;
      ctx.strokeStyle = sign ? INK.signEdge : INK.labelEdge;
      ctx.lineWidth = sign ? 1.5 : 1;
      ctx.beginPath();
      var rad = sign ? h * 0.22 : h / 2;
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = sign ? INK.signText : INK.labelText;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padX, y + h / 2 + 1);
    }

    /* ---------- camera and frames ---------- */

    function camTarget(wp) {
      var c = st.cell;
      var mw = map.w * c;
      var mh = map.h * c;
      var tx = mw <= st.viewW ? 0 : clamp((wp.x + 0.5) * c - st.viewW / 2, 0, mw - st.viewW);
      var ty = mh <= st.viewH ? 0 : clamp((wp.y + 0.5) * c - st.viewH / 2, 0, mh - st.viewH);
      return { x: tx, y: ty };
    }

    function draw(t, dt) {
      var c = st.cell;
      var wp = walkerPos(t);
      var target = camTarget(wp);
      var k = dt == null ? 1 : clamp(dt / 90, 0, 1);
      st.cam.x += (target.x - st.cam.x) * k;
      st.cam.y += (target.y - st.cam.y) * k;
      if (Math.abs(target.x - st.cam.x) < 0.3) st.cam.x = target.x;
      if (Math.abs(target.y - st.cam.y) < 0.3) st.cam.y = target.y;

      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.viewW, st.viewH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(Math.round(st.offX - st.cam.x), Math.round(st.offY - st.cam.y));
      if (st.ground) ctx.drawImage(st.ground, 0, 0, map.w * c, map.h * c);

      var list = [];
      map.things.forEach(function (th) {
        if (hiddenByFog(th)) return;
        if (st.driving && th.key === st.driving.key) return;
        list.push({ bottom: th.y + th.h, th: th });
      });
      list.push({ bottom: wp.y + 1 + 0.01, walker: wp });
      list.sort(function (a, b) { return a.bottom - b.bottom; });
      var labels = [];
      list.forEach(function (it) {
        if (it.walker && st.driving) {
          var look = st.driving.look + '-' + st.walker.facing;
          var car = img('vehicles', look);
          var cs = carSize(car, look, c);
          var ccx = (it.walker.x + 0.5) * c;
          var cb = (it.walker.y + 0.92) * c;
          shadow(ccx, cb, cs.w);
          if (car) ctx.drawImage(car, ccx - cs.w / 2, cb - cs.h, cs.w, cs.h);
          return;
        }
        if (it.walker) {
          var im = img('walker', 'walker-' + st.walker.facing + '-' + it.walker.frame) || img('walker', 'walker-down-0');
          var h = WALKER_H * c;
          var w = im ? h * im.width / im.height : h * 0.5;
          var cx = (it.walker.x + 0.5) * c;
          var bottom = (it.walker.y + 0.95) * c;
          shadow(cx, bottom, w);
          if (im) ctx.drawImage(im, cx - w / 2, bottom - h, w, h);
          return;
        }
        var r = spriteRect(it.th);
        if (it.th.sign) labels.push([it.th.sign, r.cx, r.y + c * 0.15, true]);
        if (st.revealed[it.th.key]) {
          ctx.fillStyle = INK.glow;
          ctx.beginPath();
          ctx.ellipse(r.cx, r.bottom - c * 0.1, r.w * 0.62, c * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          labels.push([st.revealed[it.th.key], r.cx, r.y]);
        }
        shadow(r.cx, r.bottom, r.w);
        if (r.im) ctx.drawImage(r.im, r.x, r.y, r.w, r.h);
      });
      if (st.fogCanvas) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(st.fogCanvas, 0, 0, map.w * c, map.h * c);
      }
      labels.forEach(function (l) { drawLabel(l[0], l[1], l[2], l[3]); });

      var moving = !!st.anim || !!st.shake || st.cam.x !== target.x || st.cam.y !== target.y;
      return moving;
    }

    var last = null;
    function frame(t) {
      st.raf = null;
      if (st.dead) return;
      var dt = last == null ? null : t - last;
      last = t;
      if (st.anim && t - st.anim.start >= stepMs()) {
        var a = st.anim;
        st.walker.x = a.tx;
        st.walker.y = a.ty;
        st.anim = null;
        if (a.done) a.done();
      }
      if (st.shake && t - st.shake.start >= BUMP_MS) st.shake = null;
      var moving = draw(t, dt);
      if (moving || st.anim) schedule();
      else last = null;
    }

    function schedule() {
      if (!st.raf && !st.dead) st.raf = window.requestAnimationFrame(frame);
    }

    function resize() {
      var w = canvas.clientWidth || 360;
      var h = canvas.clientHeight || 480;
      st.viewW = w;
      st.viewH = h;
      st.dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.cell = clamp(Math.floor(w / 7.5), 40, 72);
      canvas.width = Math.round(w * st.dpr);
      canvas.height = Math.round(h * st.dpr);
      st.offX = Math.max(0, (w - map.w * st.cell) / 2);
      st.offY = Math.max(0, (h - map.h * st.cell) / 2);
      buildGround();
      var target = camTarget(walkerPos(now()));
      st.cam.x = target.x;
      st.cam.y = target.y;
      draw(now(), null);
    }

    // FF.GameFlow has no cleanup hook: once the canvas leaves the page, stop for good.
    var onResize = function () {
      if (canvas.isConnected === false) { view.destroy(); return; }
      resize();
    };
    window.addEventListener('resize', onResize);

    var view = {
      place: function (pos) {
        st.anim = null;
        st.walker = { x: pos.x, y: pos.y, facing: pos.facing || st.walker.facing };
        var target = camTarget(st.walker);
        st.cam.x = target.x;
        st.cam.y = target.y;
        schedule();
      },
      walk: function (pos, done) {
        var from = st.anim ? { x: st.anim.tx, y: st.anim.ty } : { x: st.walker.x, y: st.walker.y };
        st.walker.x = from.x;
        st.walker.y = from.y;
        st.walker.facing = pos.facing || st.walker.facing;
        st.anim = { fx: from.x, fy: from.y, tx: pos.x, ty: pos.y, start: now(), done: done || null };
        schedule();
      },
      face: function (dir) { st.walker.facing = dir; schedule(); },
      shake: function () { st.shake = { start: now() }; schedule(); },
      reveal: function (key, name) { st.revealed[key] = name; schedule(); },
      /* From now on draw the walker as this car (look 'car-green'); its parked copy goes. */
      drive: function (key, look) { st.driving = { key: key, look: look }; schedule(); },
      fog: function (visibleIdx, exploredSet) {
        st.visible = new Set(visibleIdx || []);
        st.explored = exploredSet || null;
        buildFog();
        schedule();
      },
      thingAtPoint: function (clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var mx = clientX - rect.left - st.offX + st.cam.x;
        var my = clientY - rect.top - st.offY + st.cam.y;
        var c = st.cell;
        var pad = 4;
        var hits = map.things.filter(function (th) { return th.check && !hiddenByFog(th) && !(st.driving && th.key === st.driving.key); })
          .sort(function (a, b) { return (b.y + b.h) - (a.y + a.h); });
        for (var i = 0; i < hits.length; i++) {
          var th = hits[i];
          var r = spriteRect(th);
          var inSprite = mx >= r.x - pad && mx <= r.x + r.w + pad && my >= r.y - pad && my <= r.y + r.h + pad;
          var inFoot = mx >= th.x * c && mx <= (th.x + th.w) * c && my >= th.y * c && my <= (th.y + th.h) * c;
          if (inSprite || inFoot) return th.key;
        }
        return null;
      },
      isMoving: function () { return !!st.anim; },
      resize: resize,
      destroy: function () {
        st.dead = true;
        if (st.raf) window.cancelAnimationFrame(st.raf);
        window.removeEventListener('resize', onResize);
      }
    };
    resize();
    return view;
  }

  FF.MissionTrail.Render = { create: create, STEP_MS: STEP_MS, DRIVE_MS: DRIVE_MS };
})();
