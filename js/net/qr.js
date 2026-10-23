/* ============================================================
   PLAYMONA — net/qr.js
   Renders a join link as a scannable SVG QR code, using the
   vendored MIT encoder in js/vendor/qrcode.js. Entirely local:
   no CDN, so it also works on a LAN with no internet.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  FF.QR = {
    available: function () { return typeof window.qrcode === 'function'; },

    /* Returns an <svg> element, or null if the encoder is unavailable. */
    svg: function (text, opts) {
      opts = opts || {};
      var size = opts.size || 200;
      if (!this.available()) return null;

      var qr;
      try {
        qr = window.qrcode(0, 'M');       // 0 = auto version, M = ~15% recovery
        qr.addData(String(text));
        qr.make();
      } catch (e) {
        return null;
      }

      var count = qr.getModuleCount();
      var quiet = 4;                       // required quiet zone, in modules
      var total = count + quiet * 2;

      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'QR code to join the room');
      svg.setAttribute('shape-rendering', 'crispEdges');
      svg.style.borderRadius = '12px';
      svg.style.display = 'block';

      // Always dark-on-light regardless of app theme: an inverted QR
      // code fails to scan on a lot of phone cameras.
      var bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('width', total);
      bg.setAttribute('height', total);
      bg.setAttribute('fill', '#ffffff');
      svg.appendChild(bg);

      // One path for every dark module keeps the DOM small.
      var d = '';
      for (var row = 0; row < count; row++) {
        for (var col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            d += 'M' + (col + quiet) + ' ' + (row + quiet) + 'h1v1h-1z';
          }
        }
      }
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', '#000000');
      svg.appendChild(path);

      return svg;
    }
  };
})();
