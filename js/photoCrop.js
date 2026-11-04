/* ============================================================
   PLAYMONA — photoCrop.js
   The "move and zoom" step after a player picks a photo.

   The photo sits under a round window. Players drag it to move,
   pinch (or scroll, or use the slider) to zoom, and press Use photo.
   The answer is the square around the circle, in the photo's own
   pixels: { sx, sy, size }. photo.js and players.js draw that square.

   FF.PhotoCrop.math holds the sums with no DOM, so they are tested
   in tools/test/photoCrop.test.js.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MAX_ZOOM = 5;

  /* ---------- The sums ----------
     A view is { w, h, d, zoom, x, y }: the photo's natural size, the
     circle's diameter on screen, the zoom (1 = the short side just
     fills the circle), and where the photo's centre sits relative to
     the circle's centre, in screen pixels. */
  var M = {
    MAX_ZOOM: MAX_ZOOM,

    // Screen pixels per photo pixel.
    scale: function (v) { return (v.d / Math.min(v.w, v.h)) * v.zoom; },

    // Keep the zoom in range and the photo covering the whole circle.
    clamp: function (v) {
      var zoom = Math.max(1, Math.min(MAX_ZOOM, v.zoom || 1));
      var k = (v.d / Math.min(v.w, v.h)) * zoom;
      var maxX = Math.max(0, (v.w * k - v.d) / 2);
      var maxY = Math.max(0, (v.h * k - v.d) / 2);
      return {
        w: v.w, h: v.h, d: v.d, zoom: zoom,
        x: Math.max(-maxX, Math.min(maxX, v.x || 0)),
        y: Math.max(-maxY, Math.min(maxY, v.y || 0))
      };
    },

    // Zoom to `zoom`, keeping the photo point under (px, py) still.
    // (px, py) is relative to the circle's centre.
    zoomAt: function (v, zoom, px, py) {
      var before = M.scale(v);
      var next = { w: v.w, h: v.h, d: v.d, zoom: Math.max(1, Math.min(MAX_ZOOM, zoom)), x: v.x, y: v.y };
      var ratio = M.scale(next) / before;
      px = px || 0; py = py || 0;
      next.x = px - (px - v.x) * ratio;
      next.y = py - (py - v.y) * ratio;
      return M.clamp(next);
    },

    // The square under the circle, in photo pixels.
    rect: function (v) {
      var k = M.scale(v);
      var size = v.d / k;
      var sx = v.w / 2 - (v.d / 2 + v.x) / k;
      var sy = v.h / 2 - (v.d / 2 + v.y) / k;
      // Rounding can push a hair past the edge.
      sx = Math.max(0, Math.min(v.w - size, sx));
      sy = Math.max(0, Math.min(v.h - size, sy));
      return { sx: sx, sy: sy, size: size };
    },

    // The plain centre square (what we used before there was a crop step).
    centre: function (w, h) {
      var side = Math.min(w, h);
      return { sx: (w - side) / 2, sy: (h - side) / 2, size: side };
    }
  };

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(FF.t('photoUnreadable', 'That file is not a picture we can use. Try a JPG or PNG.'))); };
      img.src = url;
    });
  }

  /* Opens the editor for `file`. onDone(crop) runs with { sx, sy, size }
     when the player presses Use photo; nothing runs if they cancel. */
  function open(file, onDone, opts) {
    opts = opts || {};
    return loadImage(file).then(function (loaded) {
      var img = loaded.img;
      var W = img.naturalWidth, H = img.naturalHeight;

      var stage = FF.ui.div('crop');
      stage.setAttribute('role', 'application');
      stage.setAttribute('aria-roledescription', FF.t('cropArea', 'photo position'));
      stage.setAttribute('aria-label', FF.t('cropHelp', 'Drag to move your photo. Pinch or use the slider to zoom.'));
      stage.tabIndex = 0;
      var pic = FF.ui.el('img', { class: 'crop__img', src: loaded.url, alt: '', draggable: 'false' });
      stage.appendChild(pic);
      stage.appendChild(FF.ui.div('crop__mask'));
      stage.appendChild(FF.ui.div('crop__ring'));

      var help = FF.ui.el('p', { class: 'crop__help' }, FF.t('cropHelpShort', 'Drag to move. Pinch or slide to zoom.'));

      var slider = FF.ui.el('input', {
        type: 'range', class: 'crop__zoom', min: '1', max: String(MAX_ZOOM), step: '0.01', value: '1',
        'aria-label': FF.t('zoom', 'Zoom')
      });
      var out = FF.ui.el('button', { type: 'button', class: 'icon-btn crop__step', 'aria-label': FF.t('zoomOut', 'Zoom out'), title: FF.t('zoomOut', 'Zoom out') }, '−');
      var inn = FF.ui.el('button', { type: 'button', class: 'icon-btn crop__step', 'aria-label': FF.t('zoomIn', 'Zoom in'), title: FF.t('zoomIn', 'Zoom in') }, '+');
      var controls = FF.ui.div('crop__controls');
      controls.appendChild(out);
      controls.appendChild(slider);
      controls.appendChild(inn);

      var view = null;      // set once the stage has a size
      var D = 0;            // circle diameter on screen
      var INSET = 0;        // gap between the stage edge and the circle

      function paint() {
        if (!view) return;
        var k = M.scale(view);
        var dw = W * k, dh = H * k;
        var cx = stage.clientWidth / 2 + view.x, cy = stage.clientHeight / 2 + view.y;
        pic.style.width = dw + 'px';
        pic.style.height = dh + 'px';
        pic.style.transform = 'translate(' + (cx - dw / 2) + 'px,' + (cy - dh / 2) + 'px)';
        slider.value = String(view.zoom);
        out.disabled = view.zoom <= 1.001;
        inn.disabled = view.zoom >= MAX_ZOOM - 0.001;
      }

      function measure() {
        var s = stage.clientWidth;
        if (!s) return;
        INSET = Math.round(s * 0.06);
        var nd = s - INSET * 2;
        stage.style.setProperty('--crop-d', nd + 'px');
        if (view) {
          // Keep the same framing when the stage changes size.
          var f = nd / view.d;
          view = M.clamp({ w: W, h: H, d: nd, zoom: view.zoom, x: view.x * f, y: view.y * f });
        } else {
          view = M.clamp({ w: W, h: H, d: nd, zoom: 1, x: 0, y: 0 });
        }
        D = nd;
        paint();
      }

      function set(next) { view = M.clamp(next); paint(); }
      function zoomTo(z, px, py) { view = M.zoomAt(view, z, px, py); paint(); }
      function fromCentre(clientX, clientY) {
        var r = stage.getBoundingClientRect();
        return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
      }

      /* ----- Drag and pinch (pointer events cover mouse, touch and pen) ----- */
      var pointers = {};
      var gesture = null;
      function snapshot() {
        var ids = Object.keys(pointers);
        if (ids.length === 1) {
          var p = pointers[ids[0]];
          gesture = { kind: 'drag', sx: p.x, sy: p.y, vx: view.x, vy: view.y };
        } else if (ids.length >= 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
          gesture = {
            kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom: view.zoom, mid: mid, base: { w: W, h: H, d: D, zoom: view.zoom, x: view.x, y: view.y }
          };
        } else gesture = null;
      }
      stage.addEventListener('pointerdown', function (e) {
        if (!view) return;
        e.preventDefault();
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        stage.classList.add('is-dragging');
        snapshot();
      });
      stage.addEventListener('pointermove', function (e) {
        if (!pointers[e.pointerId] || !gesture) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (gesture.kind === 'drag') {
          set({ w: W, h: H, d: D, zoom: view.zoom, x: gesture.vx + e.clientX - gesture.sx, y: gesture.vy + e.clientY - gesture.sy });
        } else {
          var ids = Object.keys(pointers);
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          var mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
          // Zoom around where the fingers started, then follow the fingers as they move.
          var z = M.zoomAt(gesture.base, gesture.zoom * dist / gesture.dist, gesture.mid.x, gesture.mid.y);
          set({ w: W, h: H, d: D, zoom: z.zoom, x: z.x + mid.x - gesture.mid.x, y: z.y + mid.y - gesture.mid.y });
        }
      });
      function lift(e) {
        if (!pointers[e.pointerId]) return;
        delete pointers[e.pointerId];
        if (!Object.keys(pointers).length) stage.classList.remove('is-dragging');
        snapshot();
      }
      stage.addEventListener('pointerup', lift);
      stage.addEventListener('pointercancel', lift);
      stage.addEventListener('lostpointercapture', lift);

      stage.addEventListener('wheel', function (e) {
        if (!view) return;
        e.preventDefault();
        var p = fromCentre(e.clientX, e.clientY);
        zoomTo(view.zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      }, { passive: false });

      stage.addEventListener('dblclick', function (e) {
        if (!view) return;
        var p = fromCentre(e.clientX, e.clientY);
        zoomTo(view.zoom < 1.9 ? 2 : 1, p.x, p.y);
      });

      // Keyboard: arrows move, + and - zoom, 0 resets.
      stage.addEventListener('keydown', function (e) {
        if (!view) return;
        var step = e.shiftKey ? 40 : 10;
        var k = e.key;
        if (k === 'ArrowLeft') set({ w: W, h: H, d: D, zoom: view.zoom, x: view.x + step, y: view.y });
        else if (k === 'ArrowRight') set({ w: W, h: H, d: D, zoom: view.zoom, x: view.x - step, y: view.y });
        else if (k === 'ArrowUp') set({ w: W, h: H, d: D, zoom: view.zoom, x: view.x, y: view.y + step });
        else if (k === 'ArrowDown') set({ w: W, h: H, d: D, zoom: view.zoom, x: view.x, y: view.y - step });
        else if (k === '+' || k === '=') zoomTo(view.zoom * 1.15);
        else if (k === '-' || k === '_') zoomTo(view.zoom / 1.15);
        else if (k === '0') set({ w: W, h: H, d: D, zoom: 1, x: 0, y: 0 });
        else return;
        e.preventDefault();
      });

      slider.addEventListener('input', function () { if (view) zoomTo(parseFloat(slider.value)); });
      out.addEventListener('click', function () { if (view) zoomTo(view.zoom / 1.25); });
      inn.addEventListener('click', function () { if (view) zoomTo(view.zoom * 1.25); });

      var ro = null;
      var used = false;
      var sheet = FF.UI.sheet({
        title: opts.title || FF.t('cropTitle', 'Move and zoom'),
        className: 'crop-sheet',
        body: [stage, controls, help],
        actions: [
          { label: FF.t('cancel', 'Cancel') },
          {
            label: FF.t('usePhoto', 'Use photo'), primary: true, icon: 'check',
            onClick: function () {
              used = true;
              if (view) onDone(M.rect(view));
            }
          }
        ],
        onClose: function () {
          if (ro) ro.disconnect();
          window.removeEventListener('resize', measure);
          // Let the caller draw from the file before the preview URL goes.
          setTimeout(function () { URL.revokeObjectURL(loaded.url); }, 0);
          if (!used && opts.onCancel) opts.onCancel();
        }
      });

      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(stage); }
      window.addEventListener('resize', measure);
      measure();
      requestAnimationFrame(measure);
      if (!(FF.Nav && FF.Nav.modality === 'keyboard')) { try { stage.focus({ preventScroll: true }); } catch (e) {} }
      return sheet;
    });
  }

  FF.PhotoCrop = { math: M, open: open };
})();
