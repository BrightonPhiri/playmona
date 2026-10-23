/* ============================================================
   PLAYMONA — admin/charts.js
   Small hand-built charts for the admin portal: no library.

   columns(el, points)  one value per day, as columns
   line(el, points)     one value per day, as a line with a wash
   bars(el, rows)       a ranked list (top games) as bars

   points: [{ key: '2026-10-23', label: '23 Oct', value: 12 }]
   One series each, in the chart colour (--chart-1). Text uses
   the normal text colours. Every mark has a hover tooltip.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  // A clean top value and step for the y axis.
  function niceScale(max) {
    if (max <= 4) return { top: 4, step: 1 };
    var raw = max / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (s) { return s >= raw; })[0];
    return { top: Math.ceil(max / step) * step, step: step };
  }

  /* ---------- Tooltip (one for the page) ---------- */
  var tip = null;
  function showTip(x, y, title, value) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    tip.innerHTML = '';
    var t = document.createElement('span'); t.className = 'chart-tip__title'; t.textContent = title;
    var v = document.createElement('strong'); v.className = 'chart-tip__value'; v.textContent = value;
    tip.appendChild(t); tip.appendChild(v);
    tip.style.display = 'block';
    var w = tip.offsetWidth;
    var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }
  window.addEventListener('scroll', hideTip, true);

  /* ---------- Shared frame: axes, grid, x labels ---------- */
  function frame(el, points, opts) {
    el.innerHTML = '';
    var W = Math.max(280, el.clientWidth || 600);
    var H = opts.height || 220;
    var pad = { l: 40, r: 12, t: 12, b: 28 };
    var max = points.reduce(function (m, p) { return Math.max(m, p.value || 0); }, 0);
    var sc = niceScale(max);
    var iw = W - pad.l - pad.r;
    var ih = H - pad.t - pad.b;
    var root = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': opts.label || '' });

    for (var v = 0; v <= sc.top + 1e-9; v += sc.step) {
      var y = pad.t + ih - (v / sc.top) * ih;
      root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: v === 0 ? 'chart-axis' : 'chart-grid' }));
      var tl = svg('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-tick' });
      tl.textContent = compact(v);
      root.appendChild(tl);
    }

    // At most ~7 date labels, always including the last.
    var every = Math.max(1, Math.ceil(points.length / 7));
    var band = iw / Math.max(1, points.length);
    points.forEach(function (p, i) {
      if ((points.length - 1 - i) % every !== 0) return;
      var xl = svg('text', { x: pad.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick' });
      xl.textContent = p.label;
      root.appendChild(xl);
    });

    el.appendChild(root);
    return { root: root, W: W, H: H, pad: pad, iw: iw, ih: ih, top: sc.top, band: band,
      y: function (val) { return pad.t + ih - (val / sc.top) * ih; } };
  }

  function redrawOnResize(el, draw) {
    if (el._chartObs) el._chartObs.disconnect();
    if (!window.ResizeObserver) return;
    var last = el.clientWidth;
    el._chartObs = new ResizeObserver(function () {
      if (Math.abs(el.clientWidth - last) < 4) return;
      last = el.clientWidth;
      draw();
    });
    el._chartObs.observe(el);
  }

  FF.AdminCharts = {
    compact: compact,

    columns: function (el, points, opts) {
      opts = opts || {};
      var fmt = opts.format || function (v) { return v.toLocaleString(); };
      function draw() {
        var f = frame(el, points, opts);
        var w = Math.min(24, Math.max(2, f.band - 2));
        points.forEach(function (p, i) {
          var val = p.value || 0;
          var x = f.pad.l + f.band * i + (f.band - w) / 2;
          var y = f.y(val);
          var h = f.pad.t + f.ih - y;
          if (h > 0) {
            var r = Math.min(4, w / 2, h);
            // Rounded data end, square at the baseline.
            var d = 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
              'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
            f.root.appendChild(svg('path', { d: d, class: 'chart-mark' }));
          }
          // Hover target: the whole column slot, taller than the mark.
          var hit = svg('rect', { x: f.pad.l + f.band * i, y: f.pad.t, width: f.band, height: f.ih, class: 'chart-hit' });
          hit.addEventListener('mouseenter', function (e) { hit.classList.add('is-hover'); showTip(e.clientX, e.clientY, p.title || p.label, fmt(val)); });
          hit.addEventListener('mousemove', function (e) { showTip(e.clientX, e.clientY, p.title || p.label, fmt(val)); });
          hit.addEventListener('mouseleave', function () { hit.classList.remove('is-hover'); hideTip(); });
          f.root.insertBefore(hit, f.root.firstChild);
        });
      }
      draw();
      redrawOnResize(el, draw);
    },

    line: function (el, points, opts) {
      opts = opts || {};
      var fmt = opts.format || function (v) { return v.toLocaleString(); };
      function draw() {
        var f = frame(el, points, opts);
        if (!points.length) return;
        var xy = points.map(function (p, i) { return [f.pad.l + f.band * i + f.band / 2, f.y(p.value || 0)]; });
        var line = xy.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join('');
        var base = f.pad.t + f.ih;
        f.root.appendChild(svg('path', { d: line + 'L' + xy[xy.length - 1][0] + ',' + base + 'L' + xy[0][0] + ',' + base + 'Z', class: 'chart-area' }));
        f.root.appendChild(svg('path', { d: line, class: 'chart-line' }));
        // End dot, labelled with the latest value.
        var last = xy[xy.length - 1];
        f.root.appendChild(svg('circle', { cx: last[0], cy: last[1], r: 4, class: 'chart-dot' }));

        var cross = svg('line', { y1: f.pad.t, y2: base, class: 'chart-cross' });
        var dot = svg('circle', { r: 4, class: 'chart-dot' });
        cross.style.display = dot.style.display = 'none';
        f.root.appendChild(cross);
        f.root.appendChild(dot);
        var hit = svg('rect', { x: f.pad.l, y: f.pad.t, width: f.iw, height: f.ih, class: 'chart-hit' });
        function at(e) {
          var box = f.root.getBoundingClientRect();
          var i = Math.max(0, Math.min(points.length - 1, Math.floor((e.clientX - box.left - f.pad.l) / f.band)));
          cross.setAttribute('x1', xy[i][0]); cross.setAttribute('x2', xy[i][0]);
          dot.setAttribute('cx', xy[i][0]); dot.setAttribute('cy', xy[i][1]);
          cross.style.display = dot.style.display = '';
          showTip(box.left + xy[i][0], box.top + xy[i][1], points[i].title || points[i].label, fmt(points[i].value || 0));
        }
        hit.addEventListener('mousemove', at);
        hit.addEventListener('mouseenter', at);
        hit.addEventListener('mouseleave', function () { cross.style.display = dot.style.display = 'none'; hideTip(); });
        f.root.appendChild(hit);
      }
      draw();
      redrawOnResize(el, draw);
    },

    /* rows: [{ label, value, sub }] already sorted. Values sit at the bar tips. */
    bars: function (el, rows, opts) {
      opts = opts || {};
      el.innerHTML = '';
      var max = rows.reduce(function (m, r) { return Math.max(m, r.value || 0); }, 0) || 1;
      var list = document.createElement('ol');
      list.className = 'abars';
      rows.forEach(function (r) {
        var li = document.createElement('li');
        li.className = 'abars__row';
        var name = document.createElement('span');
        name.className = 'abars__label';
        name.textContent = r.label;
        var track = document.createElement('span');
        track.className = 'abars__track';
        var bar = document.createElement('span');
        bar.className = 'abars__bar';
        bar.style.width = Math.max(1, (r.value / max) * 100) + '%';
        var val = document.createElement('span');
        val.className = 'abars__value';
        val.textContent = (r.value || 0).toLocaleString();
        track.appendChild(bar);
        track.appendChild(val);
        li.appendChild(name);
        li.appendChild(track);
        li.addEventListener('mouseenter', function (e) { showTip(e.clientX, e.clientY, r.label + (r.sub ? ' · ' + r.sub : ''), (r.value || 0).toLocaleString() + (opts.unit ? ' ' + opts.unit : '')); });
        li.addEventListener('mousemove', function (e) { showTip(e.clientX, e.clientY, r.label + (r.sub ? ' · ' + r.sub : ''), (r.value || 0).toLocaleString() + (opts.unit ? ' ' + opts.unit : '')); });
        li.addEventListener('mouseleave', hideTip);
        list.appendChild(li);
      });
      el.appendChild(list);
    }
  };
})();
