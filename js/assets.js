/* ============================================================
   FAMILY FUN — assets.js
   Asset manager: local file images with SVG/data fallback,
   inline SVG illustrations, and light preloading.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function svgToDataUri(svg) {
    if (!svg) return null;
    if (svg.indexOf('data:') === 0) return svg;
    if (svg.indexOf('<svg') !== -1) {
      const clean = svg.replace(/\s+/g, ' ').replace(/#/g, '%23').replace(/"/g, "'");
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return svg;
  }

  FF.Assets = {
    // Build an inline-SVG illustration container.
    illustration: function (svg, cls, altText) {
      const wrap = FF.ui.div(cls || 'illustration');
      if (svg) {
        wrap.innerHTML = svg;
        if (altText) wrap.setAttribute('role', 'img');
        if (altText) wrap.setAttribute('aria-label', altText);
      } else if (altText) {
        wrap.appendChild(FF.ui.div('asset-fallback-text', altText));
      }
      return wrap;
    },

    // Create an <img> with graceful fallback: file -> svg -> text.
    img: function (opts) {
      opts = opts || {};
      const img = document.createElement('img');
      if (opts.cls) img.className = opts.cls;
      if (opts.alt) img.alt = opts.alt;
      img.draggable = false;
      let usedSvg = false;
      img.addEventListener('error', function () {
        if (opts.svg && !usedSvg) {
          usedSvg = true;
          img.src = svgToDataUri(opts.svg);
        } else {
          // final fallback: text
          const parent = img.parentNode;
          if (parent && opts.alt) {
            const t = FF.ui.div('asset-fallback-text', opts.alt);
            parent.insertBefore(t, img);
            if (img.parentNode) img.parentNode.removeChild(img);
          }
        }
      });
      img.src = opts.src || svgToDataUri(opts.svg);
      return img;
    },

    svgUri: svgToDataUri,

    // Light preloading of a list of image file paths (best effort).
    preload: function (paths, onProgress) {
      if (!paths || !paths.length) { if (onProgress) onProgress(1); return; }
      let loaded = 0;
      paths.forEach(function (p) {
        if (!p || p.indexOf('<svg') !== -1 || p.indexOf('data:') === 0) {
          loaded++;
          if (onProgress) onProgress(loaded / paths.length);
          return;
        }
        const im = new Image();
        im.onload = im.onerror = function () {
          loaded++;
          if (onProgress) onProgress(loaded / paths.length);
        };
        im.src = p;
      });
    }
  };
})();
